import 'dotenv/config';

const tokenUrl = `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}/protocol/openid-connect/token`;
const params = new URLSearchParams();
params.append('grant_type', 'client_credentials');
params.append('client_id', process.env.KEYCLOAK_ADMIN_CLIENT_ID);
params.append('client_secret', process.env.KEYCLOAK_ADMIN_CLIENT_SECRET);

const t = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
if (!t.ok) {
  console.error('Failed to get admin token', t.status, await t.text());
  process.exit(2);
}
const tj = await t.json();
const token = tj.access_token;

const base = `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}`;

console.log('Checking identity providers...');
const ipResp = await fetch(base + '/identity-provider/instances', { headers: { Authorization: 'Bearer ' + token } });
if (!ipResp.ok) {
  console.error('Failed to get identity providers', ipResp.status, await ipResp.text());
  process.exit(1);
}
const identityProviders = await ipResp.json();

console.log('Found identity providers:');
identityProviders.forEach(ip => {
  console.log(`- Alias: ${ip.alias}, Provider: ${ip.providerId}, Enabled: ${ip.enabled}`);
});

if (identityProviders.length === 0) {
  console.log('No identity providers found!');
}