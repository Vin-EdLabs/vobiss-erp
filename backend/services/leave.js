import pool from '../db.js';
import { createNotification } from '../db.js';
import { sendPushToUserIds } from '../push/sendPush.js';
import { listTierCandidates, tierOfUser, unitsOfUser } from '../db/performanceReports.js';
import { deductLeaveDays, isoDateOnly, getEmployeeByUserId } from '../utils/hrShared.js';
import { markLeaveAttendance } from '../utils/hrGps.js';
import { logHrActivity } from '../db/hr.js';
import { emitToUser } from '../realtime/channels.js';
import { isSystemAdminAccount } from '../roles.js';

/**
 * Multi-stage leave approval — reliever hand-off, then the leaver's own tier's approvers sign
 * off in sequence, ending at HR (or CTO, if HR themself is leaving). Built on the existing
 * unit+tier resolution system in db/performanceReports.js (listTierCandidates/tierOfUser) —
 * the same "who approves next" machinery already used for performance-report review chains,
 * just never wired into leave before now.
 *
 * Supervisor/manager stages resolve to ONE named approver (chosen at submission when the unit
 * has more than one candidate); CTO/HR stages stay a queue — any qualifying user can act,
 * matching how HR leave approval already worked before this upgrade. A stage with zero
 * candidates in the unit is dropped from the resolved flow at submission time (mirrors
 * resolveNextStage's existing skip-missing-tier behavior) so a request never gets stuck.
 */

export const FLOW_STAGES = {
  employee: ['reliever', 'supervisor', 'manager', 'cto', 'hr'],
  supervisor: ['reliever', 'manager', 'cto', 'hr'],
  manager: ['reliever', 'cto', 'hr'],
  cto: ['hr'],
  hr: ['cto'],
};

function actorDisplayName(user) {
  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return name || user?.username || user?.full_name || 'User';
}

/** HR is its own tier here (tierOfUser from performanceReports.js has no 'hr' bucket — it only
 *  distinguishes employee/supervisor/manager/cto). Checked first so an HR staff member's leave
 *  always gets the shortened HR flow even if their position string also contains other words. */
export function classifyLeaverTier(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  const units = unitsOfUser(user);
  if (role === 'hr' || units.includes('hr') || position === 'hr') return 'hr';
  return tierOfUser(user); // 'cto' | 'manager' | 'supervisor' | 'employee'
}

function resolvedFlowStages(row) {
  const base = FLOW_STAGES[row.leaver_tier] || FLOW_STAGES.employee;
  return base.filter((stage) => {
    if (stage === 'supervisor') return !!row.supervisor_approver_id;
    if (stage === 'manager') return !!row.manager_approver_id;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Business-day calculation — weekends + Ghana public holidays
// ---------------------------------------------------------------------------

export async function countBusinessDays(startIso, endIso, companyId) {
  const holidaysRes = await pool.query(
    `SELECT holiday_date::text AS d FROM hr_public_holidays
     WHERE holiday_date BETWEEN $1 AND $2 AND (company_id = $3 OR company_id = 'ALL')`,
    [startIso, endIso, companyId || 'ALL']
  );
  const holidaySet = new Set(holidaysRes.rows.map((r) => r.d));
  let count = 0;
  const cur = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cur <= end) {
    const day = cur.getUTCDay();
    const iso = cur.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidaySet.has(iso)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listActiveCategories(companyId) {
  const res = await pool.query(
    `SELECT * FROM hr_leave_categories WHERE is_active = true AND (company = $1 OR company = 'ALL') ORDER BY name ASC`,
    [companyId || 'ALL']
  );
  return res.rows;
}

async function getActiveCategory(name, companyId) {
  const res = await pool.query(
    `SELECT * FROM hr_leave_categories WHERE name = $1 AND is_active = true AND (company = $2 OR company = 'ALL') LIMIT 1`,
    [name, companyId || 'ALL']
  );
  return res.rows[0] || null;
}

export async function listAllCategories(companyId) {
  const res = await pool.query(
    `SELECT * FROM hr_leave_categories WHERE (company = $1 OR company = 'ALL') ORDER BY name ASC`,
    [companyId || 'ALL']
  );
  return res.rows;
}

export async function createCategory({ name, maxDaysPerYear, maxRequestsPerYear, company }) {
  const res = await pool.query(
    `INSERT INTO hr_leave_categories (name, max_days_per_year, max_requests_per_year, company)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [String(name || '').trim(), Number(maxDaysPerYear) || 0, Number(maxRequestsPerYear) || 0, company || 'ALL']
  );
  return res.rows[0];
}

export async function updateCategory(id, { name, maxDaysPerYear, maxRequestsPerYear, isActive }) {
  const res = await pool.query(
    `UPDATE hr_leave_categories SET
       name = COALESCE($1, name),
       max_days_per_year = COALESCE($2, max_days_per_year),
       max_requests_per_year = COALESCE($3, max_requests_per_year),
       is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [
      name ? String(name).trim() : null,
      maxDaysPerYear === undefined || maxDaysPerYear === null ? null : Number(maxDaysPerYear),
      maxRequestsPerYear === undefined || maxRequestsPerYear === null ? null : Number(maxRequestsPerYear),
      isActive === undefined ? null : !!isActive,
      id,
    ]
  );
  return res.rows[0];
}

/** Nothing stores a running "used" total — both remaining figures are computed live from actual
 *  hr_leave_requests rows for that employee/category/year, excluding declined/cancelled ones. */
export async function remainingForCategory(employeeId, categoryName, year, companyId) {
  const category = await getActiveCategory(categoryName, companyId);
  if (!category) return null;
  const usedRes = await pool.query(
    `SELECT COALESCE(SUM(days),0)::int AS used_days, COUNT(*)::int AS used_requests
     FROM hr_leave_requests
     WHERE employee_id = $1 AND leave_type = $2 AND EXTRACT(YEAR FROM start_date) = $3
       AND NOT (
         (current_stage IN ('declined','cancelled'))
         OR (current_stage IS NULL AND status IN ('rejected','cancelled'))
       )`,
    [employeeId, categoryName, year]
  );
  const usedDays = Number(usedRes.rows[0].used_days);
  const usedRequests = Number(usedRes.rows[0].used_requests);
  return {
    category,
    usedDays,
    usedRequests,
    remainingDays: category.max_days_per_year - usedDays,
    remainingRequests: category.max_requests_per_year - usedRequests,
  };
}

// ---------------------------------------------------------------------------
// Reliever / approver candidate search
// ---------------------------------------------------------------------------

export async function hasActiveLeave(employeeId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM hr_leave_requests
     WHERE employee_id = $1
       AND (
         (current_stage IS NOT NULL AND current_stage NOT IN ('approved','declined','cancelled'))
         OR (current_stage IS NULL AND status = 'pending')
         OR (status = 'approved' AND end_date >= CURRENT_DATE)
       )
     LIMIT 1`,
    [employeeId]
  );
  return rows.length > 0;
}

export async function searchRelieverCandidates(q, excludeEmployeeId) {
  const like = `%${String(q || '').trim()}%`;
  const res = await pool.query(
    `SELECT id, full_name, position, department, photo_url, user_id FROM hr_employees
     WHERE status = 'active' AND id != $1
       AND (full_name ILIKE $2 OR email ILIKE $2 OR position ILIKE $2)
     ORDER BY full_name ASC LIMIT 15`,
    [excludeEmployeeId || 0, like]
  );
  const eligible = [];
  for (const r of res.rows) {
    if (!(await hasActiveLeave(r.id))) eligible.push(r);
  }
  return eligible;
}

async function resolveApproverForStage(unit, tier, chosenId) {
  const candidates = await listTierCandidates(unit, tier);
  if (candidates.length === 0) return { candidates, approverId: null };
  if (candidates.length === 1) return { candidates, approverId: candidates[0].id };
  if (chosenId) {
    const match = candidates.find((c) => c.id === Number(chosenId));
    if (match) return { candidates, approverId: match.id };
  }
  return { candidates, approverId: null };
}

export async function getApproverCandidatesForUser(user) {
  const tier = classifyLeaverTier(user);
  const stages = (FLOW_STAGES[tier] || FLOW_STAGES.employee).filter((s) => s === 'supervisor' || s === 'manager');
  const unit = unitsOfUser(user)[0] || null;
  const result = {};
  for (const stage of stages) {
    result[stage] = await listTierCandidates(unit, stage);
  }
  return result;
}

async function listHrCandidates() {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, position FROM users
     WHERE deleted_at IS NULL
       AND (LOWER(main_role) = 'hr' OR LOWER(role) = 'hr' OR LOWER(position) = 'hr'
            OR LOWER(unit) = 'hr' OR units ?| ARRAY['hr'])
     ORDER BY first_name, last_name`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Notifications — paired createNotification + push, one helper for every call site
// ---------------------------------------------------------------------------

async function notifyUsersPaired(userIds, title, message, linkUrl) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  if (!unique.length) return;
  for (const uid of unique) {
    const notif = await createNotification(title, message, null, uid, linkUrl, 'leave_request').catch(() => null);
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
  await sendPushToUserIds(unique, { title, body: message, data: { url: linkUrl, type: 'leave_request' } }).catch(() => {});
}

async function notifyStageActors(row, stage, title, message) {
  let userIds = [];
  if (stage === 'reliever') {
    if (row.reliever_id) {
      const r = await pool.query(`SELECT user_id FROM hr_employees WHERE id = $1`, [row.reliever_id]);
      if (r.rows[0]?.user_id) userIds = [r.rows[0].user_id];
    }
  } else if (stage === 'supervisor') {
    if (row.supervisor_approver_id) userIds = [row.supervisor_approver_id];
  } else if (stage === 'manager') {
    if (row.manager_approver_id) userIds = [row.manager_approver_id];
  } else if (stage === 'cto') {
    const candidates = await listTierCandidates(null, 'cto');
    userIds = candidates.map((c) => c.id);
  } else if (stage === 'hr') {
    userIds = (await listHrCandidates()).map((c) => c.id);
  }
  // HR acts on requests from Leave Management → Applications, not the self-service page —
  // point the notification link there so it actually lands on something actionable.
  const linkUrl = stage === 'hr' ? `/hr/leave/${row.id}` : `/hr-self/leave/${row.id}`;
  await notifyUsersPaired(userIds, title, message, linkUrl);
}

async function notifySubmitterAndPriorActors(row, actingUserId, title, message) {
  const priorActors = await pool.query(
    `SELECT DISTINCT actor_id FROM hr_leave_request_history WHERE leave_request_id = $1 AND actor_id IS NOT NULL AND actor_id != $2`,
    [row.id, actingUserId]
  );
  const ids = priorActors.rows.map((r) => r.actor_id);
  if (row.user_id && row.user_id !== actingUserId) ids.push(row.user_id);
  await notifyUsersPaired(ids, title, message, `/hr-self/leave/${row.id}`);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

async function computeWaitMinutes(requestId, submittedAt) {
  const prev = await pool.query(
    `SELECT acted_at FROM hr_leave_request_history WHERE leave_request_id = $1 ORDER BY acted_at DESC LIMIT 1`,
    [requestId]
  );
  const since = prev.rows[0]?.acted_at || submittedAt;
  if (!since) return null;
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.round(ms / 60000));
}

async function insertHistory(requestId, stage, user, action, reason, waitMinutes) {
  await pool.query(
    `INSERT INTO hr_leave_request_history (leave_request_id, stage, actor_id, actor_name, action, reason, waiting_duration_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [requestId, stage, user?.id || null, actorDisplayName(user), action, reason || null, waitMinutes ?? null]
  );
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export async function submitLeaveRequest(user, emp, payload, companyId) {
  const {
    leaveType, startDate, endDate, reason, contactDuringLeave,
    relieverId, employeeSignature, handoverConfirmed,
    supervisorApproverId, managerApproverId,
    attachmentUrl, attachmentName,
  } = payload;

  const category = await getActiveCategory(leaveType, companyId);
  if (!category) throw new Error('Select a valid leave category');

  const startIso = isoDateOnly(startDate);
  const endIso = isoDateOnly(endDate);
  if (!startIso || !endIso || endIso < startIso) throw new Error('Select a valid date range');

  const days = await countBusinessDays(startIso, endIso, companyId);
  if (days < 1) throw new Error('Selected range has no working days (weekends and public holidays are excluded)');

  if (!String(reason || '').trim()) throw new Error('A reason is required');

  const tier = classifyLeaverTier(user);
  const needsReliever = tier === 'employee' || tier === 'supervisor' || tier === 'manager';

  if (needsReliever) {
    if (!relieverId) throw new Error('Select a reliever');
    if (Number(relieverId) === Number(emp.id)) throw new Error('You cannot select yourself as reliever');
    if (await hasActiveLeave(relieverId)) throw new Error('That reliever already has an active leave request');
    if (!String(contactDuringLeave || '').trim()) throw new Error('Contact during leave is required');
    if (!String(employeeSignature || '').trim() || !handoverConfirmed) {
      throw new Error('Handover confirmation and signature are required');
    }
  }

  if (String(leaveType) !== 'Unpaid') {
    const year = Number(startIso.slice(0, 4));
    const remaining = await remainingForCategory(emp.id, leaveType, year, companyId);
    if (remaining) {
      if (days > remaining.remainingDays) {
        throw new Error(`Insufficient ${leaveType} leave balance — ${remaining.remainingDays} day(s) remaining`);
      }
      if (remaining.remainingRequests <= 0) {
        throw new Error(`You've used all ${category.max_requests_per_year} ${leaveType} leave request(s) allowed this year`);
      }
    }
  }

  const unit = unitsOfUser(user)[0] || null;
  const stages = FLOW_STAGES[tier] || FLOW_STAGES.employee;

  let resolvedSupervisorId = null;
  let resolvedManagerId = null;
  if (stages.includes('supervisor')) {
    const { candidates, approverId } = await resolveApproverForStage(unit, 'supervisor', supervisorApproverId);
    if (candidates.length > 1 && !approverId) throw new Error('Select a supervisor to send this request to');
    resolvedSupervisorId = approverId;
  }
  if (stages.includes('manager')) {
    const { candidates, approverId } = await resolveApproverForStage(unit, 'manager', managerApproverId);
    if (candidates.length > 1 && !approverId) throw new Error('Select a manager to send this request to');
    resolvedManagerId = approverId;
  }

  const inserted = await pool.query(
    `INSERT INTO hr_leave_requests (
       user_id, employee_id, leave_type, start_date, end_date, days, reason, status,
       contact_during_leave, reliever_id, employee_signature, leaver_tier,
       supervisor_approver_id, manager_approver_id, submitted_at, attachment_url, attachment_name
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,NOW(),$14,$15)
     RETURNING *`,
    [
      user.id, emp.id, leaveType, startIso, endIso, days, reason.trim(),
      needsReliever ? contactDuringLeave.trim() : null,
      needsReliever ? relieverId : null,
      needsReliever ? employeeSignature.trim() : null,
      tier,
      resolvedSupervisorId,
      resolvedManagerId,
      attachmentUrl || null,
      attachmentName || null,
    ]
  );
  let row = inserted.rows[0];
  const firstStage = resolvedFlowStages(row)[0];
  const updated = await pool.query(
    `UPDATE hr_leave_requests SET current_stage = $1 WHERE id = $2 RETURNING *`,
    [firstStage, row.id]
  );
  row = updated.rows[0];

  await insertHistory(row.id, firstStage, user, 'submitted', null, null);
  await notifyStageActors(
    row, firstStage, 'New Leave Request',
    `${actorDisplayName(user)} submitted a ${leaveType} leave request (${days} day${days === 1 ? '' : 's'}) and needs your action.`
  );

  return row;
}

// ---------------------------------------------------------------------------
// Respond
// ---------------------------------------------------------------------------

async function assertActorAllowed(user, row, stage) {
  // System Admin is the one break-glass override — can act at any stage of any request,
  // including one they submitted themselves.
  if (isSystemAdminAccount(user)) return;
  // Nobody approves their own request — the tier-shortened flow already keeps a submitter's own
  // tier-stage out of their own chain, but this makes the rule explicit and covers the reliever
  // stage too (self-select is already blocked at submission, this is defense in depth).
  if (row.user_id === user.id) {
    throw new Error('You cannot act on your own request — this must be handled by someone else in the chain.');
  }
  if (stage === 'reliever') {
    const emp = await getEmployeeByUserId(user.id);
    if (!emp || emp.id !== row.reliever_id) throw new Error('You are not the reliever for this request');
    return;
  }
  if (stage === 'supervisor') {
    if (user.id !== row.supervisor_approver_id) throw new Error('You are not the assigned supervisor for this request');
    return;
  }
  if (stage === 'manager') {
    if (user.id !== row.manager_approver_id) throw new Error('You are not the assigned manager for this request');
    return;
  }
  if (stage === 'cto') {
    if (classifyLeaverTier(user) !== 'cto') throw new Error('Only a CTO/Director can act at this stage');
    return;
  }
  if (stage === 'hr') {
    if (classifyLeaverTier(user) !== 'hr') throw new Error('Only HR can act at this stage');
    return;
  }
  throw new Error('Unknown stage');
}

export async function respondToLeaveStage(user, requestId, { action, reason, signature }) {
  const res = await pool.query(`SELECT * FROM hr_leave_requests WHERE id = $1`, [requestId]);
  const row = res.rows[0];
  if (!row) throw new Error('Leave request not found');
  if (!row.current_stage || ['approved', 'declined', 'cancelled'].includes(row.current_stage)) {
    throw new Error('This request is not awaiting action');
  }
  const stage = row.current_stage;
  await assertActorAllowed(user, row, stage);

  const validActions = stage === 'reliever' ? ['confirm', 'decline'] : ['approve', 'decline'];
  if (!validActions.includes(action)) {
    throw new Error(`Action must be ${validActions.join(' or ')} at this stage`);
  }

  if (action !== 'decline' && !String(signature || '').trim()) {
    throw new Error('A digital signature (your initials) is required to confirm this action');
  }

  if (action === 'decline') {
    const trimmedReason = String(reason || '').trim();
    if (!trimmedReason) throw new Error('A reason is required to decline');
    await pool.query(
      `UPDATE hr_leave_requests SET
         current_stage = 'declined', status = 'declined',
         declined_reason = $1, declined_by_stage = $2, completed_at = NOW()
       WHERE id = $3`,
      [trimmedReason, stage, row.id]
    );
    const waitMinutes = await computeWaitMinutes(row.id, row.submitted_at);
    await insertHistory(row.id, stage, user, 'declined', trimmedReason, waitMinutes);
    await notifySubmitterAndPriorActors(
      row, user.id, 'Leave Request Declined',
      `${actorDisplayName(user)} declined your leave request at the ${stage} stage: ${trimmedReason}`
    );
    return (await pool.query(`SELECT * FROM hr_leave_requests WHERE id = $1`, [row.id])).rows[0];
  }

  const stages = resolvedFlowStages(row);
  const idx = stages.indexOf(stage);
  const isFinal = idx === stages.length - 1;
  const historyAction = stage === 'reliever' ? 'confirmed' : 'approved';
  const waitMinutes = await computeWaitMinutes(row.id, row.submitted_at);

  if (isFinal) {
    const startIso = isoDateOnly(row.start_date);
    const endIso = isoDateOnly(row.end_date);
    const year = Number(startIso.slice(0, 4));
    if (row.employee_id) {
      await deductLeaveDays(row.employee_id, row.leave_type, row.days, year);
      await pool.query(
        `INSERT INTO hr_leave_applications (employee_id, leave_type, start_date, end_date, days, status, notes, recorded_by)
         VALUES ($1,$2,$3,$4,$5,'Approved',$6,$7)`,
        [row.employee_id, row.leave_type, startIso, endIso, row.days, row.reason || null, user.id]
      );
      await markLeaveAttendance(row.employee_id, startIso, endIso);
    }
    await pool.query(
      `UPDATE hr_leave_requests SET current_stage = 'approved', status = 'approved', completed_at = NOW() WHERE id = $1`,
      [row.id]
    );
    await insertHistory(row.id, stage, user, historyAction, signature.trim(), waitMinutes);
    await logHrActivity(pool, {
      kind: 'leave_approved',
      message: `${row.leave_type} leave approved for employee #${row.employee_id}`,
      employeeId: row.employee_id,
    }).catch(() => {});
    if (row.user_id) {
      await notifyUsersPaired(
        [row.user_id], 'Leave Approved',
        `Your ${row.leave_type} leave request has been fully approved.`,
        `/hr-self/leave/${row.id}`
      );
    }
  } else {
    const nextStage = stages[idx + 1];
    const updated = await pool.query(
      `UPDATE hr_leave_requests SET current_stage = $1 WHERE id = $2 RETURNING *`,
      [nextStage, row.id]
    );
    await insertHistory(row.id, stage, user, historyAction, signature.trim(), waitMinutes);
    await notifyStageActors(
      updated.rows[0], nextStage, 'Leave Request Needs Your Action',
      `${row.leave_type} leave request from an earlier stage needs your action.`
    );
  }

  return (await pool.query(`SELECT * FROM hr_leave_requests WHERE id = $1`, [row.id])).rows[0];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const ENRICHED_REQUEST_SELECT = `
  SELECT r.*,
    e.full_name AS employee_name, e.department, e.position,
    e.photo_url AS employee_photo_url, e.email AS employee_email, e.phone AS employee_phone,
    e.employment_type AS employee_employment_type, e.start_date AS employee_start_date,
    e.line_manager AS employee_line_manager, e.gender AS employee_gender, e.location AS employee_location,
    rel.full_name AS reliever_name, rel.photo_url AS reliever_photo_url,
    rel.department AS reliever_department, rel.position AS reliever_position, rel.phone AS reliever_phone,
    CONCAT_WS(' ', sup.first_name, sup.last_name) AS supervisor_approver_name,
    CONCAT_WS(' ', mgr.first_name, mgr.last_name) AS manager_approver_name
  FROM hr_leave_requests r
  LEFT JOIN hr_employees e ON e.id = r.employee_id
  LEFT JOIN hr_employees rel ON rel.id = r.reliever_id
  LEFT JOIN users sup ON sup.id = r.supervisor_approver_id
  LEFT JOIN users mgr ON mgr.id = r.manager_approver_id
`;

export async function listMyRequests(user) {
  const res = await pool.query(`${ENRICHED_REQUEST_SELECT} WHERE r.user_id = $1 ORDER BY r.created_at DESC`, [user.id]);
  return res.rows;
}

export async function listPendingForUser(user) {
  const emp = await getEmployeeByUserId(user.id);
  const tier = classifyLeaverTier(user);
  const clauses = [];
  const params = [];
  let i = 1;
  if (emp) {
    clauses.push(`(r.current_stage = 'reliever' AND r.reliever_id = $${i++})`);
    params.push(emp.id);
  }
  clauses.push(`(r.current_stage = 'supervisor' AND r.supervisor_approver_id = $${i++})`);
  params.push(user.id);
  clauses.push(`(r.current_stage = 'manager' AND r.manager_approver_id = $${i++})`);
  params.push(user.id);
  if (tier === 'cto') clauses.push(`r.current_stage = 'cto'`);
  // HR-stage requests are deliberately excluded here — HR approves exclusively from
  // Leave Management → Applications, never from their own "Leave Request" self-service page.
  if (!clauses.length) return [];
  const res = await pool.query(
    `${ENRICHED_REQUEST_SELECT} WHERE ${clauses.join(' OR ')} ORDER BY r.submitted_at ASC`,
    params
  );
  return res.rows;
}

export async function getLeaveRequestHistory(requestId) {
  const res = await pool.query(
    `SELECT * FROM hr_leave_request_history WHERE leave_request_id = $1 ORDER BY acted_at ASC`,
    [requestId]
  );
  return res.rows;
}

export async function getLeaveRequestDetail(id) {
  const rowRes = await pool.query(`${ENRICHED_REQUEST_SELECT} WHERE r.id = $1`, [id]);
  const row = rowRes.rows[0];
  if (!row) return null;
  const history = await getLeaveRequestHistory(id);
  return {
    ...row,
    resolved_stages: row.leaver_tier ? resolvedFlowStages(row) : null,
    history,
  };
}

/** Every request where this user acted at some stage (reliever/supervisor/manager/cto/hr) —
 *  a persistent record separate from "pending on me" (which empties out once acted on), so a
 *  reliever or approver can always look back at what they confirmed/approved/declined. */
export async function listActedByUser(user) {
  const res = await pool.query(
    `SELECT DISTINCT ON (r.id) r.*, e.full_name AS employee_name, e.department, e.position,
            h.action AS my_action, h.stage AS my_stage, h.acted_at AS my_acted_at
     FROM hr_leave_request_history h
     JOIN hr_leave_requests r ON r.id = h.leave_request_id
     LEFT JOIN hr_employees e ON e.id = r.employee_id
     WHERE h.actor_id = $1
     ORDER BY r.id, h.acted_at DESC`,
    [user.id]
  );
  res.rows.sort((a, b) => new Date(b.my_acted_at).getTime() - new Date(a.my_acted_at).getTime());
  return res.rows;
}

export async function canViewRequest(user, row) {
  if (!row) return false;
  if (row.user_id === user.id) return true;
  if (row.supervisor_approver_id === user.id || row.manager_approver_id === user.id) return true;
  const emp = await getEmployeeByUserId(user.id);
  if (emp && row.reliever_id === emp.id) return true;
  const tier = classifyLeaverTier(user);
  if ((tier === 'cto' && row.current_stage === 'cto') || (tier === 'hr' && row.current_stage === 'hr')) return true;
  const history = await pool.query(
    `SELECT 1 FROM hr_leave_request_history WHERE leave_request_id = $1 AND actor_id = $2 LIMIT 1`,
    [row.id, user.id]
  );
  return history.rows.length > 0;
}

export async function listAllRequests({ status, department, from, to, company } = {}) {
  const clauses = [];
  const params = [];
  let i = 1;
  if (status) {
    clauses.push(`r.status = $${i++}`);
    params.push(status);
  }
  if (department) {
    clauses.push(`e.department = $${i++}`);
    params.push(department);
  }
  if (from) {
    clauses.push(`r.start_date >= $${i++}`);
    params.push(from);
  }
  if (to) {
    clauses.push(`r.end_date <= $${i++}`);
    params.push(to);
  }
  if (company) {
    clauses.push(`e.company = $${i++}`);
    params.push(company);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const res = await pool.query(
    `SELECT r.*, e.full_name AS employee_name, e.department, e.position
     FROM hr_leave_requests r
     LEFT JOIN hr_employees e ON e.id = r.employee_id
     ${where}
     ORDER BY r.created_at DESC LIMIT 500`,
    params
  );
  return res.rows;
}

export async function getLeaveOverview(companyId) {
  const [pendingRes, byCategoryRes, byStageRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM hr_leave_requests r LEFT JOIN hr_employees e ON e.id = r.employee_id
       WHERE r.status = 'pending' AND ($1::text IS NULL OR e.company = $1)`,
      [companyId || null]
    ),
    pool.query(
      `SELECT leave_type, COUNT(*)::int AS count FROM hr_leave_requests r LEFT JOIN hr_employees e ON e.id = r.employee_id
       WHERE EXTRACT(YEAR FROM r.start_date) = EXTRACT(YEAR FROM CURRENT_DATE) AND ($1::text IS NULL OR e.company = $1)
       GROUP BY leave_type ORDER BY count DESC`,
      [companyId || null]
    ),
    pool.query(
      `SELECT current_stage, COUNT(*)::int AS count FROM hr_leave_requests r LEFT JOIN hr_employees e ON e.id = r.employee_id
       WHERE r.status = 'pending' AND r.current_stage IS NOT NULL AND ($1::text IS NULL OR e.company = $1)
       GROUP BY current_stage`,
      [companyId || null]
    ),
  ]);
  return {
    pendingCount: pendingRes.rows[0].count,
    byCategory: byCategoryRes.rows,
    byStage: byStageRes.rows,
  };
}
