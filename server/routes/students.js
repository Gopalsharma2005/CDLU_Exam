const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { verifyToken, requireCollegeAdminOrSuper } = require('../middleware/auth');

// Get students list
router.get('/', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  try {
    const { college_id, course, semester, search } = req.query;

    let query = `
      SELECT u.id, u.username as student_id, u.name, u.email, u.phone, u.role,
             u.college_id, u.course, u.semester, u.status, u.created_at,
             c.name as college_name, c.code as college_code,
             (SELECT COUNT(*) FROM student_exam_attempts sea WHERE sea.student_id = u.id) as attempts_count
      FROM users u
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.role = 'student'
    `;
    const params = [];

    // College admin can ONLY see their college's students
    if (req.user.role === 'college_admin') {
      query += ` AND u.college_id = ?`;
      params.push(req.user.college_id);
    } else if (college_id) {
      query += ` AND u.college_id = ?`;
      params.push(college_id);
    }

    if (course) {
      query += ` AND u.course = ?`;
      params.push(course);
    }

    if (semester) {
      query += ` AND u.semester = ?`;
      params.push(semester);
    }

    if (search) {
      query += ` AND (u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY u.id DESC`;

    const students = db.prepare(query).all(...params);
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new student
router.post('/', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  const { student_id, name, email, phone, college_id, course, semester, password } = req.body;

  if (!student_id || !name) {
    return res.status(400).json({ error: 'Student ID and Full Name are required.' });
  }

  // Determine target college
  let targetCollegeId = college_id;
  if (req.user.role === 'college_admin') {
    targetCollegeId = req.user.college_id; // enforce college admin's college
  }

  if (!targetCollegeId) {
    return res.status(400).json({ error: 'College is required.' });
  }

  const studentPassword = password || 'Student@123';
  const hashed = bcrypt.hashSync(studentPassword, 10);

  try {
    const insert = db.prepare(`
      INSERT INTO users (username, password, role, name, email, phone, college_id, course, semester, status)
      VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      student_id.trim().toUpperCase(),
      hashed,
      name.trim(),
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      targetCollegeId,
      course || 'BCA',
      semester || '4th Semester'
    );

    const newStudent = db.prepare(`
      SELECT u.id, u.username as student_id, u.name, u.email, u.phone, u.college_id, u.course, u.semester, u.status,
             c.name as college_name
      FROM users u
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.id = ?
    `).get(insert.lastInsertRowid);

    res.status(201).json({ message: 'Student registered successfully', student: newStudent });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: `Student ID "${student_id}" is already registered in the system.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update student details
router.put('/:id', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  const { id } = req.params;
  const { name, email, phone, course, semester, status, college_id } = req.body;

  // Verify student belongs to college if college admin
  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  if (req.user.role === 'college_admin' && existing.college_id !== req.user.college_id) {
    return res.status(403).json({ error: 'Unauthorized to modify student from another college.' });
  }

  try {
    const updatedCollegeId = req.user.role === 'super_admin' ? (college_id || existing.college_id) : existing.college_id;

    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          course = COALESCE(?, course),
          semester = COALESCE(?, semester),
          status = COALESCE(?, status),
          college_id = ?
      WHERE id = ?
    `).run(name, email, phone, course, semester, status, updatedCollegeId, id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.json({ message: 'Student details updated', student: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset student password
router.post('/:id/reset-password', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  if (req.user.role === 'college_admin' && existing.college_id !== req.user.college_id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  const pass = new_password || 'Student@123';
  const hashed = bcrypt.hashSync(pass, 10);

  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, id);
  res.json({ message: `Password reset successfully for student ${existing.username}. Default password is: ${pass}` });
});

// Unlock student exam attempt (In case of University authorization)
router.post('/:id/unlock-exam/:examId', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  const { id, examId } = req.params;

  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!existing) return res.status(404).json({ error: 'Student not found.' });

  if (req.user.role === 'college_admin' && existing.college_id !== req.user.college_id) {
    return res.status(403).json({ error: 'Unauthorized.' });
  }

  // Delete attempt or set is_locked = 0 and reset timer
  const attempt = db.prepare('SELECT * FROM student_exam_attempts WHERE student_id = ? AND exam_id = ?').get(id, examId);
  if (!attempt) {
    return res.status(404).json({ error: 'No attempt found for this student and exam.' });
  }

  // University allows resetting attempt
  db.transaction(() => {
    db.prepare('DELETE FROM student_answers WHERE attempt_id = ?').run(attempt.id);
    db.prepare('DELETE FROM student_exam_attempts WHERE id = ?').run(attempt.id);
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
    db.prepare(`
      INSERT INTO audit_logs (attempt_id, student_id, event_type, details, timestamp)
      VALUES (?, ?, 'ADMIN_UNLOCKED_ATTEMPT', ?, ?)
    `).run(attempt.id, id, `Unlocked by admin ${req.user.username}`, Date.now());
  })();

  res.json({ message: `Exam attempt unlocked for student ${existing.username}. Student can now start fresh.` });
});

module.exports = router;
