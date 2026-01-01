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

console.log('Updating Browser flow to disable username/password form...');

// Get current executions
const executionsResp = await fetch(base + '/authentication/flows/browser/executions', { headers: { Authorization: 'Bearer ' + token } });
if (!executionsResp.ok) {
  console.error('Failed to get executions', executionsResp.status, await executionsResp.text());
  process.exit(1);
}
const executions = await executionsResp.json();

// Find the username password form execution
const usernamePasswordExecution = executions.find(e => e.providerId === 'auth-username-password-form');
if (!usernamePasswordExecution) {
  console.error('Username password form execution not found');
  process.exit(1);
}

console.log(`Found username password form execution: ${usernamePasswordExecution.id}`);

// Update the requirement to DISABLED
const updateResp = await fetch(base + `/authentication/executions/${usernamePasswordExecution.id}`, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ...usernamePasswordExecution,
    requirement: 'DISABLED'
  })
});

if (!updateResp.ok) {
  console.error('Failed to update execution', updateResp.status, await updateResp.text());
  process.exit(1);
}

console.log('Successfully disabled username/password form in Browser flow');

// Also disable OTP form
const otpExecution = executions.find(e => e.providerId === 'auth-otp-form');
if (otpExecution) {
  console.log(`Found OTP form execution: ${otpExecution.id}`);
  const otpUpdateResp = await fetch(base + `/authentication/executions/${otpExecution.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...otpExecution,
      requirement: 'DISABLED'
    })
  });

  if (!otpUpdateResp.ok) {
    console.error('Failed to update OTP execution', otpUpdateResp.status, await otpUpdateResp.text());
  } else {
    console.log('Successfully disabled OTP form in Browser flow');
  }
}

console.log('Browser flow updated for unified identity provider authentication');