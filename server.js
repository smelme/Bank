// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
// Make crypto available globally for id-verifier library when it's safe to do so.
// On Node >=19 globalThis.crypto is provided as a getter-only property and
// attempting to assign to it throws a TypeError. Guard the assignment.
try {
  if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto;
  }
} catch (err) {
  // Platform already provides a read-only crypto — ignore the assignment error.
}

import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import * as db from './database.js';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';

import {
    createCredentialsRequest,
    processCredentials,
    generateNonce,
    generateJWK,
    DocumentType,
    Claim
} from 'id-verifier';

// Admin portal imports
import * as rulesEngine from './rules-engine.js';
import * as activityLogger from './activity-logger.js';
import bcrypt from 'bcrypt';

const app = express();
const port = process.env.PORT || 3001;

// Helper function to determine WebAuthn origin
function getWebAuthnOrigin() {
  // First check environment variable
  if (process.env.WEBAUTHN_ORIGIN && process.env.WEBAUTHN_ORIGIN !== 'http://localhost:3001') {
    return process.env.WEBAUTHN_ORIGIN;
  }
  
  // For Railway/production deployments
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }
  
  // Default to localhost for development
  return 'http://localhost:3001';
}

// Helper function to determine WebAuthn RP ID (domain)
function getWebAuthnRpId() {
  // First check environment variable
  if (process.env.WEBAUTHN_RP_ID && process.env.WEBAUTHN_RP_ID !== 'localhost') {
    return process.env.WEBAUTHN_RP_ID;
  }
  
  // Extract domain from origin
  const origin = getWebAuthnOrigin();
  try {
    const url = new URL(origin);
    return url.hostname;
  } catch (error) {
    // Fallback to localhost for development
    return 'localhost';
  }
}

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}`);
});

// Import fs and path at the top level
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());

// Attach activity logger middleware to all requests
app.use(activityLogger.attachActivityLogger);

// === Keycloak JWT Validation Middleware ===

const KEYCLOAK_REALM_URL = 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank';
const JWKS = createRemoteJWKSet(
  new URL(`${KEYCLOAK_REALM_URL}/protocol/openid-connect/certs`)
);

/**
 * Middleware to validate Keycloak JWT tokens
 * Add this to routes that require authentication
 */
// Middleware to validate orchestrator's own tokens
async function validateOrchestratorToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  console.log('UserInfo endpoint called with Authorization header:', authHeader ? 'present' : 'missing');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Invalid or missing Authorization header');
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  console.log('Validating token (first 20 chars):', token.substring(0, 20) + '...');
  
  try {
    // Use our JWKS endpoint to verify tokens
    const orchestratorJWKS = createRemoteJWKSet(
      new URL('https://bank-production-37ea.up.railway.app/.well-known/jwks.json')
    );
    
    const { payload } = await jwtVerify(token, orchestratorJWKS, {
      issuer: process.env.ORCHESTRATOR_ISS || 'https://bank-production-37ea.up.railway.app'
    });
    
    console.log('Token validated successfully for user:', payload.sub, payload.preferred_username);
    
    // Attach user info to request
    req.user = {
      sub: payload.sub,
      preferred_username: payload.preferred_username,
      email: payload.email,
      email_verified: payload.email_verified || true,
      name: payload.name,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };
    
    next();
  } catch (error) {
    console.error('Orchestrator token validation failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function validateKeycloakToken(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: KEYCLOAK_REALM_URL,
      audience: 'tamange-web' // Must match your client ID
    });
    
    // Attach user info to request
    req.user = {
      sub: payload.sub,
      preferred_username: payload.preferred_username,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      given_name: payload.given_name,
      family_name: payload.family_name,
    };
    
    next();
  } catch (error) {
    console.error('Token validation failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Public endpoint to get user info (requires valid token)
app.get('/api/userinfo', validateKeycloakToken, (req, res) => {
  res.json(req.user);
});

// === End Keycloak JWT Validation ===

// === Orchestrator API Endpoints ===

import * as keycloakAdmin from './keycloak-admin.js';
import { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse 
} from '@simplewebauthn/server';
import { signAssertion, exchangeWithKeycloak, loadPrivateKey } from './token-exchange.js';

/**
 * POST /v1/users/register
 * Register a new user after Digital ID verification
 * 
 * Flow:
 * 1. Verify digital ID (your existing flow)
 * 2. Create user in Orchestrator DB (master)
 * 3. Push user to Keycloak via Admin API
 * 4. Return user info for passkey enrollment
 */
app.post('/v1/users/register', async (req, res) => {
  try {
    const { 
      username, 
      email, 
      phone,
      givenName, 
      familyName, 
      birthDate,
      documentNumber, 
      documentType,
      issuingAuthority,
      faceDescriptor 
    } = req.body;
    
    // Validate required fields
    if (!username || !email || !givenName || !familyName || !documentNumber) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    // Check if this exact person already exists (email + DOB + first name + last name)
    // This prevents duplicate registrations while allowing family members to share emails
    if (birthDate) {
      const existingPerson = await db.getUserByPersonalInfo(email, birthDate, givenName, familyName);
      if (existingPerson) {
        return res.status(409).json({ 
          success: false, 
          error: 'Customer already exists with this email, date of birth, and name combination',
          hint: 'This person is already registered. Please sign in instead.'
        });
      }
    }
    
    // Check if username already exists in Orchestrator DB
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: 'Username already exists',
        hint: 'Please choose a different username'
      });
    }
    
    // Create user in Orchestrator DB ONLY
    // Keycloak user will be created automatically on first login via identity provider
    let user;
    try {
      user = await db.createUser({
        keycloakUserId: null, // Will be set later when Keycloak auto-creates user on first login
        username,
        email,
        phone,
        givenName,
        familyName,
        birthDate,
        documentNumber,
        documentType,
        issuingAuthority,
        faceDescriptor
      });
      
      console.log(`Created user in Orchestrator DB: ${user.id} (Keycloak user will be auto-created on first login)`);
    } catch (dbError) {
      console.error('Failed to create user in Orchestrator DB:', dbError.message);
      
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create user in database' 
      });
    }
    
    // Register Digital ID as auth method if user registered with Digital ID
    if (documentNumber) {
      try {
        await db.addAuthMethod(user.id, 'digitalid', 'primary-device', {
          deviceInfo: {
            type: 'digital_credential',
            method: 'digital_id_verification',
            documentType: documentType || 'unknown',
            registeredAt: new Date().toISOString()
          },
          isPrimary: false, // Passkey is typically primary
          metadata: {
            documentNumber,
            source: 'digital_id_registration'
          }
        });
        console.log('Registered Digital ID auth method for user:', user.username);
      } catch (digitalIdAuthErr) {
        console.error('Failed to register Digital ID auth method (non-critical):', digitalIdAuthErr);
        // Non-critical, continue
      }
    }
    
    // Log registration event
    await req.logAuthActivity({
      user_id: user.id,
      username: user.username,
      auth_method: 'registration',
      success: true,
      metadata: { 
        document_number: documentNumber,
        document_type: documentType,
        source: 'digital_id_registration'
      }
    });
    
    await db.logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'USER_REGISTERED',
      method: 'DIGITAL_ID',
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        givenName: user.given_name,
        familyName: user.family_name
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error during registration' 
    });
  }
});

/**
 * GET /v1/users/:userId/auth-methods
 * Get all enabled authentication methods for a user
 */
app.get('/v1/users/:userId/auth-methods', async (req, res) => {
  console.log('=== GET USER AUTH METHODS ===');
  console.log('User ID:', req.params.userId);
  
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Get all enabled authentication methods
    const authMethods = await db.getUserAuthMethods(userId);
    
    console.log(`Found ${authMethods.length} auth methods for user ${userId}`);
    
    // Format the response
    const methods = authMethods.map(method => ({
      id: method.id,
      type: method.methodType,
      identifier: method.methodIdentifier,
      deviceInfo: method.deviceInfo,
      isPrimary: method.isPrimary,
      lastUsedAt: method.lastUsedAt,
      createdAt: method.createdAt
    }));
    
    return res.json({
      success: true,
      methods,
      summary: {
        total: methods.length,
        hasPasskey: methods.some(m => m.type === 'passkey'),
        hasDigitalId: methods.some(m => m.type === 'digitalid'),
        hasEmailOtp: methods.some(m => m.type === 'email_otp'),
        hasSmsOtp: methods.some(m => m.type === 'sms_otp'),
        primaryMethod: methods.find(m => m.isPrimary)?.type || null
      }
    });
    
  } catch (error) {
    console.error('Error getting auth methods:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /v1/users/by-username/:username
 * Get user information by username (for auth method selection)
 */
app.get('/v1/users/by-username/:username', async (req, res) => {
  console.log('=== GET USER BY USERNAME ===');
  console.log('Username:', req.params.username);
  
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }
    
    // Get user by username
    const user = await db.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return basic user info (no sensitive data)
    return res.json({
      id: user.id,
      username: user.username,
      givenName: user.given_name,
      familyName: user.family_name
    });
    
  } catch (error) {
    console.error('Error getting user by username:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /v1/auth/available-methods/:username
 * Get available authentication methods for a user, filtered by rules
 */
app.get('/v1/auth/available-methods/:username', async (req, res) => {
  console.log('=== GET AVAILABLE AUTH METHODS WITH RULES ===');
  console.log('Username:', req.params.username);
  
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }
    
    // Get user by username
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get all enabled authentication methods for the user
    const allAuthMethods = await db.getUserAuthMethods(user.id);
    
    // Build auth context from request
    const authContext = await activityLogger.getAuthContext(req, user);
    
    // Evaluate rules to filter allowed methods
    const rulesResult = await rulesEngine.evaluateRules(authContext);
    
    console.log('Rules evaluation result:', rulesResult);
    
    // Log the rules evaluation attempt
    await req.logAuthActivity({
      user_id: user.id,
      username: user.username,
      auth_method: 'rules_evaluation',
      success: rulesResult.allowed,
      metadata: {
        rulesApplied: rulesResult.rulesApplied,
        blockReason: rulesResult.blockReason,
        allowedMethods: rulesResult.allowedMethods
      }
    });
    
    // If access is blocked, return blocked status
    if (!rulesResult.allowed) {
      return res.json({
        success: true,
        blocked: true,
        blockReason: rulesResult.blockReason,
        methods: [],
        summary: {
          total: 0,
          hasPasskey: false,
          hasDigitalId: false,
          hasEmailOtp: false,
          hasSmsOtp: false,
          primaryMethod: null
        }
      });
    }
    
    // Filter methods based on allowed methods from rules
    let filteredMethods = allAuthMethods;
    if (rulesResult.allowedMethods && rulesResult.allowedMethods.length > 0) {
      // Map rule method names to database method types
      const methodTypeMap = {
        'passkey': 'passkey',
        'digitalid': 'digitalid', 
        'email_otp': 'email_otp',
        'sms_otp': 'sms_otp'
      };
      
      const allowedTypes = rulesResult.allowedMethods.map(method => methodTypeMap[method]).filter(Boolean);
      filteredMethods = allAuthMethods.filter(method => allowedTypes.includes(method.methodType));
    }
    
    console.log(`Rules allowed methods: ${rulesResult.allowedMethods?.join(', ') || 'all'}`);
    console.log(`Filtered ${allAuthMethods.length} methods down to ${filteredMethods.length}`);
    
    // Format the response
    const methods = filteredMethods.map(method => ({
      id: method.id,
      type: method.methodType,
      identifier: method.methodIdentifier,
      deviceInfo: method.deviceInfo,
      isPrimary: method.isPrimary,
      lastUsedAt: method.lastUsedAt,
      createdAt: method.createdAt
    }));
    
    return res.json({
      success: true,
      blocked: false,
      methods,
      summary: {
        total: methods.length,
        hasPasskey: methods.some(m => m.type === 'passkey'),
        hasDigitalId: methods.some(m => m.type === 'digitalid'),
        hasEmailOtp: methods.some(m => m.type === 'email_otp'),
        hasSmsOtp: methods.some(m => m.type === 'sms_otp'),
        primaryMethod: methods.find(m => m.isPrimary)?.type || null
      }
    });
    
  } catch (error) {
    console.error('Error getting available auth methods with rules:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /v1/passkeys/register/options
 * Generate WebAuthn registration options for passkey enrollment
 */
app.post('/v1/passkeys/register/options', async (req, res) => {
  console.log('=== PASSKEY REGISTRATION OPTIONS REQUEST ===');
  console.log('Request body:', JSON.stringify(req.body));
  
  try {
    const { userId, username } = req.body;
    
    console.log(`Generating WebAuthn registration options for user: ${username} (${userId})`);
    
    if (!userId || !username) {
      return res.status(400).json({ error: 'userId and username required' });
    }
    
    // Get user from DB
    console.log('Fetching user from DB...');
    const user = await db.getUserById(userId);
    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`Found user: ${user.username}`);
    console.log('User details:', JSON.stringify({ id: user.id, username: user.username, given_name: user.given_name, family_name: user.family_name }));
    
    // Get existing credentials for this user
    console.log('Fetching existing credentials...');
    const existingCredentials = await db.getUserPasskeyCredentials(userId);
    console.log(`Found ${existingCredentials.length} existing credentials`);
    
    // Generate registration options
    console.log('Calling generateRegistrationOptions...');
    const options = await generateRegistrationOptions({
      rpName: process.env.WEBAUTHN_RP_NAME || 'Tamange Bank',
      rpID: getWebAuthnRpId(),
      userID: new Uint8Array(Buffer.from(userId, 'utf8')),
      userName: username,
      userDisplayName: `${user.given_name} ${user.family_name}`,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map(cred => ({
        id: cred.credential_id, // Already in correct format from DB
        type: 'public-key',
        transports: cred.transports || []
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform' // Prefer platform authenticators (Touch ID, Windows Hello, etc.)
      },
    });
    
    // Store challenge
    await db.storeChallenge(userId, options.challenge, 300); // 5 min expiry
    
    console.log(`✓ Generated WebAuthn registration options for ${username}`);
    return res.json(options);
    
  } catch (error) {
    console.error('Error generating registration options:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Failed to generate registration options',
      details: error.message 
    });
  }
});

/**
 * POST /v1/passkeys/register/verify
 * Verify and store passkey credential after WebAuthn ceremony
 */
app.post('/v1/passkeys/register/verify', async (req, res) => {
  try {
    const { userId, credential } = req.body;
    
    console.log(`Verifying passkey registration for user: ${userId}`);
    
    if (!userId || !credential) {
      return res.status(400).json({ error: 'userId and credential required' });
    }
    
    // Get user
    const user = await db.getUserById(userId);
    if (!user) {
      console.log(`User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`Verifying credential for user: ${user.username}`);
    console.log('Credential received (preview):', {
      id: credential.id,
      rawId_len: credential.rawId ? credential.rawId.length : 0,
      clientDataJSON_len: credential.response && credential.response.clientDataJSON ? credential.response.clientDataJSON.length : 0,
      attestationObject_len: credential.response && credential.response.attestationObject ? credential.response.attestationObject.length : 0,
    });
    
    // Get stored challenge by decoding clientDataJSON.challenge
    let clientChallenge;
    try {
      const clientDataJSON_b64 = credential.response.clientDataJSON;
      // clientDataJSON may be base64url; normalize to base64 then decode
      const normalizeBase64Url = (s) => {
        if (!s) return s;
        let t = s.replace(/-/g, '+').replace(/_/g, '/');
        while (t.length % 4) t += '=';
        return t;
      };
      const clientDataJSON_base64 = normalizeBase64Url(clientDataJSON_b64);
      const clientDataJSON_str = Buffer.from(clientDataJSON_base64, 'base64').toString('utf8');
      const clientData = JSON.parse(clientDataJSON_str);
      clientChallenge = clientData.challenge; // base64url challenge
    } catch (err) {
      console.error('Failed to parse clientDataJSON to extract challenge:', err);
      return res.status(400).json({ error: 'Invalid clientDataJSON' });
    }

    const challengeRecord = await db.getChallenge(clientChallenge);
    if (!challengeRecord) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }
    
    // Verify registration response
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: getWebAuthnOrigin(),
        expectedRPID: getWebAuthnRpId(),
      });
      // Debug: shallow-print verification result to help diagnose missing registrationInfo
      try {
        console.log('verifyRegistrationResponse result (summary):', {
          verified: verification.verified,
          registrationInfo_present: !!verification.registrationInfo,
          registrationInfo_keys: verification.registrationInfo ? Object.keys(verification.registrationInfo) : null
        });
      } catch (e) {
        console.log('Could not summarize verification result:', e);
      }
    } catch (err) {
      console.error('verifyRegistrationResponse threw error:', err);
      return res.status(400).json({ verified: false, error: 'Verification error', details: err.message });
    }

    if (!verification.verified || !verification.registrationInfo) {
      console.error('Verification result:', verification);
      return res.status(400).json({ 
        verified: false, 
        error: 'Verification failed',
        details: JSON.stringify(verification)
      });
    }
    
    // Store credential
    // Support multiple shapes returned by verifyRegistrationResponse:
    // - registrationInfo.credentialID & registrationInfo.credentialPublicKey (flat)
    // - registrationInfo.credential = { id, publicKey, counter }
    const regInfo = verification.registrationInfo || {};

    // Helper to normalize base64url string -> Buffer
    const normalizeBase64UrlToBuffer = (s) => {
      if (!s) return null;
      if (Buffer.isBuffer(s)) return s;
      if (s instanceof Uint8Array) return Buffer.from(s);
      if (typeof s === 'string') {
        let t = s.replace(/-/g, '+').replace(/_/g, '/');
        while (t.length % 4) t += '=';
        return Buffer.from(t, 'base64');
      }
      // If it's an ArrayBuffer
      if (s instanceof ArrayBuffer) return Buffer.from(new Uint8Array(s));
      return null;
    };

    // Try top-level fields first, then nested credential
    const rawCredentialId = regInfo.credentialID ?? regInfo.credential?.id;
    const rawPublicKey = regInfo.credentialPublicKey ?? regInfo.credential?.publicKey;
    const newCounter = regInfo.counter ?? regInfo.credential?.counter ?? 0;

    const credentialIdBuffer = normalizeBase64UrlToBuffer(rawCredentialId);
    const credentialPublicKeyBuffer = normalizeBase64UrlToBuffer(rawPublicKey);

    if (!credentialIdBuffer || !credentialPublicKeyBuffer) {
      console.error('Missing registrationInfo fields:', { credentialID: rawCredentialId, credentialPublicKey: rawPublicKey, registrationInfo: regInfo });
      return res.status(500).json({ error: 'Failed to verify registration', details: 'Missing credential public key or id in registrationInfo' });
    }

    try {
      const credentialIdB64 = credentialIdBuffer.toString('base64');
      const publicKeyB64 = credentialPublicKeyBuffer.toString('base64');
      console.log('Storing passkey credential (preview):', {
        credential_id_preview: credentialIdB64.slice(0, 12) + '...',
        credential_id_len: credentialIdBuffer.length,
        public_key_len: credentialPublicKeyBuffer.length,
        counter: newCounter
      });

      await db.storePasskeyCredential({
        userId,
        credentialId: credentialIdB64,
        publicKey: publicKeyB64,
        counter: newCounter,
        transports: credential.response.transports || (regInfo.credential && regInfo.credential.transports) || [],
        backupEligible: regInfo.credentialBackedUp ?? regInfo.credential?.credentialBackedUp ?? false,
        backupState: regInfo.credentialBackedUp ?? regInfo.credential?.credentialBackedUp ?? false,
        deviceType: regInfo.credentialDeviceType ?? regInfo.credential?.credentialDeviceType ?? null
      });
    } catch (storeErr) {
      console.error('Failed to store passkey credential:', storeErr);
      return res.status(500).json({ error: 'Failed to store passkey credential', details: storeErr.message });
    }
    
    // Delete used challenge
    await db.deleteChallenge(challengeRecord.challenge);
    
    // Log enrollment event
    await req.logAuthActivity({
      user_id: userId,
      username: user.username,
      auth_method: 'passkey_enrollment',
      success: true,
      metadata: { 
        credential_id: credentialIdB64,
        device_type: regInfo.credentialDeviceType ?? regInfo.credential?.credentialDeviceType ?? null,
        backup_eligible: regInfo.credentialBackedUp ?? regInfo.credential?.credentialBackedUp ?? false
      }
    });
    
    await db.logAuthEvent({
      userId,
      username: user.username,
      eventType: 'PASSKEY_ENROLLED',
      method: 'WEBAUTHN',
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    console.log(`✓ Passkey registration verified and stored for ${user.username}`);
    
    return res.json({ 
      verified: true,
      message: 'Passkey enrolled successfully' 
    });
    
  } catch (error) {
    console.error('Error verifying registration:', error);
    console.error(error.stack);
    return res.status(500).json({ error: 'Failed to verify registration', details: error.message });
  }
});

/**
 * POST /v1/passkeys/auth/options
 * Generate WebAuthn authentication options for passkey sign-in
 */
app.post('/v1/passkeys/auth/options', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }
    
    // Get user
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.log(`Passkey auth requested for username=${username}, userId=${user.id}`);
    try {
      // Try to log in-memory passkeys size for debugging
      const keys = Array.from((await Promise.resolve()).constructor === Function ? [] : []);
    } catch (e) {
      // noop
    }
    
    // Get user's credentials
    const credentials = await db.getUserPasskeyCredentials(user.id);
    console.log(`Retrieved ${credentials.length} credentials for user ${user.id}`);
    console.log('Credentials preview:', credentials.map(c => ({ credential_id: c.credential_id, user_id: c.user_id })));
    
    if (credentials.length === 0) {
      return res.status(400).json({ error: 'No passkeys enrolled for this user' });
    }
    
    // Helper: convert standard base64 -> base64url (no padding)
    const base64ToBase64Url = s => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID: getWebAuthnRpId(),
      allowCredentials: credentials.map(cred => ({
        // simplewebauthn expects base64url-encoded id strings here
        id: base64ToBase64Url(cred.credential_id),
        type: 'public-key',
        transports: cred.transports || []
      })),
      userVerification: 'preferred',
    });
    
    // Store challenge
    await db.storeChallenge(user.id, options.challenge, 300);
    
    return res.json(options);
    
  } catch (error) {
    console.error('Error generating authentication options:', error);
    return res.status(500).json({ error: 'Failed to generate authentication options' });
  }
});

/**
 * POST /v1/passkeys/auth/verify
 * Verify passkey authentication
 */
app.post('/v1/passkeys/auth/verify', async (req, res) => {
  try {
    const { username, credential } = req.body;
    
    if (!username || !credential) {
      return res.status(400).json({ error: 'username and credential required' });
    }
    
    // Get user
    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Normalize credential id (client may send base64url). DB stores standard base64.
    const base64UrlToBase64 = s => {
      if (!s) return s;
      let t = s.replace(/-/g, '+').replace(/_/g, '/');
      while (t.length % 4) t += '=';
      return t;
    };

    // Get credential from DB
    const credentialId = base64UrlToBase64(credential.id);
    const dbCredential = await db.getPasskeyCredential(credentialId);
    
    if (!dbCredential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    // Get stored challenge by decoding clientDataJSON.challenge
    let clientChallenge;
    try {
      const clientDataJSON_b64url = credential.response.clientDataJSON;
      const normalizeToBase64 = s => {
        if (!s) return s;
        let t = s.replace(/-/g, '+').replace(/_/g, '/');
        while (t.length % 4) t += '=';
        return t;
      };
      const clientDataJSON_base64 = normalizeToBase64(clientDataJSON_b64url);
      const clientDataJSON_str = Buffer.from(clientDataJSON_base64, 'base64').toString('utf8');
      const clientData = JSON.parse(clientDataJSON_str);
      clientChallenge = clientData.challenge; // base64url
    } catch (err) {
      console.error('Failed to parse clientDataJSON to extract challenge (auth):', err);
      return res.status(400).json({ error: 'Invalid clientDataJSON' });
    }

    const challengeRecord = await db.getChallenge(clientChallenge);
    if (!challengeRecord) {
      return res.status(400).json({ error: 'Invalid or expired challenge' });
    }
    
    // Verify authentication response
    let credentialFromDb;
    try {
      credentialFromDb = {
        id: Buffer.from(dbCredential.credential_id, 'base64'),
        publicKey: Buffer.from(dbCredential.public_key, 'base64'),
        counter: dbCredential.counter || 0
      };
    } catch (err) {
      console.error('Failed to parse credential data from database:', err);
      return res.status(500).json({ error: 'Invalid credential data format' });
    }

    console.log('Authenticators/DB credential preview for verification:', {
      dbCredential_preview: { credential_id: dbCredential.credential_id ? dbCredential.credential_id.slice(0,12)+'...' : null, user_id: dbCredential.user_id, counter: dbCredential.counter },
      authenticator_preview: { id_len: credentialFromDb.id.length, publicKey_len: credentialFromDb.publicKey.length, counter: credentialFromDb.counter }
    });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: getWebAuthnOrigin(),
        expectedRPID: getWebAuthnRpId(),
        credential: credentialFromDb
      });
    } catch (verErr) {
      console.error('verifyAuthenticationResponse threw error:', verErr);
      console.error(verErr.stack);
      return res.status(400).json({ verified: false, error: 'Verification error', details: String(verErr.message || verErr) });
    }
    
    if (!verification.verified) {
      // Log failed attempt
      await req.logAuthActivity({
        user_id: user.id,
        username: user.username,
        auth_method: 'passkey',
        success: false,
        failure_reason: 'Verification failed',
        metadata: { verification_details: String(verification) }
      });
      
      await db.logAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: 'PASSKEY_AUTH',
        method: 'WEBAUTHN',
        result: 'FAILURE',
        reason: 'Verification failed',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(400).json({ 
        verified: false, 
        error: 'Authentication failed' 
      });
    }
    
    // Update counter
    const { newCounter } = verification.authenticationInfo;
    await db.updatePasskeyCounter(dbCredential.credential_id, newCounter);
    
    // Update auth method last used timestamp
    try {
      await db.updateAuthMethodLastUsed(user.id, 'passkey', dbCredential.credential_id);
    } catch (authMethodErr) {
      console.error('Failed to update auth method last used (non-critical):', authMethodErr);
      // Non-critical error, continue
    }
    
    // Delete used challenge
    await db.deleteChallenge(challengeRecord.challenge);
    
    // Log successful auth
    await req.logAuthActivity({
      user_id: user.id,
      username: user.username,
      auth_method: 'passkey',
      success: true,
      metadata: { credential_id: dbCredential.credential_id }
    });
    
    await db.logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'PASSKEY_AUTH',
      method: 'WEBAUTHN',
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Generate authorization code for OIDC flow
    const authCode = crypto.randomBytes(32).toString('hex');
    const clientId = req.body.client_id || 'tamange-web'; // Default for SPA
    const redirectUri = req.body.redirect_uri;
    const scope = req.body.scope || 'openid profile email';
    const nonce = req.body.nonce || null; // Get nonce from request
    
    // Store auth code in database with nonce
    const stored = await db.storeAuthCode(authCode, user.id, clientId, redirectUri, scope, user, nonce, 600);
    if (!stored) {
      console.error('Failed to store auth code in database');
      return res.status(500).json({ error: 'Failed to generate authorization code' });
    }
    
    // If token exchange is enabled, sign an assertion and exchange with Keycloak
    if (process.env.ENABLE_TOKEN_EXCHANGE === 'true') {
      try {
        const assertion = await signAssertion(user);
        console.log('Signed assertion for token exchange (preview):', { sub: user.id, username: user.username });
        const tokenResponse = await exchangeWithKeycloak(assertion);
        console.log('Keycloak token exchange response keys:', Object.keys(tokenResponse || {}));
        return res.json({ 
          verified: true,
          userId: user.id,
          username: user.username,
          authCode,
          tokenExchange: tokenResponse
        });
      } catch (txErr) {
        console.error('Token exchange failed:', txErr);
        // Return verification success but include token exchange failure details so client can decide next step
        return res.status(500).json({ 
          verified: true,
          userId: user.id,
          username: user.username,
          authCode,
          tokenExchange: { success: false, error: String(txErr.message || txErr) }
        });
      }
    }

    return res.json({ 
      verified: true,
      userId: user.id,
      username: user.username,
      authCode
    });
    
  } catch (error) {
    console.error('Error verifying authentication:', error);
    return res.status(500).json({ error: 'Failed to verify authentication' });
  }
});

// ============================================================================
// FUTURE AUTHENTICATION METHODS (Stubs for Email OTP, SMS OTP, FaceID)
// ============================================================================

/**
 * POST /v1/auth/email-otp/send
 * Send one-time password via email
 * TODO: Integrate with email service provider (SendGrid, AWS SES, etc.)
 */
app.post('/v1/auth/email-otp/send', async (req, res) => {
  console.log('=== SEND EMAIL OTP (NOT IMPLEMENTED) ===');
  console.log('Request body:', req.body);
  
  try {
    const { email, userId } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    
    // TODO: Generate OTP code (6 digits)
    // TODO: Store OTP in database with expiration (5 minutes)
    // TODO: Send email via email service provider
    // TODO: Register email_otp as auth method if successful
    
    console.warn('⚠️ Email OTP not yet implemented - requires email service integration');
    
    return res.status(501).json({ 
      error: 'Email OTP not implemented yet',
      message: 'Email service integration required (SendGrid, AWS SES, etc.)'
    });
    
  } catch (error) {
    console.error('Error sending email OTP:', error);
    return res.status(500).json({ error: 'Failed to send email OTP' });
  }
});

/**
 * POST /v1/auth/email-otp/verify
 * Verify email OTP code
 * TODO: Implement OTP verification logic
 */
app.post('/v1/auth/email-otp/verify', async (req, res) => {
  console.log('=== VERIFY EMAIL OTP (NOT IMPLEMENTED) ===');
  console.log('Request body:', req.body);
  
  try {
    const { email, code, userId } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ error: 'email and code are required' });
    }
    
    // TODO: Verify OTP code from database
    // TODO: Check expiration
    // TODO: Mark OTP as used
    // TODO: Update auth method last_used_at
    // TODO: Generate authorization code for OIDC flow
    
    console.warn('⚠️ Email OTP verification not yet implemented');
    
    return res.status(501).json({ 
      error: 'Email OTP verification not implemented yet'
    });
    
  } catch (error) {
    console.error('Error verifying email OTP:', error);
    return res.status(500).json({ error: 'Failed to verify email OTP' });
  }
});

/**
 * POST /v1/auth/sms-otp/send
 * Send one-time password via SMS
 * TODO: Integrate with SMS service provider (Twilio, AWS SNS, etc.)
 */
app.post('/v1/auth/sms-otp/send', async (req, res) => {
  console.log('=== SEND SMS OTP (NOT IMPLEMENTED) ===');
  console.log('Request body:', req.body);
  
  try {
    const { phone, userId } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }
    
    // TODO: Generate OTP code (6 digits)
    // TODO: Store OTP in database with expiration (5 minutes)
    // TODO: Send SMS via SMS service provider
    // TODO: Register sms_otp as auth method if successful
    
    console.warn('⚠️ SMS OTP not yet implemented - requires SMS service integration');
    
    return res.status(501).json({ 
      error: 'SMS OTP not implemented yet',
      message: 'SMS service integration required (Twilio, AWS SNS, etc.)'
    });
    
  } catch (error) {
    console.error('Error sending SMS OTP:', error);
    return res.status(500).json({ error: 'Failed to send SMS OTP' });
  }
});

/**
 * POST /v1/auth/sms-otp/verify
 * Verify SMS OTP code
 * TODO: Implement OTP verification logic
 */
app.post('/v1/auth/sms-otp/verify', async (req, res) => {
  console.log('=== VERIFY SMS OTP (NOT IMPLEMENTED) ===');
  console.log('Request body:', req.body);
  
  try {
    const { phone, code, userId } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ error: 'phone and code are required' });
    }
    
    // TODO: Verify OTP code from database
    // TODO: Check expiration
    // TODO: Mark OTP as used
    // TODO: Update auth method last_used_at
    // TODO: Generate authorization code for OIDC flow
    
    console.warn('⚠️ SMS OTP verification not yet implemented');
    
    return res.status(501).json({ 
      error: 'SMS OTP verification not implemented yet'
    });
    
  } catch (error) {
    console.error('Error verifying SMS OTP:', error);
    return res.status(500).json({ error: 'Failed to verify SMS OTP' });
  }
});

/**
 * POST /v1/auth/faceid/verify
 * Verify user using facial recognition (face-api.js)
 * This uses the face descriptor from Digital ID registration
 */
app.post('/v1/auth/faceid/verify', async (req, res) => {
  console.log('=== FACEID VERIFICATION ===');
  console.log('Request body keys:', Object.keys(req.body));
  
  try {
    const { userId, username, faceDescriptor, client_id, redirect_uri, scope, state, nonce } = req.body;
    
    if ((!userId && !username) || !faceDescriptor) {
      return res.status(400).json({ error: 'userId/username and faceDescriptor are required' });
    }
    
    // Validate face descriptor format
    if (!Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
      return res.status(400).json({ error: 'Invalid faceDescriptor format - must be non-empty array' });
    }
    
    // Get user
    let user;
    if (userId) {
      user = await db.getUserById(userId);
    } else {
      user = await db.getUserByUsername(username);
    }
    
    if (!user) {
      await db.logAuthEvent({
        username: username || userId,
        eventType: 'FACEID_AUTH',
        method: 'BIOMETRIC',
        result: 'FAILURE',
        reason: 'USER_NOT_FOUND',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.face_descriptor || !Array.isArray(user.face_descriptor)) {
      await db.logAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: 'FACEID_AUTH',
        method: 'BIOMETRIC',
        result: 'FAILURE',
        reason: 'NO_FACE_DESCRIPTOR_REGISTERED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({ 
        verified: false,
        error: 'User has no registered face descriptor',
        reason: 'NO_BIOMETRIC_ENROLLED'
      });
    }
    
    // Calculate Euclidean distance between face descriptors
    // Lower distance = better match. Typical threshold: 0.6 for face-api.js
    const storedDescriptor = user.face_descriptor;
    
    if (faceDescriptor.length !== storedDescriptor.length) {
      console.error('Face descriptor length mismatch:', {
        captured: faceDescriptor.length,
        stored: storedDescriptor.length
      });
      return res.status(400).json({ 
        verified: false,
        error: 'Face descriptor format mismatch',
        reason: 'INVALID_DESCRIPTOR'
      });
    }
    
    // Calculate Euclidean distance
    let sumSquares = 0;
    for (let i = 0; i < faceDescriptor.length; i++) {
      const diff = faceDescriptor[i] - storedDescriptor[i];
      sumSquares += diff * diff;
    }
    const distance = Math.sqrt(sumSquares);
    
    const threshold = 0.6; // Standard threshold for face-api.js
    const isMatch = distance < threshold;
    
    console.log('Face matching result:', {
      username: user.username,
      distance: distance.toFixed(4),
      threshold,
      isMatch
    });
    
    if (!isMatch) {
      // Face does not match
      await db.logAuthEvent({
        userId: user.id,
        username: user.username,
        eventType: 'FACEID_AUTH',
        method: 'BIOMETRIC',
        result: 'FAILURE',
        reason: 'FACE_MISMATCH',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { distance: distance.toFixed(4), threshold }
      });
      
      return res.status(401).json({ 
        verified: false,
        error: 'Face does not match',
        reason: 'BIOMETRIC_MISMATCH'
      });
    }
    
    // Face matches! Proceed with authentication
    
    // Update auth method last used
    try {
      await db.updateAuthMethodLastUsed(user.id, 'faceid', 'primary-device');
    } catch (authMethodErr) {
      console.error('Failed to update FaceID auth method last used (non-critical):', authMethodErr);
    }
    
    // Log successful authentication
    await db.logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'FACEID_AUTH',
      method: 'BIOMETRIC',
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { distance: distance.toFixed(4), threshold }
    });
    
    // Generate authorization code for OIDC flow
    const crypto = await import('crypto');
    const authCode = crypto.randomBytes(32).toString('hex');
    const clientIdParam = client_id || 'tamange-web';
    const redirectUriParam = redirect_uri;
    const scopeParam = scope || 'openid profile email';
    const nonceParam = nonce || null;
    
    // Store auth code in database
    const stored = await db.storeAuthCode(
      authCode, 
      user.id, 
      clientIdParam, 
      redirectUriParam, 
      scopeParam, 
      user, 
      nonceParam, 
      600
    );
    
    if (!stored) {
      console.error('Failed to store auth code in database');
      return res.status(500).json({ error: 'Failed to generate authorization code' });
    }
    
    console.log('FaceID authentication successful for user:', user.username);
    
    return res.json({ 
      verified: true,
      userId: user.id,
      username: user.username,
      authCode,
      matchQuality: {
        distance: distance.toFixed(4),
        threshold,
        confidence: Math.max(0, Math.min(100, ((threshold - distance) / threshold * 100))).toFixed(1) + '%'
      }
    });
    
  } catch (error) {
    console.error('Error verifying FaceID:', error);
    return res.status(500).json({ error: 'Failed to verify FaceID' });
  }
});

/**
 * POST /v1/auth/digitalid/complete
 * Complete Digital ID authentication and generate authorization code for OIDC flow
 * This is called after successful biometric verification when coming from /authorize
 */
app.post('/v1/auth/digitalid/complete', async (req, res) => {
  console.log('=== COMPLETE DIGITAL ID AUTHENTICATION ===');
  
  try {
    const { sessionToken, username, userId, client_id, redirect_uri, scope, state, nonce } = req.body;
    
    if (!sessionToken || (!userId && !username)) {
      return res.status(400).json({ 
        success: false,
        error: 'sessionToken and userId/username are required' 
      });
    }
    
    // Get user
    let user;
    if (userId) {
      user = await db.getUserById(userId);
    } else {
      user = await db.getUserByUsername(username);
    }
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Update auth method last used
    try {
      await db.updateAuthMethodLastUsed(user.id, 'digitalid', 'primary-device');
    } catch (authMethodErr) {
      console.error('Failed to update Digital ID auth method last used (non-critical):', authMethodErr);
    }
    
    // Log successful authentication
    await req.logAuthActivity({
      user_id: user.id,
      username: user.username,
      auth_method: 'digitalid',
      success: true,
      metadata: { session_token: sessionToken }
    });
    
    await db.logAuthEvent({
      userId: user.id,
      username: user.username,
      eventType: 'DIGITALID_AUTH',
      method: 'DIGITAL_ID',
      result: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Generate authorization code for OIDC flow
    const crypto = await import('crypto');
    const authCode = crypto.randomBytes(32).toString('hex');
    const clientIdParam = client_id || 'tamange-web';
    const redirectUriParam = redirect_uri;
    const scopeParam = scope || 'openid profile email';
    const nonceParam = nonce || null;
    const stateParam = state || null;
    
    // Store auth code in database
    const stored = await db.storeAuthCode(
      authCode, 
      user.id, 
      clientIdParam, 
      redirectUriParam, 
      scopeParam, 
      user, 
      nonceParam, 
      600
    );
    
    if (!stored) {
      console.error('Failed to store auth code in database');
      return res.status(500).json({ 
        success: false,
        error: 'Failed to generate authorization code' 
      });
    }
    
    // Build redirect URL with authorization code
    const redirectUrl = new URL(redirectUriParam);
    redirectUrl.searchParams.set('code', authCode);
    if (stateParam) {
      redirectUrl.searchParams.set('state', stateParam);
    }
    
    console.log('Digital ID authentication successful for user:', user.username);
    console.log('Redirecting to:', redirectUrl.toString());
    
    return res.json({ 
      success: true,
      userId: user.id,
      username: user.username,
      redirectUrl: redirectUrl.toString()
    });
    
  } catch (error) {
    console.error('Error completing Digital ID authentication:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to complete authentication' 
    });
  }
});

// DEBUG: Inspect stored passkeys for a username (in-memory / DB)
app.get('/debug/passkeys/:username', async (req, res) => {
  try {
    const username = req.params.username;
    if (!username) return res.status(400).json({ error: 'username required' });
    const user = await db.getUserByUsername(username);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const creds = await db.getUserPasskeyCredentials(user.id);
    return res.json({ userId: user.id, username: user.username, count: creds.length, credentials: creds.map(c => ({ credential_id: c.credential_id, user_id: c.user_id, created_at: c.created_at })) });
  } catch (err) {
    console.error('Debug passkeys error:', err);
    return res.status(500).json({ error: 'debug failed' });
  }
});

// Admin: Backfill passkey auth methods for existing users
app.post('/admin/backfill-passkeys', async (req, res) => {
  console.log('=== BACKFILL PASSKEY AUTH METHODS ===');
  
  try {
    // This is an admin operation - in production, add authentication
    const results = await db.backfillPasskeyAuthMethods();
    
    return res.json({
      success: true,
      message: 'Passkey auth methods backfilled',
      ...results
    });
    
  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Backfill failed',
      message: error.message
    });
  }
});

// Admin: Backfill Digital ID auth methods for existing users
app.post('/admin/backfill-digitalid', async (req, res) => {
  console.log('=== BACKFILL DIGITAL ID AUTH METHODS ===');
  
  try {
    // This is an admin operation - in production, add authentication
    const results = await db.backfillDigitalIdAuthMethods();
    
    return res.json({
      success: true,
      message: 'Digital ID auth methods backfilled',
      ...results
    });
    
  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Backfill failed',
      message: error.message
    });
  }
});

// Admin: Run all backfills
app.post('/admin/backfill-all', async (req, res) => {
  console.log('=== BACKFILL ALL AUTH METHODS ===');
  
  try {
    // This is an admin operation - in production, add authentication
    const passkeyResults = await db.backfillPasskeyAuthMethods();
    const digitalIdResults = await db.backfillDigitalIdAuthMethods();
    
    return res.json({
      success: true,
      message: 'All auth methods backfilled',
      passkeys: passkeyResults,
      digitalid: digitalIdResults
    });
    
  } catch (error) {
    console.error('Backfill error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Backfill failed',
      message: error.message
    });
  }
});

// DEBUG: List all users (in-memory or DB sample)
app.get('/debug/users', async (req, res) => {
  try {
    // If DB available, show a small sample of users
    if (db.initDatabase()) {
      return res.status(200).json({ message: 'DB available, use DB viewer' });
    }

    // In-memory users
    // Note: we can't directly access inMemoryUsers here; rely on db helper to iterate
    const users = [];
    // db doesn't export a list function, but getUserByUsername can be used if we had names.
    // As a fallback, try to read the internal map from the module cache (best-effort, dev-only)
    try {
      const mod = await import('./database.js');
      if (mod && mod.__debugListUsers) {
        const list = await mod.__debugListUsers();
        return res.json({ count: list.length, users: list });
      }
    } catch (e) {
      // ignore
    }

    return res.json({ message: 'No DB and no debug helper available' });
  } catch (err) {
    console.error('Debug users error:', err);
    return res.status(500).json({ error: 'debug failed' });
  }
});

// DEBUG: Check if user has face descriptor
app.get('/debug/user/:userId/face-descriptor', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await db.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    return res.json({
      userId: user.id,
      username: user.username,
      hasFaceDescriptor: !!user.face_descriptor,
      descriptorLength: user.face_descriptor ? user.face_descriptor.length : 0,
      descriptorType: user.face_descriptor ? typeof user.face_descriptor : 'N/A',
      isArray: Array.isArray(user.face_descriptor)
    });
  } catch (err) {
    console.error('Debug face descriptor error:', err);
    return res.status(500).json({ error: 'debug failed', message: err.message });
  }
});

// === End Orchestrator API Endpoints ===



// --- SPA routing (History API) ---
// Redirect legacy *.html routes to clean paths BEFORE static middleware.
app.get(['/index.html', '/signin.html', '/register.html', '/home.html'], (req, res) => {
    const map = {
        '/index.html': '/',
        '/signin.html': '/signin',
        '/register.html': '/register',
        '/home.html': '/home',
    };
    return res.redirect(302, map[req.path] || '/');
});

app.use(express.static('public'));

// Serve admin portal
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-portal', 'index.html'));
});

// Dev-only JWKS endpoint to help Keycloak fetch the Orchestrator public key during local testing
app.get('/.well-known/jwks.json', (req, res) => {
  try {
    const jwksPath = path.join(__dirname, 'secrets', 'orchestrator-jwks.json');

    // Prefer a file on disk (created by pem-to-jwks), else accept JWKS provided via an env var.
    if (fs.existsSync(jwksPath)) {
      res.setHeader('Content-Type', 'application/json');
      return res.sendFile(jwksPath);
    }

    if (process.env.ORCHESTRATOR_JWKS) {
      res.setHeader('Content-Type', 'application/json');
      try {
        const jwks = JSON.parse(process.env.ORCHESTRATOR_JWKS);
        return res.json(jwks);
      } catch (parseErr) {
        console.error('Failed to parse ORCHESTRATOR_JWKS env var as JSON:', parseErr);
        return res.status(500).json({ error: 'Invalid ORCHESTRATOR_JWKS value' });
      }
    }

    return res.status(404).json({ error: 'JWKS not generated or configured. Run scripts/pem-to-jwks.mjs or set ORCHESTRATOR_JWKS' });
  } catch (err) {
    console.error('Error serving JWKS:', err);
    return res.status(500).json({ error: 'failed to serve jwks' });
  }
});


// Dev-only OpenID Connect discovery document to help Keycloak discover the JWKS
app.get('/.well-known/openid-configuration', (req, res) => {
  try {
    // Determine issuer: prefer explicit env var ORCHESTRATOR_ISS, else derive from request host
    const issuer = (process.env.ORCHESTRATOR_ISS && process.env.ORCHESTRATOR_ISS.trim()) || (() => {
      const protocol = req.get('X-Forwarded-Proto') || req.protocol;
      return `${protocol}://${req.get('host')}`;
    })();

    // Only serve discovery if JWKS is available (via file or env) or an explicit issuer is configured
    const jwksPath = path.join(__dirname, 'secrets', 'orchestrator-jwks.json');
    if (!fs.existsSync(jwksPath) && !process.env.ORCHESTRATOR_JWKS && !process.env.ORCHESTRATOR_ISS) {
      return res.status(404).json({ error: 'not found' });
    }

    const jwksUri = issuer.replace(/\/$/, '') + '/.well-known/jwks.json';

    const config = {
      issuer,
      jwks_uri: jwksUri,
      // Provide basic OIDC fields to satisfy Keycloak discovery expectations
      authorization_endpoint: issuer + '/authorize',
      token_endpoint: issuer + '/token',
      userinfo_endpoint: issuer + '/userinfo',
      end_session_endpoint: issuer + '/logout',
      response_types_supported: [ 'code', 'id_token', 'token' ],
      subject_types_supported: [ 'public' ],
      id_token_signing_alg_values_supported: [ 'RS256' ]
    };

    res.setHeader('Content-Type', 'application/json');
    return res.json(config);
  } catch (err) {
    console.error('Error serving openid-configuration:', err);
    return res.status(500).json({ error: 'failed to serve openid configuration' });
  }
});

// === OIDC Provider Endpoints for Keycloak Integration ===

// OIDC Authorization Endpoint - shows WebAuthn login page
app.get('/authorize', (req, res) => {
  try {
    const { response_type, client_id, redirect_uri, scope, state, nonce } = req.query;

    if (response_type !== 'code') {
      return res.status(400).send('Only response_type=code is supported');
    }

    // Enhanced sign-in page with auth method selection
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - Tamange Bank</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@simplewebauthn/browser@9.0.1/dist/bundle/index.umd.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    :root {
      /* Dark Theme (Default) */
      --gold-primary: #D4AF37;
      --gold-secondary: #F5D76E;
      --gold-light: #FFEAA4;
      --black-primary: #0A0A0A;
      --black-secondary: #1A1A1A;
      --black-light: #2A2A2A;
      --white: #FFFFFF;
      --text-primary: #FFFFFF;
      --text-secondary: #CCCCCC;
      --bg-primary: #0A0A0A;
      --bg-secondary: #1A1A1A;
      --bg-card: #2A2A2A;
      --border-color: rgba(212, 175, 55, 0.3);
      --shadow-color: rgba(0, 0, 0, 0.5);
    }
    
    body {
      font-family: 'Inter', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .auth-container {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: 0 8px 32px var(--shadow-color);
      padding: 40px;
      width: 100%;
      max-width: 440px;
    }
    
    .logo-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 32px;
    }
    
    .logo-symbol {
      width: 50px;
      height: 50px;
      background: linear-gradient(135deg, var(--gold-primary) 0%, var(--gold-secondary) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
      flex-shrink: 0;
    }
    
    .logo-symbol::before {
      content: '';
      position: absolute;
      width: 30px;
      height: 30px;
      border: 3px solid var(--black-primary);
      border-radius: 50%;
      box-shadow: inset 0 0 0 3px var(--gold-light);
    }
    
    .logo-text {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(to right, var(--gold-primary), var(--gold-secondary));
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    h1 {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 8px;
      text-align: center;
    }
    
    .subtitle {
      color: var(--text-secondary);
      text-align: center;
      margin-bottom: 32px;
      font-size: 14px;
    }
    
    .input-group {
      margin-bottom: 24px;
    }
    
    label {
      display: block;
      margin-bottom: 8px;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
    }
    
    input {
      width: 100%;
      padding: 12px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 16px;
      color: var(--text-primary);
      transition: all 0.3s;
    }
    
    input:focus {
      outline: none;
      border-color: var(--gold-primary);
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
    }
    
    input::placeholder {
      color: var(--text-secondary);
      opacity: 0.5;
    }
    
    .btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Inter', sans-serif;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, var(--gold-primary), var(--gold-secondary));
      color: var(--black-primary);
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
    }
    
    .btn-primary:active {
      transform: translateY(0);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    
    .auth-methods {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border-color);
    }
    
    .methods-title {
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 16px;
      text-align: center;
    }
    
    .auth-method-btn {
      display: flex;
      align-items: center;
      padding: 16px;
      margin-bottom: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      width: 100%;
      text-align: left;
    }
    
    .auth-method-btn:hover:not(.disabled) {
      background: var(--bg-card);
      border-color: var(--gold-primary);
      transform: translateX(4px);
    }
    
    .auth-method-btn.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    
    .method-icon {
      font-size: 28px;
      margin-right: 16px;
      flex-shrink: 0;
    }
    
    .method-info {
      flex: 1;
    }
    
    .method-name {
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 2px;
      font-size: 15px;
    }
    
    .method-desc {
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .method-arrow {
      color: var(--gold-primary);
      font-size: 20px;
      margin-left: 12px;
    }
    
    .error {
      background: rgba(220, 53, 69, 0.1);
      border: 1px solid rgba(220, 53, 69, 0.3);
      color: #ff6b6b;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      margin-top: 16px;
    }
    
    .hidden {
      display: none;
    }
    
    .back-btn {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      margin-top: 12px;
    }
    
    .back-btn:hover {
      background: var(--bg-secondary);
      border-color: var(--gold-primary);
      color: var(--text-primary);
      transform: none;
    }
  </style>
  <script>
    let currentUser = null;
    let authMethods = [];

    async function checkUsername() {
      const username = document.getElementById('username').value;
      if (!username) {
        alert('Please enter username');
        return;
      }

      try {
        // Get user info
        const userResp = await fetch('/v1/users/by-username/' + encodeURIComponent(username));
        if (!userResp.ok) {
          showError('User not found');
          return;
        }

        currentUser = await userResp.json();
        
        // Get auth methods (now with rules filtering)
        const methodsResp = await fetch('/v1/auth/available-methods/' + encodeURIComponent(currentUser.username));
        if (!methodsResp.ok) {
          showError('Could not load authentication methods');
          return;
        }

        const methodsData = await methodsResp.json();
        
        // Check if access is blocked by rules
        if (methodsData.blocked) {
          showBlockedMessage(methodsData.blockReason);
          return;
        }
        
        authMethods = methodsData.methods || [];
        
        // Show auth method selection
        showAuthMethods();
        
      } catch (error) {
        console.error('Error checking username:', error);
        showError('Error: ' + error.message);
      }
    }

    function showAuthMethods() {
      document.getElementById('username-section').classList.add('hidden');
      document.getElementById('methods-section').classList.remove('hidden');
      
      const container = document.getElementById('auth-methods-container');
      container.innerHTML = '';
      
      // Check for available auth methods
      const hasPasskey = authMethods.some(m => m.type === 'passkey');
      const hasDigitalId = authMethods.some(m => m.type === 'digitalid');
      const hasEmailOtp = authMethods.some(m => m.type === 'email_otp');
      const hasSmsOtp = authMethods.some(m => m.type === 'sms_otp');
      
      // Passkey button (primary)
      if (hasPasskey) {
        container.innerHTML += \`
          <button class="auth-method-btn" onclick="signInWithPasskey()">
            <span class="method-icon">🔐</span>
            <div class="method-info">
              <div class="method-name">Passkey</div>
              <div class="method-desc">Use your device's biometric or PIN</div>
            </div>
            <span class="method-arrow">→</span>
          </button>
        \`;
      }
      
      // Digital ID button
      if (hasDigitalId) {
        container.innerHTML += \`
          <button class="auth-method-btn" onclick="signInWithDigitalId()">
            <span class="method-icon">🪪</span>
            <div class="method-info">
              <div class="method-name">Digital ID</div>
              <div class="method-desc">Verify with digital credential + face</div>
            </div>
            <span class="method-arrow">→</span>
          </button>
        \`;
      }
      
      // Email OTP button (disabled if not implemented)
      container.innerHTML += \`
        <button class="auth-method-btn \${hasEmailOtp ? '' : 'disabled'}" 
                onclick="\${hasEmailOtp ? 'signInWithEmailOtp()' : 'alert(\\'Email OTP not set up\\')'}" 
                \${hasEmailOtp ? '' : 'disabled'}>
          <span class="method-icon">📧</span>
          <div class="method-info">
            <div class="method-name">Email OTP</div>
            <div class="method-desc">One-time code via email</div>
          </div>
          <span class="method-arrow">\${hasEmailOtp ? '→' : '🔒'}</span>
        </button>
      \`;
      
      // SMS OTP button (disabled if not implemented)
      container.innerHTML += \`
        <button class="auth-method-btn \${hasSmsOtp ? '' : 'disabled'}" 
                onclick="\${hasSmsOtp ? 'signInWithSmsOtp()' : 'alert(\\'SMS OTP not set up\\')'}" 
                \${hasSmsOtp ? '' : 'disabled'}>
          <span class="method-icon">📱</span>
          <div class="method-info">
            <div class="method-name">SMS OTP</div>
            <div class="method-desc">One-time code via text message</div>
          </div>
          <span class="method-arrow">\${hasSmsOtp ? '→' : '🔒'}</span>
        </button>
      \`;
      
      // If no auth methods, try passkey anyway (for backwards compatibility)
      if (authMethods.length === 0) {
        container.innerHTML = \`
          <button class="auth-method-btn" onclick="signInWithPasskey()">
            <span class="method-icon">🔐</span>
            <div class="method-info">
              <div class="method-name">Passkey</div>
              <div class="method-desc">Use your device's biometric or PIN</div>
            </div>
            <span class="method-arrow">→</span>
          </button>
          <p style="color: var(--text-secondary); font-size: 14px; text-align: center; margin-top: 16px;">
            No authentication methods registered
          </p>
        \`;
      }
    }

    async function signInWithPasskey() {
      if (!currentUser) {
        showError('Please enter username first');
        return;
      }

      try {
        // Get authentication options
        const optionsResp = await fetch('/v1/passkeys/auth/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUser.username })
        });

        if (!optionsResp.ok) {
          const error = await optionsResp.json();
          showError('Error: ' + error.error);
          return;
        }

        const options = await optionsResp.json();

        // Start WebAuthn authentication
        const credential = await SimpleWebAuthnBrowser.startAuthentication(options);

        // Verify with server
        const verifyResp = await fetch('/v1/passkeys/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            username: currentUser.username, 
            credential,
            client_id: ${JSON.stringify(client_id)},
            redirect_uri: ${JSON.stringify(redirect_uri)},
            scope: ${JSON.stringify(scope || 'openid profile email')},
            state: ${JSON.stringify(state || '')},
            nonce: ${JSON.stringify(nonce || '')}
          })
        });

        if (!verifyResp.ok) {
          const error = await verifyResp.json();
          showError('Authentication failed: ' + error.error);
          return;
        }

        const result = await verifyResp.json();

        if (result.verified && result.authCode) {
          // Success - redirect back with code
          const params = new URLSearchParams({
            code: result.authCode,
            state: ${JSON.stringify(state || '')}
          });
          window.location.href = ${JSON.stringify(redirect_uri)} + '?' + params.toString();
        } else {
          showError('Authentication failed');
        }
      } catch (error) {
        console.error('Passkey sign in error:', error);
        showError('Sign in failed: ' + error.message);
      }
    }

    async function signInWithDigitalId() {
      if (!currentUser) {
        showError('Please enter username first');
        return;
      }

      try {
        // Store OIDC parameters in sessionStorage for after Digital ID sign-in completes
        sessionStorage.setItem('oidc_params', JSON.stringify({
          username: currentUser.username,
          userId: currentUser.id,
          client_id: ${JSON.stringify(client_id)},
          redirect_uri: ${JSON.stringify(redirect_uri)},
          scope: ${JSON.stringify(scope || 'openid profile email')},
          state: ${JSON.stringify(state || '')},
          nonce: ${JSON.stringify(nonce || '')}
        }));
        
        // Redirect to Digital ID sign-in page
        window.location.href = '/digitalid-signin';
        
      } catch (error) {
        console.error('Digital ID sign in error:', error);
        showError('Failed to start Digital ID authentication: ' + error.message);
      }
    }

    async function signInWithEmailOtp() {
      showError('Email OTP authentication coming soon!');
      // TODO: Implement email OTP flow
    }

    async function signInWithSmsOtp() {
      showError('SMS OTP authentication coming soon!');
      // TODO: Implement SMS OTP flow
    }

    function showError(message) {
      document.getElementById('error-message').textContent = message;
      document.getElementById('error-message').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('error-message').classList.add('hidden');
      }, 5000);
    }

    function showBlockedMessage(reason) {
      document.getElementById('username-section').classList.add('hidden');
      document.getElementById('methods-section').classList.add('hidden');
      document.getElementById('blocked-section').classList.remove('hidden');
      
      const reasonElement = document.getElementById('block-reason');
      reasonElement.textContent = reason || 'Access denied by security policy';
    }

    function goBack() {
      document.getElementById('username-section').classList.remove('hidden');
      document.getElementById('methods-section').classList.add('hidden');
      document.getElementById('blocked-section').classList.add('hidden');
      currentUser = null;
      authMethods = [];
    }
  </script>
</head>
<body>
  <div class="auth-container">
    <!-- Logo -->
    <div class="logo-container">
      <div class="logo-symbol"></div>
      <div class="logo-text">Tamange Bank</div>
    </div>
    
    <!-- Username Entry Section -->
    <div id="username-section">
      <h1>Welcome back</h1>
      <p class="subtitle">Sign in to your account</p>
      
      <div class="input-group">
        <label for="username">Username</label>
        <input type="text" id="username" placeholder="Enter your username" required 
               onkeypress="if(event.key==='Enter') checkUsername()" autofocus>
      </div>
      <button class="btn btn-primary" onclick="checkUsername()">Continue</button>
    </div>

    <!-- Auth Methods Selection Section -->
    <div id="methods-section" class="hidden">
      <h1>Choose sign in method</h1>
      <p class="subtitle">Select how you want to authenticate</p>
      
      <div id="auth-methods-container"></div>
      <button class="btn back-btn" onclick="goBack()">← Back to username</button>
    </div>

    <!-- Access Blocked Section -->
    <div id="blocked-section" class="hidden">
      <h1>Access Restricted</h1>
      <p class="subtitle">Your sign in attempt has been blocked</p>
      
      <div class="error" style="margin-top: 24px; text-align: center;">
        <div id="block-reason" style="margin-bottom: 16px; font-weight: 500;"></div>
        <div style="font-size: 14px; opacity: 0.8;">
          If you believe this is an error, please contact your administrator.
        </div>
      </div>
      
      <button class="btn back-btn" onclick="goBack()">← Try different username</button>
    </div>

    <!-- Error Message -->
    <div id="error-message" class="error hidden"></div>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    console.error('Authorize error:', error);
    res.status(500).send('Authorization failed');
  }
});

// OIDC Token Endpoint
app.post('/token', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
    const { grant_type, code, redirect_uri, client_id, client_secret } = req.body;

    console.log('Token request received:', { grant_type, code: code ? code.slice(0, 10) + '...' : null, redirect_uri, client_id });

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    // Validate client (simplified - accept any for now)
    // if (client_id !== 'tamange-web' && client_id !== process.env.KEYCLOAK_CLIENT_ID) {
    //   return res.status(401).json({ error: 'invalid_client' });
    // }

    // Get auth code data
    const codeData = await db.getAuthCode(code);
    if (!codeData) {
      console.error('Auth code not found in database:', code.slice(0, 10) + '...');
      return res.status(400).json({ error: 'invalid_grant' });
    }

    // Delete auth code (one-time use)
    await db.deleteAuthCode(code);

    // Generate tokens
    const user = codeData.user;
    const issuer = process.env.ORCHESTRATOR_ISS || `https://${req.get('host')}`;

    // ID Token (must include nonce if it was in the original request)
    const idTokenClaims = {
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      name: `${user.given_name} ${user.family_name}`,
      given_name: user.given_name,
      family_name: user.family_name,
      aud: client_id,
      iss: issuer
    };
    
    // Add nonce if it was provided
    if (codeData.nonce) {
      idTokenClaims.nonce = codeData.nonce;
    }
    
    const idToken = await new SignJWT(idTokenClaims)
    .setProtectedHeader({ alg: 'RS256', kid: 'orchestrator-1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await loadPrivateKey());

    console.log('Generated ID token with issuer:', issuer, 'audience:', client_id, 'kid: orchestrator-1', 'nonce:', codeData.nonce ? 'present' : 'not provided');

    // Access Token (must include user claims for /userinfo endpoint)
    const accessToken = await new SignJWT({
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      name: `${user.given_name} ${user.family_name}`,
      given_name: user.given_name,
      family_name: user.family_name,
      aud: client_id,
      iss: issuer,
      scope: 'openid profile email'
    })
    .setProtectedHeader({ alg: 'RS256', kid: 'orchestrator-1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await loadPrivateKey());

    console.log('Returning tokens to client_id:', client_id);

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken
    });

  } catch (error) {
    console.error('Token error:', error);
    res.status(500).json({ error: 'token_generation_failed' });
  }
});

// OIDC UserInfo Endpoint (for identity provider flow - validates orchestrator tokens)
app.get('/userinfo', validateOrchestratorToken, (req, res) => {
  console.log('Returning userinfo for user:', req.user.sub);
  res.json({
    sub: req.user.sub,
    preferred_username: req.user.preferred_username,
    email: req.user.email,
    email_verified: req.user.email_verified,
    name: req.user.name,
    given_name: req.user.given_name,
    family_name: req.user.family_name
  });
});

// === End OIDC Provider Endpoints ===

// Middleware to handle ES module imports without .js extension
app.use('/node_modules', (req, res, next) => {
    // If the request doesn't have an extension and it's for a JS module
    if (!req.path.match(/\.[a-z]+$/i)) {
        const jsPath = req.path + '.js';
        const fullPath = path.join(__dirname, 'node_modules', jsPath);
        
        // Check if .js file exists
        if (fs.existsSync(fullPath)) {
            return res.sendFile(fullPath);
        }
    }
    next();
});

// Serve the library files so frontend can import them
app.use('/lib', express.static('node_modules/id-verifier/build'));
app.use('/node_modules', express.static('node_modules'));
app.use('/models', express.static('models'));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Serve the SPA shell for app routes.
// This is intentionally strict about what it catches:
//  - GET only
//  - Not API endpoints
//  - Not asset/file requests (having an extension)
//  - Only known SPA paths
function serveSpaShell(req, res) {
    return res.sendFile(path.join(__dirname, 'public', 'app.html'));
}

// Explicitly handle callback route (with or without query params)
app.get('/callback', (req, res) => {
    return serveSpaShell(req, res);
});

app.get(['/', '/digitalid-signin', '/register', '/home', '/authorize'], (req, res) => {
    // If a proxy/CDN rewrites routes, this ensures we still serve HTML.
    // Avoid catching requests for files like /styles.css.
    if (path.extname(req.path)) return res.status(404).end();
    return serveSpaShell(req, res);
});

// In-memory store for session data (nonce -> jwk)
// Short-lived, only used during credential exchange
const sessionStore = new Map();

// In-memory fallback stores (used when database is not available)
const accountsStore = new Map();
const sessionTokenStore = new Map();

// Initialize database
const dbAvailable = db.initDatabase();
if (dbAvailable) {
    await db.setupTables();
    // Clean up expired sessions every hour
    setInterval(() => db.cleanupExpiredSessions(), 60 * 60 * 1000);
} else {
    console.log('Running with in-memory storage (data will not persist across restarts)');
}

app.get('/request-params', async (req, res) => {
    try {
        const nonce = generateNonce();
        const jwk = await generateJWK();

        // Store JWK associated with nonce
        sessionStore.set(nonce, jwk);

        const requestParams = createCredentialsRequest({
            documentTypes: [
                // Temporarily commenting out mDL to test PhotoID only
                // DocumentType.MOBILE_DRIVERS_LICENSE
                DocumentType.PHOTO_ID
            ],
            claims: [
                Claim.GIVEN_NAME,
                Claim.FAMILY_NAME,
                Claim.BIRTH_DATE,
                Claim.SEX,
                Claim.PORTRAIT,
                Claim.DOCUMENT_NUMBER,
                Claim.ISSUING_AUTHORITY,
                Claim.EXPIRY_DATE
            ],
            nonce,
            jwk
        });

        // Filter to only include org-iso-mdoc protocol, comment out openid4vp
        const filteredParams = {
            ...requestParams,
            digital: {
                requests: requestParams.digital.requests.filter(req => {
                    // Only keep org-iso-mdoc protocol
                    return req.protocol === 'org-iso-mdoc';
                    // Comment out openid4vp for now
                    // return req.protocol === 'openid4vp-v1-unsigned';
                })
            }
        };

        // Send the params AND the nonce to the frontend
        // The frontend needs the nonce to send it back for verification context
        res.json({ requestParams: filteredParams, nonce });
    } catch (error) {
        console.error('Error generating params:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/verify', async (req, res) => {
    try {
        // Expecting { credentials, nonce } from frontend
        const { credentials, nonce } = req.body;
        
        console.log('Received verification request for nonce:', nonce);

        if (!nonce || !sessionStore.has(nonce)) {
            console.error('Invalid or expired nonce:', nonce);
            return res.status(400).json({ success: false, error: 'Invalid or expired nonce' });
        }

        const jwk = sessionStore.get(nonce);
        
        // Clean up used nonce (prevent replay)
        sessionStore.delete(nonce);

        // Determine origin from request or environment variable
        // Use X-Forwarded-Proto for Railway/proxied environments
        const protocol = req.get('X-Forwarded-Proto') || req.protocol;
        const origin = process.env.ORIGIN || `${protocol}://${req.get('host')}`;
        console.log('Processing credentials with origin:', origin);
        
        const result = await processCredentials(credentials, {
            nonce,
            jwk,
            origin
        });

        console.log('Verification result:', result);

        // Validation checks
        const validationErrors = [];

        // Check age (must be 18+)
        if (result.claims.birth_date) {
            const birthDate = new Date(result.claims.birth_date);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (age < 18) {
                validationErrors.push('You must be at least 18 years old to open an account');
            }
        }

        // Check document expiry
        if (result.claims.expiry_date) {
            const expiryDate = new Date(result.claims.expiry_date);
            const today = new Date();
            if (expiryDate < today) {
                validationErrors.push('Your document has expired. Please renew your ID before proceeding');
            }
        }

        res.json({ 
            success: true, 
            claims: result.claims,
            trusted: result.trusted,
            valid: result.valid,
            validationErrors: validationErrors
        });

    } catch (error) {
        console.error('Verification failed:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        res.status(500).json({ success: false, error: error.message, details: error.toString() });
    }
});

app.post('/create-account', async (req, res) => {
    try {
        const { verifiedData, accountType, email, phone, address, city, state, zipCode } = req.body;

        // Validation
        const errors = [];

        // Check required fields (state and zipCode are optional)
        if (!verifiedData || !accountType || !email || !phone || !address || !city) {
            return res.status(400).json({ success: false, error: 'Required fields are missing' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Invalid email format');
        }

        // Validate phone format (basic)
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(phone)) {
            errors.push('Invalid phone number format');
        }

        // Check for duplicate account (by document number)
        const documentNumber = verifiedData.claims.document_number;
        
        if (db.isDatabaseAvailable()) {
            const exists = await db.accountExists(documentNumber);
            if (exists) {
                errors.push('An account with this document number already exists');
            }
        } else {
            // In-memory fallback
            if (accountsStore.has(email.toLowerCase())) {
                errors.push('An account with this email address already exists');
            }
            for (const [, account] of accountsStore) {
                if (account.documentNumber === documentNumber) {
                    errors.push('An account with this document number already exists');
                    break;
                }
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: errors.join('. ') });
        }

        // Generate unique account number
        const accountNumber = 'TB' + Date.now() + Math.floor(Math.random() * 1000);

        // Create account object
        const account = {
            accountNumber,
            accountType,
            fullName: `${verifiedData.claims.given_name} ${verifiedData.claims.family_name}`,
            firstName: verifiedData.claims.given_name,
            lastName: verifiedData.claims.family_name,
            birthDate: verifiedData.claims.birth_date,
            gender: verifiedData.claims.sex,
            documentNumber: verifiedData.claims.document_number,
            issuingAuthority: verifiedData.claims.issuing_authority,
            documentExpiry: verifiedData.claims.expiry_date,
            email: email.toLowerCase(),
            phone,
            address,
            city,
            state,
            zipCode,
            verified: verifiedData.valid && verifiedData.trusted,
            createdAt: new Date().toISOString(),
            balance: 0
        };

        // Store account in database or memory
        if (db.isDatabaseAvailable()) {
            try {
                await db.createAccount({
                    documentNumber: account.documentNumber,
                    accountNumber: account.accountNumber,
                    accountType: account.accountType,
                    fullName: account.fullName,
                    email: account.email,
                    phone: account.phone,
                    balance: account.balance,
                    faceDescriptor: verifiedData.faceDescriptor
                });
                console.log('Account created in database:', accountNumber);
            } catch (dbError) {
                console.error('Database error creating account:', dbError);
                return res.status(500).json({ success: false, error: 'Failed to create account' });
            }
        } else {
            // In-memory fallback
            accountsStore.set(email.toLowerCase(), account);
            console.log('Account created in memory:', accountNumber);
        }

        console.log('Total accounts:', db.isDatabaseAvailable() ? 'in database' : accountsStore.size);

        res.json({
            success: true,
            account: account
        });

    } catch (error) {
        console.error('Account creation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sign-in endpoint - verify digital ID and extract portrait + document number
app.post('/signin-verify', async (req, res) => {
    try {
        const { credentials, nonce } = req.body;
        
        console.log('Sign-in verification request for nonce:', nonce);

        if (!nonce || !sessionStore.has(nonce)) {
            return res.status(400).json({ success: false, error: 'Invalid or expired nonce' });
        }

        const jwk = sessionStore.get(nonce);
        sessionStore.delete(nonce);

        // Use X-Forwarded-Proto for Railway/proxied environments
        const protocol = req.get('X-Forwarded-Proto') || req.protocol;
        const origin = process.env.ORIGIN || `${protocol}://${req.get('host')}`;
        console.log('Sign-in: Processing credentials with origin:', origin);
        const result = await processCredentials(credentials, {
            nonce,
            jwk,
            origin
        });

        console.log('Sign-in verification result:', {
            valid: result.valid,
            trusted: result.trusted,
            document_number: result.claims.document_number
        });

        // Check document expiry
        if (result.claims.expiry_date) {
            const expiryDate = new Date(result.claims.expiry_date);
            const today = new Date();
            if (expiryDate < today) {
                return res.json({
                    success: false,
                    error: 'Your document has expired. Please renew your ID before signing in.'
                });
            }
        }

        // Extract portrait and document number for biometric verification
        const portrait = result.claims.portrait;
        const documentNumber = result.claims.document_number;
        const claims = result.claims;

        if (!portrait) {
            return res.json({
                success: false,
                error: 'No portrait found in digital ID. Cannot proceed with facial verification.'
            });
        }

        if (!documentNumber) {
            return res.json({
                success: false,
                error: 'No document number found in digital ID.'
            });
        }

        // Convert portrait to base64 for client-side face recognition
        let portraitBase64;
        if (typeof portrait === 'object' && !portrait.startsWith) {
            const bytes = new Uint8Array(Object.values(portrait));
            const base64 = Buffer.from(bytes).toString('base64');
            portraitBase64 = `data:image/jpeg;base64,${base64}`;
        } else {
            portraitBase64 = portrait;
        }

        // Store document number temporarily for biometric verification
        const verificationToken = generateNonce();
        sessionStore.set(verificationToken, {
            documentNumber: documentNumber,
            claims: claims,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            verificationToken: verificationToken,
            portraitData: portraitBase64,
            claims: {
                given_name: claims.given_name,
                family_name: claims.family_name,
                document_number: documentNumber
            }
        });

    } catch (error) {
        console.error('Sign-in verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Biometric verification endpoint - compare faces using face-api
// Biometric verification endpoint (receives face descriptors from client)
app.post('/biometric-verify', async (req, res) => {
    try {
        const { portraitDescriptor, capturedDescriptor, verificationToken } = req.body;

        if (!portraitDescriptor || !capturedDescriptor || !verificationToken) {
            return res.status(400).json({ success: false, error: 'Missing required data' });
        }

        if (!sessionStore.has(verificationToken)) {
            return res.json({
                success: false,
                error: 'Invalid or expired verification token. Please start over.'
            });
        }

        const verificationData = sessionStore.get(verificationToken);
        const { documentNumber } = verificationData;

        // Clean up verification token
        sessionStore.delete(verificationToken);

        console.log('Biometric verification for document:', documentNumber);

        // Compare face descriptors using euclidean distance
        const descriptor1 = new Float32Array(portraitDescriptor);
        const descriptor2 = new Float32Array(capturedDescriptor);
        
        // Calculate euclidean distance
        let sumSquares = 0;
        for (let i = 0; i < descriptor1.length; i++) {
            const diff = descriptor1[i] - descriptor2[i];
            sumSquares += diff * diff;
        }
        const distance = Math.sqrt(sumSquares);
        
        console.log('Face comparison distance:', distance);

        // Threshold: typically 0.6 for a match (lower = more similar)
        const threshold = 0.6;
        const isMatch = distance < threshold;

        if (!isMatch) {
            return res.json({
                success: false,
                error: `Face verification failed (distance: ${distance.toFixed(3)}). The captured photo does not match the photo on your digital ID.`
            });
        }

        console.log('✓ Face match successful');

        // Look up user by document number
        let user = null;
        
        if (db.isDatabaseAvailable()) {
            user = await db.getUserByDocumentNumber(documentNumber);
        }

        if (!user) {
            return res.json({
                success: false,
                error: 'No account found with this digital ID. Please register for an account first.'
            });
        }

        console.log('✓ User found:', user.username);

        // Create session token for legacy flow (non-OIDC)
        const sessionToken = generateNonce();
        
        // Store session - using username as identifier
        sessionStore.set(sessionToken, {
            userId: user.id,
            username: user.username,
            documentNumber: user.document_number,
            email: user.email,
            fullName: `${user.given_name} ${user.family_name}`,
            loginTime: new Date().toISOString(),
            expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour
        });

        res.json({
            success: true,
            sessionToken: sessionToken,
            user: {
                username: user.username,
                email: user.email,
                name: `${user.given_name} ${user.family_name}`
            }
        });

    } catch (error) {
        console.error('Biometric verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get account data (for home page)
app.post('/get-account', async (req, res) => {
    try {
        const { sessionToken } = req.body;

        if (!sessionToken) {
            return res.status(401).json({ success: false, error: 'No session token provided' });
        }

        let session = null;
        let account = null;

        if (db.isDatabaseAvailable()) {
            session = await db.getSession(sessionToken);
            if (session) {
                const dbAccount = await db.getAccountByDocumentNumber(session.document_number);
                if (dbAccount) {
                    account = {
                        accountNumber: dbAccount.account_number,
                        accountType: dbAccount.account_type,
                        fullName: dbAccount.full_name,
                        email: dbAccount.email,
                        phone: dbAccount.phone,
                        balance: parseFloat(dbAccount.balance),
                        createdAt: dbAccount.created_at
                    };
                }
            }
        } else {
            // In-memory fallback
            session = sessionTokenStore.get(sessionToken);
            if (session) {
                account = accountsStore.get(session.email);
            }
        }

        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session' });
        }

        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        res.json({
            success: true,
            account: {
                accountNumber: account.accountNumber,
                accountType: account.accountType,
                fullName: account.fullName,
                email: account.email,
                phone: account.phone,
                balance: account.balance || 0,
                createdAt: account.createdAt
            }
        });

    } catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout endpoint
// OIDC Logout Endpoint (GET) - for Keycloak backchannel logout
app.get('/logout', async (req, res) => {
    try {
        const { post_logout_redirect_uri, state, id_token_hint } = req.query;

        console.log('OIDC logout request received:', { 
            post_logout_redirect_uri, 
            state,
            id_token_hint: id_token_hint ? 'present' : 'absent'
        });

        // If there's a post_logout_redirect_uri, redirect to it
        if (post_logout_redirect_uri) {
            const redirectUrl = new URL(post_logout_redirect_uri);
            if (state) {
                redirectUrl.searchParams.set('state', state);
            }
            console.log('Redirecting to:', redirectUrl.toString());
            return res.redirect(redirectUrl.toString());
        }

        // Otherwise just return success
        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error) {
        console.error('OIDC logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Legacy logout endpoint (POST) - for direct API calls
app.post('/logout', async (req, res) => {
    try {
        const { sessionToken } = req.body;

        if (sessionToken) {
            if (db.isDatabaseAvailable()) {
                await db.deleteSession(sessionToken);
            } else {
                if (sessionTokenStore.has(sessionToken)) {
                    sessionTokenStore.delete(sessionToken);
                }
            }
        }

        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// ADMIN PORTAL API ENDPOINTS
// ==========================================

/**
 * Admin authentication middleware
 */
async function authenticateAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No admin token provided' });
        }
        
        const token = authHeader.substring(7);
        
        // Verify JWT token
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'orchestrator-secret');
        const { payload } = await jwtVerify(token, secret);
        
        // Check if it's an admin token
        if (payload.type !== 'admin') {
            return res.status(403).json({ error: 'Not an admin token' });
        }
        
        // Get admin user
        const admin = await db.getAdminUserById(payload.sub);
        if (!admin || !admin.is_active) {
            return res.status(403).json({ error: 'Admin account not found or inactive' });
        }
        
        req.admin = admin;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        res.status(401).json({ error: 'Invalid admin token' });
    }
}

/**
 * POST /admin/login - Admin login
 */
app.post('/admin/login', express.json(), async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        // Get admin user
        const admin = await db.getAdminUserByUsername(username);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Update last login
        await db.updateAdminLastLogin(admin.id);
        
        // Generate JWT token
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'orchestrator-secret');
        const token = await new SignJWT({
            sub: admin.id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            type: 'admin'
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('8h') // 8 hour session
            .sign(secret);
        
        res.json({
            success: true,
            token,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                full_name: admin.full_name,
                role: admin.role
            }
        });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /admin/me - Get current admin user info
 */
app.get('/admin/me', authenticateAdmin, async (req, res) => {
    res.json({
        id: req.admin.id,
        username: req.admin.username,
        email: req.admin.email,
        full_name: req.admin.full_name,
        role: req.admin.role,
        last_login_at: req.admin.last_login_at
    });
});

/**
 * POST /admin/refresh - Refresh admin token
 */
app.post('/admin/refresh', authenticateAdmin, async (req, res) => {
    try {
        // Generate new JWT token with extended expiration
        const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'orchestrator-secret');
        const token = await new SignJWT({
            sub: req.admin.id,
            username: req.admin.username,
            email: req.admin.email,
            role: req.admin.role,
            type: 'admin'
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime('8h') // 8 hour session
            .sign(secret);
        
        res.json({
            success: true,
            token,
            admin: {
                id: req.admin.id,
                username: req.admin.username,
                email: req.admin.email,
                full_name: req.admin.full_name,
                role: req.admin.role
            }
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * GET /admin/rules - List all rules
 */
app.get('/admin/rules', authenticateAdmin, async (req, res) => {
    try {
        const filters = {};
        
        if (req.query.is_active !== undefined) {
            filters.is_active = req.query.is_active === 'true';
        }
        
        if (req.query.limit) {
            filters.limit = parseInt(req.query.limit);
        }
        
        const rules = await db.getRules(filters);
        res.json({ rules });
    } catch (error) {
        console.error('Error getting rules:', error);
        res.status(500).json({ error: 'Failed to get rules' });
    }
});

/**
 * GET /admin/rules/:id - Get single rule
 */
app.get('/admin/rules/:id', authenticateAdmin, async (req, res) => {
    try {
        const rule = await db.getRuleById(req.params.id);
        if (!rule) {
            return res.status(404).json({ error: 'Rule not found' });
        }
        res.json({ rule });
    } catch (error) {
        console.error('Error getting rule:', error);
        res.status(500).json({ error: 'Failed to get rule' });
    }
});

/**
 * POST /admin/rules - Create new rule
 */
app.post('/admin/rules', authenticateAdmin, express.json(), async (req, res) => {
    try {
        const { name, description, conditions, actions, priority, is_active } = req.body;
        
        if (!name || !conditions || !actions) {
            return res.status(400).json({ error: 'Name, conditions, and actions are required' });
        }
        
        const rule = await db.createRule({
            name,
            description,
            conditions,
            actions,
            priority: priority || 0,
            is_active: is_active !== false,
            created_by: req.admin.id
        });
        
        res.json({ success: true, rule });
    } catch (error) {
        console.error('Error creating rule:', error);
        res.status(500).json({ error: 'Failed to create rule' });
    }
});

/**
 * PUT /admin/rules/:id - Update rule
 */
app.put('/admin/rules/:id', authenticateAdmin, express.json(), async (req, res) => {
    try {
        const updates = {};
        
        if (req.body.name !== undefined) updates.name = req.body.name;
        if (req.body.description !== undefined) updates.description = req.body.description;
        if (req.body.conditions !== undefined) updates.conditions = req.body.conditions;
        if (req.body.actions !== undefined) updates.actions = req.body.actions;
        if (req.body.priority !== undefined) updates.priority = req.body.priority;
        if (req.body.is_active !== undefined) updates.is_active = req.body.is_active;
        
        const rule = await db.updateRule(req.params.id, updates);
        res.json({ success: true, rule });
    } catch (error) {
        console.error('Error updating rule:', error);
        res.status(500).json({ error: 'Failed to update rule' });
    }
});

/**
 * DELETE /admin/rules/:id - Delete rule
 */
app.delete('/admin/rules/:id', authenticateAdmin, async (req, res) => {
    try {
        await db.deleteRule(req.params.id);
        res.json({ success: true, message: 'Rule deleted' });
    } catch (error) {
        console.error('Error deleting rule:', error);
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});

/**
 * POST /admin/test-rule - Test rules against a context
 */
app.post('/admin/test-rule', authenticateAdmin, express.json(), async (req, res) => {
    try {
        const { context } = req.body;

        if (!context) {
            return res.status(400).json({ error: 'Context is required' });
        }

        // Evaluate rules with the provided context
        const result = await rulesEngine.evaluateRules(context);

        res.json({
            allowed: result.allowed,
            blockReason: result.blockReason,
            allowedMethods: result.allowedMethods,
            deniedMethods: result.deniedMethods,
            appliedRules: result.rulesApplied.map(rule => ({
                id: rule.id,
                name: rule.name,
                priority: rule.priority
            }))
        });
    } catch (error) {
        console.error('Error testing rules:', error);
        res.status(500).json({ error: 'Failed to test rules' });
    }
});

/**
 * GET /admin/activity - Get activity logs
 */
app.get('/admin/activity', authenticateAdmin, async (req, res) => {
    try {
        const filters = {};
        
        if (req.query.user_id) filters.user_id = req.query.user_id;
        if (req.query.username) filters.username = req.query.username;
        if (req.query.auth_method) filters.auth_method = req.query.auth_method;
        if (req.query.success !== undefined) filters.success = req.query.success === 'true';
        if (req.query.ip_address) filters.ip_address = req.query.ip_address;
        if (req.query.from_date) filters.from_date = new Date(req.query.from_date);
        if (req.query.to_date) {
            // Add 1 day minus 1ms to include the entire end date
            const toDate = new Date(req.query.to_date);
            toDate.setDate(toDate.getDate() + 1);
            toDate.setMilliseconds(toDate.getMilliseconds() - 1);
            filters.to_date = toDate;
        }
        if (req.query.limit) filters.limit = parseInt(req.query.limit);
        if (req.query.offset) filters.offset = parseInt(req.query.offset);
        
        console.log('[ADMIN] Activity query filters:', JSON.stringify(filters, null, 2));
        
        const activity = await db.getActivity(filters);
        
        console.log('[ADMIN] Activity results:', activity.length, 'records');
        
        res.json({ success: true, activity, count: activity.length });
    } catch (error) {
        console.error('Error getting activity:', error);
        res.status(500).json({ error: 'Failed to get activity' });
    }
});

/**
 * GET /admin/analytics - Get activity analytics/stats
 */
app.get('/admin/analytics', authenticateAdmin, async (req, res) => {
    try {
        const filters = {};
        
        if (req.query.from_date) {
            filters.from_date = new Date(req.query.from_date);
        }
        
        const stats = await db.getActivityStats(filters);
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting analytics:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

/**
 * GET /admin/users - Get list of customer users
 */
app.get('/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const pool = db.getPool();
        if (!pool) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const search = req.query.search || '';
        const verified = req.query.verified; // 'true', 'false', or undefined for all
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        const offset = req.query.offset ? parseInt(req.query.offset) : 0;
        
        // Build query
        let query = 'SELECT id, username, email, phone, given_name, family_name, id_verified, id_verified_at, enabled, created_at FROM users WHERE 1=1';
        const params = [];
        let paramCount = 0;
        
        // Search filter
        if (search) {
            paramCount++;
            query += ` AND (username ILIKE $${paramCount} OR email ILIKE $${paramCount} OR given_name ILIKE $${paramCount} OR family_name ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        
        // Verification filter
        if (verified !== undefined) {
            paramCount++;
            query += ` AND id_verified = $${paramCount}`;
            params.push(verified === 'true');
        }
        
        // Order and pagination
        query += ' ORDER BY created_at DESC';
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(limit);
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(offset);
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM users WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;
        
        if (search) {
            countParamCount++;
            countQuery += ` AND (username ILIKE $${countParamCount} OR email ILIKE $${countParamCount} OR given_name ILIKE $${countParamCount} OR family_name ILIKE $${countParamCount})`;
            countParams.push(`%${search}%`);
        }
        
        if (verified !== undefined) {
            countParamCount++;
            countQuery += ` AND id_verified = $${countParamCount}`;
            countParams.push(verified === 'true');
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);
        
        res.json({
            success: true,
            users: result.rows,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            }
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

/**
 * GET /admin/users/:userId - Get detailed user information
 */
app.get('/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
        const pool = db.getPool();
        if (!pool) {
            return res.status(503).json({ error: 'Database not available' });
        }
        
        const user = await db.getUserById(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get user's passkeys
        const passkeys = await db.getUserPasskeyCredentials(req.params.userId);
        
        // Get user's recent activity (last 50)
        const activity = await db.getActivity({
            user_id: req.params.userId,
            limit: 50
        });
        
        // Get last successful login from activity
        const lastLogin = activity.find(a => a.success)?.timestamp || null;
        
        // Get auth method stats for this user
        const statsQuery = `
            SELECT 
                auth_method,
                COUNT(*) as total,
                SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful
            FROM auth_activity
            WHERE user_id = $1
            GROUP BY auth_method
        `;
        const statsResult = await pool.query(statsQuery, [req.params.userId]);
        
        res.json({
            success: true,
            user: {
                ...user,
                // Add last login from activity
                last_login_at: lastLogin,
                // Remove sensitive data
                password_hash: undefined,
                face_descriptor: undefined
            },
            passkeys: passkeys.map((pk, idx) => ({
                id: pk.id,
                credential_id: pk.credential_id,
                friendly_name: pk.device_type ? 
                    `${pk.device_type.charAt(0).toUpperCase() + pk.device_type.slice(1)} Passkey` : 
                    `Passkey ${idx + 1}`,
                device_type: pk.device_type,
                created_at: pk.created_at,
                last_used_at: pk.last_used_at
            })),
            activity: activity,
            stats: statsResult.rows
        });
    } catch (error) {
        console.error('Error getting user details:', error);
        res.status(500).json({ error: 'Failed to get user details' });
    }
});

/**
 * GET /admin/users/:userId/activity - Get activity for specific user
 */
app.get('/admin/users/:userId/activity', authenticateAdmin, async (req, res) => {
    try {
        const filters = {
            user_id: req.params.userId,
            limit: req.query.limit ? parseInt(req.query.limit) : 50
        };
        
        if (req.query.from_date) filters.from_date = new Date(req.query.from_date);
        if (req.query.to_date) filters.to_date = new Date(req.query.to_date);
        
        const activity = await db.getActivity(filters);
        res.json({ success: true, activity, count: activity.length });
    } catch (error) {
        console.error('Error getting user activity:', error);
        res.status(500).json({ error: 'Failed to get user activity' });
    }
});

/**
 * POST /admin/test-rule - Test a rule against sample context
 */
app.post('/admin/test-rule', authenticateAdmin, express.json(), async (req, res) => {
    try {
        const { rule, context } = req.body;
        
        if (!rule || !context) {
            return res.status(400).json({ error: 'Rule and context required' });
        }
        
        // Create a temporary rule structure
        const testRules = [{ ...rule, id: 'test', priority: 0 }];
        
        // Temporarily replace getRules to return our test rule
        const originalGetRules = db.getRules;
        db.getRules = async () => testRules;
        
        // Evaluate the rule
        const result = await rulesEngine.evaluateRules(context);
        
        // Restore original function
        db.getRules = originalGetRules;
        
        res.json({ success: true, result });
    } catch (error) {
        console.error('Error testing rule:', error);
        res.status(500).json({ error: 'Failed to test rule' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    setInterval(() => {
        // Keep alive
    }, 10000);
});
