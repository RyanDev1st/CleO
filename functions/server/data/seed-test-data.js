/**
 * Test Data Seeder for CleO
 * Seeds the Firestore database with test data for development and testing
 */

const { info, warn, error } = require('firebase-functions/logger');
// Import the specific functions needed from organize_data
const { 
    createOrUpdateUser, 
    createClass, 
    addStudentToClass, 
    createSession,
    COLLECTIONS // Import COLLECTIONS if needed for clearing
} = require('./organize_data.js'); 
const admin = require('firebase-admin');

// Mock data generation logic (can be kept here or moved)
function generateMockUsers(count = 5, includeAdmin = true) {
    const users = [];
    const roles = ['teacher', 'student'];

    // Generate admin user if requested
    if (includeAdmin) {
      users.push({
        uid: 'admin', // Use 'admin' as the specific ID
        email: 'admin@cleouniversity.edu',
        displayName: 'System Administrator',
        role: 'admin', 
      });
    }

    // Generate regular users
    for (let i = 0; i < count; i++) {
      const isTeacher = i < Math.ceil(count / 3); // Make roughly 1/3 teachers
      const role = isTeacher ? roles[0] : roles[1];
      const uid = `${role}_${Date.now().toString(36)}_${i}`; // Ensure unique UIDs
      
      users.push({
        uid,
        email: `${role}_${i}@cleouniversity.edu`,
        displayName: `${role === 'teacher' ? 'Professor' : 'Student'} ${i + 1}`,
        role,
      });
    }
    return users;
}

function generateMockClassesData(teachers, count = 3) {
    const classesData = [];
    const subjects = ['Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History'];
    const levelNumbers = [101, 201, 301, 401];

    for (let i = 0; i < count; i++) {
      const teacherIndex = i % teachers.length;
      const teacherId = teachers[teacherIndex].uid; // Use uid from teacher object
      const subject = subjects[i % subjects.length];
      const level = levelNumbers[Math.floor(Math.random() * levelNumbers.length)];
      
      classesData.push({
        name: `${subject} ${level}`,
        teacherId,
      });
    }
    return classesData;
}

function generateMockSessionsData(classes, sessionsPerClass = 2) {
    const sessionsData = [];
    const statuses = ['scheduled', 'active', 'ended'];
    const locations = [ 
        { lat: 40.7128, lng: -74.0060 }, { lat: 34.0522, lng: -118.2437 }, 
        { lat: 41.8781, lng: -87.6298 }, { lat: 29.7604, lng: -95.3698 }, 
        { lat: 39.9526, lng: -75.1652 }
    ];

    classes.forEach((cls, classIndex) => {
      for (let i = 0; i < sessionsPerClass; i++) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const locationIndex = (classIndex + i) % locations.length;
        const location = locations[locationIndex];
        
        sessionsData.push({
            classId: cls.classId, // Use classId from created class object
            teacherId: cls.teacherId,
            status,
            location: { latitude: location.lat, longitude: location.lng },
            radius: 100 + Math.floor(Math.random() * 400),
        });
      }
    });
    return sessionsData;
}

/**
 * Seeds the database with test data
 * @param {boolean} clearExisting - Whether to clear existing data first
 * @returns {Promise<Object>} - Result of seeding operation
 */
async function seedDatabase(clearExisting = false) {
    try {
        if (!admin.apps.length) {
            admin.initializeApp();
        }
        
        info('Starting database seeding process...');
        
        if (clearExisting) {
            info('Clearing existing data...');
            await clearDatabase();
        }
        
        // 1. Generate User Data
        const usersData = generateMockUsers(10, true); // Generate raw user data
        const teachersData = usersData.filter(u => u.role === 'teacher');
        const studentsData = usersData.filter(u => u.role === 'student');
        const adminData = usersData.find(u => u.role === 'admin');

        // 2. Create Users in Firestore
        const createdUsers = await Promise.all(
            usersData.map(userData => createOrUpdateUser(userData.uid, userData))
        );
        const createdTeachers = createdUsers.filter(u => u.role === 'teacher');
        const createdStudents = createdUsers.filter(u => u.role === 'student');
        info(`Created ${createdUsers.length} users.`);

        // 3. Generate Class Data
        const classesRawData = generateMockClassesData(createdTeachers, 5); // Pass created teacher objects

        // 4. Create Classes in Firestore
        const createdClasses = await Promise.all(
            classesRawData.map(classData => createClass(classData))
        );
        info(`Created ${createdClasses.length} classes.`);

        // 5. Assign Students to Classes
        if (createdClasses.length > 0 && createdStudents.length > 0) {
            await addStudentToClass(createdClasses[0].classId, createdStudents[0].uid, createdClasses[0].name, createdTeachers[0].displayName);
            if (createdStudents.length > 1) await addStudentToClass(createdClasses[0].classId, createdStudents[1].uid, createdClasses[0].name, createdTeachers[0].displayName);
        }
        if (createdClasses.length > 1 && createdStudents.length > 2) {
             await addStudentToClass(createdClasses[1].classId, createdStudents[2].uid, createdClasses[1].name, createdTeachers[0].displayName);
             if (createdStudents.length > 3) await addStudentToClass(createdClasses[1].classId, createdStudents[3].uid, createdClasses[1].name, createdTeachers[0].displayName);
        }
        info(`Assigned students to classes.`);

        // 6. Generate Session Data
        const sessionsRawData = generateMockSessionsData(createdClasses, 2); // Pass created class objects

        // 7. Create Sessions in Firestore
        const createdSessions = await Promise.all(
            sessionsRawData.map(sessionData => createSession(sessionData))
        );
        info(`Created ${createdSessions.length} sessions.`);
        
        info('Database seeded successfully!');
        
        return { 
            success: true, 
            stats: {
                users: createdUsers.length,
                classes: createdClasses.length,
                sessions: createdSessions.length
            }
        };
    } catch (err) {
        error('Error in seedDatabase:', err);
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Clears all data from the database
 * @returns {Promise<void>}
 */
async function clearDatabase() {
    try {
        const db = admin.firestore();
        const collectionsToClear = [
            COLLECTIONS.USERS, 
            COLLECTIONS.CLASSES, 
            COLLECTIONS.SESSIONS, 
            COLLECTIONS.USER_CLASSES
        ];
        
        for (const collectionName of collectionsToClear) {
            info(`Clearing collection: ${collectionName}`);
            const snapshot = await db.collection(collectionName).limit(500).get();
            
            if (snapshot.empty) continue;

            let batch = db.batch();
            let count = 0;
            const deletePromises = [];

            for (const doc of snapshot.docs) {
                if (collectionName === COLLECTIONS.CLASSES) {
                    await deleteSubcollection(db, doc.ref.collection('students'), batch);
                }
                if (collectionName === COLLECTIONS.SESSIONS) {
                    await deleteSubcollection(db, doc.ref.collection('attendance'), batch);
                }

                batch.delete(doc.ref);
                count++;
                if (count >= 499) {
                    deletePromises.push(batch.commit());
                    batch = db.batch();
                    count = 0;
                }
            }
            if (count > 0) {
                deletePromises.push(batch.commit());
            }
            await Promise.all(deletePromises);

            const remaining = await db.collection(collectionName).limit(1).get();
            if (!remaining.empty) {
                await clearDatabase();
            }
        }
        
        info('Database cleared successfully');
    } catch (err) {
        error('Error clearing database:', err);
        throw err;
    }
}

// Helper to delete subcollections recursively
async function deleteSubcollection(db, collectionRef, batch) {
     const snapshot = await collectionRef.limit(500).get();
     if (snapshot.empty) return;
     
     snapshot.docs.forEach(doc => batch.delete(doc.ref));
}

/**
 * Gets the admin user data object
 * @returns {Object} - Admin user data
 */
function getAdminUserData() {
  return {
      uid: 'admin',
      email: 'admin@cleouniversity.edu',
      displayName: 'System Administrator',
      role: 'admin', 
  };
}

module.exports = {
    seedDatabase,
    clearDatabase,
    getAdminUserData
};
