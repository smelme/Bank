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

console.log('Configuring identity provider redirector in custom flow...');

// Get executions for the custom flow
const executionsResp = await fetch(base + '/authentication/flows/unified-passkey-flow/executions', { headers: { Authorization: 'Bearer ' + token } });
if (!executionsResp.ok) {
  console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
  process.exit(1);
}
const executions = await executionsResp.json();

const ipExecution = executions.find(e => e.providerId === 'identity-provider-redirector');
if (!ipExecution) {
  console.error('Identity provider redirector execution not found in custom flow');
  process.exit(1);
}

console.log(`Found execution in custom flow: ${ipExecution.id}`);

// Configure it
const configData = {
  alias: 'custom-oidc-redirector',
  config: {
    'defaultProvider': 'oidc'
  }
};

const configResp = await fetch(base + `/authentication/executions/${ipExecution.id}/config`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(configData)
});

console.log('Custom flow config response:', configResp.status);
if (!configResp.ok) {
  console.log('Config error:', await configResp.text());
} else {
  console.log('Custom flow configured successfully');
}