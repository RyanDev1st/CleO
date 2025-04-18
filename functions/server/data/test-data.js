/**
 * Test Data Generator for CleO Firebase Functions
 * Creates mock data based on the schema defined in data.js
 */

const admin = require('firebase-admin');
const { data } = require('./data.js');
const { info, warn, error } = require('firebase-functions/logger');

/**
 * Provides test data generators and mock data for testing
 */
class TestDataManager {
  constructor() {
    // Store a reference to the initialized admin SDK
    if (!admin.apps.length) {
      throw new Error('Firebase admin must be initialized before using TestDataManager');
    }
    this.admin = admin;
    this.db = admin.firestore();
  }

  /**
   * Generate a unique identifier
   * @param {string} prefix - Optional prefix for the ID
   * @returns {string} - Generated ID
   */
  generateId(prefix = '') {
    return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate mock users based on the schema
   * @param {number} count - Number of users to generate (default: 5)
   * @param {boolean} includeAdmin - Whether to include an admin user (default: true)
   * @returns {Array<Object>} - Generated users
   */
  generateMockUsers(count = 5, includeAdmin = true) {
    const users = [];
    const roles = ['teacher', 'student'];

    // Generate admin user if requested
    if (includeAdmin) {
      users.push({
        uid: 'admin_user',
        email: 'admin@cleouniversity.edu',
        displayName: 'Admin User',
        role: 'admin', // Special admin role
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Generate regular users
    for (let i = 0; i < count; i++) {
      const isTeacher = i < Math.ceil(count / 3); // Make roughly 1/3 teachers
      const role = isTeacher ? roles[0] : roles[1];
      const uid = this.generateId(role === 'teacher' ? 'teacher_' : 'student_');
      
      users.push({
        uid,
        email: `${role}_${i}@cleouniversity.edu`,
        displayName: `${role === 'teacher' ? 'Professor' : 'Student'} ${i + 1}`,
        role,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return users;
  }

  /**
   * Generate mock classes based on the schema
   * @param {Array<Object>} teachers - Array of teacher users
   * @param {number} count - Number of classes to generate (default: 3)
   * @returns {Array<Object>} - Generated classes
   */
  generateMockClasses(teachers, count = 3) {
    const classes = [];
    const subjects = ['Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'History'];
    const levelNumbers = [101, 201, 301, 401];

    for (let i = 0; i < count; i++) {
      const teacherIndex = i % teachers.length;
      const teacherId = teachers[teacherIndex].uid;
      const subject = subjects[i % subjects.length];
      const level = levelNumbers[Math.floor(Math.random() * levelNumbers.length)];
      const classId = this.generateId('class_');
      const joinCode = this.generateJoinCode();

      classes.push({
        classId,
        name: `${subject} ${level}`,
        teacherId,
        joinCode,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return classes;
  }

  /**
   * Generate a random join code for classes
   * @returns {string} - A 6-character join code
   */
  generateJoinCode() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar-looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
  }

  /**
   * Assign students to classes
   * @param {Array<Object>} students - Array of student users
   * @param {Array<Object>} classes - Array of classes
   * @returns {Object} - Mapping of class IDs to arrays of student UIDs
   */
  assignStudentsToClasses(students, classes) {
    const classStudents = {};
    const userClasses = {};

    // Initialize class student arrays
    classes.forEach(cls => {
      classStudents[cls.classId] = [];
    });

    // Initialize user classes objects
    students.forEach(student => {
      userClasses[student.uid] = {};
    });

    // Assign each student to 1-3 random classes
    students.forEach(student => {
      const numClasses = Math.floor(Math.random() * 3) + 1; // 1 to 3 classes
      const shuffledClasses = [...classes].sort(() => Math.random() - 0.5);
      
      for (let i = 0; i < Math.min(numClasses, shuffledClasses.length); i++) {
        const cls = shuffledClasses[i];
        classStudents[cls.classId].push(student.uid);
        
        // Add to userClasses mapping
        const teacherUser = this.getTeacherForClass(cls.teacherId, this.mockData.users);
        
        userClasses[student.uid][cls.classId] = {
          className: cls.name,
          teacherName: teacherUser ? teacherUser.displayName : 'Unknown Teacher',
          joinDate: admin.firestore.FieldValue.serverTimestamp()
        };
      }
    });

    return {
      classStudents,
      userClasses
    };
  }

  /**
   * Find teacher object for a given teacher ID
   * @param {string} teacherId 
   * @param {Array<Object>} users 
   * @returns {Object|null}
   */
  getTeacherForClass(teacherId, users) {
    return users.find(user => user.uid === teacherId) || null;
  }

  /**
   * Generate mock sessions for classes
   * @param {Array<Object>} classes - Array of classes
   * @param {number} sessionsPerClass - Number of sessions per class (default: 2)
   * @returns {Array<Object>} - Generated sessions
   */
  generateMockSessions(classes, sessionsPerClass = 2) {
    const sessions = [];
    const statuses = ['scheduled', 'active', 'ended'];
    
    // Sample locations (latitude, longitude)
    const locations = [
      { lat: 40.7128, lng: -74.0060 }, // New York
      { lat: 34.0522, lng: -118.2437 }, // Los Angeles
      { lat: 41.8781, lng: -87.6298 }, // Chicago
      { lat: 29.7604, lng: -95.3698 }, // Houston
      { lat: 39.9526, lng: -75.1652 }  // Philadelphia
    ];

    classes.forEach(cls => {
      for (let i = 0; i < sessionsPerClass; i++) {
        const sessionId = this.generateId('session_');
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const locationIndex = Math.floor(Math.random() * locations.length);
        const location = locations[locationIndex];
        
        // Create timestamps for consistent chronology
        const now = new Date();
        let startTime, endTime;
        
        if (status === 'scheduled') {
          // Future session
          startTime = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // Tomorrow
          endTime = null;
        } else if (status === 'active') {
          // Current session
          startTime = new Date(now.getTime() - (30 * 60 * 1000)); // 30 minutes ago
          endTime = null;
        } else {
          // Past session
          startTime = new Date(now.getTime() - (48 * 60 * 60 * 1000)); // 2 days ago
          endTime = new Date(now.getTime() - (47 * 60 * 60 * 1000)); // 1 hour after start
        }

        sessions.push({
          sessionId,
          classId: cls.classId,
          teacherId: cls.teacherId,
          startTime: admin.firestore.Timestamp.fromDate(startTime),
          endTime: endTime ? admin.firestore.Timestamp.fromDate(endTime) : null,
          status,
          location: new admin.firestore.GeoPoint(location.lat, location.lng),
          radius: 100 + Math.floor(Math.random() * 400), // 100-500m radius
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    });

    return sessions;
  }

  /**
   * Generate mock attendance records for sessions
   * @param {Array<Object>} sessions - Array of sessions
   * @param {Object} classStudents - Mapping of class IDs to student UIDs
   * @returns {Object} - Mapping of session IDs to attendance records
   */
  generateMockAttendance(sessions, classStudents) {
    const sessionAttendance = {};
    const attendanceStatuses = ['pending', 'checked_in', 'verified', 'failed_location', 'failed_other', 'absent'];
    
    sessions.forEach(session => {
      const students = classStudents[session.classId] || [];
      sessionAttendance[session.sessionId] = [];
      
      // Only generate attendance for active or ended sessions
      if (session.status === 'scheduled') {
        return;
      }
      
      students.forEach(studentId => {
        // Determine attendance status based on session status
        let status;
        if (session.status === 'active') {
          // For active sessions, some students have checked in, some haven't
          status = attendanceStatuses[Math.floor(Math.random() * 3)]; // pending, checked_in, or verified
        } else {
          // For ended sessions, all students have a final status
          status = attendanceStatuses[Math.floor(Math.random() * attendanceStatuses.length)];
        }
        
        // Only create check-in data if the student has checked in
        let checkInTime = null;
        let checkInLocation = null;
        let isGpsVerified = false;
        
        if (status !== 'pending' && status !== 'absent') {
          checkInTime = admin.firestore.Timestamp.fromDate(
            new Date(session.startTime.toDate().getTime() + (5 * 60 * 1000)) // 5 minutes after start
          );
          
          // Create location near the session location, but with small random offset
          const latOffset = (Math.random() - 0.5) * 0.001; // Small random offset
          const lngOffset = (Math.random() - 0.5) * 0.001;
          
          checkInLocation = new admin.firestore.GeoPoint(
            session.location.latitude + latOffset,
            session.location.longitude + lngOffset
          );
          
          // GPS is verified if status is 'verified'
          isGpsVerified = (status === 'verified');
        }
        
        sessionAttendance[session.sessionId].push({
          studentId,
          classId: session.classId,
          checkInTime,
          checkInLocation,
          status,
          isGpsVerified,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
      });
    });
    
    return sessionAttendance;
  }

  /**
   * Generate all mock data for testing
   * @returns {Object} - Complete mock data set
   */
  generateAllMockData() {
    // Generate users (including admin)
    const allUsers = this.generateMockUsers(10, true);
    
    // Separate teachers and students
    const teachers = allUsers.filter(user => user.role === 'teacher');
    const students = allUsers.filter(user => user.role === 'student');
    const admin = allUsers.find(user => user.role === 'admin');
    
    // Generate classes with teachers
    const classes = this.generateMockClasses(teachers, 5);
    
    // Assign students to classes
    const { classStudents, userClasses } = this.assignStudentsToClasses(students, classes);
    
    // Generate sessions for each class
    const sessions = this.generateMockSessions(classes, 3);
    
    // Generate attendance records
    const sessionAttendance = this.generateMockAttendance(sessions, classStudents);
    
    // Store the generated data
    this.mockData = {
      users: allUsers,
      admin,
      teachers,
      students,
      classes,
      classStudents,
      userClasses,
      sessions,
      sessionAttendance
    };
    
    return this.mockData;
  }

  /**
   * Seed the Firestore database with mock data
   * @param {boolean} clearExisting - Whether to clear existing data first (default: false)
   * @returns {Promise<Object>} - Result of the seeding operation
   */
  async seedDatabase(clearExisting = false) {
    try {
      // Generate mock data if not already done
      if (!this.mockData) {
        this.generateAllMockData();
      }
      
      // Clear existing data if requested
      if (clearExisting) {
        info('Clearing existing data from Firestore...');
        await this.clearDatabase();
      }
      
      info('Seeding Firestore database with mock data...');
      
      // Use batched writes for efficiency
      const batches = [];
      let currentBatch = this.db.batch();
      let operationCount = 0;
      const MAX_OPERATIONS = 500; // Firestore limit is 500 operations per batch
      
      // Helper to manage batches
      const addToBatch = (ref, data) => {
        currentBatch.set(ref, data);
        operationCount++;
        
        if (operationCount >= MAX_OPERATIONS) {
          batches.push(currentBatch);
          currentBatch = this.db.batch();
          operationCount = 0;
        }
      };
      
      // Add users to batch
      this.mockData.users.forEach(user => {
        const userRef = this.db.collection('users').doc(user.uid);
        addToBatch(userRef, user);
      });
      
      // Add classes to batch
      this.mockData.classes.forEach(cls => {
        const classRef = this.db.collection('classes').doc(cls.classId);
        addToBatch(classRef, cls);
        
        // Add class students to batch
        const students = this.mockData.classStudents[cls.classId] || [];
        students.forEach(studentId => {
          const studentRef = this.db.collection(`classes/${cls.classId}/students`).doc(studentId);
          addToBatch(studentRef, {
            joinDate: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Add to userClasses for quick lookup
          const userClassData = this.mockData.userClasses[studentId][cls.classId];
          if (userClassData) {
            const userClassRef = this.db.collection(`userClasses/${studentId}/classes`).doc(cls.classId);
            addToBatch(userClassRef, userClassData);
          }
        });
      });
      
      // Add sessions to batch
      this.mockData.sessions.forEach(session => {
        const sessionRef = this.db.collection('sessions').doc(session.sessionId);
        addToBatch(sessionRef, session);
        
        // Add attendance records to batch
        const attendanceRecords = this.mockData.sessionAttendance[session.sessionId] || [];
        attendanceRecords.forEach(record => {
          const studentId = record.studentId;
          const attendanceRef = this.db.collection(`sessions/${session.sessionId}/attendance`).doc(studentId);
          addToBatch(attendanceRef, record);
        });
      });
      
      // Add the final batch if it has operations
      if (operationCount > 0) {
        batches.push(currentBatch);
      }
      
      // Commit all batches
      info(`Committing ${batches.length} batches with mock data...`);
      await Promise.all(batches.map(batch => batch.commit()));
      
      info('Database seeded successfully!');
      return {
        success: true,
        stats: {
          users: this.mockData.users.length,
          classes: this.mockData.classes.length,
          sessions: this.mockData.sessions.length,
          batches: batches.length
        }
      };
    } catch (err) {
      error('Error seeding database:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Clear all data from the Firestore database
   * @returns {Promise<void>}
   */
  async clearDatabase() {
    try {
      info('Clearing Firestore database...');
      
      // Define collections to clear
      const collections = ['users', 'classes', 'sessions', 'userClasses'];
      
      // Clear each collection
      for (const collectionName of collections) {
        const snapshot = await this.db.collection(collectionName).get();
        
        if (snapshot.empty) {
          continue;
        }
        
        // Use batched deletes for efficiency
        const batches = [];
        let currentBatch = this.db.batch();
        let operationCount = 0;
        const MAX_OPERATIONS = 500;
        
        for (const doc of snapshot.docs) {
          currentBatch.delete(doc.ref);
          operationCount++;
          
          if (operationCount >= MAX_OPERATIONS) {
            batches.push(currentBatch);
            currentBatch = this.db.batch();
            operationCount = 0;
          }
          
          // If this is a parent collection with subcollections, clear those too
          if (collectionName === 'classes' || collectionName === 'sessions' || collectionName === 'userClasses') {
            const subcollections = await doc.ref.listCollections();
            for (const subcollection of subcollections) {
              const subSnapshot = await subcollection.get();
              for (const subDoc of subSnapshot.docs) {
                currentBatch.delete(subDoc.ref);
                operationCount++;
                
                if (operationCount >= MAX_OPERATIONS) {
                  batches.push(currentBatch);
                  currentBatch = this.db.batch();
                  operationCount = 0;
                }
              }
            }
          }
        }
        
        // Add the final batch if it has operations
        if (operationCount > 0) {
          batches.push(currentBatch);
        }
        
        // Commit all batches
        await Promise.all(batches.map(batch => batch.commit()));
      }
      
      info('Database cleared successfully!');
    } catch (err) {
      error('Error clearing database:', err);
      throw err;
    }
  }

  /**
   * Create and return a Document object for a specific entity
   * @param {string} collection - Collection name
   * @param {string} id - Document ID
   * @returns {Document} - Document object from data.js
   */
  getDocumentHandler(collection, id) {
    return data.collection(collection).add(id);
  }

  /**
   * Get admin user data
   * @returns {Object} - Admin user data
   */
  getAdminUser() {
    return this.mockData && this.mockData.admin 
      ? this.mockData.admin 
      : {
          uid: 'admin_user',
          email: 'admin@cleouniversity.edu',
          displayName: 'Admin User',
          role: 'admin',
          created_at: admin.firestore.Timestamp.now()
        };
  }
}

module.exports = {
  TestDataManager,

  // Export a singleton instance
  testData: new TestDataManager(),
  
  // Export mock data schemas based on data.js comments
  SCHEMAS: {
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
  }
};
