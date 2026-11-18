const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyToken, requireStudent } = require('../middleware/auth');

// Helper to auto-calculate score on submission or timeout
function finalizeAttempt(attemptId, status = 'submitted') {
  const attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE id = ?').get(attemptId);
  if (!attempt) return null;

  const now = Date.now();
  const actualSubmitTime = Math.min(now, attempt.server_deadline);
  const timeTakenSeconds = Math.round((actualSubmitTime - attempt.server_start_time) / 1000);

  // Fetch all questions for this exam
  const questions = db.prepare(`
    SELECT id, correct_option, marks FROM questions WHERE exam_id = ?
  `).all(attempt.exam_id);

  // Fetch all saved student answers
  const savedAnswers = db.prepare(`
    SELECT question_id, selected_option FROM student_answers WHERE attempt_id = ?
  `).all(attemptId);

  const answerMap = {};
  for (const a of savedAnswers) {
    answerMap[a.question_id] = a.selected_option;
  }

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let totalMarksObtained = 0;
  let maxPossibleMarks = 0;

  const updateAnswerStmt = db.prepare(`
    UPDATE student_answers
    SET is_correct = ?, marks_awarded = ?
    WHERE attempt_id = ? AND question_id = ?
  `);

  for (const q of questions) {
    maxPossibleMarks += q.marks;
    const studentChoice = answerMap[q.id];

    if (!studentChoice) {
      unansweredCount++;
    } else if (studentChoice.toUpperCase() === q.correct_option.toUpperCase()) {
      correctCount++;
      totalMarksObtained += q.marks;
      updateAnswerStmt.run(1, q.marks, attemptId, q.id);
    } else {
      incorrectCount++;
      updateAnswerStmt.run(0, 0, attemptId, q.id);
    }
  }

  // Update attempt status to locked permanently
  db.prepare(`
    UPDATE student_exam_attempts
    SET server_submit_time = ?,
        status = ?,
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
    actualSubmitTime,
    status,
    questions.length,
    correctCount,
    incorrectCount,
    unansweredCount,
    totalMarksObtained,
    maxPossibleMarks,
    timeTakenSeconds,
    attemptId
  );

  db.prepare(`
    UPDATE users
    SET status = 'deactivated'
    WHERE id = ? AND role = 'student'
  `).run(attempt.student_id);

  return db.prepare('SELECT * FROM student_exam_attempts WHERE id = ?').get(attemptId);
}

// 1. Get student's assigned exams with real-time status
router.get('/assigned-exams', verifyToken, requireStudent, (req, res) => {
  try {
    const studentId = req.user.id;
    const collegeId = req.user.college_id;
    const course = req.user.course;

    const exams = db.prepare(`
      SELECT e.*, c.name as college_name,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count
      FROM exams e
      LEFT JOIN colleges c ON e.college_id = c.id
      WHERE (e.is_active = 1 OR EXISTS (
          SELECT 1 FROM student_exam_attempts a
          WHERE a.student_id = ? AND a.exam_id = e.id
        ))
        AND (e.college_id IS NULL OR e.college_id = ?)
        AND (e.course = ? OR e.course = 'General')
      ORDER BY e.id DESC
    `).all(studentId, collegeId, course);

    const now = Date.now();
    const enriched = exams.map(exam => {
      const attempt = db.prepare(`
        SELECT id, status, is_locked, server_start_time, server_deadline, server_submit_time
        FROM student_exam_attempts
        WHERE student_id = ? AND exam_id = ?
      `).get(studentId, exam.id);

      let status = 'READY_TO_START';
      let remainingSeconds = exam.duration_minutes * 60;
      let attemptId = null;
      const opensAt = new Date(exam.start_window).getTime();
      const closesAt = new Date(exam.end_window).getTime();

      if (attempt) {
        attemptId = attempt.id;
        if (attempt.is_locked === 1) {
          status = 'LOCKED';
          remainingSeconds = 0;
        } else if (now >= attempt.server_deadline) {
          // Deadline crossed while student was offline -> lock immediately
          finalizeAttempt(attempt.id, 'auto_submitted');
          status = 'LOCKED';
          remainingSeconds = 0;
        } else {
          status = 'IN_PROGRESS';
          remainingSeconds = Math.max(0, Math.floor((attempt.server_deadline - now) / 1000));
        }
      } else if (now < opensAt) {
        status = 'UPCOMING';
      } else if (now > closesAt) {
        status = 'CLOSED';
      } else if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt)) {
        status = 'CLOSED';
      }

      return {
        id: exam.id,
        code: exam.code,
        title: exam.title,
        subject: exam.subject,
        course: exam.course,
        semester: exam.semester,
        duration_minutes: exam.duration_minutes,
        total_marks: exam.total_marks,
        question_count: exam.question_count,
        instructions: exam.instructions,
        college_name: exam.college_name,
        start_window: exam.start_window,
        end_window: exam.end_window,
        status,
        remaining_seconds: remainingSeconds,
        attempt_id: attemptId
      };
    });

    res.json({ exams: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Start Exam or Resume Exam (Server-Authoritative Timing)
router.post('/start-exam/:examId', verifyToken, requireStudent, (req, res) => {
  const { examId } = req.params;
  const studentId = req.user.id;
  const now = Date.now();

  try {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found or inactive.' });
    }

    if (
      (exam.college_id !== null && Number(exam.college_id) !== Number(req.user.college_id)) ||
      (exam.course !== 'General' && exam.course !== req.user.course)
    ) {
      return res.status(403).json({ error: 'This examination is not assigned to your college or course.' });
    }

    // Check existing attempt
    let attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE student_id = ? AND exam_id = ?').get(studentId, examId);
    if (!exam.is_active && !attempt) {
      return res.status(404).json({ error: 'Exam not found or inactive.' });
    }

    if (attempt) {
      // If already locked, block completely!
      if (attempt.is_locked === 1) {
        return res.status(403).json({
          error: 'Your examination attempt has already been submitted and is LOCKED. Second attempts are strictly prohibited by CDLU examination rules.',
          isLocked: true,
          status: attempt.status
        });
      }

      // If deadline has expired on server
      if (now >= attempt.server_deadline) {
        finalizeAttempt(attempt.id, 'auto_submitted');
        return res.status(403).json({
          error: 'The 30-minute exam window has ended. Your examination has been automatically submitted and LOCKED.',
          isLocked: true,
          status: 'auto_submitted'
        });
      }

      // Resume existing in-progress exam with remaining server seconds
      const remainingSeconds = Math.max(0, Math.floor((attempt.server_deadline - now) / 1000));

      return res.json({
        message: 'Exam resumed successfully',
        resumed: true,
        attemptId: attempt.id,
        serverStartTime: attempt.server_start_time,
        serverDeadline: attempt.server_deadline,
        remainingSeconds,
        durationMinutes: exam.duration_minutes
      });
    }

    const opensAt = new Date(exam.start_window).getTime();
    const closesAt = new Date(exam.end_window).getTime();
    if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt)) {
      return res.status(403).json({ error: 'The exam schedule is invalid. Please contact the university administrator.' });
    }
    if (now < opensAt || now > closesAt) {
      return res.status(403).json({
        error: now < opensAt ? 'This examination is not open yet.' : 'The examination schedule has closed.'
      });
    }

    // New Attempt: Set server start time and deadline
    const durationMinutes = exam.duration_minutes || 30;
    const serverDeadline = now + durationMinutes * 60 * 1000;

    const insertAttempt = db.prepare(`
      INSERT INTO student_exam_attempts (
        student_id, exam_id, server_start_time, server_deadline, status, is_locked
      ) VALUES (?, ?, ?, ?, 'in_progress', 0)
    `).run(studentId, examId, now, serverDeadline);

    const attemptId = insertAttempt.lastInsertRowid;

    // Log event
    db.prepare(`
      INSERT INTO audit_logs (attempt_id, student_id, event_type, details, timestamp)
      VALUES (?, ?, 'EXAM_STARTED', ?, ?)
    `).run(attemptId, studentId, `Exam started at ${new Date(now).toISOString()}`, now);

    res.json({
      message: 'Exam started successfully',
      resumed: false,
      attemptId,
      serverStartTime: now,
      serverDeadline,
      remainingSeconds: durationMinutes * 60,
      durationMinutes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Heartbeat / Server-Timer Sync Check
router.get('/timer/:examId', verifyToken, requireStudent, (req, res) => {
  const { examId } = req.params;
  const studentId = req.user.id;
  const now = Date.now();

  try {
    const attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE student_id = ? AND exam_id = ?').get(studentId, examId);
    if (!attempt) {
      return res.status(404).json({ error: 'No active attempt found.' });
    }

    if (attempt.is_locked === 1) {
      return res.json({
        isLocked: true,
        remainingSeconds: 0,
        status: attempt.status
      });
    }

    if (now >= attempt.server_deadline) {
      finalizeAttempt(attempt.id, 'auto_submitted');
      return res.json({
        isLocked: true,
        remainingSeconds: 0,
        status: 'auto_submitted'
      });
    }

    const remainingSeconds = Math.max(0, Math.floor((attempt.server_deadline - now) / 1000));
    res.json({
      isLocked: false,
      serverTime: now,
      serverDeadline: attempt.server_deadline,
      remainingSeconds,
      status: 'in_progress'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Save Answer (Auto-Save on every question option select)
router.post('/save-answer', verifyToken, requireStudent, (req, res) => {
  const { examId, questionId, selectedOption, isMarkedReview } = req.body;
  const studentId = req.user.id;
  const now = Date.now();

  try {
    const attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE student_id = ? AND exam_id = ?').get(studentId, examId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    // Verify lock and server deadline
    if (attempt.is_locked === 1 || now >= attempt.server_deadline) {
      if (attempt.is_locked === 0) {
        finalizeAttempt(attempt.id, 'auto_submitted');
      }
      return res.status(403).json({
        error: 'Exam time has expired. Submission locked.',
        isLocked: true
      });
    }

    // Upsert student answer
    const existing = db.prepare('SELECT id FROM student_answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, questionId);

    if (existing) {
      db.prepare(`
        UPDATE student_answers
        SET selected_option = ?, is_marked_review = ?, updated_at = ?
        WHERE id = ?
      `).run(
        selectedOption || null,
        isMarkedReview ? 1 : 0,
        now,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO student_answers (attempt_id, question_id, selected_option, is_marked_review, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        attempt.id,
        questionId,
        selectedOption || null,
        isMarkedReview ? 1 : 0,
        now
      );
    }

    res.json({
      success: true,
      savedAt: now,
      selectedOption,
      isMarkedReview: Boolean(isMarkedReview)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Submit Exam (Manual or Auto-Submit)
router.post('/submit-exam/:examId', verifyToken, requireStudent, (req, res) => {
  const { examId } = req.params;
  const { isAutoSubmit } = req.body;
  const studentId = req.user.id;

  try {
    const attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE student_id = ? AND exam_id = ?').get(studentId, examId);
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found.' });
    }

    // If already locked
    if (attempt.is_locked === 1) {
      return res.json({
        message: 'Exam is already locked and submitted.',
        isLocked: true,
        submissionNotice: {
          title: 'Exam Submitted Successfully',
          message: 'Your examination has been submitted. Your result will be declared by the University.',
          lockStatus: 'Attempt Locked'
        }
      });
    }

    const finalStatus = isAutoSubmit ? 'auto_submitted' : 'submitted';
    const finalized = finalizeAttempt(attempt.id, finalStatus);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (attempt_id, student_id, event_type, details, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      attempt.id,
      studentId,
      isAutoSubmit ? 'AUTO_SUBMIT_TIMEOUT' : 'MANUAL_SUBMIT_SUCCESS',
      `Final status: ${finalStatus}`,
      Date.now()
    );

    // Note: Do NOT return marks or correct answers to student!
    res.json({
      success: true,
      isLocked: true,
      submissionNotice: {
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked',
        submittedAt: new Date(finalized.server_submit_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        referenceId: `CDLU-EXAM-${attempt.id}-${Math.floor(1000 + Math.random() * 9000)}`
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Check Attempt Status (Strictly hides marks from student)
router.get('/attempt-status/:examId', verifyToken, requireStudent, (req, res) => {
  const { examId } = req.params;
  const studentId = req.user.id;

  try {
    const attempt = db.prepare(`
      SELECT sea.id, sea.status, sea.is_locked, sea.server_start_time, sea.server_deadline, sea.server_submit_time,
             e.title as exam_title, e.code as exam_code
      FROM student_exam_attempts sea
      JOIN exams e ON sea.exam_id = e.id
      WHERE sea.student_id = ? AND sea.exam_id = ?
    `).get(studentId, examId);

    if (!attempt) {
      return res.json({ exists: false, isLocked: false });
    }

    // If deadline has passed, ensure it is locked
    if (attempt.is_locked === 0 && Date.now() >= attempt.server_deadline) {
      finalizeAttempt(attempt.id, 'auto_submitted');
      attempt.is_locked = 1;
      attempt.status = 'auto_submitted';
    }

    res.json({
      exists: true,
      isLocked: Boolean(attempt.is_locked),
      status: attempt.status,
      submittedAt: attempt.server_submit_time ? new Date(attempt.server_submit_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
      submissionNotice: attempt.is_locked ? {
        title: 'Exam Submitted Successfully',
        message: 'Your examination has been submitted. Your result will be declared by the University.',
        lockStatus: 'Attempt Locked'
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
