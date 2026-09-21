import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { schema } from './schema.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const defaultDatabaseFile = path.resolve(here, '../../data/examination.db')
const databaseFile = path.resolve(process.env.DATABASE_FILE ?? defaultDatabaseFile)
fs.mkdirSync(path.dirname(databaseFile), { recursive: true })

export const db = new DatabaseSync(databaseFile)
db.exec('PRAGMA journal_mode = DELETE')
db.exec(schema)
try { db.exec('ALTER TABLE students ADD COLUMN access_code TEXT') } catch {}
const studentsWithoutCodes = db.prepare('SELECT id FROM students WHERE access_code IS NULL OR access_code = \'\'').all()
const assignCode = db.prepare('UPDATE students SET access_code = ? WHERE id = ?')
studentsWithoutCodes.forEach(student => assignCode.run(`BC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, student.id))

export function closeDatabase() {
  db.close()
}
