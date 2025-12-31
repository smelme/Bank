import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
const POLICY_NAME = process.argv[2] || 'Token-Exchange';

if (!KEYCLOAK_URL || !REALM || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing KEYCLOAK env vars');
  process.exit(2);
}

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  if (!r.ok) {
    console.error('Token fetch failed', r.status, await r.text());
    process.exit(2);
  }
  const j = await r.json();
  return j.access_token;
}

async function getPolicyDetail() {
  const token = await getAdminToken();
  const endpoint = `${KEYCLOAK_URL.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(REALM)}/client-policies/policies/${encodeURIComponent(POLICY_NAME)}`;
  const r = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + token } });
  console.log('Status', r.status);
  const text = await r.text();
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch (e) {
    console.log('Non-JSON response:', text.slice(0, 2000));
  }
}

getPolicyDetail().catch(err => { console.error(err); process.exit(1); });
