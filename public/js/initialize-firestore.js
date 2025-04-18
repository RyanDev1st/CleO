// filepath: d:\CleO\public\js\initialize-firestore.js
// Initialize Firestore collections to ensure they appear in Firebase Emulator UI
// Use the global Firebase instance that's already initialized in the HTML

/**
 * Initializes all required Firestore collections even if they are empty
 * This ensures they appear in the Firebase Emulator UI
 */
export async function initializeFirestoreCollections() {
    console.log('Initializing Firestore collections...');
    const db = firebase.firestore();
    
    // Collection name constants
    const COLLECTIONS = {
        USERS: 'users',
        CLASSES: 'classes',
        SESSIONS: 'sessions',
        USER_CLASSES: 'userClasses'
    };
    
    try {
        // Initialize main collections
        await initializeCollection(db, COLLECTIONS.USERS);
        await initializeCollection(db, COLLECTIONS.CLASSES);
        await initializeCollection(db, COLLECTIONS.SESSIONS);
        await initializeCollection(db, COLLECTIONS.USER_CLASSES);
        
        // Initialize subcollections with example paths
        // For classes/{classId}/students
        await initializeSubcollection(db, 'classes', 'temp-class-id', 'students');
        
        // For sessions/{sessionId}/attendance
        await initializeSubcollection(db, 'sessions', 'temp-session-id', 'attendance');
        
        // For userClasses/{userId}/classes
        await initializeSubcollection(db, 'userClasses', 'temp-user-id', 'classes');
        
        console.log('Firestore collections initialized successfully');
        return true;
    } catch (err) {
        console.error('Error initializing Firestore collections:', err);
        return false;
    }
}

/**
 * Initialize a top-level collection
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} collectionName - Collection name to initialize
 */
async function initializeCollection(db, collectionName) {
    // Check if collection exists by trying to get a single document
    const snapshot = await db.collection(collectionName).limit(1).get();
    
    if (snapshot.empty) {
        console.log(`Initializing empty collection: ${collectionName}`);
        
        // Create a temporary document to make the collection visible
        const tempDocRef = db.collection(collectionName).doc('temp-doc');
        
        // Use set with merge to avoid overwriting if it exists
        await tempDocRef.set({
            _initialized: true,
            _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            _tempDocument: true
        }, { merge: true });
        
        // Delete the temp document right away to leave an empty collection
        await tempDocRef.delete();
    } else {
        console.log(`Collection already exists: ${collectionName}`);
    }
}

/**
 * Initialize a subcollection
 * @param {FirebaseFirestore.Firestore} db - Firestore database instance
 * @param {string} parentCollection - Parent collection name
 * @param {string} documentId - Document ID in parent collection
 * @param {string} subcollectionName - Subcollection name to initialize
 */
async function initializeSubcollection(db, parentCollection, documentId, subcollectionName) {
    try {
        // Create the parent document if it doesn't exist
        const parentDocRef = db.collection(parentCollection).doc(documentId);
        const parentDoc = await parentDocRef.get();
        
        if (!parentDoc.exists) {
            await parentDocRef.set({
                _initialized: true, 
                _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                _tempDocument: true
            });
        }
        
        // Initialize the subcollection by creating and deleting a temp document
        const tempSubDocRef = parentDocRef.collection(subcollectionName).doc('temp-doc');
        await tempSubDocRef.set({
            _initialized: true,
            _createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            _tempDocument: true
        });
        await tempSubDocRef.delete();
        
        // If we created a temp parent document, clean it up
        if (!parentDoc.exists) {
            await parentDocRef.delete();
        }
        
        console.log(`Initialized subcollection: ${parentCollection}/${documentId}/${subcollectionName}`);
    } catch (err) {
        console.error(`Error initializing subcollection ${subcollectionName}:`, err);
        throw err; // Re-throw to be caught by the main function
    }
}