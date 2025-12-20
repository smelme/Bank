import { requestCredentials } from '/lib/id-verifier.min.js';
import * as faceapi from '/node_modules/@vladmandic/face-api/dist/face-api.esm.js';

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
        resultDiv.innerHTML = '<div class="loading">Verifying digital ID...</div>';
        const verifyResponse = await fetch('/signin-verify', {
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

        // Store verification token and portrait image data
        verificationToken = result.verificationToken;
        portraitImageData = result.portraitData; // We'll need to add this to the response
        displayVerifiedData(result.claims);
        showStep('step-biometric');

    } catch (error) {
        resultDiv.innerHTML = `<div class="error-box">Error: ${error.message}</div>`;
        console.error(error);
    }
});

// Step 2: Camera Access
document.getElementById('startCameraBtn').addEventListener('click', async () => {
    const statusDiv = document.getElementById('cameraStatus');
    
    try {
        statusDiv.innerHTML = '<div class="loading">Requesting camera access...</div>';
        
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
        statusDiv.innerHTML = '<div class="info-box"><p><strong>Camera Active</strong></p><p>Position your face in the center of the frame and click "Capture & Verify".</p></div>';

    } catch (error) {
        console.error('Camera access error:', error);
        statusDiv.innerHTML = `<div class="error-box"><strong>Camera Access Denied</strong><br>${error.message}<br>Please allow camera access to continue.</div>`;
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
    document.getElementById('cameraStatus').innerHTML = '<div class="loading">Photo captured. Verifying your identity...</div>';

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
            throw new Error('Face recognition models are still loading. Please wait...');
        }

        resultDiv.innerHTML = '<div class="loading">Detecting face in your photo...</div>';

        // Create image elements
        const capturedImg = await faceapi.fetchImage(capturedImageData);
        const portraitImg = await faceapi.fetchImage(portraitImageData);

        // Extract face descriptors
        resultDiv.innerHTML = '<div class="loading">Analyzing ID portrait...</div>';
        const portraitDetection = await faceapi
            .detectSingleFace(portraitImg)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!portraitDetection) {
            throw new Error('Could not detect face in your digital ID portrait.');
        }

        resultDiv.innerHTML = '<div class="loading">Analyzing captured photo...</div>';
        const capturedDetection = await faceapi
            .detectSingleFace(capturedImg)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!capturedDetection) {
            throw new Error('Could not detect your face in the captured photo. Please ensure your face is clearly visible and try again.');
        }

        resultDiv.innerHTML = '<div class="loading">Comparing faces...</div>';

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
            document.getElementById('errorMessage').innerHTML = `<p><strong>Verification Failed</strong></p><p>${result.error}</p>`;
            showStep('step-error');
            return;
        }

        // Success - redirect to home page with session token
        sessionStorage.setItem('sessionToken', result.sessionToken);
        window.location.href = 'home.html';

    } catch (error) {
        console.error('Biometric verification error:', error);
        resultDiv.innerHTML = `<div class="error-box">Error: ${error.message}</div>`;
    }
}
