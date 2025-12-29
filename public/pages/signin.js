/**
 * Sign In Page - Passkey and Keycloak OIDC Integration
 * 
 * This page offers two authentication methods:
 * 1. Sign in with Passkey (passwordless biometric authentication)
 * 2. Sign in with Keycloak (traditional OIDC redirect flow)
 * 
 * The original digital ID verification logic has been preserved below
 * and can be re-enabled or used for additional verification steps.
 */

import { getUserManager, storeTokens } from '/core/oidc-config.js';
import { startAuthentication } from 'https://unpkg.com/@simplewebauthn/browser@10.0.0/dist/bundle/index.js';

// === Passkey Sign-In (Primary Method) ===

async function handlePasskeySignIn() {
  const resultDiv = document.getElementById('verifyResult');
  
  // Prompt for username
  const username = prompt('Enter your username:');
  if (!username) {
    resultDiv.innerHTML = '<div class="error-box">Username is required for passkey sign-in.</div>';
    return;
  }
  
  resultDiv.innerHTML = '<div class="loading">Starting passkey authentication...</div>';
  
  try {
    // Step 1: Get authentication options from server
    const optionsResponse = await fetch('/v1/passkeys/auth/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (!optionsResponse.ok) {
      const errorData = await optionsResponse.json();
      throw new Error(errorData.error || 'Failed to get authentication options');
    }
    
    const options = await optionsResponse.json();
    
    // Step 2: Start WebAuthn authentication ceremony
    resultDiv.innerHTML = '<div class="loading">Please authenticate with your biometric device...</div>';
    
    const authenticationResponse = await startAuthentication(options);
    
    // Step 3: Verify the authentication response
    resultDiv.innerHTML = '<div class="loading">Verifying authentication...</div>';
    
    const verifyResponse = await fetch('/v1/passkeys/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        credential: authenticationResponse
      })
    });
    
    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.json();
      throw new Error(errorData.error || 'Authentication verification failed');
    }
    
    const verifyData = await verifyResponse.json();
    
        // Step 4: Store authentication state and redirect to home
        // If server performed a Keycloak token-exchange, persist the tokens so the SPA
        // can use them as an authenticated session. Otherwise fall back to passkeyAuth.
        try {
            if (verifyData && verifyData.tokenExchange && verifyData.tokenExchange.access_token) {
                // Persist tokens (sessionStorage) and a minimal user info object
                const accessToken = verifyData.tokenExchange.access_token;
                const idToken = verifyData.tokenExchange.id_token || null;
                const userInfo = { preferred_username: verifyData.username, name: verifyData.username };
                storeTokens(accessToken, idToken, userInfo);
                // Remove legacy passkeyAuth if present
                try { localStorage.removeItem('passkeyAuth'); } catch (e) {}
            } else {
                // Legacy fallback for SPA UI while Keycloak integration isn't enabled
                localStorage.setItem('passkeyAuth', JSON.stringify({
                    username,
                    authenticated: true,
                    timestamp: Date.now()
                }));
            }

            // Update header/nav state if available
            try {
                const hdr = await import('../core/header.js');
                if (hdr && hdr.refreshNavState) hdr.refreshNavState();
            } catch (e) {
                // ignore
            }
        } catch (e) {
            console.warn('Failed to persist token-exchange result locally:', e);
        }
    
    resultDiv.innerHTML = '<div class="success-box">✓ Authentication successful! Redirecting to home...</div>';
    
    // Redirect to home page after 1 second
    setTimeout(() => {
      window.location.href = '/home';
    }, 1000);
    
  } catch (error) {
    console.error('Passkey sign-in error:', error);
    resultDiv.innerHTML = `<div class="error-box">Passkey authentication failed: ${error.message}</div>`;
  }
}

// === OIDC Sign-In (Alternative Method) ===

async function handleKeycloakSignIn() {
  const resultDiv = document.getElementById('verifyResult');
  resultDiv.innerHTML = '<div class="loading">Redirecting to Keycloak sign in...</div>';
  
  try {
    const userManager = getUserManager();
    
    // This will redirect to Keycloak login page
    await userManager.signinRedirect({
      state: { returnUrl: '/home' }
    });
  } catch (error) {
    console.error('Keycloak sign in error:', error);
    resultDiv.innerHTML = `<div class="error-box">Failed to initiate Keycloak sign in: ${error.message}</div>`;
  }
}

export async function spaMount() {
  const resultDiv = document.getElementById('verifyResult');
  
  // Replace the single button with two options
  const signInContainer = document.getElementById('step-verify');
  const verifyBtn = document.getElementById('verifyBtn');
  
  if (verifyBtn && signInContainer) {
    // Create new UI with both options
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '30px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    
    // Passkey Sign-In Button (Primary)
    const passkeyBtn = document.createElement('button');
    passkeyBtn.className = 'btn-primary';
    passkeyBtn.textContent = '🔐 Sign In with Passkey';
    passkeyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handlePasskeySignIn();
    });
    
    // Keycloak Sign-In Button (Alternative)
    const keycloakBtn = document.createElement('button');
    keycloakBtn.className = 'btn-secondary';
    keycloakBtn.textContent = 'Sign In with Keycloak';
    keycloakBtn.style.backgroundColor = '#6c757d';
    keycloakBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleKeycloakSignIn();
    });
    
    // Add hint text
    const hintText = document.createElement('p');
    hintText.style.marginTop = '10px';
    hintText.style.fontSize = '0.9em';
    hintText.style.color = '#666';
    hintText.textContent = 'Use passkey for passwordless biometric authentication, or sign in with Keycloak for traditional login.';
    
    buttonContainer.appendChild(passkeyBtn);
    buttonContainer.appendChild(keycloakBtn);
    buttonContainer.appendChild(hintText);
    
    // Replace old button with new container
    verifyBtn.replaceWith(buttonContainer);
  }
  
  // Return teardown function
  return () => {
    // Cleanup if needed
  };
}

// === Original Digital ID Verification Logic (Preserved) ===
// This can be used later for additional verification or 2FA

import { requestCredentials } from '/lib/id-verifier.min.js';
import * as faceapi from '/node_modules/@vladmandic/face-api/dist/face-api.esm.js';
import { initI18n, t } from '../core/i18n.js';

let verificationToken = null;
let videoStream = null;
let capturedImageData = null;
let portraitImageData = null;
let modelsLoaded = false;

// Load face-api models
async function loadModels() {
    try {
        const modelPath = '/models';
        await faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromUri(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath);
        modelsLoaded = true;
        console.log('Face recognition models loaded');
    } catch (error) {
        console.error('Failed to load face recognition models:', error);
    }
}

// Initialize models on page load
loadModels();

// Initialize i18n when DOM is ready (header.js will handle the toggle UI)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const lang = localStorage.getItem('tamange.lang') || 'en';
        import('../core/i18n.js').then(i18n => {
            i18n.setLanguage(lang);
        });
    });
} else {
    const lang = localStorage.getItem('tamange.lang') || 'en';
    import('../core/i18n.js').then(i18n => {
        i18n.setLanguage(lang);
    });
}

// Show/hide steps
function showStep(stepId) {
    document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
    document.getElementById(stepId).classList.remove('hidden');
}

// Display verified data
function displayVerifiedData(claims) {
    const display = document.getElementById('verifiedDataDisplay');
    
    let html = '<h3>Digital ID Verified</h3>';
    html += '<div>';
    if (claims.given_name) html += `<div class="data-item"><span class="data-label">First Name:</span><span class="data-value">${claims.given_name}</span></div>`;
    if (claims.family_name) html += `<div class="data-item"><span class="data-label">Last Name:</span><span class="data-value">${claims.family_name}</span></div>`;
    if (claims.document_number) html += `<div class="data-item"><span class="data-label">Document Number:</span><span class="data-value">${claims.document_number}</span></div>`;
    html += '</div>';
    
    display.innerHTML = html;
}

// Step 1: Verify Digital ID
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
    resultDiv.innerHTML = `<div class="loading">${t('verifyingDigitalId')}</div>`;
        const verifyResponse = await fetch('/signin-verify', {
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

        // Store verification token and portrait image data
        verificationToken = result.verificationToken;
        portraitImageData = result.portraitData; // We'll need to add this to the response
        displayVerifiedData(result.claims);
        showStep('step-biometric');

    } catch (error) {
        resultDiv.innerHTML = `<div class="error-box">${t('errorPrefix')} ${error.message}</div>`;
        console.error(error);
    }
});

// Step 2: Camera Access
document.getElementById('startCameraBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('cameraStatus');
    
    try {
    statusDiv.innerHTML = `<div class="loading">${t('requestingCameraAccess')}</div>`;
        
        // Request camera access
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });

        // Display video stream
        const video = document.getElementById('video');
        video.srcObject = videoStream;
        
        document.getElementById('videoContainer').classList.remove('hidden');
        document.getElementById('startCameraBtn').classList.add('hidden');
        document.getElementById('captureBtn').classList.remove('hidden');
    statusDiv.innerHTML = `<div class="info-box"><p><strong>${t('cameraActiveTitle')}</strong></p><p>${t('cameraActiveHelp')}</p></div>`;

    } catch (error) {
        console.error('Camera access error:', error);
        statusDiv.innerHTML = `<div class="error-box"><strong>${t('cameraAccessDenied')}</strong><br>${error.message}<br>${t('allowCameraAccess')}</div>`;
    }
});

// Capture photo
document.getElementById('captureBtn').addEventListener('click', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert canvas to base64 image
    capturedImageData = canvas.toDataURL('image/jpeg', 0.95);

    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    // Show preview
    const preview = document.getElementById('capturePreview');
    preview.innerHTML = `<img src="${capturedImageData}" alt="Captured photo">`;
    preview.classList.remove('hidden');

    // Hide video, show retake and verify buttons
    document.getElementById('videoContainer').classList.add('hidden');
    document.getElementById('captureBtn').classList.add('hidden');
    document.getElementById('retakeBtn').classList.remove('hidden');

    // Show verification message
    document.getElementById('cameraStatus').innerHTML = `<div class="loading">${t('photoCapturedVerifying')}</div>`;

    // Automatically verify
    verifyBiometric();
});

// Retake photo
document.getElementById('retakeBtn').addEventListener('click', async () => {
    capturedImageData = null;
    document.getElementById('capturePreview').classList.add('hidden');
    document.getElementById('retakeBtn').classList.add('hidden');
    
    // Restart camera
    document.getElementById('startCameraBtn').click();
});

// Biometric verification
async function verifyBiometric() {
    const resultDiv = document.getElementById('biometricResult');

    try {
        if (!capturedImageData || !verificationToken || !portraitImageData) {
            throw new Error('Missing required data for verification');
        }

        if (!modelsLoaded) {
            throw new Error(t('faceModelsLoading'));
        }

    resultDiv.innerHTML = `<div class="loading">${t('detectingFace')}</div>`;

        // Create image elements
        const capturedImg = await faceapi.fetchImage(capturedImageData);
        const portraitImg = await faceapi.fetchImage(portraitImageData);

        // Extract face descriptors
    resultDiv.innerHTML = `<div class="loading">${t('analyzingIdPortrait')}</div>`;
        const portraitDetection = await faceapi
            .detectSingleFace(portraitImg)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!portraitDetection) {
            throw new Error(t('couldNotDetectIdFace'));
        }

    resultDiv.innerHTML = `<div class="loading">${t('analyzingCapturedPhoto')}</div>`;
        const capturedDetection = await faceapi
            .detectSingleFace(capturedImg)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!capturedDetection) {
            throw new Error(t('couldNotDetectCapturedFace'));
        }

    resultDiv.innerHTML = `<div class="loading">${t('comparingFaces')}</div>`;

        // Send descriptors to server for verification
        const response = await fetch('/biometric-verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                portraitDescriptor: Array.from(portraitDetection.descriptor),
                capturedDescriptor: Array.from(capturedDetection.descriptor),
                verificationToken: verificationToken
            })
        });

        const result = await response.json();

        if (!result.success) {
            // Show error
            document.getElementById('errorMessage').innerHTML = `<p><strong>${t('verificationFailedTitle')}</strong></p><p>${result.error}</p>`;
            showStep('step-error');
            return;
        }

        // Success - redirect to home page with session token
        sessionStorage.setItem('sessionToken', result.sessionToken);
        
        // Refresh nav state before redirect
        try {
            const header = await import('../core/header.js');
            if (typeof header.refreshNavState === 'function') {
                header.refreshNavState();
            }
        } catch (e) {
            console.warn('Could not refresh nav state:', e);
        }
        
        window.location.href = '/home';

    } catch (error) {
        console.error('Biometric verification error:', error);
        resultDiv.innerHTML = `<div class="error-box">${t('errorPrefix')} ${error.message}</div>`;
    }
}
