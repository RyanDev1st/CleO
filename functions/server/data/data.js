const { warn, info, error } = require('firebase-functions/logger');
const main = require('../main.js');
const admin = main.admin;
const crypto = require('crypto');

/**
 * Represents a Firestore collection with advanced document handling
 */
class Collection {
    /**
     * Create a new Collection handler
     * @param {string} name - The name of the Firestore collection
     */
    constructor(name) {
        if (!name || typeof name !== 'string') {
            throw new Error("Collection name is required and must be a string");
        }
        
        this.Name = name;
        this._collection = admin.firestore().collection(name);
    }

    /**
     * Add a document to the collection with specified ID
     * @param {string} documentId - Document ID
     * @returns {Document} - Document handler object
     */
    add(documentId) {
        if (!documentId) {
            documentId = this._collection.doc().id; // Generate ID if not provided
        }
        
        return new Document(this._collection, documentId, this.Name);
    }
    
    /**
     * Get a document from the collection by ID
     * @param {string} documentId - Document ID to retrieve
     * @returns {Promise<Document|null>} - Document handler or null if not found
     */
    async get(documentId) {
        const docRef = this._collection.doc(documentId);
        const snapshot = await docRef.get();
        
        if (!snapshot.exists) {
            return null;
        }
        
        const document = new Document(this._collection, documentId, this.Name);
        document._data = snapshot.data();
        return document;
    }
    
    /**
     * Get all documents in the collection
     * @returns {Promise<Document[]>} - Array of Document handlers
     */
    async getAll() {
        const snapshot = await this._collection.get();
        const documents = [];
        
        snapshot.forEach(doc => {
            const document = new Document(this._collection, doc.id, this.Name);
            document._data = doc.data();
            documents.push(document);
        });
        
        return documents;
    }
    
    /**
     * Query documents in the collection
     * @param {Function} queryBuilder - Function that builds and returns a Firestore query
     * @returns {Promise<Document[]>} - Array of Document handlers
     */
    async query(queryBuilder) {
        if (typeof queryBuilder !== 'function') {
            throw new Error("Query builder must be a function");
        }
        
        const query = queryBuilder(this._collection);
        const snapshot = await query.get();
        const documents = [];
        
        snapshot.forEach(doc => {
            const document = new Document(this._collection, doc.id, this.Name);
            document._data = doc.data();
            documents.push(document);
        });
        
        return documents;
    }
}

/**
 * Represents a Firestore document with field management
 */
class Document {
    /**
     * Create a new Document handler
     * @param {FirebaseFirestore.CollectionReference} collection - Firestore collection reference
     * @param {string} documentId - Document ID
     * @param {string} collectionName - Name of the parent collection
     */
    constructor(collection, documentId, collectionName) {
        this.documentId = documentId;
        this.collectionName = collectionName;
        this._docRef = collection.doc(documentId);
        this._data = {};
        this._typeMap = {};
        this._encryptedFields = new Set();
        this._encodedFields = new Set();
    }
    
    /**
     * Convert value to the specified type
     * @param {any} value - Value to convert
     * @param {string} type - Target type
     * @returns {any} - Converted value
     */
    _convertToType(value, type) {
        const typeString = type.toLowerCase();
        
        try {
            switch (typeString) {
                case 'string':
                    return String(value);
                case 'number':
                case 'integer':
                    return Number(value);
                case 'boolean':
                    if (typeof value === 'string') {
                        return value.toLowerCase() === 'true';
                    }
                    return Boolean(value);
                case 'timestamp':
                    if (value instanceof Date) {
                        return admin.firestore.Timestamp.fromDate(value);
                    } else if (value instanceof admin.firestore.Timestamp) {
                        return value;
                    } else if (typeof value === 'number') {
                        return admin.firestore.Timestamp.fromMillis(value);
                    } else if (typeof value === 'string') {
                        return admin.firestore.Timestamp.fromDate(new Date(value));
                    }
                    throw new Error(`Cannot convert ${typeof value} to Timestamp`);
                case 'geopoint':
                    if (typeof value === 'object' && 'latitude' in value && 'longitude' in value) {
                        return new admin.firestore.GeoPoint(value.latitude, value.longitude);
                    }
                    throw new Error(`Cannot convert to GeoPoint: invalid format`);
                case 'array':
                    if (Array.isArray(value)) {
                        return value;
                    }
                    return [value];
                case 'map':
                case 'object':
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        return value;
                    } else if (typeof value === 'string') {
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            throw new Error(`Cannot convert string to object: ${e.message}`);
                        }
                    }
                    throw new Error(`Cannot convert ${typeof value} to Object`);
                default:
                    return value;
            }
        } catch (e) {
            error(`Type conversion error for ${type}: ${e.message}`);
            throw new Error(`Failed to convert to ${type}: ${e.message}`);
        }
    }
    
    /**
     * Add a field to the document with type checking
     * @param {string} fieldName - Name of the field
     * @param {string} type - Data type (string, number, boolean, etc.)
     * @param {any} fieldData - Field value
     * @param {Function} [func] - Optional function to execute while adding field
     * @returns {Document} - This document (for chaining)
     */
    async add(fieldName, type, fieldData, func) {
        if (!fieldName || typeof fieldName !== 'string') {
            throw new Error("Field name is required and must be a string");
        }
        
        // Default to string if no type is specified
        const dataType = type || 'string';
        
        try {
            // Convert the data to the specified type
            const convertedData = this._convertToType(fieldData, dataType);
            
            // Update local data
            this._data[fieldName] = convertedData;
            this._typeMap[fieldName] = dataType;
            
            // Execute custom function if provided
            if (typeof func === 'function') {
                await func(fieldName, convertedData, this);
            }
            
            // Update Firestore document
            await this._docRef.set({ [fieldName]: convertedData }, { merge: true });
            
            return this;
        } catch (e) {
            error(`Error adding field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to add field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Replace a field's value in the document
     * @param {string} fieldName - Name of the field to replace
     * @param {any} fieldData - New field value
     * @param {Function} [func] - Optional function to execute during replacement
     * @returns {Document} - This document (for chaining)
     */
    async replace(fieldName, fieldData, func) {
        if (!fieldName || typeof fieldName !== 'string') {
            throw new Error("Field name is required and must be a string");
        }
        
        // If no field data provided, do nothing
        if (fieldData === undefined) {
            return this;
        }
        
        try {
            // Get the original type of the field
            const dataType = this._typeMap[fieldName] || 'string';
            
            // Convert the data to the original type
            const convertedData = this._convertToType(fieldData, dataType);
            
            // Update local data
            this._data[fieldName] = convertedData;
            
            // Execute custom function if provided
            if (typeof func === 'function') {
                await func(fieldName, convertedData, this);
            }
            
            // Update Firestore document
            await this._docRef.update({ [fieldName]: convertedData });
            
            return this;
        } catch (e) {
            error(`Error replacing field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to replace field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Remove a field from the document
     * @param {string} fieldName - Name of the field to remove
     * @returns {Document} - This document (for chaining)
     */
    async remove(fieldName) {
        if (!fieldName || typeof fieldName !== 'string') {
            throw new Error("Field name is required and must be a string");
        }
        
        try {
            // Remove from local data
            delete this._data[fieldName];
            delete this._typeMap[fieldName];
            
            // Remove from encrypted/encoded sets
            this._encryptedFields.delete(fieldName);
            this._encodedFields.delete(fieldName);
            
            // Update Firestore document (removing the field)
            await this._docRef.update({
                [fieldName]: admin.firestore.FieldValue.delete()
            });
            
            return this;
        } catch (e) {
            error(`Error removing field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to remove field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Encrypt a field using RSA encryption
     * @param {string} fieldName - Name of the field to encrypt
     * @param {string} key - RSA public key for encryption
     * @returns {Document} - This document (for chaining)
     */
    async encrypt(fieldName, key) {
        if (!fieldName || !this._data[fieldName]) {
            throw new Error(`Field ${fieldName} does not exist or has no value`);
        }
        
        if (!key) {
            throw new Error("Encryption key is required");
        }
        
        try {
            // Convert value to string
            const valueStr = JSON.stringify(this._data[fieldName]);
            
            // Encrypt the data
            const buffer = Buffer.from(valueStr);
            const encrypted = crypto.publicEncrypt(key, buffer).toString('base64');
            
            // Update local data and mark as encrypted
            this._data[fieldName] = encrypted;
            this._encryptedFields.add(fieldName);
            
            // Update Firestore document
            await this._docRef.update({ [fieldName]: encrypted });
            
            return this;
        } catch (e) {
            error(`Error encrypting field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to encrypt field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Encode a field value to binary
     * @param {string} fieldName - Name of the field to encode
     * @returns {Document} - This document (for chaining)
     */
    async encode(fieldName) {
        if (!fieldName || !this._data[fieldName]) {
            throw new Error(`Field ${fieldName} does not exist or has no value`);
        }
        
        try {
            // Convert value to string
            const valueStr = JSON.stringify(this._data[fieldName]);
            
            // Encode as Base64
            const encoded = Buffer.from(valueStr).toString('base64');
            
            // Update local data and mark as encoded
            this._data[fieldName] = encoded;
            this._encodedFields.add(fieldName);
            
            // Update Firestore document
            await this._docRef.update({ [fieldName]: encoded });
            
            return this;
        } catch (e) {
            error(`Error encoding field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to encode field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Decode a field value from binary
     * @param {string} fieldName - Name of the field to decode
     * @returns {Document} - This document (for chaining)
     */
    async decode(fieldName) {
        if (!fieldName || !this._data[fieldName]) {
            throw new Error(`Field ${fieldName} does not exist or has no value`);
        }
        
        if (!this._encodedFields.has(fieldName)) {
            warn(`Field ${fieldName} is not marked as encoded, attempting to decode anyway`);
        }
        
        try {
            // Decode from Base64
            const decoded = Buffer.from(this._data[fieldName], 'base64').toString('utf-8');
            
            // Parse the decoded string
            const parsedData = JSON.parse(decoded);
            
            // Update local data and remove from encoded set
            this._data[fieldName] = parsedData;
            this._encodedFields.delete(fieldName);
            
            // Update Firestore document
            await this._docRef.update({ [fieldName]: parsedData });
            
            return this;
        } catch (e) {
            error(`Error decoding field ${fieldName}: ${e.message}`);
            throw new Error(`Failed to decode field ${fieldName}: ${e.message}`);
        }
    }
    
    /**
     * Get all field data in the document
     * @returns {Object} - Document data
     */
    getData() {
        return { ...this._data };
    }
    
    /**
     * Get a specific field value
     * @param {string} fieldName - Field name
     * @returns {any} - Field value
     */
    get(fieldName) {
        return this._data[fieldName];
    }
    
    /**
     * Delete this document from Firestore
     * @returns {Promise<void>}
     */
    async delete() {
        await this._docRef.delete();
        this._data = {};
        this._typeMap = {};
        this._encryptedFields.clear();
        this._encodedFields.clear();
    }
    
    /**
     * Create or update the entire document
     * @param {Object} data - Document data
     * @returns {Document} - This document (for chaining)
     */
    async set(data) {
        if (!data || typeof data !== 'object') {
            throw new Error("Document data must be an object");
        }
        
        await this._docRef.set(data);
        this._data = { ...data };
        return this;
    }
}

/**
 * Data manager for handling collections
 */
class DataManager {
    constructor() {
        this._collections = {};
    }
    
    /**
     * Get a Collection handler
     * @param {string} collectionName - Name of the collection
     * @returns {Collection} - Collection handler
     */
    collection(collectionName) {
        if (!this._collections[collectionName]) {
            this._collections[collectionName] = new Collection(collectionName);
        }
        return this._collections[collectionName];
    }
}

// Create a global data manager instance
const data = new DataManager();

// Export necessary classes and the data manager
module.exports = {
    Collection,
    Document,
    data
};
// /users/{userId}
//  uid: String // Matches Firebase Auth UID (Document ID should be the UID)
//  email: String // User's email
//  displayName: String // User's full name
//  role: String // 'teacher' | 'student'
//  created_at: Timestamp // Firestore Timestamp when the user was created

// /classes/{classId}
//  classId: String // Document ID (auto-generated)
//  name: String // Name of the class (e.g., "Computer Science 101")
//  teacherId: String // UID of the teacher (references /users/{userId})
//  joinCode: String // Optional, short code for students to join the class
//  created_at: Timestamp // Firestore Timestamp when the class was created

// /classes/{classId}/students/{userId} // <-- Subcollection for Students
//  // Document ID is the student's userId
//  joinDate: Timestamp // When the student joined the class

// /sessions/{sessionId}
//  sessionId: String // Document ID (auto-generated)
//  classId: String // ID of the class this session belongs to (references /classes/{classId})
//  teacherId: String // UID of the teacher running the session (references /users/{userId})
//  startTime: Timestamp // When the session is scheduled to start or actually started
//  endTime: Timestamp | null // When the session actually ended. Null if active/pending.
//  status: String // 'scheduled' | 'active' | 'ended' | 'cancelled'
//  location: GeoPoint // Target geographical coordinate for attendance check
//  radius: Number // Radius in meters around 'location' for valid check-in
//  created_at: Timestamp // Firestore Timestamp when the session was created

// /sessions/{sessionId}/attendance/{studentId} // <-- Subcollection for Attendance Records
//  // Document ID is the student's userId
//  classId: String // Keep for potential cross-session queries per student per class
//  checkInTime: Timestamp | null // Timestamp when the student attempted check-in
//  checkInLocation: GeoPoint | null // GeoPoint where the student attempted check-in
//  status: String // 'pending' | 'checked_in' | 'verified' | 'failed_location' | 'failed_other' | 'absent'
//  isGpsVerified: Boolean // Flag indicating if GPS proximity check passed
//  // isFaceIdVerified: Boolean // Keep commented out or remove if not part of MVP
//  lastUpdated: Timestamp // Firestore Timestamp of the last update to this record
 
// // Optional: For efficient student lookup of their classes
// /userClasses/{userId}/classes/{classId}
//  // Document ID is the classId
//  // Store minimal data, maybe just a reference or the class name for quick display
//  className: String // Denormalized for quick display in student's class list
//  teacherName: String // Denormalized teacher name (optional)
//  joinDate: Timestamp // When the student joined

