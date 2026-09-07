import pool from '../db.js';
import { createNotification } from '../db.js';
import { logUserAction, formatRecordLabel, recordViewPath } from './activityLog.js';
import { recordTimingEvent } from './workflowTimeEngine.js';
import { isSystemAdminAccount, userHasAnyRole, effectiveUnitsForUser, canonicalizeUnitSlug } from '../roles.js';
import { tsAcceptRequest } from '../db/project.js';
import { haversineMeters } from './geo.js';

/**
 * Field Engineering / Site Work — a child record of a Ticket or Service Request, never a
 * replacement for either. One field_work record can have several engineers working it in
 * parallel, so unlike every other workflow wired into workflow_time_segments (which keeps a
 * single open segment per record via recordTimingEvent), field work needs TWO tracks:
 *   - a record-level segment (via the existing recordTimingEvent, toUserId=null) that follows
 *     the job's own lifecycle: assigned -> awaiting NOC confirmation -> awaiting client
 *     confirmation -> closed. This reuses recordTimingEvent completely unmodified.
 *   - per-engineer segments, opened/closed here directly against workflow_time_segments,
 *     scoped by (workflow_type='field_work', record_id=field_work.id, user_id=engineer),
 *     so two engineers on the same job never stomp on each other's open segment the way a
 *     plain recordTimingEvent call would (it only ever tracks ONE open segment per record).
 * Both tracks write into the exact same table columns recordTimingEvent already uses, so
 * Workflow Performance and Staff Assessment pick field work up automatically — no changes
 * needed there.
 */

const FIELD_WORK_STATUSES = ['assigned', 'travelling', 'on_site', 'in_progress', 'waiting', 'completed', 'noc_confirmed', 'client_confirmed', 'closed'];
const ENGINEER_STATUSES = ['assigned', 'travelling', 'on_site', 'completed'];
const ENGINEER_STAGE_ORDER = ['assigned', 'travelling', 'on_site', 'completed'];

let tableReady = false;
export async function ensureFieldWorkTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_work (
      id SERIAL PRIMARY KEY,
      source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('ticket','service_request')),
      source_id INTEGER NOT NULL,
      site_id INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL,
      client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      work_type VARCHAR(60),
      status VARCHAR(30) NOT NULL DEFAULT 'assigned' CHECK (status IN (${FIELD_WORK_STATUSES.map((s) => `'${s}'`).join(',')})),
      priority VARCHAR(20) DEFAULT 'medium',
      notes TEXT,
      unit_slug VARCHAR(60) NOT NULL DEFAULT 'ts',
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS field_work_source_idx ON field_work(source_type, source_id);
    CREATE INDEX IF NOT EXISTS field_work_status_idx ON field_work(status);

    CREATE TABLE IF NOT EXISTS field_work_engineers (
      id SERIAL PRIMARY KEY,
      field_work_id INTEGER NOT NULL REFERENCES field_work(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_lead BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(20) NOT NULL DEFAULT 'assigned' CHECK (status IN (${ENGINEER_STATUSES.map((s) => `'${s}'`).join(',')})),
      completed_at TIMESTAMP,
      removed_at TIMESTAMP,
      UNIQUE (field_work_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS field_work_engineers_fw_idx ON field_work_engineers(field_work_id);
    CREATE INDEX IF NOT EXISTS field_work_engineers_user_idx ON field_work_engineers(user_id);

    CREATE TABLE IF NOT EXISTS field_work_updates (
      id SERIAL PRIMARY KEY,
      field_work_id INTEGER NOT NULL REFERENCES field_work(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      update_type VARCHAR(30) NOT NULL DEFAULT 'note' CHECK (update_type IN ('progress','note','status_change','arrival','departure','issue','material_request','transport_request','fuel_request')),
      content TEXT,
      progress_percentage INTEGER CHECK (progress_percentage IS NULL OR (progress_percentage >= 0 AND progress_percentage <= 100)),
      attachments JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS field_work_updates_fw_idx ON field_work_updates(field_work_id);
    CREATE INDEX IF NOT EXISTS field_work_updates_user_idx ON field_work_updates(user_id);
    ALTER TABLE field_work_updates ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE field_work_updates ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE field_work_updates ADD COLUMN IF NOT EXISTS distance_from_site_meters INTEGER;

    CREATE TABLE IF NOT EXISTS field_work_confirmations (
      id SERIAL PRIMARY KEY,
      field_work_id INTEGER NOT NULL REFERENCES field_work(id) ON DELETE CASCADE,
      confirmation_type VARCHAR(20) NOT NULL CHECK (confirmation_type IN ('noc','noc_rejected','client')),
      confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      client_name VARCHAR(255),
      client_signature VARCHAR(512),
      notes TEXT,
      confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS field_work_confirmations_fw_idx ON field_work_confirmations(field_work_id);
  `);
  tableReady = true;
}

// ---------------------------------------------------------------------------
// Permissions — composed entirely from existing role helpers (backend/roles.js).
// No new permission system; this is just the field-work-specific composition of it.
// ---------------------------------------------------------------------------

export function isFieldWorkSupervisor(user) {
  if (isSystemAdminAccount(user) || userHasAnyRole(user, ['director', 'cto'])) return true;
  if (userHasAnyRole(user, ['ts_supervisor', 'ts_manager', 'field_engineer_admin'])) return true;
  return false;
}

export function isNocConfirmer(user) {
  if (isSystemAdminAccount(user) || userHasAnyRole(user, ['director', 'cto'])) return true;
  if (userHasAnyRole(user, ['noc_supervisor', 'noc_manager'])) return true;
  return effectiveUnitsForUser(user).includes('noc');
}

export async function isAssignedEngineer(fieldWorkId, userId) {
  const r = await pool.query(
    `SELECT 1 FROM field_work_engineers WHERE field_work_id = $1 AND user_id = $2 AND removed_at IS NULL LIMIT 1`,
    [fieldWorkId, userId]
  );
  return r.rowCount > 0;
}

export async function canViewFieldWork(user, fieldWork) {
  if (isFieldWorkSupervisor(user)) return true;
  if (isNocConfirmer(user)) return true;
  return isAssignedEngineer(fieldWork.id, user.id);
}

// ---------------------------------------------------------------------------
// Per-engineer timing segments — see module comment above for why this is separate
// from recordTimingEvent.
// ---------------------------------------------------------------------------

async function closeEngineerSegment(fieldWorkId, engineerUserId) {
  await pool.query(
    `UPDATE workflow_time_segments
     SET ended_at = CURRENT_TIMESTAMP,
         duration_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) / 60))
     WHERE workflow_type = 'field_work' AND record_id = $1 AND user_id = $2 AND ended_at IS NULL`,
    [fieldWorkId, engineerUserId]
  );
}

async function openEngineerSegment(fieldWorkId, engineerUserId, unitSlug, stageName) {
  await pool.query(
    `INSERT INTO workflow_time_segments (workflow_type, record_id, unit_slug, user_id, stage_name, started_at, is_waiting)
     VALUES ('field_work', $1, $2, $3, $4, CURRENT_TIMESTAMP, $5)`,
    [fieldWorkId, unitSlug, engineerUserId, stageName, stageName === 'waiting']
  );
}

async function transitionEngineerSegment(fieldWorkId, engineerUserId, unitSlug, newStage, isTerminal) {
  await closeEngineerSegment(fieldWorkId, engineerUserId);
  if (!isTerminal) await openEngineerSegment(fieldWorkId, engineerUserId, unitSlug, newStage);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getUserBrief(userId) {
  const r = await pool.query(
    `SELECT id, first_name, last_name, username FROM users WHERE id = $1`,
    [userId]
  );
  const u = r.rows[0];
  if (!u) return null;
  return { id: u.id, name: (`${u.first_name || ''} ${u.last_name || ''}`.trim()) || u.username };
}

function sourceRecordType(sourceType) {
  return sourceType === 'ticket' ? 'ticket' : 'service_request';
}

async function sourceReferenceLabel(sourceType, sourceId) {
  return formatRecordLabel(sourceRecordType(sourceType), sourceId);
}

/** The staff user who owns the ticket/service request, if any — never a customer-portal id. */
async function sourceOwnerUserId(sourceType, sourceId) {
  if (sourceType === 'ticket') {
    const r = await pool.query(`SELECT created_by_id, created_by_type, assigned_to FROM tickets WHERE id = $1`, [sourceId]);
    const row = r.rows[0];
    if (!row) return null;
    return row.assigned_to || (row.created_by_type === 'staff' ? row.created_by_id : null);
  }
  const r = await pool.query(`SELECT created_by_user_id FROM project_requests WHERE id = $1`, [sourceId]);
  return r.rows[0]?.created_by_user_id || null;
}

async function linkFieldWorkToSource(fieldWorkId, sourceType, sourceId, userId) {
  try {
    const { getRecordSummary } = await import('./referenceRegistry.js');
    const summary = await getRecordSummary(sourceRecordType(sourceType), sourceId);
    if (!summary) return;
    await pool.query(
      `INSERT INTO linked_references
         (source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status, created_by_user_id)
       VALUES ('field_work',$1,$2,$3,$4,$5,$6,$7)`,
      [fieldWorkId, summary.type, summary.id, summary.referenceNumber, summary.title, summary.status, userId]
    );
  } catch (e) {
    console.warn('[field-work] failed to link source reference:', e.message);
  }
}

/** Appends a field-work-uploaded file to the ORIGINAL ticket or service request's own attachment storage, using each source's existing convention exactly. */
async function attachToSource(sourceType, sourceId, { filePath, fileName, mimeType, uploaderId, uploaderName }) {
  if (sourceType === 'ticket') {
    await pool.query(
      `UPDATE tickets SET attachments = COALESCE(attachments, '[]'::jsonb) || $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [sourceId, JSON.stringify([{ path: filePath, name: fileName, mime_type: mimeType, uploaded_by: uploaderName, uploaded_at: new Date().toISOString(), source: 'field_work' }])]
    );
  } else {
    await pool.query(
      `INSERT INTO project_request_attachments (request_id, user_id, uploader_name, file_path, file_name, mime_type, stage)
       VALUES ($1,$2,$3,$4,$5,$6,'ts')`,
      [sourceId, uploaderId, uploaderName, filePath, fileName, mimeType]
    );
  }
}

async function notifyMany(userIds, title, message, actorId, opts) {
  const unique = [...new Set(userIds.filter(Boolean))];
  await Promise.all(unique.map((uid) => createNotification(title, message, actorId, { ...opts, targetUserId: uid }).catch(() => {})));
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------

export async function createFieldWork(payload, actingUser) {
  await ensureFieldWorkTables();
  const {
    source_type: sourceType, source_id: sourceId, site_id: siteId, client_id: clientId,
    title, work_type: workType, priority = 'medium', notes,
    engineer_ids: engineerIds = [], lead_engineer_id: leadEngineerId,
  } = payload;

  if (!['ticket', 'service_request'].includes(sourceType)) throw new Error('source_type must be ticket or service_request');
  if (!Number.isInteger(Number(sourceId))) throw new Error('source_id is required');
  if (!title || !String(title).trim()) throw new Error('title is required');
  const engineers = [...new Set((engineerIds || []).map(Number).filter(Number.isInteger))];
  if (!engineers.length) throw new Error('At least one engineer must be assigned');
  const lead = leadEngineerId != null ? Number(leadEngineerId) : engineers[0];
  if (!engineers.includes(lead)) throw new Error('Lead engineer must be one of the assigned engineers');

  const inserted = await pool.query(
    `INSERT INTO field_work (source_type, source_id, site_id, client_id, title, work_type, priority, notes, unit_slug, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ts',$9) RETURNING *`,
    [sourceType, Number(sourceId), siteId || null, clientId || null, String(title).trim(), workType || null, priority, notes || null, actingUser.id]
  );
  const fieldWork = inserted.rows[0];

  for (const engineerId of engineers) {
    await pool.query(
      `INSERT INTO field_work_engineers (field_work_id, user_id, is_lead, assigned_by_user_id) VALUES ($1,$2,$3,$4)`,
      [fieldWork.id, engineerId, engineerId === lead, actingUser.id]
    );
    await openEngineerSegment(fieldWork.id, engineerId, 'ts', 'assigned');
  }

  const ref = await sourceReferenceLabel(sourceType, sourceId);
  await recordTimingEvent({
    workflowType: 'field_work', recordId: fieldWork.id, eventType: 'created', stageName: 'assigned',
    toUnitSlug: 'ts', triggeredByUserId: actingUser.id,
  }).catch(() => {});
  await logUserAction(actingUser, {
    actionType: 'field_work_created', recordType: 'field_work', recordId: fieldWork.id,
    description: `You created field work on ${ref}${payload.site_name ? ` at ${payload.site_name}` : ''} and assigned ${engineers.length} engineer${engineers.length === 1 ? '' : 's'}`,
  });
  await linkFieldWorkToSource(fieldWork.id, sourceType, sourceId, actingUser.id);

  for (const engineerId of engineers) {
    await logUserAction({ id: engineerId }, {
      actionType: 'field_work_assigned', recordType: 'field_work', recordId: fieldWork.id,
      description: `You were assigned to field work on ${ref}`,
    });
  }
  await notifyMany(engineers, 'Field Work Assigned', `You have been assigned to field work on ${ref}.`, actingUser.id, {
    linkUrl: '/staff/field/my-field-work', notificationType: 'field_work_assigned',
  });

  return getFieldWorkDetail(fieldWork.id);
}

export async function listFieldWork({ status, siteId, engineerId, sourceType, dateFrom, dateTo } = {}) {
  await ensureFieldWorkTables();
  const clauses = ['1=1'];
  const params = [];
  if (status) { params.push(status); clauses.push(`fw.status = $${params.length}`); }
  if (siteId) { params.push(siteId); clauses.push(`fw.site_id = $${params.length}`); }
  if (sourceType) { params.push(sourceType); clauses.push(`fw.source_type = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`fw.created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`fw.created_at <= $${params.length}`); }
  if (engineerId) {
    params.push(Number(engineerId));
    clauses.push(`EXISTS (SELECT 1 FROM field_work_engineers e WHERE e.field_work_id = fw.id AND e.user_id = $${params.length} AND e.removed_at IS NULL)`);
  }

  const result = await pool.query(
    `SELECT fw.*,
            cs.site_name, cs.region AS site_region,
            c.contact_person AS client_name,
            (SELECT COUNT(*) FROM field_work_engineers e WHERE e.field_work_id = fw.id AND e.removed_at IS NULL) AS engineer_count
     FROM field_work fw
     LEFT JOIN customer_sites cs ON cs.id = fw.site_id
     LEFT JOIN customers c ON c.id = fw.client_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY fw.created_at DESC
     LIMIT 300`,
    params
  );
  return result.rows;
}

/** Recent "Confirm I'm here" check-ins across all field work — the HR/TX-supervisor visibility
 *  feed. Deliberately narrow (just arrivals, not full field_work access) rather than expanding
 *  canViewFieldWork broadly — HR gets to see who's on site, not full case-management access. */
export async function listRecentArrivals({ dateFrom, dateTo, limit = 100 } = {}) {
  await ensureFieldWorkTables();
  const clauses = [`up.update_type = 'arrival'`];
  const params = [];
  if (dateFrom) { params.push(dateFrom); clauses.push(`up.created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`up.created_at <= $${params.length}`); }
  params.push(Math.min(300, Math.max(1, Number(limit) || 100)));

  const result = await pool.query(
    `SELECT up.id, up.field_work_id, up.content, up.attachments, up.latitude, up.longitude,
            up.distance_from_site_meters, up.created_at,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS engineer_name,
            fw.source_type, fw.source_id, fw.title AS field_work_title,
            cs.site_name
     FROM field_work_updates up
     JOIN field_work fw ON fw.id = up.field_work_id
     LEFT JOIN users u ON u.id = up.user_id
     LEFT JOIN customer_sites cs ON cs.id = fw.site_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY up.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return Promise.all(
    result.rows.map(async (row) => ({
      ...row,
      source_reference: await sourceReferenceLabel(row.source_type, row.source_id),
    }))
  );
}

export async function getFieldWorkDetail(id) {
  await ensureFieldWorkTables();
  const fwResult = await pool.query(
    `SELECT fw.*, cs.site_name, cs.site_address, cs.region AS site_region,
            cs.latitude AS site_latitude, cs.longitude AS site_longitude,
            c.contact_person AS client_name
     FROM field_work fw
     LEFT JOIN customer_sites cs ON cs.id = fw.site_id
     LEFT JOIN customers c ON c.id = fw.client_id
     WHERE fw.id = $1`,
    [id]
  );
  const fieldWork = fwResult.rows[0];
  if (!fieldWork) return null;

  const [engineers, updates, confirmations, linkedRefs] = await Promise.all([
    pool.query(
      `SELECT e.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name
       FROM field_work_engineers e JOIN users u ON u.id = e.user_id
       WHERE e.field_work_id = $1 ORDER BY e.is_lead DESC, e.assigned_at ASC`,
      [id]
    ),
    pool.query(
      `SELECT up.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name
       FROM field_work_updates up LEFT JOIN users u ON u.id = up.user_id
       WHERE up.field_work_id = $1 ORDER BY up.created_at DESC`,
      [id]
    ),
    pool.query(
      `SELECT fc.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS confirmed_by_name
       FROM field_work_confirmations fc LEFT JOIN users u ON u.id = fc.confirmed_by_user_id
       WHERE fc.field_work_id = $1 ORDER BY fc.confirmed_at ASC`,
      [id]
    ),
    pool.query(
      `SELECT linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status
       FROM linked_references WHERE source_record_type = 'field_work' AND source_record_id = $1
       ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  return {
    ...fieldWork,
    engineers: engineers.rows.filter((e) => !e.removed_at),
    removedEngineers: engineers.rows.filter((e) => e.removed_at),
    updates: updates.rows,
    confirmations: confirmations.rows,
    linkedRequests: linkedRefs.rows.filter((r) => ['material_request', 'transport_request', 'fuel_request', 'vehicle_request'].includes(r.linked_record_type)),
    sourceReference: await sourceReferenceLabel(fieldWork.source_type, fieldWork.source_id),
    sourceLink: recordViewPath(sourceRecordType(fieldWork.source_type), fieldWork.source_id),
  };
}

export async function addEngineers(fieldWorkId, engineerIds, leadEngineerId, actingUser) {
  await ensureFieldWorkTables();
  const fw = await pool.query(`SELECT * FROM field_work WHERE id = $1`, [fieldWorkId]);
  if (!fw.rows[0]) throw new Error('Field work not found');
  const ref = await sourceReferenceLabel(fw.rows[0].source_type, fw.rows[0].source_id);

  const ids = [...new Set((engineerIds || []).map(Number).filter(Number.isInteger))];
  for (const engineerId of ids) {
    const existing = await pool.query(
      `SELECT id, removed_at FROM field_work_engineers WHERE field_work_id = $1 AND user_id = $2`,
      [fieldWorkId, engineerId]
    );
    if (existing.rows[0] && !existing.rows[0].removed_at) continue;
    if (existing.rows[0]) {
      await pool.query(`UPDATE field_work_engineers SET removed_at = NULL, status = 'assigned', assigned_at = CURRENT_TIMESTAMP, assigned_by_user_id = $2 WHERE id = $1`, [existing.rows[0].id, actingUser.id]);
    } else {
      await pool.query(
        `INSERT INTO field_work_engineers (field_work_id, user_id, is_lead, assigned_by_user_id) VALUES ($1,$2,false,$3)`,
        [fieldWorkId, engineerId, actingUser.id]
      );
    }
    await openEngineerSegment(fieldWorkId, engineerId, fw.rows[0].unit_slug, 'assigned');
    const brief = await getUserBrief(engineerId);
    await logUserAction({ id: engineerId }, { actionType: 'field_work_assigned', recordType: 'field_work', recordId: fieldWorkId, description: `You were added to the team for field work on ${ref}` });
    await logUserAction(actingUser, { actionType: 'field_work_engineer_added', recordType: 'field_work', recordId: fieldWorkId, description: `You added ${brief?.name || `User #${engineerId}`} to field work on ${ref}` });
    await notifyMany([engineerId], 'Added to Field Work', `You have been added to the team for field work on ${ref}.`, actingUser.id, { linkUrl: '/staff/field/my-field-work', notificationType: 'field_work_assigned' });
  }

  if (leadEngineerId != null) {
    await pool.query(`UPDATE field_work_engineers SET is_lead = (user_id = $2) WHERE field_work_id = $1`, [fieldWorkId, Number(leadEngineerId)]);
  }
  return getFieldWorkDetail(fieldWorkId);
}

export async function removeEngineer(fieldWorkId, userId, actingUser) {
  await ensureFieldWorkTables();
  const fw = await pool.query(`SELECT * FROM field_work WHERE id = $1`, [fieldWorkId]);
  if (!fw.rows[0]) throw new Error('Field work not found');
  const ref = await sourceReferenceLabel(fw.rows[0].source_type, fw.rows[0].source_id);
  const brief = await getUserBrief(userId);

  await pool.query(`UPDATE field_work_engineers SET removed_at = CURRENT_TIMESTAMP WHERE field_work_id = $1 AND user_id = $2`, [fieldWorkId, userId]);
  await closeEngineerSegment(fieldWorkId, userId);

  await logUserAction({ id: userId }, { actionType: 'field_work_removed', recordType: 'field_work', recordId: fieldWorkId, description: `You were removed from field work on ${ref}` });
  await logUserAction(actingUser, { actionType: 'field_work_engineer_removed', recordType: 'field_work', recordId: fieldWorkId, description: `You removed ${brief?.name || `User #${userId}`} from field work on ${ref}` });
  await notifyMany([userId], 'Removed from Field Work', `You have been removed from field work on ${ref}.`, actingUser.id, { notificationType: 'field_work_removed' });

  return getFieldWorkDetail(fieldWorkId);
}

/** Derives the overall field_work.status from the furthest-progressed engineer, when the record is still in an engineer-driven stage. Supervisors can always override directly. */
function deriveOverallStatus(currentOverall, engineerStatuses) {
  if (!['assigned', 'travelling', 'on_site'].includes(currentOverall)) return currentOverall;
  if (engineerStatuses.length && engineerStatuses.every((s) => s === 'completed')) return 'completed';
  let best = 'assigned';
  for (const s of engineerStatuses) {
    if (ENGINEER_STAGE_ORDER.indexOf(s) > ENGINEER_STAGE_ORDER.indexOf(best) && s !== 'completed') best = s;
  }
  return best;
}

export async function updateFieldWorkStatus(fieldWorkId, status, actingUser) {
  await ensureFieldWorkTables();
  const fw = await pool.query(`SELECT * FROM field_work WHERE id = $1`, [fieldWorkId]);
  const fieldWork = fw.rows[0];
  if (!fieldWork) throw new Error('Field work not found');
  const ref = await sourceReferenceLabel(fieldWork.source_type, fieldWork.source_id);

  const supervisor = isFieldWorkSupervisor(actingUser);
  const isEngineer = await isAssignedEngineer(fieldWorkId, actingUser.id);
  if (!supervisor && !isEngineer) throw new Error('You are not assigned to this field work');

  let overallStatus = fieldWork.status;

  if (!supervisor) {
    if (!ENGINEER_STATUSES.includes(status)) throw new Error(`Engineers can set status to one of: ${ENGINEER_STATUSES.join(', ')}`);
    await pool.query(
      `UPDATE field_work_engineers SET status = $3::varchar, completed_at = CASE WHEN $3::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
       WHERE field_work_id = $1 AND user_id = $2`,
      [fieldWorkId, actingUser.id, status]
    );
    await transitionEngineerSegment(fieldWorkId, actingUser.id, fieldWork.unit_slug, status, status === 'completed');
    await logUserAction(actingUser, { actionType: 'field_work_status_update', recordType: 'field_work', recordId: fieldWorkId, description: `You updated your status to ${status} on field work ${ref}` });

    const engineerRows = await pool.query(`SELECT status FROM field_work_engineers WHERE field_work_id = $1 AND removed_at IS NULL`, [fieldWorkId]);
    overallStatus = deriveOverallStatus(fieldWork.status, engineerRows.rows.map((r) => r.status));
  } else if (FIELD_WORK_STATUSES.includes(status)) {
    overallStatus = status;
  } else {
    throw new Error(`status must be one of: ${FIELD_WORK_STATUSES.join(', ')}`);
  }

  if (overallStatus !== fieldWork.status) {
    await pool.query(`UPDATE field_work SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [fieldWorkId, overallStatus]);
    if (overallStatus === 'completed' && fieldWork.status !== 'completed') {
      await recordTimingEvent({ workflowType: 'field_work', recordId: fieldWorkId, eventType: 'field_work_completed', stageName: 'awaiting_noc', toUnitSlug: 'noc', triggeredByUserId: actingUser.id }).catch(() => {});
      const supervisorIds = await resolveUnitRoleUserIds(['ts_supervisor', 'ts_manager']);
      const nocIds = await resolveUnitRoleUserIds(['noc_supervisor', 'noc_manager']);
      await notifyMany([...supervisorIds, ...nocIds], 'Field Work Marked Complete', `Field work on ${ref} has been marked complete — awaiting NOC confirmation.`, actingUser.id, { linkUrl: recordViewPath('field_work', fieldWorkId), notificationType: 'field_work_completed' });
      if (supervisor) {
        await logUserAction(actingUser, { actionType: 'field_work_marked_complete', recordType: 'field_work', recordId: fieldWorkId, description: `You marked field work on ${ref} as complete` });
      }
    }
  }

  return getFieldWorkDetail(fieldWorkId);
}

export async function postFieldWorkUpdate(fieldWorkId, actingUser, { updateType = 'note', content, progressPercentage, attachments = [], latitude, longitude }) {
  await ensureFieldWorkTables();
  const fw = await pool.query(`SELECT * FROM field_work WHERE id = $1`, [fieldWorkId]);
  const fieldWork = fw.rows[0];
  if (!fieldWork) throw new Error('Field work not found');
  const supervisor = isFieldWorkSupervisor(actingUser);
  if (!supervisor && !(await isAssignedEngineer(fieldWorkId, actingUser.id))) throw new Error('You are not assigned to this field work');
  const ref = await sourceReferenceLabel(fieldWork.source_type, fieldWork.source_id);

  // Completing (departure) needs proof either way — GPS is the primary path, but a photo is an
  // accepted fallback for when a device's location genuinely never resolves (how many attempts
  // that took is a client-side UX concern; the server just needs one or the other).
  if (updateType === 'departure' && !supervisor) {
    const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!hasLocation && !(attachments || []).length) {
      throw new Error('Confirm your location or attach a photo to mark this complete');
    }
  }

  // Arrivals carry the engineer's device coordinates — checked against the site's saved
  // coordinates (if any) purely to surface a distance badge to supervisors/HR. Never blocks the
  // check-in: GPS drift, gate distance, or a site with no coordinates yet shouldn't stop someone
  // from confirming they're there.
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
  let distanceMeters = null;
  if (hasCoords && fieldWork.site_id) {
    const siteRes = await pool.query(`SELECT latitude, longitude FROM customer_sites WHERE id = $1`, [fieldWork.site_id]);
    const site = siteRes.rows[0];
    if (site && Number.isFinite(site.latitude) && Number.isFinite(site.longitude)) {
      distanceMeters = haversineMeters({ lat: latitude, lng: longitude }, { lat: site.latitude, lng: site.longitude });
    }
  }

  const inserted = await pool.query(
    `INSERT INTO field_work_updates (field_work_id, user_id, update_type, content, progress_percentage, attachments, latitude, longitude, distance_from_site_meters)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      fieldWorkId, actingUser.id, updateType, content || null, progressPercentage ?? null, JSON.stringify(attachments || []),
      hasCoords ? latitude : null, hasCoords ? longitude : null, distanceMeters,
    ]
  );

  await logUserAction(actingUser, { actionType: 'field_work_update_posted', recordType: 'field_work', recordId: fieldWorkId, description: `You posted an update on field work ${ref}` });

  const actorBrief = await getUserBrief(actingUser.id);
  for (const file of attachments || []) {
    await attachToSource(fieldWork.source_type, fieldWork.source_id, {
      filePath: file.path, fileName: file.name, mimeType: file.mime_type,
      uploaderId: actingUser.id, uploaderName: actorBrief?.name || 'Field Engineer',
    }).catch(() => {});
    await logUserAction(actingUser, { actionType: 'field_work_file_uploaded', recordType: 'field_work', recordId: fieldWorkId, description: `You uploaded ${file.name} on field work ${ref}` });
  }

  // One button/one request does both: confirming arrival or completion also flips the
  // engineer's own status (on_site / completed), reusing the exact same transition
  // updateFieldWorkStatus already does for the status dropdown — no separate second call needed.
  if (!supervisor) {
    if (updateType === 'arrival') {
      await updateFieldWorkStatus(fieldWorkId, 'on_site', actingUser).catch(() => {});
    } else if (updateType === 'departure') {
      await updateFieldWorkStatus(fieldWorkId, 'completed', actingUser).catch(() => {});
    }
  }

  return inserted.rows[0];
}

export async function resolveUnitRoleUserIds(roles) {
  const result = await pool.query(
    `SELECT id, main_role, role, units, unit FROM users WHERE deleted_at IS NULL AND (role = ANY($1::text[]) OR main_role = ANY($1::text[]))`,
    [roles]
  );
  return result.rows.map((r) => r.id);
}

export async function confirmFieldWork(fieldWorkId, actingUser, { confirmationType, notes, clientName, clientSignature, outcome = 'confirm' }) {
  await ensureFieldWorkTables();
  const fw = await pool.query(`SELECT * FROM field_work WHERE id = $1`, [fieldWorkId]);
  const fieldWork = fw.rows[0];
  if (!fieldWork) throw new Error('Field work not found');
  const ref = await sourceReferenceLabel(fieldWork.source_type, fieldWork.source_id);

  if (confirmationType === 'noc') {
    if (!isNocConfirmer(actingUser)) throw new Error('Only NOC staff can confirm field work completion');
    if (fieldWork.status !== 'completed') throw new Error('Field work must be marked complete by engineers before NOC can confirm it');

    if (outcome === 'reject') {
      await pool.query(`INSERT INTO field_work_confirmations (field_work_id, confirmation_type, confirmed_by_user_id, notes) VALUES ($1,'noc_rejected',$2,$3)`, [fieldWorkId, actingUser.id, notes || null]);
      await pool.query(`UPDATE field_work SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [fieldWorkId]);
      const engineerIds = (await pool.query(`SELECT user_id FROM field_work_engineers WHERE field_work_id = $1 AND removed_at IS NULL`, [fieldWorkId])).rows.map((r) => r.user_id);
      await notifyMany(engineerIds, 'Field Work Sent Back by NOC', `NOC sent back field work on ${ref}${notes ? `: ${notes}` : '.'}`, actingUser.id, { linkUrl: '/staff/field/my-field-work', notificationType: 'field_work_noc_rejected' });
      return getFieldWorkDetail(fieldWorkId);
    }

    await pool.query(`INSERT INTO field_work_confirmations (field_work_id, confirmation_type, confirmed_by_user_id, notes) VALUES ($1,'noc',$2,$3)`, [fieldWorkId, actingUser.id, notes || null]);
    await pool.query(`UPDATE field_work SET status = 'noc_confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [fieldWorkId]);
    await recordTimingEvent({ workflowType: 'field_work', recordId: fieldWorkId, eventType: 'noc_confirmed', stageName: 'awaiting_client', toUnitSlug: 'ts', triggeredByUserId: actingUser.id }).catch(() => {});
    await logUserAction(actingUser, { actionType: 'field_work_noc_confirmed', recordType: 'field_work', recordId: fieldWorkId, description: `You confirmed field work on ${ref}` });
    const supervisorIds = await resolveUnitRoleUserIds(['ts_supervisor', 'ts_manager']);
    await notifyMany(supervisorIds, 'NOC Confirmed Field Work', `NOC has confirmed field work on ${ref} — awaiting client confirmation.`, actingUser.id, { linkUrl: recordViewPath('field_work', fieldWorkId), notificationType: 'field_work_noc_confirmed' });
    return getFieldWorkDetail(fieldWorkId);
  }

  if (confirmationType === 'client') {
    if (!isFieldWorkSupervisor(actingUser)) throw new Error('Only the supervisor can record client confirmation');
    if (fieldWork.status !== 'noc_confirmed') throw new Error('NOC must confirm field work before client confirmation can be recorded');
    if (!clientName || !String(clientName).trim()) throw new Error('Client name is required');

    await pool.query(
      `INSERT INTO field_work_confirmations (field_work_id, confirmation_type, confirmed_by_user_id, client_name, client_signature, notes)
       VALUES ($1,'client',$2,$3,$4,$5)`,
      [fieldWorkId, actingUser.id, String(clientName).trim(), clientSignature || null, notes || null]
    );
    await pool.query(`UPDATE field_work SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [fieldWorkId]);
    await recordTimingEvent({ workflowType: 'field_work', recordId: fieldWorkId, eventType: 'completed', stageName: 'closed', toUnitSlug: null, triggeredByUserId: actingUser.id }).catch(() => {});
    await logUserAction(actingUser, { actionType: 'field_work_client_confirmed', recordType: 'field_work', recordId: fieldWorkId, description: `You recorded client confirmation for field work on ${ref}` });

    const ownerId = await sourceOwnerUserId(fieldWork.source_type, fieldWork.source_id);
    await notifyMany([actingUser.id, ownerId], 'Field Work Fully Confirmed', `Field work on ${ref} has been fully confirmed and closed.`, actingUser.id, { linkUrl: recordViewPath('field_work', fieldWorkId), notificationType: 'field_work_client_confirmed' });

    await advanceSourceToNextStage(fieldWork, actingUser).catch((e) => console.warn('[field-work] source advance failed:', e.message));
    return getFieldWorkDetail(fieldWorkId);
  }

  throw new Error('confirmation_type must be noc or client');
}

/** Moves the originating ticket/service request forward using the SAME existing transition logic already used elsewhere — never a new status machine. */
async function advanceSourceToNextStage(fieldWork, actingUser) {
  if (fieldWork.source_type === 'service_request') {
    const current = await pool.query(`SELECT current_stage FROM project_requests WHERE id = $1`, [fieldWork.source_id]);
    if (current.rows[0]?.current_stage === 'ts') {
      await tsAcceptRequest(fieldWork.source_id, actingUser, 'project');
    }
  } else if (fieldWork.source_type === 'ticket') {
    await pool.query(`UPDATE tickets SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status NOT IN ('RESOLVED','CLOSED')`, [fieldWork.source_id]);
    await pool.query(
      `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
       VALUES ($1,'STATUS_CHANGE','Marked resolved automatically — linked field work was confirmed by the client.','internal',$2,$3,$4)`,
      [fieldWork.source_id, actingUser.id, actingUser.main_role || actingUser.role || null, actingUser.full_name || actingUser.username]
    );
  }
}

export { FIELD_WORK_STATUSES, ENGINEER_STATUSES };
