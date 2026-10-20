const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'daycare.sqlite'));
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('admin','parent','staff')),
 phone TEXT DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS children (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 dob TEXT NOT NULL,
 guardian TEXT DEFAULT '',
 notes TEXT DEFAULT '',
 parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
 parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 booking_date TEXT NOT NULL,
 kind TEXT NOT NULL,
 notes TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')),
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
 staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 attendance_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late')),
 notes TEXT DEFAULT ''
);
`);
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
 const insertUser = db.prepare('INSERT INTO users (name,email,password_hash,role,phone) VALUES (?,?,?,?,?)');
 const password = bcrypt.hashSync('Daycare123!', 10);
 const adminId = Number(insertUser.run('Aarav Sharma','admin@littlesteps.test',password,'admin','9000000001').lastInsertRowid);
 const staffId = Number(insertUser.run('Meera Verma','staff@littlesteps.test',password,'staff','9000000002').lastInsertRowid);
 const parentId = Number(insertUser.run('Riya Kapoor','parent@littlesteps.test',password,'parent','9000000003').lastInsertRowid);
 const childId = Number(db.prepare('INSERT INTO children (name,dob,guardian,notes,parent_id,status) VALUES (?,?,?,?,?,?)').run('Aanya Kapoor','2021-04-12','Riya Kapoor','Allergy information should be confirmed with guardian.',parentId,'Active').lastInsertRowid);
 db.prepare('INSERT INTO bookings (child_id,parent_id,booking_date,kind,notes,status,created_at) VALUES (?,?,?,?,?,?,?)').run(childId,parentId,'2026-11-03','Full day','Sample booking request','Pending','2026-10-19');
 db.prepare('INSERT INTO attendance (child_id,staff_id,attendance_date,status,notes) VALUES (?,?,?,?,?)').run(childId,staffId,'2026-10-19','Present','Sample demo attendance');
}
module.exports = db;
