import fs from 'fs';
import crypto from 'crypto';
// Make webcrypto available for jose when safe to do so.
try {
  if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto;
  }
} catch (err) {
  // ignore: platform provides crypto as read-only getter
}
import { exportJWK, importSPKI } from 'jose';

try {
  const pubPemPath = './orchestrator-public.pem';
  if (!fs.existsSync(pubPemPath)) {
    console.error('Public key not found at', pubPemPath);
    process.exit(2);
  }

  const pubPem = fs.readFileSync(pubPemPath, 'utf8');
  const key = await importSPKI(pubPem, 'RS256');
  const jwk = await exportJWK(key);
  jwk.kid = jwk.kid || 'trustgate-1';
  jwk.use = 'sig'; // Signature use
  jwk.alg = 'RS256'; // Algorithm

  const jwks = { keys: [jwk] };

  // Ensure secrets directory
  fs.mkdirSync('./secrets', { recursive: true });
  const outPath = './secrets/trustgate-jwks.json';
  fs.writeFileSync(outPath, JSON.stringify(jwks, null, 2));

  console.log(JSON.stringify(jwks, null, 2));
  console.log('\nWrote JWKS to', outPath);
} catch (err) {
  console.error('Failed to convert PEM to JWKS:', err);
  process.exit(1);
}
