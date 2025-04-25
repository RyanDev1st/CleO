// Firebase initialization - Centralized Promise
// This module exports the firebase instance and core services

// Create a persistent storage key for Firebase initialization status
const FIREBASE_INIT_STORAGE_KEY = 'CLEO_FIREBASE_INITIALIZED';

// Check if Firebase was previously initialized in this browser session
let previouslyInitialized = false;
try {
  previouslyInitialized = sessionStorage.getItem(FIREBASE_INIT_STORAGE_KEY) === 'true';
} catch (e) {
  console.log("Unable to access sessionStorage, will initialize Firebase normally");
}

// Global initialization status - using window to ensure cross-module access
if (typeof window !== 'undefined' && !window.__FIREBASE_INIT_STATUS__) {
  window.__FIREBASE_INIT_STATUS__ = {
    initialized: previouslyInitialized,
    initializing: false,
    services: null,
    firestoreInitialized: previouslyInitialized
  };
}

let firebase;
let db;
let auth;
let rtdb;
let isOnline = false;
let offlineListeners = [];
let permissionDenied = false;
let initializationPromise = null;
let firestoreInitialized = previouslyInitialized;

// Updated to match your actual firebase.json file
const emulatorConfig = {
  "emulators": {
    "auth": {
      "port": 49158
    },
    "ui": {
      "enabled": true,
      "port": 49160
    },
    "database": {
      "port": 49161
    },
    "hosting": {
      "port": 49162
    },
    "firestore": {
      "port": 49163
    }
  }
};

// Extract ports for internal use
const emulatorPorts = {
  auth: emulatorConfig.emulators.auth.port,
  firestore: emulatorConfig.emulators.firestore.port,
  database: emulatorConfig.emulators.database.port
};


// Firebase configuration with valid API key
const firebaseConfig = {
  apiKey: "AIzaSyB7K__oFOQ2R1WWbXFJXSd4vJJ8c6YNK2Q",
  authDomain: "cleo-db2401.firebaseapp.com",
  projectId: "cleo-db2401",
  storageBucket: "cleo-db2401.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// Define separate config for emulators to ensure they work properly
const emulatorFirebaseConfig = {
  // Use the same API key to maintain consistency
  apiKey: "AIzaSyB7K__oFOQ2R1WWbXFJXSd4vJJ8c6YNK2Q",
  authDomain: "localhost",
  projectId: "cleo-emulator",
  storageBucket: "localhost",
  databaseURL: "http://localhost:49161", // Match the emulator port
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};

// This creates the necessary collections and initial data structure
async function initializeFirestoreData() {
  // Skip initialization if it's already done or we're missing db
  if (firestoreInitialized || !db) {
    console.log("Firestore already initialized or db not available - skipping collection setup");
    return true;
  }

  // Check for cached initialization status
  if (window.__FIREBASE_INIT_STATUS__ && window.__FIREBASE_INIT_STATUS__.firestoreInitialized) {
    console.log("Firestore data already initialized (cached status) - skipping collection setup");
    firestoreInitialized = true;
    return true;
  }
  
  console.log("Initializing Firestore data schema at root level...");

  try {
    // Define collections and their document structures based on data structure file
    const collections = [
      {
        name: 'users',
        sampleDoc: {
          uid: 'system',
          email: 'system@cleo-app.example',
          displayName: 'System Account',
          role: 'system',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        }
      },
      {
        name: 'classes',
        sampleDoc: {
          name: 'Sample Class',
          teacherId: 'system',
          joinCode: 'SAMPLE',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        },
        subcollections: [
          {
            name: 'students',
            sampleDoc: {
              joinDate: firebase.firestore.FieldValue.serverTimestamp()
            }
          }
        ]
      },
      {
        name: 'sessions',
        sampleDoc: {
          classId: 'sample-class',
          teacherId: 'system',
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
          endTime: null,
          status: 'ended',
          location: new firebase.firestore.GeoPoint(0, 0),
          radius: 50,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        },
        subcollections: [
          {
            name: 'attendance',
            sampleDoc: {
              classId: 'sample-class',
              checkInTime: firebase.firestore.FieldValue.serverTimestamp(),
              checkOutTime: null,
              checkInLocation: null,
              status: 'pending',
              isGpsVerified: false,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }
          }
        ]
      },
      {
        name: 'userClasses',
        nestedStructure: true,
        sampleDoc: {
          userId: 'system',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        }
      }
    ];
    
    // Create collections directly at the root level with permanent documents
    for (const collection of collections) {
      console.log(`Initializing collection: ${collection.name}`);
      const collectionRef = db.collection(collection.name);
      
      // Check if collection has any documents
      const snapshot = await collectionRef.limit(1).get();
      
      if (snapshot.empty) {
        // Create a permanent document with proper structure
        const docId = `sample-${collection.name}`;
        const docRef = collectionRef.doc(docId);
        
        await docRef.set({
          ...collection.sampleDoc,
          _initialized: true,
          _sample: true
        });
        
        console.log(`Created sample document in collection: ${collection.name} with ID: ${docId}`);
        
        // Handle subcollections if any
        if (collection.subcollections && collection.subcollections.length > 0) {
          for (const subcollection of collection.subcollections) {
            console.log(`  Initializing subcollection: ${collection.name}/${docId}/${subcollection.name}`);
            const subCollectionRef = docRef.collection(subcollection.name);
            const subDocRef = subCollectionRef.doc(`sample-${subcollection.name}`);
            
            await subDocRef.set({
              ...subcollection.sampleDoc,
              _initialized: true,
              _sample: true
            });
            
            console.log(`  Created subcollection: ${collection.name}/${docId}/${subcollection.name}`);
          }
        }
        
        // Special case for userClasses which has a nested structure
        if (collection.name === 'userClasses' && collection.nestedStructure) {
          const userClassesDocRef = collectionRef.doc(docId);
          const classesSubcollectionRef = userClassesDocRef.collection('classes');
          const classDocRef = classesSubcollectionRef.doc(`sample-class`);
          
          await classDocRef.set({
            className: 'Sample Class',
            teacherName: 'System Teacher',
            joinDate: firebase.firestore.FieldValue.serverTimestamp(),
            _initialized: true,
            _sample: true
          });
          
          console.log(`  Created nested collection: ${collection.name}/${docId}/classes`);
        }
      } else {
        console.log(`Collection ${collection.name} already exists with documents`);
      }
    }
    
    firestoreInitialized = true;
    
    // Cache the initialization status in global state and session storage
    if (window.__FIREBASE_INIT_STATUS__) {
      window.__FIREBASE_INIT_STATUS__.firestoreInitialized = true;
    }
    
    try {
      sessionStorage.setItem(FIREBASE_INIT_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn("Failed to store Firebase initialization state in sessionStorage", e);
    }
    
    console.log("Firestore collections initialized successfully at root level");
    return true;
  } catch (error) {
    console.error("Error initializing Firestore data:", error);
    firestoreInitialized = true; // Consider it initialized even on error
    
    // Cache the initialization status even on error
    if (window.__FIREBASE_INIT_STATUS__) {
      window.__FIREBASE_INIT_STATUS__.firestoreInitialized = true;
    }
    
    try {
      sessionStorage.setItem(FIREBASE_INIT_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn("Failed to store Firebase initialization state in sessionStorage", e);
    }
    
    return false;
  }
}

// Check if Firebase is already available and fully initialized
function checkExistingFirebase() {
  if (!window.firebase) return false;
  
  try {
    // Check if Firebase app is already initialized
    if (window.firebase.apps && window.firebase.apps.length > 0) {
      // Get existing services and assign to module variables
      firebase = window.firebase;
      
      // Try to get Firestore instance
      try { db = firebase.firestore(); } catch(e) { /* ignore if unavailable */ }
      
      // Try to get Auth instance  
      try { auth = firebase.auth(); } catch(e) { /* ignore if unavailable */ }
      
      // Try to get Realtime DB instance
      try { rtdb = firebase.database(); } catch(e) { /* ignore if unavailable */ }
      
      // If we got at least Firestore and Auth, consider Firebase initialized
      if (db && auth) {
        isOnline = true;
        return true;
      }
    }
  } catch (e) {
    console.warn("Error checking existing Firebase", e);
  }
  
  return false;
}

// Simple initialization function
async function initializeFirebase() {
  // QUICK CHECK: If everything is already initialized and cached in session storage, return immediately
  if (previouslyInitialized && window.__FIREBASE_INIT_STATUS__.services) {
    console.log("Firebase already initialized (from session storage), returning cached services immediately");
    
    // If we have the services already cached but not assigned to module variables, assign them
    if (window.__FIREBASE_INIT_STATUS__.services) {
      const services = window.__FIREBASE_INIT_STATUS__.services;
      firebase = services.firebase;
      db = services.db;
      auth = services.auth;
      rtdb = services.rtdb;
      isOnline = services.isOnline;
      permissionDenied = services.permissionDenied;
      firestoreInitialized = services.firestoreInitialized;
    }
    
    return {
      firebase,
      db,
      auth,
      rtdb,
      isOnline: true,
      permissionDenied: false,
      firestoreInitialized: true
    };
  }
  
  // If we already have Firebase fully initialized in this module instance, return it
  if (firebase && db && auth && isOnline) {
    console.log("Firebase already initialized (module instance), returning services");
    return { firebase, db, auth, rtdb, isOnline, permissionDenied, firestoreInitialized };
  }
  
  // Try to get already initialized Firebase from window global
  if (checkExistingFirebase()) {
    console.log("Found existing Firebase instance, using it instead of reinitializing");
    
    // Cache the services
    const services = { firebase, db, auth, rtdb, isOnline: true, permissionDenied: false, firestoreInitialized: true };
    
    // Update global status
    window.__FIREBASE_INIT_STATUS__.initialized = true;
    window.__FIREBASE_INIT_STATUS__.initializing = false;
    window.__FIREBASE_INIT_STATUS__.services = services;
    window.__FIREBASE_INIT_STATUS__.firestoreInitialized = true;
    
    try {
      sessionStorage.setItem(FIREBASE_INIT_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn("Failed to store Firebase initialization state in sessionStorage", e);
    }
    
    return services;
  }

  // If Firebase is already fully initialized in window global status, return the cached services
  if (window.__FIREBASE_INIT_STATUS__.initialized && window.__FIREBASE_INIT_STATUS__.services) {
    console.log("Firebase already initialized (window global), returning cached services");
    
    // If we have the services already cached but not assigned to module variables, assign them
    if (window.__FIREBASE_INIT_STATUS__.services) {
      const services = window.__FIREBASE_INIT_STATUS__.services;
      firebase = services.firebase;
      db = services.db;
      auth = services.auth;
      rtdb = services.rtdb;
      isOnline = services.isOnline;
      permissionDenied = services.permissionDenied;
      firestoreInitialized = services.firestoreInitialized;
    }
    
    return window.__FIREBASE_INIT_STATUS__.services;
  }

  // If initialization is in progress, return that promise
  if (window.__FIREBASE_INIT_STATUS__.initializing && initializationPromise) {
    console.log("Firebase initialization already in progress, waiting for it to complete");
    return initializationPromise;
  }

  // Mark as initializing
  window.__FIREBASE_INIT_STATUS__.initializing = true;
  
  initializationPromise = new Promise(async (resolve) => {
    console.log("Starting Firebase initialization...");

    try {
      // Make sure we have the Firebase SDK loaded
      if (!window.firebase) {
        console.error("Firebase SDK not found. Make sure the Firebase scripts are loaded.");
        isOnline = false;
        notifyListeners('firebase-not-loaded');
        window.__FIREBASE_INIT_STATUS__.initializing = false;
        resolve({ firebase: null, db: null, auth: null, rtdb: null, isOnline: false });
        return;
      }

      firebase = window.firebase;

      // Initialize the Firebase app if not already initialized
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase app initialized");
      } else {
        console.log("Using existing Firebase app");
      }

      // Determine if we should use emulators based on hostname
      const hostname = window.location.hostname;
      const shouldUseEmulator = hostname === 'localhost' || hostname === '127.0.0.1';

      if (shouldUseEmulator) {
        // Set the flag *before* attempting to connect emulators
        localStorage.setItem('useFirebaseEmulator', 'true');
        // *** Add explicit logging immediately after setting ***
        console.log(`Emulator environment detected (hostname: ${hostname}). Set useFirebaseEmulator flag to:`, localStorage.getItem('useFirebaseEmulator'));

        try {
          console.log("Configuring Firebase emulators with ports:", emulatorPorts);

          // Apply Firestore settings FIRST
          console.log("Applying Firestore settings...");
          firebase.firestore().settings({
            ignoreUndefinedProperties: true,
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
          });
          
          // Connect to Auth emulator
          console.log("Connecting to Firebase Auth emulator...");
          firebase.auth().useEmulator(`http://localhost:${emulatorPorts.auth}`);
          
          // Connect to Firestore emulator AFTER settings
          console.log("Connecting to Firestore emulator...");
          firebase.firestore().useEmulator('localhost', emulatorPorts.firestore);
          
          // Connect to Functions emulator if available
          if (firebase.functions) {
            console.log("Connecting to Functions emulator...");
            firebase.functions().useEmulator('localhost', emulatorPorts.functions);
          }
          
          // Connect to Database emulator if available
          if (firebase.database) {
            console.log("Connecting to Database emulator...");
            firebase.database().useEmulator('localhost', emulatorPorts.database);
          }
          
          console.log("Emulators configured successfully");
        } catch (emulatorError) {
          console.error("Failed to configure emulators:", emulatorError);
          // Consider clearing the flag if config fails? Or let subsequent checks handle it.
          // localStorage.setItem('useFirebaseEmulator', 'false');
        }
      } else {
        // Ensure the flag is false if not using emulators
        localStorage.setItem('useFirebaseEmulator', 'false');
        // *** Add explicit logging immediately after setting ***
        console.log(`Production environment detected (hostname: ${hostname}). Set useFirebaseEmulator flag to:`, localStorage.getItem('useFirebaseEmulator'));
      }

      // Get service instances AFTER potential emulator configuration
      try {
        console.log("Getting Firebase service instances...");
        db = firebase.firestore();
        auth = firebase.auth();
        if (firebase.database) rtdb = firebase.database();

        // Basic Connection Check: If we got the instances, assume basic connectivity.
        // We will handle permissions during actual operations (like API key validation).
        if (db && auth) {
          console.log("Firebase service instances obtained successfully.");
          isOnline = true;
          permissionDenied = false; // Assume no permission error *yet*

          // Proceed with Firestore data initialization immediately if instances are available
          // This assumes that if we can get the instance, we *might* be able to initialize,
          // especially in emulator scenarios. Actual permission errors will be caught later.
          await initializeFirestoreData();

          notifyListeners(null); // Notify that connection is initially okay
        } else {
          throw new Error("Failed to obtain essential Firebase services (Firestore or Auth).");
        }

      } catch (serviceError) {
        console.error("Error getting service instances or initializing data:", serviceError);
        isOnline = false;
        permissionDenied = false; // Unlikely a permission error if instance creation failed
        notifyListeners('service-initialization-error');
        window.__FIREBASE_INIT_STATUS__.initializing = false;

        const services = {
          firebase,
          db: null,
          auth: null,
          rtdb: null,
          isOnline: false,
          permissionDenied: false,
          firestoreInitialized: false
        };

        resolve(services);
        return;
      }

      // Cache the initialized services
      const services = {
        firebase,
        db,
        auth,
        rtdb,
        isOnline, // Reflects success of getting instances
        permissionDenied, // Will be updated later if API key validation fails permissions
        firestoreInitialized
      };

      // Update global status
      window.__FIREBASE_INIT_STATUS__.initialized = true;
      window.__FIREBASE_INIT_STATUS__.initializing = false;
      window.__FIREBASE_INIT_STATUS__.services = services;
      
      // Store in session storage
      try {
        sessionStorage.setItem(FIREBASE_INIT_STORAGE_KEY, 'true');
      } catch (e) {
        console.warn("Failed to store Firebase initialization state in sessionStorage", e);
      }
      
      // Return the initialized services
      resolve(services);
    } catch (error) {
      console.error("Firebase initialization error:", error);
      isOnline = false;
      notifyListeners('initialization-error');
      
      // Mark initialization as failed
      window.__FIREBASE_INIT_STATUS__.initializing = false;
      
      resolve({
        firebase: null,
        db: null,
        auth: null,
        rtdb: null,
        isOnline: false,
        firestoreInitialized: false
      });
    }
  });

  return initializationPromise;
}

// Notify listeners about connection state changes
function notifyListeners(errorCode) {
  offlineListeners.forEach(listener => {
    try {
      listener(isOnline, errorCode);
    } catch (e) {
      console.error('Error in connection state listener:', e);
    }
  });
}

// Register a listener for connection state changes
function onConnectionChange(callback) {
  if (typeof callback === 'function') {
    offlineListeners.push(callback);
    
    // Call immediately with current state
    setTimeout(() => {
      callback(isOnline, isOnline ? null : 'initial-callback');
    }, 0);
  }
  
  // Return unsubscribe function
  return () => {
    const index = offlineListeners.indexOf(callback);
    if (index !== -1) {
      offlineListeners.splice(index, 1);
    }
  };
}

// Fast path function to get the initialized firebase - this will skip initialization
// if Firebase is already initialized and immediately return the cached instance
export async function getInitializedFirebase() {
  // Check if Firebase is already fully initialized, return immediately if so
  if (previouslyInitialized) {
    console.log("getInitializedFirebase: Returning already initialized services without waiting");
    // Try to get services from various sources, in order of fastest to slowest
    
    // 1. If we have services in module scope
    if (firebase && db && auth && isOnline) {
      return { firebase, db, auth, rtdb, isOnline, permissionDenied, firestoreInitialized };
    }
    
    // 2. If we have services in window global status
    if (window.__FIREBASE_INIT_STATUS__.services) {
      return window.__FIREBASE_INIT_STATUS__.services;
    }
    
    // 3. If we have Firebase in window global but not services cached
    if (checkExistingFirebase()) {
      // Cache the services
      const services = { firebase, db, auth, rtdb, isOnline: true, permissionDenied: false, firestoreInitialized: true };
      
      // Update global status
      window.__FIREBASE_INIT_STATUS__.initialized = true;
      window.__FIREBASE_INIT_STATUS__.initializing = false;
      window.__FIREBASE_INIT_STATUS__.services = services;
      window.__FIREBASE_INIT_STATUS__.firestoreInitialized = true;
      
      return services;
    }
  }
  
  // Otherwise, proceed with initialization
  return initializeFirebase();
}

// Synchronous access to current firebase state - no initialization if not already done
export function getFirebase() {
  // If we already have Firebase instances in this module, return them
  if (firebase && db && auth) {
    return { 
      firebase, 
      db, 
      auth, 
      rtdb, 
      isOnline: isOnline, 
      permissionDenied,
      firestoreInitialized
    };
  }
  
  // If Firebase is already initialized in global status, get from there
  if (window.__FIREBASE_INIT_STATUS__.initialized && window.__FIREBASE_INIT_STATUS__.services) {
    const services = window.__FIREBASE_INIT_STATUS__.services;
    
    // Update module variables
    firebase = services.firebase;
    db = services.db;
    auth = services.auth;
    rtdb = services.rtdb;
    isOnline = services.isOnline;
    permissionDenied = services.permissionDenied;
    firestoreInitialized = services.firestoreInitialized;
    
    return services;
  }
  
  // Check for existing Firebase in window
  if (checkExistingFirebase()) {
    // Cache the services
    const services = { 
      firebase, 
      db, 
      auth, 
      rtdb, 
      isOnline: true, 
      permissionDenied: false,
      firestoreInitialized: true 
    };
    
    // Update global status
    window.__FIREBASE_INIT_STATUS__.initialized = true;
    window.__FIREBASE_INIT_STATUS__.initializing = false;
    window.__FIREBASE_INIT_STATUS__.services = services;
    window.__FIREBASE_INIT_STATUS__.firestoreInitialized = true;
    
    try {
      sessionStorage.setItem(FIREBASE_INIT_STORAGE_KEY, 'true');
    } catch (e) {
      console.warn("Failed to store Firebase initialization state in sessionStorage", e);
    }
    
    return services;
  }
  
  // If not initialized, start initialization in background but return current state
  if (!window.__FIREBASE_INIT_STATUS__.initializing) {
    console.log("getFirebase: Triggering initialization in background");
    initializeFirebase().catch(error => {
      console.error("Background initialization failed:", error);
    });
  }
  
  // Return current state
  return {
    firebase,
    db,
    auth,
    rtdb,
    isOnline,
    permissionDenied,
    firestoreInitialized
  };
}

// Explicitly export the Firestore initialization function
export { initializeFirestoreData };
export { onConnectionChange };

// Export for standardized import syntax
export { firebase, db, auth, rtdb };

// Start initialization automatically
if (typeof window !== 'undefined') {
  // Only initialize if not already done
  if (!window.__FIREBASE_INIT_STATUS__.initialized && !window.__FIREBASE_INIT_STATUS__.initializing) {
    console.log("Auto-initializing Firebase");
    initializeFirebase().catch(error => {
      console.error("Auto-initialization failed:", error);
    });
  } else {
    console.log("Firebase already initialized or initializing, skipping auto-initialization");
  }
}