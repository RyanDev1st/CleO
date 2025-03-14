
//-----G_Vars--------// 
let provider;
let auth;

const login = document.getElementById('login');
const logout = document.getElementById('logout');
const nullSession = document.getElementById('nullSession');
const inSession = document.getElementById('inSession');
const H1 = document.getElementById('H1');
var H2;
//-----Event Listeners--------//

document.addEventListener('DOMContentLoaded', function() {
  const app = firebase.app();

  provider = new firebase.auth.GoogleAuthProvider();

  firebase.auth().onAuthStateChanged(user => {
  // Firebase is now initialized - safe to call Firestore methods
  if (user) {
    DataHandler.getAll()
      .then(data => console.log(data))
      .catch(err => console.error(err));
  }
});
});


//-----Functions--------// 

function onLogin_Google() {
  if (!firebase.auth || !firebase.auth.GoogleAuthProvider) {
    console.error("Firebase is not fully loaded yet.");
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider)
  .then(result => {
    const user = result.user;
    console.log('User is signed in', user);
    nullSession.style.display = "none";
    inSession.style.display  = "block";
    H1.innerHTML = `Hello ${user.displayName}`;
    logout.style.display = 'block';
  }
  ) .catch(error => {
    console.error('Login Error', error);
  });
    

};
  

function onLogout_Google()  {
  firebase.auth().signOut()
  .then(() => {
    console.log('User is not signed in');
    nullSession.style.display  = "block";
    inSession.style.display  = "none";

  })
  .catch(error => {
    console.error('Logout Error', error);
  });
};

DataHandler = {
    getAll: async function() {
        try {
          const snapshot = await firebase.firestore().collection('users').get();
          return snapshot.docs.map(doc => doc.data());
        } catch (error) {
          console.error("Error getting documents:", error);
          throw error; // Re-throw or handle as appropriate
        }
    },

  getid: async function(id) {
    const snapshot = await fi8rebase.firestore().collection('users').doc(id).get();
    return snapshot.data();
  },

  getSession: async function() {
    const user = firebase.auth().currentUser;
    if (user) {
      return user;
    }
    return null;
  }, 

  update: async function(id, data) {
    await firebase.firestore().collection('users').doc(id).update(data);
  },

  signup: async function(data) {
    await firebase.firestore().collection('users').add(data);
  },

  deleteUser: async function(id) {
    await firebase.firestore().collection('users').doc(id).delete();
  }
}

/*-----Http Sender----*/
