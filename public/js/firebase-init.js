// Firebase initialization - Compatibility version
// This module exports the firebase instance and core services

let firebase;
let db;
let auth;

// Wait for DOM to be ready to ensure Firebase is loaded
function initFirebase() {
  // Use the global firebase object that was initialized in the HTML
  if (typeof window !== 'undefined' && window.firebase) {
    firebase = window.firebase;
    
    try {
      // Initialize Firestore and Auth
      db = firebase.firestore();
      auth = firebase.auth();
      
      // Enable emulators if running locally
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Running on localhost, connecting to Firebase emulators');
        
        // Connect to Auth emulator if not already connected
        try {
          auth.useEmulator('http://127.0.0.1:9098');
        } catch (e) {
          console.log('Auth emulator might already be connected:', e.message);
        }
        
        // Connect to Firestore emulator
        try {
          db.useEmulator('127.0.0.1', 8003);
        } catch (e) {
          console.log('Firestore emulator might already be connected:', e.message);
        }
      }
      
      console.log('Firebase successfully initialized');
      return true;
    } catch (error) {
      console.error('Error initializing Firebase services:', error);
      return false;
    }
  } else {
    console.error('Firebase is not available. Make sure Firebase scripts are loaded before this file.');
    return false;
  }
}

// Initialize Firebase immediately if document is already loaded
if (document.readyState === 'complete') {
  initFirebase();
} else {
  // Otherwise wait for DOMContentLoaded
  window.addEventListener('DOMContentLoaded', initFirebase);
}

// Helper function to ensure Firebase is initialized before use
function getFirebase() {
  if (!firebase) {
    const initialized = initFirebase();
    if (!initialized) {
      throw new Error('Firebase is not initialized. Check console for errors.');
    }
  }
  return { firebase, db, auth };
}

// Export for use in other modules
export { getFirebase, firebase, db, auth };