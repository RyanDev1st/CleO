// Client-side main application file for CleO attendance system

// Import only the necessary Firebase initialization function
import { getInitializedFirebase } from './js/firebase-init.js';
// Import data visualizer for real-time chart updates
import { initializeCharts, updateCharts, stopRealTimeDataListeners } from './js/data-visualizer.js'; // Corrected import

// Firebase services holder
let firebaseServices = {};
let db, auth; // Convenience variables

// Application state
const app = {
  currentUser: null,
  userProfile: null,
  isInitialized: false,
  view: {
    current: 'login',
    previous: null
  },
  visualization: {
    initialized: false,
    listenersActive: false
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
    // Wait for Firebase initialization
    firebaseServices = await getInitializedFirebase();
    if (!firebaseServices || !firebaseServices.firebase || !firebaseServices.db || !firebaseServices.auth) {
        console.error("Critical Firebase services failed to initialize. App cannot start.");
        displayError("Failed to connect to backend services. Please refresh and try again.");
        hideLoading(); // Hide loading as we can't proceed
        return; // Stop initialization
    }

    // Assign to convenience variables
    db = firebaseServices.db;
    auth = firebaseServices.auth;
    console.log('Firebase services initialized successfully in app.js.');
    console.log(`[DEBUG app.js] Received services: db=${db ? 'OK' : 'null'}, auth=${auth ? 'OK' : 'null'}`);

    // Firestore initialization is now handled by firebase-init.js
    
    // Set up authentication listener using the initialized auth service
    auth.onAuthStateChanged(async (user) => {
      console.log('Auth state changed:', user ? user.uid : 'logged out');
      app.currentUser = user;
      
      if (user) {
        try {
          console.log('User logged in, retrieving profile data for:', user.uid, user.email);
          
          // First try to get the user profile from the direct document ID
          let userDoc = await db.collection('users').doc(user.uid).get();
          let foundMethod = 'direct-uid';
          
          // If the document doesn't exist by Auth UID, try various fallback methods
          if (!userDoc.exists) {
            console.log('User document not found by direct ID, trying alternative lookup methods');
            
            // Try to find by email match first (most reliable for seeded users)
            if (user.email) {
              console.log('Searching for user profile by email:', user.email);
              const emailQuery = await db.collection('users')
                .where('email', '==', user.email)
                .limit(1)
                .get();
                
              if (!emailQuery.empty) {
                userDoc = emailQuery.docs[0];
                foundMethod = 'email-match';
                console.log(`Found user by email match: ${user.email}, doc ID: ${userDoc.id}`);
              }
            }
            
            // If still not found, look for any document where authUid field equals this user's uid
            if (!userDoc.exists) {
              console.log('Searching for user profile by authUid field');
              const authUidQuery = await db.collection('users')
                .where('authUid', '==', user.uid)
                .limit(1)
                .get();
                
              if (!authUidQuery.empty) {
                userDoc = authUidQuery.docs[0];
                foundMethod = 'authUid-field';
                console.log(`Found user by authUid field match: ${userDoc.id}`);
              }
            }
            
            // Last resort: full scan of users collection (for small datasets)
            if (!userDoc.exists) {
              console.log('Performing full scan of users collection');
              const allUsersQuery = await db.collection('users').get();
              for (const doc of allUsersQuery.docs) {
                const userData = doc.data();
                if (userData.email === user.email || userData.authUid === user.uid) {
                  userDoc = doc;
                  foundMethod = 'full-scan';
                  console.log(`Found user by full collection scan: ${doc.id}`);
                  break;
                }
              }
            }
          }
          
          if (userDoc.exists) {
            app.userProfile = userDoc.data();
            console.log(`User profile found (method: ${foundMethod}):`, app.userProfile);
            
            // Create a reference document with the Auth UID if not already exists
            // This will help future lookups be more efficient
            if (foundMethod !== 'direct-uid' && user.uid !== userDoc.id) {
              try {
                const refDocExists = await db.collection('users').doc(user.uid).get();
                if (!refDocExists.exists) {
                  console.log('Creating reference document with Auth UID for faster future lookups');
                  await db.collection('users').doc(user.uid).set({
                    uid: userDoc.id,
                    email: app.userProfile.email,
                    displayName: app.userProfile.displayName,
                    role: app.userProfile.role,
                    isReference: true,
                    original_doc_id: userDoc.id,
                    created_at: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
                  });
                  console.log('Reference document created successfully');
                }
              } catch (refError) {
                console.warn('Failed to create reference document:', refError);
                // Non-critical error, continue with login flow
              }
            }
            
            // Even if we find a user profile, check if it has all required fields
            if (!app.userProfile.displayName || !app.userProfile.role) {
              console.log('User profile is missing required fields, directing to profile setup');
              
              // Pre-fill values if they exist in the Auth user or seeded data
              const existingName = app.userProfile.displayName || user.displayName;
              const existingRole = app.userProfile.role;
              
              if (existingName) {
                const nameInput = document.getElementById('profile-name');
                if (nameInput) nameInput.value = existingName;
              }
              
              if (existingRole) {
                const roleInput = document.querySelector(`input[name="profile-role"][value="${existingRole}"]`);
                if (roleInput) roleInput.checked = true;
              } else if (user.email) {
                // Try to guess role from email
                const isTeacherEmail = user.email.includes('teacher') || 
                                      user.email.includes('professor') || 
                                      user.email.includes('faculty') ||
                                      user.email.includes('instructor');
                
                if (isTeacherEmail) {
                  const teacherRoleInput = document.querySelector('input[name="profile-role"][value="teacher"]');
                  if (teacherRoleInput) teacherRoleInput.checked = true;
                }
              }
              
              showView('profile-setup');
            } else {
              // User has a complete profile - update their profile document with latest data
              try {
                // Update any missing fields like Auth UID if necessary
                if (foundMethod !== 'direct-uid' && !app.userProfile.authUid) {
                  await db.collection('users').doc(userDoc.id).update({
                    authUid: user.uid,
                    lastLogin: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
                  });
                  console.log('Updated user document with authUid and lastLogin timestamp');
                } else {
                  // Just update lastLogin timestamp
                  await db.collection('users').doc(userDoc.id).update({
                    lastLogin: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
                  });
                  console.log('Updated lastLogin timestamp');
                }
              } catch (updateError) {
                console.warn('Non-critical error updating user document:', updateError);
              }
              
              // User has a complete profile
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
              }
            }
          } else {
            // New user, show profile setup
            console.log('No user profile found, directing to profile setup');
            showView('profile-setup');
            
            // Pre-fill the profile form with data from Firebase Auth if available
            if (user.displayName) {
              const nameInput = document.getElementById('profile-name');
              if (nameInput) nameInput.value = user.displayName;
            }
            
            // Default to student role unless the email contains 'teacher'
            if (user.email && user.email.includes('teacher')) {
              const teacherRoleInput = document.querySelector('input[name="profile-role"][value="teacher"]');
              if (teacherRoleInput) teacherRoleInput.checked = true;
            }
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
  
  if (!email || !password) {
    showToast('Please enter both email and password', 'error');
    hideLoading();
    return;
  }
  
  try {
    console.log('Attempting login for email:', email);
    
    // Check if we're using emulators
    const isUsingEmulator = localStorage.getItem('useFirebaseEmulator') === 'true';
    
    if (isUsingEmulator) {
      console.log('Using Firebase Auth emulator - implementing manual validation checks');
      
      // Firebase emulator accepts any credentials, so we need to manually check
      // if the user exists in our database first
      const emailQuery = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (emailQuery.empty) {
        console.error('Manual emulator validation: No user found with this email');
        throw new Error('No account found with this email. Please register.');
      }
      
      // In emulator mode, we would ideally check password but can't since we don't store passwords
      console.log('Emulator mode: User exists, proceeding with Auth (password not verified)');
    }
    
    // Set a timeout to prevent indefinite loading
    const loginPromise = auth.signInWithEmailAndPassword(email, password);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Login timeout: Server did not respond in time')), 10000);
    });
    
    // Race between login and timeout
    const userCredential = await Promise.race([loginPromise, timeoutPromise]);
    
    // At this point login is successful in Firebase Auth
    console.log('Firebase authentication successful');
    
    // Check if we actually got a user with credentials back from Firebase
    if (!userCredential || !userCredential.user) {
      throw new Error('Authentication successful but user data is missing');
    }
    
    // Add additional checks to ensure the user exists in our database
    const userUid = userCredential.user.uid;
    const userDoc = await db.collection('users').doc(userUid).get();
    
    // Verify user exists in our Firestore database
    if (!userDoc.exists) {
      console.error('User authenticated but no profile found in database');
      // Attempt to find user with other methods
      const emailQuery = await db.collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (emailQuery.empty) {
        // User doesn't exist in our database
        await auth.signOut(); // Sign out from Firebase auth
        throw new Error('Account exists but no user profile found. Please contact administrator.');
      }
    }
    
    console.log('Login successful - user validated in database');
    showToast('Login successful!', 'success');
  } catch (error) {
    console.error('Login error:', error);
    let errorMessage = error.message || 'Unknown error occurred';
    
    // User-friendly error messages
    if (error.code === 'auth/wrong-password') {
      errorMessage = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email. Please register.';
    } else if (error.code === 'auth/invalid-credential') {
      errorMessage = 'Invalid credentials. Please check your email and password.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Invalid email format. Please enter a valid email address.';
    } else if (error.code === 'auth/network-request-failed' || error.message.includes('timeout')) {
      errorMessage = 'Network error connecting to authentication service. Check your connection and try again.';
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
        loadClasses().then(classes => {
          populateClassDropdown(classes);
        });
      }
      
      // Initialize data visualization when admin-dashboard is accessed
      if (viewName === 'admin-dashboard' || viewName === 'admin-test') {
        initializeDataVisualization();
      }
      
      showView(viewName);
      e.preventDefault();
    }
  });
  
  // Add event listener for location permission checkbox
  const locationPermissionCheckbox = document.getElementById('location-permission');
  if (locationPermissionCheckbox) {
    locationPermissionCheckbox.addEventListener('change', function() {
      if (this.checked) {
        // Get current position when checkbox is checked
        navigator.geolocation.getCurrentPosition(
          function(position) {
            // Set the coordinates in the hidden fields
            document.getElementById('session-lat').value = position.coords.latitude;
            document.getElementById('session-lng').value = position.coords.longitude;
            console.log('Location captured successfully:', position.coords.latitude, position.coords.longitude);
            showToast('Location captured successfully!', 'success');
          },
          function(error) {
            console.error('Error getting location:', error);
            showToast('Failed to get your location. Please check your browser settings.', 'error');
            locationPermissionCheckbox.checked = false;
          },
          { enableHighAccuracy: true }
        );
      } else {
        // Clear the coordinates if checkbox is unchecked
        document.getElementById('session-lat').value = '';
        document.getElementById('session-lng').value = '';
      }
    });
  }
  
  // Add listeners for navigation changes to start/stop data visualization
  const adminNavLinks = document.querySelectorAll('[data-view="admin-dashboard"], [data-view="admin-test"]');
  adminNavLinks.forEach(link => {
    link.addEventListener('click', initializeDataVisualization);
  });
  
  // Handle visualization cleanup when leaving admin views
  const nonAdminNavLinks = document.querySelectorAll('[data-view]:not([data-view="admin-dashboard"]):not([data-view="admin-test"])');
  nonAdminNavLinks.forEach(link => {
    link.addEventListener('click', cleanupDataVisualization);
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
    // Use the initialized auth service
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    console.log('Registration successful for:', email, 'UID:', userCredential.user.uid);
    
    // Create profile data right away
    const profileData = {
      displayName: displayName,
      role: role,
      email: email,
      authUid: userCredential.user.uid,
      createdAt: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Save the profile to Firestore
    await db.collection('users').doc(userCredential.user.uid).set(profileData);
    console.log('User profile created for:', userCredential.user.uid);
    
    app.currentUser = userCredential.user; // Update current user immediately
    app.userProfile = profileData; // Set the user profile
    
    // Update UI based on role
    updateUIForAuthenticatedUser(profileData);
    if (role === 'teacher') {
      showTeacherViews();
      showView('teacher-dashboard');
    } else {
      showStudentViews();
      showView('student-dashboard');
    }
    
    showToast('Registration successful!', 'success');
  } catch (error) {
    console.error('Registration failed:', error);
    showToast(`Registration failed: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleLogout() {
  try {
    // Use the initialized auth service
    await auth.signOut();
    console.log('User logged out.');
    // Auth state listener will handle UI updates
    // updateUIForUnauthenticatedUser(); // Let auth listener handle this
    // showView('login');
  } catch (error) {
    console.error('Logout failed:', error);
    showToast('Logout failed. Please try again.', 'error');
  }
}

async function handleProfileSetup(e) {
  e.preventDefault();
  if (!app.currentUser) {
    showToast('You must be logged in to set up a profile.', 'error');
    return;
  }

  const name = document.getElementById('profile-name').value;
  const role = document.querySelector('input[name="profile-role"]:checked')?.value;

  if (!name || !role) {
    showToast('Please enter your name and select a role.', 'error');
    return;
  }

  const profileData = {
    displayName: name,
    role: role,
    email: app.currentUser.email, // Include email from Auth
    authUid: app.currentUser.uid, // Link to Auth UID
    createdAt: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
  };

  showLoading();
  try {
    // Use the initialized db service and the user's Auth UID as the document ID
    await db.collection('users').doc(app.currentUser.uid).set(profileData);
    console.log('User profile created/updated successfully:', profileData);
    app.userProfile = profileData; // Update local profile

    // Update UI and navigate to correct dashboard
    updateUIForAuthenticatedUser(profileData);
    if (role === 'teacher') {
      showTeacherViews();
      showView('teacher-dashboard');
      loadClasses();
      loadSessions();
    } else {
      showStudentViews();
      showView('student-dashboard');
      loadClasses();
      loadActiveSessions();
    }
  } catch (error) {
    console.error('Error saving profile:', error);
    showToast(`Error saving profile: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

// ---- Class Management Handlers ----

async function loadClasses() {
  if (!app.currentUser || !app.userProfile) return [];
  showLoading();
  try {
    let query;
    if (app.userProfile.role === 'teacher') {
      console.log('Loading classes for teacher:', app.currentUser.uid);
      // Use the initialized db service
      query = db.collection('classes').where('teacherUid', '==', app.currentUser.uid);
    } else { // Student
      console.log('Loading classes for student:', app.currentUser.uid);
      // Use the initialized db service
      query = db.collection('classes').where('studentUids', 'array-contains', app.currentUser.uid);
    }
    const snapshot = await query.get();
    const classes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log('Classes loaded:', classes);
    if (app.userProfile.role === 'teacher') {
      renderTeacherClasses(classes);
      populateClassDropdown(classes); // Populate dropdown for creating sessions
    } else {
      renderStudentClasses(classes);
    }
    return classes; // Explicitly return the classes array
  } catch (error) {
    console.error('Error loading classes:', error);
    showToast('Failed to load classes.', 'error');
    return []; // Return empty array on error
  } finally {
    hideLoading();
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
  if (!app.currentUser || app.userProfile?.role !== 'teacher') return;

  const className = elements.classForm['class-name'].value;
  if (!className) {
    showToast('Please enter a class name.', 'error');
    return;
  }

  const joinCode = generateJoinCode();
  const classData = {
    name: className,
    teacherUid: app.currentUser.uid,
    teacherName: app.userProfile.displayName || 'Unknown Teacher',
    studentUids: [],
    joinCode: joinCode,
    createdAt: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
  };

  showLoading();
  try {
    // Use the initialized db service
    const docRef = await db.collection('classes').add(classData);
    console.log('Class created successfully with ID:', docRef.id);
    showToast('Class created successfully!', 'success');
    elements.classForm.reset();
    loadClasses(); // Refresh class list
  } catch (error) {
    console.error('Error creating class:', error);
    showToast(`Error creating class: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleJoinClass(e) {
  e.preventDefault();
  if (!app.currentUser || app.userProfile?.role !== 'student') return;

  const joinCode = elements.joinClassForm['join-code'].value;
  if (!joinCode) {
    showToast('Please enter a join code.', 'error');
    return;
  }

  showLoading();
  try {
    // Use the initialized db service
    const query = db.collection('classes').where('joinCode', '==', joinCode).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      showToast('Invalid join code.', 'error');
      return;
    }

    const classDoc = snapshot.docs[0];
    const classId = classDoc.id;
    const classData = classDoc.data();

    if (classData.studentUids.includes(app.currentUser.uid)) {
      showToast('You are already enrolled in this class.', 'warning');
      elements.joinClassForm.reset();
      return;
    }

    // Use the initialized db and firebase services
    await db.collection('classes').doc(classId).update({
      studentUids: firebaseServices.firebase.firestore.FieldValue.arrayUnion(app.currentUser.uid)
    });

    console.log('Successfully joined class:', classId);
    showToast('Successfully joined class!', 'success');
    elements.joinClassForm.reset();
    loadClasses(); // Refresh class list
  } catch (error) {
    console.error('Error joining class:', error);
    showToast(`Error joining class: ${error.message}`, 'error');
  } finally {
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
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${cls.id}</span><br>
                  <strong>Join Code:</strong> ${cls.joinCode}<br>
                  <strong>Created:</strong> ${cls.createdAt ? new Date(cls.createdAt.toDate()).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-success btn-sm create-session-btn" data-class-id="${cls.id}" data-class-name="${cls.name}">
                  Start Session
                </button>
                <button class="btn btn-info btn-sm view-students-btn" data-class-id="${cls.id}">
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
                <span class="badge bg-secondary me-1">ID: ${cls.id}</span>
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
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${cls.id}</span><br>
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
                <span class="badge bg-secondary">ID: ${cls.id}</span>
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
  if (!app.currentUser || app.userProfile?.role !== 'teacher') return;
  showLoading();
  try {
    console.log('Loading sessions for teacher:', app.currentUser.uid);
    // Use the initialized db service
    const query = db.collectionGroup('sessions') // Query across all classes' subcollections
                    .where('teacherUid', '==', app.currentUser.uid)
                    .orderBy('startTime', 'desc'); // Order by start time descending
    const snapshot = await query.get();
    const sessions = snapshot.docs.map(doc => ({ id: doc.id, classId: doc.ref.parent.parent.id, ...doc.data() }));
    console.log('Sessions loaded:', sessions);
    renderSessions(sessions);
  } catch (error) {
    console.error('Error loading sessions:', error);
    // Specific error for collectionGroup query needing an index
    if (error.code === 'failed-precondition') {
        console.error("Firestore index missing for sessions query. See error details for link to create it.", error);
        showToast('Backend setup required: Missing Firestore index for sessions. Check console (F12) for details.', 'error', 15000); // Show longer
    } else {
        showToast('Failed to load sessions.', 'error');
    }
  } finally {
    hideLoading();
  }
}

async function loadActiveSessions() {
  if (!app.currentUser || app.userProfile?.role !== 'student') return;
  showLoading();

  // First, get the list of classes the student is enrolled in
  let studentClassIds = [];
  try {
    // Use the initialized db service
    const classQuery = db.collection('classes').where('studentUids', 'array-contains', app.currentUser.uid);
    const classSnapshot = await classQuery.get();
    studentClassIds = classSnapshot.docs.map(doc => doc.id);
    console.log('Student is enrolled in class IDs:', studentClassIds);
  } catch (error) {
    console.error('Error loading student classes for active session check:', error);
    showToast('Failed to load your classes.', 'error');
    hideLoading();
    return;
  }

  if (studentClassIds.length === 0) {
    console.log('Student is not enrolled in any classes.');
    renderStudentSessions([]); // Render empty list
    hideLoading();
    return;
  }

  try {
    console.log('Loading active sessions for student in classes:', studentClassIds);
    const now = new Date();
    let activeSessions = [];

    // Firestore doesn't support 'in' query with collectionGroup or multiple inequality filters easily.
    // We have to query sessions for each class individually.
    // For a small number of classes, this is acceptable.
    for (const classId of studentClassIds) {
        // Use the initialized db service
        const query = db.collection('classes').doc(classId).collection('sessions')
                        .where('endTime', '>', firebaseServices.firebase.firestore.Timestamp.fromDate(now)) // Session hasn't ended yet
                        .where('status', '==', 'active'); // Session is marked active

        const snapshot = await query.get();
        snapshot.docs.forEach(doc => {
            activeSessions.push({ id: doc.id, classId: classId, ...doc.data() });
        });
    }

    // Sort sessions by start time, most recent first
    activeSessions.sort((a, b) => b.startTime.toDate() - a.startTime.toDate());

    console.log('Active sessions loaded:', activeSessions);
    renderStudentSessions(activeSessions);

    // Check attendance status for each active session
    for (const session of activeSessions) {
        checkStudentAttendanceStatus(session.classId, session.id);
    }

  } catch (error) {
    console.error('Error loading active sessions:', error);
    showToast('Failed to load active sessions.', 'error');
  } finally {
    hideLoading();
  }
}

async function handleCreateSession(e) {
  e.preventDefault();
  if (!app.currentUser || app.userProfile?.role !== 'teacher') return;

  // Safely get form elements with null checking
  const classIdElement = elements.sessionForm ? elements.sessionForm['session-class-id'] : null;
  const sessionNameElement = elements.sessionForm ? elements.sessionForm['session-name'] : null;
  const durationElement = elements.sessionForm ? elements.sessionForm['session-duration'] : null;
  const latElement = elements.sessionForm ? elements.sessionForm['session-lat'] : null;
  const lngElement = elements.sessionForm ? elements.sessionForm['session-lng'] : null;
  const radiusElement = elements.sessionForm ? elements.sessionForm['session-radius'] : null;

  // Log which elements are missing to help debugging
  if (!classIdElement || !sessionNameElement || !durationElement || !latElement || !lngElement || !radiusElement) {
    console.error('Form elements missing:', {
      classIdElement: !!classIdElement,
      sessionNameElement: !!sessionNameElement,
      durationElement: !!durationElement,
      latElement: !!latElement,
      lngElement: !!lngElement,
      radiusElement: !!radiusElement
    });
    showToast('Error: Session form is missing required elements. Please refresh the page and try again.', 'error');
    return;
  }

  const classId = classIdElement.value;
  const sessionName = sessionNameElement.value;
  const durationMinutes = parseInt(durationElement.value, 10);
  // GPS settings
  const latitude = parseFloat(latElement.value);
  const longitude = parseFloat(lngElement.value);
  const radius = parseInt(radiusElement.value, 10);

  if (!classId || !sessionName || isNaN(durationMinutes) || durationMinutes <= 0) {
    showToast('Please select a class, enter a name, and set a valid duration.', 'error');
    return;
  }

  if (isNaN(latitude) || isNaN(longitude) || isNaN(radius) || radius <= 0) {
    showToast('Please enter valid GPS coordinates and radius.', 'error');
    return;
  }

  const now = new Date();
  const startTime = firebaseServices.firebase.firestore.Timestamp.fromDate(now);
  const endTime = firebaseServices.firebase.firestore.Timestamp.fromDate(new Date(now.getTime() + durationMinutes * 60000));

  const sessionData = {
    name: sessionName,
    teacherUid: app.currentUser.uid,
    startTime: startTime,
    endTime: endTime,
    status: 'active', // Mark as active initially
    location: {
        lat: latitude,
        lng: longitude,
        radius: radius
    },
    verificationMethods: ['gps'], // Default to GPS for now
    createdAt: firebaseServices.firebase.firestore.FieldValue.serverTimestamp()
  };

  showLoading();
  try {
    // Use the initialized db service
    const docRef = await db.collection('classes').doc(classId).collection('sessions').add(sessionData);
    console.log('Session created successfully with ID:', docRef.id, 'in class', classId);
    showToast('Session created successfully!', 'success');
    elements.sessionForm.reset();
    loadSessions(); // Refresh session list
  } catch (error) {
    console.error('Error creating session:', error);
    showToast(`Error creating session: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleAttendanceCheckIn(e) {
  e.preventDefault();
  if (!app.currentUser || app.userProfile?.role !== 'student') return;

  const classId = e.target.dataset.classId;
  const sessionId = e.target.dataset.sessionId;

  if (!classId || !sessionId) {
      console.error('Missing classId or sessionId for check-in');
      showToast('Error: Could not identify session for check-in.', 'error');
      return;
  }

  showLoading();
  try {
    // 1. Get Session Details (including location)
    // Use the initialized db service
    const sessionDoc = await db.collection('classes').doc(classId).collection('sessions').doc(sessionId).get();
    if (!sessionDoc.exists) {
        throw new Error('Session not found.');
    }
    const sessionData = sessionDoc.data();
    const sessionLocation = sessionData.location;

    if (!sessionLocation || typeof sessionLocation.lat !== 'number' || typeof sessionLocation.lng !== 'number' || typeof sessionLocation.radius !== 'number') {
        throw new Error('Session location data is invalid or missing.');
    }

    // 2. Get Current GPS Location
    const currentPosition = await getCurrentPosition();
    const currentLat = currentPosition.coords.latitude;
    const currentLng = currentPosition.coords.longitude;

    // 3. Verify GPS Location
    const distance = calculateDistance(
        { lat: currentLat, lng: currentLng },
        { lat: sessionLocation.lat, lng: sessionLocation.lng }
    );

    console.log(`Checking attendance for session ${sessionId}. Distance: ${distance}m, Required Radius: ${sessionLocation.radius}m`);

    if (distance > sessionLocation.radius) {
        showToast(`Check-in failed: You are too far from the required location (${distance.toFixed(0)}m away, max ${sessionLocation.radius}m allowed).`, 'error', 7000);
        hideLoading();
        return;
    }

    // 4. Mark Attendance
    const attendanceData = {
        studentUid: app.currentUser.uid,
        studentName: app.userProfile.displayName || 'Unknown Student',
        status: 'present',
        checkInTime: firebaseServices.firebase.firestore.FieldValue.serverTimestamp(),
        verificationMethod: 'gps',
        checkInLocation: {
            lat: currentLat,
            lng: currentLng,
            accuracy: currentPosition.coords.accuracy
        }
    };

    // Use the initialized db service
    await db.collection('classes').doc(classId).collection('sessions').doc(sessionId)
              .collection('attendance').doc(app.currentUser.uid).set(attendanceData, { merge: true }); // Use UID as doc ID

    console.log('Attendance marked successfully for student:', app.currentUser.uid, 'in session:', sessionId);
    showToast('Checked in successfully!', 'success');

    // Update UI for this specific session card
    updateAttendanceStatusUI(classId, sessionId, 'present');

  } catch (error) {
    console.error('Error checking in:', error);
    showToast(`Check-in failed: ${error.message}`, 'error');
  } finally {
    hideLoading();
  }
}

async function handleAttendanceCheckOut(sessionId) {
  // Placeholder for check-out functionality
  // This might involve updating the attendance record with a checkOutTime
  // Or simply be implicit when the session ends.
  // For now, we might not need an explicit student check-out button.
  console.log(`Attempting check-out for session ${sessionId} (Not implemented yet)`);
  showToast('Check-out functionality not yet implemented.', 'info');
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
                <span class="badge bg-light text-dark">${session.startTime ? new Date(session.startTime.toDate()).toLocaleString() : 'N/A'}</span>
              </div>
              <div class="card-body">
                <h5 class="card-title">${session.name}</h5>
                <p class="card-text">
                  <strong>Session ID:</strong> <span class="badge bg-secondary">${session.id}</span><br>
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${session.classId}</span><br>
                  <strong>Radius:</strong> ${session.location ? session.location.radius + ' meters' : 'N/A'}<br>
                  <strong>Attendance:</strong> <span class="attendance-count" data-session-id="${session.id}">Loading...</span>
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-danger btn-sm end-session-btn" data-session-id="${session.id}">End Session</button>
                <button class="btn btn-info btn-sm view-attendance-btn" data-session-id="${session.id}">View Attendance</button>
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
                <span class="badge bg-secondary">${session.startTime ? new Date(session.startTime.toDate()).toLocaleString() : 'N/A'}</span>
              </div>
              <div class="card-body">
                <h5 class="card-title">${session.name}</h5>
                <p class="card-text">
                  <strong>Session ID:</strong> <span class="badge bg-secondary">${session.id}</span><br>
                  <strong>Class ID:</strong> <span class="badge bg-secondary">${session.classId}</span><br>
                  <strong>Duration:</strong> ${session.endTime ? new Date(session.endTime.toDate()).toLocaleString() : 'N/A'}<br>
                  <strong>Attendance:</strong> <span class="attendance-count" data-session-id="${session.id}">Loading...</span>
                </p>
              </div>
              <div class="card-footer">
                <button class="btn btn-info btn-sm view-attendance-btn" data-session-id="${session.id}">View Attendance</button>
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
      const snapshot = await db.collection('classes').doc(sessionId).collection('sessions').doc(sessionId).collection('attendance').get();
      
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
              ${session.name} ${session.hasAttended ? (session.attendanceStatus === 'checked_out_early_before_verification' ? '(Checked Out Early)' : '(Attended)') : ''}
            </div>
            <div class="card-body">
              <h5 class="card-title">Started: ${session.startTime ? new Date(session.startTime.toDate()).toLocaleString() : 'N/A'}</h5>
              <p class="card-text">
                <strong>Session ID:</strong> <span class="badge bg-secondary">${session.id}</span><br>
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
                     data-session-id="${session.id}"
                     data-class-name="${session.name}">
                     Check In
                   </button>`
                : (session.attendanceStatus !== 'checked_out_early_before_verification'
                    ? `<div class="d-flex">
                         <button class="btn btn-success btn-sm me-2" disabled>
                           Checked In ✓
                         </button>
                         <button class="btn btn-warning btn-sm checkout-btn" data-session-id="${session.id}">
                           Check Out Early
                         </button>
                       </div>`
                    : `<button class="btn btn-secondary btn-sm" disabled>
                         Checked Out ✓
                       </button>`)
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
  const φ1 = point1.lat * Math.PI / 180;
  const φ2 = point2.lat * Math.PI / 180;
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180;
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180;
  
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
  if (!confirm('Are you sure you want to end this session? Students can no longer check in.')) {
      return;
  }
  
  showLoading();
  
  try {
      // Use the initialized db service
      await db.collection('classes').doc(sessionId).collection('sessions').doc(sessionId).update({
          status: 'ended',
          endTime: firebaseServices.firebase.firestore.FieldValue.serverTimestamp() // Optionally update end time to now
      });
      showToast('Session ended.', 'success');
      loadSessions(); // Refresh the teacher's session list
      // Students' active session list will update automatically on next load or refresh
  } catch (error) {
      console.error('Error ending session:', error);
      showToast(`Error ending session: ${error.message}`, 'error');
  } finally {
      hideLoading();
  }
}

// Show attendance for a session
async function showAttendance(sessionId) {
    console.log(`Showing attendance for session ${sessionId}`);
    showLoading();
    const attendanceModal = new bootstrap.Modal(document.getElementById('attendanceModal'));
    const modalTitle = document.getElementById('attendanceModalLabel');
    const modalBody = document.getElementById('attendanceModalBody');

    modalTitle.textContent = `Attendance for Session`;
    modalBody.innerHTML = '<p>Loading attendance data...</p>'; // Placeholder
    attendanceModal.show();

    try {
        // Use the initialized db service
        const attendanceQuery = db.collection('classes').doc(sessionId).collection('sessions').doc(sessionId)
                                .collection('attendance')
                                .orderBy('checkInTime', 'asc'); // Order by check-in time

        const snapshot = await attendanceQuery.get();
        const attendanceRecords = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (attendanceRecords.length === 0) {
            modalBody.innerHTML = '<p>No attendance records found for this session.</p>';
        } else {
            let tableHTML = `
                <table class="table table-striped table-hover">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Status</th>
                            <th>Check-in Time</th>
                            <th>Verification</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            attendanceRecords.forEach(record => {
                const checkInTime = record.checkInTime?.toDate ? record.checkInTime.toDate().toLocaleString() : 'N/A';
                tableHTML += `
                    <tr>
                        <td>${record.studentName || record.studentUid}</td>
                        <td><span class="badge bg-${record.status === 'present' ? 'success' : 'secondary'}">${record.status}</span></td>
                        <td>${checkInTime}</td>
                        <td>${record.verificationMethod || 'N/A'} ${record.verificationMethod === 'gps' ? `(~${record.checkInLocation?.accuracy?.toFixed(0)}m acc.)` : ''}</td>
                    </tr>
                `;
            });
            tableHTML += `
                    </tbody>
                </table>
            `;
            modalBody.innerHTML = tableHTML;
        }
        console.log('Attendance records loaded:', attendanceRecords);

    } catch (error) {
        console.error('Error loading attendance data:', error);
        modalBody.innerHTML = `<p class="text-danger">Error loading attendance data: ${error.message}</p>`;
        showToast('Failed to load attendance data.', 'error');
    } finally {
        hideLoading();
    }
}

async function checkStudentAttendanceStatus(classId, sessionId) {
    if (!app.currentUser) return;

    try {
        // Use the initialized db service
        const attendanceDoc = await db.collection('classes').doc(classId)
                                    .collection('sessions').doc(sessionId)
                                    .collection('attendance').doc(app.currentUser.uid)
                                    .get();

        if (attendanceDoc.exists) {
            const attendanceData = attendanceDoc.data();
            updateAttendanceStatusUI(classId, sessionId, attendanceData.status);
        } else {
            updateAttendanceStatusUI(classId, sessionId, 'absent'); // Default to absent if no record
        }
    } catch (error) {
        console.error(`Error checking attendance status for session ${sessionId}:`, error);
        // Don't show toast, just update UI to indicate error or unknown state?
        updateAttendanceStatusUI(classId, sessionId, 'error');
    }
}

function updateAttendanceStatusUI(classId, sessionId, status) {
    const sessionCard = document.querySelector(`.session-card[data-session-id="${sessionId}"][data-class-id="${classId}"]`);
    if (!sessionCard) return;

    const statusElement = sessionCard.querySelector('.attendance-status-badge');
    const checkInButton = sessionCard.querySelector('.check-in-btn');

    if (!statusElement || !checkInButton) return;

    statusElement.classList.remove('bg-success', 'bg-secondary', 'bg-warning', 'bg-danger'); // Remove existing statuses
    checkInButton.disabled = false;
    checkInButton.textContent = 'Check In';

    switch (status) {
        case 'present':
            statusElement.textContent = 'Present';
            statusElement.classList.add('bg-success');
            checkInButton.disabled = true; // Already checked in
            checkInButton.textContent = 'Checked In';
            break;
        case 'absent':
            statusElement.textContent = 'Absent';
            statusElement.classList.add('bg-secondary');
            break;
        case 'late': // If you implement late status
            statusElement.textContent = 'Late';
            statusElement.classList.add('bg-warning');
            checkInButton.disabled = true; // Or allow check-in if late is acceptable?
            checkInButton.textContent = 'Checked In (Late)';
            break;
        case 'error':
             statusElement.textContent = 'Status Error';
             statusElement.classList.add('bg-danger');
             checkInButton.disabled = true; // Disable if status unknown
             break;
        default:
            statusElement.textContent = 'Unknown';
            statusElement.classList.add('bg-secondary');
            break;
    }
    statusElement.style.display = 'inline-block'; // Make sure it's visible
}

// --- Data Visualization Functions ---

// Initialize data visualization when entering admin views
function initializeDataVisualization() {
  console.log('Initializing data visualization');
  
  if (!app.visualization.initialized) {
    // Initialize charts if not already done
    initializeCharts();
    app.visualization.initialized = true;
    console.log('Charts initialized');
  }
  
  if (!app.visualization.listenersActive) {
    // Start real-time data listeners
    startRealTimeDataListeners();
    app.visualization.listenersActive = true;
    console.log('Real-time data listeners active');
  }
  
  // Update UI elements to show visualization is active
  const visualizationStatusEl = document.getElementById('visualization-status');
  if (visualizationStatusEl) {
    visualizationStatusEl.textContent = 'Real-time data visualization active';
    visualizationStatusEl.className = 'text-success';
  }
}

// Clean up data visualization when leaving admin views
function cleanupDataVisualization() {
  console.log('Cleaning up data visualization');
  
  if (app.visualization.listenersActive) {
    // Stop real-time data listeners to prevent memory leaks and unnecessary updates
    stopRealTimeDataListeners();
    app.visualization.listenersActive = false;
    console.log('Real-time data listeners stopped');
  }
  
  // Update UI elements to show visualization is inactive
  const visualizationStatusEl = document.getElementById('visualization-status');
  if (visualizationStatusEl) {
    visualizationStatusEl.textContent = 'Real-time data visualization inactive';
    visualizationStatusEl.className = 'text-secondary';
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
  
  // Add null check to prevent "Cannot read properties of undefined (reading 'map')" error
  if (!classes || !Array.isArray(classes)) {
    console.warn('populateClassDropdown called with invalid classes data:', classes);
    dropdown.innerHTML = '<option value="">No classes available</option>';
    return;
  }
  
  dropdown.innerHTML = classes.map(cls => `
    <option value="${cls.classId || cls.id}">${cls.name}</option>
  `).join('');
}

// Register cleanup on page unload
window.addEventListener('beforeunload', function() {
  // Clean up Firebase listeners
  if (app.visualization.listenersActive) {
    stopRealTimeDataListeners();
    app.visualization.listenersActive = false;
  }
});

// Initialize app when document is ready
document.addEventListener('DOMContentLoaded', initApp);

// Export functions that may be needed elsewhere
window.appModule = {
  showView,
  showToast,
  showLoading,
  hideLoading
};
