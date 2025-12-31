import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
const payloadPath = path.join(process.cwd(), 'scripts', 'keycloak-tx-partial-import.json');

if (!KEYCLOAK_URL || !REALM || !ADMIN_CLIENT_ID || !ADMIN_CLIENT_SECRET) {
  console.error('Missing Keycloak admin env vars');
  process.exit(2);
}

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ADMIN_CLIENT_ID);
  params.append('client_secret', ADMIN_CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Token error: ' + r.status + ' ' + t);
  }
  const j = await r.json();
  return j.access_token;
}

async function partialImport() {
  const token = await getAdminToken();
  console.log('Obtained admin token (len):', token.length);

  const payload = fs.readFileSync(payloadPath, 'utf8');
  const endpoint = `${KEYCLOAK_URL.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(REALM)}/partialImport`;
  console.log('POSTing partial import to', endpoint);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: payload
  });

  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response body:', text.slice(0, 4000));
  if (!res.ok) {
    process.exit(1);
  }
}

partialImport().catch(err => { console.error('Partial import failed:', err.message); process.exit(1); });
