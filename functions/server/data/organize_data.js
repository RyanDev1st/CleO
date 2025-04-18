const { warn, info, error } = require('firebase-functions/logger');
const { data } = require('./data.js'); // Use the initialized DataManager instance
const admin = require('firebase-admin');

/**
 * Data Structure Schema and Operations for Firestore
 */

// Collection name constants
const COLLECTIONS = {
    USERS: 'users',
    CLASSES: 'classes',
    SESSIONS: 'sessions',
    USER_CLASSES: 'userClasses'
};

// --- Data Operation Functions ---

/**
 * Gets a user by ID
 * @param {string} userId - User ID to retrieve
 * @returns {Promise<Object|null>} - User data object or null if not found
 */
async function getUserById(userId) {
    try {
        const userDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return userDoc ? userDoc.getData() : null;
    } catch (err) {
        error(`Error getting user ${userId}:`, err);
        throw err; // Re-throw for endpoint handler
    }
}

/**
 * Gets all users
 * @returns {Promise<Array>} - Array of user data objects
 */
async function getAllUsers() {
    try {
        const users = await data.collection(COLLECTIONS.USERS).getAll();
        return users.map(user => user.getData());
    } catch (err) {
        error("Error getting all users:", err);
        throw err;
    }
}

/**
 * Creates or updates a user in Firestore
 * @param {string} userId - User ID (from Firebase Auth)
 * @param {Object} userData - User data to save (email, displayName, role)
 * @returns {Promise<Object>} - User data object
 */
async function createOrUpdateUser(userId, userData) {
    try {
        // Use the correct way to reference a document with a specific ID
        const userDoc = data.collection(COLLECTIONS.USERS).doc(userId);
        
        const dataToSet = {
            uid: userId,
            email: userData.email,
            displayName: userData.displayName,
            role: userData.role,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await userDoc.set(dataToSet, { merge: true }); 
        
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData();
    } catch (err) {
        error(`Error creating/updating user ${userId}:`, err);
        throw err;
    }
}

/**
 * Updates a single field of a user document.
 * Note: For updating multiple fields based on allowed roles, use updateUserFields.
 * @param {string} userId - User ID to update
 * @param {string} field - The specific field name to update.
 * @param {any} value - The new value for the field.
 * @returns {Promise<Object>} - Updated user data object
 */
async function updateUserField(userId, field, value) {
    try {
        // Validate input
        if (!userId || typeof userId !== 'string') {
            throw new Error('User ID must be a non-empty string.');
        }
        if (!field || typeof field !== 'string') {
            throw new Error('Field name must be a non-empty string.');
        }
        if (value === undefined) {
            // Allow setting fields to null, but not undefined
            throw new Error('Value cannot be undefined.');
        }

        const userDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        if (!userDoc) {
            throw new Error(`User ${userId} not found`);
        }

        // Create the update object for Firestore
        const updateObject = { [field]: value };

        // Use the Document's internal reference to call Firestore's update
        await userDoc._docRef.update(updateObject);

        // Fetch updated data to reflect the change
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData(); // Return the full updated document data

    } catch (err) {
        error(`Error updating field '${field}' for user ${userId}:`, err);
        // Re-throw the error for the calling function to handle
        throw err; 
    }
}

/**
 * Updates specific fields of a user
 * @param {string} userId - User ID to update
 * @param {Array<string>} allowedFields - Fields that are allowed to be updated
 * @param {Object} updateData - Data with fields to update
 * @returns {Promise<Object>} - Updated user data object
 */
async function updateUserFields(userId, allowedFields, updateData) {
    try {
        const userDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        if (!userDoc) {
            throw new Error(`User ${userId} not found`);
        }
        
        const fieldsToUpdate = {};
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                fieldsToUpdate[field] = updateData[field];
            }
        }
        
        if (Object.keys(fieldsToUpdate).length > 0) { 
            await userDoc._docRef.update(fieldsToUpdate); 
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData();
    } catch (err) {
        error(`Error updating user ${userId}:`, err);
        throw err;
    }
}

/**
 * Deletes a user
 * @param {string} userId - User ID to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteUser(userId) {
    try {
        const userDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        if (!userDoc) {
            warn(`User ${userId} not found for deletion.`);
            return true; 
        }
        await userDoc.delete();
        return true;
    } catch (err) {
        error(`Error deleting user ${userId}:`, err);
        throw err;
    }
}

/**
 * Creates a new class
 * @param {Object} classData - Class data including name and teacherId
 * @returns {Promise<Object>} - Created class data object including joinCode
 */
async function createClass(classData) {
    try {
        const classesCollection = data.collection(COLLECTIONS.CLASSES);
        const classId = classesCollection._collection.doc().id; // Generate Firestore ID
        const classDoc = classesCollection.add(classId);
        
        const joinCode = generateJoinCode();
        
        const dataToSet = {
            classId,
            name: classData.name,
            teacherId: classData.teacherId,
            joinCode,
            created_at: admin.firestore.Timestamp.now()
        };
        
        await classDoc.set(dataToSet);
        
        return dataToSet; // Return the raw data
    } catch (err) {
        error("Error creating class:", err);
        throw err;
    }
}

/**
 * Gets a class by ID
 * @param {string} classId - Class ID to retrieve
 * @returns {Promise<Object|null>} - Class data object or null if not found
 */
async function getClassById(classId) {
    try {
        const classDoc = await data.collection(COLLECTIONS.CLASSES).get(classId);
        return classDoc ? classDoc.getData() : null;
    } catch (err) {
        error(`Error getting class ${classId}:`, err);
        throw err;
    }
}

/**
 * Gets classes by teacher ID
 * @param {string} teacherId - Teacher's user ID
 * @returns {Promise<Array>} - Array of class data objects
 */
async function getClassesByTeacher(teacherId) {
    try {
        const classes = await data.collection(COLLECTIONS.CLASSES).query(collection => 
            collection.where('teacherId', '==', teacherId)
        );
        return classes.map(c => c.getData());
    } catch (err) {
        error(`Error getting classes for teacher ${teacherId}:`, err);
        throw err;
    }
}

/**
 * Gets classes for a student by their user ID
 * @param {string} studentId - Student's user ID
 * @returns {Promise<Array>} - Array of class data objects
 */
async function getClassesForStudent(studentId) {
    try {
        const db = admin.firestore();
        const userClassesRef = db.collection(`userClasses/${studentId}/classes`);
        const snapshot = await userClassesRef.get();
        
        const classIds = [];
        snapshot.forEach(doc => {
            classIds.push(doc.id);
        });
        
        if (classIds.length === 0) return [];
        
        const classDocs = await data.collection(COLLECTIONS.CLASSES).getAllByIds(classIds);
        return classDocs.map(doc => doc.getData());
        
    } catch (err) {
        error(`Error getting classes for student ${studentId}:`, err);
        throw err;
    }
}

/**
 * Updates a class by ID
 * @param {string} classId - Class ID to update
 * @param {Object} updateData - Data with fields to update (name, regenerateJoinCode)
 * @returns {Promise<Object>} - Updated class data object
 */
async function updateClass(classId, updateData) {
    try {
        const classDoc = await data.collection(COLLECTIONS.CLASSES).get(classId);
        if (!classDoc) {
            throw new Error(`Class ${classId} not found`);
        }
        
        const fieldsToUpdate = {};
        let newJoinCode = undefined;

        if (updateData.name) {
            fieldsToUpdate.name = updateData.name;
        }
        
        if (updateData.regenerateJoinCode) {
            newJoinCode = generateJoinCode();
            fieldsToUpdate.joinCode = newJoinCode;
        }
        
        if (Object.keys(fieldsToUpdate).length > 0) {
            // Fixed: Use _docRef.update instead of direct update call
            await classDoc._docRef.update(fieldsToUpdate);
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.CLASSES).get(classId);
        const updatedData = updatedDoc.getData();
        
        return {
            ...updatedData,
            joinCode: updateData.regenerateJoinCode ? newJoinCode : updatedData.joinCode
        };
    } catch (err) {
        error(`Error updating class ${classId}:`, err);
        throw err;
    }
}

/**
 * Finds a class by join code
 * @param {string} joinCode - Class join code
 * @returns {Promise<Object|null>} - Class data object or null if not found
 */
async function findClassByJoinCode(joinCode) {
    try {
        const classes = await data.collection(COLLECTIONS.CLASSES).query(collection => 
            collection.where('joinCode', '==', joinCode).limit(1)
        );
        
        return classes.length > 0 ? classes[0].getData() : null;
    } catch (err) {
        error(`Error finding class with join code ${joinCode}:`, err);
        throw err;
    }
}

/**
 * Adds a student to a class (updates subcollections)
 * @param {string} classId - Class ID
 * @param {string} studentId - Student's user ID
 * @param {string} className - Class name (for denormalization)
 * @param {string} teacherName - Teacher name (for denormalization)
 * @returns {Promise<boolean>} - Success status
 */
async function addStudentToClass(classId, studentId, className, teacherName) {
    try {
        const db = admin.firestore();
        const studentRef = db.doc(`classes/${classId}/students/${studentId}`);
        const userClassRef = db.doc(`userClasses/${studentId}/classes/${classId}`);
        
        const timestamp = admin.firestore.Timestamp.now();
        const batch = db.batch();
        
        batch.set(studentRef, { joinDate: timestamp });
        batch.set(userClassRef, { className, teacherName, joinDate: timestamp });
        
        await batch.commit();
        return true;
    } catch (err) {
        error(`Error adding student ${studentId} to class ${classId}:`, err);
        throw err;
    }
}

/**
 * Deletes a class and all its related data (students subcollection, userClasses refs)
 * @param {string} classId - Class ID to delete
 * @returns {Promise<boolean>} - Success status
 */
async function deleteClass(classId) {
    try {
        const db = admin.firestore();
        const batch = db.batch();
        
        const studentsRef = db.collection(`classes/${classId}/students`);
        const studentsSnapshot = await studentsRef.get();
        
        studentsSnapshot.forEach(doc => {
            const studentId = doc.id;
            batch.delete(db.doc(`userClasses/${studentId}/classes/${classId}`));
            batch.delete(doc.ref);
        });
        
        batch.delete(db.doc(`classes/${classId}`));
        
        await batch.commit();
        return true;
    } catch (err) {
        error(`Error deleting class ${classId}:`, err);
        throw err;
    }
}

/**
 * Creates a new session
 * @param {Object} sessionData - Session data (classId, teacherId, location, radius)
 * @returns {Promise<Object>} - Created session data object
 */
async function createSession(sessionData) {
    try {
        const sessionsCollection = data.collection(COLLECTIONS.SESSIONS);
        const sessionId = sessionsCollection._collection.doc().id;
        const sessionDoc = sessionsCollection.add(sessionId);
        
        const timestamp = admin.firestore.Timestamp.now();
        
        const dataToSet = {
            sessionId,
            classId: sessionData.classId,
            teacherId: sessionData.teacherId,
            startTime: timestamp,
            endTime: null,
            status: 'active',
            location: new admin.firestore.GeoPoint(
                sessionData.location.latitude, 
                sessionData.location.longitude
            ),
            radius: sessionData.radius,
            created_at: timestamp
        };
        
        await sessionDoc.set(dataToSet);
        return dataToSet;
    } catch (err) {
        error("Error creating session:", err);
        throw err;
    }
}

/**
 * Gets a session by ID
 * @param {string} sessionId - Session ID to retrieve
 * @returns {Promise<Object|null>} - Session data object or null if not found
 */
async function getSessionById(sessionId) {
    try {
        const sessionDoc = await data.collection(COLLECTIONS.SESSIONS).get(sessionId);
        return sessionDoc ? sessionDoc.getData() : null;
    } catch (err) {
        error(`Error getting session ${sessionId}:`, err);
        throw err;
    }
}

/**
 * Gets all sessions for a teacher
 * @param {string} teacherId - Teacher's user ID
 * @returns {Promise<Array>} - Array of session data objects
 */
async function getSessionsByTeacher(teacherId) {
    try {
        const sessions = await data.collection(COLLECTIONS.SESSIONS).query(collection => 
            collection.where('teacherId', '==', teacherId)
        );
        return sessions.map(s => s.getData());
    } catch (err) {
        error(`Error getting sessions for teacher ${teacherId}:`, err);
        throw err;
    }
}

/**
 * Gets active sessions for classes a student is enrolled in
 * @param {string} studentId - Student's user ID
 * @param {Array<string>} classIds - Array of class IDs the student is enrolled in
 * @returns {Promise<Array>} - Array of active session data objects
 */
async function getActiveSessionsForStudent(studentId, classIds) {
    try {
        if (!classIds || classIds.length === 0) {
            return [];
        }
        
        const sessions = await data.collection(COLLECTIONS.SESSIONS).query(collection => 
            collection
                .where('classId', 'in', classIds)
                .where('status', '==', 'active')
        );
        
        return sessions.map(s => s.getData());
    } catch (err) {
        error(`Error getting active sessions for student ${studentId}:`, err);
        throw err;
    }
}

/**
 * Updates a session's status
 * @param {string} sessionId - Session ID to update
 * @param {string} status - New status ('ended' or 'cancelled')
 * @returns {Promise<Object>} - Updated session data object
 */
async function updateSessionStatus(sessionId, status) {
    try {
        const sessionDoc = await data.collection(COLLECTIONS.SESSIONS).get(sessionId);
        if (!sessionDoc) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        const currentStatus = sessionDoc.get('status');
        if ((status === 'ended' || status === 'cancelled') && currentStatus === 'active') {
            // Fixed: Use _docRef.update instead of direct update call
            await sessionDoc._docRef.update({
                status: status,
                endTime: admin.firestore.Timestamp.now()
            });
        } else {
            throw new Error(`Invalid status transition from ${currentStatus} to ${status}`);
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.SESSIONS).get(sessionId);
        return updatedDoc.getData();
    } catch (err) {
        error(`Error updating session ${sessionId} status:`, err);
        throw err;
    }
}

/**
 * Gets attendance records for a session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Array>} - Array of attendance data objects
 */
async function getSessionAttendance(sessionId) {
    try {
        const db = admin.firestore();
        const attendanceRef = db.collection(`sessions/${sessionId}/attendance`);
        const snapshot = await attendanceRef.get();
        
        const attendanceList = [];
        snapshot.forEach(doc => {
            attendanceList.push({
                studentId: doc.id,
                ...doc.data()
            });
        });
        
        return attendanceList;
    } catch (err) {
        error(`Error getting attendance for session ${sessionId}:`, err);
        throw err;
    }
}

/**
 * Checks in a student to a session
 * @param {string} sessionId - Session ID
 * @param {string} studentId - Student's user ID
 * @param {Object} location - Student's location {latitude, longitude}
 * @returns {Promise<Object>} - Check-in result { status, distance, allowedRadius }
 */
async function checkInStudent(sessionId, studentId, location) {
    try {
        const db = admin.firestore();
        const sessionDocData = await getSessionById(sessionId);
        if (!sessionDocData) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        if (sessionDocData.status !== 'active') {
            throw new Error('Session is not active');
        }
        
        const classId = sessionDocData.classId;
        const studentRef = db.doc(`classes/${classId}/students/${studentId}`);
        const studentDoc = await studentRef.get();
        
        if (!studentDoc.exists) {
            throw new Error('Student not enrolled in this class');
        }
        
        const attendanceRef = db.doc(`sessions/${sessionId}/attendance/${studentId}`);
        const attendanceDoc = await attendanceRef.get();
        
        if (attendanceDoc.exists && 
            (attendanceDoc.data().status === 'checked_in' || 
             attendanceDoc.data().status === 'verified')) {
            throw new Error('Already checked in');
        }
        
        const studentLocation = new admin.firestore.GeoPoint(location.latitude, location.longitude);
        const sessionLocation = sessionDocData.location;
        const allowedRadius = sessionDocData.radius;
        
        const distance = calculateDistance(
            { latitude: sessionLocation.latitude, longitude: sessionLocation.longitude },
            { latitude: location.latitude, longitude: location.longitude }
        );
        
        const isLocationValid = distance <= allowedRadius;
        const timestamp = admin.firestore.Timestamp.now();
        const checkInStatus = isLocationValid ? 'verified' : 'failed_location';
        
        await attendanceRef.set({
            classId,
            checkInTime: timestamp,
            checkInLocation: studentLocation,
            status: checkInStatus,
            isGpsVerified: isLocationValid,
            lastUpdated: timestamp
        });
        
        return {
            status: checkInStatus,
            distance: Math.round(distance),
            allowedRadius
        };
    } catch (err) {
        error(`Error checking in student ${studentId} for session ${sessionId}:`, err);
        throw err;
    }
}

// --- Helper Functions ---

/**
 * Calculates the distance between two geographical points using the Haversine formula
 * @param {Object} point1 - First point {latitude, longitude}
 * @param {Object} point2 - Second point {latitude, longitude}
 * @returns {number} - Distance in meters
 */
function calculateDistance(point1, point2) {
    const toRad = value => value * Math.PI / 180;
    const R = 6371e3; // Earth radius in meters
    
    const φ1 = toRad(point1.latitude);
    const φ2 = toRad(point2.latitude);
    const Δφ = toRad(point2.latitude - point1.latitude);
    const Δλ = toRad(point2.longitude - point1.longitude);
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
}

/**
 * Generate a random join code for classes
 * @returns {string} - A 6-character join code
 */
function generateJoinCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
}

// --- Schema Definitions (for reference) ---
const SCHEMA = {
    USER: {
        uid: { type: 'string', required: true, description: 'Matches Firebase Auth UID' },
        email: { type: 'string', required: true, description: 'User email address' },
        displayName: { type: 'string', required: true, description: 'User full name' },
        role: { 
            type: 'string', 
            required: true, 
            description: 'User role', 
            enum: ['teacher', 'student', 'admin'] 
        },
        created_at: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the user was created',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    },

    CLASS: {
        classId: { type: 'string', required: true, description: 'Class ID (auto-generated)' },
        name: { type: 'string', required: true, description: 'Name of the class' },
        teacherId: { type: 'string', required: true, description: 'UID of the teacher' },
        joinCode: { type: 'string', required: true, description: 'Short code for students to join' },
        created_at: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the class was created',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    },

    CLASS_STUDENT: {
        joinDate: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the student joined the class',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    },

    SESSION: {
        sessionId: { type: 'string', required: true, description: 'Session ID (auto-generated)' },
        classId: { type: 'string', required: true, description: 'ID of the associated class' },
        teacherId: { type: 'string', required: true, description: 'UID of the teacher' },
        startTime: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the session started',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        },
        endTime: { 
            type: 'timestamp', 
            required: false, 
            description: 'When the session ended (null if active)'
        },
        status: { 
            type: 'string', 
            required: true, 
            description: 'Session status', 
            enum: ['scheduled', 'active', 'ended', 'cancelled'],
            defaultValue: 'active'
        },
        location: { 
            type: 'geopoint', 
            required: true, 
            description: 'Target geographical coordinate for attendance'
        },
        radius: { 
            type: 'number', 
            required: true, 
            description: 'Radius in meters for valid check-in'
        },
        created_at: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the session was created',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    },

    SESSION_ATTENDANCE: {
        classId: { type: 'string', required: true, description: 'ID of the associated class' },
        checkInTime: { 
            type: 'timestamp', 
            required: false, 
            description: 'When the student checked in'
        },
        checkInLocation: { 
            type: 'geopoint', 
            required: false, 
            description: 'Location where the student checked in'
        },
        status: { 
            type: 'string', 
            required: true, 
            description: 'Attendance status', 
            enum: ['pending', 'checked_in', 'verified', 'failed_location', 'failed_other', 'absent'],
            defaultValue: 'pending'
        },
        isGpsVerified: { 
            type: 'boolean', 
            required: true, 
            description: 'Flag indicating if GPS proximity check passed',
            defaultValue: false
        },
        lastUpdated: { 
            type: 'timestamp', 
            required: true, 
            description: 'Last update timestamp',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    },

    USER_CLASS: {
        className: { type: 'string', required: true, description: 'Denormalized class name' },
        teacherName: { type: 'string', required: true, description: 'Denormalized teacher name' },
        joinDate: { 
            type: 'timestamp', 
            required: true, 
            description: 'When the student joined',
            defaultValue: () => admin.firestore.FieldValue.serverTimestamp()
        }
    }
};

const paths = {
    user: (userId) => `${COLLECTIONS.USERS}/${userId}`,
    class: (classId) => `${COLLECTIONS.CLASSES}/${classId}`,
    classStudents: (classId) => `${COLLECTIONS.CLASSES}/${classId}/students`,
    classStudent: (classId, studentId) => `${COLLECTIONS.CLASSES}/${classId}/students/${studentId}`,
    session: (sessionId) => `${COLLECTIONS.SESSIONS}/${sessionId}`,
    sessionAttendance: (sessionId) => `${COLLECTIONS.SESSIONS}/${sessionId}/attendance`,
    studentAttendance: (sessionId, studentId) => `${COLLECTIONS.SESSIONS}/${sessionId}/attendance/${studentId}`,
    userClasses: (userId) => `${COLLECTIONS.USER_CLASSES}/${userId}/classes`,
    userClass: (userId, classId) => `${COLLECTIONS.USER_CLASSES}/${userId}/classes/${classId}`
};

module.exports = {
    getUserById,
    getAllUsers,
    createOrUpdateUser,
    updateUserField,
    updateUserFields,
    deleteUser,
    createClass,
    getClassById,
    getClassesByTeacher,
    getClassesForStudent,
    updateClass,
    findClassByJoinCode,
    addStudentToClass,
    deleteClass,
    createSession,
    getSessionById,
    getSessionsByTeacher,
    getActiveSessionsForStudent,
    updateSessionStatus,
    getSessionAttendance,
    checkInStudent,
    COLLECTIONS,
    SCHEMA,
    paths,
    calculateDistance,
    generateJoinCode
};