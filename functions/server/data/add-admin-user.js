/**
 * Admin User Creator for CleO
 * Creates just the admin user in Firestore for testing and development
 */

const { info, warn, error } = require('firebase-functions/logger');
const { createOrUpdateUser } = require('./organize_data.js');
const admin = require('firebase-admin');

// Admin user data
const adminUserData = {
  uid: 'admin',
  email: 'admin@cleouniversity.edu',
  displayName: 'System Administrator',
  role: 'admin',
  created_at: admin.firestore.FieldValue.serverTimestamp()
};

/**
 * Adds the admin user to the database
 * @returns {Promise<Object>} - Result of admin user creation
 */
async function addAdminUser() {
  try {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    
    info('Adding admin user to the database...');
    
    // Create the admin user
    const createdAdmin = await createOrUpdateUser(adminUserData.uid, adminUserData);
    
    info('Admin user added successfully!');
    
    return { 
      success: true, 
      admin: createdAdmin
    };
  } catch (err) {
    error('Error adding admin user:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Command line execution support
 */
if (require.main === module) {
  addAdminUser()
    .then(result => {
      if (result.success) {
        console.log('✅ Admin user added successfully');
      } else {
        console.error('❌ Failed to add admin user:', result.error);
      }
      process.exit(result.success ? 0 : 1);
    });
}

module.exports = {
  addAdminUser,
  adminUserData
};