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

const clientId = process.argv[2] || process.env.KEYCLOAK_CLIENT_ID || 'trustgate-service';
console.log('Looking up client by clientId:', clientId);
const q = await fetch(base + '/clients?clientId=' + encodeURIComponent(clientId), { headers: { Authorization: 'Bearer ' + token } });
if (!q.ok) { console.error('clients search failed', q.status, await q.text()); process.exit(2); }
const clients = await q.json();
if (!clients.length) { console.log('No clients found'); process.exit(0); }
const c = clients[0];
console.log(JSON.stringify(c, null, 2));

// fetch service-account role settings
if (c.id) {
  const detail = await fetch(base + '/clients/' + encodeURIComponent(c.id), { headers: { Authorization: 'Bearer ' + token } });
  console.log('\nClient raw detail status:', detail.status);
  console.log(JSON.stringify(await detail.json(), null, 2));
}
