#!/usr/bin/env node
/**
 * Disable "Review Profile" step in first broker login flow
 * This allows automatic account linking without user confirmation
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

async function disableReviewProfile() {
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
  const reviewProfileExec = executions.find(e => e.providerId === 'idp-review-profile');
  
  if (!reviewProfileExec) {
    console.log('❌ "Review Profile" execution not found!');
    return;
  }

  console.log('Found "Review Profile" execution:');
  console.log('  ID:', reviewProfileExec.id);
  console.log('  Current requirement:', reviewProfileExec.requirement);

  if (reviewProfileExec.requirement === 'DISABLED') {
    console.log('\n✅ "Review Profile" is already DISABLED. No changes needed.');
    return;
  }

  console.log('\nUpdating "Review Profile" to DISABLED...\n');

  // Update the execution - need to use the flow-based endpoint
  const updateUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const updateRes = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: reviewProfileExec.id,
      requirement: 'DISABLED'
    })
  });

  if (updateRes.ok) {
    console.log('✅ Successfully disabled "Review Profile" step!');
    console.log('\nNow when users sign in via the identity provider:');
    console.log('- If email matches an existing user → automatic account linking');
    console.log('- If email is new → automatic user creation');
    console.log('- No manual "Review Profile" or "Account exists" prompts');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

disableReviewProfile().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
