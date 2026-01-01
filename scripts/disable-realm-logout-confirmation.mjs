#!/usr/bin/env node
/**
 * Disable the Keycloak logout confirmation page at realm level
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

async function disableLogoutConfirmation() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Fetching realm configuration...\n');
  
  const realmUrl = `${base}`;
  const realmRes = await fetch(realmUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!realmRes.ok) {
    throw new Error(`Failed to get realm: ${realmRes.status}`);
  }

  const realm = await realmRes.json();
  
  // Add attribute to skip logout confirmation
  const updatedRealm = {
    ...realm,
    attributes: {
      ...realm.attributes,
      'actionTokenGeneratedByUserLifespan-LOGOUT': '0' // Auto-confirm logout
    }
  };

  console.log('Updating realm to disable logout confirmation...\n');

  const updateRes = await fetch(realmUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedRealm)
  });

  if (updateRes.ok) {
    console.log('✅ Successfully configured realm to auto-confirm logout!');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

disableLogoutConfirmation().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
