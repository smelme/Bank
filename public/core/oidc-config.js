/**
 * OIDC Configuration for Keycloak Integration
 * 
 * This configuration uses Authorization Code Flow with PKCE (Proof Key for Code Exchange)
 * for secure authentication from the browser without requiring a client secret.
 */

// Use the UMD bundle loaded via script tag (window.oidc)
const { UserManager, WebStorageStateStore } = window.oidc;

export const oidcConfig = {
  // Keycloak realm URL - note the URL encoding for the space in "Tamange Bank"
  authority: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank',
  
  // Client ID from Keycloak (public client)
  client_id: 'tamange-web',
  
  // Where Keycloak redirects after successful login
  redirect_uri: window.location.origin + '/callback',
  
  // Where to redirect after logout
  post_logout_redirect_uri: window.location.origin,
  
  // OAuth2 response type - using authorization code flow
  response_type: 'code',
  
  // OpenID Connect scopes
  scope: 'openid profile email',
  
  // Automatically refresh tokens before they expire
  automaticSilentRenew: true,
  
  // Load additional user information from the userinfo endpoint
  loadUserInfo: true,
  
  // Silent renew configuration (iframe-based token refresh)
  silent_redirect_uri: window.location.origin + '/silent-renew.html',
  
  // Use session storage for state
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  
  // Prevent the library from using revokeTokensOnSignout which causes double-request
  revokeTokensOnSignout: false,
  
  // Include id_token_hint in signout by default
  includeIdTokenHint: true,
  
  // Additional metadata
  metadata: {
    issuer: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank',
    authorization_endpoint: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank/protocol/openid-connect/auth',
    token_endpoint: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank/protocol/openid-connect/token',
    userinfo_endpoint: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank/protocol/openid-connect/userinfo',
    end_session_endpoint: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank/protocol/openid-connect/logout',
    jwks_uri: 'https://keycloak-production-5bd5.up.railway.app/realms/Tamange%20Bank/protocol/openid-connect/certs',
  }
};

// Singleton UserManager instance
let userManager = null;

/**
 * Get or create the UserManager instance
 */
export function getUserManager() {
  if (!userManager) {
    userManager = new UserManager(oidcConfig);
    
    // Set up event handlers for automatic token renewal
    userManager.events.addUserLoaded((user) => {
      console.log('User loaded/token refreshed:', user.profile);
      storeTokens(user.access_token, user.id_token, user.profile);
    });
    
    userManager.events.addAccessTokenExpiring(() => {
      console.log('Access token expiring, renewing...');
    });
    
    userManager.events.addAccessTokenExpired(() => {
      console.log('Access token expired');
      // Optionally redirect to login
      clearTokens();
      window.location.href = '/signin';
    });
    
    userManager.events.addSilentRenewError((error) => {
      console.error('Silent renew error:', error);
    });
    
    userManager.events.addUserUnloaded(() => {
      console.log('User session unloaded');
      clearTokens();
    });
    
    userManager.events.addUserSignedOut(() => {
      console.log('User signed out');
      clearTokens();
      window.location.href = '/';
    });
  }
  
  return userManager;
}

/**
 * Get the current authenticated user
 */
export async function getUser() {
  const manager = getUserManager();
  try {
    return await manager.getUser();
  } catch (e) {
    // Fallback: if we have tokens stored manually in sessionStorage, provide a minimal user
    try {
      // Prefer sessionStorage (used by oidc-client), then fall back to localStorage (token-exchange flow)
      let info = sessionStorage.getItem('oidc_user_info');
      let access = sessionStorage.getItem('oidc_access_token');
      let idt = sessionStorage.getItem('oidc_id_token');
      if (!info) {
        info = localStorage.getItem('oidc_user_info');
        access = localStorage.getItem('oidc_access_token');
        idt = localStorage.getItem('oidc_id_token');
      }
      if (info) return { profile: JSON.parse(info), access_token: access, id_token: idt, expired: false };
    } catch (e2) {
      // ignore
    }
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated() {
  const user = await getUser();
  if (user && !user.expired) return true;

  // Fallback: check for tokens stored in sessionStorage by token-exchange flow
  try {
    const at = sessionStorage.getItem('oidc_access_token') || localStorage.getItem('oidc_access_token');
    const idt = sessionStorage.getItem('oidc_id_token') || localStorage.getItem('oidc_id_token');
    if (at) return true;
  } catch (e) {
    // ignore
  }

  // Legacy fallback: passkeyAuth localStorage (passkey-based session)
  try {
    const raw = localStorage.getItem('passkeyAuth');
    if (!raw) return false;
    const info = JSON.parse(raw);
    return info && info.authenticated === true;
  } catch (e) {
    return false;
  }
}

/**
 * Get the current user's access token (with automatic refresh)
 */
export async function getAccessToken() {
  const user = await getUser();
  
  // If token is expired or about to expire, try to refresh
  if (user && user.expired) {
    try {
      const manager = getUserManager();
      const renewedUser = await manager.signinSilent();
      return renewedUser.access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return null;
    }
  }
  
  return user?.access_token || null;
}

/**
 * Get the current user's ID token
 */
export async function getIdToken() {
  const user = await getUser();
  return user?.id_token || null;
}

/**
 * Get the current user info
 */
export async function getUserInfo() {
  const user = await getUser();
  if (user && user.profile) return user.profile;

  // Fallbacks:
  // 1) Check manually-stored OIDC profile from token-exchange in sessionStorage/localStorage
  try {
    let info = sessionStorage.getItem('oidc_user_info') || localStorage.getItem('oidc_user_info');
    if (info) return JSON.parse(info);
  } catch (e) {
    // ignore
  }

  // 2) Legacy passkeyAuth stored profile
  try {
    const raw = localStorage.getItem('passkeyAuth');
    if (!raw) return null;
    const info = JSON.parse(raw);
    if (!info || !info.username) return null;
    return {
      preferred_username: info.username,
      name: info.displayName || info.username
    };
  } catch (e) {
    return null;
  }
}

/**
 * Store authentication tokens (legacy support for manual storage)
 */
export function storeTokens(accessToken, idToken, userInfo) {
  // Persist token-exchange tokens to localStorage so SPA state survives page reloads
  try {
    if (accessToken) localStorage.setItem('oidc_access_token', accessToken);
    if (idToken) localStorage.setItem('oidc_id_token', idToken);
    if (userInfo) localStorage.setItem('oidc_user_info', JSON.stringify(userInfo));
  } catch (e) {
    console.warn('Failed to persist tokens to localStorage:', e);
  }
}

/**
 * Clear authentication state
 */
export function clearTokens() {
  // Clear tokens from both sessionStorage and localStorage
  sessionStorage.removeItem('oidc_access_token');
  sessionStorage.removeItem('oidc_id_token');
  sessionStorage.removeItem('oidc_user_info');
  try {
    localStorage.removeItem('oidc_access_token');
    localStorage.removeItem('oidc_id_token');
    localStorage.removeItem('oidc_user_info');
  } catch (e) {
    // ignore
  }
  
  // Clear oidc-client-ts storage keys
  const keysToRemove = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith('oidc.')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => sessionStorage.removeItem(key));
  // Also clear passkey-based session state
  try {
    localStorage.removeItem('passkeyAuth');
  } catch (e) {
    // ignore
  }
}

/**
 * Sign out the user
 */
export async function signOut() {
  const manager = getUserManager();
  // The id_token_hint will be included automatically via includeIdTokenHint config
  await manager.signoutRedirect();
}
