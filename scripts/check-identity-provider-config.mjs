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

const alias = process.argv[2] || 'oidc';
console.log(`Checking identity provider: ${alias}`);

const ipResp = await fetch(base + '/identity-provider/instances/' + encodeURIComponent(alias), { headers: { Authorization: 'Bearer ' + token } });
if (!ipResp.ok) {
  console.error('Failed to get identity provider', ipResp.status, await ipResp.text());
  process.exit(1);
}
const ip = await ipResp.json();

console.log('Identity Provider Configuration:');
console.log(`- Alias: ${ip.alias}`);
console.log(`- Provider ID: ${ip.providerId}`);
console.log(`- Enabled: ${ip.enabled}`);
console.log(`- Display Name: ${ip.displayName || 'N/A'}`);
console.log(`- Authorization URL: ${ip.config?.authorizationUrl || 'N/A'}`);
console.log(`- Token URL: ${ip.config?.tokenUrl || 'N/A'}`);
console.log(`- Client ID: ${ip.config?.clientId || 'N/A'}`);
console.log(`- Client Secret: ${ip.config?.clientSecret ? '***configured***' : 'NOT SET'}`);