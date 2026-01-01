#!/usr/bin/env node
/**
 * Configure identity provider to update existing users automatically
 * by setting updateProfileFirstLoginMode to "off"
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

async function configureIdentityProvider() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  const idpUrl = `${base}/identity-provider/instances/oidc`;

  console.log('Fetching current identity provider configuration...\n');

  const getRes = await fetch(idpUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!getRes.ok) {
    throw new Error(`Failed to get identity provider: ${getRes.status}`);
  }

  const currentConfig = await getRes.json();
  
  console.log('Current settings:');
  console.log('  updateProfileFirstLoginMode:', currentConfig.updateProfileFirstLoginMode);
  console.log('  trustEmail:', currentConfig.trustEmail);
  console.log('  linkOnly:', currentConfig.linkOnly);

  // Update configuration
  const updatedConfig = {
    ...currentConfig,
    updateProfileFirstLoginMode: 'off', // Don't ask to review profile
    trustEmail: true, // Trust the email from orchestrator  
    linkOnly: false, // Allow both new users and linking
    config: {
      ...currentConfig.config,
      syncMode: 'FORCE' // Force sync user data from external provider
    }
  };

  console.log('\nUpdating identity provider configuration...\n');

  const updateRes = await fetch(idpUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedConfig)
  });

  if (updateRes.ok) {
    console.log('✅ Identity provider updated successfully!');
    console.log('\nNew settings:');
    console.log('  ✓ updateProfileFirstLoginMode: off (no profile review)');
    console.log('  ✓ trustEmail: true (trust orchestrator email)');
    console.log('  ✓ syncMode: FORCE (always sync from orchestrator)');
    console.log('\nThis should allow automatic user creation without prompts.');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

configureIdentityProvider().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
