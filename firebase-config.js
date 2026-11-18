// Firebase web configuration (public browser credentials)
// Enable Email/Password and Google providers in Firebase Console > Authentication > Sign-in method.
window.CDLU_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDBslgxNbHCcWOG80hYayJeyYNTqg2i8to',
  authDomain: 'cdlu-exam.firebaseapp.com',
  projectId: 'cdlu-exam',
  storageBucket: 'cdlu-exam.firebasestorage.app',
  messagingSenderId: '587035204386',
  appId: '1:587035204386:web:1f7288f175cafc83fa237b',
  measurementId: 'G-95CERX0V5H'
};

// Browser-only role allowlist. The account itself must already exist in Firebase Authentication.
// Keep this to one account. For production security, move role checks to Firebase custom claims.
window.CDLU_ADMIN_EMAIL = 'admin@cdlu.ac.in';
