import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { isSystemAdminAccount, userHasAnyRole, effectiveUnitsForUser, MANAGER_ROLES, SUPERVISOR_ROLES } from '../roles.js';
import { logUserAction } from '../services/activityLog.js';
import {
  ensureTimeEngineTables,
  seedDefaultConfig,
  getRecordTurnaround,
  getCurrentOwnership,
  getStaffPerformance,
  getStaffLeaderboard,
  getUnitPerformance,
  getSlaBreaches,
  getLiveOverview,
  getWorkflowTimeConfig,
  upsertWorkflowTimeConfig,
} from '../services/workflowTimeEngine.js';

const router = express.Router();

const TIME_ENGINE_MANAGER_ROLES = [...MANAGER_ROLES, ...SUPERVISOR_ROLES, 'director', 'cto'];
const isTimeEngineManager = (user) => isSystemAdminAccount(user) || userHasAnyRole(user, TIME_ENGINE_MANAGER_ROLES);

/** Admin sees every unit; a unit manager/supervisor is scoped to their own effective units. */
function managerScope(user) {
  if (isSystemAdminAccount(user) || userHasAnyRole(user, ['director', 'cto'])) return { isAdmin: true, allowedUnitSlugs: null };
  return { isAdmin: false, allowedUnitSlugs: effectiveUnitsForUser(user) };
}

const requireManager = (req, res, next) =>
  isTimeEngineManager(req.user) ? next() : res.status(403).json({ error: 'Only unit managers, supervisors, or admins can view workflow performance data' });

const requireAdmin = (req, res, next) =>
  isSystemAdminAccount(req.user) ? next() : res.status(403).json({ error: 'Only System Admins can update workflow time configuration' });

let initialized = false;
router.use(async (_req, _res, next) => {
  try {
    if (!initialized) {
      await ensureTimeEngineTables();
      await seedDefaultConfig();
      initialized = true;
    }
    next();
  } catch (e) { next(e); }
});
router.use(authenticateToken);

// GET /api/time-engine/record/:workflowType/:recordId — full timing breakdown for one record.
router.get('/record/:workflowType/:recordId', async (req, res) => {
  try {
    const { workflowType, recordId } = req.params;
    const id = Number(recordId);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'A valid recordId is required' });

    if (!isTimeEngineManager(req.user)) {
      const involved = await pool.query(
        `SELECT 1 FROM workflow_time_segments WHERE workflow_type = $1 AND record_id = $2 AND user_id = $3 LIMIT 1`,
        [workflowType, id, req.user.id]
      );
      if (!involved.rowCount) return res.status(403).json({ error: 'You can only view timing for requests you are or were involved in' });
    }

    const turnaround = await getRecordTurnaround(workflowType, id);
    if (!turnaround) return res.json({ workflowType, recordId: id, notStarted: true });
    res.json(turnaround);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/record/:workflowType/:recordId/ownership — who currently holds this record.
router.get('/record/:workflowType/:recordId/ownership', async (req, res) => {
  try {
    const ownership = await getCurrentOwnership(req.params.workflowType, Number(req.params.recordId));
    res.json(ownership || { unitSlug: null, userId: null, stageName: null, since: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/unit/:unitSlug?dateFrom=&dateTo=&workflowType=
router.get('/unit/:unitSlug', requireManager, async (req, res) => {
  try {
    const { unitSlug } = req.params;
    const scope = managerScope(req.user);
    if (!scope.isAdmin && !scope.allowedUnitSlugs.includes(unitSlug)) {
      return res.status(403).json({ error: 'You can only view performance data for your own unit' });
    }
    const data = await getUnitPerformance(unitSlug, { dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, workflowType: req.query.workflowType });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/staff/:userId?dateFrom=&dateTo=&workflowType=
router.get('/staff/:userId', async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (userId !== req.user.id && !isTimeEngineManager(req.user)) {
      return res.status(403).json({ error: 'You can only view your own performance data' });
    }
    const data = await getStaffPerformance(userId, { dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, workflowType: req.query.workflowType });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/staff-leaderboard?dateFrom=&dateTo=&workflowType= — Staff Performance table.
router.get('/staff-leaderboard', requireManager, async (req, res) => {
  try {
    const scope = managerScope(req.user);
    const data = await getStaffLeaderboard({
      dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, workflowType: req.query.workflowType,
      unitSlugs: scope.isAdmin ? undefined : scope.allowedUnitSlugs,
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/overview?dateFrom=&dateTo= — system-wide (admin) or own-units (manager) turnaround summary.
router.get('/overview', requireManager, async (req, res) => {
  try {
    const scope = managerScope(req.user);
    const live = await getLiveOverview();
    const scoped = scope.isAdmin ? live : live.filter((r) => r.unitSlug && scope.allowedUnitSlugs.includes(r.unitSlug));

    const totalActive = scoped.length;
    const breaches = scoped.filter((r) => r.slaStatus === 'breached').length;
    const overdue = scoped.filter((r) => r.slaStatus === 'warning' || r.slaStatus === 'breached').length;

    const dateFrom = req.query.dateFrom || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const dateTo = req.query.dateTo || new Date().toISOString();
    const closedToday = await pool.query(
      `SELECT ROUND(AVG(duration_minutes)) AS avg_minutes FROM workflow_time_segments
       WHERE ended_at IS NOT NULL AND ended_at >= $1 AND ended_at <= $2 ${scope.isAdmin ? '' : 'AND unit_slug = ANY($3::text[])'}`,
      scope.isAdmin ? [dateFrom, dateTo] : [dateFrom, dateTo, scope.allowedUnitSlugs]
    );

    res.json({
      totalActive,
      averageTurnaroundMinutesToday: closedToday.rows[0]?.avg_minutes != null ? Number(closedToday.rows[0].avg_minutes) : null,
      slaBreachesActive: breaches,
      overdueCount: overdue,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/live — every currently-open segment (the Live Active Requests table).
router.get('/live', requireManager, async (req, res) => {
  try {
    const scope = managerScope(req.user);
    const live = await getLiveOverview();
    res.json(scope.isAdmin ? live : live.filter((r) => r.unitSlug && scope.allowedUnitSlugs.includes(r.unitSlug)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/sla-breaches?dateFrom=&dateTo=&workflowType=&unitId=(unit slug)
router.get('/sla-breaches', requireManager, async (req, res) => {
  try {
    const scope = managerScope(req.user);
    const unitSlug = req.query.unitId || req.query.unitSlug || null;
    if (unitSlug && !scope.isAdmin && !scope.allowedUnitSlugs.includes(unitSlug)) {
      return res.status(403).json({ error: 'You can only view breaches for your own unit' });
    }
    const breaches = await getSlaBreaches({
      dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, workflowType: req.query.workflowType,
      unitSlug: unitSlug || undefined,
    });
    const scoped = scope.isAdmin || unitSlug ? breaches : breaches.filter((b) => b.unitSlug && scope.allowedUnitSlugs.includes(b.unitSlug));
    res.json(scoped);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/time-engine/config — readable by any manager tier.
router.get('/config', requireManager, async (_req, res) => {
  try {
    res.json(await getWorkflowTimeConfig());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/time-engine/config — admin-only write.
router.post('/config', requireAdmin, async (req, res) => {
  try {
    const { workflow_type: workflowType, stage_name: stageName } = req.body || {};
    if (!workflowType || !stageName) return res.status(400).json({ error: 'workflow_type and stage_name are required' });
    const saved = await upsertWorkflowTimeConfig(req.body, req.user.id);
    await logUserAction(req.user, {
      actionType: 'time_config_updated',
      recordType: 'workflow_time_config',
      recordId: saved.id,
      description: `You updated the expected time for ${workflowType} → ${stageName}`,
    });
    res.status(201).json(saved);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
