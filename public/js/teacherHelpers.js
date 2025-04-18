// filepath: d:\CleO\public\js\teacherHelpers.js
/**
 * Teacher Helper Functions for CleO
 * 
 * These functions are specifically for teacher users.
 */

import { getFirebase } from './firebase-init.js';

/**
 * Returns all classes created by a specific teacher.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - List of classes.
 */
export async function getTeacherClasses(teacherId) {
  try {
    const { db } = getFirebase();
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    const classesSnapshot = await db.collection('classes')
      .where('teacherId', '==', teacherId)
      .get();
    
    const classes = [];
    
    for (const classDoc of classesSnapshot.docs) {
      const classData = classDoc.data();
      
      // Get student count for each class
      const studentsSnapshot = await db.collection(`classes/${classDoc.id}/students`).get();
      
      classes.push({
        classId: classDoc.id,
        ...classData,
        studentCount: studentsSnapshot.size,
        createdAtFormatted: classData.created_at ? classData.created_at.toDate().toLocaleString() : 'N/A'
      });
    }
    
    return {
      success: true,
      data: classes
    };
  } catch (error) {
    console.error('Error getting teacher classes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a new class with teacher as the owner.
 * @param {string} teacherId - The ID of the teacher creating the class.
 * @param {Object} classData - The data for the new class.
 * @param {string} classData.name - The name of the class.
 * @returns {Promise<Object>} - Result of the class creation.
 */
export async function createClass(teacherId, classData) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    if (!classData || !classData.name) {
      throw new Error('Class name is required');
    }
    
    // Generate a join code
    const joinCode = generateJoinCode();
    
    // Create the class document
    const classRef = db.collection('classes').doc();
    
    const fullClassData = {
      classId: classRef.id, // Store ID inside the document for easier reference
      name: classData.name,
      teacherId,
      joinCode,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      description: classData.description || null,
      location: classData.location || null,
      schedule: classData.schedule || null
    };
    
    await classRef.set(fullClassData);
    
    return {
      success: true,
      data: {
        ...fullClassData,
        classId: classRef.id
      }
    };
  } catch (error) {
    console.error('Error creating class:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates class information (name, join code, etc.).
 * @param {string} classId - The ID of the class to update.
 * @param {string} teacherId - The ID of the teacher updating the class.
 * @param {Object} updatedData - The updated class data.
 * @returns {Promise<Object>} - Result of the update operation.
 */
export async function updateClassDetails(classId, teacherId, updatedData) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the class to check if the teacher is the owner
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Check if the teacher is the owner of the class
    if (classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to update this class');
    }
    
    // Remove fields that shouldn't be updated
    const safeUpdatedData = { ...updatedData };
    delete safeUpdatedData.classId;
    delete safeUpdatedData.teacherId;
    delete safeUpdatedData.created_at;
    
    // Add last updated timestamp
    safeUpdatedData.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    
    await db.collection('classes').doc(classId).update(safeUpdatedData);
    
    return {
      success: true,
      message: 'Class updated successfully'
    };
  } catch (error) {
    console.error('Error updating class details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a new unique join code for a class.
 * @param {string} classId - The ID of the class.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - The new join code.
 */
export async function generateClassJoinCode(classId, teacherId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the class to check if the teacher is the owner
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Check if the teacher is the owner of the class
    if (classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to generate a join code for this class');
    }
    
    // Generate a new unique join code
    const newJoinCode = generateJoinCode();
    
    // Update the class document with the new join code
    await db.collection('classes').doc(classId).update({
      joinCode: newJoinCode,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      data: {
        joinCode: newJoinCode
      }
    };
  } catch (error) {
    console.error('Error generating class join code:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns all students enrolled in a specific class.
 * @param {string} classId - The ID of the class.
 * @param {string} [teacherId] - The ID of the teacher (optional, used to verify ownership).
 * @returns {Promise<Object>} - List of students.
 */
export async function getClassStudents(classId, teacherId) {
  try {
    const { db } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    // Get the class to check if it exists
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // If teacherId is provided, check if they're the owner
    if (teacherId && classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to view students in this class');
    }
    
    // Get all students in the class
    const studentsSnapshot = await db.collection(`classes/${classId}/students`).get();
    
    if (studentsSnapshot.empty) {
      return {
        success: true,
        data: []
      };
    }
    
    // Get the user details for each student
    const studentDetailPromises = studentsSnapshot.docs.map(async (doc) => {
      const studentId = doc.id;
      const enrollmentData = doc.data();
      
      try {
        const userDoc = await db.collection('users').doc(studentId).get();
        
        if (!userDoc.exists) {
          return {
            studentId,
            displayName: 'Unknown Student',
            email: 'unknown',
            joinDate: enrollmentData.joinDate,
            joinDateFormatted: enrollmentData.joinDate ? enrollmentData.joinDate.toDate().toLocaleString() : 'N/A'
          };
        }
        
        const userData = userDoc.data();
        
        return {
          studentId,
          displayName: userData.displayName || 'No Name',
          email: userData.email || 'No Email',
          joinDate: enrollmentData.joinDate,
          joinDateFormatted: enrollmentData.joinDate ? enrollmentData.joinDate.toDate().toLocaleString() : 'N/A'
        };
      } catch (error) {
        console.error(`Error getting details for student ${studentId}:`, error);
        return {
          studentId,
          displayName: 'Error Loading Student',
          email: 'error',
          joinDateFormatted: 'Error'
        };
      }
    });
    
    const students = await Promise.all(studentDetailPromises);
    
    return {
      success: true,
      data: students
    };
  } catch (error) {
    console.error('Error getting class students:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Removes a student from a class.
 * @param {string} classId - The ID of the class.
 * @param {string} studentId - The ID of the student.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Result of the removal operation.
 */
export async function removeStudentFromClass(classId, studentId, teacherId) {
  try {
    const { db } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the class to check if it exists and if the teacher is the owner
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Check if the teacher is the owner of the class
    if (classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to remove students from this class');
    }
    
    // Check for active sessions for this class
    const activeSessions = await db.collection('sessions')
      .where('classId', '==', classId)
      .where('status', '==', 'active')
      .get();
    
    if (!activeSessions.empty) {
      throw new Error('Cannot remove student while there are active sessions for this class');
    }
    
    // Check if the student is enrolled in this class
    const classStudentRef = db.collection(`classes/${classId}/students`).doc(studentId);
    const classStudentDoc = await classStudentRef.get();
    
    if (!classStudentDoc.exists) {
      throw new Error('This student is not enrolled in the class');
    }
    
    // Remove the student from the class
    const userClassRef = db.collection(`userClasses/${studentId}/classes`).doc(classId);
    
    // Perform both operations as a batch
    const batch = db.batch();
    batch.delete(classStudentRef);
    batch.delete(userClassRef);
    
    await batch.commit();
    
    return {
      success: true,
      message: 'Student removed from class successfully'
    };
  } catch (error) {
    console.error('Error removing student from class:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns attendance statistics for all sessions in a class.
 * @param {string} classId - The ID of the class.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Attendance statistics.
 */
export async function getClassAttendanceHistory(classId, teacherId) {
  try {
    const { db } = getFirebase();
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the class to check if it exists and if the teacher is the owner
    const classDoc = await db.collection('classes').doc(classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Check if the teacher is the owner of the class
    if (classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to view attendance for this class');
    }
    
    // Get all sessions for this class
    const sessionsSnapshot = await db.collection('sessions')
      .where('classId', '==', classId)
      .get();
    
    if (sessionsSnapshot.empty) {
      return {
        success: true,
        data: {
          totalSessions: 0,
          sessions: []
        }
      };
    }
    
    // Get enrolled students count
    const studentsSnapshot = await db.collection(`classes/${classId}/students`).get();
    const enrolledStudentCount = studentsSnapshot.size;
    
    // Process each session for attendance data
    const sessionPromises = sessionsSnapshot.docs.map(async (sessionDoc) => {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Get attendance records for this session
      const attendanceSnapshot = await db.collection(`sessions/${sessionId}/attendance`).get();
      
      // Calculate attendance statistics
      const verified = attendanceSnapshot.docs.filter(doc => doc.data().status === 'verified').length;
      const failed = attendanceSnapshot.docs.filter(doc => doc.data().status === 'failed_location').length;
      const earlyCheckout = attendanceSnapshot.docs.filter(doc => doc.data().status === 'checked_out_early_before_verification').length;
      const absent = enrolledStudentCount - attendanceSnapshot.size;
      
      // Calculate attendance rate
      const attendanceRate = enrolledStudentCount > 0 
        ? (attendanceSnapshot.size / enrolledStudentCount) * 100 
        : 0;
      
      return {
        sessionId,
        startTime: sessionData.startTime,
        startTimeFormatted: sessionData.startTime ? sessionData.startTime.toDate().toLocaleString() : 'N/A',
        endTime: sessionData.endTime,
        endTimeFormatted: sessionData.endTime ? sessionData.endTime.toDate().toLocaleString() : 'N/A',
        status: sessionData.status,
        attendanceCount: attendanceSnapshot.size,
        verified,
        failed,
        earlyCheckout,
        absent,
        attendanceRate: Math.round(attendanceRate * 100) / 100 // Round to 2 decimal places
      };
    });
    
    const sessionsAttendance = await Promise.all(sessionPromises);
    
    // Sort sessions by start time (most recent first)
    sessionsAttendance.sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return b.startTime.seconds - a.startTime.seconds;
    });
    
    // Calculate overall class statistics
    const totalSessions = sessionsAttendance.length;
    
    let overallVerified = 0;
    let overallFailed = 0;
    let overallEarlyCheckout = 0;
    let overallAbsent = 0;
    let totalPossibleAttendance = 0;
    
    sessionsAttendance.forEach(session => {
      overallVerified += session.verified;
      overallFailed += session.failed;
      overallEarlyCheckout += session.earlyCheckout;
      overallAbsent += session.absent;
      totalPossibleAttendance += enrolledStudentCount;
    });
    
    const overallAttendanceRate = totalPossibleAttendance > 0
      ? ((overallVerified + overallFailed + overallEarlyCheckout) / totalPossibleAttendance) * 100
      : 0;
    
    return {
      success: true,
      data: {
        totalSessions,
        enrolledStudentCount,
        overallAttendanceRate: Math.round(overallAttendanceRate * 100) / 100,
        overallVerified,
        overallFailed,
        overallEarlyCheckout,
        overallAbsent,
        sessions: sessionsAttendance
      }
    };
  } catch (error) {
    console.error('Error getting class attendance history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a new attendance session.
 * @param {string} teacherId - The ID of the teacher.
 * @param {Object} sessionData - The data for the new session.
 * @param {string} sessionData.classId - The ID of the class.
 * @param {Object} sessionData.location - The location data (latitude, longitude).
 * @param {number} sessionData.radius - The radius in meters for valid check-ins.
 * @returns {Promise<Object>} - Result of the session creation.
 */
export async function createAttendanceSession(teacherId, sessionData) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    if (!sessionData || !sessionData.classId) {
      throw new Error('Class ID is required');
    }
    
    if (!sessionData.location || typeof sessionData.location !== 'object' || 
        typeof sessionData.location.latitude !== 'number' || 
        typeof sessionData.location.longitude !== 'number') {
      throw new Error('Valid location data is required');
    }
    
    if (!sessionData.radius || typeof sessionData.radius !== 'number') {
      throw new Error('Valid radius is required');
    }
    
    // Get the class to check if it exists and if the teacher is the owner
    const classDoc = await db.collection('classes').doc(sessionData.classId).get();
    
    if (!classDoc.exists) {
      throw new Error('Class not found');
    }
    
    const classData = classDoc.data();
    
    // Check if the teacher is the owner of the class
    if (classData.teacherId !== teacherId) {
      throw new Error('You do not have permission to create sessions for this class');
    }
    
    // Check for already active sessions for this class
    const activeSessionsSnapshot = await db.collection('sessions')
      .where('classId', '==', sessionData.classId)
      .where('status', '==', 'active')
      .get();
    
    if (!activeSessionsSnapshot.empty) {
      throw new Error('There is already an active session for this class');
    }
    
    // Create the session
    const sessionRef = db.collection('sessions').doc();
    
    const fullSessionData = {
      sessionId: sessionRef.id, // Store ID inside the document for easier reference
      classId: sessionData.classId,
      teacherId,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      endTime: null,
      status: 'active',
      location: new firebase.firestore.GeoPoint(
        sessionData.location.latitude,
        sessionData.location.longitude
      ),
      radius: sessionData.radius,
      created_at: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await sessionRef.set(fullSessionData);
    
    return {
      success: true,
      data: {
        ...fullSessionData,
        sessionId: sessionRef.id
      }
    };
  } catch (error) {
    console.error('Error creating attendance session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Activates a session and enables student check-ins.
 * @param {string} sessionId - The ID of the session.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Result of the session activation.
 */
export async function startAttendanceSession(sessionId, teacherId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the session to check if it exists and if the teacher is the owner
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the teacher is the owner of the session
    if (sessionData.teacherId !== teacherId) {
      throw new Error('You do not have permission to start this session');
    }
    
    // Check if session is already active
    if (sessionData.status === 'active') {
      return {
        success: true,
        message: 'Session is already active'
      };
    }
    
    // Check if session is ended
    if (sessionData.status === 'ended') {
      throw new Error('Cannot restart an ended session');
    }
    
    // Update session status to active
    await db.collection('sessions').doc(sessionId).update({
      status: 'active',
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      endTime: null
    });
    
    return {
      success: true,
      message: 'Session started successfully'
    };
  } catch (error) {
    console.error('Error starting attendance session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Closes a session and finalizes attendance records.
 * @param {string} sessionId - The ID of the session.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Result of the session completion.
 */
export async function endAttendanceSession(sessionId, teacherId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Get the session to check if it exists and if the teacher is the owner
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the teacher is the owner of the session
    if (sessionData.teacherId !== teacherId) {
      throw new Error('You do not have permission to end this session');
    }
    
    // Check if session is already ended
    if (sessionData.status === 'ended') {
      return {
        success: true,
        message: 'Session is already ended'
      };
    }
    
    // Update session status to ended
    await db.collection('sessions').doc(sessionId).update({
      status: 'ended',
      endTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: 'Session ended successfully'
    };
  } catch (error) {
    console.error('Error ending attendance session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates the GPS coordinates and check-in radius for a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} teacherId - The ID of the teacher.
 * @param {Object} location - The location data (latitude, longitude).
 * @param {number} radius - The radius in meters for valid check-ins.
 * @returns {Promise<Object>} - Result of the update operation.
 */
export async function updateSessionLocation(sessionId, teacherId, location, radius) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    if (!location || typeof location !== 'object' || 
        typeof location.latitude !== 'number' || 
        typeof location.longitude !== 'number') {
      throw new Error('Valid location data is required');
    }
    
    if (typeof radius !== 'number' || radius <= 0) {
      throw new Error('Valid radius is required');
    }
    
    // Get the session to check if it exists and if the teacher is the owner
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the teacher is the owner of the session
    if (sessionData.teacherId !== teacherId) {
      throw new Error('You do not have permission to update this session');
    }
    
    // Check if session is active
    if (sessionData.status !== 'active') {
      throw new Error('Cannot update location for an inactive session');
    }
    
    // Update session location and radius
    await db.collection('sessions').doc(sessionId).update({
      location: new firebase.firestore.GeoPoint(location.latitude, location.longitude),
      radius,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: 'Session location updated successfully'
    };
  } catch (error) {
    console.error('Error updating session location:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns real-time attendance data for an active session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} [teacherId] - The ID of the teacher (optional, used to verify ownership).
 * @returns {Promise<Object>} - Attendance data.
 */
export async function getSessionAttendance(sessionId, teacherId) {
  try {
    const { db } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    // Get the session to check if it exists
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // If teacherId is provided, check if they're the owner
    if (teacherId && sessionData.teacherId !== teacherId) {
      throw new Error('You do not have permission to view attendance for this session');
    }
    
    // Get all students in the class
    const enrolledStudentsSnapshot = await db.collection(`classes/${sessionData.classId}/students`).get();
    const enrolledStudentIds = enrolledStudentsSnapshot.docs.map(doc => doc.id);
    
    // Get attendance records for this session
    const attendanceSnapshot = await db.collection(`sessions/${sessionId}/attendance`).get();
    
    // Create a map of student IDs to attendance records
    const attendanceMap = {};
    attendanceSnapshot.docs.forEach(doc => {
      attendanceMap[doc.id] = doc.data();
    });
    
    // Get the details for all enrolled students and their attendance status
    const attendanceRecords = [];
    
    for (const studentId of enrolledStudentIds) {
      try {
        const userDoc = await db.collection('users').doc(studentId).get();
        const userData = userDoc.exists ? userDoc.data() : { displayName: 'Unknown Student', email: 'unknown' };
        
        const attendanceRecord = attendanceMap[studentId];
        
        const record = {
          studentId,
          displayName: userData.displayName || 'No Name',
          email: userData.email || 'No Email'
        };
        
        if (attendanceRecord) {
          record.attended = true;
          record.status = attendanceRecord.status;
          record.checkInTime = attendanceRecord.checkInTime;
          record.checkInTimeFormatted = attendanceRecord.checkInTime ? 
            attendanceRecord.checkInTime.toDate().toLocaleString() : 'N/A';
          record.checkOutTime = attendanceRecord.checkOutTime;
          record.checkOutTimeFormatted = attendanceRecord.checkOutTime ? 
            attendanceRecord.checkOutTime.toDate().toLocaleString() : 'N/A';
          record.distance = attendanceRecord.distance;
          record.isGpsVerified = attendanceRecord.isGpsVerified;
        } else {
          record.attended = false;
          record.status = 'absent';
        }
        
        attendanceRecords.push(record);
      } catch (err) {
        console.error(`Error processing attendance for student ${studentId}:`, err);
      }
    }
    
    // Calculate attendance statistics
    const verified = attendanceRecords.filter(record => record.status === 'verified').length;
    const failed = attendanceRecords.filter(record => record.status === 'failed_location').length;
    const earlyCheckout = attendanceRecords.filter(record => record.status === 'checked_out_early_before_verification').length;
    const absent = attendanceRecords.filter(record => record.status === 'absent').length;
    
    // Calculate attendance rate
    const attendanceRate = enrolledStudentIds.length > 0 
      ? ((verified + failed + earlyCheckout) / enrolledStudentIds.length) * 100 
      : 0;
    
    return {
      success: true,
      data: {
        sessionId,
        classId: sessionData.classId,
        status: sessionData.status,
        startTimeFormatted: sessionData.startTime ? sessionData.startTime.toDate().toLocaleString() : 'N/A',
        endTimeFormatted: sessionData.endTime ? sessionData.endTime.toDate().toLocaleString() : 'N/A',
        enrolledStudentCount: enrolledStudentIds.length,
        presentCount: verified + failed + earlyCheckout,
        verified,
        failed,
        earlyCheckout,
        absent,
        attendanceRate: Math.round(attendanceRate * 100) / 100, // Round to 2 decimal places
        records: attendanceRecords
      }
    };
  } catch (error) {
    console.error('Error getting session attendance:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Allows teacher to override a student's attendance status.
 * @param {string} sessionId - The ID of the session.
 * @param {string} studentId - The ID of the student.
 * @param {string} status - The new attendance status.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Result of the override operation.
 */
export async function manuallyMarkAttendance(sessionId, studentId, status, teacherId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    if (!status) {
      throw new Error('Status is required');
    }
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }
    
    // Validate status
    const validStatuses = ['verified', 'failed_location', 'checked_out_early_before_verification', 'absent'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status. Must be one of: ' + validStatuses.join(', '));
    }
    
    // Get the session to check if it exists and if the teacher is the owner
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the teacher is the owner of the session
    if (sessionData.teacherId !== teacherId) {
      throw new Error('You do not have permission to update attendance for this session');
    }
    
    // Get the attendance record if it exists
    const attendanceRef = db.collection(`sessions/${sessionId}/attendance`).doc(studentId);
    const attendanceDoc = await attendanceRef.get();
    
    // Check if student is enrolled in the class
    const studentClassRef = db.collection(`classes/${sessionData.classId}/students`).doc(studentId);
    const studentClassDoc = await studentClassRef.get();
    
    if (!studentClassDoc.exists) {
      throw new Error('Student is not enrolled in this class');
    }
    
    if (status === 'absent') {
      // If marking as absent and there is an attendance record, delete it
      if (attendanceDoc.exists) {
        await attendanceRef.delete();
      }
    } else {
      // For other statuses, create or update the attendance record
      const now = firebase.firestore.FieldValue.serverTimestamp();
      
      if (attendanceDoc.exists) {
        // Update existing attendance record
        const updateData = {
          status,
          lastUpdated: now,
          manuallyUpdated: true,
          manuallyUpdatedBy: teacherId
        };
        
        await attendanceRef.update(updateData);
      } else {
        // Create new attendance record
        const attendanceData = {
          studentId,
          classId: sessionData.classId,
          checkInTime: now,
          checkOutTime: null,
          status,
          isGpsVerified: status === 'verified',
          manuallyCreated: true,
          manuallyCreatedBy: teacherId,
          lastUpdated: now
        };
        
        await attendanceRef.set(attendanceData);
      }
    }
    
    return {
      success: true,
      message: `Student attendance successfully marked as '${status}'`
    };
  } catch (error) {
    console.error('Error manually marking attendance:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns all sessions for a teacher.
 * @param {string} teacherId - The ID of the teacher.
 * @param {Object} options - Query options.
 * @param {string} options.status - Filter by session status ('active', 'ended', 'all').
 * @param {string} options.classId - Filter by class ID.
 * @returns {Promise<Object>} - List of sessions.
 */
export async function getTeacherSessions(teacherId, options = {}) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!teacherId) {
      throw new Error('Teacher ID is required');
    }

    // First check if the teacher actually exists
    const teacherDoc = await db.collection('users').doc(teacherId).get();
    if (!teacherDoc.exists) {
      return {
        success: false,
        error: `Teacher with ID "${teacherId}" does not exist`
      };
    }
    
    // Build the query
    let sessionsQuery = db.collection('sessions').where('teacherId', '==', teacherId);
    
    // Apply status filter if provided
    if (options.status && options.status !== 'all') {
      sessionsQuery = sessionsQuery.where('status', '==', options.status);
    }
    
    // Apply class filter if provided
    if (options.classId) {
      sessionsQuery = sessionsQuery.where('classId', '==', options.classId);
    }
    
    // Execute the query
    const sessionsSnapshot = await sessionsQuery.get();
    
    if (sessionsSnapshot.empty) {
      return {
        success: true,
        data: [] // No sessions found
      };
    }
    
    const sessions = [];
    
    // Process each session
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Get class details
      const classDoc = await db.collection('classes').doc(sessionData.classId).get();
      const className = classDoc.exists ? classDoc.data().name : 'Unknown Class';
      
      // Get attendance count
      const attendanceSnapshot = await db.collection(`sessions/${sessionId}/attendance`).get();
      const attendanceCount = attendanceSnapshot.size;
      
      // Format session data
      const formattedSession = {
        sessionId,
        classId: sessionData.classId,
        className,
        attendanceCount,
        ...sessionData
      };
      
      // Format timestamps if they exist
      if (sessionData.startTime) {
        formattedSession.startTimeFormatted = sessionData.startTime.toDate().toLocaleString();
      }
      
      if (sessionData.endTime) {
        formattedSession.endTimeFormatted = sessionData.endTime.toDate().toLocaleString();
      }
      
      sessions.push(formattedSession);
    }
    
    // Sort sessions by start time (most recent first)
    sessions.sort((a, b) => {
      if (!a.startTime || !b.startTime) return 0;
      return b.startTime.seconds - a.startTime.seconds;
    });
    
    return {
      success: true,
      data: sessions
    };
  } catch (error) {
    console.error('Error getting teacher sessions:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate a random join code for classes
 * @returns {string} - A 6-character alphanumeric join code
 */
function generateJoinCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Alias for endAttendanceSession for backwards compatibility
 * @param {string} sessionId - The ID of the session.
 * @param {string} teacherId - The ID of the teacher.
 * @returns {Promise<Object>} - Result of the session completion.
 */
export async function endSession(sessionId, teacherId) {
  return endAttendanceSession(sessionId, teacherId);
}

// Export all functions to ensure they're available where needed
// export {
//   getTeacherClasses,
//   createClass,
//   updateClassDetails,
//   generateClassJoinCode,
//   getClassStudents,
//   removeStudentFromClass,
//   getClassAttendanceHistory,
//   createAttendanceSession,
//   startAttendanceSession,
//   endAttendanceSession,
//   updateSessionLocation,
//   getSessionAttendance,
//   manuallyMarkAttendance,
//   //getTeacherSessions
//   // endSession is already exported with its function declaration
// };