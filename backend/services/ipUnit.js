import pool from '../db.js';
import { createNotification } from '../db.js';
import { logUserAction, recordViewPath } from './activityLog.js';
import { recordTimingEvent } from './workflowTimeEngine.js';
import { isSystemAdminAccount, userHasAnyRole, effectiveUnitsForUser } from '../roles.js';
import { formatPersonName } from '../utils/displayName.js';

/**
 * IP Unit — circuit inventory + circuit request workflow for the IP engineering team.
 * A first-class module (not part of Ticketing): ip_circuits is the source of truth,
 * ip_circuit_requests is the intake/approval workflow that feeds approved circuits into it.
 * Reuses the shared workflow time engine, reference-linking, activity log, and notifications
 * exactly like backend/services/fieldWork.js does — no new plumbing invented here.
 */

let tableReady = false;
export async function ensureIpUnitTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ip_circuits (
      id SERIAL PRIMARY KEY,
      circuit_id VARCHAR(60) NOT NULL,
      client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      site_id INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL,
      pop_id INTEGER,
      pop_name VARCHAR(255),
      region VARCHAR(100),
      service_type VARCHAR(30) NOT NULL,
      capacity VARCHAR(40),
      vlan VARCHAR(20),
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','available','inactive','decommissioned')),
      notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ip_circuits_circuit_id_uidx ON ip_circuits (UPPER(circuit_id));
    CREATE INDEX IF NOT EXISTS ip_circuits_status_idx ON ip_circuits(status);
    CREATE INDEX IF NOT EXISTS ip_circuits_client_idx ON ip_circuits(client_id);
    CREATE INDEX IF NOT EXISTS ip_circuits_created_at_idx ON ip_circuits(created_at DESC);

    CREATE TABLE IF NOT EXISTS ip_circuit_id_sequences (
      service_type_code VARCHAR(20) PRIMARY KEY,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ip_circuit_history (
      id SERIAL PRIMARY KEY,
      circuit_id INTEGER NOT NULL REFERENCES ip_circuits(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_by_name TEXT,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ip_circuit_history_circuit_idx ON ip_circuit_history(circuit_id, changed_at DESC);

    CREATE TABLE IF NOT EXISTS ip_circuit_attachments (
      id SERIAL PRIMARY KEY,
      circuit_id INTEGER NOT NULL REFERENCES ip_circuits(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      uploader_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ip_circuit_attachments_circuit_idx ON ip_circuit_attachments(circuit_id);

    CREATE TABLE IF NOT EXISTS ip_circuit_requests (
      id SERIAL PRIMARY KEY,
      requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      requested_by_name VARCHAR(255),
      requested_by_department VARCHAR(120),
      client_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      site_id INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL,
      pop_id INTEGER,
      pop_name VARCHAR(255),
      region VARCHAR(100),
      service_type VARCHAR(30) NOT NULL,
      capacity VARCHAR(40),
      vlan VARCHAR(20),
      purpose TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted','circuit_generated','added_to_inventory','returned_to_requester','rejected')),
      generated_circuit_id INTEGER REFERENCES ip_circuits(id) ON DELETE SET NULL,
      reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ip_circuit_requests_status_idx ON ip_circuit_requests(status);
    CREATE INDEX IF NOT EXISTS ip_circuit_requests_requester_idx ON ip_circuit_requests(requested_by_user_id);
    CREATE INDEX IF NOT EXISTS ip_circuit_requests_created_at_idx ON ip_circuit_requests(created_at DESC);
  `);
  // 360° Service Request Flow — which SR (if any) prompted this circuit request, so
  // generating the circuit can auto-link it back via linked_references (ALTER since
  // CREATE TABLE IF NOT EXISTS above is a no-op once the table already exists).
  await pool.query(`ALTER TABLE ip_circuit_requests ADD COLUMN IF NOT EXISTS source_service_request_id INTEGER REFERENCES project_requests(id) ON DELETE SET NULL;`);
  tableReady = true;
}

// ---------------------------------------------------------------------------
// Permissions — composed entirely from existing role helpers (backend/roles.js).
// ---------------------------------------------------------------------------

// "IP Manager"/"IP Supervisor" is frequently represented as free-text `position` on real
// seeded users rather than a role slug (same convention Sidebar.tsx already relies on for
// isIpUser) — checking role slugs alone silently locks out real managers, so both are checked.
function hasIpManagerPosition(user) {
  const position = String(user?.position || '').trim().toLowerCase();
  return position === 'ip manager' || position === 'ip supervisor';
}

export function canUseIpUnit(user) {
  if (isSystemAdminAccount(user) || userHasAnyRole(user, ['ip', 'ip_manager', 'ip_supervisor', 'director', 'cto'])) return true;
  if (hasIpManagerPosition(user)) return true;
  return effectiveUnitsForUser(user).includes('ip');
}

export function canManageIpUnit(user) {
  if (isSystemAdminAccount(user) || userHasAnyRole(user, ['ip_manager', 'ip_supervisor', 'director', 'cto'])) return true;
  return hasIpManagerPosition(user);
}

// ---------------------------------------------------------------------------
// Circuit ID generation — VOB-{SERVICE}-{000000}, editable but validated/unique on save.
// The sequence table only ever advances (peek on preview, bump-to-watermark on save), so a
// user typing a custom ID never breaks future auto-suggestions.
// ---------------------------------------------------------------------------

export function serviceTypeCode(serviceType) {
  const code = String(serviceType || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.slice(0, 10) || 'GEN';
}

function formatCircuitId(code, seq) {
  return `VOB-${code}-${String(seq).padStart(6, '0')}`;
}

export async function previewNextCircuitId(serviceType) {
  await ensureIpUnitTables();
  const code = serviceTypeCode(serviceType);
  const res = await pool.query(
    `INSERT INTO ip_circuit_id_sequences (service_type_code, last_seq) VALUES ($1, 0)
     ON CONFLICT (service_type_code) DO UPDATE SET service_type_code = EXCLUDED.service_type_code
     RETURNING last_seq`,
    [code]
  );
  return formatCircuitId(code, (res.rows[0]?.last_seq || 0) + 1);
}

const CIRCUIT_ID_PATTERN = /^VOB-[A-Z0-9]+-(\d{6})$/;

async function validateAndReserveCircuitId(circuitId, serviceType) {
  const clean = String(circuitId || '').trim().toUpperCase();
  if (!clean) throw new Error('Circuit ID is required');
  const existing = await pool.query(`SELECT id FROM ip_circuits WHERE UPPER(circuit_id) = $1`, [clean]);
  if (existing.rowCount > 0) throw new Error('Circuit ID already exists — choose a different one');

  const match = clean.match(CIRCUIT_ID_PATTERN);
  if (match) {
    const code = serviceTypeCode(serviceType);
    const seq = Number(match[1]);
    await pool.query(
      `INSERT INTO ip_circuit_id_sequences (service_type_code, last_seq) VALUES ($1, $2)
       ON CONFLICT (service_type_code) DO UPDATE SET last_seq = GREATEST(ip_circuit_id_sequences.last_seq, EXCLUDED.last_seq)`,
      [code, seq]
    );
  }
  return clean;
}

// ---------------------------------------------------------------------------
// History + linking helpers
// ---------------------------------------------------------------------------

async function recordCircuitHistory(circuitId, fieldName, oldValue, newValue, actingUser) {
  await pool.query(
    `INSERT INTO ip_circuit_history (circuit_id, field_name, old_value, new_value, changed_by, changed_by_name)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [circuitId, fieldName, oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue), actingUser?.id || null, formatPersonName(actingUser, actingUser?.username || 'System')]
  );
}

async function notifyMany(userIds, title, message, actorId, opts) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  await Promise.all(unique.map((uid) => createNotification(title, message, actorId, { ...opts, targetUserId: uid }).catch(() => {})));
}

async function ipManagerUserIds() {
  const roleList = ['ip_manager', 'ip_supervisor'];
  try {
    const res = await pool.query(
      `SELECT id FROM users WHERE deleted_at IS NULL AND (
         LOWER(COALESCE(role,'')) = ANY($1) OR LOWER(COALESCE(main_role,'')) = ANY($1) OR roles ?| $1
       )`,
      [roleList]
    );
    return res.rows.map((r) => r.id);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Circuits — Inventory (source of truth) + Add Circuit + Circuit Profile
// ---------------------------------------------------------------------------

const CIRCUIT_LIST_SELECT = `
  SELECT c.*, COALESCE(cu.customer_name, cu.contact_person) AS client_name,
         cs.site_name, cs.region AS site_region
  FROM ip_circuits c
  LEFT JOIN customers cu ON cu.id = c.client_id
  LEFT JOIN customer_sites cs ON cs.id = c.site_id
`;

export async function listCircuits({ q, status, clientId, popId, serviceType } = {}) {
  await ensureIpUnitTables();
  const clauses = ['c.deleted_at IS NULL'];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(c.circuit_id ILIKE $${params.length} OR cu.customer_name ILIKE $${params.length} OR cu.contact_person ILIKE $${params.length} OR cs.site_name ILIKE $${params.length})`);
  }
  if (status) { params.push(status); clauses.push(`c.status = $${params.length}`); }
  if (clientId) { params.push(Number(clientId)); clauses.push(`c.client_id = $${params.length}`); }
  if (popId) { params.push(Number(popId)); clauses.push(`c.pop_id = $${params.length}`); }
  if (serviceType) { params.push(serviceType); clauses.push(`c.service_type = $${params.length}`); }

  const result = await pool.query(
    `${CIRCUIT_LIST_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY c.created_at DESC LIMIT 500`,
    params
  );
  return result.rows;
}

export async function getCircuitDetail(id) {
  await ensureIpUnitTables();
  const row = await pool.query(`${CIRCUIT_LIST_SELECT} WHERE c.id = $1`, [id]);
  const circuit = row.rows[0];
  if (!circuit) return null;

  const [history, attachments, linkedRefs] = await Promise.all([
    pool.query(`SELECT * FROM ip_circuit_history WHERE circuit_id = $1 ORDER BY changed_at DESC`, [id]),
    pool.query(`SELECT * FROM ip_circuit_attachments WHERE circuit_id = $1 ORDER BY created_at DESC`, [id]),
    pool.query(
      `SELECT * FROM linked_references WHERE (source_record_type='ip_circuit' AND source_record_id=$1) OR (linked_record_type='ip_circuit' AND linked_record_id=$1) ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  return {
    ...circuit,
    history: history.rows,
    attachments: attachments.rows,
    linkedReferences: linkedRefs.rows,
  };
}

/** Mirrors fieldWork.js's linkFieldWorkToSource() — records the SR that prompted this circuit
 *  (360° Service Request Flow) so it shows up in the SR's LinkedReferencesSection. Never throws. */
async function linkCircuitToServiceRequest(circuitId, serviceRequestId, actingUser) {
  if (!serviceRequestId) return;
  try {
    const { getRecordSummary } = await import('./referenceRegistry.js');
    const summary = await getRecordSummary('ip_circuit', circuitId);
    if (!summary) return;
    await pool.query(
      `INSERT INTO linked_references
         (source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status, created_by_user_id)
       VALUES ('service_request',$1,$2,$3,$4,$5,$6,$7)`,
      [Number(serviceRequestId), summary.type, summary.id, summary.referenceNumber, summary.title, summary.status, actingUser.id]
    );
  } catch (e) {
    console.warn('[ip-unit] failed to link circuit to service request:', e.message);
  }
}

export async function createCircuit(payload, actingUser) {
  await ensureIpUnitTables();
  const {
    circuit_id: circuitIdInput, client_id: clientId, site_id: siteId,
    pop_id: popId, pop_name: popName, region,
    service_type: serviceType, capacity, vlan, notes,
    status = 'active', service_request_id: serviceRequestId,
  } = payload;

  if (!clientId) throw new Error('Client is required');
  if (!siteId) throw new Error('Site is required');
  if (!serviceType || !String(serviceType).trim()) throw new Error('Service type is required');
  if (!['active', 'available', 'inactive', 'decommissioned'].includes(status)) throw new Error('Invalid status');

  const suggested = circuitIdInput && String(circuitIdInput).trim() ? circuitIdInput : await previewNextCircuitId(serviceType);
  const circuitId = await validateAndReserveCircuitId(suggested, serviceType);

  const inserted = await pool.query(
    `INSERT INTO ip_circuits (circuit_id, client_id, site_id, pop_id, pop_name, region, service_type, capacity, vlan, status, notes, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [circuitId, Number(clientId), Number(siteId), popId ? Number(popId) : null, popName || null, region || null, String(serviceType).trim(), capacity || null, vlan || null, status, notes || null, actingUser.id]
  );
  const circuit = inserted.rows[0];

  await recordCircuitHistory(circuit.id, 'Created', null, `${circuitId} (${status})`, actingUser);
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_created', recordType: 'ip_circuit', recordId: circuit.id, recordRef: circuit.circuit_id,
    description: `You added circuit ${circuit.circuit_id} to the IP Unit inventory`,
  });
  if (serviceRequestId) await linkCircuitToServiceRequest(circuit.id, serviceRequestId, actingUser);

  return getCircuitDetail(circuit.id);
}

const CIRCUIT_EDITABLE_FIELDS = {
  service_type: 'Service Type', capacity: 'Capacity', vlan: 'VLAN',
  client_id: 'Client', site_id: 'Site', pop_id: 'POP', pop_name: 'POP', region: 'Region', notes: 'Notes',
};

export async function updateCircuit(id, patch, actingUser) {
  await ensureIpUnitTables();
  const current = await pool.query(`SELECT * FROM ip_circuits WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!current.rowCount) throw new Error('Circuit not found');
  const row = current.rows[0];

  const updates = [];
  const values = [];
  const historyEntries = [];

  for (const [field, label] of Object.entries(CIRCUIT_EDITABLE_FIELDS)) {
    if (!(field in patch)) continue;
    const newValue = patch[field] === '' ? null : patch[field];
    if (String(row[field] ?? '') === String(newValue ?? '')) continue;
    values.push(newValue);
    updates.push(`${field} = $${values.length}`);
    historyEntries.push({ field: label, oldValue: row[field], newValue });
  }

  if (patch.status && patch.status !== row.status) {
    if (['inactive', 'decommissioned'].includes(patch.status) && !canManageIpUnit(actingUser)) {
      throw new Error('Only an IP Manager/Supervisor can decommission or deactivate a circuit');
    }
    if (!['active', 'available', 'inactive', 'decommissioned'].includes(patch.status)) throw new Error('Invalid status');
    values.push(patch.status);
    updates.push(`status = $${values.length}`);
    historyEntries.push({ field: 'Status', oldValue: row.status, newValue: patch.status });
  }

  if (!updates.length) return getCircuitDetail(id);

  values.push(id);
  await pool.query(`UPDATE ip_circuits SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`, values);
  for (const h of historyEntries) await recordCircuitHistory(id, h.field, h.oldValue, h.newValue, actingUser);

  await logUserAction(actingUser, {
    actionType: 'ip_circuit_updated', recordType: 'ip_circuit', recordId: id, recordRef: row.circuit_id,
    description: `You updated ${row.circuit_id} (${historyEntries.map((h) => h.field).join(', ')})`,
  });

  return getCircuitDetail(id);
}

export async function getCircuitDashboardStats() {
  await ensureIpUnitTables();
  const stats = await pool.query(`
    SELECT
      count(*) FILTER (WHERE status = 'active' AND deleted_at IS NULL) AS active_circuits,
      count(*) FILTER (WHERE status = 'available' AND deleted_at IS NULL) AS available_ids,
      count(*) FILTER (WHERE deleted_at IS NULL AND created_at::date = CURRENT_DATE) AS added_today
    FROM ip_circuits
  `);
  const pending = await pool.query(
    `SELECT count(*) AS pending_requests FROM ip_circuit_requests WHERE status NOT IN ('returned_to_requester','rejected')`
  );
  return {
    activeCircuits: Number(stats.rows[0].active_circuits) || 0,
    availableIds: Number(stats.rows[0].available_ids) || 0,
    addedToday: Number(stats.rows[0].added_today) || 0,
    pendingRequests: Number(pending.rows[0].pending_requests) || 0,
  };
}

export async function getRecentIpActivity(limit = 10) {
  const res = await pool.query(
    `SELECT a.id, a.action_type, a.description, a.record_type, a.record_id, a.created_at,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, 'System') AS actor_name
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.record_type IN ('ip_circuit', 'ip_circuit_request')
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function getReportsSummary({ dateFrom, dateTo } = {}) {
  await ensureIpUnitTables();
  const clauses = ['deleted_at IS NULL'];
  const params = [];
  if (dateFrom) { params.push(dateFrom); clauses.push(`created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`created_at <= $${params.length}`); }
  const where = clauses.join(' AND ');

  const [byStatus, byService, total] = await Promise.all([
    pool.query(`SELECT status, count(*) AS total FROM ip_circuits WHERE ${where} GROUP BY status ORDER BY total DESC`, params),
    pool.query(`SELECT service_type, count(*) AS total FROM ip_circuits WHERE ${where} GROUP BY service_type ORDER BY total DESC`, params),
    pool.query(`SELECT count(*) AS total FROM ip_circuits WHERE ${where}`, params),
  ]);
  return { byStatus: byStatus.rows, byServiceType: byService.rows, total: Number(total.rows[0]?.total) || 0 };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export async function listCircuitAttachments(circuitId) {
  const res = await pool.query(`SELECT * FROM ip_circuit_attachments WHERE circuit_id = $1 ORDER BY created_at DESC`, [circuitId]);
  return res.rows;
}

export async function addCircuitAttachment(circuitId, actingUser, { filePath, fileName, mimeType }) {
  await ensureIpUnitTables();
  const circuit = await pool.query(`SELECT id, circuit_id FROM ip_circuits WHERE id = $1 AND deleted_at IS NULL`, [circuitId]);
  if (!circuit.rowCount) throw new Error('Circuit not found');

  const inserted = await pool.query(
    `INSERT INTO ip_circuit_attachments (circuit_id, user_id, uploader_name, file_path, file_name, mime_type)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [circuitId, actingUser.id, formatPersonName(actingUser, actingUser.username), filePath, fileName, mimeType || null]
  );
  await recordCircuitHistory(circuitId, 'Attachment', null, fileName, actingUser);
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_file_uploaded', recordType: 'ip_circuit', recordId: Number(circuitId), recordRef: circuit.rows[0].circuit_id,
    description: `You uploaded "${fileName}" to circuit ${circuit.rows[0].circuit_id}`,
  });
  return inserted.rows[0];
}

export async function getAttachmentForDownload(attachmentId) {
  const res = await pool.query(`SELECT * FROM ip_circuit_attachments WHERE id = $1`, [attachmentId]);
  return res.rows[0] || null;
}

export async function deleteCircuitAttachment(attachmentId, actingUser) {
  const res = await pool.query(`SELECT * FROM ip_circuit_attachments WHERE id = $1`, [attachmentId]);
  const attachment = res.rows[0];
  if (!attachment) throw new Error('Attachment not found');
  if (attachment.user_id !== actingUser.id && !canManageIpUnit(actingUser)) {
    throw new Error('Only the uploader or an IP Manager/Supervisor can delete this attachment');
  }
  await pool.query(`DELETE FROM ip_circuit_attachments WHERE id = $1`, [attachmentId]);
  return attachment;
}

// ---------------------------------------------------------------------------
// Circuit Requests — Submitted → IP Manager → Circuit Generated → Added to Inventory →
// Returned to Requester. IP-Unit-only end to end: a request submitted "for another
// department" is logged by an IP Unit member on the requester's behalf.
// ---------------------------------------------------------------------------

const REQUEST_LIST_SELECT = `
  SELECT r.*, COALESCE(cu.customer_name, cu.contact_person) AS client_name, cs.site_name,
         COALESCE(NULLIF(trim(concat_ws(' ', ru.first_name, ru.last_name)), ''), ru.username) AS requested_by_user_name,
         COALESCE(NULLIF(trim(concat_ws(' ', lu.first_name, lu.last_name)), ''), lu.username) AS logged_by_name
  FROM ip_circuit_requests r
  LEFT JOIN customers cu ON cu.id = r.client_id
  LEFT JOIN customer_sites cs ON cs.id = r.site_id
  LEFT JOIN users ru ON ru.id = r.requested_by_user_id
  LEFT JOIN users lu ON lu.id = r.created_by_user_id
`;

export async function listCircuitRequests({ status } = {}) {
  await ensureIpUnitTables();
  const clauses = ['1=1'];
  const params = [];
  if (status) { params.push(status); clauses.push(`r.status = $${params.length}`); }
  const result = await pool.query(`${REQUEST_LIST_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY r.created_at DESC LIMIT 500`, params);
  return result.rows;
}

export async function getCircuitRequestDetail(id) {
  await ensureIpUnitTables();
  const row = await pool.query(`${REQUEST_LIST_SELECT} WHERE r.id = $1`, [id]);
  const request = row.rows[0];
  if (!request) return null;
  const { getRecordTurnaround } = await import('./workflowTimeEngine.js');
  const turnaround = await getRecordTurnaround('ip_circuit_request', id).catch(() => null);
  return { ...request, turnaround };
}

export async function createCircuitRequest(payload, actingUser) {
  await ensureIpUnitTables();
  const {
    requested_by_user_id: requestedByUserId, requested_by_name: requestedByName, requested_by_department: requestedByDepartment,
    client_id: clientId, site_id: siteId, pop_id: popId, pop_name: popName, region,
    service_type: serviceType, capacity, vlan, purpose, source_service_request_id: sourceServiceRequestId,
  } = payload;

  if (!requestedByUserId && !requestedByName) throw new Error('Requested By is required — pick a staff member or enter a name');
  if (!clientId) throw new Error('Client is required');
  if (!siteId) throw new Error('Site is required');
  if (!serviceType || !String(serviceType).trim()) throw new Error('Service type is required');

  const inserted = await pool.query(
    `INSERT INTO ip_circuit_requests
       (requested_by_user_id, requested_by_name, requested_by_department, client_id, site_id, pop_id, pop_name, region, service_type, capacity, vlan, purpose, created_by_user_id, source_service_request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      requestedByUserId ? Number(requestedByUserId) : null, requestedByName || null, requestedByDepartment || null,
      Number(clientId), Number(siteId), popId ? Number(popId) : null, popName || null, region || null,
      String(serviceType).trim(), capacity || null, vlan || null, purpose || null, actingUser.id,
      sourceServiceRequestId ? Number(sourceServiceRequestId) : null,
    ]
  );
  const request = inserted.rows[0];

  await recordTimingEvent({
    workflowType: 'ip_circuit_request', recordId: request.id, eventType: 'created', stageName: 'ip_manager',
    toUnitSlug: 'ip', triggeredByUserId: actingUser.id,
  }).catch(() => {});
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_request_created', recordType: 'ip_circuit_request', recordId: request.id,
    description: `You logged a circuit request for ${requestedByName || 'a staff member'}${requestedByDepartment ? ` (${requestedByDepartment})` : ''}`,
  });

  const managers = await ipManagerUserIds();
  await notifyMany(managers, 'New Circuit Request', `A new circuit request is awaiting review.`, actingUser.id, {
    linkUrl: recordViewPath('ip_circuit_request', request.id), notificationType: 'ip_circuit_request_submitted',
  });

  return getCircuitRequestDetail(request.id);
}

export async function generateCircuitFromRequest(id, actingUser, { circuitId } = {}) {
  if (!canManageIpUnit(actingUser)) throw new Error('Only an IP Manager/Supervisor can generate a circuit for this request');
  await ensureIpUnitTables();
  const current = await pool.query(`SELECT * FROM ip_circuit_requests WHERE id = $1`, [id]);
  if (!current.rowCount) throw new Error('Circuit request not found');
  const request = current.rows[0];
  if (request.status !== 'submitted') throw new Error('This request has already been reviewed');

  const circuit = await createCircuit(
    {
      circuit_id: circuitId, client_id: request.client_id, site_id: request.site_id,
      pop_id: request.pop_id, pop_name: request.pop_name, region: request.region,
      service_type: request.service_type, capacity: request.capacity, vlan: request.vlan,
      notes: request.purpose ? `From circuit request #${request.id}: ${request.purpose}` : null,
      status: 'active',
      service_request_id: request.source_service_request_id || null,
    },
    actingUser
  );

  await pool.query(
    `UPDATE ip_circuit_requests SET status='added_to_inventory', generated_circuit_id=$1, reviewed_by_user_id=$2, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
    [circuit.id, actingUser.id, id]
  );
  await recordCircuitHistory(circuit.id, 'Linked to Circuit Request', null, `Circuit Request #${id}`, actingUser);

  await recordTimingEvent({
    workflowType: 'ip_circuit_request', recordId: id, eventType: 'generated', stageName: 'awaiting_return',
    toUnitSlug: 'ip', toUserId: request.requested_by_user_id || null, triggeredByUserId: actingUser.id,
    attributeToUserId: actingUser.id,
  }).catch(() => {});
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_request_generated', recordType: 'ip_circuit_request', recordId: id,
    description: `You generated circuit ${circuit.circuit_id} for this request and added it to inventory`,
  });

  return getCircuitRequestDetail(id);
}

export async function returnCircuitRequest(id, actingUser, notes) {
  if (!canManageIpUnit(actingUser)) throw new Error('Only an IP Manager/Supervisor can return this request');
  await ensureIpUnitTables();
  const current = await pool.query(`SELECT * FROM ip_circuit_requests WHERE id = $1`, [id]);
  if (!current.rowCount) throw new Error('Circuit request not found');
  const request = current.rows[0];
  if (request.status !== 'added_to_inventory') throw new Error('This request has not had a circuit generated yet');

  await pool.query(
    `UPDATE ip_circuit_requests SET status='returned_to_requester', review_notes=COALESCE($1, review_notes), updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
    [notes || null, id]
  );
  await recordTimingEvent({
    workflowType: 'ip_circuit_request', recordId: id, eventType: 'completed', triggeredByUserId: actingUser.id,
  }).catch(() => {});
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_request_returned', recordType: 'ip_circuit_request', recordId: id,
    description: `You returned this circuit request to the requester`,
  });

  const notifyTargets = request.requested_by_user_id ? [request.requested_by_user_id] : [request.created_by_user_id];
  await notifyMany(notifyTargets, 'Circuit Request Approved', `Your circuit request has been fulfilled — the circuit is ready.`, actingUser.id, {
    linkUrl: request.generated_circuit_id ? recordViewPath('ip_circuit', request.generated_circuit_id) : recordViewPath('ip_circuit_request', id),
    notificationType: 'ip_circuit_request_returned',
  });

  return getCircuitRequestDetail(id);
}

export async function rejectCircuitRequest(id, actingUser, notes) {
  if (!canManageIpUnit(actingUser)) throw new Error('Only an IP Manager/Supervisor can reject this request');
  await ensureIpUnitTables();
  const current = await pool.query(`SELECT * FROM ip_circuit_requests WHERE id = $1`, [id]);
  if (!current.rowCount) throw new Error('Circuit request not found');
  const request = current.rows[0];
  if (['returned_to_requester', 'rejected'].includes(request.status)) throw new Error('This request is already closed');

  await pool.query(
    `UPDATE ip_circuit_requests SET status='rejected', review_notes=COALESCE($1, review_notes), reviewed_by_user_id=$2, reviewed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
    [notes || null, actingUser.id, id]
  );
  await recordTimingEvent({
    workflowType: 'ip_circuit_request', recordId: id, eventType: 'rejected', triggeredByUserId: actingUser.id,
  }).catch(() => {});
  await logUserAction(actingUser, {
    actionType: 'ip_circuit_request_rejected', recordType: 'ip_circuit_request', recordId: id,
    description: `You rejected this circuit request${notes ? `: ${notes}` : ''}`,
  });

  const notifyTargets = request.requested_by_user_id ? [request.requested_by_user_id] : [request.created_by_user_id];
  await notifyMany(notifyTargets, 'Circuit Request Rejected', notes || 'Your circuit request was rejected.', actingUser.id, {
    linkUrl: recordViewPath('ip_circuit_request', id), notificationType: 'ip_circuit_request_rejected',
  });

  return getCircuitRequestDetail(id);
}

// ---------------------------------------------------------------------------
// Lookups — client/site/POP/staff search (mirrors backend/routes/fieldWork.js:97-119)
// ---------------------------------------------------------------------------

export async function searchClients(q) {
  const params = [];
  let where = 'WHERE deleted_at IS NULL';
  if (q) { params.push(`%${q}%`); where += ` AND (customer_name ILIKE $1 OR contact_person ILIKE $1 OR customer_code ILIKE $1)`; }
  const rows = await pool.query(
    `SELECT id, COALESCE(customer_name, contact_person) AS name, customer_code FROM customers ${where} ORDER BY name LIMIT 20`,
    params
  );
  return rows.rows;
}

export async function searchSites(q) {
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = `WHERE site_name ILIKE $1 OR site_address ILIKE $1`; }
  const rows = await pool.query(`SELECT id, site_name, site_address, region, customer_id FROM customer_sites ${where} ORDER BY site_name LIMIT 20`, params);
  return rows.rows;
}

// pop_id/pop_name/region are stored directly on ip_circuits/ip_circuit_requests rather than
// a hard FK — the `pops` table only exists once Network Assets has been visited at least once
// (it's created lazily there), so this stays a soft reference to avoid a cross-module boot
// dependency. Falls back to an empty list if that table doesn't exist yet.
export async function searchPops(q) {
  try {
    const params = [];
    let where = 'WHERE p.deleted_at IS NULL';
    if (q) { params.push(`%${q}%`); where += ` AND p.location_name ILIKE $1`; }
    const rows = await pool.query(
      `SELECT p.id, p.location_name, r.name AS region FROM pops p LEFT JOIN regions r ON r.id = p.region_id ${where} ORDER BY p.location_name LIMIT 20`,
      params
    );
    return rows.rows;
  } catch {
    return [];
  }
}

export async function searchStaff(q) {
  const params = [];
  let where = 'WHERE deleted_at IS NULL';
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (first_name ILIKE $1 OR last_name ILIKE $1 OR username ILIKE $1)`;
  }
  const rows = await pool.query(
    `SELECT id, COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), username) AS name, position
     FROM users ${where} ORDER BY name LIMIT 20`,
    params
  );
  return rows.rows;
}
