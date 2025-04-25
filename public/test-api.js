/**
 * API Testing Module for CleO App
 * Tests interactions between client and server endpoints
 */

const CleOApiTest = (function() {
  // Configuration
  const config = {
    apiBaseUrl: '/api',
    endpoints: {
      users: '/users',
      classes: '/classes',
      joinClass: '/joinClass',
      sessions: '/sessions',
      checkIn: '/checkIn',
      serverTime: '/getServerTime'
    },
    testUser: {
      email: 'test@example.com',
      displayName: 'Test User',
      role: 'student'
    },
    testTeacher: {
      email: 'teacher@example.com',
      displayName: 'Test Teacher',
      role: 'teacher'
    },
    testClass: {
      name: 'Test Class 101'
    },
    testSession: {
      location: { latitude: 40.7128, longitude: -74.0060 },
      radius: 100
    }
  };

  // State management
  let state = {
    currentUser: null,
    authToken: null,
    testResults: [],
    testData: {
      userId: null,
      teacherId: null,
      classId: null,
      joinCode: null,
      sessionId: null
    }
  };

  // UI elements
  let ui = {
    resultContainer: null,
    progressBar: null,
    statusText: null
  };

  /**
   * Initialize testing module
   * @param {Object} options - Configuration options
   */
  function init(options = {}) {
    // Merge options with defaults
    Object.assign(config, options);
    
    // Initialize UI
    ui.resultContainer = document.getElementById('test-results');
    ui.progressBar = document.getElementById('test-progress');
    ui.statusText = document.getElementById('test-status');
    
    // Check if Firebase is initialized
    if (typeof firebase === 'undefined') {
      logResult('ERROR', 'Firebase SDK not loaded. Make sure Firebase is initialized before running tests.');
      return false;
    }
    
    logResult('INFO', 'API Test module initialized');
    return true;
  }

  /**
   * Log a test result
   * @param {string} type - Result type (SUCCESS, ERROR, INFO)
   * @param {string} message - Result message
   * @param {Object} data - Optional data
   */
  function logResult(type, message, data = null) {
    const result = {
      type,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    state.testResults.push(result);
    
    if (ui.resultContainer) {
      const resultItem = document.createElement('div');
      resultItem.className = `test-result ${type.toLowerCase()}`;
      resultItem.innerHTML = `
        <span class="result-type">${type}</span>
        <span class="result-message">${message}</span>
        <span class="result-time">${new Date().toLocaleTimeString()}</span>
      `;
      
      if (data) {
        const dataBtn = document.createElement('button');
        dataBtn.innerText = 'View Data';
        dataBtn.className = 'data-btn';
        dataBtn.onclick = function() {
          const dataView = document.getElementById('data-view');
          if (dataView) {
            dataView.textContent = JSON.stringify(data, null, 2);
            dataView.style.display = 'block';
          }
        };
        resultItem.appendChild(dataBtn);
      }
      
      ui.resultContainer.appendChild(resultItem);
      ui.resultContainer.scrollTop = ui.resultContainer.scrollHeight;
    }
    
    console.log(`[${type}] ${message}`, data);
  }

  /**
   * Update test progress
   * @param {number} percent - Progress percentage
   * @param {string} status - Status message
   */
  function updateProgress(percent, status) {
    if (ui.progressBar) {
      ui.progressBar.value = percent;
    }
    if (ui.statusText) {
      ui.statusText.textContent = status;
    }
  }

  /**
   * Sign in with Firebase Auth
   * @returns {Promise<Object>} - User object
   */
  async function signIn() {
    try {
      updateProgress(10, 'Signing in...');
      
      // Check if already signed in
      const currentUser = firebase.auth().currentUser;
      if (currentUser) {
        state.currentUser = currentUser;
        state.authToken = await currentUser.getIdToken();
        logResult('SUCCESS', 'Already signed in', { uid: currentUser.uid, email: currentUser.email });
        return currentUser;
      }
      
      // Try sign in with popup
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        state.currentUser = result.user;
        state.authToken = await result.user.getIdToken();
        state.testData.userId = result.user.uid;
        
        logResult('SUCCESS', 'Signed in with Google', { 
          uid: result.user.uid, 
          email: result.user.email,
          displayName: result.user.displayName
        });
        
        return result.user;
      } catch (error) {
        // If popup fails, try redirect
        logResult('INFO', 'Popup sign-in failed, trying anonymous auth');
        
        // Fall back to anonymous auth for testing
        const anonResult = await firebase.auth().signInAnonymously();
        state.currentUser = anonResult.user;
        state.authToken = await anonResult.user.getIdToken();
        state.testData.userId = anonResult.user.uid;
        
        logResult('SUCCESS', 'Signed in anonymously', { uid: anonResult.user.uid });
        return anonResult.user;
      }
    } catch (error) {
      logResult('ERROR', 'Authentication failed', error);
      throw error;
    }
  }

  /**
   * Make an API request
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} data - Request data
   * @returns {Promise<Object>} - Response data
   */
  async function makeRequest(endpoint, method = 'GET', data = null) {
    try {
      // Ensure we have auth token
      if (!state.authToken && state.currentUser) {
        state.authToken = await state.currentUser.getIdToken();
      }
      
      // Prepare request options
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      };
      
      // Add auth header if available
      if (state.authToken) {
        options.headers['Authorization'] = `Bearer ${state.authToken}`;
      }
      
      // Add request body for non-GET requests
      if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
      }
      
      // Make the request
      const url = endpoint.startsWith('http') ? endpoint : config.apiBaseUrl + endpoint;
      const response = await fetch(url, options);
      
      // Parse JSON response
      let result;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        result = await response.text();
      }
      
      // Check if response is successful
      if (!response.ok) {
        throw new Error(`API error (${response.status}): ${JSON.stringify(result)}`);
      }
      
      return result;
    } catch (error) {
      logResult('ERROR', `Request failed: ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Test server time API endpoint
   * @returns {Promise<Object>} - Server time
   */
  async function testServerTime() {
    try {
      updateProgress(20, 'Testing server time endpoint...');
      const result = await makeRequest(config.endpoints.serverTime, 'GET');
      logResult('SUCCESS', 'Server time API works', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Server time API test failed', error);
      throw error;
    }
  }

  /**
   * Test user creation API endpoint
   * @param {boolean} isTeacher - Whether to create a teacher or student
   * @returns {Promise<Object>} - Created user
   */
  async function testCreateUser(isTeacher = false) {
    try {
      updateProgress(30, `Testing user creation (${isTeacher ? 'teacher' : 'student'})...`);
      
      const userData = isTeacher ? config.testTeacher : config.testUser;
      userData.email = `test_${Date.now()}@example.com`; // Make email unique
      
      const result = await makeRequest(config.endpoints.users, 'POST', userData);
      
      if (isTeacher) {
        state.testData.teacherId = state.testData.userId;
      }
      
      logResult('SUCCESS', `${isTeacher ? 'Teacher' : 'Student'} user created`, result);
      return result;
    } catch (error) {
      logResult('ERROR', 'User creation test failed', error);
      throw error;
    }
  }

  /**
   * Test class creation API endpoint
   * @returns {Promise<Object>} - Created class
   */
  async function testCreateClass() {
    try {
      updateProgress(40, 'Testing class creation...');
      
      const classData = {
        ...config.testClass,
        name: `Test Class ${Date.now().toString().substr(-4)}`
      };
      
      const result = await makeRequest(config.endpoints.classes, 'POST', classData);
      
      state.testData.classId = result.classId;
      state.testData.joinCode = result.joinCode;
      
      logResult('SUCCESS', 'Class created', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Class creation test failed', error);
      throw error;
    }
  }

  /**
   * Test join class API endpoint
   * @returns {Promise<Object>} - Join result
   */
  async function testJoinClass() {
    try {
      updateProgress(50, 'Testing class join...');
      
      if (!state.testData.joinCode) {
        throw new Error('No join code available. Create a class first.');
      }
      
      const joinData = {
        joinCode: state.testData.joinCode
      };
      
      const result = await makeRequest(config.endpoints.joinClass, 'POST', joinData);
      
      logResult('SUCCESS', 'Joined class', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Class join test failed', error);
      throw error;
    }
  }

  /**
   * Test session creation API endpoint
   * @returns {Promise<Object>} - Created session
   */
  async function testCreateSession() {
    try {
      updateProgress(60, 'Testing session creation...');
      
      if (!state.testData.classId) {
        throw new Error('No class ID available. Create a class first.');
      }
      
      const sessionData = {
        ...config.testSession,
        classId: state.testData.classId
      };
      
      const result = await makeRequest(config.endpoints.sessions, 'POST', sessionData);
      
      state.testData.sessionId = result.sessionId;
      
      logResult('SUCCESS', 'Session created', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Session creation test failed', error);
      throw error;
    }
  }

  /**
   * Test check-in API endpoint
   * @returns {Promise<Object>} - Check-in result
   */
  async function testCheckIn() {
    try {
      updateProgress(70, 'Testing check-in...');
      
      if (!state.testData.sessionId) {
        throw new Error('No session ID available. Create a session first.');
      }
      
      // Create a location near the test session location
      const location = {
        latitude: config.testSession.location.latitude + (Math.random() * 0.0001),
        longitude: config.testSession.location.longitude + (Math.random() * 0.0001)
      };
      
      const checkInData = {
        sessionId: state.testData.sessionId,
        location
      };
      
      const result = await makeRequest(config.endpoints.checkIn, 'POST', checkInData);
      
      logResult('SUCCESS', 'Check-in successful', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Check-in test failed', error);
      throw error;
    }
  }

  /**
   * Test session fetching API endpoint
   * @returns {Promise<Object>} - Sessions data
   */
  async function testGetSessions() {
    try {
      updateProgress(80, 'Testing sessions retrieval...');
      
      const result = await makeRequest(config.endpoints.sessions, 'GET');
      
      logResult('SUCCESS', 'Retrieved sessions', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Session retrieval test failed', error);
      throw error;
    }
  }

  /**
   * Test attendance fetching API endpoint
   * @returns {Promise<Object>} - Attendance data
   */
  async function testGetAttendance() {
    try {
      updateProgress(90, 'Testing attendance retrieval...');
      
      if (!state.testData.sessionId) {
        throw new Error('No session ID available. Create a session first.');
      }
      
      const endpoint = `${config.endpoints.sessions}/${state.testData.sessionId}/attendance`;
      const result = await makeRequest(endpoint, 'GET');
      
      logResult('SUCCESS', 'Retrieved attendance', result);
      return result;
    } catch (error) {
      logResult('ERROR', 'Attendance retrieval test failed', error);
      throw error;
    }
  }

  /**
   * Run all tests
   * @returns {Promise<Object>} - Test results
   */
  async function runAllTests() {
    try {
      logResult('INFO', 'Starting API tests');
      updateProgress(0, 'Starting tests...');
      
      // Sign in
      await signIn();
      
      // Test basic API
      await testServerTime();
      
      // Create teacher user
      await testCreateUser(true);
      
      // Create class
      await testCreateClass();
      
      // Create student user and join class
      await testCreateUser(false);
      await testJoinClass();
      
      // Create session
      await testCreateSession();
      
      // Test check-in
      await testCheckIn();
      
      // Get sessions
      await testGetSessions();
      
      // Get attendance
      await testGetAttendance();
      
      updateProgress(100, 'Tests completed');
      logResult('SUCCESS', 'All tests completed successfully');
      
      return {
        success: true,
        results: state.testResults,
        data: state.testData
      };
    } catch (error) {
      updateProgress(100, 'Tests failed');
      logResult('ERROR', 'Test suite failed', error);
      
      return {
        success: false,
        results: state.testResults,
        error
      };
    }
  }

  // Public API
  return {
    init,
    signIn,
    testServerTime,
    testCreateUser,
    testCreateClass,
    testJoinClass,
    testCreateSession,
    testCheckIn,
    testGetSessions,
    testGetAttendance,
    runAllTests,
    getState: () => ({ ...state })
  };
})();
