import 'dotenv/config';

const keycloakUrl = process.env.KEYCLOAK_URL;
const realm = process.env.KEYCLOAK_REALM;
const clientId = 'tamange-web';

console.log('Testing unified authentication flow via broker login...');
console.log(`Keycloak URL: ${keycloakUrl}`);
console.log(`Realm: ${realm}`);
console.log(`Client: ${clientId}`);

// Construct the broker login URL directly
const brokerUrl = new URL(`${keycloakUrl}/realms/${realm}/broker/oidc/login`);
brokerUrl.searchParams.set('client_id', clientId);
brokerUrl.searchParams.set('response_type', 'code');
brokerUrl.searchParams.set('scope', 'openid profile email');
brokerUrl.searchParams.set('redirect_uri', 'https://bank-production-37ea.up.railway.app/callback');
brokerUrl.searchParams.set('state', 'test-state');
brokerUrl.searchParams.set('nonce', 'test-nonce');

// Add PKCE parameters
const codeVerifier = 'test-code-verifier-123456789012345678901234567890';
const codeChallenge = 'test-code-challenge'; // In real implementation, this would be base64url(SHA256(codeVerifier))

brokerUrl.searchParams.set('code_challenge', codeChallenge);
brokerUrl.searchParams.set('code_challenge_method', 'S256');

console.log(`\nBroker login URL: ${brokerUrl.toString()}`);

// Make a request to the broker login endpoint
console.log('\nMaking request to Keycloak broker login endpoint...');
try {
  const response = await fetch(brokerUrl.toString(), {
    redirect: 'manual' // Don't follow redirects automatically
  });

  console.log(`Response status: ${response.status}`);
  console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

  if (response.status === 302) {
    const location = response.headers.get('location');
    console.log(`\nRedirect location: ${location}`);
    
    if (location && location.includes('bank-production-37ea.up.railway.app/authorize')) {
      console.log('✅ SUCCESS: Keycloak broker is redirecting to the trustgate!');
      console.log('The unified authentication flow is working via broker login.');
    } else {
      console.log('❌ UNEXPECTED: Not redirecting to trustgate');
    }
  } else {
    console.log(`❌ ERROR: Expected redirect (302), got ${response.status}`);
    const body = await response.text();
    console.log('Response body:', body.substring(0, 500));
  }
} catch (error) {
  console.error('Request failed:', error.message);
}