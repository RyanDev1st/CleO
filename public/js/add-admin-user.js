/**
 * Admin User Creator for CleO - Client-Side Version
 * Creates mock test data for testing and outputs the test data
 */

// Import the async functions from firebase-init.js
import { 
  getInitializedFirebase, 
  getFirebase, 
  onConnectionChange, 
  initializeFirestoreData 
} from './firebase-init.js';

// Global variable to expose generated data to the window object
window.generatedData = {
  admin: null,
  teachers: [],
  students: [],
  classes: [],
  sessions: [],
  attendance: []
};

// Reference to Firebase services
let firebase, db, auth;
let isConnected = false;
let permissionDenied = false;
let firebaseInitialized = false;

// Test data constants
const adminUserData = {
  uid: 'admin',
  email: 'admin@cleouniversity.edu',
  displayName: 'System Administrator',
  role: 'admin'
};

const adminCredentials = {
  email: adminUserData.email,
  password: 'admin123'
};

const teachersData = [
  {
    email: 'teacher1@cleouniversity.edu',
    displayName: 'Professor Smith',
    role: 'teacher',
    password: 'teacher123'
  },
  {
    email: 'teacher2@cleouniversity.edu',
    displayName: 'Dr. Johnson',
    role: 'teacher',
    password: 'teacher123'
  }
];

const studentsData = [
  {
    email: 'student1@cleouniversity.edu',
    displayName: 'John Doe',
    role: 'student',
    password: 'student123'
  },
  {
    email: 'student2@cleouniversity.edu',
    displayName: 'Jane Smith',
    role: 'student',
    password: 'student123'
  }
];

// Track created entities
const createdEntities = {
  users: {},
  classes: {},
  sessions: {},
  attendance: {}
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM Content loaded, initializing Firebase...");
  
  // Get reference to UI elements
  const createAdminBtn = document.getElementById('create-admin-button');
  const createAllBtn = document.getElementById('create-all-button');
  const statusElement = document.getElementById('admin-status');
  const dataOutputElement = document.getElementById('data-output');
  const copyDataBtn = document.getElementById('copy-data-btn');
  
  // Initially disable buttons until Firebase is ready
  if (createAdminBtn) createAdminBtn.disabled = true;
  if (createAllBtn) createAllBtn.disabled = true;
  
  // Set up copy data button
  if (copyDataBtn) {
    copyDataBtn.addEventListener('click', () => {
      if (dataOutputElement && dataOutputElement.textContent && 
          dataOutputElement.textContent !== 'No data generated yet. Click "Create Complete Test Dataset" to generate data.') {
        navigator.clipboard.writeText(dataOutputElement.textContent)
          .then(() => {
            copyDataBtn.textContent = 'Copied!';
            setTimeout(() => { copyDataBtn.textContent = 'Copy to Clipboard'; }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy data:', err);
            alert('Failed to copy. Try selecting the text manually.');
          });
      } else {
        alert('No data to copy yet. Generate data first.');
      }
    });
  }
  
  // Display initializing status
  displayStatus('Initializing Firebase...', 'info');
  
  // Initialize Firebase
  initializeApp();
  
  // Set up connection monitoring
  onConnectionChange((online, errorCode) => {
    console.log(`Connection status changed: ${online ? 'online' : 'offline'}, Error: ${errorCode || 'none'}`);
    isConnected = online;
    
    if (errorCode === 'permission-denied') {
      permissionDenied = true;
      displayPermissionDeniedMessage();
    } else {
      updateUIBasedOnConnection(online, errorCode);
    }
  });
  
  // Set up button event handlers once Firebase is initialized
  if (createAdminBtn) {
    createAdminBtn.addEventListener('click', async () => {
      try {
        displayStatus('Creating admin user...', 'info');
        if (!isConnected || !firebaseInitialized) {
          await initializeApp(true); // Force re-initialization
          if (!isConnected) {
            displayStatus('Cannot create admin user while offline', 'danger');
            return;
          }
        }
        
        const result = await addAdminUser();
        updateDataDisplay();
      } catch (error) {
        console.error('Error creating admin user:', error);
        displayError(`Failed to create admin user: ${error.message}`);
      }
    });
  }
  
  if (createAllBtn) {
    createAllBtn.addEventListener('click', async () => {
      try {
        displayStatus('Creating complete test dataset...', 'info');
        if (!isConnected || !firebaseInitialized) {
          await initializeApp(true); // Force re-initialization
          if (!isConnected) {
            displayStatus('Cannot create test data while offline', 'danger');
            return;
          }
        }
        
        await createAllTestData();
        updateDataDisplay();
      } catch (error) {
        console.error('Error creating test data:', error);
        displayError(`Failed to create test data: ${error.message}`);
      }
    });
  }
});

// Initialize the Firebase app using the centralized firebase-init.js
async function initializeApp(forceReinitialize = false) {
  try {
    if (firebaseInitialized && !forceReinitialize) {
      console.log('Firebase already initialized');
      return;
    }
    
    console.log('Initializing Firebase in add-admin-user.js...');
    const result = await getInitializedFirebase();
    
    if (!result || !result.firebase || !result.db) {
      console.error('Failed to initialize Firebase');
      displayError('Failed to initialize Firebase. Please check that emulators are running.');
      return;
    }
    
    firebase = result.firebase;
    db = result.db;
    auth = result.auth;
    isConnected = result.isOnline;
    permissionDenied = result.permissionDenied;
    firebaseInitialized = true;
    
    console.log('Firebase services obtained:', { 
      firebase: !!firebase, 
      db: !!db, 
      auth: !!auth, 
      isConnected, 
      permissionDenied 
    });
    
    updateUIBasedOnConnection(isConnected);
    displayStatus('Firebase initialized successfully!', 'success');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error);
    displayError(`Firebase initialization error: ${error.message}`);
  }
}

// Update UI based on connection status
function updateUIBasedOnConnection(isOnline, errorMessage = null) {
  const createAdminBtn = document.getElementById('create-admin-button');
  const createAllBtn = document.getElementById('create-all-button');
  
  if (createAdminBtn) createAdminBtn.disabled = !isOnline;
  if (createAllBtn) createAllBtn.disabled = !isOnline;
  
  if (isOnline) {
    displayStatus('Connected to Firebase. Ready to create test data.', 'success');
  } else {
    displayStatus(`Not connected to Firebase. ${errorMessage || 'Please check that emulators are running.'}`, 'danger');
  }
}

// Create admin user
async function addAdminUser() {
  try {
    if (!db) {
      throw new Error('Firestore is not available');
    }
    
    console.log('Checking if admin user exists...');
    const adminRef = db.collection('users').doc('admin');
    const adminDoc = await adminRef.get();
    
    let adminResult;
    
    if (adminDoc.exists) {
      console.log('Admin user already exists:', adminDoc.data());
      displayStatus('Admin user already exists. Skipping creation.', 'warning');
      adminResult = adminDoc.data();
      window.generatedData.admin = adminResult;
    } else {
      // Create admin user
      console.log('Creating admin user...');
      await adminRef.set({
        ...adminUserData,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('Admin user created successfully!');
      adminResult = {...adminUserData};
      window.generatedData.admin = adminResult;
    }
    
    // Return a consistent result object - this fixes the "undefined" issue
    const result = {
      uid: adminResult.uid || adminUserData.uid,
      email: adminResult.email || adminUserData.email,
      password: adminCredentials.password,
      displayName: adminResult.displayName || adminUserData.displayName,
      role: adminResult.role || adminUserData.role
    };
    
    displayStatus(`
      <h4>Admin User Created!</h4>
      <p><strong>Email:</strong> ${result.email}</p>
      <p><strong>Password:</strong> ${result.password}</p>
      <p><strong>UID:</strong> ${result.uid}</p>
    `, 'success');
    
    return result;
  } catch (error) {
    console.error('Failed to create admin user:', error);
    displayError(`Failed to create admin user: ${error.message}`);
    throw error; // Re-throw to be caught by the caller
  }
}

// Create all test data
async function createAllTestData(options = {}) {
  try {
    if (!db || !auth) {
      throw new Error('Firebase services are not available');
    }
    
    // Get user-specified options or use defaults
    const numTeachers = options.numTeachers || 2;
    const numStudents = options.numStudents || 2;
    const numClasses = options.numClasses || 2;
    const onProgress = options.onProgress || ((msg, pct) => { console.log(`${msg} - ${pct}%`); });
    
    // Reset generated data
    window.generatedData = {
      admin: null,
      teachers: [],
      students: [],
      classes: [],
      sessions: [],
      attendance: []
    };
    
    // Reset tracking variables
    Object.keys(createdEntities).forEach(key => {
      createdEntities[key] = {};
    });
    
    // Step 1: Create admin user
    console.log('Step 1: Creating admin user');
    onProgress('Creating admin user...', 10);
    const adminResult = await addAdminUser();
    window.generatedData.admin = adminResult;
    
    // Step 2: Create teachers - use specified number
    console.log(`Step 2: Creating ${numTeachers} teachers`);
    onProgress(`Creating ${numTeachers} teachers...`, 20);
    
    // Extend teachersData array if needed based on numTeachers
    const extendedTeacherData = [...teachersData];
    if (numTeachers > teachersData.length) {
      // Generate additional teacher data
      for (let i = teachersData.length; i < numTeachers; i++) {
        extendedTeacherData.push({
          email: `teacher${i+1}@cleouniversity.edu`,
          displayName: `Professor ${i+1}`,
          role: 'teacher',
          password: 'teacher123'
        });
      }
    }
    
    const teachers = [];
    // Only use the number of teachers requested
    for (let i = 0; i < numTeachers; i++) {
      const teacherData = extendedTeacherData[i];
      try {
        const teacherId = `teacher_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const teacherRef = db.collection('users').doc(teacherId);
        
        // First create the authentication user
        try {
          await auth.createUserWithEmailAndPassword(teacherData.email, teacherData.password);
          console.log(`Created auth user for teacher: ${teacherData.email}`);
        } catch (authError) {
          // Check if user already exists error
          if (authError.code === 'auth/email-already-in-use') {
            console.log(`Auth user for ${teacherData.email} already exists, proceeding with Firestore update`);
          } else {
            throw authError;
          }
        }
        
        // Then create the Firestore user record
        await teacherRef.set({
          ...teacherData,
          uid: teacherId,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const teacher = { uid: teacherId, ...teacherData };
        teachers.push(teacher);
        window.generatedData.teachers.push(teacher);
        createdEntities.users[teacherId] = teacher;
        
        console.log(`Created teacher: ${teacherData.displayName}`);
        
        // Add small delay between operations
        await delay(300);
      } catch (error) {
        console.error('Error creating teacher:', error);
      }
    }
    
    // Step 3: Create students - use specified number
    console.log(`Step 3: Creating ${numStudents} students`);
    onProgress(`Creating ${numStudents} students...`, 40);
    
    // Extend studentsData array if needed based on numStudents
    const extendedStudentData = [...studentsData];
    if (numStudents > studentsData.length) {
      // Generate additional student data
      for (let i = studentsData.length; i < numStudents; i++) {
        extendedStudentData.push({
          email: `student${i+1}@cleouniversity.edu`,
          displayName: `Student ${i+1}`,
          role: 'student',
          password: 'student123'
        });
      }
    }
    
    const students = [];
    // Only use the number of students requested
    for (let i = 0; i < numStudents; i++) {
      const studentData = extendedStudentData[i];
      try {
        const studentId = `student_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const studentRef = db.collection('users').doc(studentId);
        
        // First create the authentication user
        try {
          await auth.createUserWithEmailAndPassword(studentData.email, studentData.password);
          console.log(`Created auth user for student: ${studentData.email}`);
        } catch (authError) {
          // Check if user already exists error
          if (authError.code === 'auth/email-already-in-use') {
            console.log(`Auth user for ${studentData.email} already exists, proceeding with Firestore update`);
          } else {
            throw authError;
          }
        }
        
        // Then create the Firestore user record
        await studentRef.set({
          ...studentData,
          uid: studentId,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const student = { uid: studentId, ...studentData };
        students.push(student);
        window.generatedData.students.push(student);
        createdEntities.users[studentId] = student;
        
        console.log(`Created student: ${studentData.displayName}`);
        
        // Add small delay between operations
        await delay(300);
      } catch (error) {
        console.error('Error creating student:', error);
      }
    }
    
    // Step 4: Create classes - use specified number, but no more than teachers
    const maxPossibleClasses = Math.min(numClasses, teachers.length);
    console.log(`Step 4: Creating ${maxPossibleClasses} classes`);
    onProgress(`Creating ${maxPossibleClasses} classes...`, 60);
    
    if (teachers.length === 0) {
      displayError('No teachers were created successfully. Cannot create classes.');
      return false;
    }
    
    const createdClasses = [];
    for (let i = 0; i < maxPossibleClasses; i++) {
      try {
        // Assign classes round-robin to teachers
        const teacher = teachers[i % teachers.length];
        const classIndex = Math.floor(i / teachers.length);
        
        const className = `Class ${classIndex + 1} by ${teacher.displayName}`;
        const joinCode = generateJoinCode();
        const classId = `class_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        
        const classData = {
          id: classId,
          name: className,
          teacher_id: teacher.uid,
          teacherId: teacher.uid, // Add both formats for consistency
          joinCode: joinCode,
          student_ids: students.map(student => student.uid),
          studentIds: students.map(student => student.uid), // Add both formats for consistency
          created_at: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp() // Add both formats for consistency
        };
        
        await db.collection('classes').doc(classId).set(classData);
        
        const classObj = { id: classId, ...classData };
        createdClasses.push(classObj);
        window.generatedData.classes.push(classObj);
        createdEntities.classes[classId] = classObj;
        
        console.log(`Created class: ${className}`);
        
        // Add small delay between operations
        await delay(300);
      } catch (classError) {
        console.error(`Error creating class:`, classError);
      }
    }
    
    // Step 5: Create sessions for each class (and attendance)
    console.log(`Step 5: Creating sessions for ${createdClasses.length} classes`);
    onProgress(`Creating sessions and attendance records...`, 80);
    
    // Create sessions for each class
    for (const classObj of createdClasses) {
      try {
        const teacher = teachers.find(t => t.uid === classObj.teacher_id || t.uid === classObj.teacherId);
        if (!teacher) continue;
        
        await createSessionsForClass(classObj.id, classObj.name, teacher, students);
      } catch (error) {
        console.error(`Error creating sessions for class ${classObj.name}:`, error);
      }
    }
    
    // Final progress update
    onProgress('Test data creation complete!', 100);
    
    // Show summary
    const summary = `
      <h4>Test Data Created Successfully:</h4>
      <ul>
        <li>${window.generatedData.admin ? '1' : '0'} Admin User</li>
        <li>${window.generatedData.teachers.length} Teachers</li>
        <li>${window.generatedData.students.length} Students</li>
        <li>${window.generatedData.classes.length} Classes</li>
        <li>${window.generatedData.sessions.length} Sessions</li>
        <li>${window.generatedData.attendance.length} Attendance Records</li>
      </ul>
      
      <p><strong>Credentials for testing:</strong></p>
      <ul>
        <li>Admin: ${adminCredentials.email} / ${adminCredentials.password}</li>
        <li>Teacher: ${window.generatedData.teachers.length > 0 ? window.generatedData.teachers[0].email : 'none'} / teacher123</li>
        <li>Student: ${window.generatedData.students.length > 0 ? window.generatedData.students[0].email : 'none'} / student123</li>
      </ul>
    `;
    
    displayStatus(summary, 'success');
    
    // Return data with counts
    return {
      ...window.generatedData,
      numTeachers: window.generatedData.teachers.length,
      numStudents: window.generatedData.students.length,
      numClasses: window.generatedData.classes.length,
      numSessions: window.generatedData.sessions.length,
      success: true
    };
  } catch (error) {
    console.error('Failed to create all test data:', error);
    displayError(`Failed to create test data: ${error.message}`);
    
    return {
      ...window.generatedData,
      numTeachers: window.generatedData.teachers?.length || 0,
      numStudents: window.generatedData.students?.length || 0,
      numClasses: window.generatedData.classes?.length || 0,
      numSessions: window.generatedData.sessions?.length || 0,
      success: false,
      error: error.message
    };
  }
}

// Helper function to create sessions and attendance records for a class
async function createSessionsForClass(classId, className, teacher, students) {
  // Create 2 sessions for the class
  for (let j = 0; j < 2; j++) {
    try {
      const sessionName = `Session ${j + 1} of ${className}`;
      const sessionId = `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + j);
      
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);
      
      // Create initial session with proper structure
      const sessionData = {
        id: sessionId,
        class_id: classId, // For compatibility, maintain both formats for class references
        classId: classId,
        name: sessionName,
        teacher_id: teacher.uid,
        teacherId: teacher.uid,
        start_time: firebase.firestore.Timestamp.fromDate(startTime),
        startTime: firebase.firestore.Timestamp.fromDate(startTime),
        end_time: firebase.firestore.Timestamp.fromDate(endTime),
        endTime: firebase.firestore.Timestamp.fromDate(endTime),
        location: new firebase.firestore.GeoPoint(33.7490, -84.3880),
        radius: 50,
        status: 'active',
        attendance_ids: [], // Start with an empty array
        attendanceIds: [], // Add alternate format for consistency
        created_at: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      // Create the session document
      await db.collection('sessions').doc(sessionId).set(sessionData);
      
      // Create a session document in the class's sessions subcollection too
      await db.collection('classes').doc(classId).collection('sessions').doc(sessionId).set(sessionData);
      
      const sessionObj = { 
        ...sessionData,
        location: { lat: 33.7490, lng: -84.3880 }, // Convert GeoPoint for display
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      };
      
      window.generatedData.sessions.push(sessionObj);
      createdEntities.sessions[sessionId] = sessionObj;
      
      console.log(`Created session: ${sessionName}`);
      
      // Add small delay
      await delay(300);
      
      // Now create attendance records and update the session
      const attendanceIds = [];
      
      for (const student of students) {
        try {
          const status = Math.random() > 0.2 ? 'present' : 'absent';
          const attendanceId = `attendance_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          attendanceIds.push(attendanceId); // Add ID to our local array
          
          const attendanceData = {
            id: attendanceId,
            session_id: sessionId,
            sessionId: sessionId,
            student_id: student.uid,
            studentId: student.uid,
            status: status,
            verification_method: 'gps',
            verificationMethod: 'gps',
            location: new firebase.firestore.GeoPoint(33.7490, -84.3880),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            created_at: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          
          // Store attendance in multiple places for redundancy
          // 1. In the main attendances collection
          await db.collection('attendances').doc(attendanceId).set(attendanceData);
          
          // 2. In the session's attendance subcollection
          await db.collection('sessions').doc(sessionId).collection('attendance').doc(student.uid).set(attendanceData);
          
          // 3. In the class's attendance structure
          await db.collection('classes').doc(classId).collection('sessions').doc(sessionId)
                .collection('attendance').doc(student.uid).set(attendanceData);
          
          const attendanceObj = {
            ...attendanceData,
            location: { lat: 33.7490, lng: -84.3880 }
          };
          
          window.generatedData.attendance.push(attendanceObj);
          createdEntities.attendance[attendanceId] = attendanceObj;
          
          console.log(`Marked ${status} for ${student.displayName} in ${sessionName}`);
          
          // Smaller delay for attendance records
          await delay(100);
        } catch (attendanceError) {
          console.warn(`Error marking attendance:`, attendanceError);
        }
      }
      
      // After all attendance records are created, update the session document with the IDs
      try {
        if (attendanceIds.length > 0) {
          // Update both attendance_ids and attendanceIds for compatibility
          await db.collection('sessions').doc(sessionId).update({
            attendance_ids: attendanceIds,
            attendanceIds: attendanceIds
          });
          
          // Also update in class's session collection
          await db.collection('classes').doc(classId).collection('sessions').doc(sessionId).update({
            attendance_ids: attendanceIds,
            attendanceIds: attendanceIds
          });
          
          console.log(`Updated session ${sessionId} with ${attendanceIds.length} attendance records`);
        }
      } catch (updateError) {
        console.error('Error updating session with attendance IDs:', updateError);
      }
      
    } catch (sessionError) {
      console.error(`Error creating session:`, sessionError);
    }
  }
}

// Generate a random join code for classes
function generateJoinCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Utility functions
function displayStatus(message, type = 'info') {
  console.log(`Status (${type}):`, message);
  const statusElement = document.getElementById('admin-status');
  if (statusElement) {
    statusElement.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
  }
}

function displayError(message) {
  console.error('Error:', message);
  const statusElement = document.getElementById('admin-status');
  if (statusElement) {
    statusElement.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <strong>Error:</strong> ${message}
      </div>
    `;
  }
}

function displayPermissionDeniedMessage() {
  const statusElement = document.getElementById('admin-status');
  if (statusElement) {
    statusElement.innerHTML = `
      <div class="alert alert-danger" role="alert">
        <strong>Firebase Permission Error:</strong> You don't have permission to access this Firebase project.
        <div class="mt-2">
          <h5>Options to fix this:</h5>
          <ol>
            <li>Make sure the Firebase emulators are running</li>
            <li>Check that you're using the correct emulator ports</li>
          </ol>
          <div class="mt-3">
            <button id="reload-btn" class="btn btn-warning">Reload Page</button>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

// Update the data output display
function updateDataDisplay() {
  const dataOutput = document.getElementById('data-output');
  if (dataOutput) {
    dataOutput.textContent = JSON.stringify(window.generatedData, null, 2);
  }
}

// Helper function for adding delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export public functions
export { addAdminUser, createAllTestData };