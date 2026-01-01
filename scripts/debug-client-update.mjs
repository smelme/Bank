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

console.log('Testing client update with minimal change...');

// Get current client
const clientResp = await fetch(base + `/clients/${clientId}`, { headers: { Authorization: 'Bearer ' + token } });
if (!clientResp.ok) {
  console.error('Failed to get client', clientResp.status, await clientResp.text());
  process.exit(1);
}
const client = await clientResp.json();

console.log('Current client description:', client.description);

// Try updating just the description first
const testUpdate = {
  ...client,
  description: 'Test update'
};

const testResp = await fetch(base + `/clients/${clientId}`, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testUpdate)
});

console.log('Test update status:', testResp.status);
if (!testResp.ok) {
  console.log('Test update error:', await testResp.text());
} else {
  console.log('Test update successful');
}

// Now try the flow binding
console.log('\nTrying flow binding update...');
const flowUpdate = {
  ...client,
  description: client.description, // revert description
  authenticationFlowBindingOverrides: {
    browser: 'unified-passkey-flow'
  }
};

const flowResp = await fetch(base + `/clients/${clientId}`, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(flowUpdate)
});

console.log('Flow binding update status:', flowResp.status);
if (!flowResp.ok) {
  console.log('Flow binding error:', await flowResp.text());
} else {
  console.log('Flow binding successful');
}