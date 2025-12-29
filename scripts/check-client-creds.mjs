import 'dotenv/config';

const tokenUrl = process.env.KEYCLOAK_TOKEN_URL || `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}/protocol/openid-connect/token`;
const params = new URLSearchParams();
params.append('grant_type', 'client_credentials');
params.append('client_id', process.env.KEYCLOAK_CLIENT_ID);
params.append('client_secret', process.env.KEYCLOAK_CLIENT_SECRET);

console.log('Token URL:', tokenUrl);

const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
console.log('Status:', r.status);
try {
  const j = await r.json();
  console.log(JSON.stringify(j, null, 2));
} catch (e) {
  console.log('Non-JSON response');
  console.log(await r.text());
}
