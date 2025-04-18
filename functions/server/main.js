/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { onRequest, onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Reference to Firestore database
const db = admin.firestore();

// Import data models and data handling functions
const { data } = require('./data/data.js');
const dataManager = require('./data/organize_data.js');

// Make admin available for other modules
exports.admin = admin;

// Add CORS middleware
const corsHandler = (req, res, next) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  next();
};

// Apply CORS to all endpoints
const applyMiddleware = (handler) => {
  return (req, res) => {
    corsHandler(req, res, () => handler(req, res));
  };
};

/**
 * Simple HTTP endpoint
 */
exports.api = onRequest((request, response) => {
  logger.info("API request received", { path: request.path, method: request.method });
  
  try {
    // Handle different HTTP methods
    switch (request.method) {
      case 'GET':
        response.json({ message: "API is working!", timestamp: new Date().toISOString() });
        break;
      
      case 'POST':
        // Example handling POST data
        const data = request.body || {};
        logger.info("Received data", { data });
        response.json({ 
          message: "Data received successfully", 
          dataReceived: data 
        });
        break;
        
      default:
        response.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error in API function", error);
    response.status(500).json({ error: "Internal server error" });
  }
});

/**
 * User Management Endpoints
 */
exports.users = onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      return response.status(401).json({ error: "Invalid token" });
    }
    
    const userId = decodedToken.uid;
    const path = request.path.split('/');

    const requestingUser = await dataManager.getUserById(userId);
    const isRequestingUserAdmin = requestingUser?.role === 'admin';

    switch (request.method) {
      case 'GET':
        if (path.length > 1 && path[1]) {
          const targetUserId = path[1];
          if (targetUserId !== userId && !isRequestingUserAdmin) { 
            return response.status(403).json({ error: "Access denied" });
          }
          
          const user = await dataManager.getUserById(targetUserId);
          if (!user) {
            return response.status(404).json({ error: "User not found" });
          }
          return response.json(user);
        } else {
          if (!isRequestingUserAdmin) { 
            return response.status(403).json({ error: "Admin access required" });
          }
          
          const users = await dataManager.getAllUsers();
          return response.json(users);
        }
        
      case 'POST':
        const userData = request.body || {};
        
        if (!userData.email || !userData.displayName || !userData.role) {
          return response.status(400).json({ error: "Missing required fields" });
        }
        if (userData.role !== 'student' && userData.role !== 'teacher') {
             return response.status(400).json({ error: "Invalid role specified. Must be 'student' or 'teacher'." });
        }

        const user = await dataManager.createOrUpdateUser(userId, userData);
        return response.status(201).json({ message: "User profile created/updated", userId: user.uid, data: user });
        
      case 'PUT':
        if (path.length > 1 && path[1]) {
          const targetUserId = path[1];
          if (targetUserId !== userId && !isRequestingUserAdmin) {
            return response.status(403).json({ error: "Access denied" });
          }
          
          const updateData = request.body || {};
          const allowedFields = ['displayName', 'email'];
          if (isRequestingUserAdmin) { 
            allowedFields.push('role');
          }
          
          const updatedUser = await dataManager.updateUserFields(targetUserId, allowedFields, updateData);
          return response.json({ message: "User updated", userId: targetUserId, data: updatedUser });
        } else {
          return response.status(400).json({ error: "User ID required" });
        }
        
      case 'DELETE':
        if (path.length > 1 && path[1]) {
          const targetUserId = path[1];
          if (!isRequestingUserAdmin) {
            return response.status(403).json({ error: "Admin access required" });
          }
          
          const success = await dataManager.deleteUser(targetUserId);
          return response.json({ message: "User deleted", userId: targetUserId });
        } else {
          return response.status(400).json({ error: "User ID required" });
        }
        
      default:
        return response.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error in users function", error);
    if (error.message.includes('not found')) {
        return response.status(404).json({ error: error.message });
    }
    return response.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Class Management Endpoints
 */
exports.classes = onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      return response.status(401).json({ error: "Invalid token" });
    }
    
    const userId = decodedToken.uid;
    const path = request.path.split('/');
    
    const user = await dataManager.getUserById(userId);
    if (!user) {
      return response.status(403).json({ error: "User profile not found or setup incomplete." });
    }
    
    const isTeacher = user.role === 'teacher';
    
    switch (request.method) {
      case 'GET':
        if (path.length > 1 && path[1]) {
          const classId = path[1];
          const classData = await dataManager.getClassById(classId);
          
          if (!classData) {
            return response.status(404).json({ error: "Class not found" });
          }
          
          const teacherId = classData.teacherId;
          
          if (teacherId !== userId) {
            const studentRef = admin.firestore().doc(`classes/${classId}/students/${userId}`);
            const studentDoc = await studentRef.get();
            
            if (!studentDoc.exists) {
              return response.status(403).json({ error: "Access denied" });
            }
          }
          
          return response.json(classData);
        } else {
          if (isTeacher) {
            const classes = await dataManager.getClassesByTeacher(userId);
            return response.json(classes);
          } else {
            const classes = await dataManager.getClassesForStudent(userId);
            return response.json(classes);
          }
        }
        
      case 'POST':
        if (!isTeacher) {
          return response.status(403).json({ error: "Only teachers can create classes" });
        }
        
        const classReqData = request.body || {};
        
        if (!classReqData.name) {
          return response.status(400).json({ error: "Class name is required" });
        }
        
        const newClassData = await dataManager.createClass({
          name: classReqData.name,
          teacherId: userId
        });
        
        return response.status(201).json({ 
          message: "Class created", 
          classId: newClassData.classId,
          joinCode: newClassData.joinCode
        });
        
      case 'PUT':
        if (path.length > 1 && path[1]) {
          const classId = path[1];
          const classData = await dataManager.getClassById(classId);
          
          if (!classData) {
            return response.status(404).json({ error: "Class not found" });
          }
          
          if (classData.teacherId !== userId) {
            return response.status(403).json({ error: "Only the class teacher can update" });
          }
          
          const updateData = request.body || {};
          const updatedClassData = await dataManager.updateClass(classId, updateData);
          
          return response.json({ 
            message: "Class updated", 
            classId,
            joinCode: updatedClassData.joinCode 
          });
        } else {
          return response.status(400).json({ error: "Class ID required" });
        }
        
      case 'DELETE':
        if (path.length > 1 && path[1]) {
          const classId = path[1];
          const classData = await dataManager.getClassById(classId);
          
          if (!classData) {
            return response.status(404).json({ error: "Class not found" });
          }
          
          if (classData.teacherId !== userId) {
            return response.status(403).json({ error: "Only the class teacher can delete" });
          }
          
          await dataManager.deleteClass(classId);
          
          return response.json({ message: "Class deleted", classId });
        } else {
          return response.status(400).json({ error: "Class ID required" });
        }
        
      default:
        return response.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error in classes function", error);
    if (error.message.includes('not found')) {
        return response.status(404).json({ error: error.message });
    }
    return response.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Class Join Endpoint
 */
exports.joinClass = onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      return response.status(401).json({ error: "Invalid token" });
    }
    
    const userId = decodedToken.uid;
    
    if (request.method !== 'POST') {
      return response.status(405).json({ error: "Method not allowed" });
    }
    
    const { joinCode } = request.body || {};
    
    if (!joinCode) {
      return response.status(400).json({ error: "Join code is required" });
    }
    
    const classData = await dataManager.findClassByJoinCode(joinCode);
    
    if (!classData) {
      return response.status(404).json({ error: "Invalid join code" });
    }
    
    const classId = classData.classId;
    
    const studentRef = admin.firestore().doc(`classes/${classId}/students/${userId}`);
    const studentDoc = await studentRef.get();
    
    if (studentDoc.exists) {
      return response.status(400).json({ error: "Already enrolled in this class" });
    }
    
    const teacherData = await dataManager.getUserById(classData.teacherId);
    
    await dataManager.addStudentToClass(
      classId, 
      userId, 
      classData.name,
      teacherData ? teacherData.displayName : 'Unknown Teacher'
    );
    
    return response.status(200).json({ 
      message: "Successfully joined class", 
      classId, 
      className: classData.name
    });
    
  } catch (error) {
    logger.error("Error in joinClass function", error);
    if (error.message.includes('not found')) {
        return response.status(404).json({ error: error.message });
    }
    return response.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Session Management Endpoints
 */
exports.sessions = onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      return response.status(401).json({ error: "Invalid token" });
    }
    
    const userId = decodedToken.uid;
    const path = request.path.split('/');
    
    const user = await dataManager.getUserById(userId);
    if (!user) {
      return response.status(403).json({ error: "User profile not found or setup incomplete." });
    }
    
    const isTeacher = user.role === 'teacher';
    
    switch (request.method) {
      case 'GET':
        if (path.length > 1 && path[1]) {
          const sessionId = path[1];
          const sessionData = await dataManager.getSessionById(sessionId);
          
          if (!sessionData) {
            return response.status(404).json({ error: "Session not found" });
          }
          
          const classId = sessionData.classId;
          const teacherId = sessionData.teacherId;
          
          if (teacherId !== userId) {
            const studentRef = admin.firestore().doc(`classes/${classId}/students/${userId}`);
            const studentDoc = await studentRef.get();
            
            if (!studentDoc.exists) {
              return response.status(403).json({ error: "Access denied" });
            }
          }
          
          if (!isTeacher && sessionData.status !== 'active') {
            return response.status(403).json({ error: "Session is not active" });
          }
          
          if (path.length > 2 && path[2] === 'attendance') {
            if (!isTeacher) {
              return response.status(403).json({ error: "Only teachers can view attendance" });
            }
            
            const attendanceList = await dataManager.getSessionAttendance(sessionId);
            return response.json(attendanceList);
          }
          
          return response.json(sessionData);
        } else {
          if (isTeacher) {
            const sessions = await dataManager.getSessionsByTeacher(userId);
            return response.json(sessions);
          } else {
            const userClasses = await dataManager.getClassesForStudent(userId);
            const classIds = userClasses.map(c => c.classId);
            
            if (classIds.length === 0) {
              return response.json([]);
            }
            
            const sessions = await dataManager.getActiveSessionsForStudent(userId, classIds);
            return response.json(sessions);
          }
        }
        
      case 'POST':
        if (!isTeacher) {
          return response.status(403).json({ error: "Only teachers can create sessions" });
        }
        
        const sessionReqData = request.body || {};
        
        if (!sessionReqData.classId || !sessionReqData.location || !sessionReqData.radius) {
          return response.status(400).json({ error: "Missing required fields" });
        }
        
        const classData = await dataManager.getClassById(sessionReqData.classId);
        if (!classData) {
          return response.status(404).json({ error: "Class not found" });
        }
        
        if (classData.teacherId !== userId) {
          return response.status(403).json({ error: "You are not the teacher of this class" });
        }
        
        const newSessionData = await dataManager.createSession({
          ...sessionReqData,
          teacherId: userId
        });
        
        return response.status(201).json({ 
          message: "Session created", 
          sessionId: newSessionData.sessionId
        });
        
      case 'PUT':
        if (path.length > 1 && path[1]) {
          const sessionId = path[1];
          const sessionData = await dataManager.getSessionById(sessionId);
          
          if (!sessionData) {
            return response.status(404).json({ error: "Session not found" });
          }
          
          if (sessionData.teacherId !== userId) {
            return response.status(403).json({ error: "Only the session teacher can update" });
          }
          
          const updateData = request.body || {};
          
          if (updateData.status) {
            const updatedSession = await dataManager.updateSessionStatus(sessionId, updateData.status);
            return response.json({ 
              message: "Session updated", 
              sessionId,
              data: updatedSession
            });
          } else {
            return response.status(400).json({ error: "No updates specified" });
          }
        } else {
          return response.status(400).json({ error: "Session ID required" });
        }
        
      default:
        return response.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    logger.error("Error in sessions function", error);
     if (error.message.includes('not found')) {
        return response.status(404).json({ error: error.message });
    }
     if (error.message.includes('Invalid status transition')) {
        return response.status(400).json({ error: error.message });
    }
    return response.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Attendance Check-in Endpoint
 */
exports.checkIn = onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    
    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (error) {
      return response.status(401).json({ error: "Invalid token" });
    }
    
    const userId = decodedToken.uid;
    
    if (request.method !== 'POST') {
      return response.status(405).json({ error: "Method not allowed" });
    }
    
    const { sessionId, location } = request.body || {};
    
    if (!sessionId || !location || location.latitude === undefined || location.longitude === undefined) {
      return response.status(400).json({ error: "Session ID and location are required" });
    }
    
    const result = await dataManager.checkInStudent(sessionId, userId, location);
    
    return response.json({
      message: result.status === 'verified' 
        ? "Check-in successful" 
        : "Check-in failed: location outside allowed radius",
      status: result.status,
      distance: result.distance,
      allowedRadius: result.allowedRadius
    });
    
  } catch (error) {
    logger.error("Error in checkIn function", error);
    if (error.message.includes('not found') || error.message.includes('not enrolled') || error.message.includes('not active') || error.message.includes('Already checked in')) {
        return response.status(400).json({ error: error.message });
    }
    return response.status(500).json({ error: "Internal server error", details: error.message });
  }
});

/**
 * Callable function example
 */
exports.getServerTime = onCall((data, context) => {
  if (!context.auth) {
    throw new Error('Unauthorized access');
  }
  
  return {
    timestamp: admin.firestore.Timestamp.now(),
    date: new Date().toISOString(),
    userId: context.auth.uid
  };
});

/**
 * Test Data Endpoint - ONLY FOR DEVELOPMENT
 * Seeds the database with test data including an admin user
 */
exports.seedTestData = onRequest(async (request, response) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return response.status(403).json({ 
      error: "This endpoint is disabled in production for security reasons" 
    });
  }
  
  try {
    const { seedDatabase } = require('./data/seed-test-data.js');
    
    const clearExisting = request.query.clear !== 'false';
    
    const result = await seedDatabase(clearExisting);
    
    if (result.success) {
      return response.status(200).json({
        message: "Database seeded successfully with test data",
        stats: result.stats
      });
    } else {
      return response.status(500).json({
        error: "Failed to seed database",
        details: result.error
      });
    }
  } catch (error) {
    logger.error("Error in seedTestData function", error);
    return response.status(500).json({ error: "Internal server error" });
  }
});

// Update existing endpoint exports with middleware
const wrapEndpoints = () => {
  exports.api = onRequest(applyMiddleware(exports.api));
  exports.users = onRequest(applyMiddleware(exports.users));
  exports.classes = onRequest(applyMiddleware(exports.classes));
  exports.joinClass = onRequest(applyMiddleware(exports.joinClass));
  exports.sessions = onRequest(applyMiddleware(exports.sessions));
  exports.checkIn = onRequest(applyMiddleware(exports.checkIn));
  exports.seedTestData = onRequest(applyMiddleware(exports.seedTestData));
};

wrapEndpoints();

logger.info("Firebase Functions initialized successfully");