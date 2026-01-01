#!/usr/bin/env node
/**
 * Configure tamange-web client to skip logout confirmation
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
  
  console.log('Fetching tamange-web client configuration...\n');
  
  // Get clients
  const clientsUrl = `${base}/clients?clientId=tamange-web`;
  const clientsRes = await fetch(clientsUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!clientsRes.ok) {
    throw new Error(`Failed to get clients: ${clientsRes.status}`);
  }

  const clients = await clientsRes.json();
  if (clients.length === 0) {
    throw new Error('Client tamange-web not found');
  }

  const client = clients[0];
  console.log('Found client:', client.clientId);
  console.log('Current frontChannelLogout:', client.frontchannelLogout);

  // Update client to disable front-channel logout confirmation
  const updatedClient = {
    ...client,
    frontchannelLogout: false, // Disable front-channel logout (no confirmation screen)
    attributes: {
      ...client.attributes,
      'post.logout.redirect.uris': client.attributes?.['post.logout.redirect.uris'] || 'https://bank-production-37ea.up.railway.app/*'
    }
  };

  console.log('\nDisabling logout confirmation screen...\n');

  const updateUrl = `${base}/clients/${client.id}`;
  const updateRes = await fetch(updateUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedClient)
  });

  if (updateRes.ok) {
    console.log('✅ Successfully disabled logout confirmation!');
    console.log('✓ frontchannelLogout: false');
    console.log('\nNow logout will redirect immediately without showing confirmation screen.');
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
