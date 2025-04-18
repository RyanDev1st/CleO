// Client-side main application file for CleO attendance system

import { initializeFirestoreCollections } from './js/initialize-firestore.js';

// Application state
const app = {
  currentUser: null,
  userProfile: null,
  isInitialized: false,
  view: {
    current: 'login',
    previous: null
  }
};

// DOM Elements
const elements = {
  // Auth elements
  authContainer: document.getElementById('auth-container'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  logoutBtn: document.getElementById('logout-btn'),
  logoutBtn2: document.getElementById('logout-btn2'),
  
  // Main content elements
  contentContainer: document.getElementById('content-container'),
  dashboardContainer: document.getElementById('dashboard-container'),
  profileContainer: document.getElementById('profile-container'),
  loadingSpinner: document.getElementById('loading-spinner'),
  
  // Class elements
  classesContainer: document.getElementById('classes-container'),
  studentClassesContainer: document.getElementById('student-classes-container'),
  classForm: document.getElementById('class-form'),
  joinClassForm: document.getElementById('join-class-form'),
  
  // Session elements
  sessionsContainer: document.getElementById('sessions-container'),
  sessionForm: document.getElementById('session-form'),
  activeSessionsContainer: document.getElementById('active-sessions-container'),
  
  // Attendance elements
  attendanceCheckinForm: document.getElementById('attendance-checkin-form'),
  attendanceContainer: document.getElementById('attendance-container'),

  // Navigation elements
  navAuthenticated: document.getElementById('nav-authenticated'),
  navLogin: document.getElementById('nav-login'),
  navRegister: document.getElementById('nav-register'),
  navLogout: document.getElementById('nav-logout'),
  navTeacherClasses: document.getElementById('nav-teacher-classes'),
  navTeacherSessions: document.getElementById('nav-teacher-sessions'),
  navStudentClasses: document.getElementById('nav-student-classes'),
  navStudentSessions: document.getElementById('nav-student-sessions')
};

// Initialize application
async function initApp() {
  console.log('Initializing CleO application...');
  showLoading();
  
  try {
    // Initialize Firestore collections to make them visible in the emulator UI
    await initializeFirestoreCollections();
    
    // Set up authentication listener
    firebase.auth().onAuthStateChanged(async (user) => {
      console.log('Auth state changed:', user ? user.uid : 'logged out');
      app.currentUser = user;
      
      if (user) {
        try {
          // Get user profile from Firestore
          const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
          
          if (userDoc.exists) {
            app.userProfile = userDoc.data();
            updateUIForAuthenticatedUser(app.userProfile);
            
            // Show dashboard based on role
            if (app.userProfile.role === 'teacher') {
              showTeacherViews();
              showView('teacher-dashboard');
              loadClasses(); // Load teacher's classes
              loadSessions(); // Load teacher's sessions
            } else if (app.userProfile.role === 'student') {
              showStudentViews();
              showView('student-dashboard');
              loadClasses(); // Load student's classes
              loadActiveSessions(); // Load active sessions for the student
            } else {
              showView('profile');
            }
          } else {
            // New user, show profile setup
            showView('profile-setup');
          }
        } catch (error) {
          console.error('Error getting user profile:', error);
          showToast('Error loading profile. Please try again.', 'error');
          showView('login');
        }
      } else {
        // User is signed out
        app.userProfile = null;
        updateUIForUnauthenticatedUser();
        showView('login');
      }
    });
    
    // Set up event listeners
    setupEventListeners();
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Failed to initialize application: ' + error.message, 'error');
    
    // Show login view even if initialization failed
    updateUIForUnauthenticatedUser();
    showView('login');
  } finally {
    hideLoading();
    app.isInitialized = true;
  }
}

// Handle login
async function handleLogin(e) {
  e.preventDefault();
  showLoading();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    console.log('Attempting login for email:', email);
    
    // Set a timeout to prevent indefinite loading
    const loginPromise = firebase.auth().signInWithEmailAndPassword(email, password);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Login timeout: Server did not respond in time')), 10000);
    });
    
    // Race between login and timeout
    await Promise.race([loginPromise, timeoutPromise]);
    
    console.log('Login successful');
    showToast('Login successful!', 'success');
  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = error.message || 'Unknown error occurred';
    
    // User-friendly error messages
    if (error.code === 'auth/wrong-password') {
      errorMessage = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email. Please register.';
    } else if (error.code === 'auth/network-request-failed' || error.message.includes('timeout')) {
      errorMessage = 'Network error connecting to authentication service. Check your Firebase configuration.';
    }
    
    showToast('Login failed: ' + errorMessage, 'error');
    hideLoading();
  }
}

// Update UI for authenticated user
function updateUIForAuthenticatedUser(userData) {
  // Update navigation
  if (elements.navAuthenticated) elements.navAuthenticated.style.display = 'flex';
  if (elements.navLogin) elements.navLogin.style.display = 'none';
  if (elements.navRegister) elements.navRegister.style.display = 'none';
  if (elements.navLogout) elements.navLogout.style.display = 'block';
  
  // Update profile view if it's visible
  const profileName = document.getElementById('profile-display-name');
  const profileEmail = document.getElementById('profile-email');
  const profileRole = document.getElementById('profile-role');
  
  if (profileName) profileName.textContent = userData.displayName || 'Not set';
  if (profileEmail) profileEmail.textContent = userData.email || 'Not set';
  if (profileRole) profileRole.textContent = userData.role || 'Not set';
}

// Update UI for unauthenticated user
function updateUIForUnauthenticatedUser() {
  // Update navigation
  if (elements.navAuthenticated) elements.navAuthenticated.style.display = 'none';
  if (elements.navLogin) elements.navLogin.style.display = 'block';
  if (elements.navRegister) elements.navRegister.style.display = 'block';
  if (elements.navLogout) elements.navLogout.style.display = 'none';
  
  // Hide role-specific menus
  hideTeacherViews();
  hideStudentViews();
}

// Show teacher-specific views
function showTeacherViews() {
  if (elements.navTeacherClasses) elements.navTeacherClasses.style.display = 'block';
  if (elements.navTeacherSessions) elements.navTeacherSessions.style.display = 'block';
  hideStudentViews();
}

// Hide teacher-specific views
function hideTeacherViews() {
  if (elements.navTeacherClasses) elements.navTeacherClasses.style.display = 'none';
  if (elements.navTeacherSessions) elements.navTeacherSessions.style.display = 'none';
}

// Show student-specific views
function showStudentViews() {
  if (elements.navStudentClasses) elements.navStudentClasses.style.display = 'block';
  if (elements.navStudentSessions) elements.navStudentSessions.style.display = 'block';
  hideTeacherViews();
}

// Hide student-specific views
function hideStudentViews() {
  if (elements.navStudentClasses) elements.navStudentClasses.style.display = 'none';
  if (elements.navStudentSessions) elements.navStudentSessions.style.display = 'none';
}

// Setup event listeners for UI interactions
function setupEventListeners() {
  // Auth forms
  if (elements.loginForm) {
    elements.loginForm.addEventListener('submit', handleLogin);
  }
  
  if (elements.registerForm) {
    elements.registerForm.addEventListener('submit', handleRegister);
  }
  
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', handleLogout);
  }
  
  if (elements.logoutBtn2) {
    elements.logoutBtn2.addEventListener('click', handleLogout);
  }
  
  // Profile setup form
  const profileSetupForm = document.getElementById('profile-setup-form');
  if (profileSetupForm) {
    profileSetupForm.addEventListener('submit', handleProfileSetup);
  }
  
  // Class forms
  if (elements.classForm) {
    elements.classForm.addEventListener('submit', handleCreateClass);
  }
  
  if (elements.joinClassForm) {
    elements.joinClassForm.addEventListener('submit', handleJoinClass);
  }
  
  // Session forms
  if (elements.sessionForm) {
    elements.sessionForm.addEventListener('submit', handleCreateSession);
  }
  
  // Attendance form
  if (elements.attendanceCheckinForm) {
    elements.attendanceCheckinForm.addEventListener('submit', handleAttendanceCheckIn);
  }
  
  // Add view change event listeners for all buttons with data-view attribute
  document.addEventListener('click', function(e) {
    if (e.target.matches('[data-view]')) {
      const viewName = e.target.dataset.view;
      
      // For create-session view, load classes for dropdown
      if (viewName === 'create-session' && app.userProfile?.role === 'teacher') {
        firebase.firestore().collection('classes')
          .where('teacherId', '==', app.currentUser.uid)
          .get()
          .then(snapshot => {
            const classes = snapshot.docs.map(doc => ({
              classId: doc.id,
              name: doc.data().name
            }));
            populateClassDropdown(classes);
          })
          .catch(error => {
            console.error('Error loading classes for dropdown:', error);
          });
      }
      
      showView(viewName);
      e.preventDefault();
    }
  });
}

// --- Basic Authentication Handlers ---

async function handleRegister(e) {
  e.preventDefault();
  showLoading();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const displayName = document.getElementById('register-name').value;
  const role = document.querySelector('input[name="register-role"]:checked').value;
  
  try {
    // Create auth user
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Update display name
    await user.updateProfile({ displayName });
    
    // Create user profile in Firestore
    await firebase.firestore().collection('users').doc(user.uid).set({
      uid: user.uid,
      email,
      displayName,
      role,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Registration successful!', 'success');
    // Auth state change listener will handle UI update
  } catch (error) {
    console.error('Registration error:', error);
    let errorMessage = error.message || 'Unknown error occurred';
    
    // User-friendly error messages
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'This email is already registered. Please use a different email or login.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak. Please use a stronger password.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email address. Please check and try again.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Network error. Please check your connection to the emulator.';
    }
    
    showToast('Registration failed: ' + errorMessage, 'error');
    hideLoading();
  }
}

async function handleLogout() {
  try {
    await firebase.auth().signOut();
    // Auth state change listener will handle UI update
    showToast('Logged out successfully', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast('Logout failed: ' + error.message, 'error');
  }
}

async function handleProfileSetup(e) {
  e.preventDefault();
  showLoading();
  
  const name = document.getElementById('profile-name').value.trim();
  const role = document.querySelector('input[name="profile-role"]:checked').value;
  
  try {
    const user = firebase.auth().currentUser;
    
    if (!user) {
      throw new Error('No user signed in');
    }
    
    // Update display name
    await user.updateProfile({
      displayName: name
    });
    
    // Create/update user document in Firestore
    await firebase.firestore().collection('users').doc(user.uid).set({
      uid: user.uid,
      displayName: name,
      email: user.email,
      role: role,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    showToast('Profile setup successful!', 'success');
    
    // Show appropriate dashboard based on role
    if (role === 'teacher') {
      showTeacherViews();
      showView('teacher-dashboard');
      loadClasses();
      loadSessions();
    } else if (role === 'student') {
      showStudentViews();
      showView('student-dashboard');
      loadClasses();
      loadActiveSessions();
    }
  } catch (error) {
    console.error('Profile setup error:', error);
    showToast('Profile setup failed: ' + error.message, 'error');
    hideLoading();
  }
}

// ---- Class Management Handlers ----

async function loadClasses() {
  showLoading();
  try {
    if (!app.currentUser || !app.userProfile) {
      console.warn("User not authenticated or profile not loaded");
      hideLoading();
      return [];
    }
    
    const role = app.userProfile.role;
    let classes = [];
    
    if (role === 'teacher') {
      const snapshot = await firebase.firestore().collection('classes')
        .where('teacherId', '==', app.currentUser.uid)
        .get();
      
      classes = snapshot.docs.map(doc => ({
        ...doc.data(),
        classId: doc.id
      }));
      
      renderTeacherClasses(classes);
    } else if (role === 'student') {
      const userClassesSnapshot = await firebase.firestore()
        .collection(`userClasses/${app.currentUser.uid}/classes`)
        .get();
      
      const classIds = userClassesSnapshot.docs.map(doc => doc.id);
      
      if (classIds.length > 0) {
        // Process in chunks since 'in' operator has a limit of 10
        const chunkSize = 10;
        const allClasses = [];
        
        for (let i = 0; i < classIds.length; i += chunkSize) {
          const chunk = classIds.slice(i, i + chunkSize);
          const snapshot = await firebase.firestore().collection('classes')
            .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
            .get();
          
          const classes = snapshot.docs.map(doc => ({
            ...doc.data(),
            classId: doc.id
          }));
          
          allClasses.push(...classes);
        }
        
        renderStudentClasses(allClasses);
      } else {
        renderStudentClasses([]);
      }
    }
    
    hideLoading();
    return classes;
  } catch (error) {
    console.error('Error loading classes:', error);
    showToast('Failed to load classes. Please try again.', 'error');
    hideLoading();
    return [];
  }
}

function generateJoinCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function handleCreateClass(e) {
  e.preventDefault();
  showLoading();
  
  const name = document.getElementById('class-name').value;
  
  try {
    console.log('Creating class with name:', name);
    // Generate a join code
    const joinCode = generateJoinCode();
    
    // Set a timeout to prevent indefinite loading
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 15000); // 15 second timeout
    });
    
    // Create the class with a timeout
    const classCreatePromise = (async () => {
      const classRef = firebase.firestore().collection('classes').doc();
      await classRef.set({
        classId: classRef.id,
        name,
        teacherId: app.currentUser.uid,
        joinCode,
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });
      return classRef.id;
    })();
    
    // Race between the class creation and the timeout
    const classId = await Promise.race([classCreatePromise, timeoutPromise]);
    
    console.log('Class created successfully with ID:', classId);
    showToast(`Class "${name}" created with join code: ${joinCode}`, 'success');
    
    // Navigate to classes view
    showView('teacher-classes');
    
    // Load classes in the background
    setTimeout(() => {
      loadClasses().catch(err => {
        console.error('Error reloading classes after creation:', err);
      });
    }, 100);
    
  } catch (error) {
    console.error('Create class error:', error);
    
    // More specific error messages based on the error
    let errorMessage = 'Failed to create class';
    if (error.message === 'Request timeout') {
      errorMessage = 'Connection to Firebase timed out. The class may still have been created. Please check your classes list.';
    } else if (error.code === 'unavailable' || error.message.includes('network')) {
      errorMessage = 'Network connection issue. Please check your connection to the Firebase emulator.';
    } else if (error.code === 'permission-denied') {
      errorMessage = 'You don\'t have permission to create classes.';
    } else {
      errorMessage += ': ' + error.message;
    }
    
    showToast(errorMessage, 'error');
    hideLoading();
    
    // Try to navigate to classes view anyway so user doesn't get stuck
    showView('teacher-classes');
  }
}

async function handleJoinClass(e) {
  e.preventDefault();
  showLoading();
  
  const joinCode = document.getElementById('join-code').value;
  
  try {
    // Find class with join code
    const classSnapshot = await firebase.firestore().collection('classes')
      .where('joinCode', '==', joinCode)
      .limit(1)
      .get();
    
    if (classSnapshot.empty) {
      throw new Error('Invalid join code');
    }
    
    const classDoc = classSnapshot.docs[0];
    const classData = classDoc.data();
    const classId = classDoc.id;
    
    // Get teacher name
    const teacherId = classData.teacherId;
    const teacherDoc = await firebase.firestore().collection('users').doc(teacherId).get();
    const teacherName = teacherDoc.exists ? teacherDoc.data().displayName : 'Unknown Teacher';
    
    // Add student to class
    const batch = firebase.firestore().batch();
    
    // Add student to class students subcollection
    const studentRef = firebase.firestore().collection(`classes/${classId}/students`).doc(app.currentUser.uid);
    batch.set(studentRef, { 
      joinDate: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Add class to student's classes subcollection
    const userClassRef = firebase.firestore().collection(`userClasses/${app.currentUser.uid}/classes`).doc(classId);
    batch.set(userClassRef, { 
      className: classData.name,
      teacherName,
      joinDate: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    
    showToast(`Successfully joined class: ${classData.name}`, 'success');
    // Reload classes
    await loadClasses();
    showView('student-classes');
  } catch (error) {
    console.error('Join class error:', error);
    showToast('Failed to join class: ' + error.message, 'error');
    hideLoading();
  }
}

// Render functions for class UI
function renderTeacherClasses(classes) {
  const container = document.getElementById('classes-container');
  const dashboardContainer = document.getElementById('dashboard-classes');
  
  if (!container && !dashboardContainer) return;
  
  let html = '';
  
  if (classes.length === 0) {
    html = `
      <div class="alert alert-info">
        <p>You haven't created any classes yet.</p>
        <button class="btn btn-primary btn-sm" data-view="create-class">Create Your First Class</button>
      </div>
    `;
  } else {
    html = `
      <div class="row row-cols-1 row-cols-md-2 g-4">
        ${classes.map(cls => `
          <div class="col">
            <div class="card h-100">
              <div class="card-body">
                <h5 class="card-title">${cls.name}</h5>
                <p class="card-text">
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${cls.classId}</span><br>
                  <strong>Join Code:</strong> ${cls.joinCode}<br>
                  <strong>Created:</strong> ${cls.created_at ? new Date(cls.created_at.toDate()).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-success btn-sm create-session-btn" data-class-id="${cls.classId}" data-class-name="${cls.name}">
                  Start Session
                </button>
                <button class="btn btn-info btn-sm view-students-btn" data-class-id="${cls.classId}">
                  View Students
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  if (container) {
    container.innerHTML = html;
    
    // Add event listeners for class cards
    container.querySelectorAll('.create-session-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const classId = btn.dataset.classId;
        const className = btn.dataset.className;
        
        // Populate the dropdown in the create session form
        populateClassDropdown([{ classId, name: className }]);
        
        // Pre-select this class in the dropdown
        document.getElementById('session-class-id').value = classId;
        
        showView('create-session');
      });
    });
  }
  
  // Update dashboard preview if it exists
  if (dashboardContainer) {
    if (classes.length === 0) {
      dashboardContainer.innerHTML = `
        <div class="alert alert-info">
          <p>You haven't created any classes yet.</p>
          <button class="btn btn-primary btn-sm" data-view="create-class">Create Your First Class</button>
        </div>
      `;
    } else {
      // Show just the most recent 3 classes
      const recentClasses = classes.slice(0, 3);
      dashboardContainer.innerHTML = `
        <ul class="list-group">
          ${recentClasses.map(cls => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              ${cls.name}
              <div>
                <span class="badge bg-secondary me-1">ID: ${cls.classId}</span>
                <span class="badge bg-primary rounded-pill">
                  Join Code: ${cls.joinCode}
                </span>
              </div>
            </li>
          `).join('')}
        </ul>
        ${classes.length > 3 ? `
          <div class="mt-2 text-end">
            <a href="#" data-view="teacher-classes">View all ${classes.length} classes</a>
          </div>
        ` : ''}
      `;
    }
  }
  
  // Also populate the class dropdown for the create session form
  populateClassDropdown(classes);
}

function renderStudentClasses(classes) {
  const container = document.getElementById('student-classes-container');
  const dashboardContainer = document.getElementById('student-dashboard-classes');
  
  if (!container && !dashboardContainer) return;
  
  let html = '';
  
  if (classes.length === 0) {
    html = `
      <div class="alert alert-info">
        <p>You aren't enrolled in any classes yet.</p>
        <button class="btn btn-primary btn-sm" data-view="join-class">Join Your First Class</button>
      </div>
    `;
  } else {
    html = `
      <div class="row row-cols-1 row-cols-md-2 g-4">
        ${classes.map(cls => `
          <div class="col">
            <div class="card h-100">
              <div class="card-body">
                <h5 class="card-title">${cls.name}</h5>
                <p class="card-text">
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${cls.classId}</span><br>
                  <strong>Teacher:</strong> ${cls.teacherName || 'Unknown'}<br>
                </p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (container) {
    container.innerHTML = html;
  }
  
  // Update dashboard preview if it exists
  if (dashboardContainer) {
    if (classes.length === 0) {
      dashboardContainer.innerHTML = `
        <div class="alert alert-info">
          <p>You aren't enrolled in any classes yet.</p>
          <button class="btn btn-primary btn-sm" data-view="join-class">Join Your First Class</button>
        </div>
      `;
    } else {
      // Show just the most recent 3 classes
      const recentClasses = classes.slice(0, 3);
      dashboardContainer.innerHTML = `
        <ul class="list-group">
          ${recentClasses.map(cls => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              ${cls.name}
              <div>
                <span class="badge bg-secondary">ID: ${cls.classId}</span>
              </div>
            </li>
          `).join('')}
        </ul>
        ${classes.length > 3 ? `
          <div class="mt-2 text-end">
            <a href="#" data-view="student-classes">View all ${classes.length} classes</a>
          </div>
        ` : ''}
      `;
    }
  }
}

// ---- Session Management ----

async function loadSessions() {
  showLoading();
  
  try {
    if (!app.currentUser || !app.userProfile) {
      console.warn("User not authenticated or profile not loaded");
      hideLoading();
      return [];
    }
    
    console.log('Loading sessions for teacher:', app.currentUser.uid);
    const role = app.userProfile.role;
    let sessions = [];
    
    if (role === 'teacher') {
      const snapshot = await firebase.firestore().collection('sessions')
        .where('teacherId', '==', app.currentUser.uid)
        .get();
      
      console.log('Found sessions:', snapshot.size);
      
      sessions = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Pre-process timestamps to avoid toDate() errors later
        let processedData = {...data};
        if (data.startTime && typeof data.startTime.toDate === 'function') {
          processedData.startTimeFormatted = data.startTime.toDate().toLocaleString();
        } else {
          processedData.startTimeFormatted = 'N/A';
        }
        
        if (data.endTime && typeof data.endTime.toDate === 'function') {
          processedData.endTimeFormatted = data.endTime.toDate().toLocaleString();
        } else {
          processedData.endTimeFormatted = 'N/A';
        }
        
        return {
          ...processedData,
          sessionId: doc.id,
          className: 'Loading...' // Temporary placeholder
        };
      });
      
      // For each session, fetch class name to display properly
      if (sessions.length > 0) {
        console.log('Fetching class information for sessions...');
        const classInfoPromises = sessions.map(async (session) => {
          try {
            if (session.classId) {
              const classDoc = await firebase.firestore()
                .collection('classes')
                .doc(session.classId)
                .get();
                
              if (classDoc.exists) {
                session.className = classDoc.data().name || 'Unknown Class';
                console.log(`Found class name for session ${session.sessionId}: ${session.className}`);
              } else {
                session.className = 'Unknown Class';
                console.warn(`Class ${session.classId} not found for session ${session.sessionId}`);
              }
            }
          } catch (e) {
            console.error('Error fetching class info:', e);
            session.className = 'Error Loading';
          }
        });
        
        await Promise.all(classInfoPromises);
      }
      
      renderSessions(sessions);
    }
    
    hideLoading();
    return sessions;
  } catch (error) {
    console.error('Error loading sessions:', error);
    showToast('Failed to load sessions: ' + error.message, 'error');
    hideLoading();
    return [];
  }
}

async function loadActiveSessions() {
  if (app.userProfile?.role !== 'student') return;
  
  try {
    showLoading();
    console.log('Loading active sessions for student:', app.currentUser.uid);
    
    // Get all classes the student is enrolled in
    const userClassesSnapshot = await firebase.firestore()
      .collection(`userClasses/${app.currentUser.uid}/classes`)
      .get();
    
    const classIds = userClassesSnapshot.docs.map(doc => doc.id);
    console.log('Student enrolled in classes:', classIds);
    
    if (classIds.length === 0) {
      console.log('No classes found for student - no active sessions possible');
      renderStudentSessions([]);
      hideLoading();
      return;
    }
    
    // Process in chunks since 'in' operator has a limit of 10
    const chunkSize = 10;
    const activeSessions = [];
    
    for (let i = 0; i < classIds.length; i += chunkSize) {
      const chunk = classIds.slice(i, i + chunkSize);
      console.log('Querying sessions for class chunk:', chunk);
      
      // Query for active sessions in this student's classes
      const snapshot = await firebase.firestore().collection('sessions')
        .where('classId', 'in', chunk)
        .where('status', '==', 'active')
        .get();
      
      console.log('Query returned sessions:', snapshot.size);
      
      // Enhanced debugging for each session in the snapshot
      snapshot.forEach(doc => {
        console.log('Session details:', {
          id: doc.id,
          classId: doc.data().classId,
          status: doc.data().status,
          startTime: doc.data().startTime
        });
      });
      
      const sessions = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          sessionId: doc.id,
          // Add formatted time for better display
          startTimeFormatted: data.startTime ? new Date(data.startTime.toDate()).toLocaleString() : 'N/A'
        };
      });
      
      console.log('Processed sessions in this chunk:', sessions.length);
      activeSessions.push(...sessions);
    }
    
    console.log('Total active sessions found:', activeSessions.length);
    
    if (activeSessions.length > 0) {
      // Get class info for each session
      const classInfoPromises = activeSessions.map(async (session) => {
        try {
          // Try to get class details from userClasses collection first
          const userClassDoc = await firebase.firestore()
            .collection(`userClasses/${app.currentUser.uid}/classes`)
            .doc(session.classId)
            .get();
          
          if (userClassDoc.exists) {
            session.className = userClassDoc.data().className || 'Unknown Class';
            session.teacherName = userClassDoc.data().teacherName || 'Unknown Teacher';
          } else {
            // Fallback: get class info directly from classes collection
            const classDoc = await firebase.firestore()
              .collection('classes')
              .doc(session.classId)
              .get();
              
            if (classDoc.exists) {
              session.className = classDoc.data().name || 'Unknown Class';
              
              // Get teacher name
              const teacherId = classDoc.data().teacherId;
              const teacherDoc = await firebase.firestore()
                .collection('users')
                .doc(teacherId)
                .get();
              
              if (teacherDoc.exists) {
                session.teacherName = teacherDoc.data().displayName || 'Unknown Teacher';
              } else {
                session.teacherName = 'Unknown Teacher';
              }
            } else {
              session.className = 'Unknown Class';
              session.teacherName = 'Unknown Teacher';
            }
          }
          
          // Check if student already attended this session
          const attendanceDoc = await firebase.firestore()
            .collection('sessions')
            .doc(session.sessionId)
            .collection('attendance')
            .doc(app.currentUser.uid)
            .get();
          
          session.hasAttended = attendanceDoc.exists;
          if (session.hasAttended) {
            session.attendanceStatus = attendanceDoc.data().status;
          }
        } catch (e) {
          console.error('Error getting class/attendance info:', e);
        }
      });
      
      await Promise.all(classInfoPromises);
    }
    
    renderStudentSessions(activeSessions);
    hideLoading();
  } catch (error) {
    console.error('Error loading active sessions:', error);
    showToast('Failed to load active sessions: ' + error.message, 'error');
    hideLoading();
  }
}

async function handleCreateSession(e) {
  e.preventDefault();
  showLoading();
  
  const classId = document.getElementById('session-class-id').value;
  const radius = parseInt(document.getElementById('session-radius').value);
  
  try {
    // Get current location
    const position = await getCurrentPosition();
    
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    
    // Create session in Firestore
    const sessionRef = firebase.firestore().collection('sessions').doc();
    await sessionRef.set({
      sessionId: sessionRef.id,
      classId,
      teacherId: app.currentUser.uid,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      endTime: null,
      status: 'active',
      location: new firebase.firestore.GeoPoint(location.latitude, location.longitude),
      radius,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Session created successfully!', 'success');
    // Reload sessions
    await loadSessions();
    showView('teacher-sessions');
  } catch (error) {
    console.error('Create session error:', error);
    
    let errorMessage = 'Failed to create session';
    if (error.code === 1) {
      errorMessage = 'Location permission denied. You must allow location access to create a session.';
    } else if (error.code === 2) {
      errorMessage = 'Location unavailable. Please try again.';
    } else if (error.code === 3) {
      errorMessage = 'Location request timed out. Please try again.';
    } else {
      errorMessage += ': ' + error.message;
    }
    
    showToast(errorMessage, 'error');
    hideLoading();
  }
}

async function handleAttendanceCheckIn(e) {
  e.preventDefault();
  showLoading();
  
  const sessionId = document.getElementById('checkin-session-id').value;
  
  try {
    // Get current location
    const position = await getCurrentPosition();
    
    const studentLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    };
    
    console.log(`Student check-in for session: ${sessionId}, location:`, studentLocation);
    
    // First, get the session details to verify location
    const sessionDoc = await firebase.firestore().collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    const sessionLocation = {
      latitude: sessionData.location.latitude,
      longitude: sessionData.location.longitude
    };
    
    // Calculate distance between student and session location
    const distance = calculateDistance(sessionLocation, studentLocation);
    const isWithinRadius = distance <= sessionData.radius;
    
    console.log(`Distance calculation: ${distance.toFixed(2)}m, Session radius: ${sessionData.radius}m, Within radius: ${isWithinRadius}`);
    
    // Record attendance in the correct subcollection
    await firebase.firestore().collection('sessions').doc(sessionId)
      .collection('attendance').doc(app.currentUser.uid).set({
        studentId: app.currentUser.uid,
        classId: sessionData.classId,
        checkInTime: firebase.firestore.FieldValue.serverTimestamp(),
        checkInLocation: new firebase.firestore.GeoPoint(studentLocation.latitude, studentLocation.longitude),
        checkOutTime: null, // Initialize checkout time as null
        distance: distance,
        status: isWithinRadius ? 'verified' : 'failed_location',
        isGpsVerified: isWithinRadius,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform
        },
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    showToast(isWithinRadius ? 
      'Attendance recorded successfully!' : 
      'Attendance recorded but you are outside the allowed radius.', 
      isWithinRadius ? 'success' : 'warning');
    
    showView('active-sessions');
    
    // Refresh session list to update UI
    setTimeout(() => loadActiveSessions(), 500);
  } catch (error) {
    console.error('Attendance check-in error:', error);
    
    let errorMessage = 'Failed to check in';
    if (error.code === 1) {
      errorMessage = 'Location permission denied. You must allow location access to check in.';
    } else if (error.code === 2) {
      errorMessage = 'Could not determine your location. Please ensure GPS is enabled and try again.';
    }
    
    showToast(errorMessage, 'error');
    hideLoading();
  }
}

/**
 * Handle student early checkout from a session
 * @param {string} sessionId - ID of the session to check out from
 */
async function handleAttendanceCheckOut(sessionId) {
  if (!confirm("Are you sure you want to check out early from this session?")) {
    return;
  }

  showLoading();
  
  try {
    const attendanceRef = firebase.firestore()
      .collection('sessions')
      .doc(sessionId)
      .collection('attendance')
      .doc(app.currentUser.uid);
    
    const attendanceDoc = await attendanceRef.get();
    
    if (!attendanceDoc.exists) {
      throw new Error("You haven't checked in to this session yet");
    }
    
    // Update attendance record with checkout time
    await attendanceRef.update({
      checkOutTime: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'checked_out_early_before_verification',
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showToast('Successfully checked out from the session', 'success');
    
    // Refresh sessions
    await loadActiveSessions();
    
  } catch (error) {
    console.error('Checkout error:', error);
    showToast('Failed to check out: ' + error.message, 'error');
  } finally {
    hideLoading();
  }
}

function renderSessions(sessions) {
  const container = document.getElementById('sessions-container');
  if (!container) return;
  
  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        <p>You haven't created any sessions yet.</p>
        <button class="btn btn-primary btn-sm" data-view="create-session">Create Your First Session</button>
      </div>
    `;
    return;
  }
  
  // Group sessions by status
  const activeSessions = sessions.filter(s => s.status === 'active');
  const endedSessions = sessions.filter(s => s.status === 'ended');
  
  let html = '';
  
  if (activeSessions.length > 0) {
    html += `
      <h3 class="mb-3">Active Sessions</h3>
      <div class="row row-cols-1 row-cols-md-2 g-4 mb-5">
        ${activeSessions.map(session => `
          <div class="col">
            <div class="card h-100 border-success">
              <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
                <div>Active Session</div>
                <span class="badge bg-light text-dark">${session.startTimeFormatted}</span>
              </div>
              <div class="card-body">
                <h5 class="card-title">${session.className}</h5>
                <p class="card-text">
                  <strong>Session ID:</strong> <span class="badge bg-secondary">${session.sessionId}</span><br>
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${session.classId}</span><br>
                  <strong>Radius:</strong> ${session.radius} meters<br>
                  <strong>Attendance:</strong> <span class="attendance-count" data-session-id="${session.sessionId}">Loading...</span>
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-danger btn-sm end-session-btn" data-session-id="${session.sessionId}">End Session</button>
                <button class="btn btn-info btn-sm view-attendance-btn" data-session-id="${session.sessionId}">View Attendance</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (endedSessions.length > 0) {
    html += `
      <h3 class="mb-3">Past Sessions</h3>
      <div class="row row-cols-1 row-cols-md-2 g-4">
        ${endedSessions.map(session => `
          <div class="col">
            <div class="card h-100">
              <div class="card-header d-flex justify-content-between align-items-center">
                <div>Ended Session</div>
                <span class="badge bg-secondary">${session.startTimeFormatted}</span>
              </div>
              <div class="card-body">
                <h5 class="card-title">${session.className}</h5>
                <p class="card-text">
                  <strong>Session ID:</strong> <span class="badge bg-secondary">${session.sessionId}</span><br>
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${session.classId}</span><br>
                  <strong>Duration:</strong> ${calculateDuration(session.startTime, session.endTime)}<br>
                  <strong>Attendance:</strong> <span class="attendance-count" data-session-id="${session.sessionId}">Loading...</span>
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-info btn-sm view-attendance-btn" data-session-id="${session.sessionId}">View Attendance</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // Add event listeners for session cards
  container.querySelectorAll('.view-attendance-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      showAttendance(sessionId);
    });
  });
  
  container.querySelectorAll('.end-session-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      endSession(sessionId);
    });
  });
  
  // Load attendance counts
  container.querySelectorAll('.attendance-count').forEach(async (span) => {
    const sessionId = span.dataset.sessionId;
    try {
      const snapshot = await firebase.firestore()
        .collection('sessions')
        .doc(sessionId)
        .collection('attendance')
        .get();
      
      span.textContent = `${snapshot.size} students`;
    } catch (error) {
      console.error('Error loading attendance count:', error);
      span.textContent = 'Error';
    }
  });
}

function renderStudentSessions(sessions) {
  const container = document.getElementById('active-sessions-container');
  if (!container) return;
  
  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        <p>No active sessions found for your classes.</p>
      </div>
    `;
    return;
  }
  
  let html = `
    <div class="row row-cols-1 row-cols-md-2 g-4">
      ${sessions.map(session => `
        <div class="col">
          <div class="card h-100 ${session.hasAttended ? 'border-success' : ''}">
            <div class="card-header ${session.hasAttended ? (session.attendanceStatus === 'checked_out_early_before_verification' ? 'bg-warning' : 'bg-success text-white') : ''}">
              ${session.className} ${session.hasAttended ? (session.attendanceStatus === 'checked_out_early_before_verification' ? '(Checked Out Early)' : '(Attended)') : ''}
            </div>
            <div class="card-body">
              <h5 class="card-title">Started: ${session.startTimeFormatted}</h5>
              <p class="card-text">
                <strong>Session ID:</strong> <span class="badge bg-secondary">${session.sessionId}</span><br>
                <strong>Class ID:</strong> <span class="badge bg-secondary">${session.classId}</span><br>
                <strong>Teacher:</strong> ${session.teacherName || 'Unknown'}<br>
                ${session.hasAttended 
                  ? `<span class="badge ${
                      session.attendanceStatus === 'verified' ? 'bg-success' : 
                      session.attendanceStatus === 'checked_out_early_before_verification' ? 'bg-warning text-dark' : 
                      'bg-warning'
                    }">
                      ${
                        session.attendanceStatus === 'verified' ? 'Verified ✓' : 
                        session.attendanceStatus === 'checked_out_early_before_verification' ? 'Checked Out Early' : 
                        'Outside radius ⚠️'
                      }
                     </span>`
                  : ''}
              </p>
            </div>
            <div class="card-footer">
              ${!session.hasAttended 
                ? `<button class="btn btn-primary btn-sm check-in-btn" 
                     data-session-id="${session.sessionId}"
                     data-class-name="${session.className}">
                     Check In
                   </button>`
                : (session.attendanceStatus !== 'checked_out_early_before_verification'
                    ? `<div class="d-flex">
                         <button class="btn btn-success btn-sm me-2" disabled>
                           Checked In ✓
                         </button>
                         <button class="btn btn-warning btn-sm checkout-btn" data-session-id="${session.sessionId}">
                           Check Out Early
                         </button>
                       </div>`
                    : `<button class="btn btn-secondary btn-sm" disabled>
                         Checked Out ✓
                       </button>`
                  )
              }
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add event listeners for check-in buttons
  container.querySelectorAll('.check-in-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      const className = btn.dataset.className;
      
      // Set up attendance check-in form
      document.getElementById('checkin-session-id').value = sessionId;
      document.getElementById('checkin-class-id').textContent = className;
      
      showView('attendance-checkin');
    });
  });
  
  // Add event listeners for checkout buttons
  container.querySelectorAll('.checkout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessionId = btn.dataset.sessionId;
      handleAttendanceCheckOut(sessionId);
    });
  });
}

// ---- Utility functions ----

// Get current position with Promise API
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
    } else {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });
    }
  });
}

// Calculate distance between two points using Haversine formula
function calculateDistance(point1, point2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = point1.latitude * Math.PI / 180;
  const φ2 = point2.latitude * Math.PI / 180;
  const Δφ = (point2.latitude - point1.latitude) * Math.PI / 180;
  const Δλ = (point2.longitude - point1.longitude) * Math.PI / 180;
  
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distance in meters
}

// Calculate duration between two timestamps
function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return 'N/A';
  
  try {
    const start = startTime.toDate();
    const end = endTime.toDate();
    const diff = end - start;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else {
      return `${minutes} minutes`;
    }
  } catch (e) {
    return 'Invalid time';
  }
}

// End a session
async function endSession(sessionId) {
  if (!confirm('Are you sure you want to end this session? Students will no longer be able to check in.')) {
    return;
  }
  
  showLoading();
  
  try {
    await firebase.firestore().collection('sessions').doc(sessionId).update({
      endTime: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'ended'
    });
    
    showToast('Session ended successfully', 'success');
    loadSessions(); // Refresh the sessions list
  } catch (error) {
    console.error('Error ending session:', error);
    showToast('Failed to end session: ' + error.message, 'error');
    hideLoading();
  }
}

// Show attendance for a session
async function showAttendance(sessionId) {
  showLoading();
  
  try {
    // Get session details
    const sessionDoc = await firebase.firestore().collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Get class details
    const classDoc = await firebase.firestore().collection('classes').doc(sessionData.classId).get();
    const className = classDoc.exists ? classDoc.data().name : 'Unknown Class';
    
    // Get all students in the class
    const studentsSnapshot = await firebase.firestore()
      .collection(`classes/${sessionData.classId}/students`)
      .get();
    
    const allStudentIds = studentsSnapshot.docs.map(doc => doc.id);
    
    // Get attendance records for this session
    const attendanceSnapshot = await firebase.firestore()
      .collection(`sessions/${sessionId}/attendance`)
      .get();
    
    const attendanceMap = {};
    attendanceSnapshot.docs.forEach(doc => {
      attendanceMap[doc.id] = doc.data();
    });
    
    // Get user details for all students
    const userDetailsPromises = allStudentIds.map(async (studentId) => {
      try {
        const userDoc = await firebase.firestore().collection('users').doc(studentId).get();
        return userDoc.exists ? { id: studentId, ...userDoc.data() } : { id: studentId, displayName: 'Unknown Student' };
      } catch (e) {
        console.error(`Error fetching details for student ${studentId}:`, e);
        return { id: studentId, displayName: 'Error loading name' };
      }
    });
    
    const userDetails = await Promise.all(userDetailsPromises);
    
    // Build attendance list with status
    const attendanceList = userDetails.map(user => {
      const attendance = attendanceMap[user.id];
      return {
        id: user.id,
        name: user.displayName,
        email: user.email,
        status: attendance ? attendance.status : 'absent',
        checkInTime: attendance && attendance.checkInTime ? attendance.checkInTime.toDate().toLocaleString() : 'N/A',
        distance: attendance ? attendance.distance : null
      };
    });
    
    // Set up the attendance view
    const container = document.getElementById('attendance-container');
    
    // Count statuses
    const verified = attendanceList.filter(a => a.status === 'verified').length;
    const failed = attendanceList.filter(a => a.status === 'failed_location').length;
    const absent = attendanceList.filter(a => a.status === 'absent').length;
    
    let html = `
      <div class="mb-4">
        <h3>${className}</h3>
        <p>
          <strong>Session started:</strong> ${sessionData.startTime ? new Date(sessionData.startTime.toDate()).toLocaleString() : 'N/A'}<br>
          <strong>Session status:</strong> ${sessionData.status === 'active' ? 'Active' : 'Ended'}<br>
          <strong>Attendance summary:</strong> Present: ${verified + failed}, Verified: ${verified}, Failed location: ${failed}, Absent: ${absent}
        </p>
      </div>
      
      <div class="table-responsive">
        <table class="table table-striped table-hover">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Check-in Time</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            ${attendanceList.map(a => `
              <tr class="${a.status === 'verified' ? 'table-success' : a.status === 'failed_location' ? 'table-warning' : 'table-danger'}">
                <td>${a.name}</td>
                <td>${a.email || 'N/A'}</td>
                <td>
                  ${a.status === 'verified' 
                    ? '<span class="badge bg-success">Verified</span>' 
                    : a.status === 'failed_location' 
                      ? '<span class="badge bg-warning text-dark">Outside radius</span>' 
                      : '<span class="badge bg-danger">Absent</span>'}
                </td>
                <td>${a.checkInTime}</td>
                <td>${a.distance !== null ? a.distance.toFixed(1) + ' m' : 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Show the attendance view
    showView('attendance');
    hideLoading();
  } catch (error) {
    console.error('Error loading attendance:', error);
    showToast('Failed to load attendance data: ' + error.message, 'error');
    hideLoading();
  }
}

// Utility functions
function showLoading() {
  if (elements.loadingSpinner) {
    elements.loadingSpinner.style.display = 'flex';
  }
}

function hideLoading() {
  if (elements.loadingSpinner) {
    elements.loadingSpinner.style.display = 'none';
  }
}

function showToast(message, type = 'info') {
  let toastContainer = document.querySelector('.toast-container');
  
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toastContainer.removeChild(toast);
    }, 300);
  }, 3000);
}

function showView(viewName) {
  app.view.previous = app.view.current;
  app.view.current = viewName;
  
  console.log(`Switching view from ${app.view.previous} to ${viewName}`);
  
  // Hide all views
  document.querySelectorAll('.view').forEach(el => {
    el.style.display = 'none';
  });
  
  // Show requested view
  const viewElement = document.getElementById(`${viewName}-view`);
  if (viewElement) {
    viewElement.style.display = 'block';
  } else {
    console.error(`View not found: ${viewName}-view`);
  }
  
  // Update nav active state
  document.querySelectorAll('nav .nav-link').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.view === viewName) {
      el.classList.add('active');
    }
  });
}

// Populate class dropdown for session creation
function populateClassDropdown(classes) {
  const dropdown = document.getElementById('session-class-id');
  if (!dropdown) return;
  
  dropdown.innerHTML = classes.map(cls => `
    <option value="${cls.classId}">${cls.name}</option>
  `).join('');
}

// Initialize app when document is ready
document.addEventListener('DOMContentLoaded', initApp);

// Export functions that may be needed elsewhere
window.appModule = {
  showView,
  showToast,
  showLoading,
  hideLoading
};
