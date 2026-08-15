// init-db.mjs — run ONCE
import { initTicketingDB, initTicketTables } from './db.ticketing.cjs';

async function run() {
  console.log('🔧 Running DB initialization...');
  await initTicketingDB();
  await initTicketTables();
  console.log('✅ DB initialization completed.');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Initialization failed:', err);
  process.exit(1);
});