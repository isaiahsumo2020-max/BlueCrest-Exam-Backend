import 'dotenv/config.js'
import cors from 'cors'
import express from 'express'
import { db } from './db/database.js'
import { deleteProgramme, deleteSemester, deleteSession, deleteStudent, deleteSubject, findUser, list, saveMarks, saveProgramme, saveResult, saveSemester, saveSession, saveStudent, saveSubject, saveUser, updateResultStatus } from './repositories/erpRepository.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const allowedOrigins = new Set((process.env.CORS_ORIGIN ?? 'http://localhost:8443,http://127.0.0.1:8443').split(',').map(origin => origin.trim()).filter(Boolean))
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
  return callback(new Error(`CORS origin not allowed: ${origin}`))
} }))
app.use(express.json())

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'examination-erp-backend', database: 'sqlite' }))

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body
  if (!email || !password) return response.status(400).json({ message: 'Email and password are required.' })
  const user = findUser(email, password)
  if (!user) return response.status(401).json({ message: 'Invalid email or password.' })
  return response.json({ user: { ...user, permissions: JSON.parse(String(user.permissions_json)) } })
})

app.get('/api/:entity', (request, response) => {
  const supported = ['users', 'programmes', 'sessions', 'semesters', 'subjects', 'students', 'marks', 'results', 'grade-rules', 'audit']
  const entity = request.params.entity
  if (!supported.includes(entity)) return response.status(404).json({ message: 'Entity not found.' })
  return response.json({ data: list(entity) })
})

app.post('/api/users', (request, response) => {
  try { return response.status(200).json({ data: saveUser(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save user.' }) }
})

app.post('/api/results', (request, response) => {
  try { return response.status(200).json({ data: saveResult(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save result.' }) }
})

app.post('/api/results/status', (request, response) => {
  try { return response.status(200).json({ data: updateResultStatus(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update result status.' }) }
})

app.post('/api/marks', (request, response) => {
  try {
    const result = saveMarks(request.body)
    return response.status(200).json({ data: result, message: 'Marks saved successfully.' })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save marks.' })
  }
})

app.post('/api/programmes', (request, response) => {
  try { return response.status(200).json({ data: saveProgramme(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save programme.' }) }
})

app.delete('/api/programmes/:id', (request, response) => {
  try { deleteProgramme(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete programme.' }) }
})

app.post('/api/students', (request, response) => {
  try { return response.status(200).json({ data: saveStudent(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save student.' }) }
})

app.delete('/api/students/:id', (request, response) => {
  try { deleteStudent(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete student.' }) }
})

app.post('/api/sessions', (request, response) => {
  try { return response.status(200).json({ data: saveSession(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save session.' }) }
})
app.delete('/api/sessions/:id', (request, response) => {
  try { deleteSession(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete session.' }) }
})
app.post('/api/semesters', (request, response) => {
  try { return response.status(200).json({ data: saveSemester(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save semester.' }) }
})
app.delete('/api/semesters/:id', (request, response) => {
  try { deleteSemester(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete semester.' }) }
})
app.post('/api/subjects', (request, response) => {
  try { return response.status(200).json({ data: saveSubject(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save subject.' }) }
})
app.delete('/api/subjects/:id', (request, response) => {
  try { deleteSubject(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete subject.' }) }
})

app.post('/api/results/process', (request, response) => {
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
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`))
