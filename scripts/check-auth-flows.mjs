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

console.log('Checking authentication flows...');
const flowsResp = await fetch(base + '/authentication/flows', { headers: { Authorization: 'Bearer ' + token } });
if (!flowsResp.ok) {
  console.error('Failed to get flows', flowsResp.status, await flowsResp.text());
  process.exit(1);
}
const flows = await flowsResp.json();

console.log('Authentication Flows:');
for (const flow of flows) {
  console.log(`- ${flow.alias} (${flow.providerId}) - ${flow.builtIn ? 'Built-in' : 'Custom'}`);

  if (flow.alias === 'browser' || flow.alias === 'unified-passkey-flow') {
    console.log(`  Checking ${flow.alias} Flow Executions...`);
    const executionsResp = await fetch(base + `/authentication/flows/${flow.alias}/executions`, { headers: { Authorization: 'Bearer ' + token } });
    if (!executionsResp.ok) {
      console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
      continue;
    }
    const executions = await executionsResp.json();

    console.log(`  ${flow.alias} Flow Executions:`);
    for (const execution of executions) {
      console.log(`    - ${execution.displayName} (${execution.providerId}) - ${execution.requirement}`);
    }
  }
}