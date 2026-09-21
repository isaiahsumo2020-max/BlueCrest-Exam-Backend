import 'dotenv/config.js'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { closeDatabase, db } from './db/database.js'
import { issueToken, requireAuth, requirePermission, requireRole } from './auth.js'
import { auditIdSchema, loginSchema, marksSchema, programmeSchema, resultSchema, resultStatusSchema, semesterSchema, sessionSchema, studentSchema, subjectSchema, userSchema, validate } from './validation.js'
import { deleteAuditLog, deleteProgramme, deleteSemester, deleteSession, deleteStudent, deleteSubject, findUser, isProtectedSuperAdmin, list, recordAudit, saveMarks, saveProgramme, saveResult, saveSemester, saveSession, saveStudent, saveSubject, saveUser, updateResultStatus } from './repositories/erpRepository.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.')
const allowedOrigins = new Set((process.env.CORS_ORIGIN ?? 'http://localhost:8443,http://127.0.0.1:8443').split(',').map(origin => origin.trim()).filter(Boolean))
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
  return callback(new Error(`CORS origin not allowed: ${origin}`))
} }))
app.use(helmet())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'examination-erp-backend', database: 'sqlite' }))

app.post('/api/auth/login', validate(loginSchema), (request, response) => {
  const { email, password } = request.body
  const user = findUser(email, password)
  if (!user) return response.status(401).json({ message: 'Invalid email or password.' })
  return response.json({ user, token: issueToken(user) })
})

app.get('/api/:entity', requireAuth, (request, response) => {
  const supported = ['users', 'programmes', 'sessions', 'semesters', 'subjects', 'students', 'marks', 'results', 'grade-rules', 'audit']
  const entity = request.params.entity
  if (!supported.includes(entity)) return response.status(404).json({ message: 'Entity not found.' })
  const permissions = { users: 'view_students', programmes: 'all', sessions: 'all', semesters: 'all', subjects: 'all', students: 'view_students', marks: 'marks_entry', results: 'reports', 'grade-rules': 'reports', audit: 'reports' }
  const requiredPermission = permissions[entity]
  if (request.user.role !== 'admin' && requiredPermission !== 'all' && !(request.user.permissions ?? []).includes(requiredPermission)) return response.status(403).json({ message: 'You do not have permission to view this data.' })
  return response.json({ data: list(entity) })
})

app.post('/api/users', requireAuth, requireRole('admin'), validate(userSchema), (request, response) => {
  try {
    if (isProtectedSuperAdmin(request.body.id) && request.user.sub !== request.body.id) return response.status(403).json({ message: 'The superadmin account cannot be edited by another administrator.' })
    const data = saveUser(request.body)
    recordAudit(request.user, 'USER_SAVE', 'User', { id: data.id })
    return response.status(200).json({ data })
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save user.' }) }
})

app.delete('/api/audit/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { const parsed = auditIdSchema.safeParse(request.params); if (!parsed.success) return response.status(400).json({ message: 'Invalid audit record ID.' }); deleteAuditLog(parsed.data.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete audit record.' }) }
})

app.post('/api/results', requireAuth, requirePermission('reports'), validate(resultSchema), (request, response) => {
  try { return response.status(200).json({ data: saveResult(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save result.' }) }
})

app.post('/api/results/status', requireAuth, requireRole('admin'), validate(resultStatusSchema), (request, response) => {
  try { const data = updateResultStatus(request.body, request.user.sub); recordAudit(request.user, `RESULT_${request.body.publicationStatus.toUpperCase()}`, 'SemesterResult', { id: request.body.resultId }); return response.status(200).json({ data }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update result status.' }) }
})

app.post('/api/marks', requireAuth, requirePermission('marks_entry'), validate(marksSchema), (request, response) => {
  try {
    const result = saveMarks(request.body, request.user.sub)
    recordAudit(request.user, 'MARKS_SAVE', 'MarksEntry', { studentId: request.body.studentId, subjectId: request.body.subjectId })
    return response.status(200).json({ data: result, message: 'Marks saved successfully.' })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save marks.' })
  }
})

app.post('/api/programmes', requireAuth, requireRole('admin'), validate(programmeSchema), (request, response) => {
  try { return response.status(200).json({ data: saveProgramme(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save programme.' }) }
})

app.delete('/api/programmes/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { deleteProgramme(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete programme.' }) }
})

app.post('/api/students', requireAuth, requirePermission('view_students'), validate(studentSchema), (request, response) => {
  try { return response.status(200).json({ data: saveStudent(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save student.' }) }
})

app.delete('/api/students/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { deleteStudent(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete student.' }) }
})

app.post('/api/sessions', requireAuth, requireRole('admin'), validate(sessionSchema), (request, response) => {
  try { return response.status(200).json({ data: saveSession(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save session.' }) }
})
app.delete('/api/sessions/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { deleteSession(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete session.' }) }
})
app.post('/api/semesters', requireAuth, requireRole('admin'), validate(semesterSchema), (request, response) => {
  try { return response.status(200).json({ data: saveSemester(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save semester.' }) }
})
app.delete('/api/semesters/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { deleteSemester(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete semester.' }) }
})
app.post('/api/subjects', requireAuth, requireRole('admin'), validate(subjectSchema), (request, response) => {
  try { return response.status(200).json({ data: saveSubject(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save subject.' }) }
})
app.delete('/api/subjects/:id', requireAuth, requireRole('admin'), (request, response) => {
  try { deleteSubject(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete subject.' }) }
})

app.post('/api/results/process', requireAuth, requirePermission('reports'), (request, response) => {
  const { semesterId, sessionId } = request.body
  if (!semesterId || !sessionId) return response.status(400).json({ message: 'semesterId and sessionId are required.' })
  const semester = db.prepare('SELECT programme_id, number FROM semesters WHERE id = ? AND session_id = ?').get(semesterId, sessionId)
  if (!semester) return response.status(404).json({ message: 'Semester not found.' })
  const students = db.prepare("SELECT * FROM students WHERE programme_id = ? AND status = 'active'").all(semester.programme_id)
  const subjects = db.prepare('SELECT id, credits FROM subjects WHERE programme_id = ? AND semester_number = ?').all(semester.programme_id, semester.number)
  const incomplete = students.map(student => ({ student, missing: subjects.filter(subject => !db.prepare('SELECT 1 FROM marks_entries WHERE student_id = ? AND subject_id = ? AND semester_id = ?').get(student.id, subject.id, semesterId)) })).filter(item => item.missing.length)
  if (incomplete.length) return response.status(422).json({ message: 'Results cannot be processed while marks are incomplete.', incomplete: incomplete.map(item => ({ studentId: item.student.id, studentName: item.student.name, missingCourses: item.missing.map(subject => subject.id) })) })
  return response.json({ data: { studentsProcessed: students.length, coursesProcessed: subjects.length, status: 'ready_for_approval' } })
})

app.use((_request, response) => response.status(404).json({ message: 'Route not found.' }))
app.use((error, _request, response, _next) => {
  console.error('Unhandled request error:', error instanceof Error ? error.message : error)
  return response.status(error.statusCode ?? 500).json({ message: error.statusCode ? error.message : 'Internal server error.' })
})

const server = app.listen(port, '0.0.0.0', () => console.log(`Backend listening on port ${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  console.log(`Received ${signal}; shutting down.`)
  server.close(() => {
    closeDatabase()
    process.exit(0)
  })
})
