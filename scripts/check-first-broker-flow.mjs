#!/usr/bin/env node
/**
 * Check the first broker login flow configuration
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

async function checkFirstBrokerFlow() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  
  console.log('Fetching authentication flows...\n');
  
  const flowsUrl = `${base}/authentication/flows`;
  const flowsRes = await fetch(flowsUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!flowsRes.ok) {
    throw new Error(`Failed to get flows: ${flowsRes.status}`);
  }

  const flows = await flowsRes.json();
  const firstBrokerFlow = flows.find(f => f.alias === 'first broker login');
  
  if (!firstBrokerFlow) {
    console.log('❌ "first broker login" flow not found!');
    return;
  }

  console.log('Found "first broker login" flow:', firstBrokerFlow.alias);
  console.log('ID:', firstBrokerFlow.id);
  console.log('\nFetching executions...\n');

  const execUrl = `${base}/authentication/flows/${encodeURIComponent('first broker login')}/executions`;
  const execRes = await fetch(execUrl, {
    headers: { 'Authorization': 'Bearer ' + token }
  });

  if (!execRes.ok) {
    throw new Error(`Failed to get executions: ${execRes.status}`);
  }

  const executions = await execRes.json();
  
  console.log('Flow executions:');
  executions.forEach((exec, i) => {
    console.log(`\n${i + 1}. ${exec.displayName || exec.providerId}`);
    console.log(`   Requirement: ${exec.requirement}`);
    console.log(`   Provider: ${exec.providerId}`);
    console.log(`   Level: ${exec.level}`);
    if (exec.authenticationConfig) {
      console.log(`   Config ID: ${exec.authenticationConfig}`);
    }
  });

  console.log('\n\n=== SOLUTION ===');
  console.log('The "first broker login" flow has these steps:');
  console.log('1. Review Profile - asks user to review/update profile');
  console.log('2. Create User If Unique - creates new user if email is unique');
  console.log('3. Handle Existing Account - handles account linking if email exists');
  console.log('\nTo auto-link existing accounts, we should:');
  console.log('- Set "Review Profile" to DISABLED');
  console.log('- Keep "Handle Existing Account" as REQUIRED');
  console.log('\nThis will automatically link to existing users by email without prompting.');
}

checkFirstBrokerFlow().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
