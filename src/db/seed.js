import 'dotenv/config'
import 'dotenv/config.js'
import { db, closeDatabase } from './database.js'

const gradeRules = [['A', 80, 100, 4, 'pass'], ['B+', 75, 79, 3.5, 'pass'], ['B', 70, 74, 3, 'pass'], ['C+', 65, 69, 2.5, 'pass'], ['C', 60, 64, 2, 'pass'], ['D+', 55, 59, 1.5, 'pass'], ['D', 50, 54, 1, 'pass'], ['F', 0, 49, 0, 'fail']]
const users = [['u1', 'Dr. Joseph T. Nyuma', 'admin@bluecrest.edu.lr', 'Admin@2024', 'admin', JSON.stringify(['all']), 'active', '2024-08-01T08:00:00Z'], ['u2', 'Mr. Emmanuel K. Kollie', 'ekollie@bluecrest.edu.lr', 'Staff@2024', 'staff', JSON.stringify(['marks_entry', 'view_students', 'reports']), 'active', '2024-08-10T09:00:00Z'], ['u3', 'Ms. Abigail M. Saye', 'amsaye@bluecrest.edu.lr', 'Staff@2024', 'staff', JSON.stringify(['marks_entry', 'view_students', 'reports']), 'active', '2024-08-10T09:30:00Z']]
const programmes = [['p1', 'Bachelor of Science in Computer Science', 'School of Science & Technology', 4, 8, 'active'], ['p2', 'Bachelor of Business Administration', 'School of Business & Management', 4, 8, 'active'], ['p3', 'Bachelor of Science in Information Technology', 'School of Science & Technology', 4, 8, 'active']]
const sessions = [['s1', '2023–2024', 2023, 2024, 'completed'], ['s2', '2024–2025', 2024, 2025, 'active']]
const semesters = [['sem1', 1, 'Semester 1', 'p1', 's2', 'results_published'], ['sem2', 2, 'Semester 2', 'p1', 's2', 'closed'], ['sem3', 1, 'Semester 1', 'p2', 's2', 'open'], ['sem4', 3, 'Semester 3', 'p1', 's2', 'open']]
const components = JSON.stringify([{ name: 'Internal', maxMarks: 30 }, { name: 'External', maxMarks: 70 }])
const subjects = [['sub1', 'CS101', 'Introduction to Computer Science', 3, 1, 'p1', components, 50], ['sub2', 'CS102', 'Mathematics for Computing', 3, 1, 'p1', components, 50], ['sub3', 'CS103', 'Programming Fundamentals', 3, 1, 'p1', components, 50]]
const students = [['st1', 'BCU/CS/24/001', 'CS-2401', 'Marcus Tamba Kollie', 'mtkollie@student.bluecrest.edu.lr', '+231 770 000 001', 'p1', 1, 's2', 'active', '2024-09-01'], ['st2', 'BCU/CS/24/002', 'CS-2402', 'Grace Pewee Flomo', 'gflomo@student.bluecrest.edu.lr', '+231 770 000 002', 'p1', 1, 's2', 'active', '2024-09-01'], ['st3', 'BCU/CS/24/003', 'CS-2403', 'Fatumata Kamara', 'fkamara@student.bluecrest.edu.lr', '+231 770 000 003', 'p1', 1, 's2', 'active', '2024-09-01']]

function seed() {
  db.exec('BEGIN')
  try {
  const insert = (sql, rows) => { const statement = db.prepare(sql); rows.forEach(row => statement.run(...row)) }
  insert('INSERT OR IGNORE INTO grade_rules (grade, min_marks, max_marks, grade_point, pass_status) VALUES (?, ?, ?, ?, ?)', gradeRules)
  insert('INSERT OR IGNORE INTO users (id, name, email, password, role, permissions_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', users)
  insert('INSERT OR IGNORE INTO programmes (id, name, department, duration, total_semesters, status) VALUES (?, ?, ?, ?, ?, ?)', programmes)
  insert('INSERT OR IGNORE INTO academic_sessions (id, name, start_year, end_year, status) VALUES (?, ?, ?, ?, ?)', sessions)
  insert('INSERT OR IGNORE INTO semesters (id, number, name, programme_id, session_id, status) VALUES (?, ?, ?, ?, ?, ?)', semesters)
  insert('INSERT OR IGNORE INTO subjects (id, code, title, credits, semester_number, programme_id, components_json, pass_mark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', subjects)
  insert('INSERT OR IGNORE INTO students (id, student_id, roll_number, name, email, phone, programme_id, current_semester, session_id, status, enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', students)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
seed()
console.log('Seed data inserted.')
closeDatabase()
