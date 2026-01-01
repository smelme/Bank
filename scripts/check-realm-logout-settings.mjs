#!/usr/bin/env node
/**
 * Check realm-level logout settings
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

async function checkRealmSettings() {
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
  
  console.log('Realm logout-related settings:');
  console.log('- revokeRefreshToken:', realm.revokeRefreshToken);
  console.log('- refreshTokenMaxReuse:', realm.refreshTokenMaxReuse);
  console.log('- accessTokenLifespan:', realm.accessTokenLifespan);
  console.log('- ssoSessionIdleTimeout:', realm.ssoSessionIdleTimeout);
  console.log('- ssoSessionMaxLifespan:', realm.ssoSessionMaxLifespan);
  console.log('- offlineSessionIdleTimeout:', realm.offlineSessionIdleTimeout);
  
  console.log('\nRealm attributes:');
  if (realm.attributes) {
    Object.keys(realm.attributes).forEach(key => {
      if (key.toLowerCase().includes('logout') || key.toLowerCase().includes('session')) {
        console.log(`- ${key}: ${realm.attributes[key]}`);
      }
    });
  }

  // Check client again
  console.log('\n=== Checking tamange-web client ===\n');
  
  const clientsUrl = `${base}/clients?clientId=tamange-web`;
  const clientsRes = await fetch(clientsUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  const clients = await clientsRes.json();
  if (clients.length > 0) {
    const client = clients[0];
    console.log('Client settings:');
    console.log('- frontchannelLogout:', client.frontchannelLogout);
    console.log('- adminUrl:', client.adminUrl);
    console.log('- baseUrl:', client.baseUrl);
    console.log('- redirectUris:', client.redirectUris);
    console.log('\nClient attributes:');
    if (client.attributes) {
      Object.keys(client.attributes).forEach(key => {
        if (key.toLowerCase().includes('logout') || key.toLowerCase().includes('post')) {
          console.log(`- ${key}: ${client.attributes[key]}`);
        }
      });
    }
  }
}

checkRealmSettings().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
