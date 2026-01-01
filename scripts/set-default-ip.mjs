import 'dotenv/config';

const tokenUrl = `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}/protocol/openid-connect/token`;
const params = new URLSearchParams();
params.append('grant_type', 'client_credentials');
params.append('client_id', process.env.KEYCLOAK_ADMIN_CLIENT_ID);
params.append('client_secret', process.env.KEYCLOAK_ADMIN_CLIENT_SECRET);

const t = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
if (!t.ok) {
  console.error('Failed to get admin token', t.status, await t.text());
  process.exit(2);
}
const tj = await t.json();
const token = tj.access_token;

const base = `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/admin/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}`;

console.log('Setting default identity provider for the realm...');

// Get current realm
const realmResp = await fetch(base, { headers: { Authorization: 'Bearer ' + token } });
if (!realmResp.ok) {
  console.error('Failed to get realm', realmResp.status, await realmResp.text());
  process.exit(1);
}
const realm = await realmResp.json();

// Update realm with default identity provider
const updatedRealm = {
  ...realm,
  attributes: {
    ...realm.attributes,
    'defaultIdentityProvider': 'oidc'
  }
};

const updateResp = await fetch(base, {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(updatedRealm)
});

if (!updateResp.ok) {
  console.error('Failed to update realm', updateResp.status, await updateResp.text());
  process.exit(1);
}

console.log('Successfully set default identity provider to "oidc"');