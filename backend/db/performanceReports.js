/**
 * Performance & Report Assessment System — data layer.
 *
 * Hierarchy is derived from unit + role tier (there is no real "who is my supervisor" data
 * anywhere in this app — hr_employees.line_manager is a free-text name, not a link), following
 * the same convention the ticket-escalation and field-work modules already use:
 * effectiveUnitsForUser() for unit membership, role-slug suffix (_supervisor/_manager) or
 * director/cto for tier. A stage's "queue" is everyone at that tier in that unit — first to
 * open and act, same ownership model as the ticket queues, not a named 1:1 assignment.
 */
import pool from '../db.js';
import { getStaffAssessment } from '../services/staffAssessment.js';
import { isSystemAdminAccount } from '../roles.js';

const TIER_ORDER = ['employee', 'supervisor', 'manager', 'cto'];

/** Most real accounts in this app carry their actual job title in `position` (free text, e.g.
 *  "IP Supervisor", "Director") with `role`/`main_role` left as a generic account type like
 *  "admin"/"superadmin"/"user" — the `_supervisor`/`_manager` role-suffix convention only holds
 *  for a handful of accounts. Mirrors Sidebar.tsx's isGlobalPosition/isManagerOrSupervisor,
 *  which already reads position the same way for menu visibility. */
export function tierOfUser(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  if (['director', 'cto'].includes(role) || position === 'director' || position === 'cto') return 'cto';
  if (role.endsWith('_manager') || position.includes('manager')) return 'manager';
  if (role.endsWith('_supervisor') || position.includes('supervisor')) return 'supervisor';
  return 'employee';
}

/** Real unit membership, mirroring backend/roles.js's effectiveUnitsForUser but kept local
 *  to avoid a circular import (roles.js doesn't export a DB-querying function). */
function parseUnitsArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').toLowerCase()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((v) => String(v || '').toLowerCase()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function unitsOfUser(user) {
  const set = new Set(parseUnitsArray(user?.units));
  if (user?.unit) set.add(String(user.unit).toLowerCase());
  return [...set];
}

/** Does this unit have anyone at the given tier? Used to skip a tier with nobody in it —
 *  this is what implements "a Manager's own report skips Supervisor/Manager and goes to CTO". */
async function unitHasTier(unit, tier) {
  if (tier === 'cto') return true; // CTO/director are global, never unit-scoped
  const suffix = tier === 'manager' ? '_manager' : '_supervisor';
  const word = tier === 'manager' ? 'manager' : 'supervisor';
  const { rows } = await pool.query(
    `SELECT 1 FROM users
     WHERE deleted_at IS NULL
       AND ((LOWER(main_role) LIKE '%' || $2 OR LOWER(role) LIKE '%' || $2) OR LOWER(position) LIKE '%' || $3 || '%')
       AND (LOWER(unit) = $1 OR units ?| ARRAY[$1])
     LIMIT 1`,
    [String(unit || '').toLowerCase(), suffix, word]
  );
  return rows.length > 0;
}

export async function resolveNextStage(unit, fromTier) {
  const startIdx = TIER_ORDER.indexOf(fromTier) + 1;
  for (let i = startIdx; i < TIER_ORDER.length; i++) {
    if (TIER_ORDER[i] === 'cto') return 'cto';
    if (await unitHasTier(unit, TIER_ORDER[i])) return TIER_ORDER[i];
  }
  return 'cto';
}

/** Named people at a given tier — lets a submitter/forwarder see who a report would go to and,
 *  when a unit has more than one Supervisor/Manager, choose which one. */
export async function listTierCandidates(unit, tier) {
  if (tier === 'employee') return [];
  if (tier === 'cto') {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, username, position FROM users
       WHERE deleted_at IS NULL
         AND (LOWER(main_role) IN ('director','cto') OR LOWER(role) IN ('director','cto') OR LOWER(position) IN ('director','cto'))
       ORDER BY first_name, last_name`
    );
    return rows;
  }
  const suffix = tier === 'manager' ? '_manager' : '_supervisor';
  const word = tier === 'manager' ? 'manager' : 'supervisor';
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, position FROM users
     WHERE deleted_at IS NULL
       AND ((LOWER(main_role) LIKE '%' || $2 OR LOWER(role) LIKE '%' || $2) OR LOWER(position) LIKE '%' || $3 || '%')
       AND (LOWER(unit) = $1 OR units ?| ARRAY[$1])
     ORDER BY first_name, last_name`,
    [String(unit || '').toLowerCase(), suffix, word]
  );
  return rows;
}

/** Can this user see this report (and, by extension, its documents)? Same visibility rules as
 *  listQueueForUser/listHrAccessible, plus the report's own author and a global CTO/director
 *  bypass — used to gate report detail and document access so nobody can read another unit's
 *  reports (or their attached documents) by guessing an id. */
export function canAccessReport(user, report, { isHr = false } = {}) {
  if (!user || !report) return false;
  // Company scope applies before any tier/HR bypass below — "CTO sees everything" or "HR sees
  // every finalized report" means everything in their own company, not literally every tenant's
  // data. Only a true System Admin (see roles.js) skips this entirely.
  if (!isSystemAdminAccount(user) && report.company && (user.company || 'CW') !== report.company) {
    return false;
  }
  if (report.employee_id === user.id) return true;
  const tier = tierOfUser(user);
  if (tier === 'cto') return true;
  if (isHr && ['cto', 'done'].includes(report.current_stage)) return true;
  if (tier !== 'employee' && report.unit) {
    if (unitsOfUser(user).includes(String(report.unit).toLowerCase())) return true;
  }
  return false;
}

const STAGE_TO_STATUS = {
  supervisor: 'submitted_supervisor',
  manager: 'submitted_manager',
  cto: 'submitted_cto',
};
const REVIEW_STATUS = {
  supervisor: 'under_supervisor_review',
  manager: 'under_manager_review',
  cto: 'under_cto_review',
};

export async function initPerformanceReportTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_periods (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      period_type VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('weekly','monthly','quarterly','custom')),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_reports (
      id SERIAL PRIMARY KEY,
      period_id INTEGER NOT NULL REFERENCES performance_periods(id),
      employee_id INTEGER NOT NULL REFERENCES users(id),
      employee_name VARCHAR(255) NOT NULL,
      unit VARCHAR(60),
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      current_stage VARCHAR(20) NOT NULL DEFAULT 'employee',
      system_score NUMERIC(5,2),
      attendance_score NUMERIC(5,2),
      system_score_breakdown JSONB,
      supervisor_score NUMERIC(5,2), supervisor_comments TEXT, supervisor_reviewed_by INTEGER REFERENCES users(id), supervisor_reviewed_at TIMESTAMP,
      manager_score NUMERIC(5,2), manager_comments TEXT, manager_reviewed_by INTEGER REFERENCES users(id), manager_reviewed_at TIMESTAMP,
      cto_score NUMERIC(5,2), cto_comments TEXT, cto_reviewed_by INTEGER REFERENCES users(id), cto_reviewed_at TIMESTAMP,
      final_score NUMERIC(5,2),
      chat_channel_id UUID,
      recipient_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP,
      finalized_at TIMESTAMP
    );
  `);
  // Additive — for databases where this table already existed before recipient selection was added.
  await pool.query(`ALTER TABLE performance_reports ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_perf_reports_stage ON performance_reports(current_stage, unit);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_perf_reports_employee ON performance_reports(employee_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_perf_reports_period ON performance_reports(period_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_report_reviews (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES performance_reports(id) ON DELETE CASCADE,
      stage VARCHAR(20) NOT NULL,
      reviewer_id INTEGER REFERENCES users(id),
      reviewer_name VARCHAR(255) NOT NULL,
      action VARCHAR(20) NOT NULL CHECK (action IN ('submit','forward','send_back','finalize','score')),
      score NUMERIC(5,2),
      comment_text TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_perf_reviews_report ON performance_report_reviews(report_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_report_documents (
      id SERIAL PRIMARY KEY,
      report_id INTEGER NOT NULL REFERENCES performance_reports(id) ON DELETE CASCADE,
      stage VARCHAR(20) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      mime_type VARCHAR(120),
      extension VARCHAR(10),
      size_bytes BIGINT,
      file_path VARCHAR(512) NOT NULL,
      converted_pdf_path VARCHAR(512),
      conversion_status VARCHAR(20) NOT NULL DEFAULT 'not_needed' CHECK (conversion_status IN ('not_needed','pending','done','failed')),
      uploaded_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_perf_docs_report ON performance_report_documents(report_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_scoring_weights (
      id SERIAL PRIMARY KEY,
      system_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      supervisor_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      manager_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      cto_weight NUMERIC(5,2) NOT NULL DEFAULT 25,
      attendance_weight NUMERIC(5,2) NOT NULL DEFAULT 50,
      kpi_weight NUMERIC(5,2) NOT NULL DEFAULT 50,
      is_active BOOLEAN NOT NULL DEFAULT true,
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const existing = await pool.query(`SELECT id FROM performance_scoring_weights WHERE is_active = true LIMIT 1`);
  if (!existing.rows.length) {
    await pool.query(`INSERT INTO performance_scoring_weights (system_weight, supervisor_weight, manager_weight, cto_weight, attendance_weight, kpi_weight) VALUES (25,25,25,25,50,50)`);
  }

  await pool.query(`ALTER TABLE performance_reports DROP CONSTRAINT IF EXISTS performance_reports_status_check;`);
  await pool.query(`
    ALTER TABLE performance_reports ADD CONSTRAINT performance_reports_status_check
    CHECK (status IN ('draft','submitted_supervisor','under_supervisor_review','submitted_manager','under_manager_review','submitted_cto','under_cto_review','finalized','needs_revision'));
  `);
  await pool.query(`ALTER TABLE performance_reports DROP CONSTRAINT IF EXISTS performance_reports_stage_check;`);
  await pool.query(`
    ALTER TABLE performance_reports ADD CONSTRAINT performance_reports_stage_check
    CHECK (current_stage IN ('employee','supervisor','manager','cto','done'));
  `);

  // Multi-tenant — 'CW' default backfills every existing report as C&W's.
  const { addCompanyColumn } = await import('./tenant.js');
  await addCompanyColumn('performance_reports');
}

export async function getActiveWeights() {
  const { rows } = await pool.query(`SELECT * FROM performance_scoring_weights WHERE is_active = true ORDER BY id DESC LIMIT 1`);
  return rows[0] || { system_weight: 25, supervisor_weight: 25, manager_weight: 25, cto_weight: 25, attendance_weight: 50, kpi_weight: 50 };
}

/** Attendance rate for one employee over a period — same shape as the HR dashboard's
 *  company-wide attendance_rate (backend/routes/hr.js), scoped to one person via
 *  hr_employees.user_id (hr_attendance links to hr_employees, not users, directly). */
async function attendanceRateFor(employeeUserId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE LOWER(a.status) IN ('present','late','half-day')) AS present_days,
       COUNT(*) AS total_days
     FROM hr_attendance a
     JOIN hr_employees e ON e.id = a.employee_id
     WHERE e.user_id = $1 AND a.date BETWEEN $2 AND $3`,
    [employeeUserId, startDate, endDate]
  );
  const { present_days, total_days } = rows[0] || {};
  if (!total_days || Number(total_days) === 0) return null; // no attendance rows for this period — can't score it
  return Math.round((Number(present_days) / Number(total_days)) * 1000) / 10;
}

/** System Score (auto) = attendance + reused workflow-performance composite score
 *  (backend/services/staffAssessment.js) — snapshotted once at submission time. */
export async function computeSystemScore(employeeUserId, period) {
  const weights = await getActiveWeights();
  const attendanceRate = await attendanceRateFor(employeeUserId, period.start_date, period.end_date);

  let kpiScore = null;
  try {
    const assessment = await getStaffAssessment(employeeUserId, { dateFrom: period.start_date, dateTo: period.end_date });
    kpiScore = assessment?.score?.overall ?? null;
  } catch {
    kpiScore = null;
  }

  const parts = [];
  if (attendanceRate != null) parts.push({ value: attendanceRate, weight: Number(weights.attendance_weight) });
  if (kpiScore != null) parts.push({ value: kpiScore, weight: Number(weights.kpi_weight) });

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const systemScore = totalWeight > 0
    ? Math.round((parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight) * 10) / 10
    : null;

  return {
    system_score: systemScore,
    attendance_score: attendanceRate,
    breakdown: { attendance: attendanceRate, kpi: kpiScore, weights: { attendance: weights.attendance_weight, kpi: weights.kpi_weight } },
  };
}

export async function getPeriodById(id) {
  const { rows } = await pool.query(`SELECT * FROM performance_periods WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listPeriods() {
  const { rows } = await pool.query(`SELECT * FROM performance_periods ORDER BY start_date DESC`);
  return rows;
}

export async function createPeriod(data, user) {
  const { rows } = await pool.query(
    `INSERT INTO performance_periods (name, period_type, start_date, end_date, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.name, data.period_type || 'monthly', data.start_date, data.end_date, user.id]
  );
  return rows[0];
}

function authorName(user) {
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';
}

export async function getReportById(id) {
  const { rows } = await pool.query(
    `SELECT r.*, ru.first_name AS recipient_first_name, ru.last_name AS recipient_last_name, ru.username AS recipient_username
     FROM performance_reports r LEFT JOIN users ru ON ru.id = r.recipient_id WHERE r.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const { recipient_first_name, recipient_last_name, recipient_username, ...row } = rows[0];
  const recipient_name = row.recipient_id
    ? (`${recipient_first_name || ''} ${recipient_last_name || ''}`.trim() || recipient_username)
    : null;
  const [reviews, documents, period] = await Promise.all([
    pool.query(`SELECT * FROM performance_report_reviews WHERE report_id = $1 ORDER BY created_at ASC`, [id]),
    pool.query(`SELECT * FROM performance_report_documents WHERE report_id = $1 ORDER BY created_at ASC`, [id]),
    getPeriodById(row.period_id),
  ]);
  return { ...row, recipient_name, reviews: reviews.rows, documents: documents.rows, period };
}

export async function createReport(data, user) {
  const period = await getPeriodById(data.period_id);
  if (!period) throw new Error('Assessment period not found');
  const unit = unitsOfUser(user)[0] || null;
  const { rows } = await pool.query(
    `INSERT INTO performance_reports (period_id, employee_id, employee_name, unit, title, summary, status, current_stage, company)
     VALUES ($1,$2,$3,$4,$5,$6,'draft','employee',$7) RETURNING *`,
    [data.period_id, user.id, authorName(user), unit, data.title, data.summary || null, user.company || 'CW']
  );
  return rows[0];
}

export async function submitReport(reportId, user, recipientId) {
  const report = await getReportById(reportId);
  if (!report) throw new Error('Report not found');
  if (report.employee_id !== user.id) throw new Error('Only the report owner can submit it');
  if (!['draft', 'needs_revision'].includes(report.status) || report.current_stage !== 'employee') {
    throw new Error('Report is not awaiting submission');
  }

  const scoring = await computeSystemScore(user.id, report.period);
  // Route from the SUBMITTER's own tier, not always 'employee' — this is what makes a
  // Manager's own report skip Supervisor/Manager review and go straight to CTO.
  const nextStage = await resolveNextStage(report.unit, tierOfUser(user));
  const recipient = await resolveRecipient(report.unit, nextStage, recipientId);

  const { rows } = await pool.query(
    `UPDATE performance_reports SET
       status = $2, current_stage = $3,
       system_score = $4, attendance_score = $5, system_score_breakdown = $6, recipient_id = $7,
       submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [reportId, nextStage === 'cto' ? 'submitted_cto' : STAGE_TO_STATUS[nextStage], nextStage,
      scoring.system_score, scoring.attendance_score, JSON.stringify(scoring.breakdown), recipient]
  );
  await pool.query(
    `INSERT INTO performance_report_reviews (report_id, stage, reviewer_id, reviewer_name, action, comment_text)
     VALUES ($1,'employee',$2,$3,'submit',$4)`,
    [reportId, user.id, authorName(user), `Submitted for review.`]
  );
  return rows[0];
}

/** If the caller picked a specific person, use them only if they're actually a real candidate
 *  for this unit+tier right now (never trust a client-supplied id outright); otherwise leave it
 *  unset — the queue stays open to everyone at that tier in the unit either way. */
async function resolveRecipient(unit, tier, recipientId) {
  if (!recipientId) return null;
  const candidates = await listTierCandidates(unit, tier);
  const match = candidates.find((c) => c.id === Number(recipientId));
  return match ? match.id : null;
}

/** A reviewer at `stage` scores + comments, then forwards to the next real stage in this unit
 *  (skipping any tier the unit has nobody in). */
export async function reviewAndForward(reportId, stage, { score, comments }, user, recipientId) {
  const report = await getReportById(reportId);
  if (!report) throw new Error('Report not found');
  if (report.current_stage !== stage) throw new Error(`Report is not awaiting ${stage} review`);

  const nextStage = await resolveNextStage(report.unit, stage);
  const isFinal = nextStage === 'cto' && stage === 'cto';
  const nextStatus = isFinal ? 'under_cto_review' : (nextStage === 'cto' ? 'submitted_cto' : STAGE_TO_STATUS[nextStage]);
  const recipient = isFinal ? null : await resolveRecipient(report.unit, nextStage, recipientId);

  const scoreCol = `${stage}_score`, commentCol = `${stage}_comments`, byCol = `${stage}_reviewed_by`, atCol = `${stage}_reviewed_at`;
  const { rows } = await pool.query(
    `UPDATE performance_reports SET
       ${scoreCol} = $3, ${commentCol} = $4, ${byCol} = $5, ${atCol} = CURRENT_TIMESTAMP,
       status = $2, current_stage = $6, recipient_id = $8, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = $7 RETURNING *`,
    [reportId, nextStatus, score ?? null, comments || null, user.id, stage === 'cto' ? 'cto' : nextStage, stage, recipient]
  );
  if (!rows[0]) throw new Error(`Report is no longer awaiting ${stage} review`);

  await pool.query(
    `INSERT INTO performance_report_reviews (report_id, stage, reviewer_id, reviewer_name, action, score, comment_text)
     VALUES ($1,$2,$3,$4,'forward',$5,$6)`,
    [reportId, stage, user.id, authorName(user), score ?? null, comments || null]
  );
  return rows[0];
}

// Always back to the report's original author, not "the previous reviewing tier" — a fixed
// reverse chain (cto->manager->supervisor->employee) would be wrong whenever a tier was
// skipped on the way up (e.g. a Manager's own report, which never had a Supervisor/Manager
// review stage to "return" to). The author is the only one who can act on a revision request
// regardless of which stage raised it.
export async function sendBackToRevision(reportId, stage, comment, user) {
  const text = String(comment || '').trim();
  if (!text) throw new Error('A comment is required when sending a report back for revision');
  if (!TIER_ORDER.includes(stage) || stage === 'employee') throw new Error('Cannot send back from this stage');

  const { rows } = await pool.query(
    `UPDATE performance_reports SET status = 'needs_revision', current_stage = 'employee', recipient_id = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = $2 RETURNING *`,
    [reportId, stage]
  );
  if (!rows[0]) throw new Error(`Report is not awaiting ${stage} review`);

  await pool.query(
    `INSERT INTO performance_report_reviews (report_id, stage, reviewer_id, reviewer_name, action, comment_text)
     VALUES ($1,$2,$3,$4,'send_back',$5)`,
    [reportId, stage, user.id, authorName(user), text]
  );
  return rows[0];
}

export async function finalizeReport(reportId, { score, comments }, user) {
  const report = await getReportById(reportId);
  if (!report) throw new Error('Report not found');
  if (report.current_stage !== 'cto') throw new Error('Report is not awaiting CTO finalization');

  const weights = await getActiveWeights();
  const ctoScore = score ?? report.cto_score;
  const parts = [
    { value: report.system_score, weight: Number(weights.system_weight) },
    { value: report.supervisor_score, weight: Number(weights.supervisor_weight) },
    { value: report.manager_score, weight: Number(weights.manager_weight) },
    { value: ctoScore, weight: Number(weights.cto_weight) },
  ].filter((p) => p.value != null);
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const finalScore = totalWeight > 0 ? Math.round((parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight) * 10) / 10 : null;

  const { rows } = await pool.query(
    `UPDATE performance_reports SET
       cto_score = $2, cto_comments = $3, cto_reviewed_by = $4, cto_reviewed_at = CURRENT_TIMESTAMP,
       final_score = $5, status = 'finalized', current_stage = 'done',
       finalized_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'cto' RETURNING *`,
    [reportId, ctoScore ?? null, comments || null, user.id, finalScore]
  );
  if (!rows[0]) throw new Error('Report is not awaiting CTO finalization');

  await pool.query(
    `INSERT INTO performance_report_reviews (report_id, stage, reviewer_id, reviewer_name, action, score, comment_text)
     VALUES ($1,'cto',$2,$3,'finalize',$4,$5)`,
    [reportId, user.id, authorName(user), ctoScore ?? null, comments || null]
  );
  return rows[0];
}

/** Reports currently sitting in this viewer's queue: their tier, their unit (CTO/director see
 *  every unit). Mirrors the ticket-queue "who owns this right now" convention. */
export async function listQueueForUser(user, filters = {}) {
  const tier = tierOfUser(user);
  const params = [tier];
  let where = `current_stage = $1`;
  if (tier !== 'cto') {
    const units = unitsOfUser(user);
    if (!units.length) return [];
    params.push(units);
    where += ` AND LOWER(unit) = ANY($${params.length})`;
  }
  if (filters.status) { params.push(filters.status); where += ` AND status = $${params.length}`; }
  if (filters.period_id) { params.push(filters.period_id); where += ` AND period_id = $${params.length}`; }
  // Company scope applies even to the CTO's "every unit" bypass above — that means every unit
  // in their own company, not every tenant's. Only a true System Admin skips this.
  if (!isSystemAdminAccount(user)) {
    params.push(user.company || 'CW');
    where += ` AND company = $${params.length}`;
  }
  const { rows } = await pool.query(`SELECT * FROM performance_reports WHERE ${where} ORDER BY submitted_at DESC NULLS LAST`, params);
  return rows;
}

/** Reports this reviewer has already acted on (scored/forwarded/sent back/finalized), most
 *  recent first — so a Team/Unit/Executive Review queue that happens to be empty right now can
 *  still show something meaningful instead of a blank page. */
export async function listRecentActivityForUser(userId, limit = 5) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (rev.report_id)
       rev.report_id, rev.action, rev.score, rev.created_at,
       r.title, r.employee_name, r.unit, r.status, r.current_stage
     FROM performance_report_reviews rev
     JOIN performance_reports r ON r.id = rev.report_id
     WHERE rev.reviewer_id = $1
     ORDER BY rev.report_id, rev.created_at DESC`,
    [userId]
  );
  return rows
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit);
}

export async function listMyReports(userId) {
  const { rows } = await pool.query(`SELECT * FROM performance_reports WHERE employee_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows;
}

/** HR gets automatic access the moment a report reaches CTO — not before. Not unit-scoped, but
 *  still company-scoped (unless the caller is a true System Admin) so PTEL's HR never sees
 *  C&W's reports or vice versa. */
export async function listHrAccessible(filters = {}, user = null) {
  const params = [];
  let where = `current_stage IN ('cto','done')`;
  if (filters.status) { params.push(filters.status); where += ` AND status = $${params.length}`; }
  if (filters.period_id) { params.push(filters.period_id); where += ` AND period_id = $${params.length}`; }
  if (filters.unit) { params.push(filters.unit.toLowerCase()); where += ` AND LOWER(unit) = $${params.length}`; }
  if (user && !isSystemAdminAccount(user)) {
    params.push(user.company || 'CW');
    where += ` AND company = $${params.length}`;
  }
  const { rows } = await pool.query(`SELECT * FROM performance_reports WHERE ${where} ORDER BY submitted_at DESC NULLS LAST`, params);
  return rows;
}

export async function addDocument(reportId, stage, fileInfo, user) {
  // Server-side conversion is temporarily disabled (see performanceDocumentConversion.js) — every
  // upload lands as 'not_needed' so nothing ever sits in a blocking 'pending' state. The column
  // stays so a future unified DOCX/PPTX->PDF viewer upgrade can resume setting 'pending'/'done'.
  const { rows } = await pool.query(
    `INSERT INTO performance_report_documents
       (report_id, stage, original_name, display_name, mime_type, extension, size_bytes, file_path, conversion_status, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'not_needed',$9) RETURNING *`,
    [reportId, stage, fileInfo.original_name, fileInfo.display_name || fileInfo.original_name, fileInfo.mime_type,
      fileInfo.extension, fileInfo.size_bytes, fileInfo.file_path, user.id]
  );
  return rows[0];
}

export async function getDocumentById(id) {
  const { rows } = await pool.query(`SELECT * FROM performance_report_documents WHERE id = $1`, [id]);
  return rows[0] || null;
}
