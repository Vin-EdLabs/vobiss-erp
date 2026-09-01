/**
 * Backfill: create/link WIP rows for every design-confirmed Service Request that doesn't have
 * one yet. Reuses syncProjectRequestToWip so field-mapping stays in exactly one place.
 *
 * Usage: node backend/scripts/backfill-wip-from-service-requests.mjs
 */
import dotenv from 'dotenv';
dotenv.config();
import pool from '../db.js';
import { syncProjectRequestToWip } from '../services/wipSync.js';

const { rows } = await pool.query(
  `SELECT pr.id FROM project_requests pr
   WHERE pr.design_confirmed_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project_wip_entries w WHERE w.project_request_id = pr.id)
   ORDER BY pr.id`
);
console.log(`Found ${rows.length} confirmed SR(s) with no linked WIP row.`);

let created = 0;
for (const { id } of rows) {
  const result = await syncProjectRequestToWip(id);
  if (result) {
    created++;
    console.log(`  SR-${id} -> WIP-${result.id}`);
  } else {
    console.log(`  SR-${id} -> skipped (no-op)`);
  }
}

console.log(`Backfilled ${created} WIP row(s).`);
await pool.end();
