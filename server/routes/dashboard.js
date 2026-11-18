const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { verifyToken, requireCollegeAdminOrSuper } = require('../middleware/auth');

router.get('/stats', verifyToken, requireCollegeAdminOrSuper, (req, res) => {
  try {
    const isSuper = req.user.role === 'super_admin';
    const collegeId = req.user.college_id;
    const now = Date.now();

    let totalStudentsQuery = "SELECT COUNT(*) as count FROM users WHERE role = 'student'";
    let totalExamsQuery = 'SELECT COUNT(*) as count FROM exams';
    let totalAttemptsQuery = 'SELECT COUNT(*) as count FROM student_exam_attempts';
    let liveAttemptsQuery = 'SELECT COUNT(*) as count FROM student_exam_attempts WHERE is_locked = 0 AND server_deadline > ?';
    let completedAttemptsQuery = 'SELECT COUNT(*) as count FROM student_exam_attempts WHERE is_locked = 1';
    let passedAttemptsQuery = `
      SELECT COUNT(*) as count FROM student_exam_attempts sea
      JOIN exams e ON sea.exam_id = e.id
      WHERE sea.is_locked = 1 AND sea.total_marks_obtained >= e.passing_marks
    `;

    if (!isSuper) {
      totalStudentsQuery += ` AND college_id = ${collegeId}`;
      totalExamsQuery += ` WHERE college_id IS NULL OR college_id = ${collegeId}`;
      totalAttemptsQuery += ` WHERE student_id IN (SELECT id FROM users WHERE college_id = ${collegeId})`;
      liveAttemptsQuery += ` AND student_id IN (SELECT id FROM users WHERE college_id = ${collegeId})`;
      completedAttemptsQuery += ` AND student_id IN (SELECT id FROM users WHERE college_id = ${collegeId})`;
      passedAttemptsQuery += ` AND sea.student_id IN (SELECT id FROM users WHERE college_id = ${collegeId})`;
    }

    const totalColleges = isSuper ? db.prepare('SELECT COUNT(*) as count FROM colleges').get().count : 1;
    const totalStudents = db.prepare(totalStudentsQuery).get().count;
    const totalExams = db.prepare(totalExamsQuery).get().count;
    const totalAttempts = db.prepare(totalAttemptsQuery).get().count;
    const liveAttempts = db.prepare(liveAttemptsQuery).get(now).count;
    const completedAttempts = db.prepare(completedAttemptsQuery).get().count;
    const passedAttempts = db.prepare(passedAttemptsQuery).get().count;

    const passRate = completedAttempts > 0 ? Math.round((passedAttempts / completedAttempts) * 100) : 0;

    // College-wise performance breakdown (for University Super Admin)
    let collegeBreakdown = [];
    if (isSuper) {
      collegeBreakdown = db.prepare(`
        SELECT c.id, c.code, c.name, c.city,
               COUNT(DISTINCT u.id) as student_count,
               COUNT(DISTINCT sea.id) as attempts_count,
               AVG(CASE WHEN sea.is_locked = 1 THEN sea.total_marks_obtained ELSE NULL END) as avg_marks,
               SUM(CASE WHEN sea.is_locked = 1 AND sea.total_marks_obtained >= e.passing_marks THEN 1 ELSE 0 END) as passed_count
        FROM colleges c
        LEFT JOIN users u ON u.college_id = c.id AND u.role = 'student'
        LEFT JOIN student_exam_attempts sea ON sea.student_id = u.id
        LEFT JOIN exams e ON sea.exam_id = e.id
        GROUP BY c.id
        ORDER BY student_count DESC
      `).all().map(c => ({
        ...c,
        avg_marks: c.avg_marks ? Math.round(c.avg_marks * 10) / 10 : 0
      }));
    }

    // Recent 5 activities
    let recentAttempts = db.prepare(`
      SELECT sea.id, u.name as student_name, u.username as student_roll_no, c.name as college_name,
             e.title as exam_name, sea.status, sea.total_marks_obtained, sea.server_submit_time
      FROM student_exam_attempts sea
      JOIN users u ON sea.student_id = u.id
      JOIN exams e ON sea.exam_id = e.id
      LEFT JOIN colleges c ON u.college_id = c.id
      ${!isSuper ? `WHERE u.college_id = ${collegeId}` : ''}
      ORDER BY sea.id DESC LIMIT 5
    `).all();

    res.json({
      stats: {
        totalColleges,
        totalStudents,
        totalExams,
        totalAttempts,
        liveAttempts,
        completedAttempts,
        passedAttempts,
        passRate
      },
      collegeBreakdown,
      recentAttempts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
