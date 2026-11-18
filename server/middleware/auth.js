const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? ''
    : 'cdlu-super-secret-exam-portal-key-2026'
);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production.');
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      college_id: user.college_id
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user still exists and is active
    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.name, u.email, u.college_id, u.course, u.semester, u.status,
             c.name as college_name, c.code as college_code
      FROM users u
      LEFT JOIN colleges c ON u.college_id = c.id
      WHERE u.id = ?
    `).get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is deactivated or locked. Contact University Administration.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied: Requires University Super Admin authorization.' });
  }
  next();
}

function requireCollegeAdminOrSuper(req, res, next) {
  if (req.user.role !== 'super_admin' && req.user.role !== 'college_admin') {
    return res.status(403).json({ error: 'Access denied: Requires Admin authorization.' });
  }
  next();
}

function requireAdminOrExaminer(req, res, next) {
  if (!['super_admin', 'college_admin', 'examiner'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied: Requires Examiner or Admin authorization.' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied: Student access only.' });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  requireSuperAdmin,
  requireCollegeAdminOrSuper,
  requireAdminOrExaminer,
  requireStudent
};
