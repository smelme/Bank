#!/usr/bin/env node
/**
 * Update identity provider to enable automatic account linking
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

async function updateIdentityProvider() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  const idpUrl = `${base}/identity-provider/instances/oidc`;

  console.log('Fetching current identity provider configuration...\n');

  // Get current config
  const getRes = await fetch(idpUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!getRes.ok) {
    throw new Error(`Failed to get identity provider: ${getRes.status} ${await getRes.text()}`);
  }

  const currentConfig = await getRes.json();
  console.log('Current config:', JSON.stringify(currentConfig, null, 2));

  // Update with account linking enabled
  const updatedConfig = {
    ...currentConfig,
    config: {
      ...currentConfig.config,
      // Link to existing account automatically if email matches
      linkOnly: 'false', // Allow both new and existing users
      trustEmail: 'true', // Trust the email from the orchestrator
      // Use 'first broker login' flow that handles account linking
      firstBrokerLoginFlowAlias: 'first broker login'
    }
  };

  console.log('\nUpdating identity provider with linking enabled...\n');

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
    console.log('✓ trustEmail: true (trust email from orchestrator)');
    console.log('✓ linkOnly: false (allow both new and existing users)');
    console.log('✓ firstBrokerLoginFlowAlias: first broker login (handles account linking)');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

updateIdentityProvider().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
