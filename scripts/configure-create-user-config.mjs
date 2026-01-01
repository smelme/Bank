#!/usr/bin/env node
/**
 * Check and update the "Create User If Unique" configuration
 * to automatically link existing accounts by email
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

async function updateCreateUserConfig() {
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
  const createUserExec = executions.find(e => e.providerId === 'idp-create-user-if-unique');
  
  if (!createUserExec) {
    console.log('❌ "Create User If Unique" execution not found!');
    return;
  }

  console.log('Found "Create User If Unique" execution:');
  console.log('  ID:', createUserExec.id);
  console.log('  Requirement:', createUserExec.requirement);
  console.log('  Config ID:', createUserExec.authenticationConfig);

  if (!createUserExec.authenticationConfig) {
    console.log('\n❌ No authentication config found. Cannot check settings.');
    return;
  }

  // Get the config
  const configUrl = `${base}/authentication/config/${createUserExec.authenticationConfig}`;
  const configRes = await fetch(configUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!configRes.ok) {
    throw new Error(`Failed to get config: ${configRes.status}`);
  }

  const config = await configRes.json();
  
  console.log('\nCurrent configuration:');
  console.log(JSON.stringify(config, null, 2));

  // Update config to require match on email
  const updatedConfig = {
    ...config,
    config: {
      require: 'email' // Only check email for uniqueness, auto-link if exists
    }
  };

  console.log('\nUpdating configuration to auto-link by email...\n');

  const updateRes = await fetch(configUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedConfig)
  });

  if (updateRes.ok) {
    console.log('✅ Successfully updated "Create User If Unique" config!');
    console.log('✓ Set to match by email only');
    console.log('\nThis should allow automatic linking when email matches.');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
  }
}

updateCreateUserConfig().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
