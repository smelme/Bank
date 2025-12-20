import './polyfill.js';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

import {
    createCredentialsRequest,
    processCredentials,
    generateNonce,
    generateJWK,
    DocumentType,
    Claim
} from 'id-verifier';

const app = express();
const port = process.env.PORT || 3001;

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
    console.log(`About to exit with code: ${code}`);
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
// Serve the library files so frontend can import them
app.use('/lib', express.static('node_modules/id-verifier/build'));
app.use('/node_modules', express.static('node_modules'));
app.use('/models', express.static('models'));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// In-memory store for session data (nonce -> jwk)
// In a real app, use a database or secure session store
const sessionStore = new Map();

// In-memory store for accounts (email -> account data)
// In a real app, use a database
const accountsStore = new Map();

// In-memory store for active sessions (sessionToken -> account data)
const sessionTokenStore = new Map();

app.get('/request-params', async (req, res) => {
    try {
        const nonce = generateNonce();
        const jwk = await generateJWK();

        // Store JWK associated with nonce
        sessionStore.set(nonce, jwk);

        const requestParams = createCredentialsRequest({
            documentTypes: [
                // Temporarily commenting out mDL to test PhotoID only
                // DocumentType.MOBILE_DRIVERS_LICENSE
                DocumentType.PHOTO_ID
            ],
            claims: [
                Claim.GIVEN_NAME,
                Claim.FAMILY_NAME,
                Claim.BIRTH_DATE,
                Claim.SEX,
                Claim.PORTRAIT,
                Claim.DOCUMENT_NUMBER,
                Claim.ISSUING_AUTHORITY,
                Claim.EXPIRY_DATE
            ],
            nonce,
            jwk
        });

        // Filter to only include org-iso-mdoc protocol, comment out openid4vp
        const filteredParams = {
            ...requestParams,
            digital: {
                requests: requestParams.digital.requests.filter(req => {
                    // Only keep org-iso-mdoc protocol
                    return req.protocol === 'org-iso-mdoc';
                    // Comment out openid4vp for now
                    // return req.protocol === 'openid4vp-v1-unsigned';
                })
            }
        };

        // Send the params AND the nonce to the frontend
        // The frontend needs the nonce to send it back for verification context
        res.json({ requestParams: filteredParams, nonce });
    } catch (error) {
        console.error('Error generating params:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/verify', async (req, res) => {
    try {
        // Expecting { credentials, nonce } from frontend
        const { credentials, nonce } = req.body;
        
        console.log('Received verification request for nonce:', nonce);

        if (!nonce || !sessionStore.has(nonce)) {
            return res.status(400).json({ success: false, error: 'Invalid or expired nonce' });
        }

        const jwk = sessionStore.get(nonce);
        
        // Clean up used nonce (prevent replay)
        sessionStore.delete(nonce);

        const result = await processCredentials(credentials, {
            nonce,
            jwk,
            origin: process.env.ORIGIN || 'http://localhost:3001'
        });

        console.log('Verification result:', result);

        // Validation checks
        const validationErrors = [];

        // Check age (must be 18+)
        if (result.claims.birth_date) {
            const birthDate = new Date(result.claims.birth_date);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (age < 18) {
                validationErrors.push('You must be at least 18 years old to open an account');
            }
        }

        // Check document expiry
        if (result.claims.expiry_date) {
            const expiryDate = new Date(result.claims.expiry_date);
            const today = new Date();
            if (expiryDate < today) {
                validationErrors.push('Your document has expired. Please renew your ID before proceeding');
            }
        }

        res.json({ 
            success: true, 
            claims: result.claims,
            trusted: result.trusted,
            valid: result.valid,
            validationErrors: validationErrors
        });

    } catch (error) {
        console.error('Verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/create-account', async (req, res) => {
    try {
        const { verifiedData, accountType, email, phone, address, city, state, zipCode } = req.body;

        // Validation
        const errors = [];

        // Check required fields (state and zipCode are optional)
        if (!verifiedData || !accountType || !email || !phone || !address || !city) {
            return res.status(400).json({ success: false, error: 'Required fields are missing' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Invalid email format');
        }

        // Validate phone format (basic)
        const phoneRegex = /^[\d\s\-\+\(\)]+$/;
        if (!phoneRegex.test(phone)) {
            errors.push('Invalid phone number format');
        }

        // Check for duplicate account (by email)
        if (accountsStore.has(email.toLowerCase())) {
            errors.push('An account with this email address already exists');
        }

        // Check for duplicate by document number
        const documentNumber = verifiedData.claims.document_number;
        for (const [, account] of accountsStore) {
            if (account.documentNumber === documentNumber) {
                errors.push('An account with this document number already exists');
                break;
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: errors.join('. ') });
        }

        // Generate unique account number
        const accountNumber = 'TB' + Date.now() + Math.floor(Math.random() * 1000);

        // Create account object
        const account = {
            accountNumber,
            accountType,
            fullName: `${verifiedData.claims.given_name} ${verifiedData.claims.family_name}`,
            firstName: verifiedData.claims.given_name,
            lastName: verifiedData.claims.family_name,
            birthDate: verifiedData.claims.birth_date,
            gender: verifiedData.claims.sex,
            documentNumber: verifiedData.claims.document_number,
            issuingAuthority: verifiedData.claims.issuing_authority,
            documentExpiry: verifiedData.claims.expiry_date,
            email: email.toLowerCase(),
            phone,
            address,
            city,
            state,
            zipCode,
            verified: verifiedData.valid && verifiedData.trusted,
            createdAt: new Date().toISOString(),
            balance: 0
        };

        // Store account
        accountsStore.set(email.toLowerCase(), account);

        console.log('Account created:', accountNumber);
        console.log('Total accounts:', accountsStore.size);

        res.json({
            success: true,
            account: account
        });

    } catch (error) {
        console.error('Account creation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sign-in endpoint - verify digital ID and extract portrait + document number
app.post('/signin-verify', async (req, res) => {
    try {
        const { credentials, nonce } = req.body;
        
        console.log('Sign-in verification request for nonce:', nonce);

        if (!nonce || !sessionStore.has(nonce)) {
            return res.status(400).json({ success: false, error: 'Invalid or expired nonce' });
        }

        const jwk = sessionStore.get(nonce);
        sessionStore.delete(nonce);

        const result = await processCredentials(credentials, {
            nonce,
            jwk,
            origin: process.env.ORIGIN || 'http://localhost:3001'
        });

        console.log('Sign-in verification result:', {
            valid: result.valid,
            trusted: result.trusted,
            document_number: result.claims.document_number
        });

        // Check document expiry
        if (result.claims.expiry_date) {
            const expiryDate = new Date(result.claims.expiry_date);
            const today = new Date();
            if (expiryDate < today) {
                return res.json({
                    success: false,
                    error: 'Your document has expired. Please renew your ID before signing in.'
                });
            }
        }

        // Extract portrait and document number for biometric verification
        const portrait = result.claims.portrait;
        const documentNumber = result.claims.document_number;
        const claims = result.claims;

        if (!portrait) {
            return res.json({
                success: false,
                error: 'No portrait found in digital ID. Cannot proceed with facial verification.'
            });
        }

        if (!documentNumber) {
            return res.json({
                success: false,
                error: 'No document number found in digital ID.'
            });
        }

        // Convert portrait to base64 for client-side face recognition
        let portraitBase64;
        if (typeof portrait === 'object' && !portrait.startsWith) {
            const bytes = new Uint8Array(Object.values(portrait));
            const base64 = Buffer.from(bytes).toString('base64');
            portraitBase64 = `data:image/jpeg;base64,${base64}`;
        } else {
            portraitBase64 = portrait;
        }

        // Store document number temporarily for biometric verification
        const verificationToken = generateNonce();
        sessionStore.set(verificationToken, {
            documentNumber: documentNumber,
            claims: claims,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            verificationToken: verificationToken,
            portraitData: portraitBase64,
            claims: {
                given_name: claims.given_name,
                family_name: claims.family_name,
                document_number: documentNumber
            }
        });

    } catch (error) {
        console.error('Sign-in verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Biometric verification endpoint - compare faces using face-api
// Biometric verification endpoint (receives face descriptors from client)
app.post('/biometric-verify', async (req, res) => {
    try {
        const { portraitDescriptor, capturedDescriptor, verificationToken } = req.body;

        if (!portraitDescriptor || !capturedDescriptor || !verificationToken) {
            return res.status(400).json({ success: false, error: 'Missing required data' });
        }

        if (!sessionStore.has(verificationToken)) {
            return res.json({
                success: false,
                error: 'Invalid or expired verification token. Please start over.'
            });
        }

        const verificationData = sessionStore.get(verificationToken);
        const { documentNumber } = verificationData;

        // Clean up verification token
        sessionStore.delete(verificationToken);

        console.log('Biometric verification for document:', documentNumber);

        // Compare face descriptors using euclidean distance
        const descriptor1 = new Float32Array(portraitDescriptor);
        const descriptor2 = new Float32Array(capturedDescriptor);
        
        // Calculate euclidean distance
        let sumSquares = 0;
        for (let i = 0; i < descriptor1.length; i++) {
            const diff = descriptor1[i] - descriptor2[i];
            sumSquares += diff * diff;
        }
        const distance = Math.sqrt(sumSquares);
        
        console.log('Face comparison distance:', distance);

        // Threshold: typically 0.6 for a match (lower = more similar)
        const threshold = 0.6;
        const isMatch = distance < threshold;

        if (!isMatch) {
            return res.json({
                success: false,
                error: `Face verification failed (distance: ${distance.toFixed(3)}). The captured photo does not match the photo on your digital ID.`
            });
        }

        console.log('✓ Face match successful');

        // Look up account by document number
        let matchingAccount = null;
        for (const [email, account] of accountsStore.entries()) {
            if (account.documentNumber === documentNumber) {
                matchingAccount = account;
                break;
            }
        }

        if (!matchingAccount) {
            return res.json({
                success: false,
                error: 'No account found with this digital ID. Please register for an account first.'
            });
        }

        console.log('✓ Account found:', matchingAccount.accountNumber);

        // Create session token
        const sessionToken = generateNonce();
        sessionTokenStore.set(sessionToken, {
            accountNumber: matchingAccount.accountNumber,
            email: matchingAccount.email,
            fullName: matchingAccount.fullName,
            loginTime: new Date().toISOString()
        });

        res.json({
            success: true,
            sessionToken: sessionToken,
            message: 'Sign-in successful'
        });

    } catch (error) {
        console.error('Biometric verification failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get account data (for home page)
app.post('/get-account', (req, res) => {
    try {
        const { sessionToken } = req.body;

        if (!sessionToken) {
            return res.status(401).json({ success: false, error: 'No session token provided' });
        }

        const session = sessionTokenStore.get(sessionToken);
        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session' });
        }

        // Get full account data
        const account = accountsStore.get(session.email);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        res.json({
            success: true,
            account: {
                accountNumber: account.accountNumber,
                accountType: account.accountType,
                fullName: account.fullName,
                email: account.email,
                phone: account.phone,
                createdAt: account.createdAt
            }
        });

    } catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    try {
        const { sessionToken } = req.body;

        if (sessionToken && sessionTokenStore.has(sessionToken)) {
            sessionTokenStore.delete(sessionToken);
        }

        res.json({ success: true, message: 'Logged out successfully' });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    setInterval(() => {
        // Keep alive
    }, 10000);
});
