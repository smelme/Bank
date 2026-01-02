import dotenv from 'dotenv';
dotenv.config();
import KcAdminClient from '@keycloak/keycloak-admin-client';

async function probe() {
  const baseUrl = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM;
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!baseUrl || !realm || !clientId || !clientSecret) {
    console.error('Missing Keycloak env vars in .env');
    process.exit(2);
  }

  const admin = new KcAdminClient({ baseUrl, realmName: realm });
  try {
    await admin.auth({ grantType: 'client_credentials', clientId, clientSecret });
  } catch (err) {
    console.error('Auth failed:', err);
    process.exit(1);
  }

  const candidatePaths = [
    `/admin/realms/${realm}/client-policies/policies`,
    `/admin/realms/${realm}/client-policies/config`,
    `/admin/realms/${realm}/client-policies/`,
    `/admin/realms/${realm}/authentication/`,
    `/admin/realms/${realm}/components`,
    `/admin/realms/${realm}/clients/${encodeURIComponent('trustgate-service')}/roles`,
    `/admin/realms/${realm}/clients`,
  ];

  for (const p of candidatePaths) {
    try {
      const res = await admin.request({ method: 'GET', path: p });
      console.log(`OK: GET ${p} -> ${res ? (Array.isArray(res) ? `${res.length} items` : 'object') : 'empty'}`);
    } catch (err) {
      const status = err?.response?.status || err?.message || 'error';
      console.log(`NO: GET ${p} -> ${status}`);
    }
  }

  // Also probe token-exchange support endpoint (client policies may be absent)
  // Try to GET realm client by id
  try {
    const clients = await admin.clients.find({ clientId: 'trustgate-service' });
    if (clients && clients.length) {
      const c = clients[0];
      console.log('Client found. id:', c.id, 'serviceAccountsEnabled:', c.serviceAccountsEnabled);
    } else {
      console.log('Client trustgate-service not found');
    }
  } catch (err) {
    console.error('Error fetching client:', err);
  }
}

probe();
