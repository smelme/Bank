# Token Refresh and Session Persistence Fix

## Problem
When refreshing the admin portal, users were being logged out and couldn't sign back in until manually deleting the `admin_token` from localStorage. This was caused by:
1. Expired tokens remaining in localStorage even after they were invalid
2. No automatic token refresh mechanism
3. API errors (401/403) not properly clearing invalid tokens

## Solution Implemented

### 1. Automatic Token Expiration Handling
**File:** `public/admin-portal/admin-app.js`

Modified the `fetchAPI()` function to automatically detect and handle expired or invalid tokens:
- Detects 401 (Unauthorized) and 403 (Forbidden) responses
- Automatically clears invalid tokens from localStorage
- Clears application state (token and admin info)
- Redirects to login screen
- Prevents the "stale token" issue where users couldn't re-login

### 2. Automatic Token Refresh
**Frontend:** `public/admin-portal/admin-app.js`

Added automatic token refresh functionality:
- `startTokenRefresh()` - Sets up an interval to refresh the token every hour
- `stopTokenRefresh()` - Clears the refresh interval on logout
- Token is automatically refreshed while the user is active
- Refresh happens 1 hour before the 8-hour expiration

**Backend:** `server.js`

Added new endpoint:
```
POST /admin/refresh
```
- Validates the current token
- Issues a new token with a fresh 8-hour expiration
- Returns the new token and admin info

### 3. Session Lifecycle Management

**On Login:**
1. User enters credentials
2. Server validates and returns token (8-hour expiration)
3. Token saved to localStorage
4. Token refresh interval starts
5. User can use the admin portal

**During Active Session:**
1. Every hour, the token is automatically refreshed
2. All API calls include the Bearer token
3. If any API call returns 401/403, token is cleared and user redirected to login

**On Logout:**
1. Token refresh interval is stopped
2. Token and admin state are cleared
3. localStorage is cleaned
4. User redirected to login screen

**On Page Refresh:**
1. App checks for existing token in localStorage
2. Validates token with server via `/admin/me`
3. If valid: app loads and refresh interval starts
4. If invalid: token cleared, user redirected to login

## Key Changes

### server.js
- Added `/admin/refresh` endpoint for token renewal

### admin-app.js
- Enhanced `fetchAPI()` to handle 401/403 responses
- Added `startTokenRefresh()` and `stopTokenRefresh()` functions
- Modified `initializeApp()` to start token refresh on successful verification
- Modified `handleLogin()` to start token refresh after successful login
- Modified `handleLogout()` to stop token refresh on logout

## Benefits
1. ✅ Sessions persist across page refreshes
2. ✅ No manual token deletion needed
3. ✅ Active users stay logged in (token auto-refreshes)
4. ✅ Invalid tokens are automatically cleared
5. ✅ Smooth user experience with no interruptions
6. ✅ Secure - expired tokens are properly rejected

## Token Expiration Timeline
- **Initial Token:** 8 hours from login
- **Refresh Interval:** Every 1 hour
- **Maximum Session:** Unlimited (as long as user is active)
- **Inactive Session:** Expires after 8 hours of no activity

## Testing
To test the fix:
1. Login to the admin portal
2. Refresh the page - you should stay logged in
3. Wait for token to expire (or manually test with an expired token)
4. Try to make an API call - you should be redirected to login
5. Login again - should work without needing to clear localStorage
