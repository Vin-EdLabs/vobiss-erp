import pool from '../db.js';
import { createNotification } from '../db.js';
import { isSystemAdminAccount, userHasAnyRole, effectiveUnitsForUser, MANAGER_ROLES, SUPERVISOR_ROLES } from '../roles.js';
import { formatRecordLabel, recordViewPath } from './activityLog.js';

/**
 * Central, workflow-agnostic time-tracking engine. Every existing workflow route calls
 * recordTimingEvent() alongside its existing logUserAction()/createNotification() calls —
 * this file never modifies any existing workflow logic, only observes it.
 *
 * Design: an append-only event log (workflow_time_events) plus derived, auto-closing
 * "segments" (workflow_time_segments) — one open segment per (workflowType, recordId) at a
 * time, representing who/which unit currently holds the work and since when. This mirrors
 * the two best-instrumented existing tables in this codebase (tickets' ticket_timeline and
 * WIP's project_wip_history), generalized across every workflow type instead of one each.
 *
 * No tenant_id: confirmed via direct audit that this app has no tenant column anywhere.
 * unit_slug (not unit_id): confirmed there is no normalized units table to reference —
 * unit_slug values are the same free-text tags already used everywhere (users.unit,
 * effectiveUnitsForUser(), project_units.slug).
 */

const TERMINAL_EVENT_TYPES = new Set(['completed', 'cancelled', 'rejected']);

let tableReady = false;
export async function ensureTimeEngineTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workflow_time_config (
      id SERIAL PRIMARY KEY,
      workflow_type VARCHAR(60) NOT NULL,
      stage_name VARCHAR(80) NOT NULL,
      unit_slug VARCHAR(60),
      expected_duration_minutes INTEGER,
      warning_threshold_minutes INTEGER,
      critical_threshold_minutes INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE NULLS NOT DISTINCT (workflow_type, stage_name, unit_slug)
    );
    CREATE TABLE IF NOT EXISTS workflow_time_events (
      id SERIAL PRIMARY KEY,
      workflow_type VARCHAR(60) NOT NULL,
      record_id INTEGER NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      stage_name VARCHAR(80),
      from_unit_slug VARCHAR(60),
      to_unit_slug VARCHAR(60),
      from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      to_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      triggered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS wf_time_events_record_idx ON workflow_time_events(workflow_type, record_id, created_at);
    CREATE TABLE IF NOT EXISTS workflow_time_segments (
      id SERIAL PRIMARY KEY,
      workflow_type VARCHAR(60) NOT NULL,
      record_id INTEGER NOT NULL,
      unit_slug VARCHAR(60),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      stage_name VARCHAR(80),
      started_at TIMESTAMP NOT NULL,
      ended_at TIMESTAMP,
      duration_minutes INTEGER,
      is_waiting BOOLEAN NOT NULL DEFAULT FALSE,
      is_credit_only BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS wf_time_segments_record_idx ON workflow_time_segments(workflow_type, record_id);
    CREATE INDEX IF NOT EXISTS wf_time_segments_open_idx ON workflow_time_segments(workflow_type, record_id, ended_at) WHERE ended_at IS NULL;
    CREATE INDEX IF NOT EXISTS wf_time_segments_unit_idx ON workflow_time_segments(unit_slug, started_at);
    CREATE INDEX IF NOT EXISTS wf_time_segments_user_idx ON workflow_time_segments(user_id, started_at);
  `);
  try {
    await pool.query(`ALTER TABLE workflow_time_segments ADD COLUMN IF NOT EXISTS is_credit_only BOOLEAN NOT NULL DEFAULT FALSE`);
  } catch (e) {
    console.warn('[workflow-time-engine] is_credit_only migration:', e.message);
  }
  tableReady = true;
}

/** Default expected/warning/critical minutes seeded per workflow type so the dashboard isn't empty on day one. */
const DEFAULT_CONFIG = [
  { workflow_type: 'ticket', stage_name: 'first_response', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'ticket', stage_name: 'resolution', expected: 240, warning: 180, critical: 240 },
  { workflow_type: 'material_request', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'material_request', stage_name: 'execution', expected: 60, warning: 45, critical: 60 },
  { workflow_type: 'cash_request', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'cash_request', stage_name: 'finance_processing', expected: 60, warning: 45, critical: 60 },
  { workflow_type: 'item_return', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'signoff_form', stage_name: 'pending_approval', expected: 60, warning: 45, critical: 60 },
  { workflow_type: 'service_request', stage_name: 'ts_review', expected: 120, warning: 90, critical: 120 },
  { workflow_type: 'service_request', stage_name: 'ip_review', expected: 120, warning: 90, critical: 120 },
  { workflow_type: 'service_request', stage_name: 'noc_review', expected: 120, warning: 90, critical: 120 },
  // Service Request pipeline (Design/Sales/Project) — a request can originate from either
  // Design or Sales, so the same conceptual "Design unit" / "Project unit" stage is logged
  // under two different workflow_type chains depending on origin (see recordTimingEvent call
  // sites in project.routes.js). Configuration's "Service Request SLA" section edits both
  // halves of each pair together so this duality stays invisible to the admin.
  { workflow_type: 'design_request', stage_name: 'design', expected: 1440, warning: 1080, critical: 1440 },
  { workflow_type: 'sales_request', stage_name: 'design', expected: 1440, warning: 1080, critical: 1440 },
  { workflow_type: 'design_request', stage_name: 'sales', expected: 480, warning: 360, critical: 480 },
  { workflow_type: 'sales_request', stage_name: 'project', expected: 480, warning: 360, critical: 480 },
  { workflow_type: 'service_request', stage_name: 'project', expected: 2880, warning: 2160, critical: 2880 },
  { workflow_type: 'wip_entry', stage_name: 'in_progress', expected: 1440, warning: 1080, critical: 1440 },
  { workflow_type: 'transport_request', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'fuel_request', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'vehicle_request', stage_name: 'pending_approval', expected: 30, warning: 25, critical: 30 },
  { workflow_type: 'field_work', stage_name: 'assigned', expected: 60, warning: 45, critical: 90 },
  { workflow_type: 'field_work', stage_name: 'travelling', expected: 60, warning: 90, critical: 120 },
  { workflow_type: 'field_work', stage_name: 'on_site', expected: 240, warning: 300, critical: 480 },
  { workflow_type: 'field_work', stage_name: 'awaiting_noc', expected: 60, warning: 120, critical: 240 },
  { workflow_type: 'field_work', stage_name: 'awaiting_client', expected: 1440, warning: 2880, critical: 4320 },
  { workflow_type: 'ip_circuit_request', stage_name: 'ip_manager', expected: 60, warning: 90, critical: 180 },
  { workflow_type: 'ip_circuit_request', stage_name: 'awaiting_return', expected: 30, warning: 60, critical: 120 },
];

export async function seedDefaultConfig(systemUserId = null) {
  for (const c of DEFAULT_CONFIG) {
    await pool.query(
      `INSERT INTO workflow_time_config
         (workflow_type, stage_name, unit_slug, expected_duration_minutes, warning_threshold_minutes, critical_threshold_minutes, created_by)
       SELECT $1::varchar, $2::varchar, NULL::varchar, $3::integer, $4::integer, $5::integer, $6::integer
       WHERE NOT EXISTS (
         SELECT 1 FROM workflow_time_config WHERE workflow_type = $1::varchar AND stage_name = $2::varchar AND unit_slug IS NULL
       )`,
      [c.workflow_type, c.stage_name, c.expected, c.warning, c.critical, systemUserId]
    );
  }
}

/**
 * Records a timing event and maintains the open/closed segment chain for a record.
 * Never throws — fire-and-safe, exactly like logUserAction(). Callers should still
 * .catch(() => {}) defensively since this may be called without awaiting.
 *
 * `opts.attributeToUserId` — for pool-style stages (e.g. "pending_approval", with no single
 * assignee) the segment that closes here almost always has user_id = null, so whoever actually
 * acted (approved/rejected/issued) would never show up in their own Staff Assessment. Pass the
 * acting user's id here and a SEPARATE, already-closed segment is recorded for them with the
 * exact same duration as the segment that just closed — crediting their turnaround time without
 * disturbing the pool-level segment chain itself.
 */
export async function recordTimingEvent(opts = {}) {
  try {
    const workflowType = String(opts.workflowType || '').trim();
    const recordId = Number(opts.recordId);
    const eventType = String(opts.eventType || '').trim();
    if (!workflowType || !Number.isInteger(recordId) || !eventType) return;

    await ensureTimeEngineTables();

    const stageName = opts.stageName ? String(opts.stageName).trim() : null;
    const fromUnitSlug = opts.fromUnitSlug || null;
    const toUnitSlug = opts.toUnitSlug || null;
    const fromUserId = opts.fromUserId || null;
    const toUserId = opts.toUserId || null;
    const triggeredByUserId = opts.triggeredByUserId || null;
    const notes = opts.notes || null;
    const isWaiting = opts.isWaiting === true;

    await pool.query(
      `INSERT INTO workflow_time_events
         (workflow_type, record_id, event_type, stage_name, from_unit_slug, to_unit_slug, from_user_id, to_user_id, triggered_by_user_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [workflowType, recordId, eventType, stageName, fromUnitSlug, toUnitSlug, fromUserId, toUserId, triggeredByUserId, notes]
    );

    const openSegment = await pool.query(
      `SELECT * FROM workflow_time_segments
       WHERE workflow_type = $1 AND record_id = $2 AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [workflowType, recordId]
    );
    if (openSegment.rows[0]) {
      await pool.query(
        `UPDATE workflow_time_segments
         SET ended_at = CURRENT_TIMESTAMP,
             duration_minutes = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) / 60))
         WHERE id = $1`,
        [openSegment.rows[0].id]
      );

      if (opts.attributeToUserId) {
        const closed = openSegment.rows[0];
        // is_credit_only = TRUE: this row exists purely so the acting user gets credit in
        // Staff Performance (getStaffPerformance/getStaffLeaderboard) — it duplicates the
        // pool segment above by design (same stage, same duration). It must NEVER be counted
        // in a record's own timeline/total (getRecordTurnaround, getLiveOverview) or it shows
        // as a second, confusing "Pending Approval" box for the same approval event.
        await pool.query(
          `INSERT INTO workflow_time_segments (workflow_type, record_id, unit_slug, user_id, stage_name, started_at, ended_at, duration_minutes, is_waiting, is_credit_only)
           VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,GREATEST(0, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - $6::timestamp)) / 60)),FALSE,TRUE)`,
          [workflowType, recordId, closed.unit_slug, opts.attributeToUserId, closed.stage_name, closed.started_at]
        );
      }
    }

    if (!TERMINAL_EVENT_TYPES.has(eventType)) {
      await pool.query(
        `INSERT INTO workflow_time_segments (workflow_type, record_id, unit_slug, user_id, stage_name, started_at, is_waiting)
         VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6)`,
        [workflowType, recordId, toUnitSlug, toUserId, stageName, isWaiting]
      );
    }
  } catch (error) {
    console.error('[workflow-time-engine] recordTimingEvent failed:', error.message);
  }
}

async function getConfigMap(workflowType) {
  const result = await pool.query(
    `SELECT * FROM workflow_time_config WHERE workflow_type = $1 AND is_active = TRUE`,
    [workflowType]
  );
  const byStage = new Map();
  for (const row of result.rows) byStage.set(row.stage_name, row);
  return byStage;
}

function slaStatusFor(minutes, config) {
  if (!config) return 'no_config';
  if (config.critical_threshold_minutes != null && minutes >= config.critical_threshold_minutes) return 'breached';
  if (config.warning_threshold_minutes != null && minutes >= config.warning_threshold_minutes) return 'warning';
  return 'on_track';
}

/** Full timing breakdown for one record: total elapsed, per-unit, per-user, per-stage, waiting vs active, SLA status. */
export async function getRecordTurnaround(workflowType, recordId) {
  await ensureTimeEngineTables();
  const segments = await pool.query(
    `SELECT s.*, u.first_name, u.last_name, u.username
     FROM workflow_time_segments s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.workflow_type = $1 AND s.record_id = $2
     ORDER BY s.started_at ASC`,
    [workflowType, recordId]
  );
  if (!segments.rows.length) return null;

  const configByStage = await getConfigMap(workflowType);
  const now = new Date();
  const first = segments.rows[0];
  let totalElapsedMinutes = 0;
  let waitingMinutes = 0;
  let activeMinutes = 0;
  const byUnit = new Map();
  const byUser = new Map();
  const byStage = [];
  const exceededStages = [];

  // Credit-only rows exist purely so the acting user gets turnaround credit in Staff
  // Performance — they duplicate a real pool segment's stage/duration by design (see
  // recordTimingEvent's attributeToUserId branch). Rendering them as their own timeline box
  // is what made the same approval show up twice ("Pending Approval" then "Sarah Chrapah /
  // Pending Approval" right after it) and doubled the total. Instead, pull the acting user's
  // name from their credit row and attach it to the pool segment it duplicates.
  const creditNameByTwin = new Map();
  for (const seg of segments.rows) {
    if (!seg.is_credit_only) continue;
    const name = `${seg.first_name || ''} ${seg.last_name || ''}`.trim() || seg.username || null;
    if (name) {
      const key = `${seg.stage_name}|${new Date(seg.started_at).getTime()}|${seg.ended_at ? new Date(seg.ended_at).getTime() : ''}`;
      creditNameByTwin.set(key, name);
    }
  }

  for (const seg of segments.rows) {
    const started = new Date(seg.started_at);
    const ended = seg.ended_at ? new Date(seg.ended_at) : now;
    const minutes = seg.duration_minutes != null ? seg.duration_minutes : Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60000));

    if (seg.user_id) {
      const key = seg.user_id;
      const name = `${seg.first_name || ''} ${seg.last_name || ''}`.trim() || seg.username || `User #${seg.user_id}`;
      const prev = byUser.get(key) || { userId: seg.user_id, fullName: name, minutes: 0 };
      prev.minutes += minutes;
      byUser.set(key, prev);
    }

    if (seg.is_credit_only) continue; // already folded into byUser above — never into the timeline/totals below

    totalElapsedMinutes += minutes;
    if (seg.is_waiting) waitingMinutes += minutes;
    else activeMinutes += minutes;
    if (seg.unit_slug) byUnit.set(seg.unit_slug, (byUnit.get(seg.unit_slug) || 0) + minutes);

    const config = seg.stage_name ? configByStage.get(seg.stage_name) : null;
    const status = slaStatusFor(minutes, config);
    const twinName = seg.user_id
      ? null
      : creditNameByTwin.get(`${seg.stage_name}|${started.getTime()}|${seg.ended_at ? ended.getTime() : ''}`) || null;
    byStage.push({
      stageName: seg.stage_name,
      unitSlug: seg.unit_slug,
      userId: seg.user_id,
      userFullName: seg.user_id ? (`${seg.first_name || ''} ${seg.last_name || ''}`.trim() || seg.username || null) : twinName,
      // Who closed this pool segment (only meaningful once it's closed — an OPEN pool
      // segment has no actor yet; the frontend falls back to "pending approver(s)" there).
      approvedByName: twinName,
      startedAt: seg.started_at,
      endedAt: seg.ended_at,
      minutes,
      isWaiting: seg.is_waiting,
      slaStatus: status,
      expectedMinutes: config?.expected_duration_minutes ?? null,
    });
    if (status === 'breached') {
      exceededStages.push({ stageName: seg.stage_name, minutes, criticalThresholdMinutes: config?.critical_threshold_minutes ?? null });
    }
  }

  const lastStageEntry = byStage[byStage.length - 1] || null;
  const isOpen = !!lastStageEntry && !lastStageEntry.endedAt;

  return {
    workflowType,
    recordId,
    startedAt: first.started_at,
    isOpen,
    totalElapsedMinutes,
    waitingMinutes,
    activeMinutes,
    byUnit: [...byUnit.entries()].map(([unitSlug, minutes]) => ({ unitSlug, minutes })),
    byUser: [...byUser.values()],
    byStage,
    slaStatus: isOpen ? lastStageEntry.slaStatus : null,
    exceededStages,
  };
}

/** Who currently owns this record (the single open segment), or null if the record has no open segment (completed/cancelled/rejected/never started). */
export async function getCurrentOwnership(workflowType, recordId) {
  await ensureTimeEngineTables();
  const result = await pool.query(
    `SELECT s.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name
     FROM workflow_time_segments s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.workflow_type = $1 AND s.record_id = $2 AND s.ended_at IS NULL
     ORDER BY s.started_at DESC LIMIT 1`,
    [workflowType, recordId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    unitSlug: row.unit_slug,
    userId: row.user_id,
    userFullName: row.full_name || null,
    stageName: row.stage_name,
    since: row.started_at,
  };
}

export async function getStaffPerformance(userId, { dateFrom, dateTo, workflowType } = {}) {
  await ensureTimeEngineTables();
  const clauses = ['s.user_id = $1', 's.ended_at IS NOT NULL'];
  const params = [userId];
  if (workflowType) { params.push(workflowType); clauses.push(`s.workflow_type = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`s.started_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`s.started_at <= $${params.length}`); }

  const result = await pool.query(
    `SELECT s.workflow_type, COUNT(*) AS count,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            MIN(s.duration_minutes) AS fastest_minutes,
            MAX(s.duration_minutes) AS slowest_minutes
     FROM workflow_time_segments s
     WHERE ${clauses.join(' AND ')}
     GROUP BY s.workflow_type
     ORDER BY s.workflow_type`,
    params
  );
  return result.rows.map((r) => ({
    workflowType: r.workflow_type,
    count: Number(r.count),
    avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
    fastestMinutes: r.fastest_minutes != null ? Number(r.fastest_minutes) : null,
    slowestMinutes: r.slowest_minutes != null ? Number(r.slowest_minutes) : null,
  }));
}

/** All staff with closed segments in range, for the Staff Performance table. Optionally scoped to a set of unit slugs (manager view). */
export async function getStaffLeaderboard({ dateFrom, dateTo, workflowType, unitSlugs } = {}) {
  await ensureTimeEngineTables();
  const clauses = ['s.ended_at IS NOT NULL', 's.user_id IS NOT NULL'];
  const params = [];
  if (workflowType) { params.push(workflowType); clauses.push(`s.workflow_type = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`s.started_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`s.started_at <= $${params.length}`); }
  if (unitSlugs && unitSlugs.length) { params.push(unitSlugs); clauses.push(`s.unit_slug = ANY($${params.length}::text[])`); }

  const result = await pool.query(
    `SELECT s.user_id,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name,
            u.unit,
            COUNT(*) AS count,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            MIN(s.duration_minutes) AS fastest_minutes,
            MAX(s.duration_minutes) AS slowest_minutes
     FROM workflow_time_segments s
     JOIN users u ON u.id = s.user_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY s.user_id, full_name, u.unit
     ORDER BY count DESC
     LIMIT 100`,
    params
  );
  return result.rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    unitSlug: r.unit,
    count: Number(r.count),
    avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
    fastestMinutes: r.fastest_minutes != null ? Number(r.fastest_minutes) : null,
    slowestMinutes: r.slowest_minutes != null ? Number(r.slowest_minutes) : null,
  }));
}

export async function getUnitPerformance(unitSlug, { dateFrom, dateTo, workflowType } = {}) {
  await ensureTimeEngineTables();
  const clauses = ['s.unit_slug = $1', 's.ended_at IS NOT NULL'];
  const params = [unitSlug];
  if (workflowType) { params.push(workflowType); clauses.push(`s.workflow_type = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`s.started_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`s.started_at <= $${params.length}`); }

  const result = await pool.query(
    `SELECT s.workflow_type, s.stage_name, COUNT(*) AS count, ROUND(AVG(s.duration_minutes)) AS avg_minutes
     FROM workflow_time_segments s
     WHERE ${clauses.join(' AND ')}
     GROUP BY s.workflow_type, s.stage_name
     ORDER BY s.workflow_type, s.stage_name`,
    params
  );

  const configByKey = new Map(
    (await pool.query(`SELECT * FROM workflow_time_config WHERE unit_slug = $1 OR unit_slug IS NULL`, [unitSlug])).rows.map((c) => [`${c.workflow_type}|${c.stage_name}`, c])
  );
  let breachedCount = 0;
  let total = 0;
  const rows = result.rows.map((r) => {
    total += Number(r.count);
    const config = configByKey.get(`${r.workflow_type}|${r.stage_name}`);
    const avg = r.avg_minutes != null ? Number(r.avg_minutes) : null;
    const status = avg != null ? slaStatusFor(avg, config) : 'no_config';
    if (status === 'breached') breachedCount += Number(r.count);
    return { workflowType: r.workflow_type, stageName: r.stage_name, count: Number(r.count), avgMinutes: avg, slaStatus: status };
  });

  return { unitSlug, stages: rows, slaComplianceRate: total ? Math.round(((total - breachedCount) / total) * 100) : null };
}

export async function getSlaBreaches({ dateFrom, dateTo, workflowType, unitSlug } = {}) {
  await ensureTimeEngineTables();
  const clauses = ['1=1'];
  const params = [];
  if (workflowType) { params.push(workflowType); clauses.push(`s.workflow_type = $${params.length}`); }
  if (unitSlug) { params.push(unitSlug); clauses.push(`s.unit_slug = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`s.started_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`s.started_at <= $${params.length}`); }

  const result = await pool.query(
    `SELECT s.*, c.critical_threshold_minutes, c.expected_duration_minutes
     FROM workflow_time_segments s
     JOIN workflow_time_config c ON c.workflow_type = s.workflow_type AND c.stage_name = s.stage_name AND (c.unit_slug = s.unit_slug OR c.unit_slug IS NULL)
     WHERE ${clauses.join(' AND ')}
       AND c.critical_threshold_minutes IS NOT NULL
       AND COALESCE(s.duration_minutes, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.started_at)) / 60)) >= c.critical_threshold_minutes
     ORDER BY s.started_at DESC
     LIMIT 200`,
    params
  );
  return result.rows.map((r) => ({
    workflowType: r.workflow_type,
    recordId: r.record_id,
    stageName: r.stage_name,
    unitSlug: r.unit_slug,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    actualMinutes: r.duration_minutes ?? Math.round((Date.now() - new Date(r.started_at).getTime()) / 60000),
    expectedMinutes: r.expected_duration_minutes,
    criticalThresholdMinutes: r.critical_threshold_minutes,
  }));
}

/** Every currently-open segment (live, in-progress work), with elapsed time and SLA status — powers the dashboard + the notification sweep. */
export async function getLiveOverview() {
  await ensureTimeEngineTables();
  const result = await pool.query(
    `SELECT s.*, COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name
     FROM workflow_time_segments s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.ended_at IS NULL
     ORDER BY s.started_at ASC`
  );
  const configs = await pool.query(`SELECT * FROM workflow_time_config WHERE is_active = TRUE`);
  const configByKey = new Map(configs.rows.map((c) => [`${c.workflow_type}|${c.stage_name}`, c]));
  const now = Date.now();

  return result.rows.map((r) => {
    const elapsedMinutes = Math.max(0, Math.round((now - new Date(r.started_at).getTime()) / 60000));
    const config = configByKey.get(`${r.workflow_type}|${r.stage_name}`);
    return {
      segmentId: r.id,
      workflowType: r.workflow_type,
      recordId: r.record_id,
      stageName: r.stage_name,
      unitSlug: r.unit_slug,
      userId: r.user_id,
      userFullName: r.full_name || null,
      startedAt: r.started_at,
      elapsedMinutes,
      slaStatus: slaStatusFor(elapsedMinutes, config),
      expectedMinutes: config?.expected_duration_minutes ?? null,
      warningThresholdMinutes: config?.warning_threshold_minutes ?? null,
      criticalThresholdMinutes: config?.critical_threshold_minutes ?? null,
    };
  });
}

export async function getWorkflowTimeConfig() {
  await ensureTimeEngineTables();
  const result = await pool.query(`SELECT * FROM workflow_time_config ORDER BY workflow_type, stage_name`);
  return result.rows;
}

export async function upsertWorkflowTimeConfig(payload, userId) {
  await ensureTimeEngineTables();
  const {
    workflow_type: workflowType,
    stage_name: stageName,
    unit_slug: unitSlug = null,
    expected_duration_minutes: expected,
    warning_threshold_minutes: warning,
    critical_threshold_minutes: critical,
    is_active: isActive = true,
  } = payload;
  const result = await pool.query(
    `INSERT INTO workflow_time_config
       (workflow_type, stage_name, unit_slug, expected_duration_minutes, warning_threshold_minutes, critical_threshold_minutes, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (workflow_type, stage_name, unit_slug) DO UPDATE SET
       expected_duration_minutes = EXCLUDED.expected_duration_minutes,
       warning_threshold_minutes = EXCLUDED.warning_threshold_minutes,
       critical_threshold_minutes = EXCLUDED.critical_threshold_minutes,
       is_active = EXCLUDED.is_active,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [workflowType, stageName, unitSlug, expected, warning, critical, isActive, userId]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// SLA notification sweep — call on an interval (see server.js), same shape as
// backend/ticketEscalation.js's processAutoEscalations(). Caps notifications at
// one per (segment, level) per hour via an in-memory marker — losing this on a
// server restart just risks one possible duplicate notification, an acceptable
// tradeoff versus adding more schema for a purely transient dedup concern.
// ---------------------------------------------------------------------------

const NOTIFIED_AT = new Map(); // `${segmentId}:${level}` -> timestamp ms
const NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

async function resolveUnitManagerIds(unitSlug) {
  if (!unitSlug) return [];
  const result = await pool.query(
    `SELECT id, main_role, role, units, unit FROM users
     WHERE deleted_at IS NULL AND (role = ANY($1::text[]) OR main_role = ANY($1::text[]))`,
    [[...MANAGER_ROLES, ...SUPERVISOR_ROLES]]
  );
  return result.rows.filter((u) => effectiveUnitsForUser(u).includes(unitSlug)).map((u) => u.id);
}

async function resolveSystemAdminIds() {
  const result = await pool.query(
    `SELECT id FROM users WHERE deleted_at IS NULL AND (role IN ('superadmin','system_admin') OR main_role IN ('superadmin','system_admin'))`
  );
  return result.rows.map((r) => r.id);
}

export async function checkSlaThresholdsAndNotify() {
  await ensureTimeEngineTables();
  const live = await getLiveOverview();
  let notified = 0;

  for (const seg of live) {
    if (seg.slaStatus !== 'warning' && seg.slaStatus !== 'breached') continue;
    const key = `${seg.segmentId}:${seg.slaStatus}`;
    const last = NOTIFIED_AT.get(key);
    if (last && Date.now() - last < NOTIFY_COOLDOWN_MS) continue;
    NOTIFIED_AT.set(key, Date.now());

    const label = formatRecordLabel(seg.workflowType, seg.recordId);
    const linkUrl = recordViewPath(seg.workflowType, seg.recordId);
    const managerIds = await resolveUnitManagerIds(seg.unitSlug);

    if (seg.slaStatus === 'warning') {
      const message = `${label} is approaching its SLA limit — currently in ${seg.stageName || 'progress'} for ${formatMinutes(seg.elapsedMinutes)}`;
      await Promise.all(managerIds.map((userId) =>
        createNotification('SLA Warning', message, null, { targetUserId: userId, linkUrl, notificationType: 'workflow_sla_warning' }).catch(() => {})
      ));
    } else {
      const overdueBy = formatMinutes(seg.elapsedMinutes - (seg.criticalThresholdMinutes || seg.elapsedMinutes));
      const message = `${label} has breached its SLA in ${seg.stageName || 'progress'} — ${overdueBy} overdue`;
      const adminIds = await resolveSystemAdminIds();
      const recipients = [...new Set([...managerIds, ...adminIds])];
      await Promise.all(recipients.map((userId) =>
        createNotification('SLA Breach', message, null, { targetUserId: userId, linkUrl, notificationType: 'workflow_sla_breach' }).catch(() => {})
      ));
    }
    notified += 1;
  }

  // Bound memory: forget markers older than the cooldown window.
  const cutoff = Date.now() - NOTIFY_COOLDOWN_MS;
  for (const [k, t] of NOTIFIED_AT) if (t < cutoff) NOTIFIED_AT.delete(k);

  return { notified };
}
