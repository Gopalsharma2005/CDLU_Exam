const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { verifyToken, requireSuperAdmin, requireCollegeAdminOrSuper } = require('../middleware/auth');

// Get all colleges
router.get('/', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  try {
    let colleges;
    if (req.user.role === 'super_admin') {
      colleges = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM users u WHERE u.college_id = c.id AND u.role = 'student') as student_count,
          (SELECT COUNT(*) FROM exams e WHERE e.college_id = c.id OR e.college_id IS NULL) as exam_count
        FROM colleges c
        ORDER BY c.name ASC
      `).all();
    } else {
      // College admin sees their college
      colleges = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM users u WHERE u.college_id = c.id AND u.role = 'student') as student_count,
          (SELECT COUNT(*) FROM exams e WHERE e.college_id = c.id OR e.college_id IS NULL) as exam_count
        FROM colleges c
        WHERE c.id = ?
      `).all(req.user.college_id);
    }

    res.json({ colleges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new college (Super admin only)
router.post('/', verifyToken, requireSuperAdmin, (req, res) => {
  const { code, name, city, email, phone, adminEmail, adminPassword } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'College Code and College Name are required.' });
  }

  const insertCollege = db.transaction(() => {
    const collegeRes = db.prepare(`
      INSERT INTO colleges (code, name, city, email, phone, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `).run(code.trim().toUpperCase(), name.trim(), city || 'Sirsa', email || null, phone || null);

    const collegeId = collegeRes.lastInsertRowid;

    // Optional: create College Admin user if credentials provided
    if (adminEmail && adminPassword) {
      const hashed = bcrypt.hashSync(adminPassword, 10);
      db.prepare(`
        INSERT INTO users (username, password, role, name, email, college_id, status)
        VALUES (?, ?, 'college_admin', ?, ?, ?, 'active')
      `).run(
        adminEmail.trim(),
        hashed,
        `Admin - ${name}`,
        adminEmail.trim(),
        collegeId
      );
    }

    return collegeId;
  });

  try {
    const newId = insertCollege();
    const college = db.prepare('SELECT * FROM colleges WHERE id = ?').get(newId);
    res.status(201).json({ message: 'College created successfully', college });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'College code already exists. Please choose a unique code.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update college
router.put('/:id', verifyToken, requireSuperAdmin, (req, res) => {
  const { name, city, email, phone, status } = req.body;
  const { id } = req.params;

  try {
    db.prepare(`
      UPDATE colleges
      SET name = COALESCE(?, name),
          city = COALESCE(?, city),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          status = COALESCE(?, status)
      WHERE id = ?
    `).run(name, city, email, phone, status, id);

    const updated = db.prepare('SELECT * FROM colleges WHERE id = ?').get(id);
    res.json({ message: 'College updated successfully', college: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
