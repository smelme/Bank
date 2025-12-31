import 'dotenv/config';
import fs from 'fs';

const assertion = fs.readFileSync('./tmp_assertion.jwt', 'utf8').trim();
const tokenUrl = process.env.KEYCLOAK_TOKEN_URL || `${process.env.KEYCLOAK_URL.replace(/\/$/, '')}/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM)}/protocol/openid-connect/token`;
const params = new URLSearchParams();
params.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
params.append('subject_token', assertion);
// Use SUBJECT_TOKEN_TYPE env var if set; default to access_token which Keycloak may expect.
params.append('subject_token_type', process.env.SUBJECT_TOKEN_TYPE || 'urn:ietf:params:oauth:token-type:access_token');

const auth = Buffer.from((process.env.KEYCLOAK_CLIENT_ID || '') + ':' + (process.env.KEYCLOAK_CLIENT_SECRET || '')).toString('base64');

console.log('Token URL:', tokenUrl);
const r = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ' + auth }, body: params });
console.log('Status:', r.status);
try { const j = await r.json(); console.log(JSON.stringify(j, null, 2)); } catch(e) { console.log('Non-JSON'); console.log(await r.text()); }
