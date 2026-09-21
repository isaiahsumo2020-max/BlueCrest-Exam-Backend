import { db } from '../db/database.js'

export function list(entity) {
  const queries = { users: 'SELECT id, name, email, role, permissions_json, status, created_at FROM users ORDER BY name', programmes: 'SELECT * FROM programmes ORDER BY name', sessions: 'SELECT * FROM academic_sessions ORDER BY start_year DESC', semesters: 'SELECT * FROM semesters ORDER BY session_id, programme_id, number', subjects: 'SELECT * FROM subjects ORDER BY code', students: 'SELECT * FROM students ORDER BY name', marks: 'SELECT * FROM marks_entries ORDER BY updated_at DESC', results: 'SELECT * FROM semester_results ORDER BY id', 'grade-rules': 'SELECT * FROM grade_rules ORDER BY min_marks DESC', audit: 'SELECT * FROM audit_logs ORDER BY timestamp DESC' }
  return db.prepare(queries[entity]).all()
}

export function findUser(email, password) {
  return db.prepare("SELECT id, name, email, role, permissions_json, status, created_at FROM users WHERE email = ? AND password = ? AND status = 'active'").get(email, password)
}

export function saveUser(input) {
  const existing = db.prepare('SELECT password FROM users WHERE id = ?').get(input.id)
  db.prepare(`INSERT INTO users (id, name, email, password, role, permissions_json, status, created_at)
    VALUES (@id, @name, @email, @password, @role, @permissions, @status, @createdAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, password = excluded.password, role = excluded.role, permissions_json = excluded.permissions_json, status = excluded.status`).run({
    ...input,
    password: input.password || existing?.password || '',
    permissions: JSON.stringify(input.permissions ?? []),
  })
  return db.prepare('SELECT id, name, email, role, permissions_json, status, created_at FROM users WHERE id = ?').get(input.id)
}

export function saveResult(input) {
  db.prepare(`INSERT INTO semester_results (id, student_id, semester_id, session_id, gpa, cgpa, total_credits, earned_credits, overall_status, publication_status, approved_by, approved_at, published_at)
    VALUES (@id, @studentId, @semesterId, @sessionId, @gpa, @cgpa, @totalCredits, @earnedCredits, @overallStatus, @publicationStatus, @approvedBy, @approvedAt, @publishedAt)
    ON CONFLICT(student_id, semester_id) DO UPDATE SET session_id = excluded.session_id, gpa = excluded.gpa, cgpa = excluded.cgpa, total_credits = excluded.total_credits, earned_credits = excluded.earned_credits, overall_status = excluded.overall_status, publication_status = excluded.publication_status, approved_by = excluded.approved_by, approved_at = excluded.approved_at, published_at = excluded.published_at`).run(input)
  return db.prepare('SELECT * FROM semester_results WHERE student_id = ? AND semester_id = ?').get(input.studentId, input.semesterId)
}

export function updateResultStatus(input) {
  const existing = db.prepare('SELECT * FROM semester_results WHERE id = ?').get(input.resultId)
  if (!existing) throw new Error('Result not found')
  db.prepare(`UPDATE semester_results SET publication_status = @publicationStatus, approved_by = COALESCE(@approvedBy, approved_by), approved_at = COALESCE(@approvedAt, approved_at), published_at = COALESCE(@publishedAt, published_at) WHERE id = @resultId`).run(input)
  return db.prepare('SELECT * FROM semester_results WHERE id = ?').get(input.resultId)
}

export function saveMarks(input) {
  const subject = db.prepare('SELECT components_json, pass_mark FROM subjects WHERE id = ?').get(input.subjectId)
  if (!subject) throw new Error('Subject not found')
  const configuredComponents = JSON.parse(subject.components_json)
  const missing = configuredComponents.filter(component => input.components?.[component.name] === undefined || input.components?.[component.name] === null || input.components?.[component.name] === '')
  if (missing.length) throw new Error(`Missing marks for: ${missing.map(component => component.name).join(', ')}`)
  const total = configuredComponents.reduce((sum, component) => sum + Math.max(0, Math.min(component.maxMarks, Number(input.components[component.name]))), 0)
  const maxTotal = configuredComponents.reduce((sum, component) => sum + component.maxMarks, 0)
  const percentage = maxTotal ? Math.round(total / maxTotal * 100) : 0
  const rule = db.prepare('SELECT grade, grade_point, pass_status FROM grade_rules WHERE ? BETWEEN min_marks AND max_marks LIMIT 1').get(percentage)
  if (!rule) throw new Error('No grading rule found for the calculated percentage')
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO marks_entries (id, student_id, subject_id, semester_id, session_id, components_json, total_marks, percentage, grade, grade_point, status, entered_by, entered_at, updated_at)
    VALUES (@id, @studentId, @subjectId, @semesterId, @sessionId, @components, @total, @percentage, @grade, @gradePoint, @status, @enteredBy, @now, @now)
    ON CONFLICT(student_id, subject_id, semester_id) DO UPDATE SET components_json = excluded.components_json, total_marks = excluded.total_marks, percentage = excluded.percentage, grade = excluded.grade, grade_point = excluded.grade_point, status = excluded.status, updated_at = excluded.updated_at`).run({ id: input.id, studentId: input.studentId, subjectId: input.subjectId, semesterId: input.semesterId, sessionId: input.sessionId, components: JSON.stringify(input.components), total, percentage, grade: rule.grade, gradePoint: rule.grade_point, status: rule.pass_status, enteredBy: input.enteredBy, now })
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
  const accessCode = input.accessCode || existing?.access_code || `BC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  db.prepare(`INSERT INTO students (id, student_id, roll_number, name, email, access_code, phone, programme_id, current_semester, session_id, status, enrolled_at)
    VALUES (@id, @studentId, @rollNumber, @name, @email, @accessCode, @phone, @programmeId, @currentSemester, @sessionId, @status, @enrolledAt)
    ON CONFLICT(id) DO UPDATE SET student_id = excluded.student_id, roll_number = excluded.roll_number, name = excluded.name, email = excluded.email, access_code = excluded.access_code, phone = excluded.phone, programme_id = excluded.programme_id, current_semester = excluded.current_semester, session_id = excluded.session_id, status = excluded.status, enrolled_at = excluded.enrolled_at`).run({ ...input, accessCode })
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
