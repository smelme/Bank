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

async function checkIdentityProviderMappers() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  // Get identity provider mappers
  const mappersUrl = `${base}/identity-provider/instances/oidc/mappers`;
  console.log('Fetching identity provider mappers...');
  
  const res = await fetch(mappersUrl, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  if (!res.ok) {
    console.error('Failed to get mappers:', res.status, await res.text());
    return;
  }
  
  const mappers = await res.json();
  console.log('\nIdentity Provider Mappers:');
  console.log(JSON.stringify(mappers, null, 2));
  
  if (!mappers || mappers.length === 0) {
    console.log('\n⚠️  No mappers configured! This might cause issues.');
    console.log('You may need to add attribute mappers for:');
    console.log('  - preferred_username');
    console.log('  - email');
    console.log('  - given_name');
    console.log('  - family_name');
  }
}

checkIdentityProviderMappers().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
