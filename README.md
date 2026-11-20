# Chaudhary Devi Lal University (CDLU) Digital Examination Portal

A secure, server-authoritative online examination platform for Chaudhary Devi Lal University, Sirsa, Haryana.

## Run locally

```powershell
npm run setup
npm start
```

The student portal will open at `http://localhost:5000/`. Authorized administrators can use the separate admin page at `http://localhost:5000/admin.html`.

When opening the standalone pages through a static server such as VS Code Live Server
(`http://127.0.0.1:5500`), the portal automatically uses its browser-based offline
database if the backend API is unavailable. For production, set `VITE_API_BASE_URL`
to the deployed server URL before building the frontend.

## Features

- Student registration and student login
- University and college administrator login
- Separate student (`index.html`) and administrator (`admin.html`) portal entry points
- Server-authoritative examination timers
- Automatic answer saving
- Single-attempt locking
- Secure question and exam management
- University result and monitoring panel
- Responsive student examination interface

## Default development accounts

Demo credentials are available in development mode. Use only official accounts for production examinations.

| Role | Username | Password |
|---|---|---|
| University Super Admin | `admin@cdlu.ac.in` | `Admin@123` |
| College Admin | `admin.ucd@cdlu.ac.in` | `College@123` |
| Student | `CDLU2026001` | `Student@123` |

## Database

The local server uses SQLite and stores its database in `server/cdlu_exam.sqlite`. For a shared production deployment, use a managed database and production authentication credentials.
