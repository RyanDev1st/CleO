// filepath: d:\CleO\public\js\sharedHelpers.js
/**
 * Shared Helper Functions for CleO
 * 
 * These functions can be used by both teachers and students.
 */

import { getFirebase } from './firebase-init.js';

/**
 * Retrieves user profile data.
 * @param {string} userId - The ID of the user to get the profile for.
 * @returns {Promise<Object>} - User profile data.
 */
export async function getUserProfile(userId) {
  try {
    const { db, auth, firebase } = getFirebase();
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    console.log(`[getUserProfile] Looking for user with ID: ${userId}`);
    
    // 1. Get the current authenticated user first
    const currentUser = auth.currentUser;
    const currentAuthUid = currentUser ? currentUser.uid : null;
    
    console.log(`[getUserProfile] Current auth user: ${currentAuthUid || 'none'}`);
    
    // First try to get directly by document ID (fastest)
    let userDoc = await db.collection('users').doc(userId).get();
    
    if (userDoc.exists) {
      console.log(`[getUserProfile] Found user by direct ID: ${userId}`);
      return { success: true, data: userDoc.data(), docId: userId };
    }
    
    // Look for reference documents (handling cases where authUid points to main doc)
    // Check if this document is actually a reference
    if (userDoc.exists && userDoc.data().isReference) {
      const mainUserId = userDoc.data().uid;
      console.log(`[getUserProfile] Found reference document pointing to ${mainUserId}`);
      
      const mainDoc = await db.collection('users').doc(mainUserId).get();
      if (mainDoc.exists) {
        return { success: true, data: mainDoc.data(), docId: mainUserId, refId: userId };
      }
    }
    
    // Query by authUid field (for users with explicit authUid field)
    const authUidQuery = await db.collection('users').where('authUid', '==', userId).limit(1).get();
    if (!authUidQuery.empty) {
      userDoc = authUidQuery.docs[0];
      console.log(`[getUserProfile] Found user by authUid field. Doc ID: ${userDoc.id}`);
      return { success: true, data: userDoc.data(), docId: userDoc.id };
    }
    
    // Special case: If the requested userId matches the current auth user, create a user document
    if (currentAuthUid && currentAuthUid === userId) {
      console.log(`[getUserProfile] Requested ID matches current auth user: ${userId}`);
      
      // Get Firebase Auth user profile information
      const userInfo = {
        email: currentUser.email,
        displayName: currentUser.displayName || `User ${userId.slice(0,6)}`,
        photoURL: currentUser.photoURL
      };
      
      // Check if we have this email in our database (email search)
      let existingUser = null;
      if (userInfo.email) {
        const emailQuery = await db.collection('users').where('email', '==', userInfo.email).limit(1).get();
        if (!emailQuery.empty) {
          existingUser = {
            docId: emailQuery.docs[0].id,
            data: emailQuery.docs[0].data()
          };
          console.log(`[getUserProfile] Found user by email match: ${userInfo.email}`);
        }
      }
      
      if (existingUser) {
        // We found an existing user with this email, update with auth ID
        const userData = existingUser.data;
        userData.authUid = userId; // Link the Auth UID
        
        // Update the existing document
        await db.collection('users').doc(existingUser.docId).update({
          authUid: userId,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`[getUserProfile] Updated existing user document with auth UID: ${userId}`);
        
        return { 
          success: true, 
          data: userData,
          docId: existingUser.docId
        };
      }
      
      // Create new user document based on the auth user info
      console.log(`[getUserProfile] Creating new user document for auth user: ${userId}`);
      
      const userData = {
        uid: userId,
        email: userInfo.email || `user-${userId.slice(0,6)}@example.com`,
        displayName: userInfo.displayName || `User ${userId.slice(0,6)}`,
        photoURL: userInfo.photoURL || null,
        role: 'student', // Default role
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      };
      
      await db.collection('users').doc(userId).set(userData);
      console.log(`[getUserProfile] Created new user document: ${userId}`);
      
      return { 
        success: true, 
        data: userData, 
        docId: userId,
        isNewUser: true
      };
    }
    
    // If this is the admin creation flow, use test-specific logic
    if (userId === 'admin' || 
        userId.includes('@cleouniversity.edu') || 
        userId.includes('admin') || 
        userId.includes('teacher') || 
        userId.includes('student')) {
      
      console.log(`[getUserProfile] This appears to be a test user ID: ${userId}`);
      
      // Check if we can find this user by email in case it's an email
      if (userId.includes('@')) {
        const emailQuery = await db.collection('users').where('email', '==', userId).limit(1).get();
        if (!emailQuery.empty) {
          userDoc = emailQuery.docs[0];
          console.log(`[getUserProfile] Found test user by email. Doc ID: ${userDoc.id}`);
          return { success: true, data: userDoc.data(), docId: userDoc.id };
        }
      }
      
      // NEW FIX: If we're looking for a user ID that might be stored in a different field (uid, email, id, authUid)
      const allUsersSnapshot = await db.collection('users').get();
      for (const doc of allUsersSnapshot.docs) {
        const userData = doc.data();
        // Check against multiple fields for potential matches
        if (doc.id === userId || 
            userData.uid === userId || 
            userData.email === userId || 
            userData.authUid === userId) {
          console.log(`[getUserProfile] Found user by alternate field match. Doc ID: ${doc.id}`);
          return { success: true, data: userData, docId: doc.id };
        }
      }
      
      // Generate a unique identifier for this dummy user to avoid conflicts
      const uniqueId = `dummy-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      // IMPORTANT FIX: Determine role based on ID more accurately
      let role = 'student';
      if (userId.includes('admin')) {
        role = 'admin';
      } else if (userId.includes('teacher')) {
        role = 'teacher';
      }
      
      // Create dummy profile for test users that we can't find
      console.log(`[getUserProfile] Creating dummy profile for test user: ${userId} with role: ${role}`);
      
      // Create a consistent display name based on the user ID
      let displayName = userId;
      if (userId.includes('@')) {
        // Extract name from email
        displayName = userId.split('@')[0];
      }
      if (userId.includes('admin')) {
        displayName = 'Administrator';
      } else if (userId.includes('teacher')) {
        displayName = `Professor ${displayName.replace('teacher', '')}`;
      } else if (userId.includes('student')) {
        displayName = `Student ${displayName.replace('student', '')}`;
      }
      
      const dummyData = {
        uid: userId,
        uniqueId: uniqueId,
        email: userId.includes('@') ? userId : `${userId}@cleouniversity.edu`,
        displayName: displayName,
        role: role, // Correctly set role based on user type
        isDummy: true,
        created_at: new Date().toISOString()
      };
      
      return {
        success: true,
        data: dummyData,
        isDummy: true
      };
    }
    
    // For Firebase Auth UIDs (that don't match current user)
    // Try to find any existing user that matches this Firebase Auth UID
    const existingAuthUsers = await db.collection('users').get();
    let possibleMatch = null;
    
    existingAuthUsers.forEach(doc => {
      if (doc.id === userId || doc.data().uid === userId || doc.data().authUid === userId) {
        possibleMatch = {
          docId: doc.id,
          data: doc.data()
        };
      }
    });
    
    if (possibleMatch) {
      console.log(`[getUserProfile] Found possible match for Firebase Auth UID: ${userId}`);
      return { 
        success: true, 
        data: possibleMatch.data, 
        docId: possibleMatch.docId
      };
    }
    
    // This is a Firebase Auth UID we don't recognize
    if (userId.length > 20) { // Firebase Auth UIDs are long
      console.log(`[getUserProfile] Unrecognized Firebase Auth UID: ${userId}`);
      
      // Let's try to get user info from Auth to create a proper document
      try {
        // Try to fetch from Auth
        const userRecord = await firebase.functions().httpsCallable('getUserRecord')({uid: userId});
        const authUserInfo = userRecord.data?.user;
        
        if (authUserInfo) {
          console.log(`[getUserProfile] Found user info from Auth: ${authUserInfo.email}`);
          
          // Create new user document with proper Auth info
          const userData = {
            uid: userId,
            email: authUserInfo.email,
            displayName: authUserInfo.displayName || `User ${userId.slice(0,6)}`,
            photoURL: authUserInfo.photoURL || null,
            // IMPORTANT: Try to detect if this is a teacher email
            role: authUserInfo.email?.includes('teacher') ? 'teacher' : 'student',
            created_at: firebase.firestore.FieldValue.serverTimestamp()
          };
          
          await db.collection('users').doc(userId).set(userData);
          console.log(`[getUserProfile] Created new user document from Auth info: ${userId}`);
          
          return { 
            success: true, 
            data: userData, 
            docId: userId,
            isNewUser: true
          };
        }
      } catch (authError) {
        console.log(`[getUserProfile] Couldn't fetch Auth user info: ${authError.message}`);
      }
    }
    
    // Last attempt: Get diagnostic information
    const diagResult = await diagnoseUserDatabase();
    console.log(`[getUserProfile] No user found for ID: ${userId}`);
    console.log(`[getUserProfile] Available users:`, diagResult.availableUsers);
    
    throw new Error(`User profile not found for ID: ${userId}`);
  } catch (error) {
    console.error('[getUserProfile] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * A diagnostic function that dumps the entire user database for debugging
 * and attempts to find a user that might match the current authentication.
 * @returns {Promise<Object>} - Diagnostic data
 */
export async function diagnoseUserDatabase() {
  try {
    const { db, auth } = getFirebase();
    
    // Get all users in the database (limit to 20 for performance)
    const usersSnapshot = await db.collection('users').limit(20).get();
    
    const availableUsers = [];
    let matchingUser = null;
    
    // Get the currently authenticated user if any
    const currentUser = auth.currentUser;
    const currentAuthId = currentUser ? currentUser.uid : null;
    
    console.log(`[diagnoseUserDatabase] Current auth user: ${currentAuthId || 'none'}`);
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const userSummary = {
        docId: doc.id,
        uid: userData.uid || 'missing',
        authUid: userData.authUid || 'missing',
        email: userData.email || 'missing',
        displayName: userData.displayName || 'missing',
        role: userData.role || 'unknown'
      };
      
      availableUsers.push(userSummary);
      
      // Match by EXACT document ID or authUid only, not similarity
      if (currentAuthId && (doc.id === currentAuthId || userData.authUid === currentAuthId)) {
        matchingUser = {
          docId: doc.id,
          data: userData
        };
        console.log(`[diagnoseUserDatabase] Found exact match for current auth:`, userSummary);
      }
    });
    
    console.log(`[diagnoseUserDatabase] Found ${availableUsers.length} users`);
    console.table(availableUsers);
    
    if (matchingUser) {
      console.log(`[diagnoseUserDatabase] Found matching user for current auth:`, matchingUser);
    } else if (currentAuthId) {
      console.log(`[diagnoseUserDatabase] No matching user found for current auth ID:`, currentAuthId);
    }
    
    return {
      success: true,
      availableUsers,
      matchingUser,
      currentAuthId
    };
  } catch (error) {
    console.error('[diagnoseUserDatabase] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates user profile information.
 * @param {string} userId - The ID of the user to update.
 * @param {Object} profileData - The profile data to update.
 * @param {Object} [profileData.additional={}] - Container for any additional profile data fields.
 * @returns {Promise<Object>} - Result of the update operation.
 */
export async function updateUserProfile(userId, profileData) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    if (!profileData || typeof profileData !== 'object') {
      throw new Error('Profile data must be an object');
    }
    
    // First find the actual document ID to update
    const userProfile = await getUserProfile(userId);
    if (!userProfile.success) {
      throw new Error(`Failed to find user: ${userProfile.error}`);
    }
    
    // Determine which document to update
    const docIdToUpdate = userProfile.refId ? userProfile.refId : 
                          userProfile.docId ? userProfile.docId : userId;
    
    const realUserId = userProfile.data.uid || docIdToUpdate;
    
    console.log(`Updating user profile for ${userId}, actual document ID: ${docIdToUpdate}, real user ID: ${realUserId}`);
    
    // Remove any fields that shouldn't be updated
    const safeProfileData = { ...profileData };
    delete safeProfileData.uid;
    delete safeProfileData.role; // Role changes should be handled separately
    delete safeProfileData.created_at;
    delete safeProfileData.authUid;
    
    // Handle additional data properly
    if (profileData.additional && typeof profileData.additional === 'object') {
      // Get the current user document to check if it already has an additional field
      const userDoc = await db.collection('users').doc(realUserId).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      // Merge the existing additional data with the new additional data
      safeProfileData.additional = {
        ...(userData.additional || {}),
        ...profileData.additional
      };
    }
    
    // Add last updated timestamp
    safeProfileData.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    
    await db.collection('users').doc(realUserId).update(safeProfileData);
    
    // If there's a reference document, update it as well
    if (userProfile.refId && userProfile.refId !== realUserId) {
      console.log(`Updating reference document: ${userProfile.refId}`);
      const refUpdateData = {};
      
      // Only update fields that make sense in a reference doc
      if (safeProfileData.displayName) refUpdateData.displayName = safeProfileData.displayName;
      if (safeProfileData.email) refUpdateData.email = safeProfileData.email;
      
      if (Object.keys(refUpdateData).length > 0) {
        refUpdateData.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(userProfile.refId).update(refUpdateData);
      }
    }
    
    return {
      success: true,
      message: 'Profile updated successfully',
      updatedDocId: realUserId,
      additional: safeProfileData.additional
    };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Retrieves details for a specific class.
 * @param {string} classId - The ID of the class to retrieve.
 * @returns {Promise<Object>} - Class details including any additional data fields.
 */
export async function getClassDetails(classId) {
  try {
    const { db } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Get teacher name
    const teacherDoc = await db.collection('users').doc(classData.teacherId).get();
    const teacherData = teacherDoc.exists ? teacherDoc.data() : { displayName: 'Unknown Teacher' };
    
    // Get count of students
    const studentsSnapshot = await db.collection(`classes/${classId}/students`).get();
    const studentCount = studentsSnapshot.size;
    
    // Prepare the response data, preserving any additional fields from the original class data
    const responseData = {
      ...classData,
      teacherName: teacherData.displayName,
      studentCount
    };
    
    // Make sure additional data is available if it exists
    if (classData.additional) {
      responseData.additional = classData.additional;
    }
    
    return {
      success: true,
      data: responseData
    };
  } catch (error) {
    console.error('Error getting class details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Retrieves details for a specific session.
 * @param {string} sessionId - The ID of the session to retrieve.
 * @returns {Promise<Object>} - Session details including any additional data fields.
 */
export async function getSessionDetails(sessionId) {
  try {
    const { db } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Get class details
    const classDoc = await db.collection('classes').doc(sessionData.classId).get();
    const classData = classDoc.exists ? classDoc.data() : { name: 'Unknown Class' };
    
    // Get teacher details
    const teacherDoc = await db.collection('users').doc(sessionData.teacherId).get();
    const teacherData = teacherDoc.exists ? teacherDoc.data() : { displayName: 'Unknown Teacher' };
    
    // Get attendance count
    const attendanceSnapshot = await db.collection(`sessions/${sessionId}/attendance`).get();
    const attendanceCount = attendanceSnapshot.size;
    
    // Format timestamps for easy display
    let formattedSession = {
      ...sessionData,
      className: classData.name,
      teacherName: teacherData.displayName,
      attendanceCount
    };
    
    // Make sure additional data is available if it exists
    if (sessionData.additional) {
      formattedSession.additional = sessionData.additional;
    }
    
    // Format timestamps if they exist
    if (sessionData.startTime) {
      formattedSession.startTimeFormatted = sessionData.startTime.toDate().toLocaleString();
    }
    
    if (sessionData.endTime) {
      formattedSession.endTimeFormatted = sessionData.endTime.toDate().toLocaleString();
    }
    
    return {
      success: true,
      data: formattedSession
    };
  } catch (error) {
    console.error('Error getting session details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gets the attendance status of a student for a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} studentId - The ID of the student.
 * @returns {Promise<Object>} - Attendance status and details including any additional fields.
 */
export async function getAttendanceStatus(sessionId, studentId) {
  try {
    const { db } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    // Get session details first to check if it exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    // Get the real student ID in case we were given an Auth UID
    const studentProfile = await getUserProfile(studentId);
    if (!studentProfile.success) {
      throw new Error(`Student not found: ${studentProfile.error}`);
    }
    
    // Use the proper student ID for attendance lookup
    const realStudentId = studentProfile.data.uid || studentId;
    console.log(`Looking up attendance for student ID: ${realStudentId} (original ID: ${studentId})`);
    
    // Get attendance record if it exists
    const attendanceDoc = await db.collection(`sessions/${sessionId}/attendance`).doc(realStudentId).get();
    
    if (!attendanceDoc.exists) {
      // No attendance record found - student has not checked in
      return {
        success: true,
        data: {
          status: 'absent',
          sessionId,
          studentId: realStudentId,
          originalStudentId: studentId !== realStudentId ? studentId : undefined,
          hasAttended: false,
          message: 'Student has not checked in to this session'
        }
      };
    }
    
    const attendanceData = attendanceDoc.data();
    
    // Format timestamps for display
    let formattedAttendance = { ...attendanceData };
    
    if (attendanceData.checkInTime) {
      formattedAttendance.checkInTimeFormatted = attendanceData.checkInTime.toDate().toLocaleString();
    }
    
    if (attendanceData.checkOutTime) {
      formattedAttendance.checkOutTimeFormatted = attendanceData.checkOutTime.toDate().toLocaleString();
    }
    
    // Make sure additional data is preserved if it exists
    if (attendanceData.additional) {
      formattedAttendance.additional = attendanceData.additional;
    }
    
    return {
      success: true,
      data: {
        ...formattedAttendance,
        originalStudentId: studentId !== realStudentId ? studentId : undefined,
        hasAttended: true
      }
    };
  } catch (error) {
    console.error('Error getting attendance status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Validates if a student's location is within the allowed radius for a session.
 * @param {string} sessionId - The ID of the session.
 * @param {Object} studentLocation - The student's location.
 * @param {number} studentLocation.latitude - The latitude coordinate.
 * @param {number} studentLocation.longitude - The longitude coordinate.
 * @returns {Promise<Object>} - Validation result.
 */
export async function validateLocationForSession(sessionId, studentLocation) {
  try {
    const { db } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!studentLocation || typeof studentLocation !== 'object' ||
        typeof studentLocation.latitude !== 'number' || typeof studentLocation.longitude !== 'number') {
      throw new Error('Valid student location is required (must include latitude and longitude)');
    }
    
    // Get the session details
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if session is active
    if (sessionData.status !== 'active') {
      throw new Error(`Session is ${sessionData.status}, not active`);
    }
    
    // Get session location
    const sessionLocation = {
      latitude: sessionData.location.latitude,
      longitude: sessionData.location.longitude
    };
    
    // Calculate distance between student and session location
    const distance = calculateDistance(sessionLocation, studentLocation);
    
    // Check if distance is within allowed radius
    const isWithinRadius = distance <= sessionData.radius;
    
    return {
      success: true,
      data: {
        isWithinRadius,
        distance,
        sessionRadius: sessionData.radius,
        unit: 'meters'
      }
    };
  } catch (error) {
    console.error('Error validating location for session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula.
 * @param {Object} point1 - First coordinate point.
 * @param {number} point1.latitude - Latitude of the first point.
 * @param {number} point1.longitude - Longitude of the first point.
 * @param {Object} point2 - Second coordinate point.
 * @param {number} point2.latitude - Latitude of the second point.
 * @param {number} point2.longitude - Longitude of the second point.
 * @returns {number} - Distance in meters.
 */
export function calculateDistance(point1, point2) {
  // Earth's radius in meters
  const R = 6371e3;
  
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

/**
 * Utility to calculate distance between a session center point and a student's location.
 * @param {Object} sessionLocation - The session's center location.
 * @param {number} sessionLocation.latitude - The latitude of the session center.
 * @param {number} sessionLocation.longitude - The longitude of the session center.
 * @param {Object} studentLocation - The student's location.
 * @param {number} studentLocation.latitude - The latitude of the student's location.
 * @param {number} studentLocation.longitude - The longitude of the student's location.
 * @returns {Object} - Distance calculation result with distance in meters.
 */
export function calculateDistanceFromSessionCenter(sessionLocation, studentLocation) {
  try {
    if (!sessionLocation || typeof sessionLocation !== 'object' ||
        typeof sessionLocation.latitude !== 'number' || typeof sessionLocation.longitude !== 'number') {
      throw new Error('Valid session location is required (must include latitude and longitude)');
    }
    
    if (!studentLocation || typeof studentLocation !== 'object' ||
        typeof studentLocation.latitude !== 'number' || typeof studentLocation.longitude !== 'number') {
      throw new Error('Valid student location is required (must include latitude and longitude)');
    }
    
    // Calculate distance using the Haversine formula
    const distance = calculateDistance(sessionLocation, studentLocation);
    
    return {
      success: true,
      data: {
        distance,
        unit: 'meters'
      }
    };
  } catch (error) {
    console.error('Error calculating distance:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a new user with specified role.
 * @param {Object} userData - The user data.
 * @param {string} userData.email - User's email address.
 * @param {string} userData.displayName - User's display name.
 * @param {string} [userData.photoURL] - User's profile photo URL.
 * @param {Object} [userData.additional={}] - Additional user data to store.
 * @param {string} role - User's role (admin, teacher, or student).
 * @returns {Promise<Object>} - Result of the operation with created user ID.
 */
export async function createUserAccount(userData, role) {
  try {
    const { db, auth, firebase } = getFirebase();
    
    if (!userData || typeof userData !== 'object') {
      throw new Error('User data is required');
    }
    
    if (!userData.email || !userData.displayName) {
      throw new Error('Email and display name are required');
    }
    
    if (!role || !['admin', 'teacher', 'student'].includes(role)) {
      throw new Error('Valid role is required (admin, teacher, or student)');
    }
    
    // Process and sanitize additional data
    const additional = userData.additional && typeof userData.additional === 'object' ? 
                       { ...userData.additional } : {};
    
    // Check if user already exists
    const emailCheckQuery = await db.collection('users').where('email', '==', userData.email).limit(1).get();
    if (!emailCheckQuery.empty) {
      throw new Error(`A user with email ${userData.email} already exists`);
    }
    
    // Generate a unique ID for the user
    const uid = `user-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Create the user document with clean data structure
    const newUserData = {
      uid: uid,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL || null,
      role: role,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      additional: additional
    };
    
    // Add role-specific additional data
    if (role === 'teacher') {
      additional.teacherInfo = additional.teacherInfo || {};
      additional.teacherInfo.departmentId = additional.teacherInfo.departmentId || 'default';
      additional.teacherInfo.officeLocation = additional.teacherInfo.officeLocation || '';
      additional.teacherInfo.officeHours = additional.teacherInfo.officeHours || '';
    } else if (role === 'student') {
      additional.studentInfo = additional.studentInfo || {};
      additional.studentInfo.enrollmentYear = additional.studentInfo.enrollmentYear || new Date().getFullYear();
      additional.studentInfo.major = additional.studentInfo.major || '';
    }
    
    // Add any metadata about the account creation
    additional.accountCreationInfo = {
      timestamp: new Date().toISOString(),
      createdBy: auth.currentUser ? auth.currentUser.uid : 'system'
    };
    
    // Update the additional data in the user document
    newUserData.additional = additional;
    
    // Create the document
    await db.collection('users').doc(uid).set(newUserData);
    
    return {
      success: true,
      data: {
        uid: uid,
        email: userData.email,
        role: role,
        additional: additional
      },
      message: `User ${userData.displayName} created successfully with role ${role}`
    };
  } catch (error) {
    console.error('Error creating user account:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generates a random join code for classes.
 * @returns {string} - A 6-character alphanumeric join code.
 */
export function generateJoinCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const codeLength = 6;
  let result = '';
  
  for (let i = 0; i < codeLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}