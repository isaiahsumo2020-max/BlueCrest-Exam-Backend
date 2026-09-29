import 'dotenv/config.js'
import crypto from 'node:crypto'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import multer from 'multer'
import { closeDatabase, db } from './db/database.js'
import { issueToken, requireAuth, requirePermission, requireRole } from './auth.js'
import { auditIdSchema, loginSchema, marksSchema, programmeSchema, profilePictureSchema, resultSchema, resultStatusSchema, schoolSettingsSchema, semesterSchema, sessionSchema, studentResultVerificationSchema, studentSchema, subjectSchema, userSchema, validate } from './validation.js'
import { deleteAuditLog, deleteProgramme, deleteSemester, deleteSession, deleteStudent, deleteSubject, findUser, isProtectedSuperAdmin, list, recordAudit, saveMarks, saveProgramme, saveResult, saveSchoolSettings, saveSemester, saveSession, saveStudent, saveSubject, saveUser, saveUserProfilePicture, updateResultStatus, verifyStudentResult } from './repositories/erpRepository.js'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const imageTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']])
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, imageTypes.has(file.mimetype)),
})
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured in production.')
const allowedOrigins = new Set((process.env.CORS_ORIGIN ?? 'http://localhost:8443,http://127.0.0.1:8443').split(',').map(origin => origin.trim()).filter(Boolean))
app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true)
  return callback(new Error(`CORS origin not allowed: ${origin}`))
} }))
app.use(helmet())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'examination-erp-backend', database: 'postgres' }))

app.post('/api/auth/login', validate(loginSchema), async (request, response) => {
  const { email, password } = request.body
  const user = await findUser(email, password)
  if (!user) return response.status(401).json({ message: 'Invalid email or password.' })
  return response.json({ user, token: issueToken(user) })
})

app.post('/api/student-results/verify', validate(studentResultVerificationSchema), async (request, response) => {
  try {
    const data = await verifyStudentResult(request.body.email, request.body.rollNumber, request.body.accessCode)
    return response.json({ data })
  } catch (error) {
    console.error('Student result verification failed:', error instanceof Error ? error.message : error)
    return response.status(500).json({ message: 'Unable to verify results right now. Please try again later.' })
  }
})

app.post('/api/media/upload', requireAuth, requireRole('admin'), imageUpload.single('file'), async (request, response) => {
  const file = request.file
  const kind = request.body?.kind
  if (!file || !imageTypes.has(file.mimetype)) return response.status(400).json({ message: 'Choose a PNG, JPEG, or WebP image.' })
  if (kind !== 'logo' && kind !== 'profile') return response.status(400).json({ message: 'Upload kind must be logo or profile.' })

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return response.status(503).json({ message: 'Image uploads are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend.' })

  try {
    const baseUrl = new URL(supabaseUrl)
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'erp-media'
    const storageHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    const bucketUrl = new URL(`/storage/v1/bucket/${encodeURIComponent(bucket)}`, baseUrl)
    const bucketCheck = await fetch(bucketUrl, { headers: storageHeaders })
    if (bucketCheck.status === 404) {
      const createBucket = await fetch(new URL('/storage/v1/bucket', baseUrl), {
        method: 'POST',
        headers: { ...storageHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: bucket, name: bucket, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: [...imageTypes.keys()] }),
      })
      if (!createBucket.ok && createBucket.status !== 409) throw new Error(`Unable to create image storage bucket (${createBucket.status}).`)
    } else if (!bucketCheck.ok) {
      throw new Error(`Unable to access image storage bucket (${bucketCheck.status}).`)
    }

    const objectPath = `${kind}/${crypto.randomUUID()}.${imageTypes.get(file.mimetype)}`
    const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/')
    const uploadResponse = await fetch(new URL(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, baseUrl), {
      method: 'POST',
      headers: { ...storageHeaders, 'Content-Type': file.mimetype, 'x-upsert': 'true' },
      body: file.buffer,
    })
    if (!uploadResponse.ok) throw new Error(`Supabase Storage rejected the image (${uploadResponse.status}).`)

    const publicUrl = new URL(`/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`, baseUrl)
    return response.status(201).json({ data: { url: publicUrl.toString(), path: objectPath } })
  } catch (error) {
    console.error('Image upload failed:', error instanceof Error ? error.message : error)
    return response.status(502).json({ message: error instanceof Error ? error.message : 'Unable to upload image to Supabase Storage.' })
  }
})

app.get('/api/:entity', requireAuth, async (request, response) => {
  const supported = ['users', 'programmes', 'sessions', 'semesters', 'subjects', 'students', 'marks', 'results', 'grade-rules', 'audit', 'school-settings']
  const entity = request.params.entity
  if (!supported.includes(entity)) return response.status(404).json({ message: 'Entity not found.' })
  const permissions = { users: 'view_students', programmes: 'all', sessions: 'all', semesters: 'all', subjects: 'all', students: 'view_students', marks: 'marks_entry', results: 'reports', 'grade-rules': 'reports', audit: 'reports', 'school-settings': 'all' }
  const requiredPermission = permissions[entity]
  if (request.user.role !== 'admin' && requiredPermission !== 'all' && !(request.user.permissions ?? []).includes(requiredPermission)) return response.status(403).json({ message: 'You do not have permission to view this data.' })
  return response.json({ data: await list(entity) })
})

app.post('/api/users', requireAuth, requireRole('admin'), validate(userSchema), async (request, response) => {
  try {
    if (isProtectedSuperAdmin(request.body.id) && request.user.sub !== request.body.id) return response.status(403).json({ message: 'The superadmin account cannot be edited by another administrator.' })
    const data = await saveUser(request.body)
    await recordAudit(request.user, 'USER_SAVE', 'User', { id: data.id })
    return response.status(200).json({ data })
  } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save user.' }) }
})

app.patch('/api/users/:id/profile-picture', requireAuth, requireRole('admin'), validate(profilePictureSchema), async (request, response) => {
  try {
    const parsed = auditIdSchema.safeParse(request.params)
    if (!parsed.success) return response.status(400).json({ message: 'Invalid user ID.' })
    const data = await saveUserProfilePicture(parsed.data.id, request.body.profilePicture)
    if (!data) return response.status(404).json({ message: 'Staff account not found.' })
    await recordAudit(request.user, 'STAFF_PROFILE_PICTURE_UPDATE', 'User', { id: data.id })
    return response.status(200).json({ data })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update staff profile picture.' })
  }
})

app.delete('/api/audit/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { const parsed = auditIdSchema.safeParse(request.params); if (!parsed.success) return response.status(400).json({ message: 'Invalid audit record ID.' }); await deleteAuditLog(parsed.data.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete audit record.' }) }
})

app.post('/api/results', requireAuth, requirePermission('reports'), validate(resultSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveResult(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save result.' }) }
})

app.post('/api/results/status', requireAuth, requireRole('admin'), validate(resultStatusSchema), async (request, response) => {
  try { const data = await updateResultStatus(request.body, request.user.sub); await recordAudit(request.user, `RESULT_${request.body.publicationStatus.toUpperCase()}`, 'SemesterResult', { id: request.body.resultId }); return response.status(200).json({ data }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to update result status.' }) }
})

app.post('/api/school-settings', requireAuth, requireRole('admin'), validate(schoolSettingsSchema), async (request, response) => {
  try {
    const data = await saveSchoolSettings(request.body)
    await recordAudit(request.user, 'SCHOOL_SETTINGS_UPDATE', 'SchoolSettings', { id: data.id, schoolName: data.school_name })
    return response.status(200).json({ data })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save school settings.' })
  }
})

app.post('/api/marks', requireAuth, requirePermission('marks_entry'), validate(marksSchema), async (request, response) => {
  try {
    const result = await saveMarks(request.body, request.user.sub)
    await recordAudit(request.user, 'MARKS_SAVE', 'MarksEntry', { studentId: request.body.studentId, subjectId: request.body.subjectId })
    return response.status(200).json({ data: result, message: 'Marks saved successfully.' })
  } catch (error) {
    return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save marks.' })
  }
})

app.post('/api/programmes', requireAuth, requireRole('admin'), validate(programmeSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveProgramme(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save programme.' }) }
})

app.delete('/api/programmes/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { await deleteProgramme(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete programme.' }) }
})

app.post('/api/students', requireAuth, requirePermission('view_students'), validate(studentSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveStudent(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save student.' }) }
})

app.delete('/api/students/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { await deleteStudent(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete student.' }) }
})

app.post('/api/sessions', requireAuth, requireRole('admin'), validate(sessionSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveSession(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save session.' }) }
})
app.delete('/api/sessions/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { await deleteSession(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete session.' }) }
})
app.post('/api/semesters', requireAuth, requireRole('admin'), validate(semesterSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveSemester(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save semester.' }) }
})
app.delete('/api/semesters/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { await deleteSemester(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete semester.' }) }
})
app.post('/api/subjects', requireAuth, requireRole('admin'), validate(subjectSchema), async (request, response) => {
  try { return response.status(200).json({ data: await saveSubject(request.body) }) } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to save subject.' }) }
})
app.delete('/api/subjects/:id', requireAuth, requireRole('admin'), async (request, response) => {
  try { await deleteSubject(request.params.id); return response.status(204).send() } catch (error) { return response.status(400).json({ message: error instanceof Error ? error.message : 'Unable to delete subject.' }) }
})

app.post('/api/results/process', requireAuth, requirePermission('reports'), async (request, response) => {
  const { semesterId, sessionId } = request.body
  if (!semesterId || !sessionId) return response.status(400).json({ message: 'semesterId and sessionId are required.' })
  const semester = await db.prepare('SELECT programme_id, number FROM semesters WHERE id = ? AND session_id = ?').get(semesterId, sessionId)
  if (!semester) return response.status(404).json({ message: 'Semester not found.' })
  const students = await db.prepare("SELECT * FROM students WHERE programme_id = ? AND status = 'active'").all(semester.programme_id)
  const subjects = await db.prepare('SELECT id, credits FROM subjects WHERE programme_id = ? AND semester_number = ?').all(semester.programme_id, semester.number)
  const existingMarks = await db.prepare('SELECT student_id, subject_id FROM marks_entries WHERE semester_id = ?').all(semesterId)
  const markedSubjects = new Set(existingMarks.map(mark => `${mark.student_id}:${mark.subject_id}`))
  const incomplete = students.map(student => ({ student, missing: subjects.filter(subject => !markedSubjects.has(`${student.id}:${subject.id}`)) })).filter(item => item.missing.length)
  if (incomplete.length) return response.status(422).json({ message: 'Results cannot be processed while marks are incomplete.', incomplete: incomplete.map(item => ({ studentId: item.student.id, studentName: item.student.name, missingCourses: item.missing.map(subject => subject.id) })) })
  return response.json({ data: { studentsProcessed: students.length, coursesProcessed: subjects.length, status: 'ready_for_approval' } })
})

app.use((_request, response) => response.status(404).json({ message: 'Route not found.' }))
app.use((error, _request, response, _next) => {
  console.error('Unhandled request error:', error instanceof Error ? error.message : error)
  const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : error instanceof multer.MulterError ? 400 : error.statusCode ?? 500
  const message = status === 413 ? 'Images must be 5 MB or smaller.' : error instanceof multer.MulterError ? 'Choose a supported image file.' : error.statusCode ? error.message : 'Internal server error.'
  return response.status(status).json({ message })
})

const server = app.listen(port, '0.0.0.0', () => console.log(`Backend listening on port ${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  console.log(`Received ${signal}; shutting down.`)
  server.close(async () => {
    await closeDatabase()
    process.exit(0)
  })
})
