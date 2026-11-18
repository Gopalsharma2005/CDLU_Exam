const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyToken, requireAdminOrExaminer } = require('../middleware/auth');

// Format date in IST
function formatIST(ms) {
  if (!ms) return 'N/A';
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// 1. Get Results List (Authorized Admins & Examiners only)
router.get('/', verifyToken, requireAdminOrExaminer, (req, res) => {
  try {
    const { college_id, exam_id, status, search } = req.query;

    let query = `
      SELECT sea.id as attempt_id,
             sea.student_id,
             u.username as student_roll_no,
             u.name as student_name,
             u.course,
             u.semester,
             c.id as college_id,
             c.name as college_name,
             c.code as college_code,
             e.id as exam_id,
             e.title as exam_name,
             e.code as exam_code,
             e.passing_marks,
             sea.server_start_time,
             sea.server_submit_time,
             sea.server_deadline,
             sea.status,
             sea.is_locked,
             sea.total_questions,
             sea.correct_answers,
             sea.incorrect_answers,
             sea.unanswered,
             sea.total_marks_obtained,
             sea.max_possible_marks,
             sea.time_taken_seconds
      FROM student_exam_attempts sea
      JOIN users u ON sea.student_id = u.id
      JOIN exams e ON sea.exam_id = e.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE 1=1
    `;
    const params = [];

    // College admin is strictly scoped to their college
    if (req.user.role === 'college_admin') {
      query += ` AND u.college_id = ?`;
      params.push(req.user.college_id);
    } else if (college_id) {
      query += ` AND u.college_id = ?`;
      params.push(college_id);
    }

    if (exam_id) {
      query += ` AND sea.exam_id = ?`;
      params.push(exam_id);
    }

    if (status) {
      query += ` AND sea.status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (u.name LIKE ? OR u.username LIKE ? OR e.title LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY sea.id DESC`;

    const rawRows = db.prepare(query).all(...params);

    const formattedRows = rawRows.map(row => {
      const percentage = row.max_possible_marks > 0
        ? Math.round((row.total_marks_obtained / row.max_possible_marks) * 100 * 10) / 10
        : 0;

      const isPassed = row.total_marks_obtained >= (row.passing_marks || 20);

      return {
        attempt_id: row.attempt_id,
        student_id: row.student_roll_no,
        student_name: row.student_name,
        college_id: row.college_id,
        college_name: row.college_name || 'Direct CDLU Campus',
        course: row.course,
        semester: row.semester,
        exam_id: row.exam_id,
        exam_name: row.exam_name,
        exam_code: row.exam_code,
        start_time_formatted: formatIST(row.server_start_time),
        submit_time_formatted: formatIST(row.server_submit_time),
        total_questions: row.total_questions,
        correct_answers: row.correct_answers,
        incorrect_answers: row.incorrect_answers,
        unanswered: row.unanswered,
        total_marks: row.total_marks_obtained,
        max_possible_marks: row.max_possible_marks,
        percentage,
        is_passed: isPassed,
        status: row.status, // 'submitted', 'auto_submitted', 'in_progress', 'locked'
        is_locked: Boolean(row.is_locked),
        time_taken: formatDuration(row.time_taken_seconds),
        time_taken_seconds: row.time_taken_seconds
      };
    });

    res.json({ results: formattedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Detailed Question-by-Question Result Review (Admins & Examiners only)
router.get('/detail/:attemptId', verifyToken, requireAdminOrExaminer, (req, res) => {
  const { attemptId } = req.params;

  try {
    const attempt = db.prepare(`
      SELECT sea.*, u.username as student_roll_no, u.name as student_name, u.course, u.semester,
             c.name as college_name, e.title as exam_name, e.passing_marks
      FROM student_exam_attempts sea
      JOIN users u ON sea.student_id = u.id
      JOIN exams e ON sea.exam_id = e.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE sea.id = ?
    `).get(attemptId);

    if (!attempt) {
      return res.status(404).json({ error: 'Attempt record not found.' });
    }

    if (req.user.role === 'college_admin' && attempt.college_id !== req.user.college_id) {
      return res.status(403).json({ error: 'Unauthorized to view student record of another college.' });
    }

    // Fetch questions with answers
    const questions = db.prepare(`
      SELECT q.id, q.question_number, q.question_text,
             q.option_a, q.option_b, q.option_c, q.option_d,
             q.correct_option, q.marks, q.explanation,
             sa.selected_option, sa.is_correct, sa.marks_awarded, sa.is_marked_review
      FROM questions q
      LEFT JOIN student_answers sa ON sa.question_id = q.id AND sa.attempt_id = ?
      WHERE q.exam_id = ?
      ORDER BY q.question_number ASC
    `).all(attempt.id, attempt.exam_id);

    res.json({
      attempt: {
        ...attempt,
        start_time_formatted: formatIST(attempt.server_start_time),
        submit_time_formatted: formatIST(attempt.server_submit_time),
        time_taken: formatDuration(attempt.time_taken_seconds)
      },
      questions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Export CSV / Excel Download
router.get('/export-csv', verifyToken, requireAdminOrExaminer, (req, res) => {
  try {
    const { college_id, exam_id } = req.query;

    let query = `
      SELECT sea.*, u.username as student_id, u.name as student_name, u.course, u.semester,
             c.name as college_name, e.title as exam_name, e.passing_marks
      FROM student_exam_attempts sea
      JOIN users u ON sea.student_id = u.id
      JOIN exams e ON sea.exam_id = e.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'college_admin') {
      query += ` AND u.college_id = ?`;
      params.push(req.user.college_id);
    } else if (college_id) {
      query += ` AND u.college_id = ?`;
      params.push(college_id);
    }

    if (exam_id) {
      query += ` AND sea.exam_id = ?`;
      params.push(exam_id);
    }

    query += ` ORDER BY sea.id DESC`;

    const records = db.prepare(query).all(...params);

    // Build CSV
    const headers = [
      'Student Roll No',
      'Student Name',
      'College Name',
      'Course',
      'Semester',
      'Exam Name',
      'Start Time (IST)',
      'Submission Time (IST)',
      'Attempt Status',
      'Time Taken',
      'Total Questions',
      'Correct Answers',
      'Incorrect Answers',
      'Unanswered',
      'Total Marks Obtained',
      'Max Marks',
      'Percentage (%)',
      'Result Status'
    ];

    const rows = records.map(r => {
      const pct = r.max_possible_marks > 0 ? ((r.total_marks_obtained / r.max_possible_marks) * 100).toFixed(1) : '0';
      const resultStatus = r.total_marks_obtained >= (r.passing_marks || 20) ? 'PASSED' : 'FAILED';
      return [
        `"${r.student_id || ''}"`,
        `"${(r.student_name || '').replace(/"/g, '""')}"`,
        `"${(r.college_name || 'CDLU Campus').replace(/"/g, '""')}"`,
        `"${r.course || ''}"`,
        `"${r.semester || ''}"`,
        `"${(r.exam_name || '').replace(/"/g, '""')}"`,
        `"${formatIST(r.server_start_time)}"`,
        `"${formatIST(r.server_submit_time)}"`,
        `"${r.status || 'N/A'}"`,
        `"${formatDuration(r.time_taken_seconds)}"`,
        r.total_questions || 0,
        r.correct_answers || 0,
        r.incorrect_answers || 0,
        r.unanswered || 0,
        r.total_marks_obtained || 0,
        r.max_possible_marks || 0,
        pct,
        resultStatus
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="CDLU_Exam_Results_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Live Exam Monitoring
router.get('/monitoring/live', verifyToken, requireAdminOrExaminer, (req, res) => {
  try {
    const now = Date.now();
    let query = `
      SELECT sea.id as attempt_id, sea.server_start_time, sea.server_deadline, sea.status, sea.is_locked,
             u.id as student_id, u.username as student_roll_no, u.name as student_name, u.course,
             c.name as college_name, e.title as exam_name, e.duration_minutes,
             (SELECT COUNT(*) FROM student_answers sa WHERE sa.attempt_id = sea.id AND sa.selected_option IS NOT NULL) as answered_count,
             (SELECT COUNT(*) FROM questions q WHERE q.exam_id = sea.exam_id) as total_questions
      FROM student_exam_attempts sea
      JOIN users u ON sea.student_id = u.id
      JOIN exams e ON sea.exam_id = e.id
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'college_admin') {
      query += ` AND u.college_id = ?`;
      params.push(req.user.college_id);
    }

    query += ` ORDER BY sea.id DESC LIMIT 50`;

    const rows = db.prepare(query).all(...params);

    const monitored = rows.map(r => {
      let isLive = false;
      let remainingSeconds = 0;

      if (r.is_locked === 0 && now < r.server_deadline) {
        isLive = true;
        remainingSeconds = Math.max(0, Math.floor((r.server_deadline - now) / 1000));
      }

      return {
        attempt_id: r.attempt_id,
        student_roll_no: r.student_roll_no,
        student_name: r.student_name,
        course: r.course,
        college_name: r.college_name || 'CDLU Campus',
        exam_name: r.exam_name,
        is_live: isLive,
        status: isLive ? 'in_progress' : r.status,
        answered_count: r.answered_count,
        total_questions: r.total_questions,
        progress_pct: r.total_questions > 0 ? Math.round((r.answered_count / r.total_questions) * 100) : 0,
        start_time_formatted: formatIST(r.server_start_time),
        remaining_seconds: remainingSeconds,
        remaining_formatted: isLive ? formatDuration(remainingSeconds) : '0s'
      };
    });

    res.json({ liveAttempts: monitored });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
