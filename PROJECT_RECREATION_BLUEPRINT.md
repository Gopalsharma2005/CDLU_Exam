# CDLU Online Examination Portal - AI Recreation Blueprint

## 1. Goal

Create a full-stack online examination portal for Chaudhary Devi Lal University (CDLU).

The application must support:

- University Super Admin
- College Admin
- Examiner
- Student
- Student registration
- JWT login
- College-scoped authorization
- Exam creation and scheduling
- MCQ question banks
- Server-authoritative exam timers
- Immediate answer auto-save
- Manual and automatic submission
- Permanent attempt locking
- Student account deactivation after submission
- Live exam monitoring
- Result calculation
- Question-by-question answer review
- CSV result export
- Responsive React interface
- SQLite local database
- Optional offline browser demonstration mode
- Standalone generated root `index.html`

Do not recreate this as a frontend-only prototype. The backend must control authentication, deadlines, scoring, locking, and authorization.

---

## 2. Recommended technology

### Frontend

- React
- Vite
- Tailwind CSS
- Lucide React icons
- Browser `fetch`
- Browser `localStorage`

### Backend

- Node.js
- Express
- `better-sqlite3`
- `bcryptjs`
- `jsonwebtoken`
- `cors`
- `dotenv`

### Database

- SQLite for the primary implementation
- SQLite WAL mode
- Foreign-key enforcement
- Optional PostgreSQL/Supabase schema for future migration

Do not use a plain in-memory database as the primary implementation.

---

## 3. Required repository structure

Create this structure:

```text
exam-portal/
├── package.json
├── README.md
├── render.yaml
├── index.html
├── assets/
├── scripts/
│   └── sync-root.js
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── offlineHandler.js
│       ├── mockData.js
│       ├── App.css
│       ├── index.css
│       └── components/
│           ├── BannerHeader.jsx
│           ├── LoginScreen.jsx
│           ├── StudentPortal.jsx
│           ├── StudentExamScreen.jsx
│           ├── AdminPortal.jsx
│           └── AnswerSheetModal.jsx
├── server/
│   ├── package.json
│   ├── index.js
│   ├── db.js
│   ├── start.js
│   ├── test-suite.js
│   ├── cdlu_exam.sqlite
│   ├── middleware/
│   │   └── auth.js
│   └── routes/
│       ├── auth.js
│       ├── colleges.js
│       ├── students.js
│       ├── exams.js
│       ├── studentExam.js
│       ├── results.js
│       └── dashboard.js
└── supabase/
    └── migrations/
        └── 20261117231500_initial_exam_portal.sql
```

---

## 4. Root package scripts

Create a root `package.json` with these behaviors:

```json
{
  "scripts": {
    "setup": "npm install --prefix server && npm install --prefix client",
    "prestart": "npm run build",
    "start": "node server/start.js",
    "dev:server": "node --watch server/index.js",
    "dev:client": "npm --prefix client run dev",
    "build": "npm --prefix client run build && node scripts/sync-root.js"
  }
}
```

Expected setup:

```powershell
npm run setup
npm start
```

The application must run locally at:

```text
http://localhost:5000
```

---

## 5. SQLite database configuration

Use this database path rule:

- Use `process.env.DB_PATH` when provided
- Otherwise use `server/cdlu_exam.sqlite`
- Create the parent directory if it does not exist

Configure:

```js
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

---

## 6. Database schema

### 6.1 Colleges

```sql
CREATE TABLE colleges (
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
```

Valid status values include:

- `active`
- `inactive`

### 6.2 Users

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  college_id INTEGER REFERENCES colleges(id) ON DELETE SET NULL,
  course TEXT,
  semester TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Roles:

- `super_admin`
- `college_admin`
- `examiner`
- `student`

Account statuses:

- `active`
- `deactivated`
- `locked`

The `password` column must contain a BCrypt hash. Never store a plaintext password.

### 6.3 Exams

```sql
CREATE TABLE exams (
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
  college_id INTEGER REFERENCES colleges(id) ON DELETE CASCADE,
  start_window DATETIME,
  end_window DATETIME,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Rules:

- `college_id = NULL` means the exam is university-wide
- `college_id` set means the exam is assigned to that college
- `course = "General"` means all courses
- `end_window` must be later than `start_window`
- `duration_minutes` must be positive

### 6.4 Questions

```sql
CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  marks INTEGER NOT NULL DEFAULT 2,
  explanation TEXT
);
```

Rules:

- `correct_option` must be `A`, `B`, `C`, or `D`
- Question numbers should be unique within an exam
- Questions must not be sent to students with `correct_option` or `explanation`

### 6.5 Student exam attempts

```sql
CREATE TABLE student_exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  server_start_time INTEGER NOT NULL,
  server_deadline INTEGER NOT NULL,
  server_submit_time INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress',
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
```

Valid attempt statuses:

- `in_progress`
- `submitted`
- `auto_submitted`
- `locked`

The `UNIQUE(student_id, exam_id)` constraint enforces one attempt per student/exam.

### 6.6 Student answers

```sql
CREATE TABLE student_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES student_exam_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option TEXT,
  is_marked_review INTEGER NOT NULL DEFAULT 0,
  is_correct INTEGER NOT NULL DEFAULT 0,
  marks_awarded REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(attempt_id, question_id)
);
```

### 6.7 Audit logs

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER,
  student_id INTEGER,
  event_type TEXT NOT NULL,
  details TEXT,
  timestamp INTEGER NOT NULL
);
```

Log at least:

- `EXAM_STARTED`
- `MANUAL_SUBMIT_SUCCESS`
- `AUTO_SUBMIT_TIMEOUT`
- `SERVER_DEADLINE_AUTO_SUBMIT`
- `ADMIN_UNLOCKED_ATTEMPT`

---

## 7. Seed data

In local/development mode, seed:

### Colleges

- University College, CDLU Sirsa
- Jan Nayak Ch. Devi Lal Memorial College
- Guru Nanak Girls Post Graduate College
- Shah Satnam Ji Boys College
- Government College for Women, Sirsa

### Super Admin

```text
username: admin@cdlu.ac.in
password: Admin@123
role: super_admin
```

### College Admins

```text
admin.ucd@cdlu.ac.in
admin.jcd@cdlu.ac.in
admin.gng@cdlu.ac.in
password: College@123
```

### Examiner

```text
username: examiner@cdlu.ac.in
password: Exam@123
role: examiner
```

### Demo students

Use IDs such as:

```text
CDLU2026001
CDLU2026002
CDLU2026003
```

Password:

```text
Student@123
```

Seeded data must be created only when the college table is empty.

In production:

- Do not insert demo accounts
- Insert only the initial Super Admin
- Require `INITIAL_ADMIN_PASSWORD`
- Password must have at least 12 characters
- Require `JWT_SECRET`

---

## 8. Authentication

### 8.1 Login endpoint

```http
POST /api/auth/login
Content-Type: application/json
```

Request:

```json
{
  "username": "CDLU2026001",
  "password": "Student@123"
}
```

Rules:

- Accept username or email case-insensitively
- Reject missing credentials
- Reject inactive or locked accounts
- Compare BCrypt hashes
- Return a JWT
- Return a safe user object without the password

Successful response:

```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": 1,
    "username": "CDLU2026001",
    "role": "student",
    "name": "Harpreet Singh",
    "college_id": 1,
    "college_name": "University College, CDLU Sirsa",
    "course": "BCA",
    "semester": "4th Semester",
    "status": "active"
  }
}
```

The JWT must expire after 8 hours.

### 8.2 Registration options

```http
GET /api/auth/registration-options
```

Return:

```json
{
  "colleges": [
    {
      "id": 1,
      "name": "University College, CDLU Sirsa",
      "code": "CDLU-UCD"
    }
  ]
}
```

Return only active colleges.

### 8.3 Student registration

```http
POST /api/auth/register
```

Required fields:

```json
{
  "name": "Full Name",
  "email": "student@example.com",
  "phone": "9876500001",
  "college_id": 1,
  "course": "BCA",
  "semester": "4th Semester",
  "password": "password123"
}
```

Validate:

- Name is required and at most 100 characters
- Valid email format
- Email at most 254 characters
- Mobile has 10 to 15 digits
- College exists and is active
- Course is provided
- Semester is provided
- Password is 8 to 128 characters
- Email is unique
- Mobile number is unique

Generate student ID using:

```text
CDLU + current_year + zero-padded database insert ID to 6 digits
```

Example:

```text
CDLU20260001
```

### 8.4 Session verification

```http
GET /api/auth/me
Authorization: Bearer <jwt>
```

The middleware must:

1. Require a Bearer token
2. Verify the JWT
3. Load the current user from SQLite
4. Reject missing accounts
5. Reject inactive accounts
6. Attach `req.user`

### 8.5 Authorization middleware

Create middleware for:

- `requireSuperAdmin`
- `requireCollegeAdminOrSuper`
- `requireAdminOrExaminer`
- `requireStudent`

Role rules:

```text
Super Admin: all records and all operations
College Admin: own college only
Examiner: question and result operations only
Student: student exam operations only
```

---

## 9. Frontend application behavior

### 9.1 App entry

`App.jsx` must maintain:

- `user`
- `token`
- initial loading state

On startup:

1. Read token from `localStorage` or hash handoff parameter
2. Call `/api/auth/me`
3. Set the user if valid
4. Clear the token if invalid
5. Render a loading screen while verifying

Route user according to role:

- `student` -> StudentPortal
- other supported roles -> AdminPortal

### 9.2 Header

Create a top header containing:

- University name
- Portal name
- Current user name
- Role
- Logout button

### 9.3 Footer

Create a detailed university footer containing:

- University identity
- Examination modules
- Contact details
- Security statement
- Copyright
- Version

The interface should use a mobile-first, responsive layout.

---

## 10. Login screen

Create tabs:

- Student login
- Student registration
- College Officer/Admin login
- University Super Admin login

Login tabs must enforce the role:

- College tab allows only `college_admin` or `examiner`
- Super Admin tab allows only `super_admin`
- Student tab allows only `student`

Provide quick demo credentials in local mode.

Display API/network errors without exposing stack traces.

---

## 11. Student portal

Create `StudentPortal.jsx`.

At startup call:

```http
GET /api/student/assigned-exams
Authorization: Bearer <jwt>
```

Display:

- Student profile card
- Name
- Student ID
- College
- Course
- Semester
- Assigned exams
- Refresh button

An exam card must show:

- Exam title
- Subject
- Exam code
- Duration
- Number of questions
- Start window
- End window
- Status
- Remaining time for an in-progress attempt

Status values:

- `UPCOMING`
- `READY_TO_START`
- `IN_PROGRESS`
- `CLOSED`
- `LOCKED`

Before starting an exam:

1. Open an instructions dialog
2. Show server timer information
3. Show attempt locking warning
4. Require checkbox acceptance
5. Enable Start Exam only after acceptance

The student must not be allowed to start:

- Before opening time
- After closing time
- For an unassigned college/course
- If already locked

---

## 12. Student exam screen

Create `StudentExamScreen.jsx`.

### Initialization

On mounting call:

```http
POST /api/student/start-exam/:examId
```

If already locked, show the submitted confirmation immediately.

If the server returns the deadline, set:

- `serverDeadline`
- `remainingSeconds`

Then load questions:

```http
GET /api/exams/:examId/questions
```

Reconstruct:

- Previously selected answers
- Previously marked review flags

### Timer

The frontend should display a countdown that decreases once per second.

Every 25 seconds call:

```http
GET /api/student/timer/:examId
```

If the server says locked or remaining time is zero:

- Call the automatic submission endpoint
- Lock the interface

The frontend countdown must never be the authority.

### Question interface

Display:

- Current question number
- Question text
- Option A
- Option B
- Option C
- Option D
- Previous button
- Next button
- Clear Response button
- Mark for Review button
- Submit Exam button
- Save status

### Question palette

Implement:

- Numbered question buttons
- Answered state
- Current state
- Marked-for-review state
- Unanswered state
- Mobile-compatible layout

### Answer auto-save

Every option selection must immediately call:

```http
POST /api/student/save-answer
```

Payload:

```json
{
  "examId": 1,
  "questionId": 5,
  "selectedOption": "C",
  "isMarkedReview": false
}
```

Show:

- Saving
- Saved
- Save error

If saving fails because the attempt is locked or expired:

- Trigger automatic submission
- Display the locked confirmation

Clearing an answer must send `selectedOption: null`.

Marking for review must save both:

- Existing selected option or `null`
- New review status

---

## 13. Student exam API

### 13.1 Assigned exams

```http
GET /api/student/assigned-exams
```

Filter exams by:

- Active status
- Student college
- Student course
- Existing attempts

For each exam calculate status using server time.

### 13.2 Start or resume

```http
POST /api/student/start-exam/:examId
```

Rules:

1. Reject if no active/in-progress attempt and exam is inactive
2. Reject if exam does not match student college
3. Reject if exam does not match student course
4. Reject if now is before opening time
5. Reject if now is after closing time
6. Reject if attempt is locked
7. Reject if server deadline has passed

For a new attempt:

```js
const serverStartTime = Date.now();
const serverDeadline =
  serverStartTime + durationMinutes * 60 * 1000;
```

Insert:

```text
status = in_progress
is_locked = 0
```

Log `EXAM_STARTED`.

For an existing attempt:

- Preserve original `serverStartTime`
- Preserve original `serverDeadline`
- Return remaining server seconds
- Never reset the timer

### 13.3 Timer sync

```http
GET /api/student/timer/:examId
```

If now >= serverDeadline:

- Finalize with `auto_submitted`
- Return locked status

Otherwise:

```text
remainingSeconds =
floor((serverDeadline - Date.now()) / 1000)
```

### 13.4 Save answer

```http
POST /api/student/save-answer
```

Rules:

- Reject when attempt does not exist
- Reject when attempt is locked
- Reject when server deadline has passed
- Use one row per attempt/question
- Update existing row or insert it

### 13.5 Submit exam

```http
POST /api/student/submit-exam/:examId
```

Request:

```json
{
  "isAutoSubmit": false
}
```

Rules:

- If already locked, return an already-submitted confirmation
- If manually submitted, status is `submitted`
- If automatically submitted, status is `auto_submitted`
- Calculate score on the server
- Lock attempt
- Deactivate student
- Never return marks or correct answers to the student

Finalized response:

```json
{
  "success": true,
  "isLocked": true,
  "submissionNotice": {
    "title": "Exam Submitted Successfully",
    "message": "Your examination has been submitted. Your result will be declared by the University.",
    "lockStatus": "Attempt Locked"
  }
}
```

### 13.6 Attempt status

```http
GET /api/student/attempt-status/:examId
```

Return:

- Whether an attempt exists
- Whether it is locked
- Status
- Submission time
- Submission notice

Never include score fields.

---

## 14. Server deadline engine

Run a background interval every 15 seconds.

Query:

```sql
SELECT *
FROM student_exam_attempts
WHERE is_locked = 0
  AND server_deadline <= current_server_epoch_ms
```

For each expired attempt:

1. Fetch all exam questions
2. Fetch saved answers
3. Calculate answer correctness
4. Update answer result fields
5. Update attempt totals
6. Set `server_submit_time` to `server_deadline`
7. Set status to `auto_submitted`
8. Set `is_locked = 1`
9. Deactivate the student
10. Insert `SERVER_DEADLINE_AUTO_SUBMIT` audit log

The background engine must run independently of the browser.

---

## 15. Scoring algorithm

For every question:

1. Sum the question's marks to `maxPossibleMarks`
2. Find the student's saved answer
3. If no answer:

```text
unanswered++
```

4. If selected option matches correct option:

```text
correctAnswers++
totalMarksObtained += question.marks
```

Set:

```text
is_correct = 1
marks_awarded = question.marks
```

5. If selected option is wrong:

```text
incorrectAnswers++
marks_awarded = 0
is_correct = 0
```

Manual submission time:

```js
actualSubmitTime = min(Date.now(), serverDeadline)
timeTakenSeconds =
  round((actualSubmitTime - serverStartTime) / 1000)
```

Automatic submission time:

```text
server_submit_time = server_deadline
time_taken_seconds = full duration
```

Passing result:

```text
totalMarksObtained >= passingMarks
```

---

## 16. College APIs

### List colleges

```http
GET /api/colleges
```

Super Admin:

- Return all colleges
- Include student counts
- Include exam counts

College Admin:

- Return only own college

### Create college

```http
POST /api/colleges
```

Super Admin only.

Fields:

- code
- name
- city
- state
- email
- phone
- adminEmail
- adminPassword

Optional college admin creation must use:

```text
role = college_admin
college_id = newly_created_college.id
password = BCrypt(adminPassword)
```

Use a database transaction so college and admin are created together.

### Update college

```http
PUT /api/colleges/:id
```

Super Admin only.

---

## 17. Student management APIs

### List students

```http
GET /api/students
```

Filters:

- `college_id`
- `course`
- `semester`
- `search`

College Admin must add a forced college filter.

Return:

- ID
- Student ID/username
- Name
- Email
- Phone
- College
- Course
- Semester
- Status
- Attempt count

### Add student

```http
POST /api/students
```

Rules:

- Student ID and name are required
- College Admin cannot create for another college
- Default password is `Student@123`
- Hash password before inserting

### Update student

```http
PUT /api/students/:id
```

Allow:

- Name
- Email
- Phone
- Course
- Semester
- Status
- College for Super Admin

### Reset password

```http
POST /api/students/:id/reset-password
```

Fields:

```json
{
  "new_password": "optional"
}
```

Hash the password and store only its BCrypt hash.

### Unlock attempt

```http
POST /api/students/:id/unlock-exam/:examId
```

Authorized Super Admin or the student's College Admin.

Required behavior:

1. Find attempt
2. Delete its saved answers
3. Delete the attempt
4. Reactivate student
5. Add audit log

The student can start fresh.

---

## 18. Exam APIs

### List exams

```http
GET /api/exams
```

For Super Admin:

- Return all exams

For College Admin:

- Return university-wide exams
- Return own-college exams

For Student:

- Return active exams assigned to college/course
- Include attempt status

Each response can include:

- Question count
- Total attempts
- Completed attempts
- College name

### Get one exam

```http
GET /api/exams/:id
```

### Create exam

```http
POST /api/exams
```

Super Admin only.

Required fields:

- code
- title
- subject
- course

Optional fields:

- semester
- duration_minutes
- total_marks
- passing_marks
- instructions
- college_id
- start_window
- end_window

Validate opening and closing times.

### Update exam

```http
PUT /api/exams/:id
```

Super Admin only.

### Delete exam

```http
DELETE /api/exams/:id
```

Super Admin only.

Use foreign-key cascades for questions and attempts.

---

## 19. Question APIs

### Get questions

```http
GET /api/exams/:examId/questions
```

For a student:

1. Require an active attempt
2. Reject locked attempts
3. Reject expired attempts
4. Return public question fields only
5. Include:

```text
id
exam_id
question_number
question_text
option_a
option_b
option_c
option_d
marks
selected_option
is_marked_review
```

Do not return:

- `correct_option`
- `explanation`

For Admin/Examiner:

- Return every question field
- Include correct option and explanation

### Add question

```http
POST /api/exams/:examId/questions
```

Require:

- question_text
- option_a
- option_b
- option_c
- option_d
- correct_option
- marks

Assign next question number.

### Update question

```http
PUT /api/exams/questions/:questionId
```

### Delete question

```http
DELETE /api/exams/questions/:questionId
```

---

## 20. Dashboard API

```http
GET /api/dashboard/stats
```

Authorized for Super Admin and College Admin.

Return:

```json
{
  "stats": {
    "totalColleges": 5,
    "totalStudents": 8,
    "totalExams": 3,
    "totalAttempts": 3,
    "liveAttempts": 1,
    "completedAttempts": 2,
    "passedAttempts": 1,
    "passRate": 50
  },
  "collegeBreakdown": [],
  "recentAttempts": []
}
```

Super Admin:

- University totals
- College breakdown
- Recent attempts

College Admin:

- Own college totals only
- Own college attempts only

---

## 21. Live monitoring API

```http
GET /api/results/monitoring/live
```

Authorized for Admin/Examiner.

College Admin must see only own-college attempts.

For each attempt calculate:

- Student name
- Student roll number
- College name
- Course
- Exam name
- Whether live
- Status
- Answered count
- Total questions
- Progress percentage
- Server remaining seconds
- Start time in IST

An attempt is live when:

```text
is_locked = 0
AND now < server_deadline
```

Limit to 50 most recent attempts.

---

## 22. Results API

### Result list

```http
GET /api/results
```

Filters:

- `college_id`
- `exam_id`
- `status`
- `search`

College Admin must always filter to own college.

Each record must include:

- Attempt ID
- Student name
- Student ID
- College
- Course
- Semester
- Exam name
- Exam code
- Start time formatted in IST
- Submission time formatted in IST
- Status
- Time taken
- Total questions
- Correct count
- Incorrect count
- Unanswered count
- Marks obtained
- Maximum marks
- Percentage
- Passed/failed status

### Result detail

```http
GET /api/results/detail/:attemptId
```

For each question return:

- Question number
- Question text
- Option A
- Option B
- Option C
- Option D
- Correct option
- Student selected option
- Whether correct
- Marks awarded
- Explanation
- Marked for review

College Admin must reject attempts from another college.

### CSV export

```http
GET /api/results/export-csv
```

Set:

```text
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment
```

CSV columns:

1. Student Roll No
2. Student Name
3. College Name
4. Course
5. Semester
6. Exam Name
7. Start Time (IST)
8. Submission Time (IST)
9. Attempt Status
10. Time Taken
11. Total Questions
12. Correct Answers
13. Incorrect Answers
14. Unanswered
15. Total Marks Obtained
16. Max Marks
17. Percentage
18. Result Status

---

## 23. Express server

Create `server/index.js` to:

1. Initialize the SQLite database
2. Configure CORS
3. Parse JSON
4. Register route groups
5. Serve `client/dist`
6. Serve the root folder
7. Run the deadline engine
8. Provide health check
9. Provide SPA fallback
10. Listen on `PORT` or port 5000

Mount routes:

```text
/api/auth
/api/colleges
/api/students
/api/exams
/api/student
/api/results
/api/dashboard
```

Health endpoint:

```http
GET /api/health
```

Response:

```json
{
  "status": "online",
  "portal": "CDLU Sri Guru Gobind Singh Ji Examination Portal",
  "serverTime": 123456789,
  "timestampIST": "IST formatted string"
}
```

SPA fallback must serve:

- Root `index.html` if present
- Otherwise `client/dist/index.html`

API paths not found must return JSON `404`.

---

## 24. CORS

Create CORS configuration using:

```env
CORS_ORIGIN=https://first.example,https://second.example
```

Rules:

- Allow a request with no origin
- Allow configured origins
- Allow `localhost` and `127.0.0.1` only outside production

---

## 25. JWT middleware

Use:

```env
JWT_SECRET=<long-random-secret>
```

Development fallback may exist, but production must require the variable.

JWT payload:

- `id`
- `username`
- `role`
- `name`
- `college_id`

Reject:

- Missing Authorization header
- Non-Bearer header
- Invalid token
- Expired token
- Missing user
- Deactivated or locked account

---

## 26. API helper

Create `client/src/api.js`.

Use:

```env
VITE_API_BASE_URL
```

URL behavior:

- Use configured base URL when present
- If page protocol is `file:`, use `http://localhost:5000`
- If localhost uses a non-5000 port, use `http://localhost:5000`
- Otherwise use relative URLs

Implement a short request timeout.

If the server returns `404`, `502`, or is unreachable:

- Delegate to browser offline handler

The offline handler must be optional and labeled as demonstration-only.

---

## 27. Standalone build

Create `scripts/sync-root.js` to:

1. Verify `client/dist` exists
2. Copy assets to root `assets/`
3. Copy logo, favicon, and icons
4. Read one generated CSS file
5. Read one generated JavaScript file
6. Embed the logo as Base64
7. Generate root `index.html`
8. Embed CSS and JavaScript into it

The root page must open directly and still route API calls to `localhost:5000`.

---

## 28. Offline demo mode

Create `offlineHandler.js`.

When the backend is unavailable:

- Store an offline database in `localStorage`
- Initialize it from demo mock data
- Implement demo API responses
- Maintain demo login
- Maintain demo attempt state
- Maintain demo answers
- Maintain demo submission state

Clearly label this mode as offline/demo.

Do not present offline mode as a secure production implementation.

---

## 29. UI theme

Use:

- Sky-blue primary color
- Light-green secondary color
- White backgrounds and surfaces
- Sky-blue borders, icons, gradients, focus states, and loading indicators
- Light-green success badges, progress states, and accents
- Dark navy/sky text for contrast
- Sky-blue dark header and footer
- Red destructive/lock indicators
- Rounded cards
- Mobile responsive layouts
- Loading spinners
- Clear error banners
- Accessible buttons and labels

Recommended Tailwind palette:

```text
Sky primary:     sky-500 / sky-600
Sky background:  sky-50 / sky-100
Sky dark:        sky-800 / sky-950
Green accent:    green-300 / green-400
Green background: green-50 / green-100
Main surface:    white
Primary text:    slate-900 / slate-700
Secondary text:  slate-500 / slate-600
Error:           red-500 / red-600
```

Include a CDLU/Sri Guru Gobind Singh Ji commemorative identity only if permitted by the final organization.

The main layout should include:

- Header
- Main viewport
- Login or role-specific portal
- Footer

---

## 30. Local startup

Development setup:

```powershell
npm run setup
npm start
```

Frontend-only development:

```powershell
npm run dev:client
```

Backend-only development:

```powershell
npm run dev:server
```

The backend server should expose:

```text
http://localhost:5000/api/health
```

---

## 31. Render deployment

Add `render.yaml` for a Node web service.

Use:

```text
rootDir: server
buildCommand: npm install
startCommand: node index.js
```

Environment variables:

```text
NODE_NODE=production
DB_PATH=/var/data/cdlu_exam.sqlite
JWT_SECRET=<secure-secret>
INITIAL_ADMIN_PASSWORD=<secure-password>
INITIAL_ADMIN_USERNAME=admin@cdlu.ac.in
CORS_ORIGIN=<comma-separated-origins>
PORT=5000
```

Mount a persistent disk at:

```text
/var/data
```

Do not store production secrets in source code.

---

## 32. Security requirements

Implement:

- Password BCrypt hashing
- JWT authentication
- Active account verification
- Role authorization
- College-level data isolation
- Server deadline storage
- Server-side scoring
- Correct answer key not sent to students
- One attempt per student/exam
- One answer per attempt/question
- Submission locking
- Student account deactivation
- Audit logs
- Admin unlock transaction

Do not log passwords or JWTs.

Do not accept an exam timer deadline from the client.

Do not accept final score values from the client.

Do not trust browser device time.

Do not expose correct answers in student API responses.

Do not allow college admin to modify another college.

Do not allow student to submit a locked attempt.

---

## 33. Features not to misrepresent

The base implementation does not need to claim:

- Full-screen enforcement
- Camera proctoring
- Tab-switch detection
- Browser copy/paste prevention
- Face recognition
- Screen monitoring
- Question randomization
- Two-factor authentication
- Device fingerprinting
- WebSocket live updates

Live monitoring can use frontend polling every five seconds.

Advanced secure production exams require additional infrastructure and policy review.

---

## 34. Acceptance tests

### Authentication tests

- Valid student login succeeds
- Invalid password fails
- Inactive student cannot log in
- Super Admin can access all routes
- College Admin cannot access another college
- Student cannot access admin routes
- `/api/auth/me` rejects an invalid JWT

### Registration tests

- Valid registration creates a student
- Student ID follows required format
- Duplicate email fails
- Duplicate phone fails
- Inactive college fails
- Password below 8 characters fails

### Exam assignment tests

- University-wide exam appears for all colleges
- College exam appears only for assigned college
- Wrong-course exam does not appear
- Inactive exam does not appear to normal students

### Timer tests

- First start sets server start/deadline
- Resume does not reset deadline
- Browser time cannot affect deadline
- Timer API returns remaining server seconds
- Expired attempts become `auto_submitted`
- Background engine locks expired attempts

### Auto-save tests

- Selecting an answer creates a row
- Changing an answer updates the row
- Clearing an answer sets `selected_option` to `null`
- Mark for review is persisted
- Reopening exam restores saved answers

### Submission tests

- Manual submission status is `submitted`
- Timeout status is `auto_submitted`
- Attempt becomes locked
- Student becomes deactivated
- Second submission is blocked
- Student does not receive correct answers or marks

### Scoring tests

- Correct answer awards question marks
- Wrong answer awards zero
- Missing answer is unanswered
- Maximum marks equals sum of question marks
- Passing status is based on configured passing marks

### Admin tests

- Super Admin sees all colleges
- College Admin sees one college
- College Admin cannot open another college result
- Admin can add/edit/delete questions
- Admin can unlock attempt
- Unlock deletes prior attempt and answers
- Unlock reactivates student

### Monitoring tests

- Live attempt shows live status
- Answer count updates after save
- Progress percentage is calculated correctly
- Expired attempt leaves live monitor

### CSV tests

- CSV downloads with expected headers
- Student names containing quotes are escaped
- Date fields use IST
- College Admin export is restricted

---

## 35. Recommended implementation order

Implement in this exact order:

1. Repository and package structure
2. SQLite schema
3. Seed data
4. JWT authentication
5. Role middleware
6. Login and registration frontend
7. College APIs
8. Student APIs
9. Exam APIs
10. Question APIs
11. Server timer
12. Answer saving
13. Scoring and submission
14. Student account locking
15. Admin dashboard
16. Monitoring
17. Results
18. CSV export
19. Standalone build
20. Optional offline fallback
21. Tests
22. Production deployment

---

## 36. Final implementation description

The recreated application must behave as a server-authoritative examination system:

```text
React student interface
        ↓
JWT authenticated Express REST API
        ↓
SQLite attempt and answer records
        ↓
Server-owned start and deadline timestamps
        ↓
Answer auto-save
        ↓
Manual submit or 15-second deadline engine
        ↓
Server-side scoring
        ↓
Permanent attempt lock
        ↓
Admin monitoring and result reporting
```

The frontend is only a presentation and interaction layer. The backend database and server clock are authoritative.
