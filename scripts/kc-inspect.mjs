import dotenv from 'dotenv';
dotenv.config();

import KcAdminClient from '@keycloak/keycloak-admin-client';

(async function(){
  const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
  const REALM = process.env.KEYCLOAK_REALM;
  const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

  if (!KEYCLOAK_URL || !REALM || !CLIENT_ID || !CLIENT_SECRET) {
    console.error('Missing KEYCLOAK_URL/REALM/CLIENT_ID/CLIENT_SECRET in env');
    process.exit(2);
  }

  const client = new KcAdminClient({ baseUrl: KEYCLOAK_URL, realmName: REALM });
  try {
    await client.auth({ grantType: 'client_credentials', clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  } catch (err) {
    console.error('Failed to authenticate admin client:', err);
    process.exit(1);
  }

  try {
    const info = await client.serverInfo.getInfo();
    console.log('Server info:', JSON.stringify(info, null, 2));
  } catch (err) {
    console.warn('Could not get server info via admin client:', err?.message || err);
  }

  try {
    const clients = await client.clients.find({clientId: 'trustgate-service'});
    if (!clients || clients.length === 0) {
      console.log('Client trustgate-service not found in realm');
    } else {
      console.log('Found client(s):');
      for (const c of clients) {
        console.log(JSON.stringify(c, null, 2));
      }
    }
  } catch (err) {
    console.error('Error fetching clients:', err);
  }
})();
