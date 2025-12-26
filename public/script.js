import { requestCredentials } from '/lib/id-verifier.min.js';
import { t } from './i18n.js';

let verifiedData = null;
let selectedAccountType = null;

// Initialize i18n when DOM is ready (landing.js will handle the toggle UI)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const lang = localStorage.getItem('tamange.lang') || 'en';
        import('./i18n.js').then(i18n => {
            i18n.setLanguage(lang);
        });
    });
} else {
    const lang = localStorage.getItem('tamange.lang') || 'en';
    import('./i18n.js').then(i18n => {
        i18n.setLanguage(lang);
    });
}

// Step id → numeric index mapping
const stepOrder = ['step-welcome', 'step-verify', 'step-details', 'step-confirm'];

// Hero content per step (title + intro)
const heroContent = {
  'step-welcome': {
    titleKey: 'welcomeTitle',
    titleDefault: 'Welcome to Tamange Bank',
    introKey: 'welcomeIntro',
    introDefault: 'Open your bank account in minutes using your mobile driver\'s license or digital ID. We\'ll securely verify your identity using the latest digital credentials technology.'
  },
  'step-verify': {
    titleKey: 'verifyYourIdentity',
    titleDefault: 'Verify Your Identity',
    introKey: 'verifyHelpText',
    introDefault: 'Click the button below to share your digital credentials. We will request your name, date of birth, and document details.'
  },
  'step-details': {
    titleKey: 'completeRegistration',
    titleDefault: 'Complete Your Registration',
    introKey: 'completeRegistrationIntro',
    introDefault: 'Choose your account type and provide your contact information to finish setting up your account.'
  },
  'step-confirm': {
    titleKey: 'accountCreatedSuccessfully',
    titleDefault: 'Account Created Successfully!',
    introKey: 'confirmIntro',
    introDefault: 'Your account is now active. You can sign in using your digital ID.'
  }
};

// Step navigation
function showStep(stepId) {
    // Hide all cards
    document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
    document.getElementById(stepId)?.classList.remove('hidden');

    // Update stepper indicator
    const idx = stepOrder.indexOf(stepId);
    document.querySelectorAll('.stepper-step').forEach(li => {
        const liIdx = parseInt(li.getAttribute('data-step'), 10);
        li.classList.remove('active', 'completed');
        if (liIdx < idx) li.classList.add('completed');
        else if (liIdx === idx) li.classList.add('active');
    });

    // Update hero title/intro
    const hero = heroContent[stepId];
    if (hero) {
        const titleEl = document.getElementById('heroTitle');
        const introEl = document.getElementById('heroIntro');
        if (titleEl) {
            const titleTranslation = t(hero.titleKey);
            titleEl.textContent = (titleTranslation !== hero.titleKey) ? titleTranslation : hero.titleDefault;
        }
        if (introEl) {
            const introTranslation = t(hero.introKey);
            introEl.textContent = (introTranslation !== hero.introKey) ? introTranslation : hero.introDefault;
        }
    }
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
    
    // Hide error message when user makes changes
    const errorDisplay = document.getElementById('registrationError');
    if (errorDisplay && !errorDisplay.classList.contains('hidden')) {
        errorDisplay.classList.add('hidden');
    }
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
        // SPA view uses "step-details" as the post-verification step
        showStep('step-details');
        // Show verified photo if available
        showVerifiedPhoto();

    } catch (error) {
        resultDiv.innerHTML = `<div class="error-box">${t('errorPrefix')} ${error.message}</div>`;
        console.error(error);
    }
});

// Display verified data
function displayVerifiedData() {
    // Older non-SPA markup had a dedicated verified data display area.
    // In the SPA registration view we don't render claims separately, so treat this as optional.
    const display = document.getElementById('verifiedDataDisplay');
    if (!display) return;
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

// Show verified photo in step-details
function showVerifiedPhoto() {
    if (!verifiedData || !verifiedData.claims) return;
    
    const photoDisplay = document.getElementById('verifiedPhotoDisplay');
    const photoImg = document.getElementById('verifiedPhoto');
    if (!photoDisplay || !photoImg) return;
    
    const portrait = verifiedData.claims.portrait;
    if (!portrait) return;
    
    let portraitSrc = null;
    if (typeof portrait === 'object' && !portrait.startsWith) {
        // Convert byte array object to Uint8Array then to base64
        const bytes = new Uint8Array(Object.values(portrait));
        const base64 = btoa(String.fromCharCode(...bytes));
        portraitSrc = `data:image/jpeg;base64,${base64}`;
    } else if (typeof portrait === 'string') {
        portraitSrc = portrait;
    }
    
    if (portraitSrc) {
        photoImg.src = portraitSrc;
        photoDisplay.classList.remove('hidden');
    }
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
    // SPA view uses "step-confirm" for success
    showStep('step-confirm');

    } catch (error) {
        // Display error message on page instead of alert
        const errorDisplay = document.getElementById('registrationError');
        const errorText = document.getElementById('registrationErrorText');
        if (errorDisplay && errorText) {
            errorText.textContent = error.message;
            errorDisplay.classList.remove('hidden');
            // Scroll to error message
            errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        submitBtn.disabled = false;
        submitBtn.textContent = t('createAccount');
    }
});
