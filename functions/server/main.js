/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

/**
 * Firebase Cloud Functions Entry Point
 */

const { onRequest, onCall } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Reference to Firestore database
const db = admin.firestore();

/**
 * Simple HTTP endpoint
 */
exports.api = onRequest((request, response) => {
  logger.info("API request received", { path: request.path, method: request.method });
  
  try {
    // Handle different HTTP methods
    switch (request.method) {
      case 'GET':
        response.json({ message: "API is working!", timestamp: new Date().toISOString() });
        break;
      
      case 'POST':
        // Example handling POST data
        const data = request.body || {};
        logger.info("Received data", { data });
        response.json({ 
          message: "Data received successfully", 
          dataReceived: data 
        });
        break;
        
      default:
        response.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error in API function", error);
    response.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Callable function example
 */
exports.getServerTime = onCall((data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    throw new Error('Unauthorized access');
  }
  
  return {
    timestamp: admin.firestore.Timestamp.now(),
    date: new Date().toISOString(),
    userId: context.auth.uid
  };
});

// Log that the functions have been initialized
logger.info("Firebase Functions initialized successfully");