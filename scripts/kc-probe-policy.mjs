import dotenv from 'dotenv';
dotenv.config();
const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

if (!KEYCLOAK_URL || !REALM || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing KEYCLOAK env vars');
  process.exit(2);
}

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', body: params });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Token error: ' + r.status + ' ' + t);
  }
  const j = await r.json();
  return j.access_token;
}

async function probe() {
  try {
    const token = await getAdminToken();
    console.log('Obtained admin token (len):', token.length);
    const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
    const endpoints = [
      base + '/client-policies/policies',
      base + '/client-policies/config',
      base + '/client-policies',
      base + '/authentication/flows',
      base + '/authentication',
      base + '/components',
      base + '/clients',
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, { headers: { Authorization: 'Bearer ' + token } });
        console.log(`${res.status} GET ${ep}`);
        if (res.ok) {
          const body = await res.text();
          console.log('-> response preview:', body.slice(0, 800));
        } else {
          const err = await res.text();
          console.log('-> error body preview:', err.slice(0, 800));
        }
      } catch (err) {
        console.log('ERR GET', ep, err.message);
      }
    }
  } catch (err) {
    console.error('Probe failed:', err.message);
  }
}

probe();
