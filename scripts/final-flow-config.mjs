#!/usr/bin/env node
/**
 * Configure proper account linking:
 * - Create User If Unique: ALTERNATIVE (creates if new)
 * - Handle Existing Account: ALTERNATIVE (links if exists)
 * - But with ALL verification steps disabled (no password required)
 * 
 * This way:
 * - New users get created automatically
 * - Existing users get linked automatically (by federated identity)
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

async function configureProperLinking() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Configuring automatic account linking by email...\n');
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();

  console.log('Configuring flow steps...\n');

  // 1. Review Profile: DISABLED
  const reviewProfile = executions.find(e => e.providerId === 'idp-review-profile');
  if (reviewProfile) {
    await updateExecution(base, token, reviewProfile.id, 'DISABLED');
    console.log('✓ Review Profile: DISABLED');
  }

  // 2. User creation or linking: REQUIRED (parent)
  const userCreationLinking = executions.find(e => 
    e.displayName === 'User creation or linking' && !e.providerId
  );
  if (userCreationLinking) {
    await updateExecution(base, token, userCreationLinking.id, 'REQUIRED');
    console.log('✓ User creation or linking: REQUIRED');
  }

  // 3. Create User If Unique: ALTERNATIVE
  const createUser = executions.find(e => e.providerId === 'idp-create-user-if-unique');
  if (createUser) {
    await updateExecution(base, token, createUser.id, 'ALTERNATIVE');
    console.log('✓ Create User If Unique: ALTERNATIVE');
  }

  // 4. Handle Existing Account: ALTERNATIVE
  const handleExisting = executions.find(e => 
    e.displayName === 'Handle Existing Account' && !e.providerId
  );
  if (handleExisting) {
    await updateExecution(base, token, handleExisting.id, 'ALTERNATIVE');
    console.log('✓ Handle Existing Account: ALTERNATIVE');
  }

  // 5. Disable Confirm link: DISABLED
  const confirmLink = executions.find(e => e.providerId === 'idp-confirm-link');
  if (confirmLink) {
    await updateExecution(base, token, confirmLink.id, 'DISABLED');
    console.log('✓ Confirm link existing account: DISABLED');
  }

  // 6. Disable Account verification options: DISABLED
  const accountVerification = executions.find(e => 
    e.displayName === 'Account verification options' && !e.providerId
  );
  if (accountVerification) {
    await updateExecution(base, token, accountVerification.id, 'DISABLED');
    console.log('✓ Account verification options: DISABLED');
  }

  console.log('\n✅ Flow configured for automatic linking!');
  console.log('\nHow it works:');
  console.log('  1. TrustGate authenticates user with passkey');
  console.log('  2. Keycloak receives user info (sub, email, name)');
  console.log('  3. Create User If Unique checks if user exists (by federated identity)');
  console.log('  4. If new → creates user automatically');
  console.log('  5. If exists → Handle Existing Account links automatically');
  console.log('  6. No password, no prompts - just automatic linking!');
  console.log('\nKey: Users are matched by federated identity (trustgate user ID),');
  console.log('not by email. So first login creates Keycloak user, subsequent logins reuse it.');
}

async function updateExecution(base, token, id, requirement) {
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  await fetch(execUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, requirement })
  });
}

configureProperLinking().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
