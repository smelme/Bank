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

console.log('Checking identity provider redirector configuration...');

// Get executions for the browser flow
const executionsResp = await fetch(base + '/authentication/flows/browser/executions', { headers: { Authorization: 'Bearer ' + token } });
if (!executionsResp.ok) {
  console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
  process.exit(1);
}
const executions = await executionsResp.json();

const ipExecution = executions.find(e => e.providerId === 'identity-provider-redirector');
if (!ipExecution) {
  console.error('Identity provider redirector execution not found');
  process.exit(1);
}

console.log(`Found execution: ${ipExecution.id}`);

// Check if it has configuration
const configResp = await fetch(base + `/authentication/executions/${ipExecution.id}/config`, { headers: { Authorization: 'Bearer ' + token } });
console.log('Config response status:', configResp.status);

if (configResp.ok) {
  const config = await configResp.json();
  console.log('Current config:', JSON.stringify(config, null, 2));
} else {
  console.log('No config found');
}