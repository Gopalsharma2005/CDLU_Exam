const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, db } = require('./db');

// Initialize SQLite schema and seed data
initDb();

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = process.env.NODE_ENV !== 'production'
      && origin
      && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    callback(null, !origin || allowedOrigins.includes(origin) || isLocalDevelopmentOrigin);
  }
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/colleges', require('./routes/colleges'));
app.use('/api/students', require('./routes/students'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/student', require('./routes/studentExam'));
app.use('/api/results', require('./routes/results'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Serve frontend statically
const clientDist = path.join(__dirname, '../client/dist');
const rootDir = path.join(__dirname, '..');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}
app.use(express.static(rootDir));

// Background Timer / Deadline Auto-Enforcer
// Checks for expired attempts every 15 seconds to guarantee server deadline enforcement
setInterval(() => {
  try {
    const now = Date.now();
    const expiredAttempts = db.prepare(`
      SELECT id, exam_id, student_id, server_start_time, server_deadline
      FROM student_exam_attempts
      WHERE is_locked = 0 AND server_deadline <= ?
    `).all(now);

    for (const attempt of expiredAttempts) {
      console.log(`[Auto-Lock Engine] Attempt #${attempt.id} (Exam #${attempt.exam_id}) reached deadline. Auto-finalizing...`);
      
      const questions = db.prepare('SELECT id, correct_option, marks FROM questions WHERE exam_id = ?').all(attempt.exam_id);
      const savedAnswers = db.prepare('SELECT question_id, selected_option FROM student_answers WHERE attempt_id = ?').all(attempt.id);
      
      const answerMap = {};
      for (const a of savedAnswers) {
        answerMap[a.question_id] = a.selected_option;
      }

      let correctCount = 0;
      let incorrectCount = 0;
      let unansweredCount = 0;
      let totalMarks = 0;
      let maxMarks = 0;

      const updateAnswerStmt = db.prepare(`
        UPDATE student_answers
        SET is_correct = ?, marks_awarded = ?
        WHERE attempt_id = ? AND question_id = ?
      `);

      for (const q of questions) {
        maxMarks += q.marks;
        const choice = answerMap[q.id];
        if (!choice) {
          unansweredCount++;
        } else if (choice.toUpperCase() === q.correct_option.toUpperCase()) {
          correctCount++;
          totalMarks += q.marks;
          updateAnswerStmt.run(1, q.marks, attempt.id, q.id);
        } else {
          incorrectCount++;
          updateAnswerStmt.run(0, 0, attempt.id, q.id);
        }
      }

      const timeTaken = Math.round((attempt.server_deadline - attempt.server_start_time) / 1000);

      db.prepare(`
        UPDATE student_exam_attempts
        SET server_submit_time = ?,
            status = 'auto_submitted',
            is_locked = 1,
            total_questions = ?,
            correct_answers = ?,
            incorrect_answers = ?,
            unanswered = ?,
            total_marks_obtained = ?,
            max_possible_marks = ?,
            time_taken_seconds = ?
        WHERE id = ?
      `).run(
        attempt.server_deadline,
        questions.length,
        correctCount,
        incorrectCount,
        unansweredCount,
        totalMarks,
        maxMarks,
        timeTaken,
        attempt.id
      );

      db.prepare(`
        UPDATE users
        SET status = 'deactivated'
        WHERE id = ? AND role = 'student'
      `).run(attempt.student_id);

      db.prepare(`
        INSERT INTO audit_logs (attempt_id, student_id, event_type, details, timestamp)
        VALUES (?, ?, 'SERVER_DEADLINE_AUTO_SUBMIT', 'Exam automatically submitted upon reaching server deadline', ?)
      `).run(attempt.id, attempt.student_id, now);
    }
  } catch (err) {
    console.error('Error in auto-lock engine:', err);
  }
}, 15000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    portal: 'CDLU Digital Examination Portal',
    serverTime: Date.now(),
    timestampIST: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  });
});

// Single Page Application Fallback for React router / direct URLs
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const rootIndexPath = path.join(rootDir, 'index.html');
  const distIndexPath = path.join(clientDist, 'index.html');
  const targetIndex = fs.existsSync(rootIndexPath) ? rootIndexPath : distIndexPath;
  res.sendFile(targetIndex, (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` CDLU ONLINE EXAMINATION SYSTEM (SERVER RUNNING)`);
  console.log(` CDLU Digital Examination Portal`);
  console.log(` Server active on: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
