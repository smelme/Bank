import { requestCredentials } from '/lib/id-verifier.min.js';

let verifiedData = null;
let selectedAccountType = null;

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
    resultDiv.innerHTML = '<div class="loading">Initializing verification...</div>';

    try {
        // 1. Get request parameters from backend
        resultDiv.innerHTML = '<div class="loading">Fetching request parameters...</div>';
        const paramsResponse = await fetch('/request-params');
        if (!paramsResponse.ok) throw new Error('Failed to get params');
        const { requestParams, nonce } = await paramsResponse.json();

        // 2. Request credentials from wallet (DCAPI)
        resultDiv.innerHTML = '<div class="loading">Requesting credentials from wallet...</div>';
        const credentials = await requestCredentials(requestParams);

        // 3. Send credentials to backend for verification
        resultDiv.innerHTML = '<div class="loading">Verifying credentials...</div>';
        const verifyResponse = await fetch('/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ credentials, nonce })
        });

        const result = await verifyResponse.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Verification failed');
        }

        if (result.validationErrors && result.validationErrors.length > 0) {
            resultDiv.innerHTML = `<div class="error-box">
                <strong>Verification Issues:</strong>
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
        resultDiv.innerHTML = `<div class="error-box">Error: ${error.message}</div>`;
        console.error(error);
    }
});

// Display verified data
function displayVerifiedData() {
    const display = document.getElementById('verifiedDataDisplay');
    const data = verifiedData.claims;
    
    let html = '<h3>✓ Verified Information</h3>';
    
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
    if (data.given_name) html += `<div class="data-item"><span class="data-label">First Name:</span><span class="data-value">${data.given_name}</span></div>`;
    if (data.family_name) html += `<div class="data-item"><span class="data-label">Last Name:</span><span class="data-value">${data.family_name}</span></div>`;
    if (data.birth_date) html += `<div class="data-item"><span class="data-label">Date of Birth:</span><span class="data-value">${data.birth_date}</span></div>`;
    if (data.sex) {
        const gender = genderMap[data.sex] || data.sex;
        html += `<div class="data-item"><span class="data-label">Gender:</span><span class="data-value">${gender}</span></div>`;
    }
    if (data.document_number) html += `<div class="data-item"><span class="data-label">Document Number:</span><span class="data-value">${data.document_number}</span></div>`;
    if (data.issuing_authority) html += `<div class="data-item"><span class="data-label">Issuing Authority:</span><span class="data-value">${data.issuing_authority}</span></div>`;
    if (data.expiry_date) html += `<div class="data-item"><span class="data-label">Expiry Date:</span><span class="data-value">${data.expiry_date}</span></div>`;
    html += '</div>';
    
    display.innerHTML = html;
}

// Submit account creation
document.getElementById('submitBtn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

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
            <h3>Your Account Information</h3>
            <div class="data-item"><span class="data-label">Account Number:</span><span class="data-value">${result.account.accountNumber}</span></div>
            <div class="data-item"><span class="data-label">Account Type:</span><span class="data-value">${result.account.accountType.charAt(0).toUpperCase() + result.account.accountType.slice(1)}</span></div>
            <div class="data-item"><span class="data-label">Account Holder:</span><span class="data-value">${result.account.fullName}</span></div>
            <div class="data-item"><span class="data-label">Email:</span><span class="data-value">${result.account.email}</span></div>
            <div class="data-item"><span class="data-label">Created:</span><span class="data-value">${new Date(result.account.createdAt).toLocaleString()}</span></div>
        `;
        showStep('step-success');

    } catch (error) {
        alert('Error: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
    }
});
