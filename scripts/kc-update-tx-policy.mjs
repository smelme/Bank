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
  if (!r.ok) throw new Error('Token error: ' + r.status + ' ' + await r.text());
  const j = await r.json();
  return j.access_token;
}

async function run() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  const policiesUrl = base + '/client-policies/policies';

  console.log('Fetching policies...');
  const res = await fetch(policiesUrl, { headers: { Authorization: 'Bearer ' + token } });
  const body = await res.json();
  console.log('Policies GET status:', res.status);
  console.log(JSON.stringify(body, null, 2).slice(0, 2000));

  const existing = body.policies || [];
  let target = existing.find(p => p.name === 'allow-trustgate-token-exchange' || p.name === 'Token-Exchange');
  if (!target) {
    console.log('No target policy found; will attempt to create a new policy via PUT to /policies/{name}');
    target = { name: 'allow-trustgate-token-exchange', enabled: true, conditions: [], profiles: [] };
  }

  // Add our conditions if not present
  const hasAuthClient = (target.conditions || []).some(c => (c.condition || c.providerId || c.conditionType || '').toString().toLowerCase().includes('client'));
  const hasIss = (target.conditions || []).some(c => JSON.stringify(c).includes('issuer') || JSON.stringify(c).includes('iss'));

  if (!hasAuthClient) {
    target.conditions = target.conditions || [];
    target.conditions.push({ providerId: 'AuthenticatedClientCondition', config: { clientIds: ['trustgate-service'] } });
  }
  if (!hasIss) {
    target.conditions = target.conditions || [];
    target.conditions.push({ condition: 'identity-provider', configuration: { 'identityProvider': 'oidc' } });
  }

  console.log('Attempting PUT to /policies/{name}');
  const putByName = await fetch(policiesUrl + '/' + encodeURIComponent(target.name), {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(target)
  });
  console.log('/policies/{name} status:', putByName.status, await putByName.text().then(t => t.slice(0,1000)));

  if (target.id) {
    console.log('Attempting PUT to /policies/{id}');
    const putById = await fetch(policiesUrl + '/' + encodeURIComponent(target.id), {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(target)
    });
    console.log('/policies/{id} status:', putById.status, await putById.text().then(t => t.slice(0,1000)));
  }

  // As fallback, attempt POST creation
  console.log('Attempting POST to create policy');
  const post = await fetch(policiesUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(target)
  });
  console.log('POST status:', post.status, await post.text().then(t => t.slice(0,1000)));
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
