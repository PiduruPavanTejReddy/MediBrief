import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env';

const dbPath = path.resolve(__dirname, '../../medibrief.db');
const schemaPath = path.resolve(__dirname, './schema.sql');

// Initialize SQLite database
export const db = new Database(dbPath, {
  // verbose: config.nodeEnv === 'development' ? console.log : undefined
});

// Enable WAL mode and foreign keys for high reliability and concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  try {
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schemaSql);

    // Migration check: ensure firebase_uid column exists on users table
    const tableInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const hasFirebaseUid = tableInfo.some(col => col.name === 'firebase_uid');
    if (!hasFirebaseUid) {
      db.exec("ALTER TABLE users ADD COLUMN firebase_uid TEXT;");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;");
      console.log('[Database] Migrated users table: added firebase_uid column.');
    }

    console.log('[Database] Database initialized and schema verified.');
  } catch (error) {
    console.error('[Database] Error initializing database schema:', error);
    throw error;
  }
}
