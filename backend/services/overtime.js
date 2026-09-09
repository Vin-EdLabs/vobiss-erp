import pool from '../db.js';
import { createNotification } from '../db.js';
import { sendPushToUserIds } from '../push/sendPush.js';
import { listTierCandidates, tierOfUser, unitsOfUser } from '../db/performanceReports.js';
import { emitToUser } from '../realtime/channels.js';
import { getEmployeeByUserId } from '../utils/hrShared.js';
import { isSystemAdminAccount } from '../roles.js';

/**
 * Overtime Payment Request & Authorization — Supervisor → Manager → HR → Finance, but a
 * submitter never routes to their own tier: a Supervisor's OT skips straight to Manager, a
 * Manager's skips both Supervisor and Manager and lands on HR — same principle as the Leave
 * flow (backend/services/leave.js's FLOW_STAGES), so nobody ever ends up waiting on "any peer
 * at my own level" to clear their own request. Built on the same unit+tier resolution machinery
 * as Leave (db/performanceReports.js), and every stage still behaves as a "queue" — if the
 * submitter's unit has a specific supervisor/manager, only they can act; otherwise anyone of
 * that tier can, so the chain can never get stuck.
 *
 * Nobody approves their own request — not a supervisor, not a CTO, nobody — they can only
 * watch it move through the chain like anyone else. The one exception is System Admin, who can
 * act at any stage of any request, including their own, as a break-glass override.
 */

// The full set of active (non-terminal) stages a request can ever sit at — used for validity
// checks. Which of these actually apply to a given request is resolved per-submitter by
// TIER_FLOW / resolveOTFlow below.
export const FLOW_STAGES = ['supervisor', 'manager', 'hr', 'finance'];

// Per-submitter-tier stage sequence. A tier never appears in its own flow.
const TIER_FLOW = {
  employee: ['supervisor', 'manager', 'hr', 'finance'],
  supervisor: ['manager', 'hr', 'finance'],
  manager: ['hr', 'finance'],
  cto: ['hr', 'finance'],
};

function resolveOTFlow(row) {
  return TIER_FLOW[row.submitter_tier] || TIER_FLOW.employee;
}

function isHrTier(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  return role === 'hr' || position === 'hr' || unitsOfUser(user).includes('hr');
}

function isFinanceTier(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  return role === 'finance' || role.endsWith('_finance') || position === 'finance' || unitsOfUser(user).includes('finance');
}

function isAdminTier(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  return ['admin', 'superadmin', 'system_admin', 'director', 'cto'].includes(role);
}

/** HR, Finance, and Admin all get full oversight visibility across every request. */
export function canViewAllRequests(user) {
  return isHrTier(user) || isFinanceTier(user) || isAdminTier(user);
}

function actorDisplayName(user) {
  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return name || user?.username || 'Staff';
}

async function notifyUsersPaired(userIds, title, message, linkUrl) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return;
  for (const uid of unique) {
    const notif = await createNotification(title, message, null, uid, linkUrl, 'overtime_request').catch(() => null);
    if (notif) {
      emitToUser(uid, 'staff:realtime', {
        topic: 'notifications',
        action: 'new',
        id: notif.id,
        title,
        body: message,
        url: linkUrl,
      });
    }
  }
  await sendPushToUserIds(unique, { title, body: message, data: { url: linkUrl, type: 'overtime_request' } }).catch(() => {});
}

async function listHrCandidateIds() {
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND (LOWER(main_role) = 'hr' OR LOWER(role) = 'hr' OR LOWER(position) = 'hr'
            OR LOWER(unit) = 'hr' OR units ?| ARRAY['hr'])`
  );
  return rows.map((r) => r.id);
}

async function listFinanceCandidateIds() {
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND (LOWER(main_role) = 'finance' OR LOWER(role) = 'finance' OR LOWER(position) = 'finance'
            OR LOWER(unit) = 'finance' OR units ?| ARRAY['finance'])`
  );
  return rows.map((r) => r.id);
}

/** Fallback when no single supervisor/manager was resolved at submission (unit has nobody,
 *  or several candidates) — notify everyone at that tier, company-wide, so the request is
 *  never silently invisible to whoever ends up acting on it. */
async function listGlobalTierCandidateIds(tier) {
  const suffix = tier === 'manager' ? '_manager' : '_supervisor';
  const word = tier === 'manager' ? 'manager' : 'supervisor';
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND ((LOWER(main_role) LIKE '%' || $1 OR LOWER(role) LIKE '%' || $1) OR LOWER(position) LIKE '%' || $2 || '%')`,
    [suffix, word]
  );
  return rows.map((r) => r.id);
}

async function notifyStageActors(row, stage, title, message) {
  let userIds = [];
  if (stage === 'supervisor') {
    userIds = row.supervisor_id ? [row.supervisor_id] : await listGlobalTierCandidateIds('supervisor');
  } else if (stage === 'manager') {
    userIds = row.manager_id ? [row.manager_id] : await listGlobalTierCandidateIds('manager');
  } else if (stage === 'hr') {
    userIds = await listHrCandidateIds();
  } else if (stage === 'finance') {
    userIds = await listFinanceCandidateIds();
  }
  // Never tell the submitter "this needs your action" — they're never allowed to act on their
  // own request, so a self-notification here would just be confusing.
  userIds = userIds.filter((id) => id !== row.staff_id);
  const linkUrl = `/hr/overtime/${row.id}`;
  await notifyUsersPaired(userIds, title, message, linkUrl);
}

async function notifySubmitterAndPriorActors(row, actingUserId, title, message) {
  const priorActors = await pool.query(
    `SELECT DISTINCT actor_id FROM ot_request_history WHERE ot_request_id = $1 AND actor_id IS NOT NULL AND actor_id != $2`,
    [row.id, actingUserId]
  );
  const ids = priorActors.rows.map((r) => r.actor_id);
  if (row.staff_id && row.staff_id !== actingUserId) ids.push(row.staff_id);
  await notifyUsersPaired(ids, title, message, `/hr-self/overtime/${row.id}`);
}

async function insertHistory(requestId, stage, user, action, reason, waitMinutes, extra = {}) {
  await pool.query(
    `INSERT INTO ot_request_history (ot_request_id, stage, actor_id, actor_name, action, reason, amount_paid, payment_method, waiting_duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [requestId, stage, user?.id || null, user ? actorDisplayName(user) : null, action, reason || null, extra.amountPaid || null, extra.paymentMethod || null, waitMinutes ?? null]
  );
}

async function computeWaitMinutes(requestId, submittedAt) {
  const prev = await pool.query(
    `SELECT acted_at FROM ot_request_history WHERE ot_request_id = $1 ORDER BY acted_at DESC LIMIT 1`,
    [requestId]
  );
  const since = prev.rows[0]?.acted_at || submittedAt;
  return Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60000));
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

function parseHours(startTime, endTime) {
  const [sh, sm] = String(startTime || '0:0').split(':').map(Number);
  const [eh, em] = String(endTime || '0:0').split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // overnight shift
  return Math.round((minutes / 60) * 100) / 100;
}

export async function submitOTRequest(user, payload) {
  const emp = await getEmployeeByUserId(user.id);
  const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
  if (tickets.length === 0) throw new Error('At least one ticket/site row is required');
  if (!String(payload.employeeSignature || '').trim()) throw new Error('Employee declaration signature is required');

  const category = String(payload.otCategory || '');
  if (!['emergency_fault', 'planned_maintenance', 'weekend_support', 'public_holiday_support'].includes(category)) {
    throw new Error('A valid OT category is required');
  }
  if (category === 'emergency_fault' && !tickets.some((t) => t.ticketType === 'fault_ticket' && String(t.ticketRef || '').trim())) {
    throw new Error('Emergency Fault requires at least one ticket row with a fault ticket reference');
  }
  if (category === 'planned_maintenance' && !tickets.some((t) => t.ticketType === 'work_order' && String(t.ticketRef || '').trim())) {
    throw new Error('Planned Maintenance requires at least one ticket row with a work order reference');
  }

  // Client/Site standardization — never trust client-supplied site/client text. When a row is
  // linked to a real system ticket, the ticket itself must already carry a Client and Site (the
  // system blocks submission and tells the user to fix the ticket first if not); when a row has
  // no linked ticket, the user must have searched and selected a real Site (never free text),
  // and its Client comes along with it automatically since every site belongs to exactly one
  // client.
  const resolvedTickets = [];
  for (const t of tickets) {
    let siteId = null;
    let siteName = null;
    let region = null;
    let digitalAddress = null;
    let clientId = null;
    let clientName = null;

    if (t.ticketId) {
      const tk = await pool.query('SELECT id, ticket_id, customer_id, site_id FROM tickets WHERE id = $1', [t.ticketId]);
      const ticketRow = tk.rows[0];
      if (!ticketRow) throw new Error('One of the selected tickets could not be found');
      if (!ticketRow.customer_id || !ticketRow.site_id) {
        throw new Error(`Ticket ${t.ticketRef || ticketRow.ticket_id} is missing a Client or Site — please update the ticket before using it for overtime.`);
      }
      const siteInfo = await pool.query(
        `SELECT s.id, s.site_name, s.region, s.site_address, c.id AS client_id, c.customer_name
         FROM customer_sites s JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`,
        [ticketRow.site_id]
      );
      const site = siteInfo.rows[0];
      if (!site) throw new Error(`Ticket ${t.ticketRef || ticketRow.ticket_id}'s site could not be found — please update the ticket.`);
      siteId = site.id; siteName = site.site_name; region = site.region; digitalAddress = site.site_address;
      clientId = site.client_id; clientName = site.customer_name;
    } else if (t.siteId) {
      const siteInfo = await pool.query(
        `SELECT s.id, s.site_name, s.region, s.site_address, c.id AS client_id, c.customer_name
         FROM customer_sites s JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`,
        [t.siteId]
      );
      const site = siteInfo.rows[0];
      if (!site) throw new Error('The selected site could not be found');
      siteId = site.id; siteName = site.site_name; region = site.region; digitalAddress = site.site_address;
      clientId = site.client_id; clientName = site.customer_name;
    } else {
      throw new Error('Every ticket/site row needs a Client and Site — search and select an existing ticket or site.');
    }

    resolvedTickets.push({
      ...t, siteId, siteName, region, digitalAddress, clientId, clientName,
      hoursWorked: t.hoursWorked != null ? Number(t.hoursWorked) : parseHours(t.startTime, t.endTime),
    });
  }
  const rows = resolvedTickets;
  const totalHours = rows.reduce((sum, t) => sum + (Number(t.hoursWorked) || 0), 0);

  const unit = unitsOfUser(user)[0] || null;
  // A submitter never routes to their own tier — a Supervisor's request skips straight to
  // Manager, a Manager's skips both and lands on HR. Only resolve supervisor/manager candidates
  // when that stage is actually part of this submitter's flow.
  const tier = tierOfUser(user);
  const flow = TIER_FLOW[tier] || TIER_FLOW.employee;
  const startStage = flow[0];

  // A submitter can never end up as their own approver — if they'd otherwise be the unit's
  // only supervisor/manager, that stage falls back to "any other supervisor/manager, company-wide"
  // (the same queue behavior used when a unit has nobody at that tier at all).
  let supervisorId = null;
  let managerId = null;
  if (flow.includes('supervisor')) {
    const supervisors = (await listTierCandidates(unit, 'supervisor')).filter((c) => c.id !== user.id);
    supervisorId = supervisors.length === 1 ? supervisors[0].id : null;
  }
  if (flow.includes('manager')) {
    const managers = (await listTierCandidates(unit, 'manager')).filter((c) => c.id !== user.id);
    managerId = managers.length === 1 ? managers[0].id : null;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO ot_requests (
         staff_id, staff_name, department, job_title, contact_number,
         ot_category, ot_rate_type, normal_shift_hours, total_ot_hours,
         employee_signature, declaration_date, supervisor_id, manager_id, current_stage, submitter_tier, company
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        user.id,
        emp?.full_name || actorDisplayName(user),
        emp?.department || null,
        emp?.position || null,
        emp?.phone || null,
        category,
        payload.otRateType || 'standard',
        payload.normalShiftHours || null,
        totalHours,
        String(payload.employeeSignature).trim(),
        supervisorId,
        managerId,
        startStage,
        tier,
        user.company || null,
      ]
    );
    const row = inserted.rows[0];

    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      await client.query(
        `INSERT INTO ot_request_tickets (
           ot_request_id, ticket_type, ticket_ref, ticket_id, site_id, site_name, region, digital_address,
           client_id, client_name, ot_date, day_type, start_time, end_time, hours_worked, work_summary, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          row.id, t.ticketType, t.ticketRef || null, t.ticketId || null, t.siteId || null, t.siteName || null, t.region || null, t.digitalAddress || null,
          t.clientId || null, t.clientName || null,
          t.otDate, t.dayType, t.startTime, t.endTime, t.hoursWorked, t.workSummary || null, i,
        ]
      );
    }

    await client.query('COMMIT');

    await insertHistory(row.id, 'submitted', user, 'submitted', null, null);
    const SUBMIT_VERB = { supervisor: 'verification', manager: 'sanction', hr: 'authorization' };
    await notifyStageActors(
      row, startStage, 'New Overtime Request',
      `${actorDisplayName(user)} submitted an overtime request (${totalHours}h) and needs your ${SUBMIT_VERB[startStage] || 'action'}.`
    );

    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function attachDocuments(requestId, documents) {
  for (const d of documents) {
    await pool.query(
      `INSERT INTO ot_request_documents (ot_request_id, ot_request_ticket_id, document_type, other_label, file_name, file_path, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [requestId, d.ticketRowId || null, d.documentType || 'other', d.otherLabel || null, d.fileName, d.filePath, d.fileSize || null, d.uploadedBy || null]
    );
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const REQUEST_SELECT = `
  SELECT r.*,
    (SELECT COUNT(*) FROM ot_request_tickets t WHERE t.ot_request_id = r.id) AS ticket_count,
    (SELECT COUNT(DISTINCT t.site_name) FROM ot_request_tickets t WHERE t.ot_request_id = r.id AND t.site_name IS NOT NULL) AS site_count
  FROM ot_requests r`;

export async function listMyRequests(user) {
  const { rows } = await pool.query(`${REQUEST_SELECT} WHERE r.staff_id = $1 ORDER BY r.created_at DESC`, [user.id]);
  return rows;
}

export async function listPendingForUser(user) {
  const tier = tierOfUser(user);
  const clauses = [];
  const params = [];
  let i = 1;
  params.push(user.id);
  clauses.push(`(r.current_stage = 'supervisor' AND (r.supervisor_id = $${i} OR (r.supervisor_id IS NULL AND ${tier === 'supervisor'})))`);
  i++;
  params.push(user.id);
  clauses.push(`(r.current_stage = 'manager' AND (r.manager_id = $${i} OR (r.manager_id IS NULL AND ${tier === 'manager'})))`);
  i++;
  if (isHrTier(user)) clauses.push(`r.current_stage = 'hr'`);
  if (isFinanceTier(user)) clauses.push(`r.current_stage = 'finance'`);
  // Never surface someone's own request in their own "pending on me" queue — they cannot act
  // on it regardless of tier, so it would just be a dead end. System Admin is exempt since they
  // genuinely can act on their own requests.
  const selfExclusion = isSystemAdminAccount(user) ? '' : `AND r.staff_id != $${i}`;
  if (selfExclusion) params.push(user.id);
  const { rows } = await pool.query(
    `${REQUEST_SELECT} WHERE (${clauses.join(' OR ')}) ${selfExclusion} ORDER BY r.submitted_at ASC`,
    params
  );
  return rows;
}

export async function listAllRequests({ status } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    params.push(status);
    clauses.push(`r.status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await pool.query(`${REQUEST_SELECT} ${where} ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`, params);
  return rows;
}

export async function getTicketsForRequest(requestId) {
  const { rows } = await pool.query(`SELECT * FROM ot_request_tickets WHERE ot_request_id = $1 ORDER BY sort_order ASC, id ASC`, [requestId]);
  return rows;
}

export async function getDocumentsForRequest(requestId) {
  const { rows } = await pool.query(`SELECT * FROM ot_request_documents WHERE ot_request_id = $1 ORDER BY uploaded_at ASC`, [requestId]);
  return rows;
}

export async function getHistoryForRequest(requestId) {
  const { rows } = await pool.query(`SELECT * FROM ot_request_history WHERE ot_request_id = $1 ORDER BY acted_at ASC`, [requestId]);
  return rows;
}

export async function getRequestDetail(requestId) {
  const { rows } = await pool.query(`${REQUEST_SELECT} WHERE r.id = $1`, [requestId]);
  const row = rows[0];
  if (!row) return null;
  const [tickets, documents, history] = await Promise.all([
    getTicketsForRequest(requestId),
    getDocumentsForRequest(requestId),
    getHistoryForRequest(requestId),
  ]);
  return { ...row, tickets, documents, history };
}

export async function canViewRequest(user, row) {
  if (row.staff_id === user.id) return true;
  if (canViewAllRequests(user)) return true;
  const history = await pool.query(`SELECT 1 FROM ot_request_history WHERE ot_request_id = $1 AND actor_id = $2 LIMIT 1`, [row.id, user.id]);
  if (history.rows.length > 0) return true;
  if (row.current_stage === 'supervisor' && (row.supervisor_id === user.id || (!row.supervisor_id && tierOfUser(user) === 'supervisor'))) return true;
  if (row.current_stage === 'manager' && (row.manager_id === user.id || (!row.manager_id && tierOfUser(user) === 'manager'))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Approval actions
// ---------------------------------------------------------------------------

async function assertActorAllowed(user, row, stage) {
  // System Admin is the one break-glass override — can act at any stage of any request,
  // including one they submitted themselves.
  if (isSystemAdminAccount(user)) return;
  if (user.id === row.staff_id) {
    throw new Error('You cannot approve your own request — this must be handled by someone else in the chain.');
  }
  if (stage === 'supervisor') {
    const allowed = row.supervisor_id ? row.supervisor_id === user.id : tierOfUser(user) === 'supervisor';
    if (!allowed) throw new Error('Only the assigned supervisor can act at this stage');
    return;
  }
  if (stage === 'manager') {
    const allowed = row.manager_id ? row.manager_id === user.id : tierOfUser(user) === 'manager';
    if (!allowed) throw new Error('Only the assigned manager can act at this stage');
    return;
  }
  if (stage === 'hr') {
    if (!isHrTier(user)) throw new Error('Only HR can act at this stage');
    return;
  }
  if (stage === 'finance') {
    if (!isFinanceTier(user)) throw new Error('Only Finance can act at this stage');
    return;
  }
  throw new Error('Unknown stage');
}

const STAGE_LABEL = { supervisor: 'Supervisor', manager: 'Manager', hr: 'HR', finance: 'Finance' };

export async function respondToOTStage(user, requestId, { action, reason, comment, amountPaid, paymentMethod, signature }) {
  const res = await pool.query(`SELECT * FROM ot_requests WHERE id = $1`, [requestId]);
  const row = res.rows[0];
  if (!row) throw new Error('Overtime request not found');
  if (!FLOW_STAGES.includes(row.current_stage)) throw new Error('This request is not awaiting action');
  const stage = row.current_stage;
  await assertActorAllowed(user, row, stage);

  if (!['approve', 'decline'].includes(action)) throw new Error('Action must be approve or decline');

  const waitMinutes = await computeWaitMinutes(row.id, row.submitted_at);

  if (action === 'decline') {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new Error('A decline reason is required');
    await pool.query(
      `UPDATE ot_requests SET current_stage = 'declined', status = 'declined', declined_reason = $1, declined_by_stage = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [trimmedReason, stage, row.id]
    );
    await insertHistory(row.id, stage, user, 'declined', trimmedReason, waitMinutes);
    await notifySubmitterAndPriorActors(
      row, user.id, 'Overtime Request Declined',
      `${STAGE_LABEL[stage]} (${actorDisplayName(user)}) declined this overtime request: "${trimmedReason}"`
    );
    return (await pool.query(`SELECT * FROM ot_requests WHERE id = $1`, [row.id])).rows[0];
  }

  // approve
  if (stage === 'finance') {
    const amount = Number(amountPaid);
    if (!amount || amount <= 0) throw new Error('A valid amount paid is required');
    if (!['cash', 'transfer', 'mobile_money'].includes(paymentMethod)) throw new Error('A valid payment method is required');
    if (!String(signature || '').trim()) throw new Error('A digital signature is required to confirm payment');
    await pool.query(
      `UPDATE ot_requests SET current_stage = 'paid', status = 'paid', amount_paid = $1, payment_method = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [amount, paymentMethod, row.id]
    );
    await insertHistory(row.id, 'finance', user, 'paid', comment || null, waitMinutes, { amountPaid: amount, paymentMethod });
    if (row.staff_id) {
      await notifyUsersPaired(
        [row.staff_id], 'Overtime Payment Processed',
        `Your OT payment of GHS ${amount.toFixed(2)} has been processed via ${paymentMethod.replace('_', ' ')}.`,
        `/hr-self/overtime/${row.id}`
      );
    }
    return (await pool.query(`SELECT * FROM ot_requests WHERE id = $1`, [row.id])).rows[0];
  }

  if (!String(signature || '').trim()) throw new Error('A digital signature is required to confirm this action');
  const flow = resolveOTFlow(row);
  const idx = flow.indexOf(stage);
  const nextStage = flow[idx + 1];
  await pool.query(`UPDATE ot_requests SET current_stage = $1, updated_at = NOW() WHERE id = $2`, [nextStage, row.id]);
  await insertHistory(row.id, stage, user, 'approved', signature ? signature.trim() : (comment || null), waitMinutes);
  const messages = {
    manager: `${STAGE_LABEL[stage]} verified this overtime request — it now needs Manager sanction.`,
    hr: `${STAGE_LABEL[stage]} sanctioned this overtime request — it now needs HR authorization.`,
    finance: `${STAGE_LABEL[stage]} authorized this overtime request — it is now ready for Finance processing.`,
  };
  await notifyStageActors(row, nextStage, 'Overtime Request Needs Your Action', messages[nextStage] || 'An overtime request needs your action.');

  return (await pool.query(`SELECT * FROM ot_requests WHERE id = $1`, [row.id])).rows[0];
}
