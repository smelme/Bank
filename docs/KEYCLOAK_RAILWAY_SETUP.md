# Keycloak on Railway - Setup Guide

This guide walks you through deploying **Keycloak** on Railway for Option A (Keycloak as IDP, Orchestrator for policy/passkeys/risk).

---

## Prerequisites
- Railway account
- Railway CLI (optional but helpful): `npm install -g @railway/cli`

---

## Phase 1: Deploy Keycloak Service

### 1.1 Create Keycloak Service on Railway

1. In your Railway project, click **+ New**
2. Choose **Deploy Docker Image**
3. Enter image: `quay.io/keycloak/keycloak:26.0.7` (or latest stable from [Keycloak releases](https://github.com/keycloak/keycloak/releases))
4. Name the service: **`keycloak`**

### 1.2 Add Postgres Database for Keycloak

1. In the same Railway project, click **+ New**
2. Choose **Database** → **PostgreSQL**
3. Name it: **`keycloak-db`**
4. Railway will auto-generate connection variables

### 1.3 Configure Keycloak Environment Variables

Go to your **keycloak** service → **Variables** tab and add these:

#### Admin Bootstrap
```
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<generate-strong-password>
```

#### Database Connection
Railway provides these variables from your Postgres plugin. Use them to build the JDBC URL:

```
KC_DB=postgres
KC_DB_URL=jdbc:postgresql://${{keycloak-db.PGHOST}}:${{keycloak-db.PGPORT}}/${{keycloak-db.PGDATABASE}}
KC_DB_USERNAME=${{keycloak-db.PGUSER}}
KC_DB_PASSWORD=${{keycloak-db.PGPASSWORD}}
```

**Note**: Railway's variable referencing syntax is `${{SERVICE_NAME.VAR_NAME}}`. Adjust the service name if yours differs.

#### Proxy & HTTP Settings (Critical for Railway)
Railway terminates TLS at the edge, so Keycloak receives HTTP internally:

```
KC_PROXY=edge
KC_PROXY_HEADERS=xforwarded
KC_HTTP_ENABLED=true
```

#### Hostname (Optional for now, required for custom domains later)
```
KC_HOSTNAME_STRICT=false
```

Later when you add a custom domain like `id.yourdomain.com`:
```
KC_HOSTNAME=id.yourdomain.com
KC_HOSTNAME_STRICT=true
```

### 1.4 Set Start Command

Railway should auto-detect Keycloak's start command, but if you need to set it manually:

**Start Command**: `start`

(Keycloak automatically runs `/opt/keycloak/bin/kc.sh start` in production mode)

### 1.5 Configure Memory (Important)

Keycloak is Java/JVM-based and needs adequate memory:

1. Go to **Settings** tab of keycloak service
2. Set memory to at least **1024 MB** (1GB), preferably **2048 MB** (2GB) for production

---

## Phase 2: Access Keycloak Admin Console

### 2.1 Get Railway URL

Once deployed, Railway assigns a public URL like:
```
https://keycloak-production-xxxx.up.railway.app
```

Copy this URL from the **keycloak** service settings.

### 2.2 Login to Admin Console

1. Open `https://<your-keycloak-url>/admin`
2. Use credentials:
   - **Username**: `admin`
   - **Password**: (the value you set for `KEYCLOAK_ADMIN_PASSWORD`)

---

## Phase 3: Create Realm & Clients

### 3.1 Create Realm

1. In admin console, hover over **Master** (top-left dropdown)
2. Click **Create Realm**
3. Name: `tamange`
4. Click **Create**

### 3.2 Create SPA Client (for your frontend app)

1. In the `tamange` realm, go to **Clients** → **Create client**
2. Fill in:
   - **Client ID**: `tamange-web`
   - **Client type**: OpenID Connect
   - Click **Next**
3. **Capability config**:
   - ✅ **Standard flow** (Authorization Code)
   - ✅ **Direct access grants** (for testing, optional)
   - Click **Next**
4. **Login settings**:
   - **Valid redirect URIs**: 
     ```
     https://<your-app-railway-url>/*
     http://localhost:*
     ```
     (Add your actual Railway app URL once deployed)
   - **Valid post logout redirect URIs**: same as above
   - **Web origins**: `+` (or specific origins)
5. Click **Save**

### 3.3 Enable PKCE (Critical for SPA security)

1. In the `tamange-web` client settings, go to **Advanced** tab
2. Find **Proof Key for Code Exchange Code Challenge Method**
3. Set to: **S256**
4. Click **Save**

### 3.4 Create Service Client (for Orchestrator/Backend)

1. Go to **Clients** → **Create client**
2. Fill in:
   - **Client ID**: `orchestrator-service`
   - **Client type**: OpenID Connect
   - Click **Next**
3. **Capability config**:
   - ✅ **Service accounts roles** (Client Credentials flow)
   - ❌ **Standard flow** (not needed for service-to-service)
   - Click **Next**
4. Click **Save**
5. Go to **Credentials** tab → copy **Client Secret** (save it securely)

---

## Phase 4: Test Basic OIDC Flow

### 4.1 Get OIDC Discovery URL

Your OIDC configuration endpoint:
```
https://<your-keycloak-url>/realms/tamange/.well-known/openid-configuration
```

### 4.2 Key Endpoints

From the discovery document, you'll need:
- **authorization_endpoint**: `https://<keycloak-url>/realms/tamange/protocol/openid-connect/auth`
- **token_endpoint**: `https://<keycloak-url>/realms/tamange/protocol/openid-connect/token`
- **userinfo_endpoint**: `https://<keycloak-url>/realms/tamange/protocol/openid-connect/userinfo`
- **jwks_uri**: `https://<keycloak-url>/realms/tamange/protocol/openid-connect/certs`

### 4.3 Create Test User

1. In Keycloak admin, go to **Users** → **Add user**
2. Fill in **Username** (e.g., `testuser`)
3. Click **Create**
4. Go to **Credentials** tab
5. Click **Set password**
6. Enter password, toggle **Temporary** off
7. Click **Save**

---

## Verification Checklist

- [ ] Keycloak service is running on Railway
- [ ] Keycloak DB is connected (no connection errors in logs)
- [ ] Admin console accessible at `/admin`
- [ ] Realm `tamange` created
- [ ] SPA client `tamange-web` configured with PKCE
- [ ] Service client `orchestrator-service` created with credentials
- [ ] Test user created

---

## Common Issues & Fixes

### Issue: "Invalid redirect URI"
**Fix**: Ensure your app's redirect URI exactly matches what's in the client settings (including trailing slashes).

### Issue: Keycloak restarts frequently
**Fix**: Increase memory allocation to at least 2GB.

### Issue: "Invalid issuer" or CORS errors
**Fix**: 
- Check `KC_PROXY=edge` and `KC_PROXY_HEADERS=xforwarded` are set
- Ensure your app's origin is in **Web origins** (or use `+`)

### Issue: Can't login with test user
**Fix**: Make sure password is set and **Temporary** is disabled in user credentials.

---

## Next Steps

Once Keycloak is running:
1. **Phase 2**: Wire your SPA to use Keycloak OIDC (PKCE flow)
2. **Phase 3**: Deploy Orchestrator service with risk engine + passkeys
3. **Phase 4**: Add Keycloak custom authenticators to call Orchestrator

---

## Custom Domain Migration (Later)

When you add a custom domain:

1. Add domain in Railway: `id.yourdomain.com` → keycloak service
2. Update Keycloak variables:
   ```
   KC_HOSTNAME=id.yourdomain.com
   KC_HOSTNAME_STRICT=true
   ```
3. Update client redirect URIs to use new domain
4. Update SPA OIDC config to use new issuer URL

**Passkey Impact**: If you create passkeys before custom domain, users will need to re-enroll after migration (WebAuthn RP ID change).

---

## Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak on Docker](https://www.keycloak.org/server/containers)
- [OIDC/OAuth2 Flow Guide](https://www.keycloak.org/docs/latest/securing_apps/#_oidc)
