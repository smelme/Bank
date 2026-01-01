#!/usr/bin/env node
/**
 * Add post-logout redirect URI to tamange-web client
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

async function addPostLogoutRedirectUri() {
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
  console.log('Current redirect URIs:', client.redirectUris);
  console.log('Current web origins:', client.webOrigins);
  console.log('Current post-logout redirect URIs:', client.attributes?.['post.logout.redirect.uris'] || 'none');

  // Add post-logout redirect URIs
  const updatedClient = {
    ...client,
    attributes: {
      ...client.attributes,
      'post.logout.redirect.uris': 'https://bank-production-37ea.up.railway.app/*'
    }
  };

  console.log('\nUpdating client with post-logout redirect URIs...\n');

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
    console.log('✅ Successfully added post-logout redirect URIs!');
    console.log('✓ post.logout.redirect.uris: https://bank-production-37ea.up.railway.app/*');
    console.log('\nNow logout will redirect properly to the app.');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

addPostLogoutRedirectUri().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
