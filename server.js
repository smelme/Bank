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
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    // Load our own private key and convert to public key for verification
    const privateKey = await loadPrivateKey();
    const publicKey = await crypto.subtle.exportKey('jwk', await crypto.subtle.importKey(
      'jwk',
      await exportJWK(privateKey),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      true,
      ['sign']
    ));
    
    // Actually, let's just use the JWKS endpoint
    const orchestratorJWKS = createRemoteJWKSet(
      new URL('https://bank-production-37ea.up.railway.app/.well-known/jwks.json')
    );
    
    const { payload } = await jwtVerify(token, orchestratorJWKS, {
      issuer: process.env.ORCHESTRATOR_ISS || 'https://bank-production-37ea.up.railway.app'
    });
    
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
    
    // Check if user already exists in Orchestrator DB
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        error: 'Username already exists' 
      });
    }
    
    // Create user in Keycloak first
    let keycloakUserId;
    try {
      keycloakUserId = await keycloakAdmin.createKeycloakUser({
        username,
        email,
        firstName: givenName,
        lastName: familyName,
        documentNumber,
        attributes: {
          phone: phone ? [phone] : [],
          document_type: documentType ? [documentType] : [],
          birth_date: birthDate ? [birthDate] : []
        }
      });
      
      console.log(`Created Keycloak user: ${keycloakUserId}`);
    } catch (keycloakError) {
      console.error('Failed to create Keycloak user:', keycloakError);
      // In dev return the Keycloak error message to help debugging
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create user in authentication system',
        details: keycloakError.message || String(keycloakError)
      });
    }
    
    // Create user in Orchestrator DB (master)
    let user;
    try {
      user = await db.createUser({
        keycloakUserId,
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
      
      console.log(`Created user in Orchestrator DB: ${user.id}`);
    } catch (dbError) {
      // Rollback: Delete Keycloak user if DB creation fails
      console.error('Failed to create user in Orchestrator DB:', dbError.message);
      try {
        await keycloakAdmin.deleteKeycloakUser(keycloakUserId);
        console.log('Rolled back Keycloak user creation');
      } catch (rollbackError) {
        console.error('Failed to rollback Keycloak user:', rollbackError.message);
      }
      
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to create user in database' 
      });
    }
    
    // Log registration event
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
    
    // Delete used challenge
    await db.deleteChallenge(challengeRecord.challenge);
    
    // Log successful auth
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
    
    // Store auth code in database
    const stored = await db.storeAuthCode(authCode, user.id, clientId, redirectUri, scope, user, 600);
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

    // For simplicity, we'll show a simple HTML page that does WebAuthn
    // In production, you'd want a proper login UI
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Passkey Sign In</title>
  <script src="https://unpkg.com/@simplewebauthn/browser@9.0.1/dist/bundle/index.umd.min.js"></script>
  <script>
    async function signIn() {
      const username = document.getElementById('username').value;
      if (!username) {
        alert('Please enter username');
        return;
      }

      try {
        // Get authentication options
        const optionsResp = await fetch('/v1/passkeys/auth/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });

        if (!optionsResp.ok) {
          const error = await optionsResp.json();
          alert('Error: ' + error.error);
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
            username, 
            credential,
            client_id: ${JSON.stringify(client_id)},
            redirect_uri: ${JSON.stringify(redirect_uri)},
            scope: ${JSON.stringify(scope || 'openid profile email')},
            state: ${JSON.stringify(state || '')}
          })
        });

        if (!verifyResp.ok) {
          const error = await verifyResp.json();
          alert('Authentication failed: ' + error.error);
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
          alert('Authentication failed');
        }
      } catch (error) {
        console.error('Sign in error:', error);
        alert('Sign in failed: ' + error.message);
      }
    }

    window.signIn = signIn;
  </script>
</head>
<body>
  <h1>Passkey Sign In</h1>
  <input type="text" id="username" placeholder="Username" required>
  <button onclick="signIn()">Sign In with Passkey</button>
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

    // ID Token
    const idToken = await new SignJWT({
      sub: user.id,
      preferred_username: user.username,
      email: user.email,
      name: `${user.given_name} ${user.family_name}`,
      given_name: user.given_name,
      family_name: user.family_name,
      aud: client_id,
      iss: issuer
    })
    .setProtectedHeader({ alg: 'RS256', kid: 'orchestrator-1' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await loadPrivateKey());

    console.log('Generated ID token with issuer:', issuer, 'audience:', client_id, 'kid: orchestrator-1');

    // Access Token (simplified)
    const accessToken = await new SignJWT({
      sub: user.id,
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

app.get(['/', '/signin', '/register', '/home'], (req, res) => {
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

        // Look up account by document number
        let matchingAccount = null;
        
        if (db.isDatabaseAvailable()) {
            const dbAccount = await db.getAccountByDocumentNumber(documentNumber);
            if (dbAccount) {
                matchingAccount = {
                    documentNumber: dbAccount.document_number,
                    accountNumber: dbAccount.account_number,
                    accountType: dbAccount.account_type,
                    fullName: dbAccount.full_name,
                    email: dbAccount.email,
                    phone: dbAccount.phone,
                    balance: parseFloat(dbAccount.balance),
                    createdAt: dbAccount.created_at
                };
            }
        } else {
            // In-memory fallback
            for (const [email, account] of accountsStore.entries()) {
                if (account.documentNumber === documentNumber) {
                    matchingAccount = account;
                    break;
                }
            }
        }

        if (!matchingAccount) {
            return res.json({
                success: false,
                error: 'No account found with this digital ID. Please register for an account first.'
            });
        }

        console.log('✓ Account found:', matchingAccount.accountNumber);

        // Create session token
        const sessionToken = generateNonce();
        
        if (db.isDatabaseAvailable()) {
            await db.createSession(sessionToken, matchingAccount.documentNumber, 60);
        } else {
            // In-memory fallback
            sessionTokenStore.set(sessionToken, {
                accountNumber: matchingAccount.accountNumber,
                documentNumber: matchingAccount.documentNumber,
                email: matchingAccount.email,
                fullName: matchingAccount.fullName,
                loginTime: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            sessionToken: sessionToken,
            message: 'Sign-in successful'
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    setInterval(() => {
        // Keep alive
    }, 10000);
});
