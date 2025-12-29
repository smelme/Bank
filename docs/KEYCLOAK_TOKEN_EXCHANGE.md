# Keycloak Token Exchange — remaining setup & testing

This document covers the remaining steps you asked to complete in Keycloak after creating the `orchestrator-exchange` client:

- Enable/verify token-exchange permissions (if required by your Keycloak version)
- Add protocol mappers to include desired claims
- Test the token-exchange flow using a signed assertion

Notes:
- The repo includes a dev JWKS endpoint at `/.well-known/jwks.json` and discovery at `/.well-known/openid-configuration` when `NODE_ENV=development`.
- You generated JWKS at `./secrets/orchestrator-jwks.json` and the server serves it at `http://localhost:3001/.well-known/jwks.json` once running.

---

## 1) Token Exchange permissions

Most Keycloak deployments will accept token-exchange requests if:

- The subject_token issuer is trusted (you added an Identity Provider pointing at your Orchestrator discovery or imported the public key), and
- The requesting client authenticates successfully (client_id + client_secret) and has the required scopes/roles.

If Keycloak blocks token-exchange, configure client policies or token-exchange settings:

### Admin Console (UI)

1. Go to `Clients` → select the target client (usually `orchestrator-exchange`).
2. Look for `Client Policies` / `Token Exchange` (location varies by KC version).
3. Add a rule/policy allowing this client to exchange tokens from the Orchestrator issuer. If your Keycloak has a `Token Exchange` tab, add the allowed audience/issuer.

### Admin REST API (example)

If your Keycloak version exposes token-exchange policies via API, use the Admin token and the policy endpoints. The exact payload varies by Keycloak version; consult your Keycloak docs. If you want, provide your KC version and I will generate the exact payload.

---

## 2) Protocol mappers (add desired claims)

Add mappers to `orchestrator-exchange` (or to the client which will receive the tokens) to include claims like `preferred_username`, `email`, or `roles`.

UI steps:

1. Clients → select `orchestrator-exchange` (or the client that will receive exchanged tokens).
2. Mappers → Create mapper → choose mapper type:
   - `User Attribute` → to map user attributes
   - `Role list` → to include roles
   - `Hardcoded claim` → to add a static claim
3. Map to claim name (e.g. `preferred_username`) and save.

Example: Add `preferred_username` mapper

- Name: preferred_username
- Mapper Type: User Property (or User Attribute)
- Property: username
- Token Claim Name: preferred_username
- Add to ID token / Access token: checked

---

## 3) Test token-exchange locally

You can test with the helper script in the repo.

1. Configure env (PowerShell example):

```powershell
$env:NODE_ENV='development'
$env:ENABLE_TOKEN_EXCHANGE='true'
$env:ORCHESTRATOR_PRIVATE_KEY_PATH='./orchestrator-private.pkcs8.pem'
$env:ORCHESTRATOR_ISS='http://localhost:3001'
$env:ORCHESTRATOR_ASSERTION_LIFETIME='30'
$env:KEYCLOAK_TOKEN_URL='https://<KEYCLOAK_HOST>/realms/<REALM>/protocol/openid-connect/token'
$env:KEYCLOAK_CLIENT_ID='orchestrator-exchange'
$env:KEYCLOAK_CLIENT_SECRET='<CLIENT_SECRET_FROM_KEYCLOAK>'
# Optional test user id/name
$env:ORCHESTRATOR_TEST_USER_ID='user_test_1'
$env:ORCHESTRATOR_TEST_USERNAME='test.user'
node scripts/test-token-exchange.mjs
```

2. The script will:
   - sign a short-lived assertion using the configured private key
   - attempt to POST the assertion to `KEYCLOAK_TOKEN_URL` using client credentials
   - print the token response (or error)

If Keycloak returns an error, check the `error_description` for details (signature invalid, issuer mismatch, or client auth failure).

---

## 4) Manual curl test (if you have a signed assertion)

If you produced a signed JWT yourself (or via Orchestrator), test directly:

```bash
curl -X POST "https://<KEYCLOAK_HOST>/realms/<REALM>/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
  -d "subject_token=<SIGNED_JWT>" \
  -d 'subject_token_type=urn:ietf:params:oauth:token-type:jwt' \
  -d 'client_id=orchestrator-exchange' \
  -d 'client_secret=<CLIENT_SECRET>'
```

---

## 5) Troubleshooting checklist

- `issuer` mismatch: ensure `iss` claim in the JWT equals Orchestrator issuer set in Keycloak Identity Provider.
- `kid` mismatch: ensure JWT header `kid` matches a key in JWKS.
- Keycloak cannot reach JWKS: if KC is remote, use a tunnel or upload PEM.
- Client auth errors: ensure `client_id`/`client_secret` match the `orchestrator-exchange` client's credentials.

If you want, I can generate the exact Admin REST payloads to create mappers or policies for your Keycloak version — tell me the version and I’ll produce copy/paste curl commands.
