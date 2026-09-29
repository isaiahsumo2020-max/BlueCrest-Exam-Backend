import 'dotenv/config'
import 'dotenv/config.js'
import { db, closeDatabase } from './database.js'

console.log(`${db.name} initialized`)
await closeDatabase()
