import 'dotenv/config'
import 'dotenv/config.js'
import { db, closeDatabase } from './database.js'

console.log(`SQLite database initialized with ${db.name}`)
closeDatabase()
