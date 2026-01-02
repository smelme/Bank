import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

if (!KEYCLOAK_URL || !REALM || !ADMIN_CLIENT_ID || !ADMIN_CLIENT_SECRET) {
  console.error('Missing Keycloak admin env vars');
  process.exit(2);
}

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${encodeURIComponent(REALM)}/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', ADMIN_CLIENT_ID);
  params.append('client_secret', ADMIN_CLIENT_SECRET);

  const r = await fetch(tokenUrl, { method: 'POST', body: params });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('Token error: ' + r.status + ' ' + t);
  }
  const j = await r.json();
  return j.access_token;
}

async function updateProfile() {
  const token = await getAdminToken();
  console.log('Obtained admin token (len):', token.length);

  const profilesUrl = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}/client-policies/profiles`;

  // Get existing profiles
  console.log('Fetching existing profiles...');
  const getRes = await fetch(profilesUrl, { headers: { Authorization: 'Bearer ' + token } });
  const existingProfiles = await getRes.json();
  console.log('Existing profiles:', JSON.stringify(existingProfiles, null, 2));

  // Update the Token-Exchange profile
  const existingProfile = existingProfiles.profiles?.find(p => p.name === 'Token-Exchange');
  if (existingProfile) {
    const updateUrl = `${profilesUrl}/${encodeURIComponent(existingProfile.name)}`;
    const jwksUrl = process.env.TRUSTGATE_JWKS_URL || `https://bank-production-37ea.up.railway.app/.well-known/jwks.json`;

    const updatedProfile = {
      ...existingProfile,
      executors: [
        ...existingProfile.executors,
        {
          executor: 'token-exchange',
          configuration: {
            'jwks-url': jwksUrl
          }
        }
      ]
    };

    console.log('Updating profile:', JSON.stringify(updatedProfile, null, 2));

    const res = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedProfile)
    });

    const text = await res.text();
    console.log('Status:', res.status, 'Response:', text);
  }
}

updateProfile().catch(console.error);