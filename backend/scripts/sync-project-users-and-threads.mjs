/**
 * Fix users with project role missing units; re-sync all project chat threads.
 * Run: node scripts/sync-project-users-and-threads.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../db.js';
import { defaultUnitsForRole, parseUserUnitsArray, effectiveUnitsForUser } from '../roles.js';
import { ensureProjectRequestThread } from '../services/chatRecordThreads.js';

const { rows: users } = await pool.query(
  `SELECT id, username, role, main_role, units FROM users WHERE deleted_at IS NULL`
);

let fixed = 0;
for (const u of users) {
  const effective = effectiveUnitsForUser(u);
  const current = parseUserUnitsArray(u.units);
  if (effective.length === current.length && effective.every((x) => current.includes(x))) continue;

  await pool.query(`UPDATE users SET units = $1::jsonb WHERE id = $2`, [
    JSON.stringify(effective),
    u.id,
  ]);
  console.log(`  ${u.username}: units → ${effective.join(', ')}`);
  fixed++;
}

console.log(`\nUpdated units on ${fixed} user(s).`);

const { rows: projects } = await pool.query(`SELECT * FROM project_requests ORDER BY id`);
for (const pr of projects) {
  await ensureProjectRequestThread(pr, null);
}
console.log(`Re-synced ${projects.length} project request chat thread(s).`);

await pool.end();
