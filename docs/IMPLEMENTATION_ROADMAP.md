# Implementation Roadmap - Option A (Keycloak + TrustGate)

This document outlines the phased implementation plan for building the complete auth system with Keycloak as IDP and TrustGate handling policy/passkeys/risk.

---

## Architecture Overview

```
┌─────────────┐      OIDC/PKCE       ┌──────────────┐
│   SPA/App   │◄───────────────────► │   Keycloak   │
└─────────────┘                       └──────┬───────┘
       │                                     │
       │ WebAuthn ceremony                  │ Policy decision
       │ (prototype phase)                  │ (via custom auth)
       │                                     │
       ▼                                     ▼
┌─────────────────────────────────────────────────┐
│            TrustGate Service                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Risk Engine  │  │   Passkeys   │            │
│  │   /decision  │  │  /register   │            │
│  │              │  │    /auth     │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  Biometric   │  │     OTP      │            │
│  │   verify     │  │   generate   │            │
│  └──────────────┘  └──────────────┘            │
│  ┌──────────────────────────────────┐          │
│  │      Audit/Event Store           │          │
│  └──────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: ✅ Keycloak Baseline (COMPLETE)

**Goal**: Get Keycloak running on Railway with basic OIDC working.

**Deliverables**:
- [x] Keycloak deployed on Railway with Postgres
- [x] Realm `tamange` created
- [x] SPA client configured (PKCE enabled)
- [x] Service client for TrustGate
- [x] Test user created

**Status**: ✅ Ready (see `KEYCLOAK_RAILWAY_SETUP.md`)

---

## Phase 2: Wire SPA to Keycloak OIDC

**Goal**: Replace current custom sign-in with Keycloak OIDC flow.

### 2.1 Install OIDC Client Library
```bash
npm install oidc-client-ts
```

### 2.2 Configure OIDC Settings
Create `public/core/oidc-config.js`:
```javascript
export const oidcConfig = {
  authority: 'https://<keycloak-railway-url>/realms/tamange',
  client_id: 'tamange-web',
  redirect_uri: window.location.origin + '/callback',
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  automaticSilentRenew: true,
  loadUserInfo: true,
};
```

### 2.3 Update Router for OIDC Callback
Add route in `router.js` to handle `/callback` redirect after Keycloak login.

### 2.4 Update Sign-In Page
Replace current form with redirect to Keycloak:
```javascript
// In signin.js controller
async mount() {
  const userManager = new UserManager(oidcConfig);
  await userManager.signinRedirect();
}
```

### 2.5 Backend JWT Validation
Update `server.js` to validate tokens from Keycloak:
```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://<keycloak-url>/realms/tamange/protocol/openid-connect/certs')
);

async function validateToken(token) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: 'https://<keycloak-url>/realms/tamange',
    audience: 'tamange-web'
  });
  return payload;
}
```

**Acceptance Criteria**:
- [ ] User can login via Keycloak
- [ ] Tokens validated on backend
- [ ] User info available in SPA
- [ ] Logout redirects properly

---

## Phase 3: Deploy TrustGate Service

**Goal**: Create the policy/passkeys/audit service.

### 3.1 Create Railway Service
1. New service: `trustgate`
2. New Postgres: `trustgate-db`

### 3.2 Initialize Node Project
```bash
mkdir trustgate
cd trustgate
npm init -y
npm install express cors pg jose @simplewebauthn/server @simplewebauthn/browser
```

### 3.3 Database Schema
Create migration for core tables:

**passkey_credentials**
```sql
CREATE TABLE passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  INDEX idx_user_id (user_id)
);
```

**auth_events**
```sql
CREATE TABLE auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(255),
  client_id VARCHAR(255),
  policy_id VARCHAR(100),
  method VARCHAR(50) NOT NULL,
  result VARCHAR(20) NOT NULL,
  reason TEXT,
  ip INET,
  user_agent TEXT,
  correlation_id VARCHAR(100),
  metadata JSONB,
  INDEX idx_user_id (user_id),
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_correlation (correlation_id)
);
```

**login_attempts**
```sql
CREATE TABLE login_attempts (
  user_id VARCHAR(255) PRIMARY KEY,
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  locked_until TIMESTAMP
);
```

### 3.4 Core Endpoints (Minimal Implementation)

**Risk Decision**
```javascript
// POST /v1/decision
app.post('/v1/decision', async (req, res) => {
  const { userId, clientId, ip, userAgent, attempts = 0 } = req.body;
  
  // Simple rule for now
  if (attempts >= 3) {
    return res.json({
      decision: 'DENY',
      reason: 'Too many failed attempts',
      ttlSeconds: 300
    });
  }
  
  // Check if passkey enrolled
  const hasPasskey = await checkPasskeyEnrolled(userId);
  
  if (!hasPasskey && clientId === 'high-sensitivity-app') {
    return res.json({
      decision: 'CHALLENGE',
      enroll: ['PASSKEY'],
      reason: 'High sensitivity app requires passkey'
    });
  }
  
  res.json({ decision: 'ALLOW' });
});
```

**Passkey Registration**
```javascript
// POST /v1/passkeys/register/options
app.post('/v1/passkeys/register/options', async (req, res) => {
  const { userId, username } = req.body;
  
  const options = await generateRegistrationOptions({
    rpName: 'Tamange Bank',
    rpID: process.env.WEBAUTHN_RP_ID,
    userID: userId,
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  
  // Store challenge temporarily (Redis or session)
  await storeChallenge(userId, options.challenge);
  
  res.json(options);
});

// POST /v1/passkeys/register/verify
app.post('/v1/passkeys/register/verify', async (req, res) => {
  const { userId, credential } = req.body;
  
  const expectedChallenge = await getChallenge(userId);
  
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: process.env.WEBAUTHN_ORIGIN,
    expectedRPID: process.env.WEBAUTHN_RP_ID,
  });
  
  if (verification.verified) {
    await storeCredential(userId, verification.registrationInfo);
    await logEvent(userId, 'PASSKEY_ENROLLED', 'success', req.ip, req.headers['user-agent']);
  }
  
  res.json({ verified: verification.verified });
});
```

**Authentication Challenge**
```javascript
// POST /v1/passkeys/auth/options
app.post('/v1/passkeys/auth/options', async (req, res) => {
  const { userId } = req.body;
  
  const userCredentials = await getUserCredentials(userId);
  
  const options = await generateAuthenticationOptions({
    rpID: process.env.WEBAUTHN_RP_ID,
    allowCredentials: userCredentials.map(cred => ({
      id: cred.credential_id,
      type: 'public-key',
      transports: cred.transports,
    })),
    userVerification: 'preferred',
  });
  
  await storeChallenge(userId, options.challenge);
  
  res.json(options);
});

// POST /v1/passkeys/auth/verify
app.post('/v1/passkeys/auth/verify', async (req, res) => {
  const { userId, credential } = req.body;
  
  const expectedChallenge = await getChallenge(userId);
  const dbCredential = await getCredential(credential.id);
  
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge,
    expectedOrigin: process.env.WEBAUTHN_ORIGIN,
    expectedRPID: process.env.WEBAUTHN_RP_ID,
    authenticator: {
      credentialID: dbCredential.credential_id,
      credentialPublicKey: dbCredential.public_key,
      counter: dbCredential.counter,
    },
  });
  
  if (verification.verified) {
    await updateCounter(credential.id, verification.authenticationInfo.newCounter);
    await logEvent(userId, 'PASSKEY_AUTH', 'success', req.ip, req.headers['user-agent']);
  }
  
  res.json({ verified: verification.verified });
});
```

**Acceptance Criteria**:
- [ ] TrustGate deployed on Railway
- [ ] DB tables created
- [ ] Endpoints return valid responses
- [ ] Events logged to database

---

## Phase 4: Passkey Prototype in SPA

**Goal**: Enable passkey enrollment and login from your app UI (before Keycloak integration).

### 4.1 Add Passkey UI to App
Create `public/pages/passkey-setup.js`:
```javascript
async function registerPasskey() {
  const userId = getUserId(); // from session/token
  
  // Get options from TrustGate
  const optionsRes = await fetch('https://trustgate-url/v1/passkeys/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, username: getUsername() })
  });
  const options = await optionsRes.json();
  
  // Browser WebAuthn ceremony
  const credential = await navigator.credentials.create({
    publicKey: options
  });
  
  // Verify with TrustGate
  const verifyRes = await fetch('https://trustgate-url/v1/passkeys/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, credential })
  });
  
  const result = await verifyRes.json();
  if (result.verified) {
    showSuccess('Passkey enrolled!');
  }
}
```

### 4.2 Add Passkey Login Option
Similar flow for authentication challenge.

**Acceptance Criteria**:
- [ ] User can enroll passkey from app UI
- [ ] Passkey stored in TrustGate DB
- [ ] User can authenticate with passkey
- [ ] Events logged

---

## Phase 5: Build Keycloak Custom Authenticators

**Goal**: Move passkey ceremony into Keycloak login flow.

### 5.1 Create Java Provider Project
```bash
mkdir keycloak-providers
cd keycloak-providers
# Create Maven/Gradle project with Keycloak SPI dependencies
```

### 5.2 Implement Risk Decision Authenticator
Java class that:
1. Calls TrustGate `/v1/decision`
2. Based on response, sets required authentication method
3. Branches to appropriate next step

### 5.3 Implement Passkey Authenticator
Java class that:
1. Renders page with WebAuthn JS
2. Calls TrustGate for challenge/verify
3. Completes on success

### 5.4 Build Custom Keycloak Image
```dockerfile
FROM quay.io/keycloak/keycloak:26.0.7

COPY --chown=keycloak:keycloak providers/*.jar /opt/keycloak/providers/

RUN /opt/keycloak/bin/kc.sh build

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
```

### 5.5 Configure Authentication Flow
In Keycloak admin:
1. Create new browser flow
2. Add "Risk Decision" step
3. Add "Passkey" step
4. Make it the default

**Acceptance Criteria**:
- [ ] Custom authenticators deployed
- [ ] Keycloak calls TrustGate during login
- [ ] Passkey enforcement works
- [ ] User can't bypass rules

---

## Phase 6: Add Biometric + OTP Factors

**Goal**: Extend TrustGate to support multiple factors.

### 6.1 Biometric Integration
Use your existing biometric verification:
- Add endpoint: `POST /v1/biometric/verify`
- Keycloak authenticator calls it
- Log events

### 6.2 OTP Support
- Add TOTP generation/verification
- Add enrollment flow
- Add authenticator step

**Acceptance Criteria**:
- [ ] Risk engine can require biometric
- [ ] Risk engine can require OTP
- [ ] All factors logged

---

## Phase 7: Admin Portal

**Goal**: Build UI to view auth history and manage policies.

### 7.1 Add Admin Endpoints
```javascript
// GET /v1/admin/events
app.get('/v1/admin/events', async (req, res) => {
  const { userId, method, result, startDate, endDate } = req.query;
  
  const events = await db.query(`
    SELECT * FROM auth_events
    WHERE ($1::text IS NULL OR user_id = $1)
      AND ($2::text IS NULL OR method = $2)
      AND ($3::text IS NULL OR result = $3)
      AND timestamp >= COALESCE($4::timestamp, timestamp)
      AND timestamp <= COALESCE($5::timestamp, timestamp)
    ORDER BY timestamp DESC
    LIMIT 100
  `, [userId, method, result, startDate, endDate]);
  
  res.json(events.rows);
});
```

### 7.2 Build Admin UI Pages
- User search
- Event timeline
- Filter by method/result/IP/client
- Export CSV

**Acceptance Criteria**:
- [ ] Can view all auth events
- [ ] Can filter by user/method/result
- [ ] Can see IP/UA/timestamp
- [ ] Can identify locked users

---

## Phase 8: Production Hardening

### 8.1 Custom Domain Migration
- Add `id.yourdomain.com` for Keycloak
- Add `auth.yourdomain.com` for TrustGate
- Update all configs
- Re-enroll passkeys

### 8.2 Security Enhancements
- [ ] Rate limiting on all endpoints
- [ ] CSRF protection
- [ ] Secrets in Railway encrypted env vars
- [ ] Backup strategy for DBs

### 8.3 Monitoring
- [ ] Health check endpoints
- [ ] Error alerting
- [ ] Performance metrics

---

## Summary Timeline

| Phase | Description | Estimated Effort |
|-------|-------------|-----------------|
| 1 | Keycloak baseline | ✅ Complete |
| 2 | SPA OIDC integration | 1-2 days |
| 3 | TrustGate service | 2-3 days |
| 4 | Passkey prototype | 1-2 days |
| 5 | Keycloak plugins | 3-4 days |
| 6 | Multi-factor support | 2-3 days |
| 7 | Admin portal | 2-3 days |
| 8 | Production hardening | 1-2 days |

**Total**: ~2-3 weeks for MVP, ~4 weeks for production-ready

---

## Next Immediate Steps

1. **Follow Phase 2**: Wire your SPA to Keycloak OIDC
2. Once login works, proceed to Phase 3 (TrustGate)
3. Build passkey prototype before adding Keycloak plugins

Let me know when Phase 1 (Keycloak) is deployed and verified, and I'll help with Phase 2 OIDC integration!
