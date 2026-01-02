import 'dotenv/config';

const keycloakUrl = process.env.KEYCLOAK_URL;
const realm = process.env.KEYCLOAK_REALM;
const clientId = 'tamange-web';

console.log('Testing unified authentication flow...');
console.log(`Keycloak URL: ${keycloakUrl}`);
console.log(`Realm: ${realm}`);
console.log(`Client: ${clientId}`);

// Construct the authorization URL
const authUrl = new URL(`${keycloakUrl}/realms/${realm}/protocol/openid-connect/auth`);
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'openid profile email');
authUrl.searchParams.set('redirect_uri', 'https://bank-production-37ea.up.railway.app/callback');
authUrl.searchParams.set('state', 'test-state');
authUrl.searchParams.set('idp_hint', 'oidc');

// Add PKCE parameters
const codeVerifier = 'test-code-verifier-123456789012345678901234567890';
const codeChallenge = 'test-code-challenge'; // In real implementation, this would be base64url(SHA256(codeVerifier))

authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

// Make a request to the auth endpoint (this should redirect to the trustgate)
console.log('\nMaking request to Keycloak auth endpoint...');
try {
  const response = await fetch(authUrl.toString(), {
    redirect: 'manual' // Don't follow redirects automatically
  });

  console.log(`Response status: ${response.status}`);
  console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

  if (response.status === 302) {
    const location = response.headers.get('location');
    console.log(`\nRedirect location: ${location}`);
    
    if (location && location.includes('bank-production-37ea.up.railway.app/authorize')) {
      console.log('✅ SUCCESS: Keycloak is redirecting to the trustgate!');
      console.log('The unified authentication flow is working.');
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