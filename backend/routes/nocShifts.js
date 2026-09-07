import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { effectiveUnitsForUser, isSystemAdminAccount, userHasAnyRole } from '../roles.js';
import { logUserAction } from '../services/activityLog.js';
import { createNotification } from '../db.js';
import {
  computeShiftStatus,
  sortShiftDefinitions,
  addDaysToDateString,
  toDateOnlyString,
  getCurrentAndNextShift,
} from '../utils/shiftTime.js';

const router = express.Router();

const STAFF_ROLES = ['noc', 'noc_manager', 'noc_supervisor'];
const MANAGER_ROLES = ['noc_manager', 'noc_supervisor'];
const canUseSchedule = (user) => isSystemAdminAccount(user) || userHasAnyRole(user, [...STAFF_ROLES, 'director', 'cto']) || effectiveUnitsForUser(user).includes('noc');
// Real accounts usually carry the actual job title in `position` ("NOC Supervisor") with
// role/main_role left as a generic account type — a role-slug-only check silently locks real
// NOC supervisors/managers out of managing (and, on the frontend, even seeing) shift times.
function isNocManagerByPosition(user) {
  const position = String(user?.position || '').trim().toLowerCase();
  const looksLikeManager = position.includes('manager') || position.includes('supervisor');
  return looksLikeManager && effectiveUnitsForUser(user).includes('noc');
}
const canManageSchedule = (user) => isSystemAdminAccount(user) || userHasAnyRole(user, [...MANAGER_ROLES, 'director', 'cto']) || isNocManagerByPosition(user);
const requireNoc = (req, res, next) => canUseSchedule(req.user) ? next() : res.status(403).json({ error: 'NOC access is required' });
const requireNocManager = (req, res, next) => canManageSchedule(req.user) ? next() : res.status(403).json({ error: 'Only NOC Managers or Supervisors can manage the shift schedule' });

let tableReady = false;
export async function init() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS noc_shift_definitions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS noc_shift_schedules (
      id SERIAL PRIMARY KEY,
      schedule_date DATE NOT NULL,
      shift_definition_id INTEGER NOT NULL REFERENCES noc_shift_definitions(id) ON DELETE RESTRICT,
      created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_published BOOLEAN NOT NULL DEFAULT FALSE,
      published_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (schedule_date, shift_definition_id)
    );
    CREATE INDEX IF NOT EXISTS noc_shift_schedules_date_idx ON noc_shift_schedules(schedule_date);
    CREATE TABLE IF NOT EXISTS noc_shift_staff_assignments (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL REFERENCES noc_shift_schedules(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_shift_lead BOOLEAN NOT NULL DEFAULT FALSE,
      is_primary_duty BOOLEAN NOT NULL DEFAULT FALSE,
      display_order INTEGER NOT NULL DEFAULT 0,
      added_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (schedule_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS noc_shift_staff_schedule_idx ON noc_shift_staff_assignments(schedule_id);
    CREATE INDEX IF NOT EXISTS noc_shift_staff_user_idx ON noc_shift_staff_assignments(user_id);
  `);
  await pool.query(`
    INSERT INTO noc_shift_definitions (name, start_time, end_time, display_order)
    SELECT 'Day Shift', '08:00', '20:00', 0
    WHERE NOT EXISTS (SELECT 1 FROM noc_shift_definitions WHERE name = 'Day Shift');
  `);
  await pool.query(`
    INSERT INTO noc_shift_definitions (name, start_time, end_time, display_order)
    SELECT 'Night Shift', '20:00', '08:00', 1
    WHERE NOT EXISTS (SELECT 1 FROM noc_shift_definitions WHERE name = 'Night Shift');
  `);
  tableReady = true;
}
router.use(async (_req, _res, next) => { try { await init(); next(); } catch (e) { next(e); } });
router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

function formatDateForMessage(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTimeForMessage(timeStr) {
  const [h, m] = String(timeStr).split(':').map((n) => Number(n) || 0);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export async function getShiftDefinitions({ activeOnly = false } = {}) {
  const result = await pool.query(
    `SELECT * FROM noc_shift_definitions ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY display_order ASC, id ASC`
  );
  return sortShiftDefinitions(result.rows);
}

async function getShiftDefinitionById(id) {
  const result = await pool.query('SELECT * FROM noc_shift_definitions WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getScheduleStaff(scheduleId) {
  const result = await pool.query(
    `SELECT a.id AS assignment_id, a.user_id, a.is_shift_lead, a.is_primary_duty, a.display_order, a.added_at,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username, 'User') AS full_name,
            u.avatar_url
     FROM noc_shift_staff_assignments a
     JOIN users u ON u.id = a.user_id AND u.deleted_at IS NULL
     WHERE a.schedule_id = $1
     ORDER BY a.display_order ASC, a.added_at ASC`,
    [scheduleId]
  );
  return result.rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url,
    isShiftLead: r.is_shift_lead,
    isPrimaryDuty: r.is_primary_duty,
    displayOrder: r.display_order,
  }));
}

async function getScheduleByDateAndShift(date, shiftDefinitionId) {
  const result = await pool.query(
    'SELECT * FROM noc_shift_schedules WHERE schedule_date = $1 AND shift_definition_id = $2',
    [date, shiftDefinitionId]
  );
  return result.rows[0] || null;
}

async function getScheduleById(id) {
  const result = await pool.query('SELECT * FROM noc_shift_schedules WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/** Get-or-create the roster row for a date + shift definition. Returns {schedule, created}. */
async function ensureSchedule(date, shiftDefinitionId, userId) {
  const existing = await getScheduleByDateAndShift(date, shiftDefinitionId);
  if (existing) return { schedule: existing, created: false };
  const inserted = await pool.query(
    `INSERT INTO noc_shift_schedules (schedule_date, shift_definition_id, created_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (schedule_date, shift_definition_id) DO UPDATE SET updated_at = noc_shift_schedules.updated_at
     RETURNING *`,
    [date, shiftDefinitionId, userId]
  );
  return { schedule: inserted.rows[0], created: true };
}

function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateOnlyString(d);
}

async function notifyRecipients(recipientUserIds, { title, message, actorId, notificationType }) {
  const uniqueIds = [...new Set(recipientUserIds.filter(Boolean))];
  await Promise.all(
    uniqueIds.map((userId) =>
      createNotification(title, message, actorId, {
        targetUserId: userId,
        linkUrl: '/noc/shift-schedule',
        notificationType,
      }).catch((err) => console.error('[noc-shifts] notify failed:', err.message))
    )
  );
}

// ---------------------------------------------------------------------------
// Definitions (shift times settings)
// ---------------------------------------------------------------------------

router.get('/definitions', requireNoc, async (_req, res) => {
  try {
    const defs = await getShiftDefinitions();
    res.json(defs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/definitions/:id', requireNocManager, async (req, res) => {
  try {
    const def = await getShiftDefinitionById(req.params.id);
    if (!def) return res.status(404).json({ error: 'Shift definition not found' });
    const start_time = String(req.body?.start_time || def.start_time);
    const end_time = String(req.body?.end_time || def.end_time);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(start_time) || !/^\d{2}:\d{2}(:\d{2})?$/.test(end_time)) {
      return res.status(400).json({ error: 'start_time and end_time must be in HH:MM format' });
    }
    await pool.query(
      'UPDATE noc_shift_definitions SET start_time = $1, end_time = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [start_time, end_time, def.id]
    );

    const allDefs = await getShiftDefinitions();
    const dayDef = allDefs.find((d) => d.name === 'Day Shift');
    const nightDef = allDefs.find((d) => d.name === 'Night Shift');
    await logUserAction(req.user, {
      actionType: 'shift_times_updated',
      recordType: 'noc_shift_schedule',
      recordId: null,
      description: `You updated shift times — Day Shift ${dayDef ? `${formatTimeForMessage(dayDef.start_time)} to ${formatTimeForMessage(dayDef.end_time)}` : ''} / Night Shift ${nightDef ? `${formatTimeForMessage(nightDef.start_time)} to ${formatTimeForMessage(nightDef.end_time)}` : ''}`,
    });

    // Notify every distinct user with an upcoming (today or later) assignment.
    const upcoming = await pool.query(
      `SELECT DISTINCT a.user_id FROM noc_shift_staff_assignments a
       JOIN noc_shift_schedules s ON s.id = a.schedule_id
       WHERE s.schedule_date >= CURRENT_DATE`
    );
    await notifyRecipients(upcoming.rows.map((r) => r.user_id), {
      title: 'NOC Shift Times Updated',
      message: 'NOC shift times have been updated. Please review your schedule.',
      actorId: req.user.id,
      notificationType: 'noc_shift_times_updated',
    });

    const updated = await getShiftDefinitionById(def.id);
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Staff options (searchable picker)
// ---------------------------------------------------------------------------

router.get('/staff-options', requireNoc, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), username) AS full_name, avatar_url,
              role, main_role, roles, unit, units
       FROM users WHERE deleted_at IS NULL ORDER BY full_name`
    );
    // Only people actually in NOC — the old query returned every user in the system, so the
    // "add to shift" picker showed the entire company instead of just NOC staff.
    const nocOnly = result.rows.filter((r) => userHasAnyRole(r, STAFF_ROLES) || effectiveUnitsForUser(r).includes('noc'));
    res.json(nocOnly.map((r) => ({ id: r.id, fullName: r.full_name, avatarUrl: r.avatar_url })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Week roster
// ---------------------------------------------------------------------------

router.get('/week', requireNoc, async (req, res) => {
  try {
    const requested = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start || '')) ? req.query.start : toDateOnlyString(new Date());
    const weekStart = mondayOf(requested);
    const weekEnd = addDaysToDateString(weekStart, 6);
    const defs = await getShiftDefinitions({ activeOnly: true });
    const now = new Date();

    const scheduleRows = await pool.query(
      `SELECT * FROM noc_shift_schedules WHERE schedule_date >= $1 AND schedule_date <= $2`,
      [weekStart, weekEnd]
    );
    const scheduleByKey = new Map(scheduleRows.rows.map((s) => [`${toDateOnlyString(s.schedule_date)}|${s.shift_definition_id}`, s]));
    const staffBySchedule = new Map(
      await Promise.all(scheduleRows.rows.map(async (s) => [s.id, await getScheduleStaff(s.id)]))
    );

    const days = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDaysToDateString(weekStart, offset);
      const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
      const shifts = defs.map((def) => {
        const schedule = scheduleByKey.get(`${date}|${def.id}`) || null;
        return {
          shiftDefinitionId: def.id,
          name: def.name,
          startTime: def.start_time,
          endTime: def.end_time,
          scheduleId: schedule ? schedule.id : null,
          status: computeShiftStatus(def, date, now),
          staff: schedule ? staffBySchedule.get(schedule.id) || [] : [],
        };
      });
      days.push({ date, dayLabel, shifts });
    }

    res.json({ weekStart, weekEnd, days });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Schedule (day x shift roster row) create + staff mutations
// ---------------------------------------------------------------------------

router.post('/schedules', requireNocManager, async (req, res) => {
  try {
    const date = String(req.body?.date || '');
    const shiftDefinitionId = Number(req.body?.shift_definition_id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(shiftDefinitionId)) {
      return res.status(400).json({ error: 'A valid date and shift_definition_id are required' });
    }
    const def = await getShiftDefinitionById(shiftDefinitionId);
    if (!def) return res.status(404).json({ error: 'Shift definition not found' });

    const { schedule, created } = await ensureSchedule(date, shiftDefinitionId, req.user.id);
    if (created) {
      await logUserAction(req.user, {
        actionType: 'shift_created',
        recordType: 'noc_shift_schedule',
        recordId: schedule.id,
        description: `You created the ${def.name} schedule for ${formatDateForMessage(date)}`,
      });
    }
    res.status(created ? 201 : 200).json({ scheduleId: schedule.id, created });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/schedules/:id/staff', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const def = await getShiftDefinitionById(schedule.shift_definition_id);
    const userIds = Array.isArray(req.body?.userIds) ? [...new Set(req.body.userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];
    if (!userIds.length) return res.status(400).json({ error: 'At least one userId is required' });
    const isShiftLeadUserId = req.body?.isShiftLeadUserId ? Number(req.body.isShiftLeadUserId) : null;
    const isPrimaryDutyUserId = req.body?.isPrimaryDutyUserId ? Number(req.body.isPrimaryDutyUserId) : null;

    const existing = await pool.query('SELECT user_id FROM noc_shift_staff_assignments WHERE schedule_id = $1', [schedule.id]);
    const existingIds = new Set(existing.rows.map((r) => r.user_id));
    const countRow = await pool.query('SELECT COALESCE(MAX(display_order), -1) AS max_order FROM noc_shift_staff_assignments WHERE schedule_id = $1', [schedule.id]);
    let nextOrder = Number(countRow.rows[0].max_order) + 1;

    const newlyAdded = [];
    for (const userId of userIds) {
      if (existingIds.has(userId)) continue;
      await pool.query(
        `INSERT INTO noc_shift_staff_assignments (schedule_id, user_id, display_order, added_by_user_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (schedule_id, user_id) DO NOTHING`,
        [schedule.id, userId, nextOrder, req.user.id]
      );
      nextOrder += 1;
      newlyAdded.push(userId);
    }

    if (isShiftLeadUserId) {
      await pool.query('UPDATE noc_shift_staff_assignments SET is_shift_lead = FALSE WHERE schedule_id = $1', [schedule.id]);
      await pool.query('UPDATE noc_shift_staff_assignments SET is_shift_lead = TRUE WHERE schedule_id = $1 AND user_id = $2', [schedule.id, isShiftLeadUserId]);
    }
    if (isPrimaryDutyUserId) {
      await pool.query('UPDATE noc_shift_staff_assignments SET is_primary_duty = FALSE WHERE schedule_id = $1', [schedule.id]);
      await pool.query('UPDATE noc_shift_staff_assignments SET is_primary_duty = TRUE WHERE schedule_id = $1 AND user_id = $2', [schedule.id, isPrimaryDutyUserId]);
    }

    const dateLabel = formatDateForMessage(toDateOnlyString(schedule.schedule_date));
    if (newlyAdded.length) {
      const namesResult = await pool.query(
        `SELECT id, COALESCE(NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), username) AS full_name FROM users WHERE id = ANY($1::int[])`,
        [newlyAdded]
      );
      const nameById = new Map(namesResult.rows.map((r) => [r.id, r.full_name]));
      await Promise.all(newlyAdded.map(async (userId) => {
        const fullName = nameById.get(userId) || 'A staff member';
        await createNotification(
          'NOC Shift Assignment',
          `You have been added to the ${def.name} on ${dateLabel}`,
          req.user.id,
          { targetUserId: userId, linkUrl: '/noc/shift-schedule', notificationType: 'noc_shift_added' }
        ).catch((err) => console.error('[noc-shifts] notify failed:', err.message));
        await logUserAction(req.user, {
          actionType: 'add_staff',
          recordType: 'noc_shift_schedule',
          recordId: schedule.id,
          description: `You added ${fullName} to the ${def.name} on ${dateLabel}`,
        });
      }));
    }
    if (isShiftLeadUserId) {
      const leadName = (await pool.query('SELECT COALESCE(NULLIF(trim(concat_ws(\' \', first_name, last_name)), \'\'), username) AS full_name FROM users WHERE id = $1', [isShiftLeadUserId])).rows[0]?.full_name || 'Staff member';
      await createNotification(
        'NOC Shift Lead Assigned',
        `You have been assigned as Shift Lead for the ${def.name} on ${dateLabel}`,
        req.user.id,
        { targetUserId: isShiftLeadUserId, linkUrl: '/noc/shift-schedule', notificationType: 'noc_shift_lead' }
      ).catch((err) => console.error('[noc-shifts] notify failed:', err.message));
      await logUserAction(req.user, {
        actionType: 'shift_lead_assigned',
        recordType: 'noc_shift_schedule',
        recordId: schedule.id,
        description: `You assigned ${leadName} as Shift Lead for the ${def.name} on ${dateLabel}`,
      });
    }

    const staff = await getScheduleStaff(schedule.id);
    res.status(201).json({ staff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/schedules/:id/staff/:userId', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const def = await getShiftDefinitionById(schedule.shift_definition_id);
    const userId = Number(req.params.userId);

    const userRow = await pool.query('SELECT COALESCE(NULLIF(trim(concat_ws(\' \', first_name, last_name)), \'\'), username) AS full_name FROM users WHERE id = $1', [userId]);
    const fullName = userRow.rows[0]?.full_name || 'Staff member';

    const result = await pool.query('DELETE FROM noc_shift_staff_assignments WHERE schedule_id = $1 AND user_id = $2 RETURNING id', [schedule.id, userId]);
    if (!result.rowCount) return res.status(404).json({ error: 'This staff member is not on that shift' });

    const dateLabel = formatDateForMessage(toDateOnlyString(schedule.schedule_date));
    await createNotification(
      'NOC Shift Assignment Removed',
      `You have been removed from the ${def.name} on ${dateLabel}`,
      req.user.id,
      { targetUserId: userId, linkUrl: '/noc/shift-schedule', notificationType: 'noc_shift_removed' }
    ).catch((err) => console.error('[noc-shifts] notify failed:', err.message));
    await logUserAction(req.user, {
      actionType: 'remove_staff',
      recordType: 'noc_shift_schedule',
      recordId: schedule.id,
      description: `You removed ${fullName} from the ${def.name} on ${dateLabel}`,
    });

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/schedules/:id/staff/:userId/lead', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const def = await getShiftDefinitionById(schedule.shift_definition_id);
    const userId = Number(req.params.userId);
    const isShiftLead = req.body?.isShiftLead !== false;

    await pool.query('UPDATE noc_shift_staff_assignments SET is_shift_lead = FALSE WHERE schedule_id = $1', [schedule.id]);
    if (isShiftLead) {
      const updated = await pool.query('UPDATE noc_shift_staff_assignments SET is_shift_lead = TRUE WHERE schedule_id = $1 AND user_id = $2 RETURNING id', [schedule.id, userId]);
      if (!updated.rowCount) return res.status(404).json({ error: 'This staff member is not on that shift' });

      const dateLabel = formatDateForMessage(toDateOnlyString(schedule.schedule_date));
      const userRow = await pool.query('SELECT COALESCE(NULLIF(trim(concat_ws(\' \', first_name, last_name)), \'\'), username) AS full_name FROM users WHERE id = $1', [userId]);
      const fullName = userRow.rows[0]?.full_name || 'Staff member';
      await createNotification(
        'NOC Shift Lead Assigned',
        `You have been assigned as Shift Lead for the ${def.name} on ${dateLabel}`,
        req.user.id,
        { targetUserId: userId, linkUrl: '/noc/shift-schedule', notificationType: 'noc_shift_lead' }
      ).catch((err) => console.error('[noc-shifts] notify failed:', err.message));
      await logUserAction(req.user, {
        actionType: 'shift_lead_assigned',
        recordType: 'noc_shift_schedule',
        recordId: schedule.id,
        description: `You assigned ${fullName} as Shift Lead for the ${def.name} on ${dateLabel}`,
      });
    }

    const staff = await getScheduleStaff(schedule.id);
    res.json({ staff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/schedules/:id/staff/:userId/primary-duty', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const userId = Number(req.params.userId);
    const isPrimaryDuty = req.body?.isPrimaryDuty !== false;

    await pool.query('UPDATE noc_shift_staff_assignments SET is_primary_duty = FALSE WHERE schedule_id = $1', [schedule.id]);
    if (isPrimaryDuty) {
      const updated = await pool.query('UPDATE noc_shift_staff_assignments SET is_primary_duty = TRUE WHERE schedule_id = $1 AND user_id = $2 RETURNING id', [schedule.id, userId]);
      if (!updated.rowCount) return res.status(404).json({ error: 'This staff member is not on that shift' });
    }

    const staff = await getScheduleStaff(schedule.id);
    res.json({ staff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/schedules/:id/staff/reorder', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const order = Array.isArray(req.body?.order) ? req.body.order.map(Number) : [];
    await Promise.all(order.map((userId, index) =>
      pool.query('UPDATE noc_shift_staff_assignments SET display_order = $1 WHERE schedule_id = $2 AND user_id = $3', [index, schedule.id, userId])
    ));
    const staff = await getScheduleStaff(schedule.id);
    res.json({ staff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/schedules/:id', requireNocManager, async (req, res) => {
  try {
    const schedule = await getScheduleById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });
    const def = await getShiftDefinitionById(schedule.shift_definition_id);
    await pool.query('DELETE FROM noc_shift_schedules WHERE id = $1', [schedule.id]);
    await logUserAction(req.user, {
      actionType: 'shift_cleared',
      recordType: 'noc_shift_schedule',
      recordId: schedule.id,
      description: `You cleared the ${def?.name || 'shift'} schedule for ${formatDateForMessage(toDateOnlyString(schedule.schedule_date))}`,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Copy-to / copy-week-forward / publish-week
// ---------------------------------------------------------------------------

router.post('/schedules/:id/copy-to', requireNocManager, async (req, res) => {
  try {
    const source = await getScheduleById(req.params.id);
    if (!source) return res.status(404).json({ error: 'Schedule not found' });
    const targetDate = String(req.body?.targetDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return res.status(400).json({ error: 'A valid targetDate is required' });

    const { schedule: target } = await ensureSchedule(targetDate, source.shift_definition_id, req.user.id);
    const sourceStaff = await getScheduleStaff(source.id);
    await pool.query('DELETE FROM noc_shift_staff_assignments WHERE schedule_id = $1', [target.id]);
    await Promise.all(sourceStaff.map((s) =>
      pool.query(
        `INSERT INTO noc_shift_staff_assignments (schedule_id, user_id, is_shift_lead, is_primary_duty, display_order, added_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [target.id, s.userId, s.isShiftLead, s.isPrimaryDuty, s.displayOrder, req.user.id]
      )
    ));

    const staff = await getScheduleStaff(target.id);
    res.json({ scheduleId: target.id, staff });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/weeks/:weekStart/copy-forward', requireNocManager, async (req, res) => {
  try {
    const weekStart = mondayOf(req.params.weekStart);
    const weekEnd = addDaysToDateString(weekStart, 6);
    const nextWeekStart = addDaysToDateString(weekStart, 7);

    const scheduleRows = await pool.query(
      'SELECT * FROM noc_shift_schedules WHERE schedule_date >= $1 AND schedule_date <= $2',
      [weekStart, weekEnd]
    );

    const copiedScheduleIds = [];
    for (const source of scheduleRows.rows) {
      const dayOffset = Math.round((new Date(source.schedule_date) - new Date(`${weekStart}T00:00:00`)) / 86400000);
      const targetDate = addDaysToDateString(nextWeekStart, dayOffset);
      const { schedule: target } = await ensureSchedule(targetDate, source.shift_definition_id, req.user.id);
      const sourceStaff = await getScheduleStaff(source.id);
      await pool.query('DELETE FROM noc_shift_staff_assignments WHERE schedule_id = $1', [target.id]);
      await Promise.all(sourceStaff.map((s) =>
        pool.query(
          `INSERT INTO noc_shift_staff_assignments (schedule_id, user_id, is_shift_lead, is_primary_duty, display_order, added_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [target.id, s.userId, s.isShiftLead, s.isPrimaryDuty, s.displayOrder, req.user.id]
        )
      ));
      copiedScheduleIds.push(target.id);
    }

    await logUserAction(req.user, {
      actionType: 'week_copied',
      recordType: 'noc_shift_schedule',
      recordId: null,
      description: `You copied the week of ${formatDateForMessage(weekStart)} schedule to ${formatDateForMessage(nextWeekStart)}`,
    });

    res.json({ copiedScheduleIds, nextWeekStart });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/weeks/:weekStart/publish', requireNocManager, async (req, res) => {
  try {
    const weekStart = mondayOf(req.params.weekStart);
    const weekEnd = addDaysToDateString(weekStart, 6);

    await pool.query(
      `UPDATE noc_shift_schedules SET is_published = TRUE, published_at = CURRENT_TIMESTAMP
       WHERE schedule_date >= $1 AND schedule_date <= $2`,
      [weekStart, weekEnd]
    );

    const staffRows = await pool.query(
      `SELECT DISTINCT a.user_id FROM noc_shift_staff_assignments a
       JOIN noc_shift_schedules s ON s.id = a.schedule_id
       WHERE s.schedule_date >= $1 AND s.schedule_date <= $2`,
      [weekStart, weekEnd]
    );
    await notifyRecipients(staffRows.rows.map((r) => r.user_id), {
      title: 'NOC Shift Schedule Published',
      message: `Your NOC shift schedule for the week of ${formatDateForMessage(weekStart)} has been published`,
      actorId: req.user.id,
      notificationType: 'noc_shift_published',
    });

    res.json({ ok: true, notifiedCount: staffRows.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Current duty — ticket-integration-ready snapshot
// ---------------------------------------------------------------------------

export async function buildDutySnapshot(shift) {
  if (!shift) return null;
  const schedule = await getScheduleByDateAndShift(shift.date, shift.shiftDef.id);
  const staff = schedule ? await getScheduleStaff(schedule.id) : [];
  const shiftLead = staff.find((s) => s.isShiftLead) || null;
  const primaryDutyStaff = staff.find((s) => s.isPrimaryDuty) || null;
  return {
    scheduleId: schedule ? schedule.id : null,
    shiftDefinitionId: shift.shiftDef.id,
    shiftName: shift.shiftDef.name,
    date: shift.date,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    shiftLead: shiftLead ? { userId: shiftLead.userId, fullName: shiftLead.fullName } : null,
    primaryDutyStaff: primaryDutyStaff ? { userId: primaryDutyStaff.userId, fullName: primaryDutyStaff.fullName } : null,
    staff,
  };
}

router.get('/current-duty', requireNoc, async (req, res) => {
  try {
    const at = req.query.at ? new Date(String(req.query.at)) : new Date();
    const now = Number.isNaN(at.getTime()) ? new Date() : at;
    const defs = await getShiftDefinitions({ activeOnly: true });
    const { current, next } = getCurrentAndNextShift(defs, now);

    res.json({
      asOf: now.toISOString(),
      current: await buildDutySnapshot(current),
      next: await buildDutySnapshot(next),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
