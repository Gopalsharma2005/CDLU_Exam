const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { generateToken, verifyToken } = require('../middleware/auth');

router.get('/registration-options', (req, res) => {
  try {
    const colleges = db.prepare(`
      SELECT id, name, code
      FROM colleges
      WHERE status = 'active'
      ORDER BY name
    `).all();
    res.json({ colleges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/register', (req, res) => {
  const { name, email, phone, college_id, course, semester, password } = req.body;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanPhone = typeof phone === 'string' ? phone.trim() : '';
  const normalizedPhone = cleanPhone.replace(/[^\d+]/g, '');
  const cleanCourse = typeof course === 'string' ? course.trim() : '';
  const cleanSemester = typeof semester === 'string' ? semester.trim() : '';
  const collegeId = Number(college_id);

  if (!cleanName || cleanName.length > 100) {
    return res.status(400).json({ error: 'Please enter your name (up to 100 characters).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!/^\+?\d{10,15}$/.test(normalizedPhone)) {
    return res.status(400).json({ error: 'Please enter a valid mobile number with 10 to 15 digits.' });
  }
  if (!Number.isSafeInteger(collegeId) || collegeId < 1 || !cleanCourse || !cleanSemester) {
    return res.status(400).json({ error: 'College, course and semester are required.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Set a password between 8 and 128 characters.' });
  }

  try {
    const college = db.prepare(`
      SELECT id FROM colleges WHERE id = ? AND status = 'active'
    `).get(collegeId);
    if (!college) {
      return res.status(400).json({ error: 'Please select an active college.' });
    }

    const student = db.transaction(() => {
      const existingEmail = db.prepare(`
        SELECT id FROM users WHERE LOWER(email) = ?
      `).get(cleanEmail);
      if (existingEmail) {
        const error = new Error('This email is already registered. Contact your college administrator.');
        error.statusCode = 409;
        throw error;
      }

      const existingPhones = db.prepare(`
        SELECT phone FROM users WHERE phone IS NOT NULL
      `).all();
      const phoneAlreadyRegistered = existingPhones.some(
        (row) => row.phone.replace(/[^\d+]/g, '') === normalizedPhone
      );
      if (phoneAlreadyRegistered) {
        const error = new Error('This mobile number is already registered. Contact your college administrator.');
        error.statusCode = 409;
        throw error;
      }

      const temporaryUsername = `REG-${crypto.randomUUID()}`;
      const insert = db.prepare(`
        INSERT INTO users (username, password, role, name, email, phone, college_id, course, semester, status)
        VALUES (?, ?, 'student', ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        temporaryUsername,
        bcrypt.hashSync(password, 10),
        cleanName,
        cleanEmail,
        normalizedPhone,
        collegeId,
        cleanCourse,
        cleanSemester
      );

      const studentId = `CDLU${new Date().getFullYear()}${String(insert.lastInsertRowid).padStart(6, '0')}`;
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(studentId, insert.lastInsertRowid);
      return { id: insert.lastInsertRowid, studentId };
    })();

    res.status(201).json({
      message: 'Student registration successful.',
      studentId: student.studentId,
      student: {
        id: student.id,
        username: student.studentId,
        name: cleanName,
        email: cleanEmail,
        phone: normalizedPhone,
        college_id: collegeId,
        course: cleanCourse,
        semester: cleanSemester,
        status: 'active'
      }
    });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({ error: err.message });
    }
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Registration details already exist. Please try again or contact your college administrator.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Student ID and password are required.' });
  }

  const cleanUsername = username.trim();
  const user = db.prepare(`
    SELECT u.*, c.name as college_name, c.code as college_code
    FROM users u
    LEFT JOIN colleges c ON u.college_id = c.id
    WHERE LOWER(u.username) = LOWER(?) OR LOWER(u.email) = LOWER(?)
  `).get(cleanUsername, cleanUsername);

  if (!user) {
    return res.status(401).json({ error: 'Invalid Student ID or password.' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Account is deactivated or locked. Contact Exam Controller.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid Student ID or password.' });
  }

  // Safe user profile without hashed password
  const safeUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    college_id: user.college_id,
    college_name: user.college_name,
    college_code: user.college_code,
    course: user.course,
    semester: user.semester,
    status: user.status
  };

  const token = generateToken(safeUser);

  res.json({
    message: 'Login successful',
    token,
    user: safeUser
  });
});

router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
