import crypto from 'node:crypto'
import { db } from '../db/database.js'
import { hashPassword, verifyPassword } from '../auth.js'

export function list(entity) {
  const queries = { users: 'SELECT id, name, email, role, permissions_json, status, created_at FROM users ORDER BY name', programmes: 'SELECT * FROM programmes ORDER BY name', sessions: 'SELECT * FROM academic_sessions ORDER BY start_year DESC', semesters: 'SELECT * FROM semesters ORDER BY session_id, programme_id, number', subjects: 'SELECT * FROM subjects ORDER BY code', students: 'SELECT * FROM students ORDER BY name', marks: 'SELECT * FROM marks_entries ORDER BY updated_at DESC', results: 'SELECT * FROM semester_results ORDER BY id', 'grade-rules': 'SELECT * FROM grade_rules ORDER BY min_marks DESC', audit: 'SELECT * FROM audit_logs ORDER BY timestamp DESC' }
  return db.prepare(queries[entity]).all()
}

function publicUser(user) {
  if (!user) return null
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions_json: user.permissions_json, permissions: JSON.parse(user.permissions_json || '[]'), status: user.status, created_at: user.created_at }
}

export function findUser(email, password) {
  const user = db.prepare("SELECT id, name, email, password, role, permissions_json, status, created_at FROM users WHERE email = ? AND status = 'active'").get(email)
  if (!user || !verifyPassword(password, user.password)) return null
  if (!user.password.startsWith('$2')) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(password), user.id)
  return publicUser(user)
}

export function saveUser(input) {
  const existing = db.prepare('SELECT password FROM users WHERE id = ?').get(input.id)
  const password = input.password ? hashPassword(input.password) : existing?.password
  if (!password) throw new Error('A password is required when creating a user.')
  db.prepare(`INSERT INTO users (id, name, email, password, role, permissions_json, status, created_at)
    VALUES (@id, @name, @email, @password, @role, @permissions, @status, @createdAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, password = excluded.password, role = excluded.role, permissions_json = excluded.permissions_json, status = excluded.status`).run({
    ...input,
    password,
    permissions: JSON.stringify(input.permissions ?? []),
  })
  return publicUser(db.prepare('SELECT id, name, email, role, permissions_json, status, created_at FROM users WHERE id = ?').get(input.id))
}

export function recordAudit(user, action, entity, details) {
  try {
    db.prepare('INSERT INTO audit_logs (id, user_id, user_name, action, entity, details, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), user.id, user.name, action, entity, JSON.stringify(details), new Date().toISOString())
  } catch (error) {
    console.error('Audit log write failed:', error instanceof Error ? error.message : error)
  }
}

export function saveResult(input) {
  db.prepare(`INSERT INTO semester_results (id, student_id, semester_id, session_id, gpa, cgpa, total_credits, earned_credits, overall_status, publication_status, approved_by, approved_at, published_at)
    VALUES (@id, @studentId, @semesterId, @sessionId, @gpa, @cgpa, @totalCredits, @earnedCredits, @overallStatus, @publicationStatus, @approvedBy, @approvedAt, @publishedAt)
    ON CONFLICT(student_id, semester_id) DO UPDATE SET session_id = excluded.session_id, gpa = excluded.gpa, cgpa = excluded.cgpa, total_credits = excluded.total_credits, earned_credits = excluded.earned_credits, overall_status = excluded.overall_status, publication_status = excluded.publication_status, approved_by = excluded.approved_by, approved_at = excluded.approved_at, published_at = excluded.published_at`).run(input)
  return db.prepare('SELECT * FROM semester_results WHERE student_id = ? AND semester_id = ?').get(input.studentId, input.semesterId)
}

export function updateResultStatus(input, actorId) {
  const existing = db.prepare('SELECT * FROM semester_results WHERE id = ?').get(input.resultId)
  if (!existing) throw new Error('Result not found')
  db.prepare(`UPDATE semester_results SET publication_status = @publicationStatus, approved_by = CASE WHEN @publicationStatus = 'approved' THEN @actorId ELSE approved_by END, approved_at = CASE WHEN @publicationStatus = 'approved' THEN COALESCE(@approvedAt, @now) ELSE approved_at END, published_at = CASE WHEN @publicationStatus = 'published' THEN COALESCE(@publishedAt, @now) ELSE published_at END WHERE id = @resultId`).run({ ...input, actorId, now: new Date().toISOString() })
  return db.prepare('SELECT * FROM semester_results WHERE id = ?').get(input.resultId)
}

export function saveMarks(input, actorId) {
  const subject = db.prepare('SELECT components_json, pass_mark FROM subjects WHERE id = ?').get(input.subjectId)
  if (!subject) throw new Error('Subject not found')
  const configuredComponents = JSON.parse(subject.components_json)
  const missing = configuredComponents.filter(component => input.components?.[component.name] === undefined || input.components?.[component.name] === null || input.components?.[component.name] === '')
  if (missing.length) throw new Error(`Missing marks for: ${missing.map(component => component.name).join(', ')}`)
  const values = configuredComponents.map(component => Number(input.components[component.name]))
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Marks must be valid non-negative numbers.')
  if (values.some((value, index) => value > configuredComponents[index].maxMarks)) throw new Error('Marks cannot exceed configured component maximums.')
  const total = values.reduce((sum, value) => sum + value, 0)
  const maxTotal = configuredComponents.reduce((sum, component) => sum + component.maxMarks, 0)
  const percentage = maxTotal ? Math.round(total / maxTotal * 100) : 0
  const rule = db.prepare('SELECT grade, grade_point, pass_status FROM grade_rules WHERE ? BETWEEN min_marks AND max_marks LIMIT 1').get(percentage)
  if (!rule) throw new Error('No grading rule found for the calculated percentage')
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO marks_entries (id, student_id, subject_id, semester_id, session_id, components_json, total_marks, percentage, grade, grade_point, status, entered_by, entered_at, updated_at)
    VALUES (@id, @studentId, @subjectId, @semesterId, @sessionId, @components, @total, @percentage, @grade, @gradePoint, @status, @enteredBy, @now, @now)
    ON CONFLICT(student_id, subject_id, semester_id) DO UPDATE SET components_json = excluded.components_json, total_marks = excluded.total_marks, percentage = excluded.percentage, grade = excluded.grade, grade_point = excluded.grade_point, status = excluded.status, entered_by = excluded.entered_by, updated_at = excluded.updated_at`).run({ id: input.id, studentId: input.studentId, subjectId: input.subjectId, semesterId: input.semesterId, sessionId: input.sessionId, components: JSON.stringify(input.components), total, percentage, grade: rule.grade, gradePoint: rule.grade_point, status: rule.pass_status, enteredBy: actorId, now })
  return db.prepare('SELECT * FROM marks_entries WHERE student_id = ? AND subject_id = ? AND semester_id = ?').get(input.studentId, input.subjectId, input.semesterId)
}

export function saveProgramme(input) {
  db.prepare(`INSERT INTO programmes (id, name, department, duration, total_semesters, status)
    VALUES (@id, @name, @department, @duration, @totalSemesters, @status)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, department = excluded.department, duration = excluded.duration, total_semesters = excluded.total_semesters, status = excluded.status`).run(input)
  return db.prepare('SELECT * FROM programmes WHERE id = ?').get(input.id)
}

export function deleteProgramme(id) {
  db.prepare('DELETE FROM programmes WHERE id = ?').run(id)
}

export function saveStudent(input) {
  const existing = db.prepare('SELECT access_code FROM students WHERE id = ?').get(input.id)
  const programme = db.prepare('SELECT name FROM programmes WHERE id = ?').get(input.programmeId)
  const session = db.prepare('SELECT start_year FROM academic_sessions WHERE id = ?').get(input.sessionId)
  if (!programme || !session) throw new Error('A valid programme and academic session are required.')
  const programmeStudents = db.prepare('SELECT student_id, roll_number FROM students WHERE programme_id = ? AND session_id = ?').all(input.programmeId, input.sessionId)
  const existingCode = programmeStudents.map(student => String(student.student_id).match(/^BCU\/([^/]+)\//)?.[1]).find(Boolean)
  const normalizedProgrammeName = programme.name.toLowerCase()
  const programmeCode = existingCode || (normalizedProgrammeName.includes('business administration') ? 'BBA' : normalizedProgrammeName.includes('information technology') ? 'BSIT' : normalizedProgrammeName.includes('computer science') ? 'BSC' : programme.name.split(/\s+/).filter(Boolean).map(word => word.replace(/[^A-Za-z]/g, '')).filter(Boolean).slice(-2).map(word => word[0].toUpperCase()).join('') || 'ST')
  const yearCode = String(session.start_year).slice(-2)
  const registrationPattern = new RegExp(`^BCU/${programmeCode}/${yearCode}/(\\d+)$`)
  const nextSequence = Math.max(0, ...programmeStudents.map(student => Number(String(student.student_id).match(registrationPattern)?.[1] ?? 0)), ...programmeStudents.map(student => Number(String(student.roll_number).match(new RegExp(`^${programmeCode}-${yearCode}(\\d+)$`))?.[1] ?? 0))) + 1
  const generatedStudentId = `BCU/${programmeCode}/${yearCode}/${String(nextSequence).padStart(3, '0')}`
  const generatedRollNumber = `${programmeCode}-${yearCode}${String(nextSequence).padStart(2, '0')}`
  const accessCode = input.accessCode || existing?.access_code || `BC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  db.prepare(`INSERT INTO students (id, student_id, roll_number, name, email, access_code, phone, programme_id, current_semester, session_id, status, enrolled_at)
    VALUES (@id, @studentId, @rollNumber, @name, @email, @accessCode, @phone, @programmeId, @currentSemester, @sessionId, @status, @enrolledAt)
    ON CONFLICT(id) DO UPDATE SET student_id = excluded.student_id, roll_number = excluded.roll_number, name = excluded.name, email = excluded.email, access_code = excluded.access_code, phone = excluded.phone, programme_id = excluded.programme_id, current_semester = excluded.current_semester, session_id = excluded.session_id, status = excluded.status, enrolled_at = excluded.enrolled_at`).run({ ...input, studentId: input.studentId || generatedStudentId, rollNumber: input.rollNumber || generatedRollNumber, accessCode })
  return db.prepare('SELECT * FROM students WHERE id = ?').get(input.id)
}

export function deleteStudent(id) {
  db.prepare('DELETE FROM students WHERE id = ?').run(id)
}

export function saveSession(input) {
  db.prepare(`INSERT INTO academic_sessions (id, name, start_year, end_year, status)
    VALUES (@id, @name, @startYear, @endYear, @status)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, start_year = excluded.start_year, end_year = excluded.end_year, status = excluded.status`).run(input)
  return db.prepare('SELECT * FROM academic_sessions WHERE id = ?').get(input.id)
}

export function deleteSession(id) { db.prepare('DELETE FROM academic_sessions WHERE id = ?').run(id) }

export function saveSemester(input) {
  db.prepare(`INSERT INTO semesters (id, number, name, programme_id, session_id, status)
    VALUES (@id, @number, @name, @programmeId, @sessionId, @status)
    ON CONFLICT(id) DO UPDATE SET number = excluded.number, name = excluded.name, programme_id = excluded.programme_id, session_id = excluded.session_id, status = excluded.status`).run(input)
  return db.prepare('SELECT * FROM semesters WHERE id = ?').get(input.id)
}

export function deleteSemester(id) { db.prepare('DELETE FROM semesters WHERE id = ?').run(id) }

export function saveSubject(input) {
  db.prepare(`INSERT INTO subjects (id, code, title, credits, semester_number, programme_id, components_json, pass_mark)
    VALUES (@id, @code, @title, @credits, @semesterNumber, @programmeId, @components, @passMark)
    ON CONFLICT(id) DO UPDATE SET code = excluded.code, title = excluded.title, credits = excluded.credits, semester_number = excluded.semester_number, programme_id = excluded.programme_id, components_json = excluded.components_json, pass_mark = excluded.pass_mark`).run({ ...input, components: JSON.stringify(input.components) })
  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(input.id)
}

export function deleteSubject(id) { db.prepare('DELETE FROM subjects WHERE id = ?').run(id) }
