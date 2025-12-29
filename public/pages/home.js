import { t } from '../core/i18n.js';
import { getAccessToken, getUserInfo, isAuthenticated, signOut } from '/core/oidc-config.js';

// Check session and load account data
async function loadAccount() {
    // Check for OIDC authentication (now async)
    const authenticated = await isAuthenticated();
    if (!authenticated) {
        showError(t('noActiveSession'));
        return;
    }

    const userInfo = await getUserInfo();
    const accessToken = await getAccessToken();

    if (!userInfo) {
        showError('Unable to load user information');
        return;
    }

    try {
        // For now, display user info from Keycloak
        // Later you can fetch additional account data from your backend
        displayAccount({
            fullName: userInfo.name || userInfo.preferred_username || 'User',
            email: userInfo.email || 'N/A',
            accountNumber: 'XXXX-' + (userInfo.sub ? userInfo.sub.slice(-4) : '0000'),
            accountType: 'checking',
            username: userInfo.preferred_username
        });

        // Optional: Validate token with backend (non-blocking)
        if (accessToken) {
            try {
                const response = await fetch('/api/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                });

                if (response.ok) {
                    const backendUserInfo = await response.json();
                    console.log('User info validated with backend:', backendUserInfo);
                } else {
                    console.warn('Backend validation failed:', response.status, response.statusText);
                }
            } catch (validationError) {
                console.warn('Backend validation error (non-critical):', validationError);
            }
        }

    } catch (error) {
        console.error('Error loading account:', error);
        showError(t('failedLoadAccountTryAgain'));
    }
}

function displayAccount(account) {
    // Hide loading, show dashboard
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('dashboardSection').style.display = 'grid';

    // Header
    document.getElementById('userName').textContent = account.fullName;

    // Main account info
    document.getElementById('accountHolderName').textContent = account.fullName;
    document.getElementById('accountNumber').textContent = account.accountNumber;
    document.getElementById('accountType').textContent = account.accountType.charAt(0).toUpperCase() + account.accountType.slice(1) + ' Account';
    
    // Balance (mock data - in real app, fetch from database)
    const balance = account.accountType === 'savings' ? '$10,000.00' : '$2,500.00';
    document.getElementById('accountBalance').textContent = balance;

    // Sidebar details
    document.getElementById('accountEmail').textContent = account.email;
    document.getElementById('accountPhone').textContent = account.phone;
    
    const createdDate = new Date(account.createdAt);
    document.getElementById('memberSince').textContent = createdDate.toLocaleDateString();
    document.getElementById('accountCreatedDate').textContent = createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString();
}

function showError(message) {
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('errorSection').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

function initLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    const logoutHandler = async () => {
        // Use OIDC logout with UserManager
        try {
            await signOut();
        } catch (error) {
            console.error('Logout error:', error);
            // Fallback: clear tokens and redirect manually
            const { clearTokens } = await import('/core/oidc-config.js');
            clearTokens();
            window.location.href = '/';
        }
    };

    logoutBtn.addEventListener('click', logoutHandler);
    
    // Return cleanup function
    return () => {
        logoutBtn.removeEventListener('click', logoutHandler);
    };
}

// SPA mount function
export async function spaMount() {
    // Initialize logout button
    const cleanupLogout = initLogoutButton();
    
    // Load account data
    await loadAccount();
    
    // Return cleanup function
    return () => {
        if (cleanupLogout) cleanupLogout();
    };
}

// For standalone page loads (non-SPA)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', spaMount);
} else {
    spaMount();
}
