// Tiny client-side i18n (no dependencies)

const STORAGE_KEY = 'tamange.lang';

const dict = {
  en: {
    bankName: 'TAMANGE BANK',
    tagline: 'Secure Banking. Digital Identity. Trusted Service.',
    navOpenAccount: 'Open Account',
    navSignIn: 'Sign In',
    signOut: 'Sign Out',
    accessDenied: 'Access Denied',
    pleaseSignIn: 'Please sign in to access your account.',
    loadingAccount: 'Loading your account information...',
    dashboardQuickActions: 'Quick Actions',
    dashboardRecentActivity: 'Recent Activity',
    dashboardAccountDetails: 'Account Details',
    dashboardSecurity: 'Security',
    authDigitalId: 'Digital ID',
    biometricEnabled: 'Enabled',

    // Registration (index)
    regTitle: 'Tamange Bank - Account Registration',
    welcomeTitle: 'Welcome to Tamange Bank',
    digitalIdentityVerification: 'Digital Identity Verification',
    welcomeIntro:
      "Open your bank account in minutes using your mobile driver's license or digital ID. We'll securely verify your identity using the latest digital credentials technology.",
    whatYouNeed: "What you'll need:",
    needCredential: 'A mobile driver\'s license (mDL) or PhotoID digital credential',
    needAge: 'You must be 18 years or older',
    needContact: 'A valid email address and phone number',
    startRegistration: 'Start Registration',
    stepVerifyIdentity: '1. Verify Identity',
    stepAccountDetails: '2. Account Details',
    stepConfirmation: '3. Confirmation',
    verifyYourIdentity: 'Verify Your Identity',
    verifyHelpText:
      'Click the button below to share your digital credentials. We will request your name, date of birth, and document details.',
    verifyWithDigitalId: 'Verify with Digital ID',
    completeRegistration: 'Complete Your Registration',
    chooseAccountType: 'Choose Account Type',
    checkingAccount: 'Checking Account',
    checkingDesc: 'For everyday spending and bill payments',
    checkingHighlight: 'No monthly fees',
    savingsAccount: 'Savings Account',
    savingsDesc: 'Earn interest on your balance',
    savingsHighlight: '2.5% APY',
    emailAddress: 'Email Address',
    phoneNumber: 'Phone Number',
    streetAddress: 'Street Address',
    city: 'City',
    state: 'State',
    optional: 'Optional',
    zipCode: 'ZIP Code',
  placeholderEmail: 'you@example.com',
  placeholderPhone: '+1 (555) 123-4567',
  placeholderAddress: '123 Main Street',
  placeholderCity: 'New York',
  placeholderState: 'NY',
  placeholderZip: '10001',
    termsAgree: 'I agree to the Terms and Conditions and Privacy Policy',
    createAccount: 'Create Account',
    creatingAccount: 'Creating Account...',
    verifiedInformation: '✓ Verified Information',
    firstName: 'First Name',
    lastName: 'Last Name',
    dateOfBirth: 'Date of Birth',
    gender: 'Gender',
    documentNumber: 'Document Number',
    issuingAuthority: 'Issuing Authority',
    expiryDate: 'Expiry Date',
    accountCreatedSuccessfully: 'Account Created Successfully!',
    yourAccountInformation: 'Your Account Information',
    accountNumberLabel: 'Account Number',
    accountTypeLabel: 'Account Type',
    accountHolder: 'Account Holder',
    createdLabel: 'Created',
    nextSteps: 'Next Steps:',
    nextCheckEmail: 'Check your email for account confirmation',
    nextDownloadApp: 'Download the Tamange Bank mobile app',
    nextSetupOnline: 'Set up your online banking credentials',
    nextFirstDeposit: 'Make your first deposit',

    // Common loading / verification strings
    loadingInitVerification: 'Initializing verification...',
    loadingFetchParams: 'Fetching request parameters...',
    loadingRequestWallet: 'Requesting credentials from wallet...',
    loadingVerifyCreds: 'Verifying credentials...',
    verificationIssues: 'Verification Issues:',
    errorPrefix: 'Error:',
    failedToGetParams: 'Failed to get params',
    verificationFailed: 'Verification failed',
    missingRequiredFields: 'Required fields are missing',

    // Sign-in (signin)
    signInTitle: 'Tamange Bank - Sign In',
    signInToYourAccount: 'Sign In to Your Account',
    secureSignInWithDigitalId: 'Secure Sign-In with Digital ID',
    signInIntro:
      "Sign in securely using your mobile driver's license (mDL) or PhotoID digital credential. We'll verify your identity and then confirm it's really you with facial recognition.",
    howItWorks: 'How it works:',
    howStep1: 'Verify your digital ID credentials (mDL or PhotoID)',
    howStep2: 'Confirm your identity with facial recognition',
    howStep3: 'Access your account securely',
    signInWithDigitalId: 'Sign In with Digital ID',
    verifyingDigitalId: 'Verifying digital ID...',
    facialRecognitionVerification: 'Facial Recognition Verification',
    verifyYourIdentity: 'Verify Your Identity',
    biometricHelp:
      'To ensure it\'s really you, we need to compare your face with the photo on your digital ID. Click "Start Camera" and position your face in the frame.',
    startCamera: 'Start Camera',
    captureAndVerify: 'Capture & Verify',
    retakePhoto: 'Retake Photo',
    requestingCameraAccess: 'Requesting camera access...',
    cameraActiveTitle: 'Camera Active',
    cameraActiveHelp:
      'Position your face in the center of the frame and click "Capture & Verify".',
    cameraAccessDenied: 'Camera Access Denied',
    allowCameraAccess: 'Please allow camera access to continue.',
    photoCapturedVerifying: 'Photo captured. Verifying your identity...',
    detectingFace: 'Detecting face in your photo...',
    analyzingIdPortrait: 'Analyzing ID portrait...',
    analyzingCapturedPhoto: 'Analyzing captured photo...',
    comparingFaces: 'Comparing faces...',
    faceModelsLoading:
      'Face recognition models are still loading. Please wait...',
    couldNotDetectIdFace: 'Could not detect face in your digital ID portrait.',
    couldNotDetectCapturedFace:
      'Could not detect your face in the captured photo. Please ensure your face is clearly visible and try again.',
    signInFailed: 'Sign-In Failed',
    tryAgain: 'Try Again',
    verificationFailedTitle: 'Verification Failed',

    // Home (dashboard)
    homeTitle: 'Tamange Bank - Home',
    availableBalance: 'Available Balance',
    transferMoney: 'Transfer Money',
    payBills: 'Pay Bills',
    depositCheck: 'Deposit Check',
    viewStatements: 'View Statements',
    accountOpened: 'Account Opened',
    authentication: 'Authentication',
    biometric: 'Biometric',
    memberSince: 'Member Since',
    noActiveSession: 'No active session. Please sign in.',
    failedLoadAccount: 'Failed to load account information.',
    failedLoadAccountTryAgain: 'Failed to load account information. Please try again.',
  },
  am: {
    bankName: 'ተማንጌ ባንክ',
    tagline: 'ደህንነታማ ባንኪንግ። ዲጂታል መታወቂያ። የታመነ አገልግሎት።',
    navOpenAccount: 'መለያ ክፈት',
    navSignIn: 'ግባ',
    signOut: 'ውጣ',
    accessDenied: 'መዳረሻ ተከልክሏል',
    pleaseSignIn: 'መለያዎን ለመመልከት እባክዎ ግቡ።',
    loadingAccount: 'የመለያዎን መረጃ በመጫን ላይ...',
    dashboardQuickActions: 'ፈጣን እርምጃዎች',
    dashboardRecentActivity: 'የቅርብ ጊዜ እንቅስቃሴ',
    dashboardAccountDetails: 'የመለያ ዝርዝሮች',
    dashboardSecurity: 'ደህንነት',
    authDigitalId: 'ዲጂታል መታወቂያ',
    biometricEnabled: 'ተከናውኗል',

    // Registration (index)
    regTitle: 'ተማንጌ ባንክ - መለያ መመዝገቢያ',
    welcomeTitle: 'እንኳን ወደ ተማንጌ ባንክ በደህና መጡ',
    digitalIdentityVerification: 'ዲጂታል መታወቂያ ማረጋገጫ',
    welcomeIntro:
      'የሞባይል የመንጃ ፈቃድዎን ወይም ዲጂታል መታወቂያዎን በመጠቀም በጥቂት ደቂቃዎች ውስጥ የባንክ መለያ ይክፈቱ። መለያዎን በዘመናዊ ዲጂታል ማረጋገጫ ቴክኖሎጂ በደህንነት እናረጋግጣለን።',
    whatYouNeed: 'የሚያስፈልግዎ:',
    needCredential: 'የሞባይል የመንጃ ፈቃድ (mDL) ወይም PhotoID ዲጂታል መታወቂያ',
    needAge: '18 ዓመት ወይም ከዚያ በላይ መሆን አለብዎት',
    needContact: 'ትክክለኛ ኢሜይል እና የስልክ ቁጥር',
    startRegistration: 'መመዝገብ ጀምር',
    stepVerifyIdentity: '1. መታወቂያ አረጋግጥ',
    stepAccountDetails: '2. የመለያ ዝርዝሮች',
    stepConfirmation: '3. ማረጋገጫ',
    verifyYourIdentity: 'መታወቂያዎን ያረጋግጡ',
    verifyHelpText:
      'ከታች ያለውን ቁልፍ በመጫን ዲጂታል መታወቂያዎን ያጋሩ። ስምዎን፣ የትውልድ ቀንዎን እና የሰነድ ዝርዝሮችን እንጠይቃለን።',
    verifyWithDigitalId: 'በዲጂታል መታወቂያ አረጋግጥ',
    completeRegistration: 'መመዝገብን ያጠናቅቁ',
    chooseAccountType: 'የመለያ አይነት ይምረጡ',
    checkingAccount: 'ቼኪንግ መለያ',
    checkingDesc: 'ለዕለታዊ ወጪዎች እና የቢል ክፍያዎች',
    checkingHighlight: 'ወርሃዊ ክፍያ የለም',
    savingsAccount: 'ሴቪንግስ መለያ',
    savingsDesc: 'በብዛትዎ ላይ ወለድ ያግኙ',
    savingsHighlight: '2.5% APY',
    emailAddress: 'ኢሜይል አድራሻ',
    phoneNumber: 'የስልክ ቁጥር',
    streetAddress: 'የመንገድ አድራሻ',
    city: 'ከተማ',
    state: 'ክልል/ስቴት',
    optional: 'አማራጭ',
    zipCode: 'ፖስታ ኮድ',
  placeholderEmail: 'you@example.com',
  placeholderPhone: '+1 (555) 123-4567',
  placeholderAddress: '123 Main Street',
  placeholderCity: 'New York',
  placeholderState: 'NY',
  placeholderZip: '10001',
    termsAgree: 'ውሎችን እና የግላዊነት መመሪያን እቀበላለሁ',
    createAccount: 'መለያ ፍጠር',
    creatingAccount: 'መለያ በመፍጠር ላይ...',
    verifiedInformation: '✓ የተረጋገጠ መረጃ',
    firstName: 'የመጀመሪያ ስም',
    lastName: 'የአባት ስም',
    dateOfBirth: 'የትውልድ ቀን',
    gender: 'ፆታ',
    documentNumber: 'የሰነድ ቁጥር',
    issuingAuthority: 'የማቅረብ ባለስልጣን',
    expiryDate: 'የሚያበቃበት ቀን',
    accountCreatedSuccessfully: 'መለያ በተሳካ ሁኔታ ተፈጥሯል!',
    yourAccountInformation: 'የመለያ መረጃዎ',
    accountNumberLabel: 'የመለያ ቁጥር',
    accountTypeLabel: 'የመለያ አይነት',
    accountHolder: 'የመለያ ባለቤት',
    createdLabel: 'ተፈጥሯል',
    nextSteps: 'ቀጣይ እርምጃዎች:',
    nextCheckEmail: 'የመለያ ማረጋገጫ ኢሜይልዎን ይመልከቱ',
    nextDownloadApp: 'የተማንጌ ባንክ ሞባይል መተግበሪያን ያውርዱ',
    nextSetupOnline: 'የመስመር ላይ ባንኪንግ መግቢያዎችን ያቀናብሩ',
    nextFirstDeposit: 'የመጀመሪያዎን ተቀማጭ ያድርጉ',

    // Common loading / verification strings
    loadingInitVerification: 'ማረጋገጫን በማስጀመር ላይ...',
    loadingFetchParams: 'የጥያቄ መለኪያዎችን በመያዝ ላይ...',
    loadingRequestWallet: 'ከዋሌት መረጃ በመጠየቅ ላይ...',
    loadingVerifyCreds: 'መረጃዎችን በማረጋገጥ ላይ...',
    verificationIssues: 'የማረጋገጫ ችግኝ:',
    errorPrefix: 'ስህተት:',
    failedToGetParams: 'መለኪያዎችን ማግኘት አልተሳካም',
    verificationFailed: 'ማረጋገጫ አልተሳካም',
    missingRequiredFields: 'አስፈላጊ መስኮች አልተሞሉም',

    // Sign-in (signin)
    signInTitle: 'ተማንጌ ባንክ - መግቢያ',
    signInToYourAccount: 'ወደ መለያዎ ይግቡ',
    secureSignInWithDigitalId: 'በዲጂታል መታወቂያ ደህንነታማ መግቢያ',
    signInIntro:
      'የሞባይል የመንጃ ፈቃድ (mDL) ወይም PhotoID ዲጂታል መታወቂያ በመጠቀም በደህንነት ይግቡ። መጀመሪያ መታወቂያዎን እናረጋግጣለን እና ከዚያ በፊት ፎቶ መለያ ማረጋገጫ እናደርጋለን።',
    howItWorks: 'እንዴት ይሰራል:',
    howStep1: 'ዲጂታል መታወቂያዎን (mDL ወይም PhotoID) ያረጋግጡ',
    howStep2: 'በፊት ማረጋገጫ መታወቂያዎን ያረጋግጡ',
    howStep3: 'ወደ መለያዎ በደህንነት ይግቡ',
    signInWithDigitalId: 'በዲጂታል መታወቂያ ግባ',
    verifyingDigitalId: 'ዲጂታል መታወቂያን በማረጋገጥ ላይ...',
    facialRecognitionVerification: 'የፊት መለያ ማረጋገጫ',
    biometricHelp:
      'እርስዎ መሆንዎን ለማረጋገጥ ፊትዎን ከዲጂታል መታወቂያዎ ላይ ካለው ፎቶ ጋር እናነጻጸራለን። "ካሜራ ጀምር" ይጫኑ እና ፊትዎን በመስመሩ ውስጥ ያስገቡ።',
    startCamera: 'ካሜራ ጀምር',
    captureAndVerify: 'ያንሱ እና ያረጋግጡ',
    retakePhoto: 'ፎቶ ዳግም ያንሱ',
    requestingCameraAccess: 'የካሜራ ፍቃድ በመጠየቅ ላይ...',
    cameraActiveTitle: 'ካሜራ ነቅቷል',
    cameraActiveHelp: 'ፊትዎን በመሃል ያድርጉ እና "ያንሱ እና ያረጋግጡ" ይጫኑ።',
    cameraAccessDenied: 'የካሜራ ፍቃድ ተከልክሏል',
    allowCameraAccess: 'ለመቀጠል የካሜራ ፍቃድ ይፍቀዱ።',
    photoCapturedVerifying: 'ፎቶ ተነስቷል። መታወቂያ በማረጋገጥ ላይ...',
    detectingFace: 'በፎቶዎ ውስጥ ፊት በመፈለግ ላይ...',
    analyzingIdPortrait: 'የመታወቂያ ፎቶ በመተንተን ላይ...',
    analyzingCapturedPhoto: 'የተነሳ ፎቶ በመተንተን ላይ...',
    comparingFaces: 'ፊቶችን በማነጻጸር ላይ...',
    faceModelsLoading: 'የፊት መለያ ሞዴሎች እየተጫኑ ናቸው። እባክዎ ይጠብቁ...',
    couldNotDetectIdFace: 'በዲጂታል መታወቂያ ፎቶ ውስጥ ፊት ማግኘት አልተቻለም።',
    couldNotDetectCapturedFace:
      'በተነሳው ፎቶ ውስጥ ፊትዎን ማግኘት አልተቻለም። ፊትዎ ግ clearly እንዲታይ ያረጋግጡ እና ዳግም ይሞክሩ።',
    signInFailed: 'መግቢያ አልተሳካም',
    tryAgain: 'ዳግም ሞክር',
    verificationFailedTitle: 'ማረጋገጫ አልተሳካም',

    // Home (dashboard)
    homeTitle: 'ተማንጌ ባንክ - መነሻ',
    availableBalance: 'ሊጠቀሙ የሚችሉት ብዛት',
    transferMoney: 'ገንዘብ አስተላልፍ',
    payBills: 'ቢሎችን ክፈል',
    depositCheck: 'ቼክ አስገባ',
    viewStatements: 'መግለጫዎችን እይ',
    accountOpened: 'መለያ ተከፍቷል',
    authentication: 'ማረጋገጫ',
    biometric: 'ባዮሜትሪክ',
    memberSince: 'አባል ጀምሮ',
    noActiveSession: 'ንቁ ስርዓተ-ጊዜ የለም። እባክዎ ግቡ።',
    failedLoadAccount: 'የመለያ መረጃ ማምጣት አልተሳካም።',
    failedLoadAccountTryAgain: 'የመለያ መረጃ ማምጣት አልተሳካም። እባክዎ ዳግም ይሞክሩ።',
  },
};

export function getLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && dict[saved]) return saved;
  // Default to browser language if it’s Amharic
  const nav = navigator.language || '';
  if (nav.toLowerCase().startsWith('am')) return 'am';
  return 'en';
}

export function setLanguage(lang) {
  if (!dict[lang]) lang = 'en';
  localStorage.setItem(STORAGE_KEY, lang);
  applyTranslations(lang);
}

export function t(key, varsOrLang, maybeLang) {
  // Support:
  //  - t('key')
  //  - t('key', 'am')
  //  - t('key', {name: 'X'})
  //  - t('key', {name: 'X'}, 'am')
  let vars = null;
  let lang = getLanguage();

  if (typeof varsOrLang === 'string') {
    lang = varsOrLang;
  } else if (varsOrLang && typeof varsOrLang === 'object') {
    vars = varsOrLang;
    if (typeof maybeLang === 'string') lang = maybeLang;
  }

  let value =
    (dict[lang] && dict[lang][key]) || (dict.en && dict.en[key]) || key;

  if (vars && typeof value === 'string') {
    value = value.replace(/\{(\w+)\}/g, (_, name) => {
      const v = vars[name];
      return v == null ? `{${name}}` : String(v);
    });
  }

  return value;
}

export function applyTranslations(lang = getLanguage()) {
  document.documentElement.lang = lang === 'am' ? 'am' : 'en';

  // Apply text translations
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = t(key, lang);
    if (value != null) el.textContent = value;
  });

  // Apply placeholder translations
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    const value = t(key, lang);
    if (value != null) el.setAttribute('placeholder', value);
  });

  // Update language toggle selection if present
  const sel = document.querySelector('[data-lang-selector]');
  if (sel && 'value' in sel) sel.value = lang;
}

export function wireLanguageSelector() {
  const selector = document.querySelector('[data-lang-selector]');
  if (!selector) return;

  selector.value = getLanguage();
  selector.addEventListener('change', (e) => {
    setLanguage(e.target.value);
  });
}

export function initI18n() {
  const lang = getLanguage();
  applyTranslations(lang);
  wireLanguageSelector();
}
