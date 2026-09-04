// Seeds PTEL's initial staff accounts. Standalone — run manually, not wired into server boot:
//   node backend/seeds/ptel-users.js
//
// Idempotent: re-running skips any username that already exists rather than erroring or
// duplicating rows, so it's safe to run again after adding a name to PTEL_USERS below.
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pool from '../db.js';

const DEFAULT_PASSWORD = 'PTEL@2025';

// unit/position drive real access through the existing unit/position system (see roles.js's
// defaultUnitsForRole) — the ptel_* role slug alone is only used to gate the PTEL Sales
// Dashboard. Edmund, Andrew, and Foster deliberately have no matching unit today (Data, Service
// Delivery, and Executive aren't existing units) — they get PTEL Sales Dashboard access (if
// their role is listed there) but no unit-scoped module access until a real module exists.
const PTEL_USERS = [
  { first_name: 'Bismark', last_name: 'PTEL', role: 'ptel_sales', unit: 'sales', position: 'Sales' },
  { first_name: 'Afua', last_name: 'PTEL', role: 'ptel_sales', unit: 'sales', position: 'Sales' },
  { first_name: 'Sabina', last_name: 'PTEL', role: 'ptel_cx_manager', unit: 'cx', position: 'CX Manager' },
  { first_name: 'Phoebe', last_name: 'PTEL', role: 'ptel_finance', unit: 'finance', position: 'Accountant' },
  { first_name: 'Emmanuella', last_name: 'PTEL', role: 'ptel_hr_admin', unit: 'hr', position: 'Admin/HR' },
  { first_name: 'Edmund', last_name: 'PTEL', role: 'ptel_data', unit: null, position: 'Data' },
  { first_name: 'Andrew', last_name: 'PTEL', role: 'ptel_service_delivery', unit: null, position: 'Service Delivery' },
  { first_name: 'Foster', last_name: 'PTEL', role: 'ptel_executive', unit: null, position: 'Managing Director' },
  { first_name: 'Isaac', last_name: 'PTEL', role: 'ptel_finance', unit: 'finance', position: 'Finance' },
];

function usernameFor(firstName) {
  return firstName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

async function seed() {
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const created = [];
  const skipped = [];

  for (const person of PTEL_USERS) {
    const username = usernameFor(person.first_name);
    const email = `${username}@ptel.local`;
    const units = person.unit ? [person.unit] : [];

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [username]);
    if (existing.rowCount > 0) {
      skipped.push({ username, reason: 'already exists', id: existing.rows[0].id });
      continue;
    }

    const result = await pool.query(
      `INSERT INTO users (
        first_name, last_name, username, email, password,
        role, main_role, roles, units, unit, position, company, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,jsonb_build_array($8::text),$9::jsonb,$10,$11,'PTEL',CURRENT_TIMESTAMP)
      RETURNING id, username, role, unit, position, company`,
      [
        person.first_name,
        person.last_name,
        username,
        email,
        hashedPassword,
        person.role,
        person.role,
        person.role,
        JSON.stringify(units),
        person.unit,
        person.position,
      ]
    );
    created.push(result.rows[0]);
  }

  console.log(`Created ${created.length} PTEL user(s):`);
  for (const u of created) console.log(`  - ${u.username} (id ${u.id}) role=${u.role} unit=${u.unit || '-'} position=${u.position}`);
  if (skipped.length) {
    console.log(`\nSkipped ${skipped.length} (already exist):`);
    for (const s of skipped) console.log(`  - ${s.username} (id ${s.id})`);
  }
  if (created.length) {
    console.log(`\nDefault password for all newly created accounts: ${DEFAULT_PASSWORD}`);
    console.log('Each user should change their password after first login.');
  }
}

seed()
  .catch((err) => {
    console.error('PTEL seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
