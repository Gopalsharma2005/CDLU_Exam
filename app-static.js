(() => {
  const firebaseConfig = window.CDLU_FIREBASE_CONFIG;
  const supabaseUrl = window.CDLU_SUPABASE_URL;
  const supabaseKey = window.CDLU_SUPABASE_ANON_KEY;
  if (!window.firebase || !firebaseConfig) return showMessage?.('Firebase configuration is missing.', true);
  if (!window.supabase || !supabaseUrl || !supabaseKey || supabaseKey.includes('REPLACE')) return showMessage?.('Set the Supabase publishable key in firebase-config.js.', true);

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = window.supabase.createClient(supabaseUrl, supabaseKey);
  const adminEmail = (window.CDLU_ADMIN_EMAIL || '').trim().toLowerCase();
  let runningAttempt = null;
  let timerId = null;

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authForms = document.getElementById('auth-forms');
  const userPanel = document.getElementById('user-panel');
  const message = document.getElementById('message');

  function showMessage(text, error = false) {
    if (!message) return;
    message.textContent = text;
    message.className = `message show ${error ? 'error' : 'success'}`;
  }
  window.showMessage = showMessage;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
    loginForm.classList.toggle('active', name === 'login');
    registerForm.classList.toggle('active', name === 'register');
  }
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  async function loadColleges() {
    const select = document.getElementById('register-college');
    const { data, error } = await db.from('colleges').select('id,name').eq('active', true).order('name');
    if (error) return showMessage(error.message, true);
    select.innerHTML = '<option value="">Select college / university</option>' + (data || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }
  loadColleges();

  function getRegistrationDetails() {
    const details = {
      name: document.getElementById('register-name').value.trim(),
      rollNo: document.getElementById('register-roll').value.trim(),
      collegeId: document.getElementById('register-college').value,
      course: document.getElementById('register-course').value.trim(),
      semester: document.getElementById('register-semester').value.trim(),
      phone: document.getElementById('register-phone').value.trim()
    };
    if (!details.name || !details.rollNo || !details.collegeId || !details.course || !details.semester) throw new Error('Complete all required registration fields.');
    return details;
  }

  async function saveProfile(user, details) {
    const { error } = await db.from('profiles').upsert({
      firebase_uid: user.uid,
      email: (user.email || '').toLowerCase(),
      name: details.name,
      roll_no: details.rollNo,
      college_id: details.collegeId,
      course: details.course,
      semester: details.semester,
      phone: details.phone || null,
      role: 'student'
    }, { onConflict: 'firebase_uid' });
    if (error) throw error;
  }

  loginForm.addEventListener('submit', async event => {
    event.preventEvent?.();
    event.preventDefault();
    const button = loginForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await auth.signInWithEmailAndPassword(document.getElementById('login-email').value.trim(), document.getElementById('login-password').value);
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });

  registerForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = registerForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const details = getRegistrationDetails();
      const email = document.getElementById('register-email').value.trim();
      if (email.toLowerCase() === adminEmail) throw new Error('The administrator account cannot be registered here.');
      const credential = await auth.createUserWithEmailAndPassword(email, document.getElementById('register-password').value);
      await credential.user.updateProfile({ displayName: details.name });
      await credential.user.sendEmailVerification();
      await saveProfile(credential.user, details);
      showMessage('Account created. Verify the email sent to you.');
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });

  document.querySelectorAll('.google-button').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await auth.signInWithPopup(provider);
      if ((credential.user.email || '').toLowerCase() !== adminEmail) {
        if (credential.additionalUserInfo?.isNewUser) {
          const details = getRegistrationDetails();
          await saveProfile(credential.user, details);
        }
      }
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  }));

  document.getElementById('logout-button').addEventListener('click', () => auth.signOut());

  async function loadExamForAdmin() {
    const { data } = await db.from('exam').select('*').eq('id', 1).maybeSingle();
    if (!data) return;
    document.getElementById('exam-title').value = data.title || '';
    document.getElementById('exam-description').value = data.description || '';
    document.getElementById('exam-duration').value = data.duration_minutes || 30;
    document.getElementById('exam-published').checked = !!data.is_published;
    if (data.start_at) document.getElementById('exam-start').value = new Date(data.start_at).toISOString().slice(0, 16);
  }

  document.getElementById('exam-form').addEventListener('submit', async event => {
    event.preventEvent?.();
    event.preventDefault();
    const payload = {
      id: 1,
      title: document.getElementById('exam-title').value.trim(),
      description: document.getElementById('exam-description').value.trim(),
      start_at: new Date(document.getElementById('exam-start').value).toISOString(),
      duration_minutes: Number(document.getElementById('exam-duration').value),
      is_published: document.getElementById('exam-published').checked
    };
    const { error } = await db.from('exam').upsert(payload);
    showMessage(error ? error.message : 'Exam saved.', !!error);
  });

  document.querySelectorAll('.admin-tab').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`admin-${button.dataset.adminTab}-section`).classList.add('active');
    if (button.dataset.adminTab === 'questions') loadQuestions(true);
    if (button.dataset.adminTab === 'monitoring') loadMonitoring();
    if (button.dataset.adminTab === 'results') loadResults();
  }));

  async function loadQuestions(editable = false) {
    const { data, error } = await db.from('questions').select('*').eq('exam_id', 1).order('position');
    if (error) return showMessage(error.message, true);
    document.getElementById('question-list').innerHTML = (data || []).map(q => `<article class="exam-card"><strong>Q${q.position}. ${escapeHtml(q.text)}</strong><span>A. ${escapeHtml(q.option_a)} | B. ${escapeHtml(q.option_b)} | C. ${escapeHtml(q.option_c)} | D. ${escapeHtml(q.option_d)}</span><small>Correct: ${q.correct_option} • ${q.marks} mark(s)</small>${editable ? `<button type="button" class="secondary delete-question" data-id="${q.id}">Delete</button>` : ''}</article>`).join('') || '<p>No questions added.</p>';
  }

  document.getElementById('question-form').addEventListener('submit', async event => {
    event.preventDefault();
    const { count } = await db.from('questions').select('id', { count: 'exact', head: true }).eq('exam_id', 1);
    const payload = {
      exam_id: 1,
      position: (count || 0) + 1,
      text: document.getElementById('question-text').value.trim(),
      option_a: document.getElementById('option-a').value.trim(),
      option_b: document.getElementById('option-b').value.trim(),
      option_c: document.getElementById('option-c').value.trim(),
      option_d: document.getElementById('option-d').value.trim(),
      correct_option: document.getElementById('correct-option').value,
      marks: Number(document.getElementById('question-marks').value)
    };
    const { error } = await db.from('questions').insert(payload);
    if (error) showMessage(error.message, true);
    else { event.target.reset(); showMessage('Question added.'); loadQuestions(true); }
  });

  document.getElementById('question-list').addEventListener('click', async event => {
    if (!event.target.matches('.delete-question')) return;
    if (!confirm('Delete this question?')) return;
    await db.from('questions').delete().eq('id', event.target.dataset.id);
    loadQuestions(true);
  });

  async function loadStudentExam() {
    const list = document.getElementById('exam-list');
    const user = auth.currentUser;
    const { data: exam } = await db.from('exam').select('*').eq('id', 1).maybeSingle();
    if (!exam || !exam.is_published) { list.innerHTML = '<p>No exam has been published yet.</p>'; return; }
    const { data: attempt } = await db.from('attempts').select('*').eq('firebase_uid', user.uid).eq('exam_id', 1).maybeSingle();
    const start = new Date(exam.start_at);
    const now = new Date();
    let status = now < start ? `Starts ${start.toLocaleString()}` : 'Exam is available';
    let action = now < start ? '<button class="secondary" disabled>Scheduled</button>' : '<button class="secondary start-exam">Start Exam</button>';
    if (attempt?.status === 'submitted' || attempt?.status === 'expired') { status = 'Exam Submitted Successfully'; action = '<button class="secondary" disabled>Attempt Locked</button>'; }
    list.innerHTML = `<article class="exam-card"><strong>${escapeHtml(exam.title)}</strong><span>${escapeHtml(status)}</span><small>${exam.duration_minutes} minutes</small>${action}</article>`;
  }

  async function startExam() {
    const user = auth.currentUser;
    const { data: exam } = await db.from('exam').select('*').eq('id', 1).maybeSingle();
    if (!exam || !exam.is_published) return showMessage('Exam is not published.', true);
    if (new Date() < new Date(exam.start_at)) return showMessage('The exam has not started yet.', true);

    let { data: attempt } = await db.from('attempts').select('*').eq('firebase_uid', user.uid).eq('exam_id', 1).maybeSingle();
    if (attempt?.status === 'submitted' || attempt?.status === 'expired') return showSubmitted();
    if (!attempt) {
      const deadline = new Date(Date.now() + exam.duration_minutes * 60000).toISOString();
      const inserted = await db.from('attempts').insert({ firebase_uid: user.uid, exam_id: 1, started_at: new Date().toISOString(), deadline_at: deadline }).select().single();
      if (inserted.error) return showMessage(inserted.error.message, true);
      attempt = inserted.data;
    }
    runningAttempt = attempt;
    const deadline = new Date(attempt.deadline_at).getTime();
    if (Date.now() >= deadline) return submitExam(true);

    const { data: questions } = await db.from('questions').select('*').eq('exam_id', 1).order('position');
    const { data: answers } = await db.from('answers').select('*').eq('attempt_id', attempt.id);
    const answerMap = new Map((answers || []).map(a => [a.question_id, a]));
    document.getElementById('student-dashboard').style.display = 'none';
    document.getElementById('exam-screen').classList.add('show');
    document.getElementById('exam-running-title').textContent = exam.title;
    document.getElementById('exam-running-questions').innerHTML = (questions || []).map((q, i) => `<article class="question-card"><strong>${i + 1}. ${escapeHtml(q.text)} <small>(${q.marks} mark)</small></strong>${['A','B','C','D'].map(o => `<label><input type="radio" name="q-${q.id}" value="${o}" ${answerMap.get(q.id)?.selected_option === o ? 'checked' : ''} data-question="${q.id}"><span>${o}. ${escapeHtml(q[`option_${o.toLowerCase()}`])}</span></label>`).join('')}<label class="mark-review"><input type="checkbox" data-review="${q.id}" ${answerMap.get(q.id)?.marked_review ? 'checked' : ''}> Mark for review</label></article>`).join('') || '<p>No questions available.</p>';

    document.querySelectorAll('#exam-running-questions input[type="radio"]').forEach(input => input.addEventListener('change', saveAnswer));
    document.querySelectorAll('[data-review]').forEach(input => input.addEventListener('change', saveAnswer));
    startTimer(deadline);
  }

  async function saveAnswer(event) {
    if (!runningAttempt) return;
    const questionId = event.target.dataset.question || event.target.dataset.review;
    const existing = await db.from('answers').select('*').eq('attempt_id', runningAttempt.id).eq('question_id', questionId).maybeSingle();
    const row = existing.data || {};
    let selected = row.selected_option;
    let marked = row.marked_review || false;
    if (event.target.type === 'radio') selected = event.target.value;
    if (event.target.dataset.review) marked = event.target.checked;
    await db.from('answers').upsert({ attempt_id: runningAttempt.id, question_id: questionId, selected_option: selected || null, marked_review: marked }, { onConflict: 'attempt_id,question_id' });
  }

  function startTimer(deadline) {
    clearInterval(timerId);
    timerId = setInterval(() => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { clearInterval(timerId); submitExam(true); return; }
      const seconds = Math.floor(remaining / 1000);
      document.getElementById('exam-timer').textContent = `${String(Math.floor(seconds / 3600)).padStart(2,'0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
    }, 1000);
  }

  async function submitExam(auto = false) {
    if (!runningAttempt) return;
    if (!auto && !confirm('Submit this exam permanently?')) return;
    const { data: questions } = await db.from('questions').select('*').eq('exam_id', 1);
    const { data: answers } = await db.from('answers').select('*').eq('attempt_id', runningAttempt.id);
    let score = 0;
    const answerMap = new Map((answers || []).map(a => [a.question_id, a.selected_option]));
    (questions || []).forEach(q => { if (answerMap.get(q.id) === q.correct_option) score += q.marks; });
    await db.from('attempts').update({ status: auto ? 'expired' : 'submitted', submitted_at: new Date().toISOString(), score }).eq('id', runningAttempt.id);
    clearInterval(timerId);
    runningAttempt = null;
    showSubmitted();
  }

  function showSubmitted() {
    document.getElementById('exam-screen').classList.remove('show');
    document.getElementById('student-dashboard').style.display = 'grid';
    showMessage('Exam Submitted Successfully — Your result will be declared by the University. Attempt Locked.', false);
    loadStudentExam();
  }

  document.getElementById('submit-exam').addEventListener('click', () => submitExam(false));
  document.getElementById('exam-list').addEventListener('click', event => { if (event.target.matches('.start-exam')) startExam(); });

  async function loadMonitoring() {
    const { data } = await db.from('attempts').select('id,status,started_at,deadline_at,submitted_at,firebase_uid').eq('exam_id', 1).order('started_at', { ascending: false });
    document.getElementById('live-monitoring').innerHTML = (data || []).map(a => `<div class="exam-card"><strong>${escapeHtml(a.firebase_uid)}</strong><span>${a.status}</span><small>Started: ${a.started_at ? new Date(a.started_at).toLocaleString() : '-'}</small></div>`).join('') || '<p>No attempts yet.</p>';
  }

  async function loadResults() {
    const { data: attempts } = await db.from('attempts').select('*').eq('exam_id', 1).order('score', { ascending: false });
    const uids = (attempts || []).map(a => a.firebase_uid);
    const { data: profiles } = uids.length ? await db.from('profiles').select('*').in('firebase_uid', uids) : { data: [] };
    const profileMap = new Map((profiles || []).map(p => [p.firebase_uid, p]));
    document.getElementById('results-table').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Roll No</th><th>College</th><th>Status</th><th>Score</th></tr></thead><tbody>${(attempts || []).map(a => { const p = profileMap.get(a.firebase_uid) || {}; return `<tr><td>${escapeHtml(p.name || '')}</td><td>${escapeHtml(p.roll_no || '')}</td><td>${escapeHtml(p.college_id || '')}</td><td>${escapeHtml(a.status)}</td><td>${a.score}</td></tr>`; }).join('')}</tbody></table></div>`;
    window.currentResults = attempts || [];
  }

  document.getElementById('declare-results').addEventListener('click', async () => {
    const { error } = await db.from('exam').update({ results_declared: true }).eq('id', 1);
    showMessage(error ? error.message : 'Results declared.', !!error);
  });

  document.getElementById('export-results').addEventListener('click', () => {
    const rows = [['Firebase UID','Status','Score','Started','Submitted'], ...(window.currentResults || []).map(a => [a.firebase_uid,a.status,a.score,a.started_at || '',a.submitted_at || ''])];
    const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = 'cdlu-exam-results.csv'; link.click(); URL.revokeObjectURL(link.href);
  });

  auth.onAuthStateChanged(async user => {
    if (!user) {
      authForms.style.display = 'block'; userPanel.classList.remove('show'); return;
    }
    const admin = (user.email || '').trim().toLowerCase() === adminEmail;
    authForms.style.display = 'none'; userPanel.classList.add('show');
    document.getElementById('user-name').textContent = admin ? (user.displayName || 'Portal Administrator') : (user.displayName || 'CDLU Student');
    document.getElementById('user-email').textContent = user.email || '';
    document.getElementById('user-role').textContent = admin ? 'Administrator' : 'Student';
    document.getElementById('student-dashboard').style.display = admin ? 'none' : 'grid';
    document.getElementById('admin-dashboard').style.display = admin ? 'grid' : 'none';
    document.getElementById('user-avatar').textContent = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    if (admin) { loadExamForAdmin(); loadQuestions(true); loadMonitoring(); loadResults(); }
    else loadStudentExam();
  });

  function updateClock() {
    const clock = document.getElementById('ist-clock');
    if (clock) clock.textContent = 'IST: ' + new Intl.DateTimeFormat('en-IN', { timeZone:'Asia/Kolkata', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }).format(new Date());
  }
  updateClock(); setInterval(updateClock, 1000);
})();
