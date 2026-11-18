require('dotenv').config();

const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jspfjnjhtwdugblvlxvv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDBslgxNbHCcWOG80hYayJeyYNTqg2i8to';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@cdlu.ac.in').trim().toLowerCase();

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not configured. Database APIs will not work.');
}

const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

async function verifyFirebaseToken(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) throw Object.assign(new Error('Missing login token'), { status: 401 });

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  const data = await response.json();
  if (!response.ok || !data.users || !data.users[0]) {
    throw Object.assign(new Error('Invalid or expired login'), { status: 401 });
  }
  const user = data.users[0];
  return {
    uid: user.localId,
    email: (user.email || '').trim().toLowerCase(),
    name: user.displayName || user.email || 'Student',
    emailVerified: user.emailVerified === true
  };
}

function requireDb(req, res) {
  if (!supabase) {
    res.status(503).json({ error: 'Server database is not configured' });
    return false;
  }
  return true;
}

async function requireUser(req, res, next) {
  try {
    const user = await verifyFirebaseToken(req);
    req.user = user;
    if (!user.emailVerified && user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Verify your email before continuing' });
    }
    next();
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message });
  }
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, () => {
    if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Administrator access required' });
    next();
  });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, databaseConfigured: Boolean(supabase) }));

app.get('/api/colleges', async (_req, res) => {
  if (!requireDb(_req, res)) return;
  const { data, error } = await supabase.from('colleges').select('id,name,code').eq('active', true).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/profile', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { name, rollNo, collegeId, course, semester, phone } = req.body;
  if (!name || !rollNo || !collegeId) return res.status(400).json({ error: 'Name, roll number and college are required' });
  const payload = {
    firebase_uid: req.user.uid,
    email: req.user.email,
    name: String(name).trim(),
    roll_no: String(rollNo).trim(),
    college_id: collegeId,
    course: course || null,
    semester: semester || null,
    phone: phone || null,
    role: req.user.email === ADMIN_EMAIL ? 'admin' : 'student',
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase.from('profiles').upsert(payload).select().single();
  if (error) return res.status(409).json({ error: error.message });
  res.json(data);
});

app.get('/api/profile', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data, error } = await supabase.from('profiles').select('*,colleges(name,code)').eq('firebase_uid', req.user.uid).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/exams', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  let query = supabase.from('exams').select('*,exam_question_counts(question_count)').eq('status', 'published');
  const { data, error } = await query.order('start_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const examIds = (data || []).map((exam) => exam.id);
  const { data: attempts } = examIds.length
    ? await supabase.from('attempts').select('exam_id,status,started_at,submitted_at,score').eq('firebase_uid', req.user.uid).in('exam_id', examIds)
    : { data: [] };
  const attemptByExam = new Map((attempts || []).map((attempt) => [attempt.exam_id, attempt]));
  res.json((data || []).map((exam) => ({ ...exam, attempt: attemptByExam.get(exam.id) || null })));
});

app.get('/api/admin/exams', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data, error } = await supabase.from('exams').select('*,exam_question_counts(question_count)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

app.post('/api/exams', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { title, description, collegeId, course, semester, startAt, durationMinutes } = req.body;
  if (!title || !startAt || !durationMinutes) return res.status(400).json({ error: 'Title, start time and duration are required' });
  const payload = { title, description: description || '', college_id: collegeId || null, course: course || null, semester: semester || null, start_at: startAt, duration_minutes: Number(durationMinutes), status: 'draft', created_by: req.user.uid };
  const { data, error } = await supabase.from('exams').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.post('/api/exams/:examId/questions', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { text, optionA, optionB, optionC, optionD, correctOption, marks, position } = req.body;
  if (!text || !optionA || !optionB || !optionC || !optionD || !correctOption) return res.status(400).json({ error: 'Complete question fields are required' });
  const payload = { exam_id: req.params.examId, text, option_a: optionA, option_b: optionB, option_c: optionC, option_d: optionD, correct_option: correctOption, marks: Number(marks || 1), position: Number(position || 0) };
  const { data, error } = await supabase.from('questions').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.post('/api/exams/:examId/publish', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('exams').update({ status: 'published' }).eq('id', req.params.examId).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.post('/api/attempts/:examId/start', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data, error } = await supabase.rpc('start_attempt', { p_exam_id: req.params.examId, p_firebase_uid: req.user.uid });
  if (error) return res.status(409).json({ error: error.message });
  const attemptId = data;
  const [{ data: exam }, { data: questions }, { data: answers }] = await Promise.all([
    supabase.from('exams').select('*').eq('id', req.params.examId).single(),
    supabase.from('questions').select('id,text,option_a,option_b,option_c,option_d,marks,position').eq('exam_id', req.params.examId).order('position'),
    supabase.from('answers').select('question_id,selected_option').eq('attempt_id', attemptId)
  ]);
  const attemptRow = await supabase.from('attempts').select('*').eq('id', attemptId).single();
  res.json({ attempt: attemptRow.data, exam, questions: questions || [], answers: answers || [] });
});

app.put('/api/attempts/:attemptId/answers/:questionId', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  const option = req.body.option || null;
  const { error } = await supabase.rpc('save_answer', { p_attempt_id: req.params.attemptId, p_firebase_uid: req.user.uid, p_question_id: req.params.questionId, p_option: option });
  if (error) return res.status(409).json({ error: error.message });
  res.json({ saved: true });
});

app.post('/api/attempts/:attemptId/submit', requireUser, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data, error } = await supabase.rpc('submit_attempt', { p_attempt_id: req.params.attemptId, p_firebase_uid: req.user.uid });
  if (error) return res.status(409).json({ error: error.message });
  res.json({ submitted: true, score: data });
});

app.get('/api/admin/results/:examId', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data: attempts, error } = await supabase.from('attempts').select('firebase_uid,status,started_at,submitted_at,score').eq('exam_id', req.params.examId).order('score', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const uids = (attempts || []).map((attempt) => attempt.firebase_uid);
  const { data: profiles } = uids.length ? await supabase.from('profiles').select('firebase_uid,name,email,roll_no,college_id').in('firebase_uid', uids) : { data: [] };
  const profileByUid = new Map((profiles || []).map((profile) => [profile.firebase_uid, profile]));
  res.json((attempts || []).map((attempt) => ({ ...attempt, profile: profileByUid.get(attempt.firebase_uid) || null })));
});

app.post('/api/admin/exams/:examId/results/declare', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data, error } = await supabase.from('exams').update({ status: 'results_declared' }).eq('id', req.params.examId).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.get('/api/admin/results/:examId/export.csv', requireAdmin, async (req, res) => {
  if (!requireDb(req, res)) return;
  const { data: attempts } = await supabase.from('attempts').select('firebase_uid,status,started_at,submitted_at,score').eq('exam_id', req.params.examId);
  const uids = (attempts || []).map((attempt) => attempt.firebase_uid);
  const { data: profiles } = uids.length ? await supabase.from('profiles').select('firebase_uid,name,email,roll_no').in('firebase_uid', uids) : { data: [] };
  const profileByUid = new Map((profiles || []).map((profile) => [profile.firebase_uid, profile]));
  const rows = [['Name','Roll No','Email','Status','Score','Started At','Submitted At']];
  for (const attempt of attempts || []) {
    const profile = profileByUid.get(attempt.firebase_uid) || {};
    rows.push([profile.name || '',profile.roll_no || '',profile.email || '',attempt.status,attempt.score ?? '',attempt.started_at || '',attempt.submitted_at || '']);
  }
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="exam-${req.params.examId}-results.csv"`);
  res.send(csv);
});

app.use(express.static(path.join(__dirname, '..')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

app.listen(PORT, () => console.log(`CDLU Exam Portal running at http://localhost:${PORT}`));
