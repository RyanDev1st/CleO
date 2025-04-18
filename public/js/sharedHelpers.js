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
    const { db } = getFirebase();
    
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      throw new Error('User profile not found');
    }
    
    return {
      success: true,
      data: userDoc.data()
    };
  } catch (error) {
    console.error('Error getting user profile:', error);
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
    
    // Remove any fields that shouldn't be updated
    const safeProfileData = { ...profileData };
    delete safeProfileData.uid;
    delete safeProfileData.role; // Role changes should be handled separately
    delete safeProfileData.created_at;
    
    // Add last updated timestamp
    safeProfileData.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    
    await db.collection('users').doc(userId).update(safeProfileData);
    
    return {
      success: true,
      message: 'Profile updated successfully'
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
 * @returns {Promise<Object>} - Class details.
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
    
    return {
      success: true,
      data: {
        ...classData,
        teacherName: teacherData.displayName,
        studentCount
      }
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
 * @returns {Promise<Object>} - Session details.
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
 * @returns {Promise<Object>} - Attendance status and details.
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
    
    // Get attendance record if it exists
    const attendanceDoc = await db.collection(`sessions/${sessionId}/attendance`).doc(studentId).get();
    
    if (!attendanceDoc.exists) {
      // No attendance record found - student has not checked in
      return {
        success: true,
        data: {
          status: 'absent',
          sessionId,
          studentId,
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
    
    return {
      success: true,
      data: {
        ...formattedAttendance,
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