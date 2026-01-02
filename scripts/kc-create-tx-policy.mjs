import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

if (!KEYCLOAK_URL || !REALM || !ADMIN_CLIENT_ID || !ADMIN_CLIENT_SECRET) {
  console.error('Missing Keycloak admin env vars');
  process.exit(2);
}

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ADMIN_CLIENT_ID);
  params.append('client_secret', ADMIN_CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', body: params });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Token error: ' + r.status + ' ' + t);
  }
  const j = await r.json();
  return j.access_token;
}

async function createPolicy() {
  const token = await getAdminToken();
  console.log('Obtained admin token (len):', token.length);

  const endpoint = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}/client-policies/policies`;

  // Policy payload - best-effort for common Keycloak versions
  const policy = {
    name: 'allow-trustgate-token-exchange',
    description: 'Allow trustgate-service to perform token exchange from trustgate issuer',
    enabled: true,
    // 'decisionStrategy' or 'logic' fields may be required depending on KC version; try minimal
    conditions: [
      {
        providerId: 'AuthenticatedClientCondition',
        config: {
          clientIds: ['trustgate-service']
        }
      },
      {
        providerId: 'TokenExchangeCondition',
        config: {
          // Some KC versions expect 'issuer' or 'iss' or 'subjectIssuer'
          issuer: process.env.TRUSTGATE_ISS || `https://bank-production-37ea.up.railway.app`
        }
      }
    ]
  };

  console.log('Posting policy to', endpoint);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(policy)
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response body:', text.slice(0, 2000));

  if (!res.ok) {
    throw new Error('Failed to create policy: ' + res.status + ' ' + text);
  }

  console.log('Policy creation response:', text);
}

(async () => {
  try {
    await createPolicy();
    console.log('Policy create attempt finished');
  } catch (err) {
    console.error('Error creating policy:', err.message);
    process.exit(1);
  }
})();
