# ☬ चौधरी देवी लाल विश्वविद्यालय (CDLU), सिरसा
## Sri Guru Gobind Singh Ji Digital Online Examination Portal

An enterprise-grade, server-authoritative online examination platform designed for **Chaudhary Devi Lal University (CDLU), Sirsa, Haryana**, featuring Sri Guru Gobind Singh Ji commemorative branding, multi-tier administrative hierarchy, college-scoped permissions, mobile-first responsive student exam interface, tamper-proof server deadline timers, real-time auto-saving, anti-malpractice locks, and an authorized University Admin Result Panel with CSV export.

---

## 🏛️ Administrative Hierarchy & Roles

```
               University Super Admin
        (Controller of Examinations, CDLU)
       [Full control of all colleges & exams]
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  College 1 Admin  College 2 Admin  College 3 Admin
 (Univ. College)   (JCD Memorial)   (Guru Nanak Girls)
 [College students & records only]
        │                │                │
        ▼                ▼                ▼
    Students         Students         Students
 [30-min mobile exam, auto-save, results strictly withheld]
```

---

## लोकल कंप्यूटर पर चलाएं

पहली बार Node.js install करें और project root से:

```powershell
npm run setup
npm start
```

- **`npm start`**: Server चालू करता है और browser में automatically `http://localhost:5000` (या `index.html`) खोल देता है।
- **`index.html` से चलाना**: अब root की `index.html` ही संपूर्ण CDLU Examination Portal का production app है! आप इसे VS Code में **"Open with Live Server"** द्वारा या सीधे किसी भी local server पर खोल सकते हैं; यह server से automatically connect हो जाएगी।
- **Server Offline Status**: अगर server चालू नहीं है, तो `index.html` पर स्पष्ट सूचना दिखेगी कि backend शुरू करने के लिए `npm start` चलाएं।

Root `index.html` में उपलब्ध सुविधाएं:
1. **Student Registration**: नाम, email, mobile, college, course, semester और password दर्ज करके तुरंत official Student ID generate करें।
2. **Student & Admin Login**: 1-Click quick demo credentials या अपनी ID से sign in करें।
3. **Student Examination Desk**: 30-minute server timer, question palette, mark for review, instant auto-save और lock protection।
4. **University & College Admin Portal**: Dashboard, College management, Student management, Exam creation, Question bank, Live monitoring और Result panel (CSV export सहित)।

लोकल setup में नीचे दिए गए demo accounts उपलब्ध हैं। Online production setup में इन demo accounts की जगह केवल initial University Admin account बनाया जाता है।

## Database और hosting स्थिति

वर्तमान backend SQLite पर चलता है और local computer पर database रखता है। पहले दिए गए Supabase URL/key के बावजूद Supabase/PostgreSQL integration अभी configured नहीं है; server `DATABASE_URL` का उपयोग नहीं करता। इसलिए अलग-अलग computers/colleges के बीच shared online exams चलाने से पहले PostgreSQL backend migration, private database credentials, production authentication settings और hosting deployment पूरा करना होगा। Supabase database password को chat में न भेजें।

Supabase के लिए प्रारंभिक PostgreSQL schema [supabase/migrations/20261117231500_initial_exam_portal.sql](./supabase/migrations/20261117231500_initial_exam_portal.sql) में है। इसे Supabase Dashboard के **SQL Editor** में चलाया जा सकता है। यह tables, indexes और browser access रोकने वाली RLS policies बनाता है; यह अपने आप इस SQLite-आधारित server को Supabase से connect या migrate नहीं करता, और इसमें admin/student passwords seed नहीं किए गए हैं।

`npm start` is for local operation/testing; do not use demo credentials for an official production exam.
---

## 🔑 Pre-Configured Demo Credentials

| Role | Username / Student ID | Password | Scope & Privileges |
| :--- | :--- | :--- | :--- |
| **University Super Admin** | `admin@cdlu.ac.in` | `Admin@123` | Full control across all colleges, exams, question bank, live monitoring, results, and CSV download. |
| **College Admin 1** | `admin.ucd@cdlu.ac.in` | `College@123` | Scoped to **University College, CDLU Sirsa**. |
| **College Admin 2** | `admin.jcd@cdlu.ac.in` | `College@123` | Scoped to **JCD Memorial College, Sirsa**. |
| **College Admin 3** | `admin.gng@cdlu.ac.in` | `College@123` | Scoped to **Guru Nanak Girls College, Sirsa**. |
| **Student 1** | `CDLU2026001` | `Student@123` | Harpreet Singh (BCA 4th Sem, University College). |
| **Student 2** | `CDLU2026002` | `Student@123` | Simran Kaur (BCA 4th Sem, JCD Memorial College). |
| **Student 3** | `CDLU2026003` | `Student@123` | Aman Verma (BCA 4th Sem, completed & locked sample). |

---

## 📱 Student Mobile Exam Flow

1. **Login:** Student enters `Student ID` and password on mobile/desktop.
2. **Profile & Exam Selection:** Views name, college, course, and assigned exams (`Scheduled`, `Ready to Start`, `In Progress`, `Schedule Closed`, or `Attempt Locked`). The server enforces the configured opening and closing times.
3. **Mandatory Instructions:** Accepts CDLU examination rules via checkbox.
4. **Server Timer Starts:** 30-minute countdown is initialized on the **server** (`server_start_time` and `server_deadline`).
5. **Exam Interface:** Clean mobile MCQ cards with options A, B, C, D, mark for review, and question palette.
6. **Instant Auto-Save:** Every selection is immediately synchronized to the SQLite database via `POST /api/student/save-answer`.
7. **Anti-Tamper Server Rule:**
   - The timer is **server-authoritative**. Adjusting the phone's clock does not increase time.
   - If the student closes the browser, gets disconnected, or logs out, the clock keeps running on the server.
   - Logging back in only gives the **remaining server time**.
8. **Automatic Submission & Lock:**
   - When 30 minutes lapse (`Date.now() >= deadline`), the server engine immediately auto-submits all saved answers and sets `is_locked = 1`.
   - Any re-attempt is strictly **BLOCKED** (`403 Attempt Locked`).
   - On exam submission, the student's account is automatically deactivated; an administrator must reactivate it if further portal access is needed.
9. **Result Withheld:**
   - The student is **never shown marks or results**.
   - Instead, the student sees the exact official confirmation:
     ```
     Exam Submitted Successfully
     Your examination has been submitted. Your result will be declared by the University.
     Attempt Locked
     ```

---

## 📊 Admin Panel Modules

1. **University Dashboard:** Aggregated KPIs (total colleges, students, exams, live attempts, pass percentage, college distribution).
2. **College Management:** Add/edit colleges, auto-generate college admin accounts.
3. **Student Management:** View student records, filter by college/course, add students, reset password, unlock attempt upon appeal.
4. **Exam Management:** Create exam papers, set marks/course criteria and the server-enforced opening/closing schedule; activate or deactivate papers.
5. **Question Bank:** Comprehensive MCQ bank with 4 options, designated answer key, marks, and explanation.
6. **Live Exam Monitoring:** Real-time feed of ongoing student attempts with live server countdown, answered questions count, and progress bars (auto-refreshes every 5s).
7. **Result Management (Admin Result Panel):**
   - Displays all required fields:
     - Student Name & ID
     - College Name
     - Course & Semester
     - Exam Name
     - Start Time & Submission Time (IST)
     - Total Questions
     - Correct, Incorrect & Unanswered Answers
     - Total Marks Obtained / Max Marks
     - Attempt Status (`Submitted`, `Auto-Submitted`, `Locked`)
     - Time Taken
   - Question-by-question student answer sheet inspection modal.
8. **Reports:** College-wise comparative performance and passing rates.
9. **Export:** One-click CSV/Excel download with complete exam attempt details.
