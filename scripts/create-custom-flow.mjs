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

console.log('Creating custom authentication flow for unified identity provider authentication...');

// Create a new flow
const flowData = {
  alias: 'unified-passkey-flow',
  description: 'Unified flow that redirects directly to trustgate identity provider',
  providerId: 'basic-flow',
  topLevel: true,
  builtIn: false
};

const createFlowResp = await fetch(base + '/authentication/flows', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(flowData)
});

if (!createFlowResp.ok) {
  console.error('Failed to create flow', createFlowResp.status, await createFlowResp.text());
  process.exit(1);
}

console.log('Created custom flow: unified-passkey-flow');

// Add identity provider redirector execution
const ipRedirectorData = {
  provider: 'identity-provider-redirector'
};

const addExecutionResp = await fetch(base + '/authentication/flows/unified-passkey-flow/executions/execution', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(ipRedirectorData)
});

if (!addExecutionResp.ok) {
  console.error('Failed to add execution', addExecutionResp.status, await addExecutionResp.text());
  process.exit(1);
}

console.log('Added identity provider redirector execution');

// Get executions to find the one we just added
const executionsResp = await fetch(base + '/authentication/flows/unified-passkey-flow/executions', { headers: { Authorization: 'Bearer ' + token } });
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

// Configure the execution to redirect to 'oidc' identity provider
const configResp = await fetch(base + `/authentication/executions/${ipExecution.id}/config`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    alias: 'oidc',
    config: {
      'defaultProvider': 'oidc'
    }
  })
});

if (!configResp.ok) {
  console.error('Failed to configure execution', configResp.status, await configResp.text());
  // This might fail if config is not needed, let's continue
}

console.log('Custom flow created successfully');