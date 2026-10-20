const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false, limit: '30kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'little_steps.sid',
  secret: process.env.SESSION_SECRET || 'local-demo-secret-change-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 4 }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.notice = req.session.notice || null;
  delete req.session.notice;
  res.locals.formatDate = (value) => value ? String(value).slice(0, 10) : '—';
  next();
});
function notice(req, type, message) { req.session.notice = { type, message }; }
function safeText(value, max = 120) { return String(value || '').trim().slice(0, max); }
function requireLogin(req, res, next) {
  if (!req.session.user) { notice(req, 'error', 'Please log in to continue.'); return res.redirect('/login'); }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) { notice(req, 'error', 'Please log in to continue.'); return res.redirect('/login'); }
    if (!roles.includes(req.session.user.role)) return res.status(403).render('error', { title: 'Access denied', message: 'Your account does not have permission to view this page.' });
    next();
  };
}
function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function renderError(res, message, status = 400) { return res.status(status).render('error', { title: status === 403 ? 'Access denied' : 'Something went wrong', message }); }

app.get('/', (req, res) => res.render('home', { title: 'Welcome' }));
app.get('/register', (req, res) => res.render('register', { title: 'Create parent account' }));
app.post('/register', (req, res) => {
  const name = safeText(req.body.name, 100), email = safeText(req.body.email, 160).toLowerCase();
  const phone = safeText(req.body.phone, 30), password = String(req.body.password || '');
  if (!name || !validEmail(email) || password.length < 8) {
    notice(req, 'error', 'Enter your name, a valid email, and a password of at least 8 characters.'); return res.redirect('/register');
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    notice(req, 'error', 'An account with that email already exists. Please log in.'); return res.redirect('/register');
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (name,email,password_hash,role,phone) VALUES (?,?,?,?,?)').run(name,email,hash,'parent',phone);
  req.session.user = { id: Number(result.lastInsertRowid), name, email, role: 'parent', phone };
  notice(req, 'success', 'Your parent account has been created. Welcome to Little Steps!'); res.redirect('/dashboard');
});
app.get('/login', (req, res) => res.render('login', { title: 'Login' }));
app.post('/login', (req, res) => {
  const email = safeText(req.body.email, 160).toLowerCase(), password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    notice(req, 'error', 'Email or password is incorrect.'); return res.redirect('/login');
  }
  req.session.regenerate((err) => {
    if (err) return renderError(res, 'Could not start your session. Please try again.', 500);
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone };
    notice(req, 'success', `Welcome back, ${user.name}.`); res.redirect('/dashboard');
  });
});
app.post('/logout', requireLogin, (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/dashboard', requireLogin, (req, res) => {
  const user = req.session.user;
  const stats = {
    children: db.prepare("SELECT COUNT(*) AS n FROM children WHERE status = 'Active'").get().n,
    staff: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'staff'").get().n,
    pending: db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'Pending'").get().n,
    bookings: db.prepare('SELECT COUNT(*) AS n FROM bookings').get().n
  };
  let children = [], bookings = [], attendance = [];
  if (user.role === 'parent') {
    children = db.prepare('SELECT * FROM children WHERE parent_id = ? ORDER BY id DESC').all(user.id);
    bookings = db.prepare('SELECT b.*, c.name AS child_name FROM bookings b JOIN children c ON c.id=b.child_id WHERE b.parent_id=? ORDER BY b.id DESC LIMIT 5').all(user.id);
  } else if (user.role === 'staff') {
    attendance = db.prepare("SELECT a.*, c.name AS child_name FROM attendance a JOIN children c ON c.id=a.child_id WHERE a.staff_id=? ORDER BY a.attendance_date DESC, a.id DESC LIMIT 8").all(user.id);
  } else {
    bookings = db.prepare('SELECT b.*, c.name AS child_name, u.name AS parent_name FROM bookings b JOIN children c ON c.id=b.child_id JOIN users u ON u.id=b.parent_id ORDER BY b.id DESC LIMIT 5').all();
  }
  res.render('dashboard', { title: 'Dashboard', stats, children, bookings, attendance });
});

// Child records: Admin can manage all; Parents can view/add only their own children.
app.get('/children', requireLogin, (req, res) => {
  const q = safeText(req.query.q, 100);
  let children;
  if (req.session.user.role === 'admin') {
    children = q ? db.prepare('SELECT c.*, u.name AS parent_name FROM children c JOIN users u ON u.id=c.parent_id WHERE c.name LIKE ? OR u.name LIKE ? ORDER BY c.id DESC').all(`%${q}%`,`%${q}%`)
      : db.prepare('SELECT c.*, u.name AS parent_name FROM children c JOIN users u ON u.id=c.parent_id ORDER BY c.id DESC').all();
  } else if (req.session.user.role === 'parent') {
    children = db.prepare('SELECT c.*, u.name AS parent_name FROM children c JOIN users u ON u.id=c.parent_id WHERE c.parent_id=? AND c.name LIKE ? ORDER BY c.id DESC').all(req.session.user.id, `%${q}%`);
  } else return renderError(res, 'Only Admin and Parent accounts can view child records.', 403);
  res.render('children', { title: 'Children', children, q });
});
app.get('/children/new', requireRole('admin','parent'), (req,res) => { const parents = req.session.user.role === 'admin' ? db.prepare("SELECT id,name,email FROM users WHERE role='parent' ORDER BY name").all() : []; res.render('child-form',{title:'Register a child',child:null,parents}); });
app.post('/children', requireRole('admin','parent'), (req,res) => {
  const name=safeText(req.body.name,100), dob=safeText(req.body.dob,10), guardian=safeText(req.body.guardian,100), notes=safeText(req.body.notes,500);
  const parentId = req.session.user.role === 'parent' ? req.session.user.id : Number(req.body.parent_id);
  const parent = db.prepare("SELECT id FROM users WHERE id=? AND role='parent'").get(parentId);
  if (!name || !dob || !parent) { notice(req,'error','Please provide a child name, date of birth, and a valid parent account.'); return res.redirect('/children/new'); }
  db.prepare('INSERT INTO children (name,dob,guardian,notes,parent_id,status) VALUES (?,?,?,?,?,?)').run(name,dob,guardian,notes,parentId,'Active');
  notice(req,'success','Child record created successfully.'); res.redirect('/children');
});
app.get('/children/:id/edit', requireLogin, (req,res) => {
  if (!['admin','parent'].includes(req.session.user.role)) return renderError(res,'Only Admin and Parent accounts can edit child records.',403);
  const child=db.prepare('SELECT * FROM children WHERE id=?').get(Number(req.params.id));
  if (!child) return renderError(res,'Child record not found.',404);
  if (req.session.user.role==='parent' && child.parent_id!==req.session.user.id) return renderError(res,'You can only edit your own child records.',403);
  res.render('child-form',{title:'Edit child record',child});
});
app.post('/children/:id/edit', requireLogin, (req,res) => {
  if (!['admin','parent'].includes(req.session.user.role)) return renderError(res,'Permission denied.',403);
  const child=db.prepare('SELECT * FROM children WHERE id=?').get(Number(req.params.id));
  if (!child) return renderError(res,'Child record not found.',404);
  if (req.session.user.role==='parent' && child.parent_id!==req.session.user.id) return renderError(res,'You can only edit your own child records.',403);
  const name=safeText(req.body.name,100), dob=safeText(req.body.dob,10), guardian=safeText(req.body.guardian,100), notes=safeText(req.body.notes,500);
  const status=req.session.user.role==='admin' && ['Active','Inactive'].includes(req.body.status) ? req.body.status : child.status;
  if (!name || !dob) { notice(req,'error','Child name and date of birth are required.'); return res.redirect(`/children/${child.id}/edit`); }
  db.prepare('UPDATE children SET name=?,dob=?,guardian=?,notes=?,status=? WHERE id=?').run(name,dob,guardian,notes,status,child.id);
  notice(req,'success','Child record updated.'); res.redirect('/children');
});
app.post('/children/:id/delete', requireRole('admin'), (req,res) => {
  const id=Number(req.params.id);
  try { db.prepare('DELETE FROM children WHERE id=?').run(id); notice(req,'success','Child record deleted. Related booking and attendance records were also removed.'); }
  catch { notice(req,'error','Could not delete this child record.'); }
  res.redirect('/children');
});

// Staff accounts are managed by Admin. Public registration cannot create staff/admin accounts.
app.get('/staff', requireRole('admin'), (req,res) => {
  const staff=db.prepare("SELECT id,name,email,phone FROM users WHERE role='staff' ORDER BY name").all();
  res.render('staff',{title:'Staff management',staff});
});
app.get('/staff/new', requireRole('admin'), (req,res) => res.render('staff-form',{title:'Add staff member'}));
app.post('/staff', requireRole('admin'), (req,res) => {
  const name=safeText(req.body.name,100), email=safeText(req.body.email,160).toLowerCase(), phone=safeText(req.body.phone,30), password=String(req.body.password||'');
  if (!name || !validEmail(email) || password.length<8) { notice(req,'error','Enter a name, valid email, and password of at least 8 characters.'); return res.redirect('/staff/new'); }
  try { db.prepare('INSERT INTO users (name,email,password_hash,role,phone) VALUES (?,?,?,?,?)').run(name,email,bcrypt.hashSync(password,10),'staff',phone); notice(req,'success','Staff account created.'); }
  catch { notice(req,'error','That email address is already in use.'); }
  res.redirect('/staff');
});
app.post('/staff/:id/delete', requireRole('admin'), (req,res) => {
  const id=Number(req.params.id);
  if (id===req.session.user.id) { notice(req,'error','You cannot delete your own admin account.'); return res.redirect('/staff'); }
  const target=db.prepare("SELECT id FROM users WHERE id=? AND role='staff'").get(id);
  if (!target) { notice(req,'error','Staff account not found.'); return res.redirect('/staff'); }
  db.prepare('DELETE FROM users WHERE id=?').run(id); notice(req,'success','Staff account deleted.'); res.redirect('/staff');
});

// Booking workflow.
app.get('/bookings', requireLogin, (req,res) => {
  const user=req.session.user;
  if (!['admin','parent'].includes(user.role)) return renderError(res,'Only Admin and Parent accounts can manage bookings.',403);
  const q=safeText(req.query.q,100), status=safeText(req.query.status,20);
  let sql='SELECT b.*, c.name AS child_name, u.name AS parent_name FROM bookings b JOIN children c ON c.id=b.child_id JOIN users u ON u.id=b.parent_id WHERE 1=1';
  const args=[];
  if(user.role==='parent'){sql+=' AND b.parent_id=?';args.push(user.id);}
  if(q){sql+=' AND (c.name LIKE ? OR u.name LIKE ?)';args.push(`%${q}%`,`%${q}%`);}
  if(['Pending','Approved','Rejected'].includes(status)){sql+=' AND b.status=?';args.push(status);}
  sql+=' ORDER BY b.id DESC';
  const bookings=db.prepare(sql).all(...args);
  const children=user.role==='parent' ? db.prepare("SELECT id,name FROM children WHERE parent_id=? AND status='Active' ORDER BY name").all(user.id) : [];
  res.render('bookings',{title:'Bookings',bookings,children,q,status});
});
app.post('/bookings', requireRole('parent'), (req,res) => {
  const childId=Number(req.body.child_id), date=safeText(req.body.booking_date,10), kind=safeText(req.body.kind,30), notes=safeText(req.body.notes,500);
  const child=db.prepare('SELECT id FROM children WHERE id=? AND parent_id=? AND status=\'Active\'').get(childId,req.session.user.id);
  if(!child || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['Full day','Half day','Hourly'].includes(kind)) { notice(req,'error','Please choose your child, a valid date, and a booking type.'); return res.redirect('/bookings'); }
  db.prepare('INSERT INTO bookings (child_id,parent_id,booking_date,kind,notes,status,created_at) VALUES (?,?,?,?,?,?,?)').run(childId,req.session.user.id,date,kind,notes,'Pending',new Date().toISOString().slice(0,10));
  notice(req,'success','Booking request submitted. Its status is Pending until Admin reviews it.'); res.redirect('/bookings');
});
app.post('/bookings/:id/status', requireRole('admin'), (req,res) => {
  const status=safeText(req.body.status,20), id=Number(req.params.id);
  if(!['Approved','Rejected','Pending'].includes(status)){notice(req,'error','Invalid booking status.');return res.redirect('/bookings');}
  const result=db.prepare('UPDATE bookings SET status=? WHERE id=?').run(status,id);
  notice(req,result.changes?'Booking status updated.':'Booking request not found.'); res.redirect('/bookings');
});
app.post('/bookings/:id/delete', requireLogin, (req,res) => {
  const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(Number(req.params.id));
  if(!booking) { notice(req,'error','Booking not found.'); return res.redirect('/bookings'); }
  if(req.session.user.role!=='admin' && !(req.session.user.role==='parent' && booking.parent_id===req.session.user.id && booking.status==='Pending')) return renderError(res,'You cannot delete this booking.',403);
  db.prepare('DELETE FROM bookings WHERE id=?').run(booking.id); notice(req,'success','Booking request deleted.'); res.redirect('/bookings');
});

// Attendance: Staff/Admin may create and view records. Staff may edit/delete records they created.
app.get('/attendance', requireRole('admin','staff'), (req,res) => {
  const q=safeText(req.query.q,100); let sql='SELECT a.*, c.name AS child_name, u.name AS staff_name FROM attendance a JOIN children c ON c.id=a.child_id JOIN users u ON u.id=a.staff_id WHERE 1=1'; const args=[];
  if(req.session.user.role==='staff'){sql+=' AND a.staff_id=?';args.push(req.session.user.id);}
  if(q){sql+=' AND c.name LIKE ?';args.push(`%${q}%`);}
  sql+=' ORDER BY a.attendance_date DESC, a.id DESC';
  const attendance=db.prepare(sql).all(...args);
  const children=db.prepare("SELECT id,name FROM children WHERE status='Active' ORDER BY name").all();
  res.render('attendance',{title:'Attendance',attendance,children,q});
});
app.post('/attendance', requireRole('admin','staff'), (req,res) => {
  const childId=Number(req.body.child_id), date=safeText(req.body.attendance_date,10), status=safeText(req.body.status,20), notes=safeText(req.body.notes,300);
  if(!db.prepare('SELECT id FROM children WHERE id=?').get(childId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['Present','Absent','Late'].includes(status)){notice(req,'error','Please complete all attendance fields correctly.');return res.redirect('/attendance');}
  db.prepare('INSERT INTO attendance (child_id,staff_id,attendance_date,status,notes) VALUES (?,?,?,?,?)').run(childId,req.session.user.id,date,status,notes);
  notice(req,'success','Attendance record saved.');res.redirect('/attendance');
});
app.post('/attendance/:id/delete', requireRole('admin','staff'), (req,res) => {
  const row=db.prepare('SELECT * FROM attendance WHERE id=?').get(Number(req.params.id));
  if(!row){notice(req,'error','Attendance record not found.');return res.redirect('/attendance');}
  if(req.session.user.role==='staff' && row.staff_id!==req.session.user.id) return renderError(res,'You can only delete attendance records you created.',403);
  db.prepare('DELETE FROM attendance WHERE id=?').run(row.id);notice(req,'success','Attendance record deleted.');res.redirect('/attendance');
});

app.get('/reports', requireRole('admin'), (req,res) => {
  const totals={children:db.prepare('SELECT COUNT(*) n FROM children').get().n, activeChildren:db.prepare("SELECT COUNT(*) n FROM children WHERE status='Active'").get().n, parents:db.prepare("SELECT COUNT(*) n FROM users WHERE role='parent'").get().n, staff:db.prepare("SELECT COUNT(*) n FROM users WHERE role='staff'").get().n, pending:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='Pending'").get().n, approved:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='Approved'").get().n, rejected:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='Rejected'").get().n};
  const attendanceSummary=db.prepare("SELECT status, COUNT(*) AS count FROM attendance GROUP BY status ORDER BY status").all();
  const recentBookings=db.prepare('SELECT b.booking_date,b.kind,b.status,c.name child_name,u.name parent_name FROM bookings b JOIN children c ON c.id=b.child_id JOIN users u ON u.id=b.parent_id ORDER BY b.id DESC LIMIT 10').all();
  res.render('reports',{title:'Reports',totals,attendanceSummary,recentBookings});
});

app.use((req,res)=>renderError(res,'The page you requested could not be found.',404));
app.use((err,req,res,next)=>{ console.error(err); if(res.headersSent) return next(err); renderError(res,'An unexpected server error occurred. Check the terminal for details.',500); });
app.listen(PORT,()=>console.log(`Little Steps Daycare Management System running at http://localhost:${PORT}`));
