# Tamange Bank - Digital Banking System

This project demonstrates a complete digital banking system with account registration and biometric sign-in using digital credentials (mDL and PhotoID) and the W3C Digital Credentials API.

## Features

- ✅ **Digital Identity Verification**: Verify customer identity using mDL or PhotoID
- 🏦 **Account Creation**: Open checking or savings accounts
- 🔐 **Biometric Sign-In**: Facial recognition using digital ID portrait
- 🔒 **Secure Backend Validation**: Age verification, document expiry checks, duplicate prevention
- 📱 **Modern UI**: Professional banking interface with step-by-step flows
- 🎯 **Complete Flows**: 
  - **Registration**: Welcome → Verify → Account Details → Confirmation
  - **Sign-In**: Digital ID Verify → Facial Biometric → Dashboard

## Supported Digital Credentials

- **Mobile Driver's License (mDL)**: 
  - docType: `org.iso.18013.5.1.mDL`
  - namespace: `org.iso.18013.5.1`
  
- **PhotoID**: 
  - docType: `org.iso.23220.photoid.1`
  - namespace: `org.iso.23220.1`

Both document types are requested during verification, and the wallet will present whichever credential the user has available.

**Understanding docType vs namespace:**
- The **docType** identifies which type of credential to present (e.g., `org.iso.23220.photoid.1`)
- The **namespace** is used within the credential to organize claims (e.g., `org.iso.23220.1`)
- Your PhotoID mDoc has docType `org.iso.23220.photoid.1` and stores claims in namespace `org.iso.23220.1`
- The credential request correctly uses both values as designed by the ISO 23220 standard

## Prerequisites

- Node.js 18+ installed
- A browser that supports the Digital Credentials API (e.g., Chrome with flags enabled, or specific mobile browsers)
- A wallet with compatible digital credentials (mDL or PhotoID)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. **(Optional) Database Setup:**

   By default, the system uses in-memory storage. For persistent storage, set up PostgreSQL:

   **Local Development:**
   ```bash
   # Install PostgreSQL locally, then:
   export DATABASE_URL="postgresql://user:password@localhost:5432/tamange_bank"
   ```

   **Railway Deployment:**
   - Add PostgreSQL plugin in Railway dashboard
   - DATABASE_URL is automatically set by Railway
   - Tables are created automatically on first startup

   **Database Schema:**
   - `accounts` table: Stores customer accounts with face descriptors
   - `sessions` table: Stores active login sessions
   - Automatic session cleanup every hour
   - If DATABASE_URL is not set, falls back to in-memory storage

## Running the Application

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to:
   - Registration: `http://localhost:3001`
   - Sign-In: `http://localhost:3001/signin.html`
   - Dashboard: `http://localhost:3001/home.html` (requires active session)

## Registration Flow

### 1. Welcome Screen
- Introduction to Tamange Bank
- Information about required documents
- Age requirement notification (18+)

### 2. Identity Verification
The system requests the following information from your digital ID:
- **Supported Document Types:**
  - Mobile Driver's License (mDL) - `org.iso.18013.5.1.mDL`
  - PhotoID - `org.iso.23220.1`
- **Personal Information:**
  - Given Name
  - Family Name
  - Date of Birth
  - Gender
  - Portrait Photo
- **Document Information:**
  - Document Number
  - Issuing Authority
  - Expiry Date

### 3. Account Details
- Choose account type:
  - **Checking Account**: No monthly fees, for everyday spending
  - **Savings Account**: 2.5% APY, earn interest on your balance
- Provide additional information:
  - Email address
  - Phone number
  - Street address
  - City, State, ZIP code
- Accept Terms and Conditions

### 4. Confirmation
- Review account details
- Receive unique account number
- Next steps for account activation

## Validation Rules

The system performs the following validations:

### Age Verification
- Minimum age: 18 years old
- Automatically calculated from date of birth
- Registration blocked if under 18

### Document Validation
- Document must not be expired
- Expiry date checked against current date
- Registration blocked if document is expired

### Duplicate Prevention
- Email address must be unique
- Document number must not be already registered
- Prevents multiple accounts with same credentials

### Data Format Validation
- Email: Valid email format (user@domain.com)
- Phone: Valid phone number format
- All required fields must be completed

## Account Types

### Checking Account
- No monthly maintenance fees
- Unlimited transactions
- Debit card included
- Online and mobile banking

### Savings Account
- 2.5% Annual Percentage Yield (APY)
- Interest compounded monthly
- No minimum balance requirement
- Online and mobile banking

## Sign-In Flow

### 1. Digital ID Verification
- User clicks "Sign In with Digital ID"
- System requests mDL credentials
- Verifies digital ID authenticity
- Extracts portrait and document number
- Validates document is not expired

### 2. Biometric Facial Recognition
- **Client-Side Processing** (Privacy-Preserving):
  - Loads face recognition models in browser
  - Detects face in mDL portrait
  - Captures photo using device camera
  - Detects face in captured photo
  - Extracts 128-dimensional face descriptors
  - Only descriptors (not images) sent to server
- **Server-Side Verification**:
  - Calculates euclidean distance between descriptors
  - Threshold: 0.6 (lower = more similar)
  - Looks up account by document number
  - Creates secure session token

### 3. Dashboard Access
- Displays account information
- Shows account balance
- Quick actions (transfer, pay bills, deposit, statements)
- Recent activity log
- Security status

## Project Structure

```
.
├── server.js              # Express backend with verification, biometric auth, and sessions
├── polyfill.js           # Web Crypto API polyfill for Node.js 18
├── public/
│   ├── index.html        # Multi-step registration interface
│   ├── script.js         # Registration frontend logic
│   ├── signin.html       # Sign-in interface
│   ├── signin.js         # Sign-in logic with face recognition
│   ├── home.html         # Account dashboard
│   ├── home.js           # Dashboard session management
│   └── importmap.json    # Module resolution map
├── models/               # Face recognition model files
│   ├── ssd_mobilenetv1_*         # Face detection model
│   ├── face_landmark_68_*        # Facial landmarks model
│   └── face_recognition_*        # Face descriptor extraction model
├── package.json          # Project dependencies
└── README.md            # This file
```

## Security Features

- Secure nonce generation for request validation
- JWK-based encryption for credential requests
- Server-side validation of all user inputs
- Session-based authentication with tokens
- Replay attack prevention
- **Privacy-Preserving Biometrics**:
  - Face recognition processed entirely in browser
  - Only mathematical descriptors (not images) transmitted
  - Images never stored on server
  - Euclidean distance-based comparison (threshold: 0.6)

## Technical Details

### Backend Endpoints

#### Registration Endpoints

##### `GET /request-params`
- Generates secure verification parameters
- Returns nonce and credential request configuration
- Stores session data for verification

##### `POST /verify`
- Verifies credentials from digital wallet
- Validates age and document expiry
- Returns verified claims and validation errors

##### `POST /create-account`
- Creates new bank account
- Validates all registration data
- Prevents duplicate accounts
- Generates unique account number

#### Sign-In Endpoints

##### `POST /signin-verify`
- Verifies digital ID credentials
- Validates document expiry
- Returns verification token and portrait as base64
- Stores temporary verification data

##### `POST /biometric-verify`
- **Input**: Face descriptors (128-dimensional Float32Arrays) from client
- Calculates euclidean distance between portrait and captured descriptors
- Threshold: 0.6 for match (lower = more similar)
- Looks up account by document number
- Creates session token on successful match
- **Output**: Session token or error message

##### `POST /get-account`
- Validates session token
- Returns account information for dashboard
- Used by home page to display user data

##### `POST /logout`
- Invalidates session token
- Clears server-side session storage

### Credential Claims

The system requests the following claims from digital credentials:

- `given_name` - First name
- `family_name` - Last name
- `birth_date` - Date of birth
- `sex` - Gender
- `portrait` - Photo
- `document_number` - Document identifier
- `issuing_authority` - Issuing organization
- `expiry_date` - Document expiration date

Both mDL and PhotoID credentials provide these standard claims.

### Data Storage

Currently uses in-memory storage (Map objects) for demo purposes:
- `sessionStore`: Stores nonce-to-JWK mappings and temporary verification data
- `accountsStore`: Stores created accounts by email
- `sessionTokenStore`: Stores active login sessions

**Note:** For production use, replace with a proper database system (PostgreSQL, MongoDB, etc.) and Redis for session management.

## Browser Compatibility

This application requires a browser with Digital Credentials API support:
- Chrome/Edge with experimental features enabled
- Safari with appropriate flags
- Mobile browsers with wallet integration

## Face Recognition Setup

The biometric sign-in feature uses [@vladmandic/face-api](https://github.com/vladmandic/face-api) for facial recognition.

### Models
Three pre-trained models are included in the `/models` directory:
- **ssd_mobilenetv1**: Face detection model
- **face_landmark_68**: Facial landmark detection (68 points)
- **face_recognition**: Face descriptor extraction (128 dimensions)

Models are loaded automatically in the browser when accessing the sign-in page.

### Threshold Configuration
The face matching threshold is set to **0.6** euclidean distance:
- Lower values = stricter matching (fewer false positives)
- Higher values = more lenient (more false positives)
- Industry standard: 0.5-0.6

To adjust the threshold, modify the value in `server.js`:
```javascript
const threshold = 0.6; // Adjust based on security requirements
```

### Privacy Notes
- All face processing happens **client-side** in the browser
- Only mathematical descriptors (128 float values) are sent to server
- No face images are transmitted or stored on the server
- Camera access is temporary and only active during sign-in

## Troubleshooting

### Module Resolution Errors
The project includes an import map to resolve bare module specifiers. Ensure `node_modules` is served correctly.

### Crypto API Issues
Node.js 18 requires the Web Crypto API polyfill (included in `polyfill.js`).

### Port Already in Use
Change the port in `server.js` if 3001 is already in use:
```javascript
const port = 3002; // Change to your preferred port
```

### Face Recognition Issues

**Camera Access Denied:**
- Grant camera permissions in browser settings
- Ensure HTTPS or localhost (required for camera access)
- Check browser console for specific errors

**No Face Detected:**
- Ensure good lighting conditions
- Face the camera directly
- Remove sunglasses or face coverings
- Move closer to the camera

**Face Match Failed:**
- Ensure you're using the same ID that was used for registration
- Lighting conditions should be similar to ID photo
- Facial expression should be neutral
- If threshold is too strict, adjust in `server.js`

**Models Not Loading:**
- Check that `/models` directory contains all required files
- Verify models are served correctly (check browser network tab)
- Clear browser cache and reload page

## Future Enhancements

- Database integration for persistent storage
- Email verification flow
- SMS verification for phone numbers
- Initial deposit handling
- Account activation workflow
- Admin dashboard for account management

## License

This is a demonstration project for educational purposes.
