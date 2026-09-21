import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { schema } from './schema.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultDatabaseFile = path.resolve(here, '../../data/examination.db')
const databaseFile = path.resolve(process.env.DATABASE_FILE || defaultDatabaseFile)
fs.mkdirSync(path.dirname(databaseFile), { recursive: true })

export const db = new DatabaseSync(databaseFile)
db.exec('PRAGMA foreign_keys = ON')
db.exec('PRAGMA journal_mode = DELETE')
db.exec(schema)
try { db.exec('ALTER TABLE students ADD COLUMN access_code TEXT') } catch (error) {
  if (!String(error).includes('duplicate column name')) throw error
}
const studentsWithoutCodes = db.prepare('SELECT id FROM students WHERE access_code IS NULL OR access_code = \'\'').all()
const assignCode = db.prepare('UPDATE students SET access_code = ? WHERE id = ?')
studentsWithoutCodes.forEach(student => assignCode.run(`BC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, student.id))

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_marks_student ON marks_entries(student_id);
  CREATE INDEX IF NOT EXISTS idx_marks_subject ON marks_entries(subject_id);
  CREATE INDEX IF NOT EXISTS idx_marks_semester ON marks_entries(semester_id);
  CREATE INDEX IF NOT EXISTS idx_results_student ON semester_results(student_id);
  CREATE INDEX IF NOT EXISTS idx_results_semester ON semester_results(semester_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
`)

export function closeDatabase() {
  db.close()
}
