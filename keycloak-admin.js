/**
 * Keycloak Admin API Client
 * 
 * Manages users in Keycloak via the Admin REST API.
 * The TrustGate DB is the master source of truth, and this module
 * pushes user data to Keycloak for authentication purposes.
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';

// Read config dynamically to ensure dotenv is loaded first
const getConfig = () => ({
  KEYCLOAK_URL: process.env.KEYCLOAK_URL || 'https://keycloak-production-5bd5.up.railway.app',
  REALM: process.env.KEYCLOAK_REALM || 'Tamange Bank',
  CLIENT_ID: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'trustgate-service',
  CLIENT_SECRET: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET
});

let adminClient = null;
let tokenExpiry = 0;

/**
 * Get or create authenticated admin client
 */
async function getAdminClient() {
  const now = Date.now();
  const config = getConfig();
  
  // Refresh token if expired or about to expire (5 min buffer)
  if (!adminClient || now >= tokenExpiry - (5 * 60 * 1000)) {
    console.log('Authenticating Keycloak admin client...');
    
    adminClient = new KcAdminClient({
      baseUrl: config.KEYCLOAK_URL,
      realmName: config.REALM,
    });
    
    try {
      // Authenticate using service account (client credentials)
      await adminClient.auth({
        grantType: 'client_credentials',
        clientId: config.CLIENT_ID,
        clientSecret: config.CLIENT_SECRET,
      });
      
      // Set token expiry (tokens usually last 60 seconds)
      tokenExpiry = now + (55 * 1000); // 55 seconds to be safe
      
      console.log('Keycloak admin client authenticated successfully');
    } catch (error) {
      // Clear cached client on auth failure
      adminClient = null;
      tokenExpiry = 0;
      console.error('Failed to authenticate Keycloak admin client:', error.message);
      console.error('Full error:', JSON.stringify(error, null, 2));
      console.error('Config used:', { 
        baseUrl: config.KEYCLOAK_URL, 
        realm: config.REALM, 
        clientId: config.CLIENT_ID,
        clientSecretLength: config.CLIENT_SECRET?.length 
      });
      throw new Error('Keycloak authentication failed');
    }
  }
  
  return adminClient;
}

/**
 * Create a new user in Keycloak
 * 
 * @param {Object} userData - User data
 * @param {string} userData.username - Username (unique)
 * @param {string} userData.email - Email address
 * @param {string} userData.firstName - First name
 * @param {string} userData.lastName - Last name
 * @param {Object} userData.attributes - Additional attributes
 * @returns {Promise<string>} Keycloak user ID
 */
export async function createKeycloakUser(userData) {
  const client = await getAdminClient();
  
  try {
    const newUser = {
      username: userData.username,
      email: userData.email,
      emailVerified: true, // Digital ID verified, so email is trusted
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      enabled: true,
      // Passwordless - no credentials required
      requiredActions: [],
      attributes: {
        // Store additional attributes for reference
        id_verified: ['true'],
        id_verified_at: [new Date().toISOString()],
        document_number: userData.documentNumber ? [userData.documentNumber] : [],
        passwordless: ['true'], // Mark as passwordless user
        ...userData.attributes
      }
    };
    
    // Create user
    const response = await client.users.create(newUser);
    
    // Extract user ID from Location header
    const userId = response.id || extractUserIdFromLocation(response);
    
    if (!userId) {
      throw new Error('Failed to extract user ID from Keycloak response');
    }
    
    console.log(`Created Keycloak user: ${userData.username} (ID: ${userId})`);
    
    return userId;
  } catch (error) {
    console.error('Error creating Keycloak user:', error.message);
    
    // Check if user already exists
    if (error.response?.status === 409) {
      throw new Error('User already exists in Keycloak');
    }
    
    throw error;
  }
}

/**
 * Update user in Keycloak
 * 
 * @param {string} keycloakUserId - Keycloak user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateKeycloakUser(keycloakUserId, updates) {
  const client = await getAdminClient();
  
  try {
    await client.users.update(
      { id: keycloakUserId },
      updates
    );
    
    console.log(`Updated Keycloak user: ${keycloakUserId}`);
  } catch (error) {
    console.error('Error updating Keycloak user:', error.message);
    throw error;
  }
}

/**
 * Delete user from Keycloak
 * 
 * @param {string} keycloakUserId - Keycloak user ID
 * @returns {Promise<void>}
 */
export async function deleteKeycloakUser(keycloakUserId) {
  const client = await getAdminClient();
  
  try {
    await client.users.del({ id: keycloakUserId });
    console.log(`Deleted Keycloak user: ${keycloakUserId}`);
  } catch (error) {
    console.error('Error deleting Keycloak user:', error.message);
    throw error;
  }
}

/**
 * Get user from Keycloak by ID
 * 
 * @param {string} keycloakUserId - Keycloak user ID
 * @returns {Promise<Object>} User object
 */
export async function getKeycloakUser(keycloakUserId) {
  const client = await getAdminClient();
  
  try {
    return await client.users.findOne({ id: keycloakUserId });
  } catch (error) {
    console.error('Error fetching Keycloak user:', error.message);
    throw error;
  }
}

/**
 * Find user by username
 * 
 * @param {string} username - Username to search
 * @returns {Promise<Object|null>} User object or null
 */
export async function findKeycloakUserByUsername(username) {
  const client = await getAdminClient();
  
  try {
    const users = await client.users.find({ username, exact: true });
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    console.error('Error searching Keycloak user:', error.message);
    throw error;
  }
}

/**
 * Extract user ID from Location header
 * (Fallback if response.id is not available)
 */
function extractUserIdFromLocation(response) {
  const location = response.headers?.location || response.location;
  if (location) {
    const match = location.match(/\/users\/([^\/]+)$/);
    return match ? match[1] : null;
  }
  return null;
}

/**
 * Test Keycloak connection
 */
export async function testKeycloakConnection() {
  try {
    const client = await getAdminClient();
    console.log('✅ Keycloak Admin API connection successful');
    return true;
  } catch (error) {
    console.error('❌ Keycloak Admin API connection failed:', error.message);
    return false;
  }
}
