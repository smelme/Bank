import { requestCredentials } from '/lib/id-verifier.min.js';
import { initI18n, t } from './i18n.js';

let verifiedData = null;
let selectedAccountType = null;

// Initialize i18n (language selector + initial translations)
initI18n();

// Step navigation
function showStep(stepId) {
    document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
    document.getElementById(stepId).classList.remove('hidden');
}

// Start registration
document.getElementById('startBtn').addEventListener('click', () => {
    showStep('step-verify');
});

// Account type selection
document.querySelectorAll('.account-type').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.account-type').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedAccountType = card.dataset.type;
        validateForm();
    });
});

// Form validation
function validateForm() {
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
    const city = document.getElementById('city').value;
    const terms = document.getElementById('terms').checked;

    const isValid = email && phone && address && city && terms && selectedAccountType;
    document.getElementById('submitBtn').disabled = !isValid;
}

// Add event listeners for form validation
['email', 'phone', 'address', 'city', 'state', 'zipCode'].forEach(id => {
    document.getElementById(id).addEventListener('input', validateForm);
});
document.getElementById('terms').addEventListener('change', validateForm);

// Verify identity
document.getElementById('verifyBtn').addEventListener('click', async () => {
    const resultDiv = document.getElementById('verifyResult');
    resultDiv.innerHTML = `<div class="loading">${t('loadingInitVerification')}</div>`;

    try {
        // 1. Get request parameters from backend
    resultDiv.innerHTML = `<div class="loading">${t('loadingFetchParams')}</div>`;
        const paramsResponse = await fetch('/request-params');
    if (!paramsResponse.ok) throw new Error(t('failedToGetParams'));
        const { requestParams, nonce } = await paramsResponse.json();

        // 2. Request credentials from wallet (DCAPI)
    resultDiv.innerHTML = `<div class="loading">${t('loadingRequestWallet')}</div>`;
        const credentials = await requestCredentials(requestParams);

        // 3. Send credentials to backend for verification
    resultDiv.innerHTML = `<div class="loading">${t('loadingVerifyCreds')}</div>`;
        const verifyResponse = await fetch('/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ credentials, nonce })
        });

        const result = await verifyResponse.json();
        
        if (!result.success) {
            throw new Error(result.error || t('verificationFailed'));
        }

        if (result.validationErrors && result.validationErrors.length > 0) {
            resultDiv.innerHTML = `<div class="error-box">
                <strong>${t('verificationIssues')}:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    ${result.validationErrors.map(err => `<li>${err}</li>`).join('')}
                </ul>
            </div>`;
            return;
        }

        verifiedData = result;
        displayVerifiedData();
        showStep('step-account');

    } catch (error) {
        resultDiv.innerHTML = `<div class="error-box">${t('errorPrefix')} ${error.message}</div>`;
        console.error(error);
    }
});

// Display verified data
function displayVerifiedData() {
    const display = document.getElementById('verifiedDataDisplay');
    const data = verifiedData.claims;
    
    let html = `<h3>${t('verifiedInformation')}</h3>`;
    
    // Convert portrait byte array to base64 image if needed
    if (data.portrait) {
        let portraitSrc = null;
        if (typeof data.portrait === 'object' && !data.portrait.startsWith) {
            // Convert byte array object to Uint8Array then to base64
            const bytes = new Uint8Array(Object.values(data.portrait));
            const base64 = btoa(String.fromCharCode(...bytes));
            portraitSrc = `data:image/jpeg;base64,${base64}`;
        } else if (typeof data.portrait === 'string') {
            portraitSrc = data.portrait;
        }
        
        if (portraitSrc) {
            html += `<img src="${portraitSrc}" class="portrait" alt="Portrait">`;
        }
    }
    
    // Map sex codes to readable values
    const genderMap = {
        'F': 'Female',
        'M': 'Male',
        'X': 'Non-binary',
        '1': 'Male',
        '2': 'Female',
        '0': 'Not specified'
    };
    
    html += '<div>';
    if (data.given_name) html += `<div class="data-item"><span class="data-label">${t('firstName')}:</span><span class="data-value">${data.given_name}</span></div>`;
    if (data.family_name) html += `<div class="data-item"><span class="data-label">${t('lastName')}:</span><span class="data-value">${data.family_name}</span></div>`;
    if (data.birth_date) html += `<div class="data-item"><span class="data-label">${t('dateOfBirth')}:</span><span class="data-value">${data.birth_date}</span></div>`;
    if (data.sex) {
        const gender = genderMap[data.sex] || data.sex;
        html += `<div class="data-item"><span class="data-label">${t('gender')}:</span><span class="data-value">${gender}</span></div>`;
    }
    if (data.document_number) html += `<div class="data-item"><span class="data-label">${t('documentNumber')}:</span><span class="data-value">${data.document_number}</span></div>`;
    if (data.issuing_authority) html += `<div class="data-item"><span class="data-label">${t('issuingAuthority')}:</span><span class="data-value">${data.issuing_authority}</span></div>`;
    if (data.expiry_date) html += `<div class="data-item"><span class="data-label">${t('expiryDate')}:</span><span class="data-value">${data.expiry_date}</span></div>`;
    html += '</div>';
    
    display.innerHTML = html;
}

// Submit account creation
document.getElementById('submitBtn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = t('creatingAccount');

    try {
        const accountData = {
            verifiedData: verifiedData,
            accountType: selectedAccountType,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zipCode: document.getElementById('zipCode').value
        };

        const response = await fetch('/create-account', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(accountData)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Account creation failed');
        }

        // Display success
        const accountDetails = document.getElementById('accountDetails');
        accountDetails.innerHTML = `
            <h3>${t('yourAccountInformation')}</h3>
            <div class="data-item"><span class="data-label">${t('accountNumberLabel')}:</span><span class="data-value">${result.account.accountNumber}</span></div>
            <div class="data-item"><span class="data-label">${t('accountTypeLabel')}:</span><span class="data-value">${result.account.accountType.charAt(0).toUpperCase() + result.account.accountType.slice(1)}</span></div>
            <div class="data-item"><span class="data-label">${t('accountHolder')}:</span><span class="data-value">${result.account.fullName}</span></div>
            <div class="data-item"><span class="data-label">Email:</span><span class="data-value">${result.account.email}</span></div>
            <div class="data-item"><span class="data-label">${t('createdLabel')}:</span><span class="data-value">${new Date(result.account.createdAt).toLocaleString()}</span></div>
        `;
        showStep('step-success');

    } catch (error) {
        alert(`${t('errorPrefix')} ${error.message}`);
        submitBtn.disabled = false;
        submitBtn.textContent = t('createAccount');
    }
});
