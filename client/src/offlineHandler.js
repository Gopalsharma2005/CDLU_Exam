import { initialData } from './mockData';

const STORAGE_KEY = 'cdlu_offline_db';

function getDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Error reading offline DB:', e);
  }
  const db = JSON.parse(JSON.stringify(initialData));
  if (!db.answers) db.answers = [];
  if (!db.audit_logs) db.audit_logs = [];
  saveDb(db);
  return db;
}

function saveDb(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Error saving offline DB:', e);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function getAuthUser(options) {
  const authHeader = options?.headers?.Authorization || options?.headers?.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const db = getDb();
  // Token format: 'token-USERID' or jwt
  const parts = token.split('-');
  const id = parseInt(parts[parts.length - 1], 10);
  if (id) {
    return db.users.find((u) => u.id === id) || null;
  }
  return db.users[0]; // fallback to first user
}

export function handleOfflineApi(rawUrl, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const urlObj = new URL(rawUrl, 'http://localhost');
  const path = urlObj.pathname;
  const query = Object.fromEntries(urlObj.searchParams.entries());
  let body = {};
  if (options.body && typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {}
  }

  const db = getDb();

  // 1. Health
  if (path === '/api/health') {
    return jsonResponse({
      status: 'online',
      portal: 'CDLU Examination Portal (Standalone Offline Mode)',
      serverTime: Date.now()
    });
  }

  // 2. Auth: Registration Options
  if (path === '/api/auth/registration-options') {
    return jsonResponse({ colleges: db.colleges.filter((c) => c.status === 'active') });
  }

  // 3. Auth: Register
  if (path === '/api/auth/register' && method === 'POST') {
    const { name, email, phone, college_id, course, semester } = body;
    const newId = (db.users.length ? Math.max(...db.users.map((u) => u.id)) : 0) + 1;
    const studentId = `CDLU${new Date().getFullYear()}${String(newId).padStart(6, '0')}`;
    const newUser = {
      id: newId,
      username: studentId,
      name: name || 'Student',
      email: email || `${studentId.toLowerCase()}@cdlu.ac.in`,
      phone: phone || '9812000000',
      college_id: Number(college_id) || 1,
      course: course || 'BCA',
      semester: semester || '4th Semester',
      role: 'student',
      status: 'active'
    };
    db.users.push(newUser);
    saveDb(db);
    return jsonResponse({ message: 'Student registration successful.', studentId, student: newUser }, 201);
  }

  // 4. Auth: Login
  if (path === '/api/auth/login' && method === 'POST') {
    const { username } = body;
    const user = db.users.find(
      (u) =>
        u.username?.toLowerCase() === username?.trim().toLowerCase() ||
        u.email?.toLowerCase() === username?.trim().toLowerCase()
    );

    if (!user) {
      return jsonResponse({ error: 'Invalid Student ID or password.' }, 401);
    }
    if (user.status !== 'active') {
      return jsonResponse({ error: 'Account is deactivated or locked. Contact Exam Controller.' }, 403);
    }

    const college = db.colleges.find((c) => c.id === user.college_id);
    const safeUser = {
      ...user,
      college_name: college ? college.name : 'University College, CDLU Sirsa',
      college_code: college ? college.code : 'CDLU-UCD'
    };
    const token = `token-${user.id}`;
    return jsonResponse({ message: 'Login successful', token, user: safeUser });
  }

  // 5. Auth: Me
  if (path === '/api/auth/me') {
    const user = getAuthUser(options);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);
    const college = db.colleges.find((c) => c.id === user.college_id);
    return jsonResponse({
      user: {
        ...user,
        college_name: college ? college.name : 'CDLU Campus',
        college_code: college ? college.code : 'CDLU-UCD'
      }
    });
  }

  // 6. Student: Assigned Exams
  if (path === '/api/student/assigned-exams') {
    const user = getAuthUser(options);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const now = Date.now();
    const enriched = db.exams.map((exam) => {
      const attempt = db.attempts.find((a) => a.student_id === user.id && a.exam_id === exam.id);
      let status = 'READY_TO_START';
      if (attempt) {
        if (attempt.is_locked === 1) status = 'LOCKED';
        else if (now >= attempt.server_deadline) status = 'LOCKED';
        else status = 'IN_PROGRESS';
      }
      return {
        ...exam,
        status,
        question_count: db.questions.filter((q) => q.exam_id === exam.id).length || 25,
        attempt: attempt || null
      };
    });
    return jsonResponse({ exams: enriched });
  }

  // 7. Student: Start Exam
  const startExamMatch = path.match(/^\/api\/student\/start-exam\/(\d+)$/);
  if (startExamMatch && method === 'POST') {
    const examId = parseInt(startExamMatch[1], 10);
    const user = getAuthUser(options);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const exam = db.exams.find((e) => e.id === examId);
    let attempt = db.attempts.find((a) => a.student_id === user.id && a.exam_id === examId);
    const now = Date.now();

    if (attempt) {
      if (attempt.is_locked === 1 || now >= attempt.server_deadline) {
        return jsonResponse({ error: 'Attempt locked', isLocked: true }, 403);
      }
      const remainingSeconds = Math.max(0, Math.round((attempt.server_deadline - now) / 1000));
      return jsonResponse({
        message: 'Resuming examination session.',
        attemptId: attempt.id,
        serverDeadline: attempt.server_deadline,
        remainingSeconds
      });
    }

    const duration = exam ? exam.duration_minutes : 30;
    const deadline = now + duration * 60 * 1000;
    const newAttemptId = (db.attempts.length ? Math.max(...db.attempts.map((a) => a.id)) : 0) + 1;
    attempt = {
      id: newAttemptId,
      student_id: user.id,
      exam_id: examId,
      server_start_time: now,
      server_deadline: deadline,
      server_submit_time: null,
      status: 'in_progress',
      is_locked: 0,
      total_questions: 25,
      correct_answers: 0,
      incorrect_answers: 0,
      unanswered: 25,
      total_marks_obtained: 0,
      max_possible_marks: 50,
      time_taken_seconds: 0
    };
    db.attempts.push(attempt);
    saveDb(db);

    return jsonResponse({
      message: 'Examination session initialized.',
      attemptId: newAttemptId,
      serverDeadline: deadline,
      remainingSeconds: duration * 60
    });
  }

  // 8. Questions for exam
  const questionsMatch = path.match(/^\/api\/exams\/(\d+)\/questions$/);
  if (questionsMatch) {
    const examId = parseInt(questionsMatch[1], 10);
    const user = getAuthUser(options);
    const isStudent = user?.role === 'student';
    const attempt = db.attempts.find((a) => a.student_id === user?.id && a.exam_id === examId);

    const qs = db.questions
      .filter((q) => q.exam_id === examId)
      .map((q) => {
        const studentAns = db.answers.find((sa) => sa.attempt_id === attempt?.id && sa.question_id === q.id);
        if (isStudent) {
          const { correct_option, explanation, ...publicQ } = q;
          return {
            ...publicQ,
            selected_option: studentAns ? studentAns.selected_option : null,
            is_marked_review: studentAns ? studentAns.is_marked_review : false
          };
        }
        return q;
      });
    return jsonResponse({ questions: qs });
  }

  // 9. Student: Save Answer
  if (path === '/api/student/save-answer' && method === 'POST') {
    const user = getAuthUser(options);
    const { examId, questionId, selectedOption, isMarkedReview } = body;
    const attempt = db.attempts.find((a) => a.student_id === user?.id && a.exam_id === examId);
    if (!attempt || attempt.is_locked === 1) {
      return jsonResponse({ error: 'Attempt is locked', isLocked: true }, 403);
    }

    let existingAns = db.answers.find((sa) => sa.attempt_id === attempt.id && sa.question_id === questionId);
    if (existingAns) {
      existingAns.selected_option = selectedOption;
      existingAns.is_marked_review = Boolean(isMarkedReview);
      existingAns.updated_at = Date.now();
    } else {
      db.answers.push({
        id: db.answers.length + 1,
        attempt_id: attempt.id,
        question_id: questionId,
        selected_option: selectedOption,
        is_marked_review: Boolean(isMarkedReview),
        updated_at: Date.now()
      });
    }
    saveDb(db);
    return jsonResponse({ message: 'Answer saved' });
  }

  // 10. Student: Timer
  const timerMatch = path.match(/^\/api\/student\/timer\/(\d+)$/);
  if (timerMatch) {
    const examId = parseInt(timerMatch[1], 10);
    const user = getAuthUser(options);
    const attempt = db.attempts.find((a) => a.student_id === user?.id && a.exam_id === examId);
    if (!attempt) return jsonResponse({ isLocked: true, remainingSeconds: 0 });
    const now = Date.now();
    const remainingSeconds = Math.max(0, Math.round((attempt.server_deadline - now) / 1000));
    return jsonResponse({ remainingSeconds, isLocked: attempt.is_locked === 1 || remainingSeconds <= 0 });
  }

  // 11. Student: Submit Exam
  const submitMatch = path.match(/^\/api\/student\/submit-exam\/(\d+)$/);
  if (submitMatch && method === 'POST') {
    const examId = parseInt(submitMatch[1], 10);
    const user = getAuthUser(options);
    const attempt = db.attempts.find((a) => a.student_id === user?.id && a.exam_id === examId);
    if (!attempt) return jsonResponse({ error: 'Attempt not found' }, 404);

    const examQuestions = db.questions.filter((q) => q.exam_id === examId);
    let correct = 0;
    let incorrect = 0;
    let marks = 0;

    examQuestions.forEach((q) => {
      const ans = db.answers.find((a) => a.attempt_id === attempt.id && a.question_id === q.id);
      if (ans && ans.selected_option) {
        if (ans.selected_option.toUpperCase() === q.correct_option.toUpperCase()) {
          correct += 1;
          marks += q.marks;
        } else {
          incorrect += 1;
        }
      }
    });

    attempt.is_locked = 1;
    attempt.status = body.isAutoSubmit ? 'auto_submitted' : 'submitted';
    attempt.server_submit_time = Date.now();
    attempt.correct_answers = correct;
    attempt.incorrect_answers = incorrect;
    attempt.unanswered = Math.max(0, examQuestions.length - (correct + incorrect));
    attempt.total_marks_obtained = marks;
    attempt.time_taken_seconds = Math.round((attempt.server_submit_time - attempt.server_start_time) / 1000);

    // Deactivate student account
    const studentUser = db.users.find((u) => u.id === user.id);
    if (studentUser) studentUser.status = 'deactivated';

    saveDb(db);
    return jsonResponse({
      message: 'Examination submitted and locked successfully.',
      submissionNotice: {
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked',
        referenceId: `CDLU-SEC-${Date.now().toString().slice(-6)}`
      }
    });
  }

  // 12. Dashboard: Stats
  if (path === '/api/dashboard/stats') {
    const totalColleges = db.colleges.length;
    const totalStudents = db.users.filter((u) => u.role === 'student').length;
    const totalExams = db.exams.length;
    const totalAttempts = db.attempts.length;
    const completedAttempts = db.attempts.filter((a) => a.is_locked === 1).length;
    const passedAttempts = db.attempts.filter((a) => a.is_locked === 1 && a.total_marks_obtained >= 20).length;
    const passRate = completedAttempts > 0 ? Math.round((passedAttempts / completedAttempts) * 100) : 0;

    return jsonResponse({
      stats: {
        totalColleges,
        totalStudents,
        totalExams,
        totalAttempts,
        liveAttempts: db.attempts.filter((a) => a.is_locked === 0).length,
        completedAttempts,
        passedAttempts,
        passRate
      },
      collegeBreakdown: db.colleges.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        city: c.city,
        student_count: db.users.filter((u) => u.college_id === c.id && u.role === 'student').length,
        attempts_count: db.attempts.filter((a) => {
          const u = db.users.find((user) => user.id === a.student_id);
          return u && u.college_id === c.id;
        }).length,
        avg_marks: 38,
        passed_count: 1
      })),
      recentAttempts: db.attempts.slice(-5).map((a) => {
        const u = db.users.find((user) => user.id === a.student_id);
        const e = db.exams.find((exam) => exam.id === a.exam_id);
        const c = u ? db.colleges.find((col) => col.id === u.college_id) : null;
        return {
          id: a.id,
          student_name: u ? u.name : 'Student',
          student_roll_no: u ? u.username : 'CDLU',
          college_name: c ? c.name : 'CDLU Campus',
          exam_name: e ? e.title : 'Exam',
          status: a.status,
          total_marks_obtained: a.total_marks_obtained,
          server_submit_time: a.server_submit_time
        };
      })
    });
  }

  // 13. Colleges List
  if (path === '/api/colleges') {
    const list = db.colleges.map((c) => ({
      ...c,
      student_count: db.users.filter((u) => u.college_id === c.id && u.role === 'student').length,
      exam_count: db.exams.filter((e) => e.college_id === c.id || e.college_id == null).length
    }));
    return jsonResponse({ colleges: list });
  }

  // 14. Students List
  if (path === '/api/students') {
    const list = db.users
      .filter((u) => u.role === 'student')
      .map((u) => {
        const c = db.colleges.find((col) => col.id === u.college_id);
        return {
          ...u,
          student_id: u.username,
          college_name: c ? c.name : 'University College, CDLU Sirsa',
          college_code: c ? c.code : 'CDLU-UCD',
          attempts_count: db.attempts.filter((a) => a.student_id === u.id).length
        };
      });
    return jsonResponse({ students: list });
  }

  // 15. Student Unlock Exam
  const unlockMatch = path.match(/^\/api\/students\/(\d+)\/unlock-exam\/(\d+)$/);
  if (unlockMatch && method === 'POST') {
    const studentId = parseInt(unlockMatch[1], 10);
    const examId = parseInt(unlockMatch[2], 10);
    db.attempts = db.attempts.filter((a) => !(a.student_id === studentId && a.exam_id === examId));
    const user = db.users.find((u) => u.id === studentId);
    if (user) user.status = 'active';
    saveDb(db);
    return jsonResponse({ message: 'Exam attempt unlocked. Student can start fresh.' });
  }

  // 16. Exams List
  if (path === '/api/exams') {
    const list = db.exams.map((e) => {
      const c = db.colleges.find((col) => col.id === e.college_id);
      return {
        ...e,
        college_name: c ? c.name : 'All University Colleges',
        question_count: db.questions.filter((q) => q.exam_id === e.id).length || 25,
        total_attempts: db.attempts.filter((a) => a.exam_id === e.id).length,
        completed_attempts: db.attempts.filter((a) => a.exam_id === e.id && a.is_locked === 1).length
      };
    });
    return jsonResponse({ exams: list });
  }

  // 17. Results List
  if (path === '/api/results') {
    const list = db.attempts
      .filter((a) => a.is_locked === 1)
      .map((a) => {
        const u = db.users.find((user) => user.id === a.student_id);
        const e = db.exams.find((exam) => exam.id === a.exam_id);
        const c = u ? db.colleges.find((col) => col.id === u.college_id) : null;
        const maxMarks = a.max_possible_marks || 50;
        const percentage = maxMarks > 0 ? Math.round((a.total_marks_obtained / maxMarks) * 100 * 10) / 10 : 0;
        return {
          attempt_id: a.id,
          student_id: a.student_id,
          student_name: u ? u.name : 'Harpreet Singh',
          student_roll_no: u ? u.username : 'CDLU2026001',
          college_id: c ? c.id : 1,
          college_name: c ? c.name : 'University College, CDLU Sirsa',
          college_code: c ? c.code : 'CDLU-UCD',
          course: u ? u.course : 'BCA',
          semester: u ? u.semester : '4th Semester',
          exam_id: a.exam_id,
          exam_name: e ? e.title : 'Web Technologies',
          exam_code: e ? e.code : 'BCA401-2026',
          passing_marks: e ? e.passing_marks : 20,
          total_questions: a.total_questions || 25,
          correct_answers: a.correct_answers || 0,
          incorrect_answers: a.incorrect_answers || 0,
          unanswered: a.unanswered || 0,
          total_marks_obtained: a.total_marks_obtained || 0,
          max_possible_marks: maxMarks,
          percentage,
          time_taken_seconds: a.time_taken_seconds || 180,
          server_start_time: a.server_start_time,
          server_submit_time: a.server_submit_time,
          status: a.status,
          is_locked: a.is_locked
        };
      });
    return jsonResponse({ results: list });
  }

  // 18. Live Monitoring
  if (path === '/api/results/monitoring/live') {
    const list = db.attempts
      .filter((a) => a.is_locked === 0)
      .map((a) => {
        const u = db.users.find((user) => user.id === a.student_id);
        const e = db.exams.find((exam) => exam.id === a.exam_id);
        const c = u ? db.colleges.find((col) => col.id === u.college_id) : null;
        const now = Date.now();
        const remainingSeconds = Math.max(0, Math.round((a.server_deadline - now) / 1000));
        return {
          attempt_id: a.id,
          student_id: a.student_id,
          student_name: u ? u.name : 'Student',
          student_roll_no: u ? u.username : 'CDLU',
          college_name: c ? c.name : 'CDLU Campus',
          exam_name: e ? e.title : 'Exam',
          exam_code: e ? e.code : 'EXAM',
          duration_minutes: e ? e.duration_minutes : 30,
          server_deadline: a.server_deadline,
          remaining_seconds: remainingSeconds,
          status: a.status,
          answered_count: db.answers.filter((ans) => ans.attempt_id === a.id && ans.selected_option).length
        };
      });
    return jsonResponse({ liveAttempts: list });
  }

  // 19. Attempt answers (Answer Sheet Modal)
  const attemptAnswersMatch = path.match(/^\/api\/results\/attempt\/(\d+)\/answers$/);
  if (attemptAnswersMatch) {
    const attemptId = parseInt(attemptAnswersMatch[1], 10);
    const attempt = db.attempts.find((a) => a.id === attemptId);
    const u = attempt ? db.users.find((user) => user.id === attempt.student_id) : null;
    const e = attempt ? db.exams.find((exam) => exam.id === attempt.exam_id) : null;
    const c = u ? db.colleges.find((col) => col.id === u.college_id) : null;

    const questionsWithAns = db.questions
      .filter((q) => q.exam_id === attempt?.exam_id)
      .map((q) => {
        const studentAns = db.answers.find((sa) => sa.attempt_id === attemptId && sa.question_id === q.id);
        const sel = studentAns ? studentAns.selected_option : null;
        const isCorrect = sel && sel.toUpperCase() === q.correct_option.toUpperCase() ? 1 : 0;
        return {
          ...q,
          selected_option: sel,
          is_correct: isCorrect,
          marks_awarded: isCorrect ? q.marks : 0
        };
      });

    return jsonResponse({
      attempt: {
        ...attempt,
        student_name: u ? u.name : 'Student',
        student_roll_no: u ? u.username : 'CDLU',
        college_name: c ? c.name : 'CDLU Campus',
        exam_name: e ? e.title : 'Exam'
      },
      answers: questionsWithAns
    });
  }

  // Fallback default
  return jsonResponse({ error: 'Endpoint not found', offline: true }, 404);
}

