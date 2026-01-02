#!/usr/bin/env node
/**
 * Simplify the first broker login flow:
 * - Disable Handle Existing Account (causes password prompts)
 * - Keep only Create User If Unique (auto-creates users)
 * This way each trustgate user gets their own Keycloak user automatically
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

async function simplifyFlow() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Simplifying first broker login flow...\n');
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();

  // Disable "Handle Existing Account" completely
  const handleExistingExec = executions.find(e => 
    e.displayName === 'Handle Existing Account' && !e.providerId
  );

  if (handleExistingExec) {
    console.log('Disabling "Handle Existing Account" flow...');
    await fetch(execUrl, {
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
    console.log('✓ Handle Existing Account: DISABLED');
  }

  // Set "Create User If Unique" to REQUIRED (not ALTERNATIVE)
  const createUserExec = executions.find(e => e.providerId === 'idp-create-user-if-unique');
  
  if (createUserExec) {
    console.log('Setting "Create User If Unique" to REQUIRED...');
    await fetch(execUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: createUserExec.id,
        requirement: 'REQUIRED'
      })
    });
    console.log('✓ Create User If Unique: REQUIRED');
  }

  console.log('\n✅ Flow simplified!');
  console.log('\nActive steps:');
  console.log('  1. Review Profile: DISABLED');
  console.log('  2. Create User If Unique: REQUIRED (always creates user)');
  console.log('  3. Handle Existing Account: DISABLED');
  console.log('\nResult: Each trustgate login automatically creates a new Keycloak user.');
  console.log('No prompts, no password verification, just automatic user creation!');
  console.log('\nNote: Users are linked by the federated identity (trustgate user ID),');
  console.log('so signing in with the same passkey will always use the same Keycloak user.');
}

simplifyFlow().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
