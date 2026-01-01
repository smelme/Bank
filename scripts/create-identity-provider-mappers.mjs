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

async function createAttributeMappers() {
  const token = await getAdminToken();
  const base = `${KEYCLOAK_URL}/admin/realms/${encodeURIComponent(REALM)}`;
  const mappersUrl = `${base}/identity-provider/instances/oidc/mappers`;

  const mappers = [
    {
      name: 'username',
      identityProviderAlias: 'oidc',
      identityProviderMapper: 'oidc-user-attribute-idp-mapper',
      config: {
        claim: 'preferred_username',
        'user.attribute': 'username',
        syncMode: 'INHERIT'
      }
    },
    {
      name: 'email',
      identityProviderAlias: 'oidc',
      identityProviderMapper: 'oidc-user-attribute-idp-mapper',
      config: {
        claim: 'email',
        'user.attribute': 'email',
        syncMode: 'INHERIT'
      }
    },
    {
      name: 'firstName',
      identityProviderAlias: 'oidc',
      identityProviderMapper: 'oidc-user-attribute-idp-mapper',
      config: {
        claim: 'given_name',
        'user.attribute': 'firstName',
        syncMode: 'INHERIT'
      }
    },
    {
      name: 'lastName',
      identityProviderAlias: 'oidc',
      identityProviderMapper: 'oidc-user-attribute-idp-mapper',
      config: {
        claim: 'family_name',
        'user.attribute': 'lastName',
        syncMode: 'INHERIT'
      }
    }
  ];

  console.log('Creating attribute mappers...\n');

  for (const mapper of mappers) {
    console.log(`Creating mapper: ${mapper.name} (${mapper.config.claim} → ${mapper.config['user.attribute']})`);
    
    const res = await fetch(mappersUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mapper)
    });

    if (res.ok) {
      console.log(`  ✓ Created ${mapper.name}`);
    } else {
      const error = await res.text();
      console.log(`  ✗ Failed to create ${mapper.name}: ${res.status} ${error}`);
    }
  }

  console.log('\n✅ Attribute mappers created!');
  console.log('These map orchestrator claims to Keycloak user attributes:');
  console.log('  preferred_username → username');
  console.log('  email → email');
  console.log('  given_name → firstName');
  console.log('  family_name → lastName');
}

createAttributeMappers().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
