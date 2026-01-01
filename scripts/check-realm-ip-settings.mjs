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

console.log('Checking realm settings for default identity provider...');

// Get realm
const realmResp = await fetch(base, { headers: { Authorization: 'Bearer ' + token } });
if (!realmResp.ok) {
  console.error('Failed to get realm', realmResp.status, await realmResp.text());
  process.exit(1);
}
const realm = await realmResp.json();

console.log('Current realm identity provider settings:');
console.log('- Default Identity Provider:', realm.browserFlow || 'not set');
console.log('- Identity Provider Redirector settings:', JSON.stringify(realm.attributes || {}, null, 2));

// Check if there's a default identity provider setting
if (realm.attributes && realm.attributes['defaultIdentityProvider']) {
  console.log('Default Identity Provider is set to:', realm.attributes['defaultIdentityProvider']);
} else {
  console.log('No default identity provider set at realm level');
}