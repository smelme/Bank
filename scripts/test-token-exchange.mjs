import crypto from 'crypto';
try {
  if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = crypto.webcrypto;
  }
} catch (err) {
  // ignore
}
import { signAssertion, exchangeWithKeycloak } from '../token-exchange.js';

async function run() {
  try {
    const user = {
      id: process.env.ORCHESTRATOR_TEST_USER_ID || 'user_test_1',
      username: process.env.ORCHESTRATOR_TEST_USERNAME || 'test.user'
    };

    console.log('Signing assertion for user:', user);
    const assertion = await signAssertion(user);
    console.log('\nSigned assertion (preview):', assertion.slice(0, 120) + '...');

    if (!process.env.KEYCLOAK_TOKEN_URL) {
      console.warn('KEYCLOAK_TOKEN_URL not set — skipping exchange. Set env and re-run to test exchange.');
      return;
    }

    console.log('\nAttempting token exchange with Keycloak...');
    const resp = await exchangeWithKeycloak(assertion);
    console.log('\nToken exchange response:', JSON.stringify(resp, null, 2));
  } catch (err) {
    console.error('Test token-exchange failed:', err);
    process.exit(1);
  }
}

run();
