(() => {
  const config = window.CDLU_FIREBASE_CONFIG;
  if (!window.firebase || !config) {
    showMessage('Firebase did not load. Check your internet connection and configuration.', true);
    return;
  }

  if (!firebase.apps.length) firebase.initializeApp(config);
  const auth = firebase.auth();
  const adminEmail = (window.CDLU_ADMIN_EMAIL || '').trim().toLowerCase();

  function isAdminEmail(email) {
    return Boolean(email) && email.trim().toLowerCase() === adminEmail;
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authForms = document.getElementById('auth-forms');
  const userPanel = document.getElementById('user-panel');
  const message = document.getElementById('message');

  window.showMessage = (text, error = false) => {
    message.textContent = text;
    message.className = `message show ${error ? 'error' : 'success'}`;
  };

  function clearMessage() {
    message.className = 'message';
    message.textContent = '';
  }

  function switchTab(tabName) {
    clearMessage();
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    loginForm.classList.toggle('active', tabName === 'login');
    registerForm.classList.toggle('active', tabName === 'register');
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(
        document.getElementById('login-email').value.trim(),
        document.getElementById('login-password').value
      );
    } catch (error) {
      showMessage(friendlyError(error), true);
    } finally {
      button.disabled = false;
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    const button = registerForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const name = document.getElementById('register-name').value.trim();
      const email = document.getElementById('register-email').value.trim();
      if (isAdminEmail(email)) {
        showMessage('The administrator account can only be created in Firebase Console.', true);
        return;
      }
      const credential = await auth.createUserWithEmailAndPassword(
        email,
        document.getElementById('register-password').value
      );
      await credential.user.updateProfile({ displayName: name });
      await credential.user.sendEmailVerification();
      showMessage('Account created. A verification email has been sent.');
    } catch (error) {
      showMessage(friendlyError(error), true);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelectorAll('.google-button').forEach((button) => {
    button.addEventListener('click', async () => {
      clearMessage();
      button.disabled = true;
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await auth.signInWithPopup(provider);
      } catch (error) {
        showMessage(friendlyError(error), true);
      } finally {
        button.disabled = false;
      }
    });
  });

  document.getElementById('logout-button').addEventListener('click', async () => {
    await auth.signOut();
  });

  auth.onAuthStateChanged((user) => {
    if (user) {
      const isAdmin = isAdminEmail(user.email);
      authForms.style.display = 'none';
      userPanel.classList.add('show');
      document.getElementById('user-name').textContent = isAdmin
        ? (user.displayName || 'Portal Administrator')
        : (user.displayName || 'CDLU Student');
      document.getElementById('user-email').textContent = user.email || '';
      document.getElementById('user-role').textContent = isAdmin ? 'Administrator' : 'Student';
      document.getElementById('student-dashboard').style.display = isAdmin ? 'none' : 'grid';
      document.getElementById('admin-dashboard').style.display = isAdmin ? 'grid' : 'none';
      document.getElementById('user-avatar').textContent = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    } else {
      authForms.style.display = 'block';
      userPanel.classList.remove('show');
      clearMessage();
    }
  });

  function friendlyError(error) {
    const map = {
      'auth/email-already-in-use': 'This email is already registered. Please log in.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/weak-password': 'Password must contain at least 6 characters.',
      'auth/user-not-found': 'No account was found with this email.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/popup-closed-by-user': 'Google sign-in window was closed.',
      'auth/popup-blocked': 'Allow popups for this site to continue with Google.',
      'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication.'
    };
    return map[error.code] || error.message || 'Authentication failed. Please try again.';
  }
})();
