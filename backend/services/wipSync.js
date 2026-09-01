/**
 * Mirrors a confirmed Service Request (project_requests) into the WIP tracking sheet
 * (project_wip_entries). One-directional — the SR is always the source of truth, WIP just
 * reflects it. Call after any SR stage transition that should be visible in WIP.
 */
import pool from '../db.js';

const SR_TO_WIP_FIELDS = {
  customer_name: 'customer_name', site_name: 'site_name', location: 'location', region: 'region',
  capacity: 'capacity', bandwidth: 'bandwidth',
  adss: 'planned_adss_distance', drop_cable: 'planned_drop_cable_distance',
  service_type: 'service_type', cpe: 'cpe',
  start_date: 'start_date', completion_date: 'completion_date', confirmation_date: 'confirmation_date',
  mrc: 'mrc',
};
const SYNC_ACTOR_NAME = 'Service Request Sync';

function deriveWipStatus(sr) {
  if (sr.current_stage === 'rejected') return 'Cancelled';
  if (sr.status === 'completed') return 'Completed';
  return 'In Progress';
}

/**
 * Create-or-sync the WIP row linked to a project_requests row. No-op if the SR doesn't exist,
 * if no WIP row exists yet and the SR hasn't been design-confirmed (still a draft), or if the
 * linked WIP row was manually archived (soft-deleted) — sync must never resurrect it.
 */
export async function syncProjectRequestToWip(requestId) {
  const { rows: srRows } = await pool.query('SELECT * FROM project_requests WHERE id = $1', [requestId]);
  const sr = srRows[0];
  if (!sr) return null;

  const { rows: linkRows } = await pool.query(
    'SELECT * FROM project_wip_entries WHERE project_request_id = $1', [requestId]
  );
  const existing = linkRows[0];
  if (existing?.deleted_at) return null;

  const desired = {};
  for (const [srField, wipField] of Object.entries(SR_TO_WIP_FIELDS)) desired[wipField] = sr[srField] ?? null;
  desired.status = deriveWipStatus(sr);

  if (!existing) {
    if (!sr.design_confirmed_at) return null;
    const fields = [...Object.keys(desired), 'project_request_id', 'created_by'];
    const values = [...Object.values(desired), requestId, sr.created_by_user_id || null];
    const { rows } = await pool.query(
      `INSERT INTO project_wip_entries (${fields.join(',')}) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      values
    );
    return rows[0];
  }

  const changedFields = Object.keys(desired).filter((f) => String(existing[f] ?? '') !== String(desired[f] ?? ''));
  if (!changedFields.length) return existing;

  const sets = changedFields.map((f, i) => `${f}=$${i + 1}`);
  const { rows } = await pool.query(
    `UPDATE project_wip_entries SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${changedFields.length + 1} RETURNING *`,
    [...changedFields.map((f) => desired[f]), existing.id]
  );
  for (const f of changedFields) {
    await pool.query(
      `INSERT INTO project_wip_history (entry_id,field_name,old_value,new_value,changed_by,changed_by_name) VALUES ($1,$2,$3,$4,$5,$6)`,
      [existing.id, f, String(existing[f] ?? ''), String(desired[f] ?? ''), null, SYNC_ACTOR_NAME]
    );
  }
  return rows[0];
}
