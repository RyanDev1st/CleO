// Client-side organize_data.js (compat version)
import { data, firebase } from './data.js';
import { db, auth } from './firebase-init.js';

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
        console.error(`Error getting user ${userId}:`, err);
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
        console.error("Error getting all users:", err);
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
        const userDoc = data.collection(COLLECTIONS.USERS).add(userId);
        const dataToSet = {
            uid: userId,
            email: userData.email,
            displayName: userData.displayName,
            role: userData.role,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await userDoc.set(dataToSet, { merge: true }); 
        
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData();
    } catch (err) {
        console.error(`Error creating/updating user ${userId}:`, err);
        throw err;
    }
}

/**
 * Updates a single field of a user document.
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

        // Update the document
        await userDoc.update(updateObject);

        // Fetch updated data to reflect the change
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData(); // Return the full updated document data

    } catch (err) {
        console.error(`Error updating field '${field}' for user ${userId}:`, err);
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
            await userDoc.update(fieldsToUpdate); 
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.USERS).get(userId);
        return updatedDoc.getData();
    } catch (err) {
        console.error(`Error updating user ${userId}:`, err);
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
            console.warn(`User ${userId} not found for deletion.`);
            return true; 
        }
        await userDoc.delete();
        return true;
    } catch (err) {
        console.error(`Error deleting user ${userId}:`, err);
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
        const classId = db.collection(COLLECTIONS.CLASSES).doc().id; // Generate Firestore ID
        const classDoc = classesCollection.add(classId);
        
        const joinCode = generateJoinCode();
        
        const dataToSet = {
            classId,
            name: classData.name,
            teacherId: classData.teacherId,
            joinCode,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await classDoc.set(dataToSet);
        
        return dataToSet; // Return the raw data
    } catch (err) {
        console.error("Error creating class:", err);
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
        console.error(`Error getting class ${classId}:`, err);
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
        console.error(`Error getting classes for teacher ${teacherId}:`, err);
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
        console.error(`Error getting classes for student ${studentId}:`, err);
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
            await classDoc.update(fieldsToUpdate);
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.CLASSES).get(classId);
        const updatedData = updatedDoc.getData();
        
        return {
            ...updatedData,
            joinCode: updateData.regenerateJoinCode ? newJoinCode : updatedData.joinCode
        };
    } catch (err) {
        console.error(`Error updating class ${classId}:`, err);
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
        console.error(`Error finding class with join code ${joinCode}:`, err);
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
        const studentRef = db.collection(`classes/${classId}/students`).doc(studentId);
        const userClassRef = db.collection(`userClasses/${studentId}/classes`).doc(classId);
        
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const batch = db.batch();
        
        batch.set(studentRef, { joinDate: timestamp });
        batch.set(userClassRef, { className, teacherName, joinDate: timestamp });
        
        await batch.commit();
        return true;
    } catch (err) {
        console.error(`Error adding student ${studentId} to class ${classId}:`, err);
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
        const batch = db.batch();
        
        const studentsRef = db.collection(`classes/${classId}/students`);
        const studentsSnapshot = await studentsRef.get();
        
        studentsSnapshot.forEach(doc => {
            const studentId = doc.id;
            batch.delete(db.collection(`userClasses/${studentId}/classes`).doc(classId));
            batch.delete(doc.ref);
        });
        
        batch.delete(db.collection(COLLECTIONS.CLASSES).doc(classId));
        
        await batch.commit();
        return true;
    } catch (err) {
        console.error(`Error deleting class ${classId}:`, err);
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
        const sessionId = db.collection(COLLECTIONS.SESSIONS).doc().id;
        const sessionDoc = sessionsCollection.add(sessionId);
        
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        const dataToSet = {
            sessionId,
            classId: sessionData.classId,
            teacherId: sessionData.teacherId,
            startTime: timestamp,
            endTime: null,
            status: 'active',
            location: new firebase.firestore.GeoPoint(
                sessionData.location.latitude, 
                sessionData.location.longitude
            ),
            radius: sessionData.radius,
            created_at: timestamp
        };
        
        await sessionDoc.set(dataToSet);
        return {
            ...dataToSet,
            location: {
                latitude: sessionData.location.latitude,
                longitude: sessionData.location.longitude
            }
        };
    } catch (err) {
        console.error("Error creating session:", err);
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
        if (!sessionDoc) return null;
        
        const sessionData = sessionDoc.getData();
        
        // Convert GeoPoint to plain object for easier client-side use
        if (sessionData.location && typeof sessionData.location.latitude === 'function') {
            sessionData.location = {
                latitude: sessionData.location.latitude(),
                longitude: sessionData.location.longitude()
            };
        }
        
        return sessionData;
    } catch (err) {
        console.error(`Error getting session ${sessionId}:`, err);
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
        
        return sessions.map(s => {
            const sessionData = s.getData();
            
            // Convert GeoPoint to plain object
            if (sessionData.location && typeof sessionData.location.latitude === 'function') {
                sessionData.location = {
                    latitude: sessionData.location.latitude(),
                    longitude: sessionData.location.longitude()
                };
            }
            
            return sessionData;
        });
    } catch (err) {
        console.error(`Error getting sessions for teacher ${teacherId}:`, err);
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
        
        // Process in chunks since 'in' operator has a limit of 10
        const chunkSize = 10;
        let allSessions = [];
        
        for (let i = 0; i < classIds.length; i += chunkSize) {
            const chunk = classIds.slice(i, i + chunkSize);
            
            const sessions = await data.collection(COLLECTIONS.SESSIONS).query(collection => 
                collection.where('classId', 'in', chunk).where('status', '==', 'active')
            );
            
            const processedSessions = sessions.map(s => {
                const sessionData = s.getData();
                
                // Convert GeoPoint to plain object
                if (sessionData.location && typeof sessionData.location.latitude === 'function') {
                    sessionData.location = {
                        latitude: sessionData.location.latitude(),
                        longitude: sessionData.location.longitude()
                    };
                }
                
                return sessionData;
            });
            
            allSessions = [...allSessions, ...processedSessions];
        }
        
        return allSessions;
    } catch (err) {
        console.error(`Error getting active sessions for student ${studentId}:`, err);
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
            await sessionDoc.update({
                status: status,
                endTime: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            throw new Error(`Invalid status transition from ${currentStatus} to ${status}`);
        }
        
        const updatedDoc = await data.collection(COLLECTIONS.SESSIONS).get(sessionId);
        const sessionData = updatedDoc.getData();
        
        // Convert GeoPoint to plain object
        if (sessionData.location && typeof sessionData.location.latitude === 'function') {
            sessionData.location = {
                latitude: sessionData.location.latitude(),
                longitude: sessionData.location.longitude()
            };
        }
        
        return sessionData;
    } catch (err) {
        console.error(`Error updating session ${sessionId} status:`, err);
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
        const attendanceRef = db.collection(`sessions/${sessionId}/attendance`);
        const snapshot = await attendanceRef.get();
        
        const attendanceList = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Convert GeoPoint to plain object
            if (data.checkInLocation && typeof data.checkInLocation.latitude === 'function') {
                data.checkInLocation = {
                    latitude: data.checkInLocation.latitude(),
                    longitude: data.checkInLocation.longitude()
                };
            }
            
            attendanceList.push({
                studentId: doc.id,
                ...data
            });
        });
        
        return attendanceList;
    } catch (err) {
        console.error(`Error getting attendance for session ${sessionId}:`, err);
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
        const sessionDocData = await getSessionById(sessionId);
        if (!sessionDocData) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        if (sessionDocData.status !== 'active') {
            throw new Error('Session is not active');
        }
        
        const classId = sessionDocData.classId;
        const studentRef = db.collection(`classes/${classId}/students`).doc(studentId);
        const studentDoc = await studentRef.get();
        
        if (!studentDoc.exists) {
            throw new Error('Student not enrolled in this class');
        }
        
        const attendanceRef = db.collection(`sessions/${sessionId}/attendance`).doc(studentId);
        const attendanceDoc = await attendanceRef.get();
        
        if (attendanceDoc.exists && 
            (attendanceDoc.data().status === 'checked_in' || 
             attendanceDoc.data().status === 'verified')) {
            throw new Error('Already checked in');
        }
        
        const studentLocation = new firebase.firestore.GeoPoint(location.latitude, location.longitude);
        const sessionLocation = sessionDocData.location;
        const allowedRadius = sessionDocData.radius;
        
        const distance = calculateDistance(
            sessionLocation,
            { latitude: location.latitude, longitude: location.longitude }
        );
        
        const isLocationValid = distance <= allowedRadius;
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        const checkInStatus = isLocationValid ? 'verified' : 'failed_location';
        
        await attendanceRef.set({
            classId,
            checkInTime: timestamp,
            checkInLocation: studentLocation,
            checkOutTime: null, // Initialize checkOutTime as null
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
        console.error(`Error checking in student ${studentId} for session ${sessionId}:`, err);
        throw err;
    }
}

/**
 * Checks out a student from a session early
 * @param {string} sessionId - Session ID
 * @param {string} studentId - Student's user ID
 * @returns {Promise<Object>} - Check-out result { status, message }
 */
async function checkOutStudent(sessionId, studentId) {
    try {
        const sessionDocData = await getSessionById(sessionId);
        if (!sessionDocData) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        if (sessionDocData.status !== 'active') {
            throw new Error('Session is already ended');
        }
        
        const attendanceRef = db.collection(`sessions/${sessionId}/attendance`).doc(studentId);
        const attendanceDoc = await attendanceRef.get();
        
        if (!attendanceDoc.exists) {
            throw new Error('Student has not checked in');
        }
        
        // Update attendance record with checkout time
        await attendanceRef.update({
            checkOutTime: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'checked_out_early_before_verification',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return {
            status: 'checked_out_early_before_verification',
            message: 'Successfully checked out early from session'
        };
    } catch (err) {
        console.error(`Error checking out student ${studentId} for session ${sessionId}:`, err);
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
            defaultValue: () => firebase.firestore.FieldValue.serverTimestamp()
        }
    },
    ATTENDANCE: {
        studentId: { type: 'string', required: true, description: 'Student ID who checked in' },
        classId: { type: 'string', required: true, description: 'Class ID for this attendance record' },
        checkInTime: { type: 'timestamp', required: true, description: 'Timestamp when student checked in' },
        checkInLocation: { type: 'geopoint', required: false, description: 'Location where student checked in' },
        checkOutTime: { type: 'timestamp', required: false, description: 'Timestamp when student checked out early (if applicable)' },
        status: { 
            type: 'string', 
            required: true, 
            description: 'Attendance status',
            enum: [
                'pending', 
                'checked_in', 
                'verified', 
                'failed_location', 
                'failed_other', 
                'absent',
                'checked_out_early_before_verification'
            ]
        },
        isGpsVerified: { type: 'boolean', required: false, description: 'Whether location verification succeeded' },
        lastUpdated: { type: 'timestamp', required: true, description: 'Last update timestamp' }
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

export {
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
    checkOutStudent,
    COLLECTIONS,
    SCHEMA,
    paths,
    calculateDistance,
    generateJoinCode
};