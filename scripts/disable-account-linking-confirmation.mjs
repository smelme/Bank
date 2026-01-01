#!/usr/bin/env node
/**
 * Disable account linking confirmation
 * This makes the flow automatically create/link users without prompting
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

async function disableConfirmLink() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Fetching first broker login flow executions...\n');
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();
  
  console.log('Current flow executions:');
  executions.forEach((exec, i) => {
    console.log(`${i + 1}. ${exec.displayName || exec.providerId || 'unnamed'} - ${exec.requirement}`);
  });

  // Find and disable "Confirm link existing account"
  const confirmLinkExec = executions.find(e => e.providerId === 'idp-confirm-link');
  
  if (!confirmLinkExec) {
    console.log('\n❌ "Confirm link existing account" execution not found!');
    return;
  }

  console.log('\nFound "Confirm link existing account" execution:');
  console.log('  ID:', confirmLinkExec.id);
  console.log('  Current requirement:', confirmLinkExec.requirement);

  if (confirmLinkExec.requirement === 'DISABLED') {
    console.log('\n✅ "Confirm link existing account" is already DISABLED.');
  } else {
    console.log('\nDisabling "Confirm link existing account"...\n');

    const updateUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
    const updateRes = await fetch(updateUrl, {
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

    if (updateRes.ok) {
      console.log('✅ Successfully disabled "Confirm link existing account"!');
    } else {
      const error = await updateRes.text();
      console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    }
  }

  // Also disable "Handle Existing Account" parent flow
  const handleExistingExec = executions.find(e => 
    e.displayName === 'Handle Existing Account' && !e.providerId
  );

  if (handleExistingExec && handleExistingExec.requirement !== 'DISABLED') {
    console.log('\nDisabling "Handle Existing Account" flow...\n');

    const updateUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: handleExistingExec.id,
        requirement: 'DISABLED'
      })
    });

    if (updateRes.ok) {
      console.log('✅ Successfully disabled "Handle Existing Account" flow!');
      console.log('\n🎉 Now the flow will:');
      console.log('  - Skip Review Profile (disabled)');
      console.log('  - Skip Handle Existing Account (disabled)');
      console.log('  - Only run "Create User If Unique" which creates users');
      console.log('\nNote: This means duplicate users might be created if email is not enforced as unique.');
    } else {
      const error = await updateRes.text();
      console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    }
  }
}

disableConfirmLink().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
