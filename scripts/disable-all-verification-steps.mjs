#!/usr/bin/env node
/**
 * Disable all account verification steps that require user interaction
 */

import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ADMIN_CLIENT_ID);
  params.append('client_secret', ADMIN_CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', body: params });
  if (!r.ok) throw new Error('Token error: ' + r.status + ' ' + await r.text());
  const j = await r.json();
  return j.access_token;
}

async function disableVerificationSteps() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Fetching authentication flow executions...\n');
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();

  console.log('All executions:');
  executions.forEach((e, i) => {
    console.log(`${i + 1}. [Level ${e.level}] ${e.displayName || e.providerId || 'unnamed'} - ${e.requirement}`);
  });

  const stepsToDisable = [
    { name: 'Verify existing account by Email', providerId: 'idp-email-verification' },
    { name: 'Verify Existing Account by Re-authentication', displayName: 'Verify Existing Account by Re-authentication' },
    { name: 'Username Password Form', providerId: 'idp-username-password-form' },
    { name: 'First broker login - Conditional OTP', displayName: 'First broker login - Conditional OTP' }
  ];

  console.log('\n\nDisabling verification steps...\n');

  for (const step of stepsToDisable) {
    let exec;
    if (step.providerId) {
      exec = executions.find(e => e.providerId === step.providerId);
    } else if (step.displayName) {
      exec = executions.find(e => e.displayName === step.displayName && !e.providerId);
    }

    if (exec && exec.requirement !== 'DISABLED') {
      console.log(`Disabling "${step.name}"...`);
      const res = await fetch(execUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: exec.id,
          requirement: 'DISABLED'
        })
      });

      if (res.ok) {
        console.log(`✓ ${step.name}: DISABLED`);
      } else {
        console.log(`✗ ${step.name}: Failed (${res.status})`);
      }
    } else if (exec) {
      console.log(`✓ ${step.name}: Already DISABLED`);
    }
  }

  console.log('\n✅ Verification steps disabled!');
  console.log('\nThe flow should now automatically link accounts by email without prompting for password.');
}

disableVerificationSteps().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
