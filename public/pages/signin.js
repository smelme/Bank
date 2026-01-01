/**
 * Sign In Page - Unified Keycloak OIDC Flow with Orchestrator Identity Provider
 *
 * This page provides a single authentication method through Keycloak OIDC,
 * which delegates passkey authentication to the orchestrator as an identity provider.
 */

import { getUserManager, storeTokens } from '/core/oidc-config.js';

// === Unified Sign-In (Keycloak OIDC with Orchestrator Identity Provider) ===

async function handleUnifiedSignIn() {
  const resultDiv = document.getElementById('verifyResult');
  resultDiv.innerHTML = '<div class="loading">Redirecting to authentication...</div>';

  try {
    const userManager = getUserManager();

    // This will redirect to Keycloak login page, which will use the orchestrator identity provider
    await userManager.signinRedirect({
      state: { returnUrl: '/home' }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    resultDiv.innerHTML = `<div class="error-box">Failed to initiate sign in: ${error.message}</div>`;
  }
}

export async function spaMount() {
  const resultDiv = document.getElementById('verifyResult');
  
  // Check if we're coming from the /authorize endpoint with OIDC parameters
  const oidcParams = sessionStorage.getItem('oidc_params');
  
  // If we have OIDC params, we're doing Digital ID sign-in from auth method selection
  // Keep the Digital ID verification flow as-is
  if (oidcParams) {
    console.log('Digital ID sign-in mode - keeping verification flow');
    
    // Show loading state on the verify button while models load
    const verifyBtn = document.getElementById('verifyBtn');
    if (verifyBtn && !modelsLoaded) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = '⏳ Loading face recognition models...';
      verifyBtn.style.opacity = '0.6';
      
      // Wait for models to load, then enable button
      const checkModels = setInterval(() => {
        if (modelsLoaded) {
          clearInterval(checkModels);
          verifyBtn.disabled = false;
          verifyBtn.textContent = verifyBtn.getAttribute('data-en') || 'Sign In with Digital ID';
          verifyBtn.style.opacity = '1';
        }
      }, 100);
    }
    
    return () => {
      // Cleanup if needed
    };
  }
  
  // Otherwise, this is a direct navigation to /signin
  // Show unified sign-in button that redirects to auth method selection
  const signInContainer = document.getElementById('step-verify');
  const verifyBtn = document.getElementById('verifyBtn');
  
  if (verifyBtn && signInContainer) {
    // Create new UI with single unified sign-in button
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '30px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.alignItems = 'center';
    
    // Unified Sign-In Button
    const unifiedBtn = document.createElement('button');
    unifiedBtn.className = 'btn-primary';
    unifiedBtn.textContent = '🔐 Sign In';
    unifiedBtn.style.fontSize = '1.2em';
    unifiedBtn.style.padding = '15px 30px';
    unifiedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleUnifiedSignIn();
    });
    
    // Add hint text
    const hintText = document.createElement('p');
    hintText.style.marginTop = '10px';
    hintText.style.fontSize = '0.9em';
    hintText.style.color = '#666';
    hintText.style.textAlign = 'center';
    hintText.textContent = 'Secure passwordless authentication powered by passkeys';
    
    buttonContainer.appendChild(unifiedBtn);
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
let modelsLoading = false;

// Load face-api models with progress indicator
async function loadModels() {
    if (modelsLoaded || modelsLoading) return;
    
    modelsLoading = true;
    try {
        console.log('⏳ Loading face recognition models...');
        const modelPath = '/models';
        
        // Load models in parallel for better performance
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
            faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
            faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
        ]);
        
        modelsLoaded = true;
        modelsLoading = false;
        console.log('✓ Face recognition models loaded successfully');
        
        // Enable the verify button if it exists
        const verifyBtn = document.getElementById('verifyBtn');
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = verifyBtn.getAttribute('data-en') || 'Sign In with Digital ID';
        }
    } catch (error) {
        modelsLoading = false;
        console.error('Failed to load face recognition models:', error);
        
        // Show error on button if it exists
        const verifyBtn = document.getElementById('verifyBtn');
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.textContent = 'Failed to load models. Refresh to try again.';
            verifyBtn.style.backgroundColor = '#dc3545';
        }
    }
}

// Start loading models immediately when module is imported
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
    
    // Check if models are loaded before proceeding
    if (!modelsLoaded) {
        resultDiv.innerHTML = `<div class="loading">⏳ Face recognition models are still loading. Please wait...</div>`;
        return;
    }
    
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

        // Check if we're in OIDC flow (coming from /authorize)
        const oidcParams = sessionStorage.getItem('oidc_params');
        
        if (oidcParams) {
            // OIDC flow - complete authorization with Digital ID authentication
            const params = JSON.parse(oidcParams);
            sessionStorage.removeItem('oidc_params'); // Clean up
            
            resultDiv.innerHTML = `<div class="loading">${t('completingAuthentication') || 'Completing authentication...'}</div>`;
            
            // Call backend to generate authorization code for this user
            const authResponse = await fetch('/v1/auth/digitalid/complete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionToken: result.sessionToken,
                    username: params.username,
                    userId: params.userId,
                    client_id: params.client_id,
                    redirect_uri: params.redirect_uri,
                    scope: params.scope,
                    state: params.state,
                    nonce: params.nonce
                })
            });
            
            const authResult = await authResponse.json();
            
            if (!authResult.success) {
                throw new Error(authResult.error || 'Failed to complete authentication');
            }
            
            // Redirect to Keycloak with authorization code
            window.location.href = authResult.redirectUrl;
            
        } else {
            // Direct sign-in (not from OIDC flow) - use legacy flow
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
        }

    } catch (error) {
        console.error('Biometric verification error:', error);
        resultDiv.innerHTML = `<div class="error-box">${t('errorPrefix')} ${error.message}</div>`;
    }
}
