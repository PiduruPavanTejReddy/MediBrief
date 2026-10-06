import app from './app';
import { config } from './config/env';
import { initDatabase, db } from './db/database';
import { seedDemoData } from './seeds/seedDemoData';

async function startServer() {
  try {
    // 1. Initialize Database
    initDatabase();

    // 2. Check if demo patient exists; if not, seed only if AUTO_SEED_DEMO is not 'false'
    const recordCount = db.prepare('SELECT COUNT(*) as count FROM medical_records').get() as { count: number };
    const autoSeed = process.env.AUTO_SEED_DEMO !== 'false';
    if (recordCount.count === 0 && autoSeed) {
      console.log('[Server] No records found and AUTO_SEED_DEMO is enabled. Running initial demo seed...');
      seedDemoData();
    } else if (recordCount.count === 0) {
      console.log('[Server] Database is clean and empty (AUTO_SEED_DEMO=false). Ready for real medical documents.');
    } else {
      console.log(`[Server] Database contains ${recordCount.count} medical records.`);
    }

    // 3. Start Listening on 0.0.0.0 so mobile devices on the network can connect
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(` MediBrief Backend Server is running!`);
      console.log(` Port:     ${config.port} (listening on all interfaces 0.0.0.0)`);
      console.log(` Health:   http://localhost:${config.port}/api/health`);
      console.log(` Mode:     ${config.nodeEnv}`);
      console.log(` AutoSeed: ${autoSeed ? 'Enabled' : 'Disabled (Clean Production Slate)'}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('Failed to start MediBrief server:', error);
    process.exit(1);
  }
}

startServer();
