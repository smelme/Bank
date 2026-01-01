#!/usr/bin/env node
/**
 * Configure backchannel logout instead of frontchannel to skip confirmation
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

async function configureBackchannelLogout() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Fetching tamange-web client configuration...\n');
  
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
  console.log('Current frontchannelLogout:', client.frontchannelLogout);
  console.log('Current attributes:', JSON.stringify(client.attributes, null, 2));

  // Configure for backchannel logout with no confirmation
  const updatedClient = {
    ...client,
    frontchannelLogout: false,
    attributes: {
      ...client.attributes,
      'post.logout.redirect.uris': 'https://bank-production-37ea.up.railway.app/*',
      'backchannel.logout.session.required': 'false',
      'backchannel.logout.revoke.offline.tokens': 'false',
      'backchannel.logout.url': '' // Empty to use default behavior
    }
  };

  console.log('\nUpdating client configuration...\n');

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
    console.log('✅ Successfully configured backchannel logout!');
    console.log('✓ frontchannelLogout: false');
    console.log('✓ backchannel.logout.session.required: false');
    console.log('✓ backchannel.logout.revoke.offline.tokens: false');
    console.log('\nLogout should now work without confirmation.');
  } else {
    const error = await updateRes.text();
    console.error(`❌ Failed to update: ${updateRes.status} ${error}`);
    process.exit(1);
  }
}

configureBackchannelLogout().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
