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

console.log('Disabling remaining conditional executions...');

// Get current executions
const executionsResp = await fetch(base + '/authentication/flows/browser/executions', { headers: { Authorization: 'Bearer ' + token } });
if (!executionsResp.ok) {
  console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
  process.exit(1);
}
const executions = await executionsResp.json();

// Find and disable conditional executions
const conditionals = executions.filter(e => e.requirement === 'CONDITIONAL');

console.log(`Found ${conditionals.length} conditional executions to disable`);

for (const conditional of conditionals) {
  console.log(`Disabling ${conditional.displayName} (${conditional.providerId})`);
  
  const updateData = {
    ...conditional,
    requirement: 'DISABLED'
  };

  const updateResp = await fetch(base + `/authentication/flows/browser/executions`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updateData)
  });

  if (!updateResp.ok) {
    console.error(`Failed to disable ${conditional.displayName}:`, await updateResp.text());
  } else {
    console.log(`Successfully disabled ${conditional.displayName}`);
  }
}

console.log('All conditional executions disabled');