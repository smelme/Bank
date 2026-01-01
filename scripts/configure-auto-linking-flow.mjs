#!/usr/bin/env node
/**
 * Re-enable Handle Existing Account but with auto-linking configuration
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

async function configureFlow() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();

  console.log('Configuring first broker login flow for automatic linking...\n');

  // Re-enable Handle Existing Account as ALTERNATIVE
  const handleExistingExec = executions.find(e => 
    e.displayName === 'Handle Existing Account' && !e.providerId
  );

  if (handleExistingExec) {
    console.log('Setting "Handle Existing Account" to ALTERNATIVE...');
    await fetch(execUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: handleExistingExec.id,
        requirement: 'ALTERNATIVE'
      })
    });
    console.log('✓ Handle Existing Account: ALTERNATIVE');
  }

  // Keep Confirm Link disabled
  const confirmLinkExec = executions.find(e => e.providerId === 'idp-confirm-link');
  if (confirmLinkExec && confirmLinkExec.requirement !== 'DISABLED') {
    console.log('Keeping "Confirm link existing account" DISABLED...');
    await fetch(execUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: confirmLinkExec.id,
        requirement: 'DISABLED'
      })
    });
    console.log('✓ Confirm link existing account: DISABLED');
  }

  // Set Account verification options to DISABLED
  const verificationExec = executions.find(e => 
    e.displayName === 'Account verification options' && !e.providerId
  );
  if (verificationExec) {
    console.log('Setting "Account verification options" to DISABLED...');
    await fetch(execUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: verificationExec.id,
        requirement: 'DISABLED'
      })
    });
    console.log('✓ Account verification options: DISABLED');
  }

  console.log('\n✅ Flow configured for automatic linking!');
  console.log('\nWith this configuration:');
  console.log('  - Review Profile: DISABLED (no profile review prompt)');
  console.log('  - Create User If Unique: ALTERNATIVE (creates if new)');
  console.log('  - Handle Existing Account: ALTERNATIVE (links if exists)');
  console.log('  - Confirm Link: DISABLED (no confirmation prompt)');
  console.log('  - Account Verification: DISABLED (no verification prompt)');
  console.log('\nResult: Automatic creation for new users, automatic linking for existing users by email.');
}

configureFlow().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
