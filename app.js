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

  async function loadColleges() {
    const select = document.getElementById('register-college');
    try {
      const response = await fetch('/api/colleges');
      const colleges = await response.json();
      if (!response.ok) throw new Error(colleges.error || 'Could not load colleges');
      select.innerHTML = '<option value="">Select college / university</option>' + colleges
        .map((college) => `<option value="${college.id}">${escapeHtml(college.name)}</option>`)
        .join('');
    } catch (error) {
      select.innerHTML = '<option value="">Unable to load colleges</option>';
      showMessage(error.message, true);
    }
  }

  loadColleges();

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' 
    }[character]));
  }

  function registrationDetails() {
    const details = {
      name: document.getElementById('register-name').value.trim(),
      rollNo: document.getElementById('register-roll').value.trim(),
      collegeId: document.getElementById('register-college').value,
      course: document.getElementById('register-course').value.trim(),
      semester: document.getElementById('register-semester').value.trim(),
      phone: document.getElementById('register-phone').value.trim()
    };
    if (!details.name || !details.rollNo || !details.collegeId || !details.course || !details.semester) {
      throw new Error('Complete name, roll number, college, course and semester');
    }
    return details;
  }

  async function saveProfile(user, details) {
    const token = await user.getIdToken();
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(details)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save registration details');
    return data;
  }

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
      const details = registrationDetails();
      const credential = await auth.createUserWithEmailAndPassword(
        email,
        document.getElementById('register-password').value
      );
      await credential.user.updateProfile({ displayName: name });
      await credential.user.sendEmailVerification();
      await saveProfile(credential.user, details);
      showMessage('Account created and registration completed. A verification email has been sent.');
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
        const credential = await auth.signInWithPopup(provider);
        if (!isAdminEmail(credential.user.email)) {
          try {
            const details = registrationDetails();
            await saveProfile(credential.user, details);
          } catch (error) {
            if (!error.message.includes('Could not save')) throw error;
          }
        }
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

  async function authenticatedFetch(url, options = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('Please login again');
    const token = await user.getIdToken();
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) }
    });
  }

  async function loadStudentExams() {
    const list = document.getElementById('exam-list');
    try {
      const response = await authenticatedFetch('/api/exams');
      const exams = await response.json();
      if (!response.ok) throw new Error(exams.error || 'Could not load exams');
      if (!exams.length) {
        list.innerHTML = '<p>No exams scheduled.</p>';
        return;
      }
      list.innerHTML = exams.map((exam) => {
        const start = new Date(exam.start_at);
        const now = new Date();
        const attempt = exam.attempt;
        let status = now < start ? `Starts ${start.toLocaleString()}` : 'Exam is available';
        let button = '<button class="secondary" disabled>Not started</button>';
        if (attempt && attempt.status === 'submitted') {
          status = 'Submitted successfully';
          button = '<button class="secondary" disabled>Submitted</button>';
        } else if (attempt && attempt.status === 'in_progress') {
          status = 'Exam in progress';
          button = `<button class="secondary start-exam" data-id="${exam.id}">Continue exam</button>`;
        } else if (now >= start) {
          button = `<button class="secondary start-exam" data-id="${exam.id}">Start exam</button>`;
        }
        return `<article class="exam-card"><strong>${escapeHtml(exam.title)}</strong><span>${escapeHtml(status)}</span><small>${exam.duration_minutes} minutes</small>${button}</article>`;
      }).join('');
    } catch (error) {
      list.textContent = error.message;
    }
  }

  async function loadAdminExams() {
    const list = document.getElementById('admin-exam-list');
    try {
      const response = await authenticatedFetch('/api/admin/exams');
      const exams = await response.json();
      if (!response.ok) throw new Error(exams.error || 'Could not load exams');
      list.innerHTML = exams.map((exam) => {
        const actions = exam.status === 'draft'
          ? `<button class="secondary publish-exam" data-id="${exam.id}">Publish</button>`
          : `<button class="secondary view-results" data-id="${exam.id}">Results</button>`;
        return `<article class="exam-card"><strong>${escapeHtml(exam.title)}</strong><span>${exam.status} • ${new Date(exam.start_at).toLocaleString()}</span>${actions}<button class="secondary add-question" data-id="${exam.id}">Add question</button></article>`;
      }).join('') || '<p>No exams created.</p>';
    } catch (error) {
      list.textContent = error.message;
    }
  }

  async function loadExamColleges() {
    const select = document.getElementById('exam-college');
    const response = await fetch('/api/colleges');
    const colleges = await response.json();
    if (response.ok) select.innerHTML = '<option value="">All colleges</option>' + colleges.map((college) => `<option value="${college.id}">${escapeHtml(college.name)}</option>`).join('');
  }

  document.getElementById('exam-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      title: document.getElementById('exam-title').value.trim(),
      description: document.getElementById('exam-description').value.trim(),
      collegeId: document.getElementById('exam-college').value || null,
      course: document.getElementById('exam-course').value.trim() || null,
      semester: document.getElementById('exam-semester').value.trim() || null,
      startAt: new Date(document.getElementById('exam-start').value).toISOString(),
      durationMinutes: Number(document.getElementById('exam-duration').value)
    };
    const response = await authenticatedFetch('/api/exams', { method: 'POST', body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) return showMessage(data.error || 'Could not create exam', true);
    showMessage('Exam created. Add questions and publish it.', false);
    event.target.reset();
    loadAdminExams();
  });

  let runningAttempt = null;
  let runningExam = null;
  let timerHandle = null;

  async function startExam(examId) {
    try {
      const response = await authenticatedFetch(`/api/attempts/${examId}/start`, { method: 'POST', body: '{}' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start exam');
      runningAttempt = data.attempt;
      runningExam = data.exam;
      document.getElementById('student-dashboard').style.display = 'none';
      document.getElementById('exam-screen').classList.add('show');
      document.getElementById('exam-running-title').textContent = data.exam.title;
      renderQuestions(data.questions, data.answers);
      startTimer();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderQuestions(questions, savedAnswers) {
    const answerByQuestion = new Map(savedAnswers.map((answer) => [answer.question_id, answer.selected_option]));
    document.getElementById('exam-running-questions').innerHTML = questions.map((question, index) => `
      <article class="question-card">
        <strong>${index + 1}. ${escapeHtml(question.text)} <small>(${question.marks} mark)</small></strong>
        ${['A','B','C','D'].map((option) => `<label><input type="radio" name="question-${question.id}" value="${option}" ${answerByQuestion.get(question.id) === option ? 'checked' : ''} data-question="${question.id}"><span>${escapeHtml(question[`option_${option.toLowerCase()}`] || '')}</span></label>`).join('')}
      </article>`).join('') || '<p>No questions have been added.</p>';
    document.querySelectorAll('#exam-running-questions input[type="radio"]').forEach((input) => {
      input.addEventListener('change', async (event) => {
        await authenticatedFetch(`/api/attempts/${runningAttempt.id}/answers/${event.target.dataset.question}`, { method: 'PUT', body: JSON.stringify({ option: event.target.value }) }).catch(() => {});
      });
    });
  }

  function startTimer() {
    clearInterval(timerHandle);
    const started = new Date(runningAttempt.started_at).getTime();
    const deadline = started + runningExam.duration_minutes * 60 * 1000;
    timerHandle = setInterval(() => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        clearInterval(timerHandle);
        submitExam(true);
        return;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      document.getElementById('exam-timer').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
  }

  async function submitExam(auto = false) {
    if (!runningAttempt) return;
    if (!auto && !window.confirm('Submit this exam permanently?')) return;
    const response = await authenticatedFetch(`/api/attempts/${runningAttempt.id}/submit`, { method: 'POST', body: '{}' });
    if (response.ok) {
      clearInterval(timerHandle);
      document.getElementById('exam-screen').classList.remove('show');
      document.getElementById('student-dashboard').style.display = 'grid';
      runningAttempt = null;
      showMessage('Exam submitted successfully.', false);
      loadStudentExams();
    } else {
      const data = await response.json();
      showMessage(data.error || 'Submission failed', true);
    }
  }

  document.getElementById('submit-exam').addEventListener('click', () => submitExam(false));

  document.addEventListener('click', (event) => {
    if (event.target.matches('.start-exam')) startExam(event.target.dataset.id);
    if (event.target.matches('.publish-exam')) {
      authenticatedFetch(`/api/exams/${event.target.dataset.id}/publish`, { method: 'POST', body: '{}' }).then(() => loadAdminExams());
    }
    if (event.target.matches('.add-question')) openQuestionBuilder(event.target.dataset.id);
  });

  function openQuestionBuilder(examId) {
    const text = window.prompt('Question text');
    if (!text) return;
    const optionA = window.prompt('Option A');
    const optionB = window.prompt('Option B');
    const optionC = window.prompt('Option C');
    const optionD = window.prompt('Option D');
    const correctOption = window.prompt('Correct option (A/B/C/D)').toUpperCase();
    const marks = window.prompt('Marks', '1');
    if (!optionA || !optionB || !optionC || !optionD || !['A','B','C','D'].includes(correctOption)) return;
    authenticatedFetch(`/api/exams/${examId}/questions`, { method: 'POST', body: JSON.stringify({ text, optionA, optionB, optionC, optionD, correctOption, marks }) })
      .then(async (response) => { const data = await response.json(); showMessage(response.ok ? 'Question added.' : (data.error || 'Could not add question'), !response.ok); });
  }

  function updateIstClock() {
    const clock = document.getElementById('ist-clock');
    if (!clock) return;
    clock.textContent = 'IST: ' + new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }).format(new Date());
  }
  updateIstClock();
  setInterval(updateIstClock, 1000);

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
      if (isAdmin) {
        loadExamColleges();
        loadAdminExams();
      } else {
        loadStudentExams();
      }
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
