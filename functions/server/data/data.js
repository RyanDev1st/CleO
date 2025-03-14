const { warn } = require('firebase-functions/logger');
const main = require('../main.js'); // Adjust the path as necessary
const admin = main.admin;
// data.js

const courses = [
    'CSE',
    'ECE',
    'SME',
    'BME',
    'BBA',
    'BFA',
    '...', // Add more courses
];

//this is just a placeholder


const data_placeholder = {
    students : {
        // id : {}
        id : { // EXAMPLE
            name: '', //string
            intake: '', //string
            course: '', //string
            email: '', //string
            sessions : '', // interger
            active: '', // boolean
            // Add more data
        }
    }
};

// ...Internal Data Handling...
function getData(key) {
    return data[key];
}

// Function to set data
function setData(key, value) {
    data[key] = value;
}

// Initialize Firestore
admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const db = admin.firestore();
// ...External Data Handling...

async function getDataFromFirestore(collection, docId) {
    try {
        const doc = await db.collection(collection).doc(docId).get();
        if (!doc.exists) {
            console.log('No such document!');
            return null;
        } else {
            return doc.data();
        }
    } catch (error) {
        console.error('Error getting document:', error);
        return null;
    }
}

// ...existing code...
// Function to save data to Firestore
async function saveDataToFirestore(collection, docId, data) {
    try {
        await db.collection(collection).doc(docId).set(data, { merge: true });
        console.log(`Document ${docId} successfully written to ${collection}!`);
        return true;
    } catch (error) {
        console.error('Error writing document:', error);
        return false;
    }
}
// Function to save all in-memory data to Firestore
async function syncDataToFirestore() {
    try {
        // Save each collection in the data object
        for (const [collection, documents] of Object.entries(data)) {
            // If it's an object with key-value pairs
            if (typeof documents === 'object' && !Array.isArray(documents)) {
                for (const [docId, docData] of Object.entries(documents)) {
                    await saveDataToFirestore(collection, docId, docData);
                }
            }
        }
        console.log('All data successfully synced to Firestore!');
        return true;
    } catch (error) {
        console.error('Error syncing data to Firestore:', error);
        return false;
    }
}

// Function to load all data from Firestore into memory
async function loadDataFromFirestore() {
    try {
        // For each collection in data
        for (const collection of Object.keys(data)) {
            const snapshot = await db.collection(collection).get();
            
            if (snapshot.empty) {
                console.log(`No documents in collection ${collection}`);
                continue;
            }
            
            // Initialize the collection if it doesn't exist
            if (!data[collection]) data[collection] = {};
            
            // Add each document to the in-memory data
            snapshot.forEach(doc => {
                data[collection][doc.id] = doc.data();
            });
        }
        console.log('All data loaded from Firestore!');
        return true;
    } catch (error) {
        console.error('Error loading data from Firestore:', error);
        return false;
    }
}

// ...existing code...


// Exporting the functions
module.exports = {
    getData,
    setData,
    getDataFromFirestore,
    saveDataToFirestore,
    syncDataToFirestore,
    loadDataFromFirestore,
    data // Export the data object if needed
};

