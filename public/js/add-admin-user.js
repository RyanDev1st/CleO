/**
 * Admin User Creator for CleO - Client-Side Version
 * Creates mock test data for testing and automatically outputs test data
 */

// Import Firebase from the initialized module
import { getFirebase } from './firebase-init.js';
// Remove imports that don't exist in data.js
// import { adminCredentials, teachersData, studentsData } from './data.js';

// Get firebase instances
let firebase, db, auth;

// Wait for DOM content to be loaded before using Firebase
document.addEventListener('DOMContentLoaded', () => {
  try {
    const firebaseServices = getFirebase();
    firebase = firebaseServices.firebase;
    db = firebaseServices.db;
    auth = firebaseServices.auth;
    console.log('Firebase services loaded successfully in add-admin-user.js');
    
    // Set up UI elements after Firebase is ready
    setupUI();
  } catch (error) {
    console.error('Failed to initialize Firebase in add-admin-user.js:', error);
    displayError('Failed to initialize Firebase: ' + error.message);
  }
});

// Admin user test data - Explicitly using 'admin' as the UID
const adminUserData = {
  uid: 'admin',
  email: 'admin@cleouniversity.edu',
  displayName: 'System Administrator',
  role: 'admin'
};

// Test credential for admin login
const adminCredentials = {
  email: adminUserData.email,
  password: 'admin123'  // Simple test password
};

// Test data for teachers
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

// Test data for students
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
  },
  {
    email: 'student3@cleouniversity.edu',
    displayName: 'Bob Brown',
    role: 'student',
    password: 'student123'
  },
  {
    email: 'student4@cleouniversity.edu',
    displayName: 'Alice Green',
    role: 'student',
    password: 'student123'
  }
];

// For tracking created users with their IDs
let createdUsers = {};
let createdClasses = {};
let createdSessions = {};

// Setup UI elements for the admin page
function setupUI() {
  // Create buttons to trigger data creation if they don't exist
  if (!document.getElementById('create-admin')) {
    const createButtonContainer = document.createElement('div');
    createButtonContainer.className = 'container mt-5';
    createButtonContainer.innerHTML = `
      <div class="row">
        <div class="col-md-6 mx-auto text-center">
          <h2>CleO Test Data Generator</h2>
          <p class="mb-4">Use the buttons below to create test data for the CleO application</p>
          
          <div class="d-grid gap-2">
            <button id="create-admin" class="btn btn-primary">Create Admin User Only</button>
            <button id="create-all" class="btn btn-success">Create Complete Test Dataset</button>
          </div>
          
          <p class="mt-2 text-muted">
            Click "Admin User" to create just the admin user or "Complete Test Dataset" to create 
            users, classes, sessions, and attendance records
          </p>
        </div>
      </div>
    `;
    document.body.appendChild(createButtonContainer);
    
    // Add click handlers
    document.getElementById('create-admin').addEventListener('click', () => {
      addAdminUser();
    });
    
    document.getElementById('create-all').addEventListener('click', () => {
      createAllTestData();
    });
    
    console.log('Test data generator UI loaded and ready');
  }
}

/**
 * Creates the admin user in Firebase Auth and Firestore
 * @returns {Promise<Object>} - Result of admin user creation
 */
async function addAdminUser() {
  try {
    // Make sure Firebase is initialized
    if (!firebase || !auth || !db) {
      const firebaseServices = getFirebase();
      firebase = firebaseServices.firebase;
      db = firebaseServices.db;
      auth = firebaseServices.auth;
    }
    
    console.log('Starting admin user creation process...');
    displayStatus('Starting admin user creation process...');
    
    // First, we try to delete any existing user with the admin email
    try {
      const existingUsers = await auth.fetchSignInMethodsForEmail(adminCredentials.email);
      if (existingUsers && existingUsers.length > 0) {
        console.log('Admin email already exists, signing in to delete...');
        await auth.signInWithEmailAndPassword(adminCredentials.email, adminCredentials.password);
        await auth.currentUser.delete();
        console.log('Existing admin user deleted');
      }
    } catch (error) {
      console.log('No existing user found or error checking:', error.message);
    }
    
    // Create the admin user in Firebase Auth
    let userCredential;
    try {
      userCredential = await auth.createUserWithEmailAndPassword(
        adminCredentials.email, 
        adminCredentials.password
      );
      console.log('Admin user created in Auth successfully');
    } catch (authError) {
      console.error('Error creating admin user in Auth:', authError);
      throw authError;
    }
    
    // Now ensure we explicitly set the UID to 'admin' in Firestore
    // regardless of what Firebase Auth assigned
    const firestoreAdminData = {
      ...adminUserData,
      // We'll keep the original UID as a reference but use 'admin' for the document ID
      authUid: userCredential.user.uid,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Store the user data in Firestore with explicit document ID 'admin'
    await db.collection('users').doc('admin').set(firestoreAdminData);
    console.log('Admin user data saved to Firestore successfully with UID: admin');
    
    // Store in our tracking object
    createdUsers['admin'] = {
      uid: 'admin', // Using our explicit admin UID
      email: adminCredentials.email,
      displayName: adminUserData.displayName,
      role: adminUserData.role
    };
    
    // Output the test data for user reference
    outputTestData({admin: firestoreAdminData});
    displayStatus('Admin user created successfully!', 'success');
    
    return { 
      success: true, 
      admin: firestoreAdminData
    };
  } catch (err) {
    console.error('Error adding admin user:', err);
    displayError(err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// Event listener for the test data button
const createTestDataBtn = document.getElementById('create-test-data-btn');
if (createTestDataBtn) {
  createTestDataBtn.addEventListener('click', async () => {
    setStatus('Creating test data... This might take a moment.', 'info');
    try {
      // const testData = await createAllTestData(); // <-- Commented out: Cannot call server-side function directly
      // console.log('Test data created:', testData);
      // setStatus('Test data creation initiated (check server logs/emulator UI). Client-side cannot fully confirm completion.', 'warning');
      // outputTestData(testData || {}); // Pass potentially empty object if creation failed or wasn't run
      
      // Since we can't call the backend function directly from here, 
      // we'll just output the predefined credentials.
      setStatus('Displaying predefined credentials. Full test data generation requires a backend process.', 'warning');
      outputTestData({}); // Output basic info

    } catch (error) {
      console.error('Error during test data creation attempt:', error);
      setError('Failed to initiate test data creation: ' + error.message);
    }
  });
}

/**
 * Outputs the test data to the page for easy reference
 */
function outputTestData(testData) {
  // Ensure the output container exists
  let outputContainer = document.getElementById('test-data-output');
  if (!outputContainer) {
    outputContainer = document.createElement('div');
    outputContainer.id = 'test-data-output';
    outputContainer.className = 'container mt-4';
    outputContainer.innerHTML = `
      <h3>Generated Test Data Summary</h3>
      <pre id="test-data-pre" class="bg-light p-3 rounded"></pre>
      <button id="copy-test-data" class="btn btn-secondary btn-sm mt-2">Copy Summary</button>
    `;
    // Try inserting after the status or error, or just append to body
    const statusEl = document.getElementById('admin-status') || document.getElementById('admin-error');
    if (statusEl) {
      statusEl.parentNode.insertBefore(outputContainer, statusEl.nextSibling);
    } else {
      document.body.appendChild(outputContainer);
    }
  }

  const outputPre = document.getElementById('test-data-pre');
  
  // Build the output string
  let outputString = `CleO Test Credentials & IDs:

`;
  outputString += `Admin User:
`;
  outputString += `  Email: ${adminCredentials.email}
`;
  outputString += `  Password: ${adminCredentials.password}
`;
  outputString += `  UID: admin

`;

  // Note: Teachers and Students are created with random UIDs by Auth
  // We only store their initial data here for reference.
  outputString += `Teachers (Password: teacher123):
`;
  teachersData.forEach(t => { outputString += `  - ${t.displayName} (${t.email})
`; });
  outputString += `
`;

  outputString += `Students (Password: student123):
`;
  studentsData.forEach(s => { outputString += `  - ${s.displayName} (${s.email})
`; });
  outputString += `
`;

  // Display created class IDs and session IDs if available in the testData object
  // This part will only be fully populated if createAllTestData was run (backend)
  outputString += `Created Classes:
`;
  if (testData.classes && testData.classes.length > 0) {
    testData.classes.forEach(c => {
      outputString += `  - Name: ${c.name}
`;
      outputString += `    Class ID: ${c.classId}
`;
      outputString += `    Join Code: ${c.joinCode}
`;
      outputString += `    Teacher: ${c.teacherDisplayName} (${c.teacherId})
`;
    });
  } else {
    outputString += `  (No classes created in this run or data unavailable client-side)
`;
  }
  outputString += `
`;

  outputString += `Created Sessions:
`;
  if (testData.sessions && testData.sessions.length > 0) {
    testData.sessions.forEach(s => {
      outputString += `  - Session ID: ${s.sessionId}
`;
      outputString += `    Class: ${s.className} (${s.classId})
`;
      outputString += `    Status: ${s.status}
`;
    });
  } else {
    outputString += `  (No sessions created in this run or data unavailable client-side)
`;
  }

  outputPre.textContent = outputString;

  // Add click handler for the copy button (ensure it's only added once)
  const copyButton = document.getElementById('copy-test-data');
  if (copyButton && !copyButton.dataset.listenerAttached) {
    copyButton.addEventListener('click', () => {
      navigator.clipboard.writeText(outputString)
        .then(() => {
          alert('Test data summary copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          alert('Failed to copy data. See console for details.');
        });
    });
    copyButton.dataset.listenerAttached = 'true'; // Mark as attached
  }
}

/**
 * Display status updates to the user
 */
function displayStatus(message, type = 'info') {
  // Create or get the status container
  let statusContainer = document.getElementById('admin-status');
  if (!statusContainer) {
    statusContainer = document.createElement('div');
    statusContainer.id = 'admin-status';
    statusContainer.className = 'container mt-3';
    document.body.appendChild(statusContainer);
  }
  
  const alertClass = type === 'success' ? 'alert-success' : 'alert-info';
  
  statusContainer.innerHTML = `
    <div class="alert ${alertClass}">
      ${message}
    </div>
  `;
}

/**
 * Displays an error message on the page
 */
function displayError(message) {
  // Create or get the error container
  let errorContainer = document.getElementById('admin-error');
  if (!errorContainer) {
    errorContainer = document.createElement('div');
    errorContainer.id = 'admin-error';
    errorContainer.className = 'container mt-3';
    document.body.appendChild(errorContainer);
  }
  
  errorContainer.innerHTML = `
    <div class="alert alert-danger">
      <strong>Error:</strong> ${message}
    </div>
  `;
}

/**
 * Generate a random join code for classes
 */
function generateJoinCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Export for use in other modules
export { addAdminUser, adminUserData, adminCredentials };

/**
 * Creates a complete test dataset including admin, teachers, students, classes, and sessions
 * @returns {Promise<Object>} - Result of test data creation
 */
export async function createAllTestData() {
  try {
    // Make sure Firebase is initialized
    if (!firebase || !auth || !db) {
      const firebaseServices = getFirebase();
      firebase = firebaseServices.firebase;
      db = firebaseServices.db;
      auth = firebaseServices.auth;
    }
    
    console.log('Starting complete test dataset creation...');
    displayStatus('Creating test dataset... This may take a moment.', 'info');
    
    // Reset tracking objects
    createdUsers = {};
    createdClasses = {};
    createdSessions = {};
    
    // Step 1: Create admin user first
    const adminResult = await addAdminUser();
    if (!adminResult.success) {
      throw new Error(`Failed to create admin user: ${adminResult.error}`);
    }
    
    // Step 2: Create teacher users
    console.log('Creating teacher users...');
    const teacherPromises = teachersData.map(async (teacherData, index) => {
      try {
        // Create auth user
        const userCredential = await auth.createUserWithEmailAndPassword(
          teacherData.email,
          teacherData.password
        );
        
        const uid = userCredential.user.uid;
        
        // Create user document in Firestore
        const firestoreData = {
          uid,
          email: teacherData.email,
          displayName: teacherData.displayName,
          role: 'teacher',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('users').doc(uid).set(firestoreData);
        
        // Store in tracking object
        createdUsers[uid] = {
          ...firestoreData,
          password: teacherData.password
        };
        
        console.log(`Created teacher: ${teacherData.displayName} (${uid})`);
        return {
          uid,
          email: teacherData.email,
          displayName: teacherData.displayName
        };
      } catch (error) {
        console.error(`Error creating teacher ${teacherData.email}:`, error);
        return null;
      }
    });
    
    const teachers = (await Promise.all(teacherPromises)).filter(Boolean);
    
    // Step 3: Create student users
    console.log('Creating student users...');
    const studentPromises = studentsData.map(async (studentData, index) => {
      try {
        // Create auth user
        const userCredential = await auth.createUserWithEmailAndPassword(
          studentData.email,
          studentData.password
        );
        
        const uid = userCredential.user.uid;
        
        // Create user document in Firestore
        const firestoreData = {
          uid,
          email: studentData.email,
          displayName: studentData.displayName,
          role: 'student',
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('users').doc(uid).set(firestoreData);
        
        // Store in tracking object
        createdUsers[uid] = {
          ...firestoreData,
          password: studentData.password
        };
        
        console.log(`Created student: ${studentData.displayName} (${uid})`);
        return {
          uid,
          email: studentData.email,
          displayName: studentData.displayName
        };
      } catch (error) {
        console.error(`Error creating student ${studentData.email}:`, error);
        return null;
      }
    });
    
    const students = (await Promise.all(studentPromises)).filter(Boolean);
    
    // Step 4: Create classes (one per teacher)
    console.log('Creating classes...');
    const classPromises = teachers.map(async (teacher, index) => {
      try {
        const classRef = db.collection('classes').doc();
        const className = `Test Class ${index + 1}`;
        const joinCode = generateJoinCode();
        
        const classData = {
          classId: classRef.id,
          name: className,
          teacherId: teacher.uid,
          joinCode,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await classRef.set(classData);
        
        // Store in tracking object
        createdClasses[classRef.id] = {
          ...classData,
          teacherDisplayName: teacher.displayName
        };
        
        console.log(`Created class: ${className} (${classRef.id})`);
        return {
          classId: classRef.id,
          name: className,
          teacherId: teacher.uid,
          teacherDisplayName: teacher.displayName,
          joinCode
        };
      } catch (error) {
        console.error(`Error creating class for teacher ${teacher.displayName}:`, error);
        return null;
      }
    });
    
    const classes = (await Promise.all(classPromises)).filter(Boolean);
    
    // Step 5: Enroll students in classes
    console.log('Enrolling students in classes...');
    const enrollmentPromises = [];
    
    // Distribute students across classes
    classes.forEach((classObj, classIndex) => {
      // Assign students to classes in round-robin fashion
      students.forEach((student, studentIndex) => {
        if (studentIndex % classes.length === classIndex) {
          enrollmentPromises.push((async () => {
            try {
              const batch = db.batch();
              
              // Add student to class students subcollection
              const studentRef = db.collection(`classes/${classObj.classId}/students`).doc(student.uid);
              batch.set(studentRef, { 
                joinDate: firebase.firestore.FieldValue.serverTimestamp()
              });
              
              // Add class to student's classes subcollection
              const userClassRef = db.collection(`userClasses/${student.uid}/classes`).doc(classObj.classId);
              batch.set(userClassRef, { 
                className: classObj.name,
                teacherName: classObj.teacherDisplayName,
                joinDate: firebase.firestore.FieldValue.serverTimestamp()
              });
              
              await batch.commit();
              console.log(`Enrolled student ${student.displayName} in class ${classObj.name}`);
              
              return {
                studentId: student.uid,
                classId: classObj.classId,
                success: true
              };
            } catch (error) {
              console.error(`Error enrolling student ${student.displayName} in class ${classObj.name}:`, error);
              return null;
            }
          })());
        }
      });
    });
    
    await Promise.all(enrollmentPromises);
    
    // Step 6: Create sessions for each class
    console.log('Creating sessions...');
    const sessionPromises = classes.map(async (classObj) => {
      try {
        const sessionRef = db.collection('sessions').doc();
        
        // Create a mock location (San Francisco coordinates)
        const location = {
          latitude: 37.7749 + (Math.random() * 0.01),
          longitude: -122.4194 + (Math.random() * 0.01)
        };
        
        const sessionData = {
          sessionId: sessionRef.id,
          classId: classObj.classId,
          teacherId: classObj.teacherId,
          startTime: firebase.firestore.FieldValue.serverTimestamp(),
          endTime: null,
          status: 'active',
          location: new firebase.firestore.GeoPoint(location.latitude, location.longitude),
          radius: 100, // 100 meters
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await sessionRef.set(sessionData);
        
        // Store in tracking object
        createdSessions[sessionRef.id] = {
          ...sessionData,
          className: classObj.name
        };
        
        console.log(`Created session for class: ${classObj.name} (${sessionRef.id})`);
        return {
          sessionId: sessionRef.id,
          classId: classObj.classId,
          className: classObj.name,
          status: 'active'
        };
      } catch (error) {
        console.error(`Error creating session for class ${classObj.name}:`, error);
        return null;
      }
    });
    
    const sessions = (await Promise.all(sessionPromises)).filter(Boolean);
    
    // Prepare the final test data object for display
    const testData = {
      admin: createdUsers['admin'],
      teachers,
      students,
      classes,
      sessions
    };
    
    // Output the test data for user reference
    outputTestData(testData);
    displayStatus('Test data created successfully!', 'success');
    
    console.log('Complete test dataset creation finished');
    return testData;
    
  } catch (err) {
    console.error('Error creating test data:', err);
    displayError(err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

// Fix the setStatus function - it was referenced but not defined
function setStatus(message, type = 'info') {
  displayStatus(message, type);
}

// Fix the setError function - it was referenced but not defined
function setError(message) {
  displayError(message);
}