const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const { db } = require('../db');
const { verifyToken, requireSuperAdmin, requireCollegeAdminOrSuper } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    cb(null, name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv'));
  }
});

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

// Import colleges from Excel/CSV: duplicate names are ignored and new names are inserted automatically
router.post('/import', verifyToken, requireSuperAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a valid Excel (.xlsx/.xls) or CSV file.' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return res.status(400).json({ error: 'The uploaded file has no worksheet.' });

    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    const findHeader = (row, names) => {
      const keys = Object.keys(row);
      const match = keys.find((key) => names.includes(String(key).trim().toLowerCase().replace(/[_-]+/g, ' ')));
      return match ? row[match] : '';
    };

    const insertCollege = db.prepare(`
      INSERT INTO colleges (code, name, city, state, status)
      VALUES (?, ?, 'Sirsa', 'Haryana', 'active')
    `);
    const existingByName = db.prepare('SELECT id, name FROM colleges').all();
    const existingNames = new Set(existingByName.map((college) => college.name.trim().toLowerCase()));

    let imported = 0;
    let duplicates = 0;
    db.transaction(() => {
      for (const row of rows) {
        const name = String(findHeader(row, ['college name', 'college', 'name']) || '').trim();
        if (!name) continue;

        const normalized = name.toLowerCase();
        if (existingNames.has(normalized)) {
          duplicates++;
          continue;
        }

        const srNo = String(findHeader(row, ['sr no', 'srno', 'serial no', 's no']) || '').trim();
        const codeBase = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 30);
        let code = codeBase || `COLLEGE-${srNo || imported + 1}`;
        let suffix = 1;
        while (db.prepare('SELECT id FROM colleges WHERE LOWER(code) = LOWER(?)').get(code)) {
          code = `${codeBase}-${++suffix}`;
        }

        insertCollege.run(code, name);
        existingNames.add(normalized);
        imported++;
      }
    })();

    res.json({ message: `Import complete: ${imported} college(s) added, ${duplicates} duplicate(s) skipped.`, imported, duplicates });
  } catch (err) {
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
