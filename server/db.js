const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'cdlu_exam.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for high concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS colleges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Sirsa',
      state TEXT NOT NULL DEFAULT 'Haryana',
      email TEXT,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL, -- 'super_admin', 'college_admin', 'examiner', 'student'
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      college_id INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
      course TEXT,
      semester TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'deactivated', 'locked'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      course TEXT NOT NULL,
      semester TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      total_marks INTEGER NOT NULL DEFAULT 50,
      passing_marks INTEGER NOT NULL DEFAULT 20,
      instructions TEXT,
      college_id INTEGER REFERENCES colleges(id) ON DELETE CASCADE, -- NULL means all colleges
      start_window DATETIME,
      end_window DATETIME,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL, -- 'A', 'B', 'C', or 'D'
      marks INTEGER NOT NULL DEFAULT 2,
      explanation TEXT
    );

    CREATE TABLE IF NOT EXISTS student_exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      server_start_time INTEGER NOT NULL, -- epoch ms
      server_deadline INTEGER NOT NULL,   -- epoch ms (server_start_time + duration*60000)
      server_submit_time INTEGER,        -- epoch ms
      status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'submitted', 'auto_submitted', 'locked'
      is_locked INTEGER NOT NULL DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      correct_answers INTEGER NOT NULL DEFAULT 0,
      incorrect_answers INTEGER NOT NULL DEFAULT 0,
      unanswered INTEGER NOT NULL DEFAULT 0,
      total_marks_obtained REAL NOT NULL DEFAULT 0,
      max_possible_marks REAL NOT NULL DEFAULT 0,
      time_taken_seconds INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, exam_id)
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES student_exam_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option TEXT, -- 'A', 'B', 'C', 'D' or null
      is_marked_review INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER NOT NULL DEFAULT 0,
      marks_awarded REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER,
      student_id INTEGER,
      event_type TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const collegeCount = db.prepare('SELECT COUNT(*) as count FROM colleges').get().count;
  if (collegeCount > 0) return; // already seeded

  const isProduction = process.env.NODE_ENV === 'production';
  const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (isProduction && (!initialAdminPassword || initialAdminPassword.length < 12)) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be set to at least 12 characters before production database initialization.');
  }

  console.log('Seeding initial CDLU database...');

  // 1. Insert Colleges
  const insertCollege = db.prepare(`
    INSERT INTO colleges (code, name, city, state, email, phone, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const colleges = [
    ['CDLU-UCD', 'University College, CDLU Sirsa', 'Sirsa', 'Haryana', 'ucd@cdlu.ac.in', '01666-239811', 'active'],
    ['JCD-SIRSA', 'Jan Nayak Ch. Devi Lal Memorial College', 'Sirsa', 'Haryana', 'jcdm@jcdv.edu.in', '01666-238101', 'active'],
    ['GNG-SIRSA', 'Guru Nanak Girls Post Graduate College', 'Sirsa', 'Haryana', 'gngc@gmail.com', '01666-240212', 'active'],
    ['SSJB-SIRSA', 'Shah Satnam Ji Boys College', 'Sirsa', 'Haryana', 'ssjbc@gmail.com', '01666-245888', 'active'],
    ['GCW-SIRSA', 'Government College for Women, Sirsa', 'Sirsa', 'Haryana', 'gcwsirsa@gmail.com', '01666-220045', 'active']
  ];

  const collegeIds = {};
  for (const c of colleges) {
    const res = insertCollege.run(...c);
    collegeIds[c[0]] = res.lastInsertRowid;
  }

  // 2. Insert Users
  const insertUser = db.prepare(`
    INSERT INTO users (username, password, role, name, email, phone, college_id, course, semester, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const saltRounds = 10;
  const adminPass = bcrypt.hashSync(isProduction ? initialAdminPassword : 'Admin@123', saltRounds);

  if (isProduction) {
    insertUser.run(
      process.env.INITIAL_ADMIN_USERNAME || 'admin@cdlu.ac.in',
      adminPass,
      'super_admin',
      'Controller of Examinations (CDLU)',
      'coe@cdlu.ac.in',
      '01666-239801',
      null,
      null,
      null,
      'active'
    );
    console.log('Initialized production database with the configured University Admin only.');
    return;
  }

  const collegePass = bcrypt.hashSync('College@123', saltRounds);
  const studentPass = bcrypt.hashSync('Student@123', saltRounds);
  const examinerPass = bcrypt.hashSync('Exam@123', saltRounds);

  // Super Admin
  insertUser.run(
    'admin@cdlu.ac.in',
    adminPass,
    'super_admin',
    'Controller of Examinations (CDLU)',
    'coe@cdlu.ac.in',
    '01666-239801',
    null,
    null,
    null,
    'active'
  );

  // College Admins
  insertUser.run(
    'admin.ucd@cdlu.ac.in',
    collegePass,
    'college_admin',
    'Principal / Exam Incharge (University College)',
    'ucd_admin@cdlu.ac.in',
    '9812000001',
    collegeIds['CDLU-UCD'],
    null,
    null,
    'active'
  );

  insertUser.run(
    'admin.jcd@cdlu.ac.in',
    collegePass,
    'college_admin',
    'Exam Nodal Officer (JCD Memorial)',
    'jcd_admin@jcdv.edu.in',
    '9812000002',
    collegeIds['JCD-SIRSA'],
    null,
    null,
    'active'
  );

  insertUser.run(
    'admin.gng@cdlu.ac.in',
    collegePass,
    'college_admin',
    'Principal / Center Supdt (Guru Nanak Girls College)',
    'gng_admin@gmail.com',
    '9812000003',
    collegeIds['GNG-SIRSA'],
    null,
    null,
    'active'
  );

  // Examiner
  insertUser.run(
    'examiner@cdlu.ac.in',
    examinerPass,
    'examiner',
    'Dr. Sukhwinder Singh (Chief Evaluator)',
    'examiner@cdlu.ac.in',
    '9812000004',
    collegeIds['CDLU-UCD'],
    null,
    null,
    'active'
  );

  // Students
  const students = [
    ['CDLU2026001', 'Harpreet Singh', 'harpreet@student.cdlu.ac.in', '9876500001', collegeIds['CDLU-UCD'], 'BCA', '4th Semester'],
    ['CDLU2026002', 'Simran Kaur', 'simran@student.cdlu.ac.in', '9876500002', collegeIds['JCD-SIRSA'], 'BCA', '4th Semester'],
    ['CDLU2026003', 'Aman Verma', 'aman@student.cdlu.ac.in', '9876500003', collegeIds['CDLU-UCD'], 'BCA', '4th Semester'],
    ['CDLU2026004', 'Gurpreet Sharma', 'gurpreet@student.cdlu.ac.in', '9876500004', collegeIds['GNG-SIRSA'], 'BCA', '4th Semester'],
    ['CDLU2026005', 'Rajesh Kumar', 'rajesh@student.cdlu.ac.in', '9876500005', collegeIds['SSJB-SIRSA'], 'B.Tech CSE', '6th Semester'],
    ['CDLU2026006', 'Pooja Rani', 'pooja@student.cdlu.ac.in', '9876500006', collegeIds['GCW-SIRSA'], 'B.Com', '2nd Semester'],
    ['CDLU2026007', 'Kavita Devi', 'kavita@student.cdlu.ac.in', '9876500007', collegeIds['GNG-SIRSA'], 'BCA', '4th Semester'],
    ['CDLU2026008', 'Vikramjeet Sandhu', 'vikram@student.cdlu.ac.in', '9876500008', collegeIds['JCD-SIRSA'], 'BCA', '4th Semester']
  ];

  for (const s of students) {
    insertUser.run(s[0], studentPass, 'student', s[1], s[2], s[3], s[4], s[5], s[6], 'active');
  }

  // 3. Insert Exams
  const insertExam = db.prepare(`
    INSERT INTO exams (code, title, subject, course, semester, duration_minutes, total_marks, passing_marks, instructions, college_id, start_window, end_window, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const instructionsText = `1. The examination duration is exactly 30 minutes from the server start time.
2. The countdown timer is strictly synchronized with the university server. Local clock adjustment will not extend your time.
3. If you disconnect, refresh the page, or close the browser, your countdown timer will continue running on the server.
4. When the 30-minute timer expires, all saved answers will automatically submit and your attempt will be permanently locked.
5. Only one attempt is permitted. A second attempt cannot be taken and will be blocked.
6. Examination results and marks are withheld and will be formally published by the University Admin Panel.
7. Switching tabs or opening prohibited applications may lead to automated disqualification.`;

  const exam1Res = insertExam.run(
    'BCA401-2026',
    'Web Technologies & Relational Database Management Systems',
    'Computer Applications',
    'BCA',
    '4th Semester',
    30, // 30 minutes
    50, // 50 marks
    20, // passing marks
    instructionsText,
    null, // Open to all colleges
    new Date(Date.now() - 3600000).toISOString(),
    new Date(Date.now() + 86400000 * 7).toISOString(),
    1
  );

  const exam2Res = insertExam.run(
    'BCA402-2026',
    'Data Structures & Algorithms Using C/C++',
    'Computer Applications',
    'BCA',
    '4th Semester',
    30,
    50,
    20,
    instructionsText,
    collegeIds['CDLU-UCD'], // Specific to University College
    new Date(Date.now() - 3600000).toISOString(),
    new Date(Date.now() + 86400000 * 7).toISOString(),
    1
  );

  const exam3Res = insertExam.run(
    'ENV101-2026',
    'Environmental Studies & Human Rights Education',
    'General Core',
    'General',
    'All Semesters',
    30,
    50,
    20,
    instructionsText,
    null,
    new Date(Date.now() - 3600000).toISOString(),
    new Date(Date.now() + 86400000 * 7).toISOString(),
    1
  );

  // 4. Insert Questions for Exam 1 (BCA 401 - 25 questions, 2 marks each = 50 marks)
  const insertQuestion = db.prepare(`
    INSERT INTO questions (exam_id, question_number, question_text, option_a, option_b, option_c, option_d, correct_option, marks, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const questionsBCA401 = [
    {
      num: 1,
      q: 'Which of the following HTML5 elements is used to specify a header for a document or section?',
      a: '<top>',
      b: '<header>',
      c: '<head>',
      d: '<section-header>',
      ans: 'B',
      marks: 2,
      exp: '<header> represents introductory content or a set of navigational links in HTML5.'
    },
    {
      num: 2,
      q: 'In SQL, which command is used to remove a relation or table permanently from the database schema?',
      a: 'DELETE TABLE',
      b: 'REMOVE TABLE',
      c: 'DROP TABLE',
      d: 'TRUNCATE TABLE',
      ans: 'C',
      marks: 2,
      exp: 'DROP TABLE permanently removes table definition and all rows from schema.'
    },
    {
      num: 3,
      q: 'Which CSS property is used to control the layout of elements in a 2-dimensional grid system?',
      a: 'display: flex',
      b: 'display: grid',
      c: 'display: table',
      d: 'display: inline-block',
      ans: 'B',
      marks: 2,
      exp: 'CSS Grid provides a two-dimensional grid-based layout system.'
    },
    {
      num: 4,
      q: 'What is the primary characteristic of the ACID properties in database management systems?',
      a: 'Atomicity, Consistency, Isolation, Durability',
      b: 'Accuracy, Concurrency, Integrity, Durability',
      c: 'Authentication, Consistency, Isolation, Distribution',
      d: 'Atomicity, Coherence, Independence, Durability',
      ans: 'A',
      marks: 2,
      exp: 'ACID stands for Atomicity, Consistency, Isolation, and Durability.'
    },
    {
      num: 5,
      q: 'In JavaScript, which operator checks for both equality of value and strict equality of data type?',
      a: '==',
      b: '!=',
      c: '===',
      d: 'equals()',
      ans: 'C',
      marks: 2,
      exp: '=== checks both value and type without type coercion.'
    },
    {
      num: 6,
      q: 'Which normal form eliminates partial functional dependency on the primary key?',
      a: 'First Normal Form (1NF)',
      b: 'Second Normal Form (2NF)',
      c: 'Third Normal Form (3NF)',
      d: 'Boyce-Codd Normal Form (BCNF)',
      ans: 'B',
      marks: 2,
      exp: '2NF removes partial dependency, requiring full functional dependency on primary key.'
    },
    {
      num: 7,
      q: 'Which HTTP method is specifically idempotent and used to replace an existing resource completely?',
      a: 'POST',
      b: 'PATCH',
      c: 'PUT',
      d: 'OPTIONS',
      ans: 'C',
      marks: 2,
      exp: 'PUT is idempotent and replaces the entire target resource with request payload.'
    },
    {
      num: 8,
      q: 'In Relational Algebra, which operator selects rows that satisfy a specified predicate condition?',
      a: 'Projection (π)',
      b: 'Selection (σ)',
      c: 'Cartesian Product (×)',
      d: 'Join (⋈)',
      ans: 'B',
      marks: 2,
      exp: 'Sigma (σ) represents the selection operator in relational algebra.'
    },
    {
      num: 9,
      q: 'Which status code in HTTP signifies that the requested resource requires user authentication or authorization?',
      a: '200 OK',
      b: '301 Moved Permanently',
      c: '401 Unauthorized',
      d: '502 Bad Gateway',
      ans: 'C',
      marks: 2,
      exp: '401 Unauthorized indicates the request has not been applied because it lacks valid authentication credentials.'
    },
    {
      num: 10,
      q: 'What is the purpose of an SQL Foreign Key constraint?',
      a: 'To guarantee unique column values within the same table',
      b: 'To prevent duplicate primary keys in the database',
      c: 'To enforce referential integrity between two related tables',
      d: 'To speed up full-text search indexing',
      ans: 'C',
      marks: 2,
      exp: 'Foreign keys enforce referential integrity between tables.'
    },
    {
      num: 11,
      q: 'Which JavaScript array method creates a new array populated with the results of calling a provided function on every element?',
      a: 'forEach()',
      b: 'map()',
      c: 'filter()',
      d: 'reduce()',
      ans: 'B',
      marks: 2,
      exp: 'map() returns a new transformed array without mutating original.'
    },
    {
      num: 12,
      q: 'In DBMS transaction processing, what does the "D" in ACID ensure?',
      a: 'Transactions are distributed over multiple servers',
      b: 'Committed data will not be lost even in case of system power failure',
      c: 'Duplicate records are automatically normalized',
      d: 'Dynamic locking is acquired during write cycles',
      ans: 'B',
      marks: 2,
      exp: 'Durability guarantees that once a transaction has committed, its updates persist even through server crashes.'
    },
    {
      num: 13,
      q: 'Which HTML attribute specifies an alternate text for an image if the image cannot be displayed?',
      a: 'title',
      b: 'src',
      c: 'alt',
      d: 'caption',
      ans: 'C',
      marks: 2,
      exp: 'alt attribute specifies alternate descriptive text.'
    },
    {
      num: 14,
      q: 'Which clause in an SQL SELECT query is used to filter aggregated group records?',
      a: 'WHERE',
      b: 'HAVING',
      c: 'GROUP BY',
      d: 'ORDER BY',
      ans: 'B',
      marks: 2,
      exp: 'HAVING filters results after aggregation; WHERE filters before aggregation.'
    },
    {
      num: 15,
      q: 'What is the function of the DOM (Document Object Model) in modern web browsers?',
      a: 'To compile server-side PHP scripts into bytecode',
      b: 'An object-oriented representation of the web page that scripts can inspect and modify',
      c: 'A network protocol for transferring binary audio and video streams',
      d: 'A browser database for permanent offline file storage',
      ans: 'B',
      marks: 2,
      exp: 'DOM represents document structure as nodes and objects.'
    },
    {
      num: 16,
      q: 'Which database index structure is most commonly used in relational databases for range queries and sorting?',
      a: 'Hash Table',
      b: 'B+ Tree',
      c: 'Linked List',
      d: 'Binary Trie',
      ans: 'B',
      marks: 2,
      exp: 'B+ Tree index allows efficient point lookups and range scans.'
    },
    {
      num: 17,
      q: 'Which CSS unit is relative to the font-size of the root <html> element?',
      a: 'em',
      b: 'rem',
      c: 'vh',
      d: 'px',
      ans: 'B',
      marks: 2,
      exp: 'rem stands for Root EM and is relative to root html element font-size.'
    },
    {
      num: 18,
      q: 'In a Relational DBMS, what is a "Candidate Key"?',
      a: 'A foreign key that points to a non-existent record',
      b: 'A minimal superkey capable of uniquely identifying every tuple in a relation',
      c: 'A key that holds temporary values during database backup',
      d: 'An encrypted column used exclusively for biometric logins',
      ans: 'B',
      marks: 2,
      exp: 'A candidate key is a minimal superkey capable of uniquely identifying tuples.'
    },
    {
      num: 19,
      q: 'Which format is lightweight, text-based, language-independent, and widely used for data exchange between browser and server?',
      a: 'XML',
      b: 'JSON',
      c: 'YAML',
      d: 'CSV',
      ans: 'B',
      marks: 2,
      exp: 'JSON (JavaScript Object Notation) is the de facto standard format for web APIs.'
    },
    {
      num: 20,
      q: 'Which SQL statement is used to give database users specific privileges such as SELECT or INSERT?',
      a: 'REVOKE',
      b: 'GRANT',
      c: 'ASSIGN',
      d: 'ALLOW',
      ans: 'B',
      marks: 2,
      exp: 'GRANT statement gives privileges to database users.'
    },
    {
      num: 21,
      q: 'What will typeof NaN return in JavaScript?',
      a: '"number"',
      b: '"nan"',
      c: '"undefined"',
      d: '"null"',
      ans: 'A',
      marks: 2,
      exp: 'In JavaScript, typeof NaN is "number".'
    },
    {
      num: 22,
      q: 'Which anomaly occurs in an unnormalized database when deleting one piece of data causes unintentional loss of other data?',
      a: 'Insertion Anomaly',
      b: 'Deletion Anomaly',
      c: 'Modification Anomaly',
      d: 'Concurrency Anomaly',
      ans: 'B',
      marks: 2,
      exp: 'A deletion anomaly occurs when deleting certain data causes other independent data to be lost.'
    },
    {
      num: 23,
      q: 'Which web API is used in JavaScript to make asynchronous HTTP requests without reloading the entire page?',
      a: 'fetch() API',
      b: 'document.write()',
      c: 'window.open()',
      d: 'eval()',
      ans: 'A',
      marks: 2,
      exp: 'fetch() provides an interface for fetching resources asynchronously across network.'
    },
    {
      num: 24,
      q: 'What is the primary role of a DBMS Query Optimizer?',
      a: 'To check spelling mistakes in user queries',
      b: 'To choose the most efficient execution plan for evaluating a given query',
      c: 'To format SQL output with colorful fonts and tables',
      d: 'To translate SQL into HTML markup',
      ans: 'B',
      marks: 2,
      exp: 'Query Optimizer analyzes cost of alternative execution plans to choose lowest cost.'
    },
    {
      num: 25,
      q: 'Which protocol secures web communication through encryption using TLS/SSL?',
      a: 'FTP',
      b: 'HTTP',
      c: 'HTTPS',
      d: 'SMTP',
      ans: 'C',
      marks: 2,
      exp: 'HTTPS (HyperText Transfer Protocol Secure) encrypts communication using TLS.'
    }
  ];

  for (const q of questionsBCA401) {
    insertQuestion.run(
      exam1Res.lastInsertRowid,
      q.num,
      q.q,
      q.a,
      q.b,
      q.c,
      q.d,
      q.ans,
      q.marks,
      q.exp
    );
  }

  // Pre-seed a completed attempt for CDLU2026003 (Aman Verma) to show Admin Results Panel immediately!
  const amanUser = db.prepare('SELECT id FROM users WHERE username = ?').get('CDLU2026003');
  if (amanUser) {
    const startTime = Date.now() - 35 * 60 * 1000; // started 35 mins ago
    const submitTime = startTime + 28 * 60 * 1000 + 45000; // finished in 28m 45s
    const deadline = startTime + 30 * 60 * 1000;

    const attemptRes = db.prepare(`
      INSERT INTO student_exam_attempts (
        student_id, exam_id, server_start_time, server_deadline, server_submit_time,
        status, is_locked, total_questions, correct_answers, incorrect_answers,
        unanswered, total_marks_obtained, max_possible_marks, time_taken_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      amanUser.id,
      exam1Res.lastInsertRowid,
      startTime,
      deadline,
      submitTime,
      'submitted',
      1, // locked!
      25,
      22,
      3,
      0,
      44.0,
      50.0,
      1725
    );

    // Save answer records for Aman
    const questions = db.prepare('SELECT id, question_number, correct_option, marks FROM questions WHERE exam_id = ?').all(exam1Res.lastInsertRowid);
    const insertAnswer = db.prepare(`
      INSERT INTO student_answers (attempt_id, question_id, selected_option, is_marked_review, is_correct, marks_awarded, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      // deliberate 3 incorrect answers for realistic reporting
      let selected = q.correct_option;
      if (i === 4) selected = 'A';
      if (i === 11) selected = 'C';
      if (i === 17) selected = 'A';

      const isCorrect = selected === q.correct_option ? 1 : 0;
      insertAnswer.run(
        attemptRes.lastInsertRowid,
        q.id,
        selected,
        0,
        isCorrect,
        isCorrect ? q.marks : 0,
        startTime + (i + 1) * 60000
      );
    }
  }

  // Pre-seed an auto-submitted (timeout) attempt for CDLU2026004 (Gurpreet Sharma)
  const gurpreetUser = db.prepare('SELECT id FROM users WHERE username = ?').get('CDLU2026004');
  if (gurpreetUser) {
    const startTime = Date.now() - 50 * 60 * 1000; // started 50 mins ago
    const deadline = startTime + 30 * 60 * 1000;
    const submitTime = deadline; // auto-submitted exactly at deadline

    const attemptRes = db.prepare(`
      INSERT INTO student_exam_attempts (
        student_id, exam_id, server_start_time, server_deadline, server_submit_time,
        status, is_locked, total_questions, correct_answers, incorrect_answers,
        unanswered, total_marks_obtained, max_possible_marks, time_taken_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      gurpreetUser.id,
      exam1Res.lastInsertRowid,
      startTime,
      deadline,
      submitTime,
      'auto_submitted',
      1, // locked!
      25,
      18,
      4,
      3,
      36.0,
      50.0,
      1800
    );

    const questions = db.prepare('SELECT id, question_number, correct_option, marks FROM questions WHERE exam_id = ?').all(exam1Res.lastInsertRowid);
    const insertAnswer = db.prepare(`
      INSERT INTO student_answers (attempt_id, question_id, selected_option, is_marked_review, is_correct, marks_awarded, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      let selected = null;
      if (i < 22) {
        selected = (i % 5 === 0) ? 'A' : q.correct_option;
      }
      const isCorrect = selected === q.correct_option ? 1 : 0;
      insertAnswer.run(
        attemptRes.lastInsertRowid,
        q.id,
        selected,
        0,
        isCorrect,
        isCorrect ? q.marks : 0,
        startTime + (i + 1) * 50000
      );
    }
  }

  console.log('Database initialization and seeding completed successfully.');
}

module.exports = {
  db,
  initDb
};
