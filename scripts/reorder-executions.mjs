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

console.log('Reordering browser flow executions to prioritize identity provider redirector...');

// Get current executions
const executionsResp = await fetch(base + '/authentication/flows/browser/executions', { headers: { Authorization: 'Bearer ' + token } });
if (!executionsResp.ok) {
  console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
  process.exit(1);
}
const executions = await executionsResp.json();

// Find the executions we care about
const ipRedirector = executions.find(e => e.providerId === 'identity-provider-redirector');
const usernamePassword = executions.find(e => e.providerId === 'auth-username-password-form');

if (!ipRedirector || !usernamePassword) {
  console.error('Required executions not found');
  process.exit(1);
}

console.log(`IP Redirector - index: ${ipRedirector.index}, priority: ${ipRedirector.priority}`);
console.log(`Username Password - index: ${usernamePassword.index}, priority: ${usernamePassword.priority}`);

// Try to raise the priority of the IP redirector
const raiseResp = await fetch(base + `/authentication/flows/browser/executions`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    action: 'raisePriority',
    executionId: ipRedirector.id
  })
});

console.log('Raise priority response:', raiseResp.status);
if (!raiseResp.ok) {
  console.log('Raise priority error:', await raiseResp.text());
}

// Check the new order
const newExecutionsResp = await fetch(base + '/authentication/flows/browser/executions', { headers: { Authorization: 'Bearer ' + token } });
if (newExecutionsResp.ok) {
  const newExecutions = await newExecutionsResp.json();
  console.log('New execution order:');
  newExecutions.forEach(e => {
    console.log(`  ${e.index}: ${e.displayName} (${e.providerId}) - ${e.requirement}`);
  });
}