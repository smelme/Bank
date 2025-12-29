/**
 * Test Keycloak Admin API Connection
 */

import dotenv from 'dotenv';
dotenv.config();

import KcAdminClient from '@keycloak/keycloak-admin-client';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

console.log('Testing Keycloak Admin API Connection...\n');
console.log('Configuration:');
console.log('  URL:', KEYCLOAK_URL);
console.log('  Realm:', REALM);
console.log('  Client ID:', CLIENT_ID);
console.log('  Client Secret:', CLIENT_SECRET ? `${CLIENT_SECRET.substring(0, 10)}...` : 'NOT SET');
console.log();

async function testConnection() {
  try {
    const adminClient = new KcAdminClient({
      baseUrl: KEYCLOAK_URL,
      realmName: REALM,
    });
    
    console.log('Attempting authentication...');
    
    await adminClient.auth({
      grantType: 'client_credentials',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
    
    console.log('✅ Authentication successful!\n');
    
    // Try to list users to verify permissions
    console.log('Testing user list permissions...');
    const users = await adminClient.users.find({ max: 1 });
    console.log(`✅ Successfully retrieved users (found ${users.length})\n`);
    
    console.log('All tests passed! ✅');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('\nTroubleshooting steps:');
    console.log('1. Verify the orchestrator-service client exists in Keycloak');
    console.log('2. Ensure "Client authentication" is ON');
    console.log('3. Ensure "Service accounts roles" is ON');
    console.log('4. Verify the client secret matches');
    console.log('5. Check that the client has realm-management roles assigned');
    
    process.exit(1);
  }
}

testConnection();
