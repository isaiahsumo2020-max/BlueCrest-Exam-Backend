import crypto from 'node:crypto'
import pg from 'pg'
import { schema } from './schema.js'

const { Pool } = pg
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be configured with the Supabase PostgreSQL connection string.')
}

let databaseUrl
try {
  databaseUrl = new URL(process.env.DATABASE_URL)
} catch {
  throw new Error('DATABASE_URL is not a valid URL. Copy the Supabase pooler URI and URL-encode reserved characters in its password.')
}
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// protocol.')
}

const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL === 'verify-full' },
})

function prepareQuery(sql, parameters) {
  if (parameters.length === 1 && parameters[0] && !Array.isArray(parameters[0]) && typeof parameters[0] === 'object') {
    const values = []
    const indexes = new Map()
    const text = sql.replace(/@([a-zA-Z][a-zA-Z0-9_]*)/g, (_match, name) => {
      if (!indexes.has(name)) {
        indexes.set(name, values.length + 1)
        values.push(parameters[0][name])
      }
      return `$${indexes.get(name)}`
    })
    return { text, values }
  }

  let index = 0
  return {
    text: sql.replace(/\?/g, () => `$${++index}`),
    values: parameters,
  }
}

function createDatabase(query) {
  return {
    name: 'Supabase PostgreSQL',
    prepare(sql) {
      return {
        async all(...parameters) {
          return (await query(prepareQuery(sql, parameters))).rows
        },
        async get(...parameters) {
          return (await query(prepareQuery(sql, parameters))).rows[0]
        },
        async run(...parameters) {
          const result = await query(prepareQuery(sql, parameters))
          return { changes: result.rowCount }
        },
      }
    },
    exec(sql) {
      return query(sql)
    },
  }
}

export const db = createDatabase(query => pool.query(query))

export async function withTransaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const transactionDb = createDatabase(query => client.query(query))
    const result = await callback(transactionDb)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

await db.exec(schema)
await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT NOT NULL DEFAULT ''")
await db.exec(`
  INSERT INTO school_settings (id, school_name, school_name_slug, school_logo, school_logo_slug, profile_picture, profile_picture_slug, updated_at)
  VALUES ('default', 'BlueCrest University', 'bluecrest-university', '/images/BlueCrest University.png', 'bluecrest-university', '/images/BlueCrest University.png', 'bluecrest-university', CURRENT_TIMESTAMP)
  ON CONFLICT (id) DO NOTHING
`)
await db.exec('ALTER TABLE students ADD COLUMN IF NOT EXISTS access_code TEXT UNIQUE')
await db.exec(`
  CREATE INDEX IF NOT EXISTS idx_marks_student ON marks_entries(student_id);
  CREATE INDEX IF NOT EXISTS idx_marks_subject ON marks_entries(subject_id);
  CREATE INDEX IF NOT EXISTS idx_marks_semester ON marks_entries(semester_id);
  CREATE INDEX IF NOT EXISTS idx_results_student ON semester_results(student_id);
  CREATE INDEX IF NOT EXISTS idx_results_semester ON semester_results(semester_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
`)

const studentsWithoutCodes = await db.prepare("SELECT id FROM students WHERE access_code IS NULL OR access_code = ''").all()
for (const student of studentsWithoutCodes) {
  await db.prepare('UPDATE students SET access_code = ? WHERE id = ?').run(`BC-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, student.id)
}

export function closeDatabase() {
  return pool.end()
}
