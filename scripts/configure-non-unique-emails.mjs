#!/usr/bin/env node
/**
 * Configure for non-unique emails:
 * - Remove email uniqueness requirement
 * - Use username as the primary identifier
 * - Federated identity (orchestrator user ID) is the true link
 */

import dotenv from 'dotenv';
dotenv.config();

const KEYCLOAK_URL = process.env.KEYCLOAK_URL;
const REALM = process.env.KEYCLOAK_REALM;
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;

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

async function configureForNonUniqueEmails() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Configuring for non-unique emails...\n');
  
  // 1. Update realm settings to allow duplicate emails
  console.log('Step 1: Allowing duplicate emails in realm...');
  const realmUrl = `${base}`;
  const realmRes = await fetch(realmUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  if (!realmRes.ok) {
    throw new Error(`Failed to get realm: ${realmRes.status}`);
  }
  
  const realm = await realmRes.json();
  
  const updatedRealm = {
    ...realm,
    duplicateEmailsAllowed: true,
    loginWithEmailAllowed: false // Don't allow login by email since it's not unique
  };
  
  const updateRealmRes = await fetch(realmUrl, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updatedRealm)
  });
  
  if (updateRealmRes.ok) {
    console.log('✓ Duplicate emails: ALLOWED');
    console.log('✓ Login with email: DISABLED');
  } else {
    console.log('✗ Failed to update realm settings');
  }
  
  // 2. Update "Create User If Unique" to NOT check email
  console.log('\nStep 2: Configuring "Create User If Unique" to ignore email...');
  
  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }
  
  const executions = await execRes.json();
  const createUserExec = executions.find(e => e.providerId === 'idp-create-user-if-unique');
  
  if (createUserExec && createUserExec.authenticationConfig) {
    const configUrl = `${base}/authentication/config/${createUserExec.authenticationConfig}`;
    const configRes = await fetch(configUrl, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (configRes.ok) {
      const config = await configRes.json();
      
      // Remove email requirement - only check by federated identity
      const updatedConfig = {
        ...config,
        config: {
          // Empty config means only check federated identity, not email or username
        }
      };
      
      const updateConfigRes = await fetch(configUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedConfig)
      });
      
      if (updateConfigRes.ok) {
        console.log('✓ Create User If Unique: Check by federated identity only');
      }
    }
  }
  
  // 3. Ensure username mapper exists and maps preferred_username
  console.log('\nStep 3: Verifying username mapper...');
  
  const mappersUrl = `${base}/identity-provider/instances/oidc/mappers`;
  const mappersRes = await fetch(mappersUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  if (mappersRes.ok) {
    const mappers = await mappersRes.json();
    const usernameMapper = mappers.find(m => m.name === 'username');
    
    if (usernameMapper) {
      console.log('✓ Username mapper exists:', usernameMapper.config.claim, '→', usernameMapper.config['user.attribute']);
    } else {
      console.log('⚠ Username mapper not found - should map preferred_username to username');
    }
  }
  
  console.log('\n✅ Configuration complete!');
  console.log('\n=== ARCHITECTURE ===');
  console.log('User Identification:');
  console.log('  - Primary ID: Orchestrator user ID (UUID in sub claim)');
  console.log('  - Username: Generated at registration, mapped via preferred_username');
  console.log('  - Email: NOT unique, can be shared by family members');
  console.log('\nUser Creation Flow:');
  console.log('  1. User registers → Orchestrator creates user with:');
  console.log('     • Unique UUID (id)');
  console.log('     • Generated username (unique)');
  console.log('     • Email (can be duplicate)');
  console.log('     • Passkey credential');
  console.log('  2. First login → Keycloak creates user:');
  console.log('     • Checks if federated identity exists (by orchestrator UUID)');
  console.log('     • If not, creates new Keycloak user');
  console.log('     • Maps username from preferred_username claim');
  console.log('     • Maps email (non-unique)');
  console.log('     • Links via federated identity (orchestrator UUID → sub claim)');
  console.log('  3. Subsequent logins → Keycloak finds user:');
  console.log('     • Matches by federated identity (orchestrator UUID)');
  console.log('     • Uses existing Keycloak user');
  console.log('     • Updates user data if syncMode=FORCE');
}

configureForNonUniqueEmails().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
