import 'dotenv/config';
import fs from 'fs';

const LOCAL_PATH = './secrets/orchestrator-jwks.json';
const DEFAULT_URL = 'https://bank-production-37ea.up.railway.app/.well-known/jwks.json';
const JWKS_URL = process.env.ORCHESTRATOR_JWKS_URL || DEFAULT_URL;
const MAX_ATTEMPTS = 12;
const INTERVAL_MS = 10000;

function loadLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read local JWKS at', LOCAL_PATH, err.message);
    process.exit(2);
  }
}

async function fetchRemote() {
  const r = await fetch(JWKS_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function jwksEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

(async function run() {
  const local = loadLocal();
  console.log('Local JWKS keys:', (local.keys||[]).map(k => k.kid).join(', '));
  for (let i=1;i<=MAX_ATTEMPTS;i++) {
    try {
      const remote = await fetchRemote();
      const remoteKids = (remote.keys||[]).map(k => k.kid).join(', ');
      console.log(new Date().toISOString(), `attempt ${i}/${MAX_ATTEMPTS} — remote kids: ${remoteKids}`);
      if (jwksEqual(local, remote)) {
        console.log('MATCH: remote JWKS matches local file.');
        process.exit(0);
      } else {
        console.log('No match yet.');
      }
    } catch (err) {
      console.log(new Date().toISOString(), `attempt ${i}/${MAX_ATTEMPTS} — fetch error: ${err.message}`);
    }
    if (i < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  console.log('Finished polling; remote JWKS did not match local file.');
  process.exit(1);
})();
