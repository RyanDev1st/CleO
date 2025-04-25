// filepath: d:\CleO\public\js\initialize-firestore.js
// Initialize Firestore collections to ensure they appear in Firebase Emulator UI
// This file now only exports helper functions for the main firebase-init.js initialization

import { getInitializedFirebase, initializeFirestoreData } from './firebase-init.js';

/**
 * This is a convenience re-export of the initialization function from firebase-init.js
 * It allows code that previously imported from this file to continue working without changes
 * 
 * @param {boolean} force - Whether to force reinitialization
 * @returns {Promise<boolean>} - Success status
 */
export async function initializeFirestoreCollections(force = false) {
    console.log('Redirecting Firestore initialization request to firebase-init.js...');
    // Get the initialized Firebase services first
    const { db, firebase, firestoreInitialized } = await getInitializedFirebase();
    
    // Check if already initialized and not forcing
    if (firestoreInitialized && !force) {
        console.log('Firestore collections already initialized in firebase-init.js, skipping');
        return true;
    }
    
    // Forward to the centralized initialization function
    return await initializeFirestoreData();
}

// Export any helper functions that might still be needed elsewhere
// but remove any auto-initialization code

/**
 * Utility function for getting collection references
 * @param {string} collectionName - Name of the collection
 * @returns {Promise<FirebaseFirestore.CollectionReference|null>} - Collection reference or null
 */
export async function getCollection(collectionName) {
    const { db } = await getInitializedFirebase();
    if (!db) return null;
    return db.collection(collectionName);
}