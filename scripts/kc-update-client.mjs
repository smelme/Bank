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

const clientId = process.argv[2];
const newDomain = process.argv[3];

if (!clientId || !newDomain) {
  console.error('Usage: node kc-update-client.mjs <clientId> <newDomain>');
  console.error('Example: node kc-update-client.mjs tamange-web https://bank-production-37ea.up.railway.app');
  process.exit(1);
}

console.log(`Updating client ${clientId} to add redirect URIs for ${newDomain}`);

// First get the client
const q = await fetch(base + '/clients?clientId=' + encodeURIComponent(clientId), { headers: { Authorization: 'Bearer ' + token } });
if (!q.ok) { console.error('clients search failed', q.status, await q.text()); process.exit(2); }
const clients = await q.json();
if (!clients.length) { console.log('No clients found'); process.exit(0); }
const client = clients[0];

console.log('Current redirect URIs:', client.redirectUris);
console.log('Current web origins:', client.webOrigins);

// Update redirect URIs
const updatedRedirectUris = [...new Set([
  ...client.redirectUris,
  `${newDomain}/*`,
  `${newDomain}/callback`
])];

const updatedWebOrigins = [...new Set([
  ...client.webOrigins,
  newDomain
])];

const updateData = {
  redirectUris: updatedRedirectUris,
  webOrigins: updatedWebOrigins
};

console.log('New redirect URIs:', updatedRedirectUris);
console.log('New web origins:', updatedWebOrigins);

// Update the client
const updateUrl = base + '/clients/' + client.id;
const updateResp = await fetch(updateUrl, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updateData)
});

if (!updateResp.ok) {
  console.error('Failed to update client', updateResp.status, await updateResp.text());
  process.exit(1);
}

console.log('Client updated successfully!');