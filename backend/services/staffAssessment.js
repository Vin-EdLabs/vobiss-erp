import pool from '../db.js';
import { ensureTimeEngineTables } from './workflowTimeEngine.js';
import { formatRecordLabel, recordViewPath } from './activityLog.js';

/**
 * Staff Assessment — turns workflow_time_segments (already recorded by workflowTimeEngine.js)
 * into a fair, per-person performance readout. This module never writes segments, only reads.
 *
 * FAIRNESS RULES (see task spec — non-negotiable):
 * - Personal score uses only CLOSED segments (ended_at IS NOT NULL), owned by this exact user
 *   (user_id = userId), that are NOT waiting/queue time (is_waiting = FALSE).
 * - Service/Design/Sales (project_requests) are unit-level only — no individual assignment
 *   exists for them (confirmed in the time-engine audit), so they are always excluded from any
 *   personal score, defensively, even though their segments already carry user_id = NULL.
 */

const PERSONAL_EXCLUDED_WORKFLOW_TYPES = ['service_request', 'design_request', 'sales_request', 'project_request'];
const MIN_SEGMENTS_FOR_SCORE = 5;

const CONFIG_JOIN = `
  LEFT JOIN LATERAL (
    SELECT * FROM workflow_time_config c
    WHERE c.workflow_type = s.workflow_type AND c.stage_name = s.stage_name AND c.is_active = TRUE
      AND (c.unit_slug = s.unit_slug OR c.unit_slug IS NULL)
    ORDER BY c.unit_slug NULLS LAST
    LIMIT 1
  ) c ON TRUE`;

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

/**
 * The score formula (documented here, the single source of truth):
 *   overall = 0.60 * compliancePct + 0.30 * speedScore + 0.10 * volumeScore
 * - compliancePct (0-100): share of segments that did NOT breach their critical SLA threshold.
 *   Segments with no configured threshold are never counted as a breach (benefit of the doubt).
 * - speedScore (0-100): derived from the average per-segment ratio of expected/actual duration
 *   (each ratio clamped to [0.4, 1.6] before averaging, so one outlier record can't swing the
 *   score). Ratio 1.0 (exactly on the expected time) maps to 50; finishing 50% faster than
 *   expected maps to 100; taking 2x the expected time maps to 0. Segments with no configured
 *   expected duration contribute a neutral ratio of 1.0.
 * - volumeScore (0-100): light nudge comparing this person's segment count to a reference
 *   volume (their unit's median segment count in the same period, or their own count when no
 *   comparison is available). Matching the reference maps to 50 (neutral); double the reference
 *   maps to 100; zero maps to 0. Kept at only 10% weight so high-volume solid performers are
 *   never penalized relative to someone with a tiny, cherry-picked sample — see fairness rules.
 */
function computeCompositeScore({ compliancePct, avgSpeedRatio, volumeRatio }) {
  const speedScore = clamp(50 + (Number(avgSpeedRatio ?? 1) - 1) * 100, 0, 100);
  const volumeScore = clamp(50 + (Number(volumeRatio ?? 1) - 1) * 50, 0, 100);
  const compliance = clamp(Number(compliancePct ?? 0), 0, 100);
  const overall = Math.round(clamp(0.6 * compliance + 0.3 * speedScore + 0.1 * volumeScore, 0, 100));
  return { overall, speedScore: Math.round(speedScore), volumeScore: Math.round(volumeScore) };
}

function scoreLabel(overall) {
  if (overall == null) return 'Insufficient data';
  if (overall >= 85) return 'Excellent';
  if (overall >= 70) return 'Good';
  if (overall >= 50) return 'Fair';
  return 'Needs improvement';
}

function median(sortedAscValues) {
  const n = sortedAscValues.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? sortedAscValues[mid] : (sortedAscValues[mid - 1] + sortedAscValues[mid]) / 2;
}

function displayName(row) {
  return (`${row.first_name || ''} ${row.last_name || ''}`.trim()) || row.username || `User #${row.user_id ?? row.id}`;
}

function defaultPeriod(dateFrom, dateTo) {
  const to = dateTo ? new Date(dateTo) : new Date();
  const from = dateFrom ? new Date(dateFrom) : new Date(to.getFullYear(), to.getMonth(), 1);
  return { from, to };
}

function previousPeriodOf(from, to) {
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1000);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { from: prevFrom, to: prevTo };
}

/** One aggregate stats row for a WHERE clause already built by the caller. */
async function personalAggregate(whereClause, params) {
  const result = await pool.query(
    `SELECT COUNT(*) AS segments,
            COUNT(DISTINCT s.record_id) AS records,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.duration_minutes)) AS median_minutes,
            COALESCE(SUM(s.duration_minutes), 0) AS total_minutes,
            COUNT(*) FILTER (WHERE c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes) AS breaches,
            AVG(CASE WHEN c.expected_duration_minutes IS NOT NULL AND c.expected_duration_minutes > 0
                     THEN LEAST(1.6, GREATEST(0.4, c.expected_duration_minutes::numeric / GREATEST(s.duration_minutes, 1)))
                     ELSE 1 END) AS avg_speed_ratio
     FROM workflow_time_segments s
     ${CONFIG_JOIN}
     WHERE ${whereClause}`,
    params
  );
  const r = result.rows[0] || {};
  const segments = Number(r.segments || 0);
  const breaches = Number(r.breaches || 0);
  return {
    segments,
    records: Number(r.records || 0),
    avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
    medianMinutes: r.median_minutes != null ? Number(r.median_minutes) : null,
    totalMinutes: Number(r.total_minutes || 0),
    breaches,
    compliancePct: segments ? Math.round(((segments - breaches) / segments) * 100) : null,
    avgSpeedRatio: r.avg_speed_ratio != null ? Number(r.avg_speed_ratio) : 1,
  };
}

function personalWhere(params, { userId, unitSlug, dateFrom, dateTo, userColumn = 's.user_id' }) {
  const clauses = ['s.ended_at IS NOT NULL', 's.is_waiting = FALSE'];
  params.push(PERSONAL_EXCLUDED_WORKFLOW_TYPES);
  clauses.push(`s.workflow_type <> ALL($${params.length}::text[])`);
  if (userId != null) { params.push(userId); clauses.push(`${userColumn} = $${params.length}`); }
  if (unitSlug) { params.push(unitSlug); clauses.push(`s.unit_slug = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`s.started_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`s.started_at <= $${params.length}`); }
  return clauses.join(' AND ');
}

async function resolveUser(userId) {
  const result = await pool.query(
    `SELECT id, first_name, last_name, username, unit, role, main_role FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0] || null;
}

async function byWorkflowBreakdown({ userId, dateFrom, dateTo }) {
  const params = [];
  const where = personalWhere(params, { userId, dateFrom, dateTo });
  const result = await pool.query(
    `SELECT s.workflow_type,
            COUNT(*) AS segments,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.duration_minutes)) AS median_minutes,
            COUNT(*) FILTER (WHERE c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes) AS breaches
     FROM workflow_time_segments s
     ${CONFIG_JOIN}
     WHERE ${where}
     GROUP BY s.workflow_type
     ORDER BY segments DESC`,
    params
  );
  return result.rows.map((r) => {
    const segments = Number(r.segments);
    const breaches = Number(r.breaches);
    return {
      workflowType: r.workflow_type,
      segments,
      avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
      medianMinutes: r.median_minutes != null ? Number(r.median_minutes) : null,
      compliancePct: segments ? Math.round(((segments - breaches) / segments) * 100) : null,
      breaches,
    };
  });
}

async function fastestSlowest({ userId, dateFrom, dateTo }) {
  const paramsFast = [];
  const whereFast = personalWhere(paramsFast, { userId, dateFrom, dateTo });
  const fastest = await pool.query(
    `SELECT s.workflow_type, s.record_id, s.stage_name, s.duration_minutes
     FROM workflow_time_segments s WHERE ${whereFast} AND s.duration_minutes IS NOT NULL
     ORDER BY s.duration_minutes ASC LIMIT 5`,
    paramsFast
  );
  const paramsSlow = [];
  const whereSlow = personalWhere(paramsSlow, { userId, dateFrom, dateTo });
  const slowest = await pool.query(
    `SELECT s.workflow_type, s.record_id, s.stage_name, s.duration_minutes
     FROM workflow_time_segments s WHERE ${whereSlow} AND s.duration_minutes IS NOT NULL
     ORDER BY s.duration_minutes DESC LIMIT 5`,
    paramsSlow
  );
  const toEntry = (r) => ({
    workflowType: r.workflow_type,
    recordId: r.record_id,
    reference: formatRecordLabel(r.workflow_type, r.record_id),
    stage: r.stage_name,
    durationMinutes: Number(r.duration_minutes),
    link: recordViewPath(r.workflow_type, r.record_id),
  });
  return { fastest: fastest.rows.map(toEntry), slowest: slowest.rows.map(toEntry) };
}

async function breachList({ userId, dateFrom, dateTo }) {
  const params = [];
  const where = personalWhere(params, { userId, dateFrom, dateTo });
  const result = await pool.query(
    `SELECT s.workflow_type, s.record_id, s.stage_name, s.duration_minutes,
            c.expected_duration_minutes, c.critical_threshold_minutes
     FROM workflow_time_segments s
     ${CONFIG_JOIN}
     WHERE ${where} AND c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes
     ORDER BY (s.duration_minutes - c.critical_threshold_minutes) DESC
     LIMIT 20`,
    params
  );
  return result.rows.map((r) => {
    const expected = r.expected_duration_minutes != null ? Number(r.expected_duration_minutes) : Number(r.critical_threshold_minutes);
    return {
      workflowType: r.workflow_type,
      recordId: r.record_id,
      reference: formatRecordLabel(r.workflow_type, r.record_id),
      stage: r.stage_name,
      expectedMinutes: r.expected_duration_minutes != null ? Number(r.expected_duration_minutes) : null,
      actualMinutes: Number(r.duration_minutes),
      exceededBy: Number(r.duration_minutes) - expected,
      link: recordViewPath(r.workflow_type, r.record_id),
    };
  });
}

async function weeklyTrend({ userId }) {
  const params = [userId];
  params.push(PERSONAL_EXCLUDED_WORKFLOW_TYPES);
  const result = await pool.query(
    `SELECT date_trunc('week', s.started_at) AS week_start,
            COUNT(*) AS segments,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            COUNT(*) FILTER (WHERE c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes) AS breaches,
            AVG(CASE WHEN c.expected_duration_minutes IS NOT NULL AND c.expected_duration_minutes > 0
                     THEN LEAST(1.6, GREATEST(0.4, c.expected_duration_minutes::numeric / GREATEST(s.duration_minutes, 1)))
                     ELSE 1 END) AS avg_speed_ratio
     FROM workflow_time_segments s
     ${CONFIG_JOIN}
     WHERE s.user_id = $1 AND s.ended_at IS NOT NULL AND s.is_waiting = FALSE
       AND s.workflow_type <> ALL($2::text[])
       AND s.started_at >= date_trunc('week', now()) - interval '9 weeks'
     GROUP BY week_start
     ORDER BY week_start ASC`,
    params
  );
  return result.rows.map((r) => {
    const segments = Number(r.segments);
    const breaches = Number(r.breaches);
    const compliancePct = segments ? Math.round(((segments - breaches) / segments) * 100) : null;
    const speedScore = clamp(50 + (Number(r.avg_speed_ratio ?? 1) - 1) * 100, 0, 100);
    const score = segments < 2 ? null : Math.round(clamp(0.6 * (compliancePct ?? 0) + 0.4 * speedScore, 0, 100));
    return {
      weekStart: r.week_start,
      segments,
      avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
      compliancePct,
      score,
    };
  });
}

/** Every unit member's own personal-score-eligible stats within the unit + period, for the ranking table. */
async function unitMemberRows({ unitSlug, dateFrom, dateTo }) {
  const params = [];
  const where = personalWhere(params, { unitSlug, dateFrom, dateTo, userColumn: 's.user_id' });
  const result = await pool.query(
    `SELECT s.user_id,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name,
            COUNT(*) AS segments,
            COUNT(DISTINCT s.record_id) AS records,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.duration_minutes)) AS median_minutes,
            COUNT(*) FILTER (WHERE c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes) AS breaches,
            AVG(CASE WHEN c.expected_duration_minutes IS NOT NULL AND c.expected_duration_minutes > 0
                     THEN LEAST(1.6, GREATEST(0.4, c.expected_duration_minutes::numeric / GREATEST(s.duration_minutes, 1)))
                     ELSE 1 END) AS avg_speed_ratio
     FROM workflow_time_segments s
     JOIN users u ON u.id = s.user_id
     ${CONFIG_JOIN}
     WHERE ${where} AND s.user_id IS NOT NULL
     GROUP BY s.user_id, full_name
     ORDER BY segments DESC`,
    params
  );
  return result.rows.map((r) => {
    const segments = Number(r.segments);
    const breaches = Number(r.breaches);
    return {
      userId: r.user_id,
      fullName: r.full_name,
      segments,
      records: Number(r.records),
      avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
      medianMinutes: r.median_minutes != null ? Number(r.median_minutes) : null,
      breaches,
      compliancePct: segments ? Math.round(((segments - breaches) / segments) * 100) : null,
      avgSpeedRatio: r.avg_speed_ratio != null ? Number(r.avg_speed_ratio) : 1,
    };
  });
}

/** Attendance for the same period this assessment covers — mirrors the HR dashboard's
 *  attendance_rate calculation (backend/routes/hr.js) and Performance Reports' own
 *  attendanceRateFor (backend/db/performanceReports.js), scoped to one person via
 *  hr_employees.user_id (hr_attendance links to hr_employees, not users, directly). Kept as its
 *  own small query here rather than importing across modules — Performance Reports and My
 *  Assessment are deliberately separate features that happen to both need this. */
async function attendanceSummaryFor(employeeUserId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE LOWER(a.status) IN ('present','late','half-day')) AS present_days,
       COUNT(*) AS total_days
     FROM hr_attendance a
     JOIN hr_employees e ON e.id = a.employee_id
     WHERE e.user_id = $1 AND a.date BETWEEN $2 AND $3`,
    [employeeUserId, startDate, endDate]
  );
  const totalDays = Number(rows[0]?.total_days) || 0;
  const presentDays = Number(rows[0]?.present_days) || 0;
  return {
    rate: totalDays > 0 ? Math.round((presentDays / totalDays) * 1000) / 10 : null,
    presentDays,
    totalDays,
  };
}

function rankOf(rows, userId, key, dir = 'desc') {
  const sorted = [...rows].filter((r) => r[key] != null).sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]));
  const idx = sorted.findIndex((r) => r.userId === userId);
  return idx === -1 ? null : idx + 1;
}

/** Full "My Assessment" payload for one user. */
export async function getStaffAssessment(userId, { dateFrom, dateTo, minSegments = MIN_SEGMENTS_FOR_SCORE } = {}) {
  await ensureTimeEngineTables();
  const user = await resolveUser(userId);
  if (!user) return null;

  const { from, to } = defaultPeriod(dateFrom, dateTo);
  const prev = previousPeriodOf(from, to);

  const paramsMain = [];
  const whereMain = personalWhere(paramsMain, { userId, dateFrom: from.toISOString(), dateTo: to.toISOString() });
  const paramsPrev = [];
  const wherePrev = personalWhere(paramsPrev, { userId, dateFrom: prev.from.toISOString(), dateTo: prev.to.toISOString() });

  const [main, previous, byWorkflow, notable, breaches, trend, attendance] = await Promise.all([
    personalAggregate(whereMain, paramsMain),
    personalAggregate(wherePrev, paramsPrev),
    byWorkflowBreakdown({ userId, dateFrom: from.toISOString(), dateTo: to.toISOString() }),
    fastestSlowest({ userId, dateFrom: from.toISOString(), dateTo: to.toISOString() }),
    breachList({ userId, dateFrom: from.toISOString(), dateTo: to.toISOString() }),
    weeklyTrend({ userId }),
    attendanceSummaryFor(userId, from.toISOString(), to.toISOString()),
  ]);

  const unitSlug = user.unit || null;
  let vsUnit = null;
  let unitPerformance = null;

  if (unitSlug) {
    const memberRows = await unitMemberRows({ unitSlug, dateFrom: from.toISOString(), dateTo: to.toISOString() });
    const volumes = memberRows.map((r) => r.segments).sort((a, b) => a - b);
    const unitMedianVolume = median(volumes) || (main.segments || 1);

    const scoredMembers = memberRows.map((r) => {
      const { overall } = computeCompositeScore({
        compliancePct: r.compliancePct ?? 0,
        avgSpeedRatio: r.avgSpeedRatio,
        volumeRatio: unitMedianVolume ? r.segments / unitMedianVolume : 1,
      });
      return { ...r, score: r.segments < minSegments ? null : overall, isCurrentUser: r.userId === userId };
    });

    const totalUnitSegments = memberRows.reduce((sum, r) => sum + r.segments, 0);
    const totalUnitBreaches = memberRows.reduce((sum, r) => sum + r.breaches, 0);
    const weightedAvgMinutes = totalUnitSegments
      ? Math.round(memberRows.reduce((sum, r) => sum + (r.avgMinutes || 0) * r.segments, 0) / totalUnitSegments)
      : null;

    vsUnit = {
      unitSlug,
      unitAvgMinutes: weightedAvgMinutes,
      unitCompliancePct: totalUnitSegments ? Math.round(((totalUnitSegments - totalUnitBreaches) / totalUnitSegments) * 100) : null,
      unitMedianVolume,
      unitAvgBreaches: memberRows.length ? Math.round((totalUnitBreaches / memberRows.length) * 10) / 10 : null,
      rankByCompliance: rankOf(memberRows, userId, 'compliancePct', 'desc'),
      rankByVolume: rankOf(memberRows, userId, 'segments', 'desc'),
      membersInUnit: memberRows.length,
    };

    unitPerformance = {
      unitSlug,
      summary: {
        segments: totalUnitSegments,
        avgMinutes: weightedAvgMinutes,
        compliancePct: vsUnit.unitCompliancePct,
        breaches: totalUnitBreaches,
        openItems: null,
      },
      ranking: scoredMembers.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    };
  }

  const hasEnoughData = main.segments >= minSegments;
  const volumeRatio = vsUnit?.unitMedianVolume ? main.segments / vsUnit.unitMedianVolume : 1;
  const { overall, speedScore } = computeCompositeScore({
    compliancePct: main.compliancePct ?? 0,
    avgSpeedRatio: main.avgSpeedRatio,
    volumeRatio,
  });
  const overallScore = hasEnoughData ? overall : null;

  const prevHasData = previous.segments >= minSegments;
  const prevOverall = prevHasData
    ? computeCompositeScore({
        compliancePct: previous.compliancePct ?? 0,
        avgSpeedRatio: previous.avgSpeedRatio,
        volumeRatio: 1,
      }).overall
    : null;

  const score = {
    overall: overallScore,
    label: scoreLabel(overallScore),
    speedScore: hasEnoughData ? speedScore : null,
    compliancePct: main.compliancePct,
    avgMinutes: main.avgMinutes,
    medianMinutes: main.medianMinutes,
    segmentsCompleted: main.segments,
    recordsHandled: main.records,
    criticalBreaches: main.breaches,
    totalActiveHours: Math.round((main.totalMinutes / 60) * 10) / 10,
    minSegmentsRequired: minSegments,
    vsPrevious: {
      scoreDelta: overallScore != null && prevOverall != null ? overallScore - prevOverall : null,
      complianceDeltaPts: main.compliancePct != null && previous.compliancePct != null ? main.compliancePct - previous.compliancePct : null,
      avgMinutesDeltaPct:
        main.avgMinutes != null && previous.avgMinutes ? Math.round(((main.avgMinutes - previous.avgMinutes) / previous.avgMinutes) * 1000) / 10 : null,
    },
  };

  return {
    user: { id: user.id, name: displayName({ ...user, user_id: user.id }), unit: unitSlug, role: user.main_role || user.role || null },
    period: { from: from.toISOString(), to: to.toISOString() },
    previousPeriod: { from: prev.from.toISOString(), to: prev.to.toISOString() },
    score,
    attendance,
    vsUnit,
    byWorkflow,
    trend,
    fastest: notable.fastest,
    slowest: notable.slowest,
    breaches,
    unitPerformance,
    notes: {
      excludedFromPersonalScore: PERSONAL_EXCLUDED_WORKFLOW_TYPES,
      fairnessBlurb: 'Only active time you personally owned is scored. Waiting time and unit-only workflows (Service, Design, Sales) are excluded.',
    },
  };
}

/** Ranked list of every scoped staff member, for CTO / manager views. */
export async function getAllStaffAssessments({ dateFrom, dateTo, unitSlug, unitSlugs, minSegments = MIN_SEGMENTS_FOR_SCORE } = {}) {
  await ensureTimeEngineTables();
  const { from, to } = defaultPeriod(dateFrom, dateTo);

  const params = [];
  const clauses = ['s.ended_at IS NOT NULL', 's.is_waiting = FALSE', 's.user_id IS NOT NULL'];
  params.push(PERSONAL_EXCLUDED_WORKFLOW_TYPES);
  clauses.push(`s.workflow_type <> ALL($${params.length}::text[])`);
  params.push(from.toISOString()); clauses.push(`s.started_at >= $${params.length}`);
  params.push(to.toISOString()); clauses.push(`s.started_at <= $${params.length}`);
  if (unitSlug) { params.push(unitSlug); clauses.push(`u.unit = $${params.length}`); }
  else if (unitSlugs && unitSlugs.length) { params.push(unitSlugs); clauses.push(`u.unit = ANY($${params.length}::text[])`); }

  const result = await pool.query(
    `SELECT s.user_id,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS full_name,
            u.unit,
            COUNT(*) AS segments,
            COUNT(DISTINCT s.record_id) AS records,
            ROUND(AVG(s.duration_minutes)) AS avg_minutes,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s.duration_minutes)) AS median_minutes,
            COUNT(*) FILTER (WHERE c.critical_threshold_minutes IS NOT NULL AND s.duration_minutes >= c.critical_threshold_minutes) AS breaches,
            AVG(CASE WHEN c.expected_duration_minutes IS NOT NULL AND c.expected_duration_minutes > 0
                     THEN LEAST(1.6, GREATEST(0.4, c.expected_duration_minutes::numeric / GREATEST(s.duration_minutes, 1)))
                     ELSE 1 END) AS avg_speed_ratio
     FROM workflow_time_segments s
     JOIN users u ON u.id = s.user_id
     ${CONFIG_JOIN}
     WHERE ${clauses.join(' AND ')}
     GROUP BY s.user_id, full_name, u.unit
     ORDER BY segments DESC
     LIMIT 200`,
    params
  );

  const rows = result.rows.map((r) => {
    const segments = Number(r.segments);
    const breaches = Number(r.breaches);
    return {
      userId: r.user_id,
      fullName: r.full_name,
      unitSlug: r.unit,
      segments,
      records: Number(r.records),
      avgMinutes: r.avg_minutes != null ? Number(r.avg_minutes) : null,
      medianMinutes: r.median_minutes != null ? Number(r.median_minutes) : null,
      breaches,
      compliancePct: segments ? Math.round(((segments - breaches) / segments) * 100) : null,
      avgSpeedRatio: r.avg_speed_ratio != null ? Number(r.avg_speed_ratio) : 1,
    };
  });

  const byUnit = new Map();
  for (const r of rows) {
    const key = r.unitSlug || '__none__';
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(r.segments);
  }
  const unitMedianVolume = new Map([...byUnit.entries()].map(([k, v]) => [k, median([...v].sort((a, b) => a - b)) || 1]));

  return rows.map((r) => {
    const refVolume = unitMedianVolume.get(r.unitSlug || '__none__') || 1;
    const { overall } = computeCompositeScore({
      compliancePct: r.compliancePct ?? 0,
      avgSpeedRatio: r.avgSpeedRatio,
      volumeRatio: refVolume ? r.segments / refVolume : 1,
    });
    return { ...r, score: r.segments >= minSegments ? overall : null, label: r.segments >= minSegments ? scoreLabel(overall) : 'Insufficient data' };
  });
}

export { MIN_SEGMENTS_FOR_SCORE, PERSONAL_EXCLUDED_WORKFLOW_TYPES };
