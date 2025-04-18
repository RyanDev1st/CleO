// Client-side data.js (compat version)
import { firebase, db } from './firebase-init.js';

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
        this._collection = db.collection(name);
    }

    /**
     * Add a document to the collection with specified ID
     * @param {string} documentId - Document ID
     * @returns {Document} - Document handler object
     */
    add(documentId) {
        if (!documentId) {
            documentId = db.collection(this.Name).doc().id; // Generate ID if not provided
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
        document._docRef = docRef;
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
            document._docRef = doc.ref;
            documents.push(document);
        });
        
        return documents;
    }

    /**
     * Get multiple documents by their IDs
     * @param {Array<string>} ids - Array of document IDs
     * @returns {Promise<Document[]>} - Array of Document handlers
     */
    async getAllByIds(ids) {
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return [];
        }
        
        // Process in chunks of 10 (Firestore limit for 'in' queries)
        const chunkSize = 10;
        const documents = [];
        
        for (let i = 0; i < ids.length; i += chunkSize) {
            const chunk = ids.slice(i, i + chunkSize);
            const snapshot = await this._collection.where(firebase.firestore.FieldPath.documentId(), 'in', chunk).get();
            
            snapshot.forEach(doc => {
                const document = new Document(this._collection, doc.id, this.Name);
                document._data = doc.data();
                document._docRef = doc.ref;
                documents.push(document);
            });
        }
        
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
            document._docRef = doc.ref;
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
     * Create or update the entire document
     * @param {Object} data - Document data
     * @param {Object} options - Options for the set operation (e.g. { merge: true })
     * @returns {Promise<Document>} - This document (for chaining)
     */
    async set(data, options = {}) {
        if (!data || typeof data !== 'object') {
            throw new Error("Document data must be an object");
        }
        
        await this._docRef.set(data, options);
        this._data = { ...data };
        return this;
    }

    /**
     * Update specific fields of the document
     * @param {Object} fields - Fields to update
     * @returns {Promise<Document>} - This document (for chaining)
     */
    async update(fields) {
        if (!fields || typeof fields !== 'object') {
            throw new Error("Update fields must be an object");
        }
        
        await this._docRef.update(fields);
        
        // Update local data
        Object.keys(fields).forEach(key => {
            this._data[key] = fields[key];
        });
        
        return this;
    }
    
    /**
     * Delete this document from Firestore
     * @returns {Promise<void>}
     */
    async delete() {
        await this._docRef.delete();
        this._data = {};
        this._typeMap = {};
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

// Export necessary items
export {
    Collection,
    Document,
    data,
    firebase  // Export firebase for access to Firestore types
};