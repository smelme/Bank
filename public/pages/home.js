import { initI18n, t } from '../core/i18n.js';

// Initialize i18n (language selector + initial translations)
initI18n();

// Check session and load account data
async function loadAccount() {
    const sessionToken = sessionStorage.getItem('sessionToken');

    if (!sessionToken) {
        showError(t('noActiveSession'));
        return;
    }

    try {
        const response = await fetch('/get-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionToken })
        });

        const result = await response.json();

        if (!result.success) {
            showError(result.error || t('failedLoadAccount'));
            return;
        }

        displayAccount(result.account);

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

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
    const sessionToken = sessionStorage.getItem('sessionToken');
    
    if (sessionToken) {
        try {
            await fetch('/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ sessionToken })
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    sessionStorage.removeItem('sessionToken');
    window.location.href = 'signin.html';
});

// Load account on page load
loadAccount();
