/**
 * Add project pipeline units (project, ts, ip, noc) to staff users' units + roles.
 * Run: node scripts/add-project-units-to-users.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../db.js';

const PIPELINE_UNITS = ['project', 'ts', 'ip', 'noc'];

const ROLE_TO_UNITS = {
  project: ['project'],
  superadmin: PIPELINE_UNITS,
  director: PIPELINE_UNITS,
  cto: PIPELINE_UNITS,
  noc: ['noc', 'project'],
  noc_manager: PIPELINE_UNITS,
  noc_supervisor: ['noc', 'project'],
  ts_manager: PIPELINE_UNITS,
  ts_supervisor: ['ts', 'project'],
  ip_manager: PIPELINE_UNITS,
  ip_supervisor: ['ip', 'project'],
  ip: ['ip', 'project'],
};

function parseJsonArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x).toLowerCase());
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p.map((x) => String(x).toLowerCase()) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mergeList(existing, add) {
  return [...new Set([...parseJsonArray(existing), ...add.map((x) => x.toLowerCase())])];
}

const { rows: users } = await pool.query(
  `SELECT id, username, units, roles, main_role, role FROM users WHERE deleted_at IS NULL`
);

let updated = 0;
for (const u of users) {
  const roleKey = String(u.main_role || u.role || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const extra = ROLE_TO_UNITS[roleKey];
  if (!extra) continue;

  const units = mergeList(u.units, extra);
  const roles = mergeList(u.roles, ['project']);

  await pool.query(`UPDATE users SET units = $1::jsonb, roles = $2::jsonb WHERE id = $3`, [
    JSON.stringify(units),
    JSON.stringify(roles),
    u.id,
  ]);
  console.log(`  ${u.username} (${roleKey}): units=${units.join(', ')}`);
  updated++;
}

console.log(`\nUpdated ${updated} user(s).`);

const { ensureProjectRequestThread } = await import('../services/chatRecordThreads.js');
const { rows: projects } = await pool.query(`SELECT * FROM project_requests ORDER BY id`);
let threads = 0;
for (const pr of projects) {
  await ensureProjectRequestThread(pr, null);
  threads++;
}
console.log(`Synced ${threads} project request chat thread(s).`);

await pool.end();
