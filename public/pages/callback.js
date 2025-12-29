/**
 * OAuth2 Callback Handler
 * 
 * This page handles the redirect from Keycloak after successful authentication.
 * It extracts the authorization code, exchanges it for tokens, and stores them.
 */

import { getUserManager, storeTokens } from '/core/oidc-config.js';

export async function spaMount() {
  try {
    const userManager = getUserManager();
    
    // Process the callback - exchanges code for tokens
    const user = await userManager.signinRedirectCallback();
    
    if (user && user.access_token) {
      // Store tokens in session storage (UserManager also stores in its own format)
      storeTokens(user.access_token, user.id_token, user.profile);
      
      console.log('User signed in:', user.profile);
      
      // Redirect to home page
      if (window.__spaNavigate) {
        window.__spaNavigate('/home', { replace: true });
      } else {
        window.location.href = '/home';
      }
    } else {
      throw new Error('No user data received from Keycloak');
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Show error message
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `
        <div class="container" style="padding: 24px 0;">
          <div class="error-box">
            <h2>Sign In Failed</h2>
            <p>${error.message || 'An error occurred during sign in.'}</p>
            <button id="backToSignIn" class="btn-primary" style="margin-top: 16px;">
              Back to Sign In
            </button>
          </div>
        </div>
      `;
      
      document.getElementById('backToSignIn')?.addEventListener('click', () => {
        if (window.__spaNavigate) {
          window.__spaNavigate('/signin');
        } else {
          window.location.href = '/signin';
        }
      });
    }
  }
  
  // No teardown needed
  return () => {};
}
