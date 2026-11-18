# CDLU Examination Portal

A pure static student authentication portal built with HTML, CSS, JavaScript, and Firebase Authentication.

## Run

Open `index.html` directly in a browser, or serve the project with any static web server.

This project has no Node.js, npm, React, Vite, Express, SQLite, or build-step dependency.

## Firebase setup

The browser Firebase credentials are stored in `firebase-config.js`.

In Firebase Console:

1. Open **Authentication > Sign-in method**.
2. Enable **Email/Password**.
3. Enable **Google**.
4. Open **Authentication > Settings > Authorized domains**.
5. Add `localhost` and every deployed domain used for this portal.

## Files

- `index.html` - portal page
- `styles.css` - white, light green, and sky-blue theme
- `firebase-config.js` - Firebase web configuration
- `app.js` - login and registration behavior
- `cdlu-logo.png` - university logo
- `favicon.svg` - browser icon
