import fs from 'fs';
import path from 'path';
import { db, initDatabase } from '../db/database';
import { config } from '../config/env';

export function resetAllData(): void {
  console.log('====================================================');
  console.log(' PURGING ALL TEST AND DEMO DATA FROM MEDIBRIEF');
  console.log('====================================================');

  initDatabase();

  // Disable foreign keys temporarily for clean truncation
  db.pragma('foreign_keys = OFF');

  const tables = [
    'document_embeddings',
    'chat_messages',
    'chat_sessions',
    'audit_logs',
    'sharing_session_records',
    'sharing_sessions',
    'extracted_findings',
    'medications',
    'diagnoses',
    'medical_records',
    'patient_profiles',
    'otp_verifications',
    'users'
  ];

  for (const table of tables) {
    try {
      db.prepare(`DELETE FROM ${table}`).run();
      console.log(`  ✓ Cleared table: ${table}`);
    } catch (e: any) {
      console.warn(`  ! Note clearing ${table}: ${e.message}`);
    }
  }

  // Vacuum SQLite to reclaim space and reset auto-increments
  try {
    db.prepare('VACUUM').run();
    console.log('  ✓ SQLite database vacuumed successfully.');
  } catch (e) {
    // Ignore vacuum if transaction active
  }

  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');

  // Purge uploaded physical files in storage
  if (fs.existsSync(config.storageUploadDir)) {
    const files = fs.readdirSync(config.storageUploadDir);
    let deletedFiles = 0;
    for (const file of files) {
      const fullPath = path.join(config.storageUploadDir, file);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
        deletedFiles++;
      }
    }
    console.log(`  ✓ Purged ${deletedFiles} physical files from ${config.storageUploadDir}`);
  }

  console.log('\n====================================================');
  console.log(' 🎉 DATABASE & STORAGE ARE 100% CLEAN AND EMPTY! 🎉');
  console.log(' You now have a fresh slate for real medical records.');
  console.log('====================================================\n');
}

// If executed directly
if (require.main === module) {
  resetAllData();
  process.exit(0);
}
