import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { importPKCS8, SignJWT } from 'jose';

// Simple token-exchange helper for Orchestrator -> Keycloak
// Env variables used:
// - ORCHESTRATOR_PRIVATE_KEY or ORCHESTRATOR_PRIVATE_KEY_PATH (PEM PKCS8)
// - ORCHESTRATOR_ISS (issuer, default: 'orchestrator')
// - ORCHESTRATOR_ASSERTION_LIFETIME (seconds, default: 30)
// - KEYCLOAK_TOKEN_URL (full token endpoint URL)
// - KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET

async function loadPrivateKey() {
  const pem = process.env.ORCHESTRATOR_PRIVATE_KEY || (process.env.ORCHESTRATOR_PRIVATE_KEY_PATH ? fs.readFileSync(process.env.ORCHESTRATOR_PRIVATE_KEY_PATH, 'utf8') : null);
  if (!pem) throw new Error('Orchestrator private key not configured (ORCHESTRATOR_PRIVATE_KEY or ORCHESTRATOR_PRIVATE_KEY_PATH)');
  // importPKCS8 expects PKCS8 PEM for RSA/EC private keys
  return importPKCS8(pem, 'RS256');
}

async function signAssertion(user) {
  const key = await loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const iss = process.env.ORCHESTRATOR_ISS || 'https://bank-production-37ea.up.railway.app';
  const aud = process.env.KEYCLOAK_CLIENT_ID || 'tamange-web';
  const lifetime = parseInt(process.env.ORCHESTRATOR_ASSERTION_LIFETIME || '30', 10);
  const azp = process.env.ORCHESTRATOR_CLIENT_ID || 'orchestrator-service';
  const scope = process.env.ORCHESTRATOR_SCOPE || 'profile email';

  // generate jti
  const jti = (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');

  // build a more access-token-like assertion so Keycloak can validate it when configured to trust
  const payload = {
    sub: user.id,
    preferred_username: user.username,
    azp,
    scope,
  };

  // attempt to read a kid from local JWKS if present to include in header
  let kid;
  try {
    const jwksPath = path.join(process.cwd(), 'secrets', 'orchestrator-jwks.json');
    if (fs.existsSync(jwksPath)) {
      const jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf8'));
      if (jwks.keys && jwks.keys.length) kid = jwks.keys[0].kid;
    }
  } catch (e) {
    // ignore
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  if (kid) header.kid = kid;

  const jwt = await new SignJWT(payload)
    .setProtectedHeader(header)
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(now + lifetime)
    .setJti(jti)
    .sign(key);

  return jwt;
}

async function exchangeWithKeycloak(assertion) {
  const tokenUrl = process.env.KEYCLOAK_TOKEN_URL;
  if (!tokenUrl) throw new Error('KEYCLOAK_TOKEN_URL not configured');

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
  params.append('subject_token', assertion);
  // Allow configuring the subject token type via env; default to access_token which Keycloak
  // often expects for token-exchange when accepting OAuth tokens as subjects.
  const subjectTokenType = process.env.SUBJECT_TOKEN_TYPE || 'urn:ietf:params:oauth:token-type:access_token';
  params.append('subject_token_type', subjectTokenType);
  // client credentials for the Keycloak client that will accept the token-exchange
  if (process.env.KEYCLOAK_CLIENT_ID) params.append('client_id', process.env.KEYCLOAK_CLIENT_ID);
  if (process.env.KEYCLOAK_CLIENT_SECRET) params.append('client_secret', process.env.KEYCLOAK_CLIENT_SECRET);

  const resp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = data ? JSON.stringify(data) : `status=${resp.status}`;
    throw new Error('Keycloak token exchange failed: ' + msg);
  }

  return data;
}

export { signAssertion, exchangeWithKeycloak, loadPrivateKey };
