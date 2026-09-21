export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  permissions_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS programmes (
id TEXT PRIMARY KEY, 
name TEXT NOT NULL, 
department TEXT NOT NULL, 
duration INTEGER NOT NULL, 
total_semesters INTEGER NOT NULL, 
status TEXT NOT NULL CHECK (status IN ('active', 'inactive'))
);
CREATE TABLE IF NOT EXISTS academic_sessions (
id TEXT PRIMARY KEY, name TEXT NOT NULL, start_year INTEGER NOT NULL, end_year INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'upcoming')));
CREATE TABLE IF NOT EXISTS semesters (id TEXT PRIMARY KEY, number INTEGER NOT NULL, name TEXT NOT NULL, programme_id TEXT NOT NULL REFERENCES programmes(id), session_id TEXT NOT NULL REFERENCES academic_sessions(id), status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'results_published')));
CREATE TABLE IF NOT EXISTS subjects (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, credits INTEGER NOT NULL, semester_number INTEGER NOT NULL, programme_id TEXT NOT NULL REFERENCES programmes(id), components_json TEXT NOT NULL, pass_mark INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, student_id TEXT NOT NULL UNIQUE, roll_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, access_code TEXT UNIQUE, phone TEXT NOT NULL DEFAULT '', programme_id TEXT NOT NULL REFERENCES programmes(id), current_semester INTEGER NOT NULL, session_id TEXT NOT NULL REFERENCES academic_sessions(id), status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'graduated')), enrolled_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS grade_rules (grade TEXT PRIMARY KEY, min_marks INTEGER NOT NULL, max_marks INTEGER NOT NULL, grade_point REAL NOT NULL, pass_status TEXT NOT NULL CHECK (pass_status IN ('pass', 'fail')));
CREATE TABLE IF NOT EXISTS marks_entries (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), subject_id TEXT NOT NULL REFERENCES subjects(id), semester_id TEXT NOT NULL REFERENCES semesters(id), session_id TEXT NOT NULL REFERENCES academic_sessions(id), components_json TEXT NOT NULL, total_marks REAL NOT NULL, percentage REAL NOT NULL, grade TEXT NOT NULL REFERENCES grade_rules(grade), grade_point REAL NOT NULL, status TEXT NOT NULL CHECK (status IN ('pass', 'fail')), entered_by TEXT NOT NULL REFERENCES users(id), entered_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(student_id, subject_id, semester_id));
CREATE TABLE IF NOT EXISTS semester_results (id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), semester_id TEXT NOT NULL REFERENCES semesters(id), session_id TEXT NOT NULL REFERENCES academic_sessions(id), gpa REAL NOT NULL, cgpa REAL NOT NULL, total_credits INTEGER NOT NULL, earned_credits INTEGER NOT NULL, overall_status TEXT NOT NULL CHECK (overall_status IN ('pass', 'fail')), publication_status TEXT NOT NULL CHECK (publication_status IN ('draft', 'approved', 'published')), approved_by TEXT REFERENCES users(id), approved_at TEXT, published_at TEXT, UNIQUE(student_id, semester_id));
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), user_name TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, details TEXT NOT NULL, timestamp TEXT NOT NULL);
`
