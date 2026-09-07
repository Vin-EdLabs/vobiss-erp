/**
 * One command to bring the database fully up to date with what the code expects — every table,
 * every column, everywhere: chat, field work (GPS check-ins), sites, HR, tickets, service
 * requests, archive/file storage, Vobi (feed, memory, vault, assistant), performance reports,
 * production, incident notes, network assets, NOC shifts, todos, and the core schema.
 *
 * Normally each of these gets created lazily — either once at server startup (a handful) or the
 * first time someone hits the relevant feature (most of them). This runs every single one of
 * those idempotent CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS routines directly, in
 * one pass, so nothing is left waiting on "whoever clicks that page first." Safe to run any
 * number of times — every step here is a no-op if its tables/columns already exist.
 *
 * Usage (from the backend/ directory):
 *   node scripts/ensure-all-schema.js
 * or, from anywhere in the repo:
 *   npm --prefix backend run db:ensure-schema
 */
import pool from '../db.js';
import { initDB } from '../db.js';
import { initHrSchema } from '../db/hr.js';
import { initFieldSchema } from '../db/field.js';
import { initChat } from '../services/chatInit.js';
import { initProductionTables, ensureProductionWorkflowConstraints } from '../db/production.js';
import { initProjectRequestTables, ensureProjectRequestWorkflowConstraints } from '../db/project.js';
import { initPerformanceReportTables } from '../db/performanceReports.js';
import { initCompaniesTable } from '../db/tenant.js';
import { ensureFieldWorkTables } from '../services/fieldWork.js';
import { ensureActivityLogsTable } from '../services/activityLog.js';
import { ensureArchiveTables } from '../services/archive.js';
import { ensureIpUnitTables } from '../services/ipUnit.js';
import { ensureVobiFeedTable } from '../services/vobiLiveFeed.js';
import { ensureVobiMemorySchema } from '../services/vobiMemory.js';
import { ensureVobiVaultSchema } from '../services/vobiVault.js';
import { ensureVobiSchema } from '../services/vobiService.js';
import { ensureTimeEngineTables } from '../services/workflowTimeEngine.js';
import { ensurePinTableReady, ensureMessageDeletionTableReady } from '../routes/chat.js';
import { ensureTodosTable } from '../routes/todos.js';
import { init as initIncidentNotes } from '../routes/incidentNotes.js';
import { init as initNetworkAssets } from '../routes/networkAssets.js';
import { init as initNocShifts } from '../routes/nocShifts.js';

// Order matters only where a later step's foreign keys point at an earlier step's tables:
// core (users, tickets, customers, sites) must exist before anything referencing them, and chat
// must exist before the three chat-dependent steps (Vobi's own channel columns, message pins,
// message deletions) that alter/reference chat's own tables.
const STEPS = [
  ['Core schema (users, requests, tickets, customers, sites)', () => initDB()],
  // .cjs module — dynamic import so Node's CJS/ESM interop resolves module.exports correctly
  // (the same pattern db.ticketing.cjs itself uses to reach this function). Already runs
  // transitively inside initDB() above; called again here explicitly so it's never silently
  // skipped if that internal call path ever changes — a no-op either way.
  ['Client sites (GPS coordinates)', async () => {
    const { ensureClientSitesSchema } = await import('../db.clients.cjs');
    await ensureClientSitesSchema();
  }],
  ['HR schema', () => initHrSchema(pool)],
  ['Field Activities (GPS log)', () => initFieldSchema(pool)],
  ['Chat — channels, DMs, messages, #general/#announcements, memberships', () => initChat()],
  ['Chat — message pins', () => ensurePinTableReady()],
  ['Chat — message deletions ("delete for me" / clear chat)', () => ensureMessageDeletionTableReady()],
  ['Vobi assistant schema (depends on chat)', () => ensureVobiSchema()],
  ['Vobi Live Ops feed', () => ensureVobiFeedTable()],
  ['Vobi memory', () => ensureVobiMemorySchema()],
  ['Vobi vault', () => ensureVobiVaultSchema()],
  ['Field Work (GPS check-in / arrival / complete)', () => ensureFieldWorkTables()],
  ['Production requests', () => initProductionTables()],
  ['Production workflow constraints', () => ensureProductionWorkflowConstraints()],
  ['Service requests / project units / WIP', () => initProjectRequestTables()],
  ['Service request workflow constraints', () => ensureProjectRequestWorkflowConstraints()],
  ['Performance reports', () => initPerformanceReportTables()],
  ['Companies (multi-tenant)', () => initCompaniesTable()],
  ['IP Unit', () => ensureIpUnitTables()],
  ['File Storage (Archive)', () => ensureArchiveTables()],
  ['Activity log', () => ensureActivityLogsTable()],
  ['Workflow time engine (SLA tracking)', () => ensureTimeEngineTables()],
  ['To-dos', () => ensureTodosTable()],
  ['Incident notes', () => initIncidentNotes()],
  ['Network assets', () => initNetworkAssets()],
  ['NOC shift schedule', () => initNocShifts()],
];

async function main() {
  console.log(`Ensuring all database schema is up to date — ${STEPS.length} steps...\n`);
  let failed = 0;
  for (const [label, run] of STEPS) {
    try {
      await run();
      console.log(`  OK   ${label}`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${label} — ${e.message}`);
    }
  }
  console.log(`\n${STEPS.length - failed}/${STEPS.length} steps succeeded.`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('Schema bootstrap crashed:', e);
  process.exit(1);
});
