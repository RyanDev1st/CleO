const { warn, info } = require('firebase-functions/logger');
const dataModule = require('./data.js');
const admin = require('firebase-admin');

// filepath: d:/CleO/functions/server/organize_data.js

/**
 * Data structure framework for student collection
 * This module provides utilities to manage student data in Firestore
 */

// Collection name constants
const COLLECTIONS = {
    STUDENTS: 'students'
};

/**
 * Student schema definition
 * Describes the data structure and validation rules for student records
 */
const studentSchema = {
    name: {
        type: 'string',
        required: true,
        description: 'Full name of the student'
    },
    intake: {
        type: 'string',
        required: true,
        description: 'Intake/batch identifier'
    },
    course: {
        type: 'string',
        required: true,
        description: 'Course code (e.g. CSE, ECE)',
        validate: (value) => {
            const courses = ['CSE', 'ECE', 'SME', 'BME', 'BBA', 'BFA']; // Should be expanded
            return courses.includes(value);
        }
    },
    email: {
        type: 'string',
        required: true,
        description: 'Student email address',
        validate: (value) => {
            // Basic email validation
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        }
    },
    sessions: {
        type: 'number',
        required: true,
        description: 'Number of sessions attended',
        defaultValue: 0
    },
    active: {
        type: 'boolean',
        required: true,
        description: 'Whether the student is currently active',
        defaultValue: true
    },
    createdAt: {
        type: 'timestamp',
        required: true,
        description: 'When the student record was created',
        defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
    },
    updatedAt: {
        type: 'timestamp',
        required: true,
        description: 'When the student record was last updated',
        defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
    }
};

/**
 * Validates a student object against the schema
 * @param {Object} studentData - The student data to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateStudent(studentData) {
    const errors = [];
    
    for (const [field, config] of Object.entries(studentSchema)) {
        // Check required fields
        if (config.required && studentData[field] === undefined) {
            errors.push(`Required field '${field}' is missing`);
            continue;
        }
        
        if (studentData[field] !== undefined) {
            // Check type
            const actualType = typeof studentData[field];
            if (config.type === 'timestamp' && !(studentData[field] instanceof Date || 
                    (studentData[field] && typeof studentData[field].toDate === 'function'))) {
                errors.push(`Field '${field}' should be a timestamp`);
            } else if (config.type !== 'timestamp' && actualType !== config.type) {
                errors.push(`Field '${field}' should be of type ${config.type}, got ${actualType}`);
            }
            
            // Run validation function if available
            if (config.validate && !config.validate(studentData[field])) {
                errors.push(`Field '${field}' failed validation`);
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Prepares a student object by applying default values and transformations
 * @param {Object} studentData - The student data to prepare
 * @param {boolean} isUpdate - Whether this is an update operation
 * @returns {Object} - The prepared student object
 */
function prepareStudentData(studentData, isUpdate = false) {
    const prepared = { ...studentData };
    
    // Apply default values for missing fields
    for (const [field, config] of Object.entries(studentSchema)) {
        if (prepared[field] === undefined && config.defaultValue !== undefined) {
            prepared[field] = typeof config.defaultValue === 'function' 
                ? config.defaultValue()
                : config.defaultValue;
        }
    }
    
    // Always update the updatedAt field on updates
    if (isUpdate) {
        prepared.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    
    return prepared;
}

/**
 * Creates a new student record
 * @param {string} id - Student ID
 * @param {Object} studentData - Student data
 * @returns {Promise<boolean>} - Success status
 */
async function createStudent(id, studentData) {
    const validation = validateStudent(studentData);
    if (!validation.valid) {
        warn(`Invalid student data: ${validation.errors.join(', ')}`);
        return false;
    }
    
    const preparedData = prepareStudentData(studentData);
    return await dataModule.saveDataToFirestore(COLLECTIONS.STUDENTS, id, preparedData);
}

/**
 * Updates an existing student record
 * @param {string} id - Student ID to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
async function updateStudent(id, updates) {
    // First retrieve the current student data
    const existingData = await dataModule.getDataFromFirestore(COLLECTIONS.STUDENTS, id);
    if (!existingData) {
        warn(`Student with ID ${id} not found for update`);
        return false;
    }
    
    // Merge existing data with updates
    const mergedData = { ...existingData, ...updates };
    
    // Validate the merged data
    const validation = validateStudent(mergedData);
    if (!validation.valid) {
        warn(`Invalid student update data: ${validation.errors.join(', ')}`);
        return false;
    }
    
    // Prepare and save the updated data
    const preparedData = prepareStudentData(updates, true);
    return await dataModule.saveDataToFirestore(COLLECTIONS.STUDENTS, id, preparedData);
}

/**
 * Increments a student's session count
 * @param {string} id - Student ID
 * @returns {Promise<boolean>} - Success status
 */
async function incrementStudentSession(id) {
    return await dataModule.saveDataToFirestore(COLLECTIONS.STUDENTS, id, {
        sessions: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Activates or deactivates a student
 * @param {string} id - Student ID
 * @param {boolean} isActive - Activation status
 * @returns {Promise<boolean>} - Success status
 */
async function setStudentActiveStatus(id, isActive) {
    return await dataModule.saveDataToFirestore(COLLECTIONS.STUDENTS, id, {
        active: !!isActive,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Gets all students matching a query
 * @param {Object} filters - Filter conditions
 * @returns {Promise<Array>} - Array of student objects
 */
async function queryStudents(filters = {}) {
    let query = admin.firestore().collection(COLLECTIONS.STUDENTS);
    
    // Apply filters
    Object.entries(filters).forEach(([field, value]) => {
        query = query.where(field, '==', value);
    });
    
    try {
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        warn('Error querying students:', error);
        return [];
    }
}

module.exports = {
    // Core functions
    createStudent,
    updateStudent,
    incrementStudentSession,
    setStudentActiveStatus,
    queryStudents,
    
    // Helper functions
    validateStudent,
    prepareStudentData,
    
    // Schema
    studentSchema,
    COLLECTIONS
};