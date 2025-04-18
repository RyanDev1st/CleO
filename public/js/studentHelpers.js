// filepath: d:\CleO\public\js\studentHelpers.js
/**
 * Student Helper Functions for CleO
 * 
 * These functions are specifically for student users.
 */

import { getFirebase } from './firebase-init.js';
import { validateLocationForSession } from './sharedHelpers.js';

/**
 * Returns all classes a student is enrolled in.
 * @param {string} studentId - The ID of the student.
 * @returns {Promise<Object>} - List of classes.
 */
export async function getStudentClasses(studentId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    // First check if the student actually exists
    const studentDoc = await db.collection('users').doc(studentId).get();
    if (!studentDoc.exists) {
      return {
        success: false,
        error: `Student with ID "${studentId}" does not exist`
      };
    }
    
    // Get the user's classes from userClasses subcollection
    const userClassesSnapshot = await db.collection(`userClasses/${studentId}/classes`).get();
    
    if (userClassesSnapshot.empty) {
      // Student exists but isn't enrolled in any classes
      return {
        success: true,
        data: []
      };
    }
    
    // Process in batches since 'in' operator has a limit of 10
    const classIds = userClassesSnapshot.docs.map(doc => doc.id);
    const classes = [];
    const batchSize = 10;
    
    for (let i = 0; i < classIds.length; i += batchSize) {
      const batch = classIds.slice(i, i + batchSize);
      
      // Fix documentId path by using firebase.firestore.FieldPath
      const classesSnapshot = await db.collection('classes')
        .where(firebase.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      
      // Merge class data with joined data
      for (const classDoc of classesSnapshot.docs) {
        const classData = classDoc.data();
        const userClassDoc = userClassesSnapshot.docs.find(d => d.id === classDoc.id);
        
        if (userClassDoc) {
          const userClassData = userClassDoc.data();
          
          classes.push({
            classId: classDoc.id,
            ...classData,
            joinDate: userClassData.joinDate,
            joinDateFormatted: userClassData.joinDate ? userClassData.joinDate.toDate().toLocaleString() : 'N/A',
            teacherName: userClassData.teacherName || 'Unknown Teacher'
          });
        }
      }
    }
    
    return {
      success: true,
      data: classes
    };
  } catch (error) {
    console.error('Error getting student classes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Enrolls a student in a class using a join code.
 * @param {string} studentId - The ID of the student.
 * @param {string} joinCode - The join code of the class.
 * @returns {Promise<Object>} - Result of the enrollment operation.
 */
export async function joinClassWithCode(studentId, joinCode) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    if (!joinCode) {
      throw new Error('Join code is required');
    }
    
    // Find the class with the provided join code
    const classesSnapshot = await db.collection('classes')
      .where('joinCode', '==', joinCode)
      .limit(1)
      .get();
    
    if (classesSnapshot.empty) {
      throw new Error('Invalid join code. No class found with this code.');
    }
    
    const classDoc = classesSnapshot.docs[0];
    const classData = classDoc.data();
    const classId = classDoc.id;
    
    // Check if student is already enrolled in this class
    const studentClassRef = db.collection(`userClasses/${studentId}/classes`).doc(classId);
    const studentClassDoc = await studentClassRef.get();
    
    if (studentClassDoc.exists) {
      throw new Error('You are already enrolled in this class');
    }
    
    // Get teacher information
    const teacherDoc = await db.collection('users').doc(classData.teacherId).get();
    const teacherName = teacherDoc.exists ? teacherDoc.data().displayName : 'Unknown Teacher';
    
    // Add student to class students subcollection
    const classStudentRef = db.collection(`classes/${classId}/students`).doc(studentId);
    
    // Add class to student's classes subcollection
    const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    
    // Perform both operations as a batch
    const batch = db.batch();
    
    batch.set(classStudentRef, {
      joinDate: timestamp
    });
    
    batch.set(studentClassRef, {
      className: classData.name,
      teacherName,
      joinDate: timestamp
    });
    
    await batch.commit();
    
    return {
      success: true,
      data: {
        classId,
        className: classData.name,
        teacherName,
        message: `Successfully joined class: ${classData.name}`
      }
    };
  } catch (error) {
    console.error('Error joining class with code:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Removes a student from a class.
 * @param {string} studentId - The ID of the student.
 * @param {string} classId - The ID of the class.
 * @returns {Promise<Object>} - Result of the leave operation.
 */
export async function leaveClass(studentId, classId) {
  try {
    const { db } = getFirebase();
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    if (!classId) {
      throw new Error('Class ID is required');
    }
    
    // Check if student is enrolled in this class
    const studentClassRef = db.collection(`userClasses/${studentId}/classes`).doc(classId);
    const studentClassDoc = await studentClassRef.get();
    
    if (!studentClassDoc.exists) {
      throw new Error('You are not enrolled in this class');
    }
    
    // Check for active sessions for this class
    const now = new Date();
    const activeSessions = await db.collection('sessions')
      .where('classId', '==', classId)
      .where('status', '==', 'active')
      .get();
    
    if (!activeSessions.empty) {
      throw new Error('Cannot leave class with active sessions. Please check out from all active sessions first.');
    }
    
    // Remove the class from student's classes
    const classStudentRef = db.collection(`classes/${classId}/students`).doc(studentId);
    
    // Perform both operations as a batch
    const batch = db.batch();
    batch.delete(studentClassRef);
    batch.delete(classStudentRef);
    
    await batch.commit();
    
    return {
      success: true,
      message: 'Successfully left the class'
    };
  } catch (error) {
    console.error('Error leaving class:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns all currently active sessions across student's enrolled classes.
 * @param {string} studentId - The ID of the student.
 * @returns {Promise<Object>} - List of active sessions.
 */
export async function getActiveSessionsForStudent(studentId) {
  try {
    const { db } = getFirebase();
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    // Get all classes the student is enrolled in
    const userClassesSnapshot = await db.collection(`userClasses/${studentId}/classes`).get();
    
    if (userClassesSnapshot.empty) {
      return {
        success: true,
        data: []
      };
    }
    
    const classIds = userClassesSnapshot.docs.map(doc => doc.id);
    const sessions = [];
    const batchSize = 10;
    
    // Process in batches since 'in' operator has a limit of 10
    for (let i = 0; i < classIds.length; i += batchSize) {
      const batch = classIds.slice(i, i + batchSize);
      
      // Query for active sessions in these classes
      const sessionsSnapshot = await db.collection('sessions')
        .where('classId', 'in', batch)
        .where('status', '==', 'active')
        .get();
      
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;
        
        // Get class information
        const classId = sessionData.classId;
        const userClassDoc = userClassesSnapshot.docs.find(d => d.id === classId);
        const className = userClassDoc ? userClassDoc.data().className : 'Unknown Class';
        const teacherName = userClassDoc ? userClassDoc.data().teacherName : 'Unknown Teacher';
        
        // Get attendance status for this session
        const attendanceDoc = await db.collection(`sessions/${sessionId}/attendance`).doc(studentId).get();
        const hasAttended = attendanceDoc.exists;
        const attendanceStatus = hasAttended ? attendanceDoc.data().status : 'absent';
        
        // Format session data
        const formattedSession = {
          sessionId,
          classId,
          className,
          teacherName,
          hasAttended,
          attendanceStatus,
          ...sessionData
        };
        
        // Format timestamps if they exist
        if (sessionData.startTime) {
          formattedSession.startTimeFormatted = sessionData.startTime.toDate().toLocaleString();
        }
        
        sessions.push(formattedSession);
      }
    }
    
    return {
      success: true,
      data: sessions
    };
  } catch (error) {
    console.error('Error getting active sessions for student:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Returns a student's attendance records for a specific class.
 * @param {string} studentId - The ID of the student.
 * @param {string} classId - The ID of the class (optional).
 * @returns {Promise<Object>} - Attendance history.
 */
export async function getStudentAttendanceHistory(studentId, classId = null) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }

    // First check if the student actually exists
    const studentDoc = await db.collection('users').doc(studentId).get();
    if (!studentDoc.exists) {
      return {
        success: false,
        error: `Student with ID "${studentId}" does not exist`
      };
    }
    
    // Get all sessions for the class (or all classes the student is enrolled in)
    if (classId) {
      // Filter by specific class if provided
      const classDoc = await db.collection('classes').doc(classId).get();
      if (!classDoc.exists) {
        return {
          success: false,
          error: `Class with ID "${classId}" does not exist`
        };
      }
      
      const sessionsSnapshot = await db.collection('sessions')
        .where('classId', '==', classId)
        .get();
      
      if (sessionsSnapshot.empty) {
        return {
          success: true,
          data: [] // No sessions for this class yet
        };
      }
      
      const attendanceRecords = [];
      
      for (const sessionDoc of sessionsSnapshot.docs) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;
        const className = classDoc.data().name || 'Unknown Class';
        
        // Get attendance record if it exists
        const attendanceDoc = await db.collection(`sessions/${sessionId}/attendance`).doc(studentId).get();
        
        // Create record with session data
        const record = {
          sessionId,
          classId,
          className,
          startTime: sessionData.startTime,
          startTimeFormatted: sessionData.startTime ? sessionData.startTime.toDate().toLocaleString() : 'N/A',
          endTime: sessionData.endTime,
          endTimeFormatted: sessionData.endTime ? sessionData.endTime.toDate().toLocaleString() : 'N/A',
          status: sessionData.status
        };
        
        if (attendanceDoc.exists) {
          const attendanceData = attendanceDoc.data();
          
          record.attended = true;
          record.attendanceStatus = attendanceData.status;
          record.checkInTime = attendanceData.checkInTime;
          record.checkInTimeFormatted = attendanceData.checkInTime ? attendanceData.checkInTime.toDate().toLocaleString() : 'N/A';
          record.checkOutTime = attendanceData.checkOutTime;
          record.checkOutTimeFormatted = attendanceData.checkOutTime ? attendanceData.checkOutTime.toDate().toLocaleString() : 'N/A';
          record.isGpsVerified = attendanceData.isGpsVerified;
        } else {
          record.attended = false;
          record.attendanceStatus = 'absent';
        }
        
        attendanceRecords.push(record);
      }
      
      // Sort by session start time (most recent first)
      attendanceRecords.sort((a, b) => {
        if (!a.startTime || !b.startTime) return 0;
        return b.startTime.seconds - a.startTime.seconds;
      });
      
      return {
        success: true,
        data: attendanceRecords
      };
    } else {
      // Get all classes the student is enrolled in
      const userClassesSnapshot = await db.collection(`userClasses/${studentId}/classes`).get();
      
      if (userClassesSnapshot.empty) {
        return {
          success: true,
          data: [] // Student is not enrolled in any classes
        };
      }
      
      const classIds = userClassesSnapshot.docs.map(doc => doc.id);
      
      // Process in batches since 'in' operator has a limit of 10
      const allSessions = [];
      const batchSize = 10;
      
      for (let i = 0; i < classIds.length; i += batchSize) {
        const batch = classIds.slice(i, i + batchSize);
        
        // Use firebase.firestore.FieldPath.documentId() instead of db.FieldPath
        const sessionsSnapshot = await db.collection('sessions')
          .where('classId', 'in', batch)
          .get();
        
        allSessions.push(...sessionsSnapshot.docs);
      }
      
      // Process attendance for each session
      const attendanceRecords = [];
      
      for (const sessionDoc of allSessions) {
        const sessionData = sessionDoc.data();
        const sessionId = sessionDoc.id;
        
        // Get class information
        const classDoc = await db.collection('classes').doc(sessionData.classId).get();
        const className = classDoc.exists ? classDoc.data().name : 'Unknown Class';
        
        // Get attendance record if it exists
        const attendanceDoc = await db.collection(`sessions/${sessionId}/attendance`).doc(studentId).get();
        
        // Create record with session data
        const record = {
          sessionId,
          classId: sessionData.classId,
          className,
          startTime: sessionData.startTime,
          startTimeFormatted: sessionData.startTime ? sessionData.startTime.toDate().toLocaleString() : 'N/A',
          endTime: sessionData.endTime,
          endTimeFormatted: sessionData.endTime ? sessionData.endTime.toDate().toLocaleString() : 'N/A',
          status: sessionData.status
        };
        
        if (attendanceDoc.exists) {
          const attendanceData = attendanceDoc.data();
          
          record.attended = true;
          record.attendanceStatus = attendanceData.status;
          record.checkInTime = attendanceData.checkInTime;
          record.checkInTimeFormatted = attendanceData.checkInTime ? attendanceData.checkInTime.toDate().toLocaleString() : 'N/A';
          record.checkOutTime = attendanceData.checkOutTime;
          record.checkOutTimeFormatted = attendanceData.checkOutTime ? attendanceData.checkOutTime.toDate().toLocaleString() : 'N/A';
          record.isGpsVerified = attendanceData.isGpsVerified;
        } else {
          record.attended = false;
          record.attendanceStatus = 'absent';
        }
        
        attendanceRecords.push(record);
      }
      
      // Sort by session start time (most recent first)
      attendanceRecords.sort((a, b) => {
        if (!a.startTime || !b.startTime) return 0;
        return b.startTime.seconds - a.startTime.seconds;
      });
      
      return {
        success: true,
        data: attendanceRecords
      };
    }
  } catch (error) {
    console.error('Error getting student attendance history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Submits a student's check-in with GPS data.
 * @param {string} sessionId - The ID of the session.
 * @param {string} studentId - The ID of the student.
 * @param {Object} locationData - The student's location data.
 * @returns {Promise<Object>} - Result of the check-in operation.
 */
export async function checkInToSession(sessionId, studentId, locationData) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    if (!locationData || typeof locationData !== 'object' || 
        typeof locationData.latitude !== 'number' || 
        typeof locationData.longitude !== 'number') {
      throw new Error('Valid location data is required');
    }
    
    // Get the session details
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the session is active
    if (sessionData.status !== 'active') {
      throw new Error(`Session is ${sessionData.status}, not active`);
    }
    
    // Check if student is enrolled in this class
    const classId = sessionData.classId;
    const studentClassRef = db.collection(`userClasses/${studentId}/classes`).doc(classId);
    const studentClassDoc = await studentClassRef.get();
    
    if (!studentClassDoc.exists) {
      throw new Error('You are not enrolled in this class');
    }
    
    // Check if student already checked in
    const attendanceRef = db.collection(`sessions/${sessionId}/attendance`).doc(studentId);
    const attendanceDoc = await attendanceRef.get();
    
    if (attendanceDoc.exists) {
      throw new Error('You have already checked in to this session');
    }
    
    // Validate location
    const locationValidation = await validateLocationForSession(sessionId, locationData);
    
    if (!locationValidation.success) {
      throw new Error(`Location validation failed: ${locationValidation.error}`);
    }
    
    const isWithinRadius = locationValidation.data.isWithinRadius;
    const distance = locationValidation.data.distance;
    
    // Create attendance record
    const attendanceData = {
      studentId,
      classId,
      checkInTime: firebase.firestore.FieldValue.serverTimestamp(),
      checkInLocation: new firebase.firestore.GeoPoint(locationData.latitude, locationData.longitude),
      checkOutTime: null,
      status: isWithinRadius ? 'verified' : 'failed_location',
      distance,
      isGpsVerified: isWithinRadius,
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform
      },
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    await attendanceRef.set(attendanceData);
    
    return {
      success: true,
      data: {
        ...attendanceData,
        status: attendanceData.status,
        isWithinRadius,
        message: isWithinRadius ? 
          'Check-in successful! Your attendance has been verified.' : 
          'Check-in recorded, but you are outside the allowed radius.'
      }
    };
  } catch (error) {
    console.error('Error checking in to session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Records a student's early checkout from a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} studentId - The ID of the student.
 * @returns {Promise<Object>} - Result of the checkout operation.
 */
export async function checkOutFromSession(sessionId, studentId) {
  try {
    const { db, firebase } = getFirebase();
    
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    if (!studentId) {
      throw new Error('Student ID is required');
    }
    
    // Get the session details
    const sessionDoc = await db.collection('sessions').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error('Session not found');
    }
    
    const sessionData = sessionDoc.data();
    
    // Check if the session is active
    if (sessionData.status !== 'active') {
      throw new Error(`Session is ${sessionData.status}, not active`);
    }
    
    // Check if student has checked in
    const attendanceRef = db.collection(`sessions/${sessionId}/attendance`).doc(studentId);
    const attendanceDoc = await attendanceRef.get();
    
    if (!attendanceDoc.exists) {
      throw new Error('You have not checked in to this session');
    }
    
    // Check if student has already checked out
    const attendanceData = attendanceDoc.data();
    
    if (attendanceData.checkOutTime) {
      throw new Error('You have already checked out from this session');
    }
    
    // Update attendance record with checkout time
    await attendanceRef.update({
      checkOutTime: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'checked_out_early_before_verification',
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    return {
      success: true,
      message: 'Successfully checked out from the session'
    };
  } catch (error) {
    console.error('Error checking out from session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}