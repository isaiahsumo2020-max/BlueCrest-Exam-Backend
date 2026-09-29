import 'dotenv/config'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { closeDatabase, withTransaction } from './database.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const sqliteFile = path.resolve(process.env.SQLITE_FILE || path.resolve(here, '../../data/examination.db'))
const tables = ['users', 'programmes', 'academic_sessions', 'semesters', 'subjects', 'students', 'grade_rules', 'marks_entries', 'semester_results', 'audit_logs']

if (!fs.existsSync(sqliteFile)) {
  await closeDatabase()
  throw new Error(`SQLite source database not found: ${sqliteFile}`)
}

const source = new DatabaseSync(sqliteFile, { readOnly: true })

try {
  await withTransaction(async database => {
    for (const table of tables) {
      const sourceColumns = new Set(source.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name))
      if (table === 'students') sourceColumns.add('access_code')
      if (!sourceColumns.size) continue

      const rows = source.prepare(`SELECT * FROM ${table}`).all()
      const targetColumns = new Set((await database.prepare('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?').all(table)).map(column => column.column_name))
      const availableColumns = [...sourceColumns].filter(column => targetColumns.has(column))
      if (!availableColumns.length) continue

      for (const row of rows) {
        const values = availableColumns.map(column => {
          if (table === 'students' && column === 'access_code' && !row[column]) {
            return `BC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
          }
          return row[column]
        })
        const columns = availableColumns.map(column => `"${column}"`).join(', ')
        const placeholders = values.map(() => '?').join(', ')
        await database.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`).run(...values)
      }
      console.log(`Imported ${rows.length} ${table} records.`)
    }
  })
  console.log(`SQLite data migrated from ${sqliteFile}.`)
} finally {
  source.close()
  await closeDatabase()
}