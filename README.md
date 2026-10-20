# Little Steps — Daycare Management System

A working, server-rendered daycare management system for a college project. The frontend uses HTML/HTML templates rendered on the server with EJS and CSS only; there is **no browser-side JavaScript**. Node.js handles backend routes and SQLite stores data.

## Features
- Registration and login with password hashing and server-side sessions
- Three roles: Admin, Parent, and Staff, with server-side access checks
- Admin dashboard and summary reports
- Child records, staff records, booking requests, and attendance CRUD/workflows
- Search for child and booking records
- Booking approval/rejection and status tracking
- Server-side validation and confirmation/error messages
- Responsive CSS layout
- Demo data and demo accounts created on first launch

## Requirements
- Node.js 22.5 or newer (Node.js 24 LTS/current is suitable)
- Internet access for the first `npm install` (to download dependencies)

## Run on Windows
1. Extract this ZIP to a folder such as `Desktop\daycare-management-system`.
2. Open that folder in Visual Studio Code.
3. Open **Terminal → New Terminal**.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Visit http://localhost:3000 in your browser.
6. Press `Ctrl+C` in the terminal to stop the server.

The database is created automatically at `data/daycare.sqlite` on first launch. Do not delete this file if you want to keep your records.

## Demo logins
All demo passwords are `Daycare123!`.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@littlesteps.test` | `Daycare123!` |
| Staff | `staff@littlesteps.test` | `Daycare123!` |
| Parent | `parent@littlesteps.test` | `Daycare123!` |

You can also register a new Parent account from the registration page. Public registration intentionally cannot create Admin or Staff accounts.

## Main pages
- `/` — landing page
- `/login` and `/register` — authentication
- `/dashboard` — role-specific dashboard
- `/children` — Admin child records
- `/staff` — Admin staff records
- `/bookings` — parent booking requests; Admin can review all requests
- `/attendance` — Staff/Admin attendance
- `/reports` — Admin reports

## Important project notes
- This is an educational local demo, not a production-ready childcare system. Do not enter real children's sensitive information.
- Before public deployment, configure secure environment-based session secrets, HTTPS, CSRF protection, rate limiting, backups, and production-grade account administration.
- The default session secret is for local demonstration only.
- The interface contains no client-side JavaScript. Forms submit to the Node.js backend and pages are rendered on the server.
- This app uses `better-sqlite3`; on some systems it may require a supported Node.js version/build tools during installation.

## Viva notes
- **HTML/EJS:** EJS is a template engine that outputs ordinary HTML from server-side data. Tags such as `header`, `nav`, `main`, `section`, `label`, `input`, and `table` provide structure.
- **CSS:** External stylesheet, selectors, Flexbox, Grid, hover/focus states, and media queries.
- **Node.js:** Runs JavaScript on the server, not in the browser. It receives form submissions, validates input, checks permissions, and sends HTML responses.
- **Express:** Defines routes such as `GET /children` and `POST /children`.
- **SQLite:** Stores records in a local database file.
- **Session:** Remembers the authenticated user between requests. Role checks are done on the server; hiding a link alone is not security.
- **CRUD:** Create, Read, Update, Delete.


**Database dependency note:** This version uses Node.js built-in `node:sqlite` instead of `better-sqlite3`, so Windows does not need Visual Studio C++ build tools to install a native SQLite addon. Node may display an experimental warning for `node:sqlite`; this warning is expected on some Node versions.
