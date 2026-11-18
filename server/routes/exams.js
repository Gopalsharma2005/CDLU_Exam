const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyToken, requireSuperAdmin, requireAdminOrExaminer } = require('../middleware/auth');

// Get exams list
router.get('/', verifyToken, (req, res) => {
  try {
    let query = `
      SELECT e.*, c.name as college_name,
        (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
        (SELECT COUNT(*) FROM student_exam_attempts sea WHERE sea.exam_id = e.id) as total_attempts,
        (SELECT COUNT(*) FROM student_exam_attempts sea WHERE sea.exam_id = e.id AND sea.is_locked = 1) as completed_attempts
      FROM exams e
      LEFT JOIN colleges c ON e.college_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'college_admin') {
      // College admin sees university-wide exams and their specific college exams
      query += ` AND (e.college_id IS NULL OR e.college_id = ?)`;
      params.push(req.user.college_id);
    } else if (req.user.role === 'student') {
      // Student sees active exams matching their college and course
      query += ` AND e.is_active = 1 AND (e.college_id IS NULL OR e.college_id = ?)`;
      params.push(req.user.college_id);
      if (req.user.course) {
        query += ` AND (e.course = ? OR e.course = 'General')`;
        params.push(req.user.course);
      }
    }

    query += ` ORDER BY e.id DESC`;
    const exams = db.prepare(query).all(...params);

    // If student, attach student's attempt status for each exam
    if (req.user.role === 'student') {
      const enriched = exams.map(exam => {
        const attempt = db.prepare(`
          SELECT id, status, is_locked, server_start_time, server_deadline, server_submit_time
          FROM student_exam_attempts
          WHERE student_id = ? AND exam_id = ?
        `).get(req.user.id, exam.id);

        let studentExamStatus = 'NOT_STARTED'; // 'NOT_STARTED', 'IN_PROGRESS', 'LOCKED'
        if (attempt) {
          if (attempt.is_locked === 1) {
            studentExamStatus = 'LOCKED';
          } else if (Date.now() >= attempt.server_deadline) {
            // Deadline expired: auto lock
            db.prepare(`
              UPDATE student_exam_attempts
              SET is_locked = 1, status = 'auto_submitted', server_submit_time = ?
              WHERE id = ?
            `).run(attempt.server_deadline, attempt.id);
            studentExamStatus = 'LOCKED';
          } else {
            studentExamStatus = 'IN_PROGRESS';
          }
        }

        return {
          ...exam,
          attempt_status: studentExamStatus,
          attempt_id: attempt ? attempt.id : null,
          server_deadline: attempt ? attempt.server_deadline : null
        };
      });

      return res.json({ exams: enriched });
    }

    res.json({ exams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single exam details
router.get('/:id', verifyToken, (req, res) => {
  const { id } = req.params;
  const exam = db.prepare(`
    SELECT e.*, c.name as college_name,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count
    FROM exams e
    LEFT JOIN colleges c ON e.college_id = c.id
    WHERE e.id = ?
  `).get(id);

  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  // If student, verify access and check attempt
  if (req.user.role === 'student') {
    const attempt = db.prepare(`
      SELECT id, status, is_locked, server_start_time, server_deadline
      FROM student_exam_attempts
      WHERE student_id = ? AND exam_id = ?
    `).get(req.user.id, id);

    return res.json({
      exam,
      attempt: attempt || null
    });
  }

  res.json({ exam });
});

// Create new Exam (University Super Admin)
router.post('/', verifyToken, requireSuperAdmin, (req, res) => {
  const {
    code,
    title,
    subject,
    course,
    semester,
    duration_minutes,
    total_marks,
    passing_marks,
    instructions,
    college_id,
    start_window,
    end_window
  } = req.body;

  if (!code || !title || !subject || !course) {
    return res.status(400).json({ error: 'Exam Code, Title, Subject and Course are required.' });
  }

  try {
    const opensAt = start_window ? new Date(start_window) : new Date();
    const closesAt = end_window ? new Date(end_window) : new Date(Date.now() + 86400000 * 30);
    if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
      return res.status(400).json({ error: 'A valid closing time after the opening time is required.' });
    }

    const defaultInstructions = instructions || `1. Duration: ${duration_minutes || 30} minutes strictly server controlled.\n2. Answers are saved automatically.\n3. Attempt locks automatically upon timer completion.\n4. Second attempt is not allowed.`;

    const insert = db.prepare(`
      INSERT INTO exams (
        code, title, subject, course, semester, duration_minutes,
        total_marks, passing_marks, instructions, college_id,
        start_window, end_window, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      code.trim().toUpperCase(),
      title.trim(),
      subject.trim(),
      course.trim(),
      semester || 'All Semesters',
      parseInt(duration_minutes, 10) || 30,
      parseFloat(total_marks) || 50,
      parseFloat(passing_marks) || 20,
      defaultInstructions,
      college_id ? parseInt(college_id, 10) : null,
      opensAt.toISOString(),
      closesAt.toISOString()
    );

    const newExam = db.prepare('SELECT * FROM exams WHERE id = ?').get(insert.lastInsertRowid);
    res.status(201).json({ message: 'Exam created successfully', exam: newExam });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: `Exam code "${code}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update Exam
router.put('/:id', verifyToken, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  const {
    title,
    subject,
    course,
    semester,
    duration_minutes,
    total_marks,
    passing_marks,
    instructions,
    college_id,
    is_active
  } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Exam not found.' });
    }
    const finalCollegeId = college_id !== undefined ? (college_id ? parseInt(college_id, 10) : null) : existing.college_id;

    db.prepare(`
      UPDATE exams
      SET title = COALESCE(?, title),
          subject = COALESCE(?, subject),
          course = COALESCE(?, course),
          semester = COALESCE(?, semester),
          duration_minutes = COALESCE(?, duration_minutes),
          total_marks = COALESCE(?, total_marks),
          passing_marks = COALESCE(?, passing_marks),
          instructions = COALESCE(?, instructions),
          college_id = ?,
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      title,
      subject,
      course,
      semester,
      duration_minutes ? parseInt(duration_minutes, 10) : null,
      total_marks ? parseFloat(total_marks) : null,
      passing_marks ? parseFloat(passing_marks) : null,
      instructions,
      finalCollegeId,
      is_active !== undefined ? is_active : null,
      id
    );

    const updated = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    res.json({ message: 'Exam updated successfully', exam: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Exam
router.delete('/:id', verifyToken, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM exams WHERE id = ?').run(id);
    res.json({ message: 'Exam deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Questions endpoint
router.get('/:id/questions', verifyToken, (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role === 'student') {
      // FOR STUDENTS: Check if attempt is valid or locked
      const attempt = db.prepare(`
        SELECT id, is_locked, server_deadline
        FROM student_exam_attempts
        WHERE student_id = ? AND exam_id = ?
      `).get(req.user.id, id);

      if (!attempt) {
        return res.status(403).json({ error: 'Exam has not been started yet. Please click Start Exam.' });
      }

      if (attempt.is_locked === 1 || Date.now() >= attempt.server_deadline) {
        return res.status(403).json({ error: 'Attempt is locked. Exam already submitted.' });
      }

      // Fetch questions WITHOUT correct_option and explanation
      const questions = db.prepare(`
        SELECT q.id, q.exam_id, q.question_number, q.question_text,
               q.option_a, q.option_b, q.option_c, q.option_d, q.marks,
               sa.selected_option, sa.is_marked_review
        FROM questions q
        LEFT JOIN student_answers sa ON sa.question_id = q.id AND sa.attempt_id = ?
        WHERE q.exam_id = ?
        ORDER BY q.question_number ASC
      `).all(attempt.id, id);

      return res.json({ questions });
    }

    // FOR ADMINS / EXAMINERS: return full question data including answers
    const questions = db.prepare(`
      SELECT * FROM questions WHERE exam_id = ? ORDER BY question_number ASC
    `).all(id);

    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add question to Question Bank
router.post('/:id/questions', verifyToken, requireAdminOrExaminer, (req, res) => {
  const { id } = req.params;
  const {
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    marks,
    explanation
  } = req.body;

  if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) {
    return res.status(400).json({ error: 'Question text, all 4 options, and correct option (A/B/C/D) are required.' });
  }

  try {
    // Get next question number
    const maxNum = db.prepare('SELECT MAX(question_number) as max_num FROM questions WHERE exam_id = ?').get(id).max_num || 0;
    const nextNum = maxNum + 1;

    const insert = db.prepare(`
      INSERT INTO questions (
        exam_id, question_number, question_text,
        option_a, option_b, option_c, option_d,
        correct_option, marks, explanation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      nextNum,
      question_text.trim(),
      option_a.trim(),
      option_b.trim(),
      option_c.trim(),
      option_d.trim(),
      correct_option.trim().toUpperCase(),
      parseInt(marks, 10) || 2,
      explanation ? explanation.trim() : null
    );

    const newQuestion = db.prepare('SELECT * FROM questions WHERE id = ?').get(insert.lastInsertRowid);
    res.status(201).json({ message: 'Question added successfully', question: newQuestion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update single question
router.put('/questions/:questionId', verifyToken, requireAdminOrExaminer, (req, res) => {
  const { questionId } = req.params;
  const {
    question_text,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_option,
    marks,
    explanation
  } = req.body;

  try {
    db.prepare(`
      UPDATE questions
      SET question_text = COALESCE(?, question_text),
          option_a = COALESCE(?, option_a),
          option_b = COALESCE(?, option_b),
          option_c = COALESCE(?, option_c),
          option_d = COALESCE(?, option_d),
          correct_option = COALESCE(?, correct_option),
          marks = COALESCE(?, marks),
          explanation = COALESCE(?, explanation)
      WHERE id = ?
    `).run(
      question_text,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option ? correct_option.toUpperCase() : null,
      marks,
      explanation,
      questionId
    );

    const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    res.json({ message: 'Question updated', question: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete question
router.delete('/questions/:questionId', verifyToken, requireAdminOrExaminer, (req, res) => {
  const { questionId } = req.params;
  try {
    db.prepare('DELETE FROM questions WHERE id = ?').run(questionId);
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
