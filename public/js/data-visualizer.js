/**
 * Data Visualizer Module
 * Handles data visualization and chart creation for the admin panel
 */

import { getFirebase } from './firebase-init.js';

// Data cache for storing real-time data between updates
const dataCache = {
  users: [],
  classes: [],
  sessions: [],
  activeUsers: {}, // Track active users by ID
  activeSessions: {} // Track active sessions by ID
};

// Unsubscribe functions for real-time listeners
let usersUnsubscribe = null;
let classesUnsubscribe = null;
let sessionsUnsubscribe = null;
let userClassesUnsubscribe = null;

/**
 * Chart configuration and visualization state
 */
const chartConfig = {
  attendance: {
    chartInstance: null,
    elementId: 'attendance-chart',
    title: 'Attendance Trends',
    type: 'line'
  },
  userGrowth: {
    chartInstance: null,
    elementId: 'user-growth-chart',
    title: 'User Growth',
    type: 'bar'
  },
  sessionDistribution: {
    chartInstance: null,
    elementId: 'session-distribution-chart',
    title: 'Session Distribution',
    type: 'pie'
  },
  // Add the chart IDs from admin-test.html
  userDistribution: {
    chartInstance: null,
    elementId: 'userDistributionChart',
    title: 'User Distribution',
    type: 'pie'
  },
  classAttendance: {
    chartInstance: null,
    elementId: 'classAttendanceChart',
    title: 'Class Attendance',
    type: 'bar'
  },
  sessionTimeline: {
    chartInstance: null,
    elementId: 'sessionTimelineChart',
    title: 'Session Timeline',
    type: 'line'
  }
};

/**
 * Initialize the data visualizer
 */
// No export needed, internal helper
function initialize() {
  // Make sure Chart.js is available
  if (!window.Chart) {
    console.error('Data Visualizer: Chart.js is not loaded. Data visualization will not work.');
    return false;
  }
  
  // Set Chart.js global defaults for consistent styling
  if (Chart.defaults) {
    Chart.defaults.font.family = "'Poppins', 'Helvetica', sans-serif";
    Chart.defaults.color = '#555';
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
  }
  
  return true;
}

/**
 * Initialize the charts for the admin panel
 * This is the main entry point for chart initialization
 */
export function initializeCharts() { // Added export
  console.log("Data Visualizer: Initializing charts...");
  if (!initialize()) {
    console.error("Data Visualizer: Failed to initialize charts. Chart.js is not available.");
    return false;
  }
  
  try {
    // Create empty charts first with placeholder data
    createUserDistributionChart([1,1,1], ['Teachers', 'Students', 'Admins']);
    createClassAttendanceChart(['Loading...'], [0]);
    createSessionTimelineChart(['Loading...'], [0]);
    
    // Start real-time data listener
    startRealTimeDataListeners();
    
    console.log("Data Visualizer: Charts initialized successfully");
    return true;
  } catch (error) {
    console.error("Data Visualizer: Error initializing charts:", error);
    return false;
  }
}

/**
 * Start real-time data listeners for users, classes, and sessions
 */
// No export needed, called by initializeCharts
function startRealTimeDataListeners() {
  const { db, permissionDenied } = getFirebase();

  // If we already know permissions are denied or db is not available,
  // use mock data instead of trying to set up listeners
  if (permissionDenied || !db) {
    console.log("Data Visualizer: Permission denied or db not available - using mock data instead of listeners");
    useMockDataForCharts();
    return;
  }

  try {
    console.log("Data Visualizer: Starting real-time data listeners...");

    // Listen for user changes with error handling
    try {
      usersUnsubscribe = db.collection('users').onSnapshot((snapshot) => {
        dataCache.users = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Update user distribution chart
        updateUserDistributionChart();
        
        console.log(`Data Visualizer: Real-time update - ${dataCache.users.length} users`);
      }, (error) => {
        console.error("Data Visualizer: Error in users real-time listener:", error);
        if (error.code === 'permission-denied') {
          console.log("Data Visualizer: Permission denied for users - falling back to mock data");
          useMockDataForCharts(); // Fallback if this listener fails
        }
      });
    } catch (userError) {
      console.error("Data Visualizer: Failed to set up user listener:", userError);
    }
    
    // Listen for classes changes with error handling
    try {
      classesUnsubscribe = db.collection('classes').onSnapshot((snapshot) => {
        const updatedClassesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
          // Enrollment count is handled by the userClasses listener
        }));

        // Create a map for efficient lookup and update
        const updatedClassMap = new Map(updatedClassesData.map(cls => [cls.id, cls]));

        // Update existing classes in the cache or add new ones, preserving enrollment count
        dataCache.classes = dataCache.classes.map(cachedClass => {
            if (updatedClassMap.has(cachedClass.id)) {
                // Update existing class data, keep the existing enrollment count
                const updatedData = updatedClassMap.get(cachedClass.id);
                updatedClassMap.delete(cachedClass.id); // Mark as processed
                return { ...updatedData, enrollmentCount: cachedClass.enrollmentCount || 0 };
            }
            // Class was removed from Firestore
            return null;
        }).filter(cls => cls !== null); // Filter out removed classes

        // Add any brand new classes (those remaining in the map)
        updatedClassMap.forEach(newClass => {
            dataCache.classes.push({ ...newClass, enrollmentCount: 0 }); // Initialize count
        });

        // Do NOT update the class attendance chart here.
        // The userClasses listener is responsible for updating enrollment counts
        // and triggering the chart update via processUserClassesData.

        console.log(`Data Visualizer: Real-time update - ${dataCache.classes.length} classes`);
      }, (error) => {
        console.error("Data Visualizer: Error in classes real-time listener:", error);
        if (error.code === 'permission-denied') {
          console.log("Data Visualizer: Permission denied for classes - falling back to mock data");
          useMockDataForCharts(); // Fallback if this listener fails
        }
      });
    } catch (classError) {
      console.error("Data Visualizer: Failed to set up class listener:", classError);
    }
    
    // Listen for session changes with error handling
    try {
      sessionsUnsubscribe = db.collection('sessions').onSnapshot((snapshot) => {
        dataCache.sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Track active sessions
        updateActiveSessionsTracking();
        
        // Update session timeline chart
        updateSessionTimelineChart();
        
        console.log(`Data Visualizer: Real-time update - ${dataCache.sessions.length} sessions`);
      }, (error) => {
        console.error("Data Visualizer: Error in sessions real-time listener:", error);
        if (error.code === 'permission-denied') {
          console.log("Data Visualizer: Permission denied for sessions - falling back to mock data");
          useMockDataForCharts(); // Fallback if this listener fails
        }
      });
    } catch (sessionError) {
      console.error("Data Visualizer: Failed to set up session listener:", sessionError);
    }
    
    // Listen for userClasses to track class enrollment with error handling
    try {
      userClassesUnsubscribe = db.collection('userClasses').onSnapshot((snapshot) => {
        const userClasses = snapshot.docs.map(doc => ({
          userId: doc.id, // Assuming doc ID is userId
          classes: doc.data().classes || {} // Get the map of classes for this user
        }));
        
        // Process user classes data to update class enrollment counts
        processUserClassesData(userClasses); // This function will update counts and the chart
        
        console.log(`Data Visualizer: Real-time update - processed user-class relationships`);
      }, (error) => {
        console.error("Data Visualizer: Error in userClasses real-time listener:", error);
        if (error.code === 'permission-denied') {
          console.log("Data Visualizer: Permission denied for userClasses. Enrollment counts might be inaccurate.");
          // Don't necessarily fall back to mock data here, other listeners might still work.
          // Consider updating the chart with potentially stale/zero counts or showing a warning.
          // For now, we let processUserClassesData handle the update with available data.
           processUserClassesData([]); // Process with empty data to potentially clear counts
        }
      });
    } catch (userClassesError) {
      console.error("Data Visualizer: Failed to set up userClasses listener:", userClassesError);
    }
    
  } catch (error) {
    console.error("Data Visualizer: Error setting up real-time listeners:", error);
    // If any major error occurs during setup, fall back to mock data
    useMockDataForCharts();
  }
}

/**
 * Process user classes data to enhance class attendance information
 * This function now expects an array of user documents, each containing a 'classes' map.
 */
export function processUserClassesData(userClassesDocs) {
  // Create a map of class IDs to a Set of enrolled student user IDs
  const classEnrollment = new Map(); // Use Map for better performance

  userClassesDocs.forEach(userDoc => {
    const userId = userDoc.userId;
    const classesMap = userDoc.classes; // e.g., { classId1: { joinDate: ... }, classId2: {...} }
    const userRole = dataCache.users.find(u => u.id === userId)?.role; // Check user role

    // Only count students towards enrollment
    if (userId && userRole === 'student' && typeof classesMap === 'object') {
      Object.keys(classesMap).forEach(classId => {
        if (!classEnrollment.has(classId)) {
          classEnrollment.set(classId, new Set());
        }
        classEnrollment.get(classId).add(userId);
      });
    }
  });

  // Update enrollment counts in the main dataCache.classes array
  let countsChanged = false;
  // Ensure all classes currently in the cache have an enrollment count initialized
  dataCache.classes.forEach(classItem => {
    if (classItem.enrollmentCount === undefined) {
        classItem.enrollmentCount = 0; // Initialize if missing
    }
    const enrolledStudents = classEnrollment.get(classItem.id);
    const newCount = enrolledStudents ? enrolledStudents.size : 0;
    if (classItem.enrollmentCount !== newCount) {
        classItem.enrollmentCount = newCount;
        countsChanged = true;
        console.log(`Data Visualizer: Updated enrollment count for class ${classItem.id} to ${newCount}`);
    }
  });

  // Update the class attendance chart ONLY if counts actually changed
  if (countsChanged) {
      console.log("Data Visualizer: Enrollment counts updated via userClasses listener. Updating chart.");
      updateClassAttendanceChart();
  } else {
      console.log("Data Visualizer: Enrollment counts checked, no changes detected.");
      // Optionally force update if the chart is empty but classes exist
      if (chartConfig.classAttendance.chartInstance && dataCache.classes.length > 0 && !chartConfig.classAttendance.chartInstance.data.labels?.length) {
          console.log("Data Visualizer: Forcing chart update as it was empty.");
          updateClassAttendanceChart();
      }
  }
}

/**
 * Update active sessions tracking
 */
export function updateActiveSessionsTracking() {
  const now = new Date();
  dataCache.activeSessions = {};
  
  console.log("Data Visualizer: Checking active status for", dataCache.sessions.length, "sessions");
  
  dataCache.sessions.forEach(session => {
    // Check explicit status field first (if it exists)
    const explicitStatus = session.status;
    if (explicitStatus && explicitStatus.toLowerCase() === 'active') {
      dataCache.activeSessions[session.id] = session;
      console.log(`Data Visualizer: Session ${session.id} explicitly marked active via status field`);
      return;
    }

    // Next check the start and end times
    let startTime = null;
    let endTime = null;
    
    // Handle startTime (try all possible formats and properties)
    if (session.startTime) {
      if (session.startTime.toDate) {
        startTime = session.startTime.toDate(); 
      } else if (session.startTime.seconds) {
        startTime = new Date(session.startTime.seconds * 1000);
      } else {
        startTime = new Date(session.startTime);
      }
    } else if (session.start_time) {
      if (session.start_time.toDate) {
        startTime = session.start_time.toDate();
      } else if (session.start_time.seconds) {
        startTime = new Date(session.start_time.seconds * 1000);
      } else {
        startTime = new Date(session.start_time);
      }
    } else {
      // No start time available, assume past start
      startTime = new Date(0); // Long time ago
    }
    
    // Handle endTime (try all possible formats and properties)
    let hasEndTime = false;
    if (session.endTime) {
      hasEndTime = true;
      if (session.endTime.toDate) {
        endTime = session.endTime.toDate();
      } else if (session.endTime.seconds) {
        endTime = new Date(session.endTime.seconds * 1000);
      } else {
        endTime = new Date(session.endTime);
      }
    } else if (session.end_time) {
      hasEndTime = true;
      if (session.end_time.toDate) {
        endTime = session.end_time.toDate();
      } else if (session.end_time.seconds) {
        endTime = new Date(session.end_time.seconds * 1000);
      } else {
        endTime = new Date(session.end_time);
      }
    }
    
    // No end time means the session is still active
    if (!hasEndTime) {
      dataCache.activeSessions[session.id] = session;
      console.log(`Data Visualizer: Session ${session.id} active (no end time)`);
      return;
    }

    // If end time is in the future, session is active
    const isActive = startTime <= now && (!endTime || endTime > now);
    
    if (isActive) {
      dataCache.activeSessions[session.id] = session;
      console.log(`Data Visualizer: Session ${session.id} active (start: ${startTime.toLocaleString()}, end: ${endTime ? endTime.toLocaleString() : 'none'})`);
    }
  });
  
  console.log(`Data Visualizer: Found ${Object.keys(dataCache.activeSessions).length} active sessions out of ${dataCache.sessions.length} total`);
}

/**
 * Stop real-time data listeners
 */
export function stopRealTimeDataListeners() { // Added export
  if (usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
  }
  
  if (classesUnsubscribe) {
    classesUnsubscribe();
    classesUnsubscribe = null;
  }
  
  if (sessionsUnsubscribe) {
    sessionsUnsubscribe();
    sessionsUnsubscribe = null;
  }
  
  if (userClassesUnsubscribe) {
    userClassesUnsubscribe();
    userClassesUnsubscribe = null;
  }
}

/**
 * Get user counts by role
 */
export function getUserCounts({ users }) {
  const counts = {
    teachers: 0,
    students: 0,
    admins: 0
  };
  
  users.forEach(user => {
    if (user.role === 'teacher') counts.teachers++;
    else if (user.role === 'student') counts.students++;
    else if (user.role === 'admin') counts.admins++;
  });
  
  return counts;
}

/**
 * Get attendance counts for classes
 */
export function getAttendanceCounts({ classes }) {
  const classNames = [];
  const attendanceCounts = [];
  
  classes.forEach(classItem => {
    classNames.push(classItem.name || 'Unnamed Class');
    
    // Use the enrollmentCount property we calculated in processUserClassesData
    const count = classItem.enrollmentCount || 0;
    
    attendanceCounts.push(count);
  });
  
  return { classNames, attendanceCounts };
}

/**
 * Update user distribution chart with real-time data
 */
export function updateUserDistributionChart() {
  const userCounts = getUserCounts({ users: dataCache.users });
  
  // Calculate active users by role
  const activeUserCounts = {
    teachers: 0,
    students: 0,
    admins: 0
  };
  
  // Count active users (can be enhanced with your actual activity tracking logic)
  Object.values(dataCache.activeUsers).forEach(user => {
    if (user.role === 'teacher') activeUserCounts.teachers++;
    else if (user.role === 'student') activeUserCounts.students++;
    else if (user.role === 'admin') activeUserCounts.admins++;
  });
  
  createUserDistributionChart(
    [userCounts.teachers, userCounts.students, userCounts.admins],
    ['Teachers', 'Students', 'Admins'],
    {
      plugins: {
        title: {
          text: `User Distribution (Total: ${dataCache.users.length})`
        },
        subtitle: {
          display: true,
          text: `Active Users: ${Object.keys(dataCache.activeUsers).length}`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw || 0;
              const total = userCounts.teachers + userCounts.students + userCounts.admins;
              const percentage = Math.round((value / total) * 100);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      }
    }
  );
}

/**
 * Update class attendance chart with real-time data
 */
export function updateClassAttendanceChart() {
  console.log("Data Visualizer: Attempting to update Class Attendance Chart. Cached classes:", dataCache.classes);
  if (dataCache.classes.length === 0) {
    console.log("Data Visualizer: No classes in cache, showing 'No Classes'.");
    createClassAttendanceChart(['No Classes'], [0], {
      plugins: {
        title: {
          text: 'Class Enrollment (No Classes Available)'
        }
      }
    });
    return;
  }

  const attendanceCounts = getAttendanceCounts({ classes: dataCache.classes });
  console.log("Data Visualizer: Calculated attendance counts:", attendanceCounts);

  if (attendanceCounts.classNames.length === 0) {
      console.log("Data Visualizer: No class names found, showing 'No Classes'.");
       createClassAttendanceChart(['No Classes'], [0], {
         plugins: {
           title: {
             text: 'Class Enrollment (No Classes Found)'
           }
         }
       });
       return;
  }

  // Sort classes by attendance count (descending)
  const sortedIndices = attendanceCounts.attendanceCounts
    .map((count, index) => ({ count, index }))
    .sort((a, b) => b.count - a.count)
    .map(item => item.index);

  const sortedClassNames = sortedIndices.map(i => attendanceCounts.classNames[i]);
  const sortedAttendanceCounts = sortedIndices.map(i => attendanceCounts.attendanceCounts[i]);

  // Limit to top 10 classes if there are many
  const limit = 10;
  let classNames = sortedClassNames;
  let counts = sortedAttendanceCounts;

  if (sortedClassNames.length > limit) {
    classNames = sortedClassNames.slice(0, limit);
    counts = sortedAttendanceCounts.slice(0, limit);
    console.log(`Data Visualizer: Limiting class chart to top ${limit} classes.`);
  }

  console.log("Data Visualizer: Final data for class chart - Labels:", classNames, "Data:", counts);
  createClassAttendanceChart(classNames, counts, {
    plugins: {
      title: {
        text: `Class Enrollment (Top ${classNames.length} of ${dataCache.classes.length})`
      }
    }
  });
}

/**
 * Update session timeline chart with real-time data
 */
export function updateSessionTimelineChart() {
  if (dataCache.sessions.length === 0) {
    createSessionTimelineChart(['No Data'], [0], {
      plugins: {
        title: {
          text: 'Session Timeline (No Sessions Available)'
        }
      }
    });
    return;
  }
  
  console.log(`Data Visualizer: Updating session timeline chart with ${dataCache.sessions.length} total sessions`);
  
  const sessionsByDate = {};
  const activeSessionsByDate = {};
  
  // Current date for active session check
  const now = new Date();
  
  // Process session data
  dataCache.sessions.forEach(session => {
    let dateLabel = 'Unknown Date';
    let startDate = null;
    
    // Determine start time & date label
    if (session.startTime) {
      if (session.startTime.toDate) {
        startDate = session.startTime.toDate();
      } else if (session.startTime.seconds) {
        startDate = new Date(session.startTime.seconds * 1000);
      } else {
        startDate = new Date(session.startTime);
      }
    } else if (session.start_time) {
      if (session.start_time.toDate) {
        startDate = session.start_time.toDate();
      } else if (session.start_time.seconds) {
        startDate = new Date(session.start_time.seconds * 1000);
      } else {
        startDate = new Date(session.start_time);
      }
    }

    if (startDate && !isNaN(startDate.getTime())) {
      dateLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    // Count this session in total sessions for this date
    sessionsByDate[dateLabel] = (sessionsByDate[dateLabel] || 0) + 1;
    
    // Use the active sessions cache to check if this session is active
    if (dataCache.activeSessions[session.id]) {
      activeSessionsByDate[dateLabel] = (activeSessionsByDate[dateLabel] || 0) + 1;
    }
  });
  
  // Get sorted date labels (chronological order)
  const allDates = Object.keys(sessionsByDate);
  allDates.sort((a, b) => {
    // Handle "Unknown Date" specially
    if (a === 'Unknown Date') return -1;
    if (b === 'Unknown Date') return 1;
    
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateA - dateB;
  });
  
  // Get total session counts and active session counts
  const totalCounts = allDates.map(date => sessionsByDate[date] || 0);
  const activeCounts = allDates.map(date => activeSessionsByDate[date] || 0);
  
  // Count active sessions
  const totalActiveSessions = Object.keys(dataCache.activeSessions).length;
  
  console.log(`Data Visualizer: Identified ${totalActiveSessions} active sessions for chart`);
  console.log(`Data Visualizer: Session counts by date:`, sessionsByDate);
  console.log(`Data Visualizer: Active session counts by date:`, activeSessionsByDate);
  
  // Create dataset for chart
  const datasets = [
    {
      label: 'Total Sessions',
      data: totalCounts,
      borderColor: 'rgb(65, 105, 225)',
      backgroundColor: 'rgba(65, 105, 225, 0.1)',
      borderWidth: 2,
      fill: true
    },
    {
      label: 'Active Sessions',
      data: activeCounts,
      borderColor: 'rgb(46, 204, 113)',
      backgroundColor: 'rgba(46, 204, 113, 0.1)',
      borderWidth: 2,
      fill: true
    }
  ];
  
  createSessionTimelineChart(allDates, datasets, {
    plugins: {
      title: {
        display: true,
        text: `Session Timeline (Total: ${dataCache.sessions.length}, Active: ${totalActiveSessions})`
      }
    }
  });
}

/**
 * Process data to normalize field names for charts
 * Handles both snake_case and camelCase field names
 * @param {Object} data - The data object containing sessions, users, etc.
 * @returns {Object} Normalized data object
 */
export function normalizeDataFields(data) {
  const normalized = { ...data };
  
  // Process sessions
  if (Array.isArray(normalized.sessions)) {
    normalized.sessions = normalized.sessions.map(session => {
      const normalizedSession = { ...session };
      
      // Normalize session field names - handle both naming conventions
      if (normalizedSession.start_time && !normalizedSession.startTime) {
        normalizedSession.startTime = normalizedSession.start_time;
      } else if (normalizedSession.startTime && !normalizedSession.start_time) {
        normalizedSession.start_time = normalizedSession.startTime;
      }
      
      if (normalizedSession.end_time && !normalizedSession.endTime) {
        normalizedSession.endTime = normalizedSession.end_time;
      } else if (normalizedSession.endTime && !normalizedSession.end_time) {
        normalizedSession.end_time = normalizedSession.endTime;
      }
      
      if (normalizedSession.class_id && !normalizedSession.classId) {
        normalizedSession.classId = normalizedSession.class_id;
      } else if (normalizedSession.classId && !normalizedSession.class_id) {
        normalizedSession.class_id = normalizedSession.classId;
      }
      
      if (normalizedSession.teacher_id && !normalizedSession.teacherId) {
        normalizedSession.teacherId = normalizedSession.teacher_id;
      } else if (normalizedSession.teacherId && !normalizedSession.teacher_id) {
        normalizedSession.teacher_id = normalizedSession.teacherId;
      }
      
      if (normalizedSession.attendance_ids && !normalizedSession.attendanceIds) {
        normalizedSession.attendanceIds = normalizedSession.attendance_ids;
      } else if (normalizedSession.attendanceIds && !normalizedSession.attendance_ids) {
        normalizedSession.attendance_ids = normalizedSession.attendanceIds;
      }
      
      if (normalizedSession.created_at && !normalizedSession.createdAt) {
        normalizedSession.createdAt = normalizedSession.created_at;
      } else if (normalizedSession.createdAt && !normalizedSession.created_at) {
        normalizedSession.created_at = normalizedSession.createdAt;
      }
      
      return normalizedSession;
    });
  }
  
  // Process classes
  if (Array.isArray(normalized.classes)) {
    normalized.classes = normalized.classes.map(classItem => {
      const normalizedClass = { ...classItem };
      
      // Normalize class field names - handle both naming conventions
      if (normalizedClass.teacher_id && !normalizedClass.teacherId) {
        normalizedClass.teacherId = normalizedClass.teacher_id;
      } else if (normalizedClass.teacherId && !normalizedClass.teacher_id) {
        normalizedClass.teacher_id = normalizedClass.teacherId;
      }
      
      if (normalizedClass.join_code && !normalizedClass.joinCode) {
        normalizedClass.joinCode = normalizedClass.join_code;
      } else if (normalizedClass.joinCode && !normalizedClass.join_code) {
        normalizedClass.join_code = normalizedClass.joinCode;
      }
      
      if (normalizedClass.student_ids && !normalizedClass.studentIds) {
        normalizedClass.studentIds = normalizedClass.student_ids;
      } else if (normalizedClass.studentIds && !normalizedClass.student_ids) {
        normalizedClass.student_ids = normalizedClass.studentIds;
      }
      
      if (normalizedClass.created_at && !normalizedClass.createdAt) {
        normalizedClass.createdAt = normalizedClass.created_at;
      } else if (normalizedClass.createdAt && !normalizedClass.created_at) {
        normalizedClass.created_at = normalizedClass.createdAt;
      }
      
      // Calculate enrollment count if student_ids or studentIds is available
      const studentIds = normalizedClass.student_ids || normalizedClass.studentIds || [];
      if (Array.isArray(studentIds)) {
        normalizedClass.enrollmentCount = studentIds.length;
      }
      
      return normalizedClass;
    });
  }
  
  return normalized;
}

/**
 * Update charts with generated or filtered data
 * @param {Object} data - The data object containing users, classes, sessions, etc.
 */
export function updateCharts(data) { // Added export
  if (!data) {
    console.error("Data Visualizer: No data provided for chart updates");
    return;
  }
  
  // Make sure required chart canvases exist
  const userChartCanvas = document.getElementById(chartConfig.userDistribution.elementId);
  const classChartCanvas = document.getElementById(chartConfig.classAttendance.elementId);
  const sessionChartCanvas = document.getElementById(chartConfig.sessionTimeline.elementId);
  
  if (!userChartCanvas || !classChartCanvas || !sessionChartCanvas) {
    console.warn("Data Visualizer: One or more chart canvases not found in the DOM");
    return; // Exit early if canvases aren't found
  }
  
  console.log("Data Visualizer: Updating charts with data:", {
    users: (data.users?.length || 0) + (data.teachers?.length || 0) + (data.students?.length || 0) + (data.admin ? 1 : 0),
    classes: data.classes?.length || 0, 
    sessions: data.sessions?.length || 0
  });
  
  // Process and normalize the data for our charts
  // We may receive data in different formats from different sources
  let processedData = {
    users: [],
    classes: [],
    sessions: []
  };
  
  // Process users data (handle different possible formats)
  if (Array.isArray(data.users)) {
    processedData.users = [...data.users];
  }
  
  // Add admin user if it exists separately
  if (data.admin) {
    // Handle both array and single object
    if (Array.isArray(data.admin)) {
      processedData.users.push(...data.admin.map(user => ({...user, role: 'admin'})));
    } else {
      processedData.users.push({...data.admin, role: 'admin'});
    }
  }
  
  // Add teachers if they exist separately
  if (Array.isArray(data.teachers)) {
    processedData.users.push(...data.teachers.map(user => ({...user, role: 'teacher'})));
  }
  
  // Add students if they exist separately
  if (Array.isArray(data.students)) {
    processedData.users.push(...data.students.map(user => ({...user, role: 'student'})));
  }
  
  // Process classes data
  if (Array.isArray(data.classes)) {
    processedData.classes = [...data.classes];
  }
  
  // Process sessions data
  if (Array.isArray(data.sessions)) {
    processedData.sessions = [...data.sessions];
  }
  
  // Normalize field names to handle both camelCase and snake_case
  processedData = normalizeDataFields(processedData);
  
  // Update our data cache with the processed data
  dataCache.users = processedData.users;
  dataCache.classes = processedData.classes;
  dataCache.sessions = processedData.sessions;
  
  // Update active sessions tracking
  updateActiveSessionsTracking();
  
  // Force redraw all charts with the processed data
  const userCounts = getUserCounts({ users: dataCache.users });
  
  // User distribution chart
  createUserDistributionChart(
    [userCounts.teachers, userCounts.students, userCounts.admins],
    ['Teachers', 'Students', 'Admins'],
    {
      plugins: {
        title: {
          text: `User Distribution (Total: ${dataCache.users.length})`
        }
      }
    }
  );
  
  // Class attendance chart
  if (dataCache.classes.length > 0) {
    const { classNames, attendanceCounts } = getAttendanceCounts({ classes: dataCache.classes });
    createClassAttendanceChart(classNames, attendanceCounts, {
      plugins: {
        title: {
          text: `Class Enrollment (Total Classes: ${dataCache.classes.length})`
        }
      }
    });
  } else {
    createClassAttendanceChart(['No Classes'], [0]);
  }
  
  // Session timeline chart
  if (dataCache.sessions.length > 0) {
    // Process session data using the same logic as updateSessionTimelineChart
    const sessionsByDate = {};
    const activeSessionsByDate = {};
    
    // Current date for active session check
    const now = new Date();
    
    // Process session data
    dataCache.sessions.forEach(session => {
      let dateLabel = 'Unknown Date';
      
      // Handle both startTime and start_time formats
      const startTimeValue = session.startTime || session.start_time;
      
      if (startTimeValue) {
        let startDate;
        // Convert to Date object depending on the format
        if (typeof startTimeValue === 'string') {
          startDate = new Date(startTimeValue);
        } else if (startTimeValue.toDate) {
          // Firebase Timestamp
          startDate = startTimeValue.toDate();
        } else if (startTimeValue.seconds) {
          // Firebase Timestamp without toDate method
          startDate = new Date(startTimeValue.seconds * 1000);
        } else {
          // Try to use as a date directly
          startDate = new Date(startTimeValue);
        }
        
        if (!isNaN(startDate.getTime())) {
          dateLabel = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          
          // Count this session in total sessions for this date
          sessionsByDate[dateLabel] = (sessionsByDate[dateLabel] || 0) + 1;
        }
      }
    });
    
    // Get sorted date labels (chronological order)
    const allDates = Object.keys(sessionsByDate);
    allDates.sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateA - dateB;
    });
    
    const totalCounts = allDates.map(date => sessionsByDate[date] || 0);
    
    // Create dataset for chart
    createSessionTimelineChart(allDates, totalCounts, {
      plugins: {
        title: {
          text: `Session Timeline (Total Sessions: ${dataCache.sessions.length})`
        }
      }
    });
  } else {
    createSessionTimelineChart(['No Data'], [0]);
  }
  
  console.log("Data Visualizer: Charts updated with new data", {
    processedUsers: processedData.users.length,
    processedClasses: processedData.classes.length,
    processedSessions: processedData.sessions.length
  });
}

/**
 * Force refresh all chart data, particularly ensuring all sessions are loaded
 * This function is crucial for ensuring the session chart displays all sessions
 * @returns {Promise<boolean>} Promise that resolves to true on success, false on failure
 */
export async function forceRefreshCharts() {
  console.log("Data Visualizer: Force refreshing all charts to ensure complete data...");
  try {
    const { firebase } = getFirebase();
    if (!firebase || !firebase.firestore) {
      console.error("Firestore instance is not available for force refresh.");
      return false;
    }

    const db = firebase.firestore();
    console.log("Data Visualizer: Fetching all sessions for chart refresh...");
    
    // Fetch ALL sessions in a single query to ensure we have everything
    const sessionsSnapshot = await db.collection('sessions').get();
    console.log(`Data Visualizer: Force refresh found ${sessionsSnapshot.size} total sessions`);
    
    if (sessionsSnapshot.empty) {
      console.log("Data Visualizer: No sessions found in the database during force refresh");
      // Update the chart with empty data
      dataCache.sessions = [];
      updateSessionTimelineChart();
      return true; // Successfully determined there are no sessions
    }
    
    // Process all the session data
    dataCache.sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Update active sessions tracking
    updateActiveSessionsTracking();
    
    // Update session timeline chart
    updateSessionTimelineChart();
    
    console.log(`Data Visualizer: Force refresh completed successfully with ${dataCache.sessions.length} sessions`);
    return true;
  } catch (error) {
    console.error("Data Visualizer: Error during force refresh:", error);
    return false;
  }
}

/**
 * Fetch all sessions directly from Firestore
 * @returns {Promise<Array>} Promise that resolves to an array of session objects
 */
export async function fetchAllSessions() {
  console.log("Data Visualizer: Fetching all sessions directly...");
  try {
    const { firebase } = getFirebase();
    if (!firebase || !firebase.firestore) {
      console.error("Firestore instance is not available for fetching sessions.");
      return [];
    }

    const db = firebase.firestore();
    const sessionsSnapshot = await db.collection('sessions').get();
    
    if (sessionsSnapshot.empty) {
      console.log("Data Visualizer: No sessions found in the database");
      return [];
    }
    
    const sessions = sessionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Data Visualizer: Successfully fetched ${sessions.length} sessions directly`);
    return sessions;
  } catch (error) {
    console.error("Data Visualizer: Error fetching all sessions:", error);
    return [];
  }
}

/**
 * Get active sessions from the cache
 * @returns {Array} Array of active session objects
 */
export function getActiveSessions() {
  return Object.values(dataCache.activeSessions);
}

/**
 * Create user distribution chart
 * @param {Array} data - Data values for user types
 * @param {Array} labels - Labels for each user type
 * @param {Object} options - Additional chart options
 */
export function createUserDistributionChart(data, labels, options = {}) {
  const chartInfo = chartConfig.userDistribution;
  const ctx = document.getElementById(chartInfo.elementId);
  
  if (!ctx) {
    console.warn(`Data Visualizer: Cannot find chart element with ID "${chartInfo.elementId}"`);
    return;
  }
  
  console.log(`Data Visualizer: Creating user distribution chart with data:`, data);
  
  // Destroy existing chart if it exists
  if (chartInfo.chartInstance) {
    chartInfo.chartInstance.destroy();
  }
  
  // Create chart
  chartInfo.chartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)', // Teachers (Pink)
          'rgba(54, 162, 235, 0.7)',  // Students (Blue)
          'rgba(255, 206, 86, 0.7)'   // Admins (Yellow)
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)'
        ],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        title: {
          display: true,
          text: options.plugins?.title?.text || chartInfo.title
        },
        ...options.plugins
      }
    }
  });
  
  console.log("Data Visualizer: User distribution chart created/updated");
}

/**
 * Create class attendance chart
 * @param {Array} labels - Class names
 * @param {Array} data - Attendance counts
 * @param {Object} options - Additional chart options
 */
export function createClassAttendanceChart(labels, data, options = {}) {
  const chartInfo = chartConfig.classAttendance;
  const ctx = document.getElementById(chartInfo.elementId);

  if (!ctx) {
      console.error(`Data Visualizer: Canvas element with ID '${chartInfo.elementId}' not found.`);
      return;
  }

  console.log(`Data Visualizer: Creating/Updating class attendance chart with labels:`, labels, `and data:`, data);

  // Destroy existing chart if it exists
  if (chartInfo.chartInstance) {
      console.log("Data Visualizer: Destroying existing class attendance chart instance.");
      chartInfo.chartInstance.destroy();
      chartInfo.chartInstance = null;
  }

  // Generate vibrant color palette for each bar with higher opacity for better visibility
  const backgroundColors = data.map((_, i) => {
    // Simple color generation, can be made more sophisticated
    const hue = (i * 360 / (data.length || 1)) % 360;
    return `hsla(${hue}, 75%, 60%, 0.8)`; // Use HSLA for opacity
  });
  const borderColors = backgroundColors.map(color => color.replace('0.8', '1')); // Solid border

  // Create chart
  try {
      chartInfo.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Number of Students Enrolled',
            data: data,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
            borderWidth: 1
          }]
        },
        options: {
          indexAxis: 'y', // Display bars horizontally for better readability with long names
          responsive: true,
          maintainAspectRatio: false, // Allow chart to fill container height
          scales: {
            x: {
              beginAtZero: true,
              title: {
                  display: true,
                  text: 'Number of Students'
              },
              ticks: {
                  stepSize: 1 // Ensure integer steps for student counts
              }
            },
            y: {
                title: {
                    display: true,
                    text: 'Class Name'
                }
            }
          },
          plugins: {
            legend: {
              display: false // Legend is redundant for a single dataset bar chart
            },
            title: {
              display: true,
              text: options.plugins?.title?.text || chartInfo.title,
              font: {
                  size: 16
              }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.x !== null) {
                            label += context.parsed.x;
                        }
                        return label;
                    }
                }
            },
            ...options.plugins // Merge other potential options
          }
        }
      });
      console.log("Data Visualizer: Class attendance chart created/updated successfully.");
  } catch (error) {
      console.error("Data Visualizer: Error creating Chart.js instance for class attendance:", error);
      // Attempt to clear the canvas if creation failed
      const context = ctx.getContext('2d');
      if (context) {
          context.clearRect(0, 0, ctx.width, ctx.height);
          context.fillText("Error loading chart.", 10, 50);
      }
  }
}

/**
 * Create session timeline chart
 * @param {Array} labels - Date labels
 * @param {Array|Object} datasets - Data or datasets configuration
 * @param {Object} options - Additional chart options
 */
export function createSessionTimelineChart(labels, datasets, options = {}) {
  const chartInfo = chartConfig.sessionTimeline;
  const ctx = document.getElementById(chartInfo.elementId);
  
  if (!ctx) {
    console.warn(`Data Visualizer: Cannot find chart element with ID "${chartInfo.elementId}"`);
    return;
  }
  
  console.log(`Data Visualizer: Creating session timeline chart with ${Array.isArray(datasets) ? datasets.length : 'unknown'} datasets`);
  
  // Destroy existing chart if it exists
  if (chartInfo.chartInstance) {
    chartInfo.chartInstance.destroy();
  }
  
  // Format datasets if it's just an array of values
  const formattedDatasets = Array.isArray(datasets) && !datasets[0]?.label ? [{
    label: 'Sessions',
    data: datasets,
    borderColor: 'rgb(75, 192, 192)',
    backgroundColor: 'rgba(75, 192, 192, 0.5)',
    borderWidth: 2,
    fill: true,
    tension: 0.1 // Add slight curve to the line
  }] : datasets;
  
  // Ensure proper vibrant color settings for each dataset
  const colorPalette = [
    { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.5)' },   // Teal
    { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.5)' },   // Blue
    { border: 'rgb(153, 102, 255)', background: 'rgba(153, 102, 255, 0.5)' }, // Purple
    { border: 'rgb(255, 159, 64)', background: 'rgba(255, 159, 64, 0.5)' },   // Orange
    { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.5)' }    // Pink
  ];
  
  formattedDatasets.forEach((dataset, index) => {
    const colorSet = colorPalette[index % colorPalette.length];
    
    // Set colors with higher opacity for better visibility
    dataset.backgroundColor = dataset.backgroundColor || colorSet.background;
    dataset.borderColor = dataset.borderColor || colorSet.border;
    
    // Ensure fill is enabled for better visualization
    dataset.fill = dataset.fill !== undefined ? dataset.fill : true;
    
    // Set line tension for smoother curves
    dataset.tension = dataset.tension !== undefined ? dataset.tension : 0.1;
    
    // Set border width if not specified
    dataset.borderWidth = dataset.borderWidth || 2;
  });
  
  // Create chart
  chartInfo.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: formattedDatasets
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of sessions'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: options.plugins?.title?.text || chartInfo.title
        },
        ...options.plugins
      }
    }
  });
  
  console.log("Data Visualizer: Session timeline chart created/updated");
}

/**
 * Format data output for display in the admin panel
 * @param {Object} data - The data object to format
 * @param {Object} filters - Optional filters to apply
 * @returns {string} - Formatted string representation of data
 */
export function formatDataOutput(data, filters = null) {
  if (!data) return "No data available";
  
  let result = {};
  
  // Apply filters if provided
  if (filters) {
    // Filter by entity type (users, classes, sessions)
    if (filters.entity && filters.entity !== 'all') {
      const entityMap = {
        'users': ['users', 'admin', 'teachers', 'students'],
        'classes': ['classes'],
        'sessions': ['sessions']
      };
      
      // Only include the requested entity types
      const allowedKeys = entityMap[filters.entity] || [];
      result = Object.keys(data)
        .filter(key => allowedKeys.includes(key))
        .reduce((obj, key) => {
          obj[key] = data[key];
          return obj;
        }, {});
    } else {
      // No entity filter, include everything
      result = { ...data };
    }
    
    // Filter by role (admin, teacher, student)
    if (filters.role && filters.role !== 'all') {
      const roleMap = {
        'admin': 'admin',
        'teacher': 'teachers',
        'student': 'students'
      };
      
      // If we have users data, filter by role
      if (result.users) {
        result.users = result.users.filter(user => user.role === filters.role);
      }
      
      // If we have specific role categories, only keep those
      if (roleMap[filters.role] && result[roleMap[filters.role]]) {
        const roleKey = roleMap[filters.role];
        result = {
          [roleKey]: result[roleKey]
        };
      }
    }
    
    // Apply text search filter if provided
    if (filters.search && filters.search.trim()) {
      const searchTerm = filters.search.trim().toLowerCase();
      
      // Search in users
      if (result.users) {
        result.users = result.users.filter(user => 
          user.displayName?.toLowerCase().includes(searchTerm) || 
          user.email?.toLowerCase().includes(searchTerm) ||
          user.uid?.toLowerCase().includes(searchTerm)
        );
      }
      
      // Search in admin, teachers, students collections
      ['admin', 'teachers', 'students'].forEach(role => {
        if (result[role]) {
          result[role] = result[role].filter(user => 
            user.displayName?.toLowerCase().includes(searchTerm) || 
            user.email?.toLowerCase().includes(searchTerm) ||
            user.uid?.toLowerCase().includes(searchTerm)
          );
        }
      });
      
      // Search in classes
      if (result.classes) {
        result.classes = result.classes.filter(cls => 
          cls.name?.toLowerCase().includes(searchTerm) ||
          cls.teacherId?.toLowerCase().includes(searchTerm) ||
          cls.id?.toLowerCase().includes(searchTerm)
        );
      }
      
      // Search in sessions
      if (result.sessions) {
        result.sessions = result.sessions.filter(session =>
          session.name?.toLowerCase().includes(searchTerm) ||
          session.classId?.toLowerCase().includes(searchTerm) ||
          session.id?.toLowerCase().includes(searchTerm)
        );
      }
    }
  } else {
    // No filters, include everything
    result = { ...data };
  }
  
  // Format the filtered/unfiltered data as a readable JSON string
  return JSON.stringify(result, (key, value) => {
    // Handle Firebase Timestamp objects
    if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
      // Convert Firebase Timestamp to readable date string
      return new Date(value.seconds * 1000).toLocaleString();
    }
    return value;
  }, 2);
}

/**
 * Filter data for visualization based on provided filters
 * @param {Object} data - The data object to filter
 * @param {Object} filters - The filters to apply
 * @returns {Object} - The filtered data
 */
export function filterDataForVisualization(data, filters = null) {
  if (!filters || !data) return data;
  
  let filteredData = { ...data };
  
  // Apply entity filter
  if (filters.entity && filters.entity !== 'all') {
    if (filters.entity === 'users') {
      filteredData.classes = [];
      filteredData.sessions = [];
    } else if (filters.entity === 'classes') {
      filteredData.users = [];
      filteredData.sessions = [];
    } else if (filters.entity === 'sessions') {
      filteredData.users = [];
      filteredData.classes = [];
    }
  }
  
  // Apply role filter to users
  if (filters.role && filters.role !== 'all' && filteredData.users) {
    filteredData.users = filteredData.users.filter(user => user.role === filters.role);
  }
  
  // Apply search filter
  if (filters.search && filters.search.trim()) {
    const searchTerm = filters.search.trim().toLowerCase();
    
    // Apply to users
    if (filteredData.users) {
      filteredData.users = filteredData.users.filter(user => 
        user.displayName?.toLowerCase().includes(searchTerm) || 
        user.email?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply to classes
    if (filteredData.classes) {
      filteredData.classes = filteredData.classes.filter(cls => 
        cls.name?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Apply to sessions
    if (filteredData.sessions) {
      filteredData.sessions = filteredData.sessions.filter(session => 
        session.name?.toLowerCase().includes(searchTerm)
      );
    }
  }
  
  return filteredData;
}

/**
 * Use mock data for charts when Firestore is unavailable
 */
// No export needed, internal fallback
export function useMockDataForCharts() {
  console.log("Data Visualizer: Using mock data for charts instead of Firestore data");
  
  // Create mock data for users with different roles
  dataCache.users = [
    { id: 'admin1', displayName: 'Admin User', role: 'admin' },
    { id: 'teacher1', displayName: 'Professor Smith', role: 'teacher' },
    { id: 'teacher2', displayName: 'Dr. Johnson', role: 'teacher' },
    { id: 'student1', displayName: 'John Student', role: 'student' },
    { id: 'student2', displayName: 'Alice Student', role: 'student' },
    { id: 'student3', displayName: 'Bob Student', role: 'student' },
    { id: 'student4', displayName: 'Charlie Student', role: 'student' }
  ];
  
  // Create mock data for classes
  dataCache.classes = [
    { 
      id: 'class1', 
      name: 'Mathematics 101',
      teacherId: 'teacher1',
      enrollmentCount: 15
    },
    { 
      id: 'class2', 
      name: 'Computer Science',
      teacherId: 'teacher2',
      enrollmentCount: 12
    },
    { 
      id: 'class3', 
      name: 'Biology Basics',
      teacherId: 'teacher1',
      enrollmentCount: 8
    }
  ];
  
  // Create mock data for sessions with timestamps
  const currentDate = new Date();
  
  // Create sessions for the past 5 days
  dataCache.sessions = [];
  for (let i = 4; i >= 0; i--) {
    const sessionDate = new Date();
    sessionDate.setDate(currentDate.getDate() - i);
    
    // Add 1-2 sessions per day
    for (let j = 0; j < Math.floor(Math.random() * 2) + 1; j++) {
      const startTime = new Date(sessionDate);
      startTime.setHours(9 + j * 2); // 9AM, 11AM
      
      const endTime = new Date(startTime);
      endTime.setHours(startTime.getHours() + 1); // 1 hour sessions
      
      dataCache.sessions.push({
        id: `session-${i}-${j}`,
        name: `Session ${j+1} for Day ${i+1}`,
        classId: dataCache.classes[j % dataCache.classes.length].id,
        teacherId: dataCache.classes[j % dataCache.classes.length].teacherId,
        startTime: startTime,
        endTime: endTime,
        status: startTime <= currentDate && endTime >= currentDate ? 'active' : 'ended'
      });
    }
  }
  
  // Update charts with mock data
  updateUserDistributionChart();
  updateClassAttendanceChart();
  updateSessionTimelineChart();
  
  console.log("Data Visualizer: Successfully updated charts with mock data");
}