/**
 * API Key Manager Module
 * Handles API key validation, storage, and authentication state.
 */

import { getInitializedFirebase, getFirebase, initializeFirestoreData } from './firebase-init.js';

const DEV_EMAIL = "ryandev1st@gmail.com";
const authListeners = [];
let authState = { authenticated: false };
let db = null;
let isInitialized = false;

/**
 * Initialize the API Key Manager
 * @returns {Promise<boolean>} Whether initialization was successful
 */
async function initialize() {
  if (isInitialized) {
    return true;
  }
  
  try {
    const services = await getInitializedFirebase();
    if (services && services.db) {
      db = services.db;
      isInitialized = true;
      console.log("API Key Manager: Firebase initialized successfully");
      return true;
    } else {
      console.error("API Key Manager: Failed to get Firebase services");
      return false;
    }
  } catch (error) {
    console.error("API Key Manager: Initialization error", error);
    return false;
  }
}

/**
 * Generate a random API key
 * @param {number} length - Length of the API key
 * @returns {string} The generated API key
 */
function generateApiKey(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = '';
  for (let i = 0; i < length; i++) {
    apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return apiKey;
}

/**
 * Generate a consistent hash from a string
 * @param {string} str - String to hash
 * @returns {string} Hashed string
 */
function generateHash(str) {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Get a unique device fingerprint that persists across sessions
 * but is shared between different pages on the same domain
 * @returns {string} Device fingerprint
 */
function getDeviceFingerprint() {
  // Check if we already have a stored fingerprint
  let fingerprint = localStorage.getItem('cleoDeveloperFingerprint');
  
  if (!fingerprint) {
    // Collect browser data for fingerprinting
    const browserInfo = [
      navigator.userAgent,
      navigator.language,
      navigator.hardwareConcurrency || '',
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.plugins ? navigator.plugins.length : 0,
      navigator.doNotTrack || '',
      // Add domain-independent unique identifier but not changing between sessions
      generateHash(navigator.userAgent + screen.width + screen.height + navigator.language)
    ].join('|');
    
    // Create a hash from the browser info
    fingerprint = generateHash(browserInfo) + '-' + generateApiKey(8);
    
    // Store the fingerprint for future use
    localStorage.setItem('cleoDeveloperFingerprint', fingerprint);
    
    // Also store initial date for tracking
    localStorage.setItem('cleoDeveloperFingerprintCreated', new Date().toISOString());
    
    // Store the current domain as the origin domain
    try {
      const domains = JSON.parse(localStorage.getItem('cleoDeveloperDomains') || '[]');
      const currentDomain = window.location.hostname;
      
      if (!domains.includes(currentDomain)) {
        domains.push(currentDomain);
        localStorage.setItem('cleoDeveloperDomains', JSON.stringify(domains));
      }
    } catch (err) {
      console.error("API Key Manager: Error storing domain info", err);
    }
  }

  // Record URL usage for this fingerprint
  recordUrlUsage(fingerprint);
  
  return fingerprint;
}

/**
 * Record a URL where this fingerprint has been used
 * @param {string} fingerprint - The device fingerprint
 */
function recordUrlUsage(fingerprint) {
  try {
    const currentUrl = window.location.href;
    const urlHistory = JSON.parse(localStorage.getItem('cleoDeveloperUrlHistory') || '{}');
    
    if (!urlHistory[fingerprint]) {
      urlHistory[fingerprint] = [];
    }
    
    // Only add URL if it's not already in history
    if (!urlHistory[fingerprint].includes(currentUrl)) {
      // Keep only the most recent 10 URLs
      if (urlHistory[fingerprint].length >= 10) {
        urlHistory[fingerprint].shift(); // Remove oldest URL
      }
      urlHistory[fingerprint].push(currentUrl);
      localStorage.setItem('cleoDeveloperUrlHistory', JSON.stringify(urlHistory));
    }
  } catch (err) {
    console.error("API Key Manager: Error recording URL usage", err);
  }
}

/**
 * Store an API key and send it via email
 * @returns {Promise<Object>} Result of the operation
 */
async function storeAndSendApiKey() {
  if (!db) {
    await initialize();
    if (!db) {
      return { success: false, message: 'Database not initialized. Cannot request API key.' };
    }
  }
  
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    
    const keysRef = db.collection('devApiKeys');
    const querySnapshot = await keysRef
      .where("email", "==", DEV_EMAIL)
      .where("requestedAt", ">=", threeDaysAgo)
      .get();
    
    // Generate a new API key
    const apiKey = generateApiKey();
    
    // Get the device fingerprint
    const deviceFingerprint = getDeviceFingerprint();
    
    // Collect browser/device metadata
    const deviceInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenSize: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezoneOffset: new Date().getTimezoneOffset(),
      currentUrl: window.location.href
    };
    
    // Get Firebase instance 
    const { firebase } = getFirebase();
    if (!firebase || !firebase.firestore) {
      return { success: false, message: 'Firebase not initialized properly.' };
    }
    
    // Store the API key with device fingerprint and extended info
    await keysRef.add({
      key: apiKey,
      email: DEV_EMAIL,
      deviceFingerprint: deviceFingerprint,
      deviceInfo: deviceInfo,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
      origin: {
        url: window.location.href,
        hostname: window.location.hostname,
        pathname: window.location.pathname
      },
      domains: JSON.parse(localStorage.getItem('cleoDeveloperDomains') || '[]')
    });
    
    // Create a template params object for EmailJS
    const emailParams = {
      name: "CleO Developer",
      email: DEV_EMAIL,
      apiKey: apiKey,
      message: "Your API key has been generated."
    };
    
    // Use a try-catch specifically for email sending
    try {
      if (window.emailjs) {
        const response = await emailjs.send(
          "service_chvyezt", 
          "template_o5um82j", 
          emailParams
        );
        console.log("API Key Manager: Email sent successfully", response);
        
        // Email was sent successfully, key was stored
        return { 
          success: true,
          message: `API key generated and sent to ${DEV_EMAIL}. Please check your email.`
        };
      } else {
        throw new Error("EmailJS not available");
      }
    } catch (emailError) {
      console.error("API Key Manager: Email sending failed", emailError);
      
      // Even though the email failed, the key was stored in Firestore
      // Display the key once to the user, but don't store it in sessionStorage
      return { 
        success: true,
        message: `Email could not be sent, but your API key has been generated.`,
        apiKey: apiKey // Return key only when email fails, for one-time display
      };
    }
  } catch (error) {
    console.error("API Key Manager: Error storing or sending API key", error);
    return { 
      success: false, 
      message: `Error: ${error.message}. Please try again later.` 
    };
  }
}

/**
 * Validate an API key
 * @param {string} key - The API key to validate
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
async function validateApiKey(key) {
  // Determine emulator mode by checking BOTH hostname and localStorage flag
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const useEmulatorFlag = localStorage.getItem('useFirebaseEmulator') === 'true';
  const forceEmulatorMode = isLocalhost || useEmulatorFlag; // Use emulator logic if either is true

  // *** Add detailed logging before the check ***
  console.log(`API Key Manager: validateApiKey called. Key: "${key}"`);
  console.log(`API Key Manager: Checking emulator mode... hostname: ${hostname}, isLocalhost: ${isLocalhost}, useEmulatorFlag: ${useEmulatorFlag}, forceEmulatorMode: ${forceEmulatorMode}`);

  if (forceEmulatorMode) {
    console.log(`API Key Manager: Emulator mode forced, using only offline validation.`);
    // In emulator mode, rely *only* on offline validation
    return validateApiKeyOffline(key);
  }

  // --- Proceed with standard online/offline validation if NOT in emulator mode ---
  console.log("API Key Manager: Not in emulator mode, proceeding with standard validation.");

  if (!db) {
    await initialize();
    // Get the firebase services after initialization
    const { firebase, db: freshDb, permissionDenied } = getFirebase();
    
    // Update our local db reference
    if (freshDb) {
      db = freshDb;
    }
    
    // If we have permission issues (and not in emulator mode), validation fails
    if (permissionDenied) {
      console.error("API Key Manager: Firebase permissions denied during initialization (non-emulator mode).");
      // Don't fallback to offline here, as we already established we are not in emulator mode
      return false;
    }
    
    // Still no db after initialization
    if (!db) {
      console.error("API Key Manager: Firestore DB instance not available for API key validation (non-emulator mode).");
      return false; // Cannot proceed
    }
  }
  
  if (!key) return false;

  try {
    // First, check offline validation (covers dev keys even when not in emulator mode)
    const isOfflineValid = validateApiKeyOffline(key);
    if (isOfflineValid) {
      console.log("API Key Manager: Key validated through offline method (dev key).", key);
      // Ensure Firestore data is initialized if skipped earlier
      const { firestoreInitialized } = getFirebase();
      if (!firestoreInitialized) {
        console.log("API Key Manager: Triggering Firestore data initialization after offline key validation.");
        await initializeFirestoreData();
      }
      return true;
    }

    // --- If not an offline key, proceed with Firestore validation --- 
    console.log("API Key Manager: Attempting online validation via Firestore...");
    const deviceFingerprint = getDeviceFingerprint();
    const keysRef = db.collection('devApiKeys');
    
    // Get Firebase instance for the server timestamp
    const { firebase, permissionDenied: currentPermissionDenied } = getFirebase();
    
    // Double-check permissions before Firestore query
    if (currentPermissionDenied) {
       console.error("API Key Manager: Firebase permissions denied just before online validation attempt.");
       return false;
    }

    if (!firebase || !firebase.firestore) {
      console.error("API Key Manager: Firebase services unavailable for online validation.");
      return false; // Cannot proceed with online check
    }
    
    // Get the key document
    const querySnapshot = await keysRef.where("key", "==", key).get();
    
    if (querySnapshot.empty) {
      console.warn("API Key Manager: API Key validation failed - key not found.");
      return false;
    }
    
    const keyDoc = querySnapshot.docs[0];
    const keyData = keyDoc.data();
    
    // Track origin and current domains
    const currentDomain = window.location.hostname;
    const domains = keyData.domains || [];
    if (!domains.includes(currentDomain)) {
      domains.push(currentDomain);
    }
    
    // Check if this key is already being used on another device
    if (keyData.deviceFingerprint && 
        keyData.deviceFingerprint !== deviceFingerprint && 
        !isTrustedDevice(deviceFingerprint)) {
      
      console.warn("API Key Manager: API Key validation failed - key is being used on another device.");
      
      // Store this failed attempt for reporting
      try {
        await keysRef.doc(keyDoc.id).collection('attemptedUses').add({
          deviceFingerprint: deviceFingerprint,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          wasBlocked: true,
          url: window.location.href
        });
      } catch (e) {
        console.error("Failed to log blocked attempt:", e);
      }
      
      return false;
    }
    
    // Create a timestamp for usage metadata that's NOT a serverTimestamp
    const isoDate = new Date().toISOString().split('T')[0];
    
    // Create usageMetadata object without the serverTimestamp
    const usageMetadata = {
      url: window.location.href,
      userAgent: navigator.userAgent,
      recordedAt: new Date().toISOString() // Use string timestamp instead
    };
    
    // First update the document with fields that work with serverTimestamp
    await keysRef.doc(keyDoc.id).update({
      deviceFingerprint: deviceFingerprint, // Record this device's fingerprint
      lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
      lastUsedUrl: window.location.href,
      domains: domains // Update domains list
    });
    
    // Then separately update the usageHistory array with arrayUnion
    // Using a separate update call to avoid mixing serverTimestamp with arrayUnion
    const usageHistoryField = `usageHistory.${isoDate}`;
    await keysRef.doc(keyDoc.id).update({
      [usageHistoryField]: firebase.firestore.FieldValue.arrayUnion(usageMetadata)
    });
    
    // Add usage record to subcollection
    await keysRef.doc(keyDoc.id).collection('usage').add({
      deviceFingerprint: deviceFingerprint,
      url: window.location.href,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    });
    
    // Store the key in local storage for persistence across sessions
    localStorage.setItem('devApiKey', key);
    
    // Update auth state
    updateAuthState(true);

    // *** Ensure Firestore data is initialized if it was skipped earlier ***
    const { firestoreInitialized } = getFirebase();
    if (!firestoreInitialized) {
      console.log("API Key Manager: Triggering Firestore data initialization after successful online key validation.");
      await initializeFirestoreData();
    }

    console.log("API Key Manager: API Key validated successfully.");
    return true;
  } catch (error) {
    console.error("API Key Manager: Error during online API key validation:", error);

    // If an error occurs during the Firestore check (like permission denied),
    // and we are NOT in emulator mode, the key is invalid.
    // We already tried offline validation earlier.
    return false;
  }
}

/**
 * Validate an API key without using Firebase (offline validation)
 * @param {string} key - The API key to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateApiKeyOffline(key) {
  if (!key) return false;
  
  console.log("API Key Manager: Using offline validation method for key:", key); // Log the key being checked

  // Hardcoded test/dev keys
  const validDevKeys = [
    'dev-test-key-123', 'dev-admin-key-456', 'dev-helper-key-789',
    'CLEO-DEV-001', 'CLEO-DEV-002', 'CLEO-DEV-003',
    'CLEO-TEST-001', 'CLEO-TEST-002', 'CLEO-ADMIN-001',
    'CLEO-ADMIN-002', 'CLEO-TEACHER-001', 'CLEO-STUDENT-001'
  ];
  
  // Check against valid dev keys first
  if (validDevKeys.includes(key)) {
    console.log("API Key Manager: Valid development key found");
    localStorage.setItem('devApiKey', key); // Use localStorage
    updateAuthState(true);
    // Trigger Firestore init if needed (using Promise.resolve().then())
    Promise.resolve().then(async () => {
      const { firestoreInitialized } = getFirebase();
      if (!firestoreInitialized) {
        console.log("API Key Manager: Triggering Firestore data initialization after offline dev key validation.");
        await initializeFirestoreData();
      }
    });
    return true;
  }

  // The special 'emulator' key
  if (key.toLowerCase() === 'emulator') {
      const useEmulator = localStorage.getItem('useFirebaseEmulator') === 'true';
      console.log(`API Key Manager: Checking 'emulator' key. Actual useEmulator flag: ${useEmulator}`);
      if (useEmulator) {
          console.log("API Key Manager: 'emulator' key validated because useEmulator flag is true.");
          localStorage.setItem('devApiKey', key); // Use localStorage
          updateAuthState(true);
          // Trigger Firestore init if needed
          Promise.resolve().then(async () => {
              const { firestoreInitialized } = getFirebase();
              if (!firestoreInitialized) {
                  console.log("API Key Manager: Triggering Firestore data initialization after emulator key validation.");
                  await initializeFirestoreData();
              }
          });
          return true;
      } else {
          console.log("API Key Manager: 'emulator' key used but useEmulator flag is false. Validation fails.");
          return false; // Explicitly fail if flag is false
      }
  }

  // Handle demo keys
  if (key.toLowerCase().startsWith('demo-') && key.length < 20) {
    console.log("API Key Manager: Demo key validated");
    localStorage.setItem('devApiKey', key); // Use localStorage
    updateAuthState(true);
    // Trigger Firestore init if needed
    Promise.resolve().then(async () => {
      const { firestoreInitialized } = getFirebase();
      if (!firestoreInitialized) {
        console.log("API Key Manager: Triggering Firestore data initialization after demo key validation.");
        await initializeFirestoreData();
      }
    });
    return true;
  }
  
  // Check if the API key follows our format constraints:
  // Must be at least 20 characters
  // Should contain alphanumeric characters and possibly dashes
  if (key.length >= 20 && /^[A-Za-z0-9\-_]+$/.test(key)) {
    // In offline mode, for development purposes, accept properly formatted keys
    // that are of the right length and format
    const { permissionDenied } = getFirebase(); // Get current permission status
    const useEmulator = localStorage.getItem('useFirebaseEmulator') === 'true'; // Check emulator status again
    if (permissionDenied || useEmulator) { // Accept if permission denied OR in emulator mode
      console.log(`API Key Manager: Key format is valid, accepting in offline/emulator context (permissionDenied: ${permissionDenied}, useEmulator: ${useEmulator})`);
      localStorage.setItem('devApiKey', key); // Use localStorage
      updateAuthState(true);
      // Trigger Firestore init if needed
      Promise.resolve().then(async () => {
        const { firestoreInitialized } = getFirebase();
        if (!firestoreInitialized) {
          console.log("API Key Manager: Triggering Firestore data initialization after offline formatted key validation.");
          await initializeFirestoreData();
        }
      });
      return true;
    }
  }
  
  console.log("API Key Manager: Key validation failed in offline mode (no matching dev key, emulator key, demo key, or valid format in offline context).");
  return false;
}

/**
 * Check if a device is on the trusted list
 * This allows multiple browsers/devices to use the same key for development
 * @param {string} fingerprint - The device fingerprint to check
 * @returns {boolean} True if trusted, false otherwise
 */
function isTrustedDevice(fingerprint) {
  // Get list of trusted devices from localStorage
  try {
    const trustedDevices = JSON.parse(localStorage.getItem('cleoDeveloperTrustedDevices') || '[]');
    
    // Check if this exact fingerprint is trusted
    if (trustedDevices.includes(fingerprint)) {
      return true;
    }
    
    // Check if any part of the fingerprint matches a trusted prefix
    // This helps with handling minor browser updates that slightly change the fingerprint
    for (const trusted of trustedDevices) {
      // If we have a prefix match of at least 8 chars
      if (trusted.length >= 8 && fingerprint.startsWith(trusted.substring(0, 8))) {
        return true;
      }
      if (fingerprint.length >= 8 && trusted.startsWith(fingerprint.substring(0, 8))) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error("API Key Manager: Error checking trusted devices", err);
    return false;
  }
}

/**
 * Add a device to the trusted devices list
 * @param {string} fingerprint - The device fingerprint to trust
 * @returns {boolean} Whether the operation was successful
 */
function addTrustedDevice(fingerprint) {
  try {
    const trustedDevices = JSON.parse(localStorage.getItem('cleoDeveloperTrustedDevices') || '[]');
    if (!trustedDevices.includes(fingerprint)) {
      trustedDevices.push(fingerprint);
      localStorage.setItem('cleoDeveloperTrustedDevices', JSON.stringify(trustedDevices));
    }
    return true;
  } catch (err) {
    console.error("API Key Manager: Error adding trusted device", err);
    return false;
  }
}

/**
 * Check for an existing authenticated API key
 * @returns {Promise<boolean>} True if authenticated, false otherwise
 */
async function checkExistingAuth() {
  try {
    const storedKey = localStorage.getItem('devApiKey'); // Use localStorage
    if (storedKey) {
      const isValid = await validateApiKey(storedKey);
      if (isValid) {
        updateAuthState(true);
        return true;
      } else {
        // Clear invalid key
        localStorage.removeItem('devApiKey'); // Use localStorage
        updateAuthState(false);
      }
    }
    return false;
  } catch (error) {
    console.error("API Key Manager: Error checking existing auth", error);
    return false;
  }
}

/**
 * Sign out (clear API key)
 */
function signOut() {
  localStorage.removeItem('devApiKey'); // Use localStorage
  updateAuthState(false);
  console.log("API Key Manager: Signed out");
}

/**
 * Update authentication state and notify listeners
 * @param {boolean} authenticated - Whether the user is authenticated
 */
function updateAuthState(authenticated) {
  authState = { 
    authenticated,
    timestamp: new Date().getTime()
  };
  
  // Notify all listeners of the state change
  authListeners.forEach(listener => {
    try {
      listener(authState);
    } catch (err) {
      console.error("API Key Manager: Error in auth state listener", err);
    }
  });
}

/**
 * Register an authentication state change listener
 * @param {Function} listener - The listener function
 * @returns {Function} Function to remove the listener
 */
function onAuthStateChanged(listener) {
  if (typeof listener === 'function') {
    authListeners.push(listener);
    
    // Immediately notify with current state
    setTimeout(() => {
      try {
        listener(authState);
      } catch (err) {
        console.error("API Key Manager: Error in new auth state listener", err);
      }
    }, 0);
    
    // Return a function to remove this listener
    return () => {
      const index = authListeners.indexOf(listener);
      if (index > -1) {
        authListeners.splice(index, 1);
      }
    };
  }
  
  return () => {}; // Return no-op if listener is invalid
}

/**
 * Get the current authentication state
 * @returns {Object} Current auth state object
 */
function getAuthState() {
  return { ...authState };
}

// Export the API key manager functions
export default {
  initialize,
  generateApiKey,
  storeAndSendApiKey,
  validateApiKey,
  checkExistingAuth,
  signOut,
  onAuthStateChanged,
  getAuthState,
  addTrustedDevice,
  isTrustedDevice,
  getDeviceFingerprint
};