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

const clientId = '5e2b6d27-0207-43da-a49b-c2c0a771c902'; // UUID of tamange-web client

console.log(`Updating client ${clientId} to use custom authentication flow...`);

// Get current client
const clientResp = await fetch(base + `/clients/${clientId}`, { headers: { Authorization: 'Bearer ' + token } });
if (!clientResp.ok) {
  console.error('Failed to get client', clientResp.status, await clientResp.text());
  process.exit(1);
}
const client = await clientResp.json();

console.log('Current authenticationFlowBindingOverrides:', JSON.stringify(client.authenticationFlowBindingOverrides, null, 2));

// Update the client to use the custom flow for browser authentication
const updatedClient = {
  ...client,
  authenticationFlowBindingOverrides: {
    browser: 'unified-passkey-flow'
  }
};

const updateResp = await fetch(base + `/clients/${clientId}`, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updatedClient)
});

if (!updateResp.ok) {
  console.error('Failed to update client', updateResp.status, await updateResp.text());
  process.exit(1);
}

console.log('Successfully updated client to use custom authentication flow');
console.log('Client will now redirect directly to the trustgate identity provider');