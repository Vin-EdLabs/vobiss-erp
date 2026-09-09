// src/routes/cx.routes.js — FIXED: MULTI-ROLE SUPPORT + REMOVE OLD CONSTRAINT + PIN RESET
// Updated: January 12, 2026

import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import {
  getProjects,
  createProject,
  getCustomers,
  createCustomer,
  setCustomerPIN,          // ← Added this import (from db.ticketing.cjs)
  getAllTickets,
  getTicketByIdForStaff,
  getTicketTimeline,
  normalizeTicketRef,
  createTicket,
  updateTicketStaff,
  getUserWorkHistory,
  searchTicketWithFullDetails,
  listTicketTags,
  createTicketTag,
  updateTicketTag,
  deleteTicketTag,
  getTagsForTicket,
  addTagsToTicket,
  removeTagFromTicket,
} from '../db.ticketing.cjs';
import {
  listClients,
  createClient,
  getClientById,
  updateClient,
  listSitesForClient,
  createSite,
  createStandaloneSite,
  updateSite,
  updateSiteById,
  linkSitesToClient,
  listAllSites,
  getSitesStats,
  resetClientPassword,
} from '../db.clients.cjs';
import { getUserById } from '../db.js';
import { emitToStaff } from '../realtime/channels.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { postTicketSystemMessage } from '../services/chatSystemMessage.js';
import { ensureTicketThread, syncTicketThreadAssignee } from '../services/chatRecordThreads.js';
import { isSystemAdminAccount, effectiveUnitsForUser } from '../roles.js';
import { getTicketEscalationConfig, markTicketStageAccepted } from '../ticketEscalation.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import { logUserAction, ensureActivityLogsTable } from '../services/activityLog.js';
import { recordTimingEvent } from '../services/workflowTimeEngine.js';
import { sendPushToUserIds } from '../push/sendPush.js';
import { resolveUnitRecipients } from '../services/unitNotify.js';

const TICKET_TERMINAL_STATUSES = new Set(['CLOSED', 'RESOLVED']);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

// --- AUTH MIDDLEWARE ---
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id || decoded.userId || decoded.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.authUser = user;
    next();
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    return res.status(401).json({
      error: expired ? 'Session expired. Please log in again.' : 'Invalid or expired token',
    });
  }
}

const normalize = (value) => String(value || '').trim().toLowerCase();

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function getUserRoleSlugs(user) {
  const roles = new Set();
  [user?.role, user?.main_role].filter(Boolean).forEach((role) => roles.add(normalize(role)));
  parseJsonArray(user?.roles).forEach((role) => roles.add(normalize(role)));
  return [...roles].filter(Boolean);
}

function canonicalizeTicketUnit(value) {
  const unit = normalize(value);
  if (['tx', 'field', 'field_engineer', 'ts'].includes(unit)) return 'ts';
  return unit;
}

function getUserUnitSlugs(user) {
  return (effectiveUnitsForUser(user) || []).map(canonicalizeTicketUnit).filter(Boolean);
}

function isTicketManager(user) {
  if (isSystemAdminAccount(user)) return true;
  const roles = getUserRoleSlugs(user);
  const position = normalize(user?.position);
  return (
    roles.some((role) => ['superadmin', 'admin', 'system_admin', 'director', 'cto'].includes(role)) ||
    position === 'director' ||
    position.includes('manager') ||
    position.includes('supervisor')
  );
}

function canViewTicket(user, ticket) {
  if (isTicketManager(user) || isSystemAdminAccount(user)) return true;
  // NOC operates the master ticket desk as well as its own escalation queue.
  if (getUserRoleSlugs(user).some((role) => ['noc', 'noc_manager', 'noc_supervisor'].includes(role))) return true;
  if (!ticket) return false;
  const userId = Number(user?.id);
  if (Number(ticket.assigned_to) === userId) return true;
  if (ticket.created_by_type === 'staff' && Number(ticket.created_by_id) === userId) return true;

  const ticketStage = canonicalizeTicketUnit(ticket.escalation_stage);
  const units = getUserUnitSlugs(user).map(canonicalizeTicketUnit);
  if (ticketStage && units.includes(ticketStage)) return true;
  // Sales unit gets read visibility into every ticket (not just ones staged in their own
  // "unit", which doesn't exist as an escalation_stage) so they can see what's going on with
  // customers — this only ever grants viewing; isTicketManager/canEscalateTicket below are
  // separate, untouched gates, so a sales account still can't assign, escalate, or reassign.
  if (getUserUnitSlugs(user).includes('sales')) return true;

  const roleToStage = {
    cx: 'cx',
    noc: 'noc',
    noc_manager: 'noc',
    noc_supervisor: 'noc',
    ip: 'ip',
    ip_manager: 'ip',
    ip_supervisor: 'ip',
    ts_manager: 'ts',
    ts_supervisor: 'ts',
    field_engineer: 'ts',
    field_engineer_admin: 'ts',
    relationship_officer: 'cx',
  };
  return getUserRoleSlugs(user).some((role) => roleToStage[role] === ticketStage);
}

const ESCALATION_UNIT_LABELS = { noc: 'NOC', ip: 'IP Ticketing', ts: 'TX Ticketing', cx: 'CX Support' };

// Who may move a ticket to a different unit: the currently assigned person (their call while
// they're working it), CX/admin (blanket rights, matches the existing reassignment gate), or a
// supervisor/manager who belongs to the ticket's CURRENT unit (they can reroute work in their
// own queue even if they're not personally assigned).
function canEscalateTicket(user, ticket) {
  if (isSystemAdminAccount(user)) return true;
  const roles = getUserRoleSlugs(user);
  if (roles.some((r) => r.includes('cx'))) return true;
  if (Number(ticket.assigned_to) === Number(user?.id)) return true;
  const ticketUnit = canonicalizeTicketUnit(ticket.escalation_stage);
  const userUnits = getUserUnitSlugs(user);
  if (ticketUnit && userUnits.includes(ticketUnit)) {
    const position = normalize(user?.position);
    if (position.includes('manager') || position.includes('supervisor')) return true;
    if (roles.some((r) => r.includes('manager') || r.includes('supervisor'))) return true;
  }
  return false;
}

// Registered before /tickets/:id below so "my-day" is never swallowed as a ticket id —
// Express matches routes in registration order, not by static-vs-param specificity.
// "Today's Tickets" — every ticket the caller has personally touched today (viewed,
// commented, changed status/assigned/closed), deduped to one row per ticket. This is
// deliberately a filtered PERSONAL view on the same activity_logs the rest of the ticket
// flow already writes to — not a separate queue or its own tracking system.
router.get('/tickets/my-day', authenticateToken, async (req, res) => {
  try {
    await ensureActivityLogsTable();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (t.id) t.id, t.ticket_id, t.title, t.status, t.priority,
                t.escalation_stage, t.category, t.created_at, t.updated_at,
                MAX(a.created_at) OVER (PARTITION BY t.id) AS last_touched_at
         FROM tickets t
         JOIN activity_logs a ON a.record_type = 'ticket' AND a.record_id = t.id
         WHERE a.user_id = $1 AND a.created_at >= $2
         ORDER BY t.id
       ) x ORDER BY last_touched_at DESC`,
      [req.authUser.id, startOfDay.toISOString()]
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    console.error('GET /tickets/my-day error:', err);
    res.status(500).json({ error: "Failed to fetch today's tickets" });
  }
});

// Registered before the router-wide auth gate below so a valid share token can serve
// this one read-only detail route without a user session; every other route in this
// file (including mutations) still requires full authentication.
router.get('/tickets/:id', authenticateOrShareToken('ticket', authenticateToken), async (req, res) => {
  try {
    const id = req.isSharedView ? String(req.shareLink.record_id) : normalizeTicketRef(req.params.id);
    if (!id || id === 'report') {
      return res.status(400).json({
        error: 'Use GET /api/reports/tickets for the ticket report (this path is a ticket ID).',
      });
    }
    // Timeline and tags only depend on the ticket ref, not on the ticket row itself — running
    // all three lookups concurrently instead of one after another cuts this endpoint's latency
    // roughly to the slowest single query instead of the sum of all of them.
    const [ticket, timeline, tags] = await Promise.all([
      getTicketByIdForStaff(id),
      getTicketTimeline(id),
      getTagsForTicket(id),
    ]);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!req.isSharedView && !canViewTicket(req.authUser, ticket)) {
      return res.status(403).json({ error: 'This ticket is not assigned to you.' });
    }

    // Normalize attachments paths
    if (ticket.attachments) {
      try {
        // Handle both string (JSON) and object formats
        let parsed;
        if (typeof ticket.attachments === 'string') {
          try {
            parsed = JSON.parse(ticket.attachments);
          } catch (parseError) {
            // If parsing fails, try to handle as a single path string
            parsed = [{ path: ticket.attachments, originalName: 'Attachment' }];
          }
        } else if (Array.isArray(ticket.attachments)) {
          parsed = ticket.attachments;
        } else if (typeof ticket.attachments === 'object') {
          // If it's a single object, wrap it in an array
          parsed = [ticket.attachments];
        } else {
          parsed = [];
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          ticket.attachments = parsed.map(att => {
            const path = att.path || att.savedName || att;
            const normalizedPath = String(path)
              .replace(/^[A-Z]:\\.*\\uploads\\/i, '')   // remove absolute Windows prefix if present
              .replace(/\\/g, '/')                      // normalize slashes
              .replace(/^\/uploads\//, '')              // remove leading /uploads/
              .replace(/^uploads\//, '');               // remove leading uploads/

            return {
              ...att,
              path: normalizedPath.startsWith('tickets/') ? normalizedPath : `tickets/${normalizedPath}`,
              originalName: att.originalName || att.name || 'Attachment'
            };
          });
        } else {
          ticket.attachments = [];
        }
      } catch (e) {
        console.warn('[CX Route] Failed to normalize attachments:', e);
        // Set to empty array on error to prevent issues
        ticket.attachments = [];
      }
    }

    if (!req.isSharedView) {
      // Audit log write — doesn't gate the response the viewer is waiting on.
      logUserAction(req.authUser, { actionType: 'ticket_viewed', recordType: 'ticket', recordId: ticket.id || ticket.row_id, recordRef: ticket.ticket_id, description: `${req.authUser.full_name || req.authUser.username} viewed Ticket #${ticket.ticket_id}` }).catch((e) => console.warn('[CX Route] ticket_viewed log failed:', e.message));
    }
    res.json({ success: true, data: { ticket: { ...ticket, tags }, timeline } });
  } catch (err) {
    console.error('GET /tickets/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
  }
});

router.use(authenticateToken);
router.use(invalidateOnMutation);

// --- AUTO-FIX: Remove old restrictive role constraint ---
async function removeOldRoleConstraint() {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'users_role_check' 
          AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT users_role_check;
        END IF;
      END $$;
    `);
    console.log('✅ Old users_role_check constraint removed (if existed)');
  } catch (err) {
    console.warn('⚠️ Could not remove users_role_check constraint (may not exist)');
  }
}

// Run on server start
removeOldRoleConstraint();

// --- TEAM MEMBERS (for ticket assignment dropdown) ---
// Membership is resolved via effectiveUnitsForUser (handles the units JSONB array, the legacy
// single `unit` column, and role-based defaults all at once) rather than substring-matching the
// legacy `role` column alone — that missed real unit staff whose membership only lives in
// `units`/`main_role`, which is why the NOC dropdown could come back empty despite real NOC users
// existing.
router.get('/team-members', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, first_name, last_name, username, email, role, main_role, unit, units, position
      FROM users
      WHERE deleted_at IS NULL
      ORDER BY first_name, last_name
    `);

    const ESCALATION_CHAIN_ROLES = ['approver', 'director', 'cto', 'relationship_officer'];

    const teamMembers = result.rows
      .map((user) => {
        const roleSlug = getUserRoleSlugs(user)[0] || '';
        return {
          id: user.id,
          fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
          username: user.username,
          email: user.email,
          unit: user.unit,
          units: getUserUnitSlugs(user),
          position: user.position,
          role: roleSlug,
        };
      })
      .filter((m) =>
        m.units.some((u) => ['cx', 'noc', 'ip', 'ts'].includes(u)) ||
        ESCALATION_CHAIN_ROLES.includes(m.role) ||
        ['customer support', 'relationship officer', 'engineer'].includes(String(m.position || '').toLowerCase()) ||
        String(m.position || '').toLowerCase().includes('manager') ||
        String(m.position || '').toLowerCase().includes('supervisor')
      );

    res.json(teamMembers);
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to load team members' });
  }
});

// --- GET SUPPORT USERS (used by escalation and work-history screens) ---
router.get('/users', async (req, res) => {
  try {
    // Ensure unit column exists
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'unit'
        ) THEN
          ALTER TABLE users ADD COLUMN unit VARCHAR(100);
        END IF;
      END $$;
    `);

    const result = await pool.query(`
      SELECT 
        id, 
        first_name, 
        last_name, 
        username, 
        email, 
        role,
        COALESCE(unit, 'None') AS unit
      FROM users 
      WHERE deleted_at IS NULL
      ORDER BY first_name, last_name
    `);

    const users = result.rows.map(user => ({
      id: user.id,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      username: user.username,
      email: user.email,
      roles: user.role ? user.role.split(',').map(r => r.trim()) : [],
      unit: user.unit === 'None' ? null : user.unit,
    }));

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// --- UPDATE USER ROLES & UNIT ---
router.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { roles, unit } = req.body;

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'At least one role is required' });
  }

  const allowedRoles = [
    'cx', 'noc', 'ip', 'field_engineer', 'field_engineer_admin',
    'approver', 'director', 'superadmin', 'requester'
  ];

  const invalidRoles = roles.filter(r => !allowedRoles.includes(r.toLowerCase()));
  if (invalidRoles.length > 0) {
    return res.status(400).json({ 
      error: `Invalid roles: ${invalidRoles.join(', ')}. Allowed: ${allowedRoles.join(', ')}` 
    });
  }

  try {
    const rolesString = roles.join(', ');
    const unitValue = unit && unit !== 'None' && unit !== '' ? unit : null;

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'unit'
        ) THEN
          ALTER TABLE users ADD COLUMN unit VARCHAR(100);
        END IF;
      END $$;
    `);

    await pool.query(`
      UPDATE users 
      SET role = $1, unit = $2 
      WHERE id = $3 AND deleted_at IS NULL
    `, [rolesString, unitValue, id]);

    res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// --- NEW: RESET PIN FOR EXISTING CUSTOMER ---
router.post('/customers/:id/reset-pin', async (req, res) => {
  const { id } = req.params;

  try {
    // Optional: You can add extra checks here (e.g. only allow certain roles)

    const result = await setCustomerPIN(parseInt(id));
    // setCustomerPIN returns { customer_code, pin: "new12345" }

    res.json({
      success: true,
      message: 'New PIN generated successfully',
      pin: result.pin,              // Plain new PIN — only shown once
      customer_code: result.customer_code
    });
  } catch (err) {
    console.error('PIN reset error:', err);
    res.status(500).json({ error: err.message || 'Failed to reset PIN' });
  }
});

// --- TICKET TAGS ---
function parseIdList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n));
  return String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function actorFromReq(req) {
  return {
    id: req.authUser?.id,
    name: `${req.authUser?.first_name || ''} ${req.authUser?.last_name || ''}`.trim() || req.authUser?.username || 'Staff',
    role: String(req.authUser?.role || req.authUser?.main_role || 'staff').split(',')[0].trim() || 'staff',
  };
}

router.get('/tags', async (req, res) => {
  try {
    const tags = await listTicketTags();
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('GET /tags error:', err);
    res.status(500).json({ error: 'Failed to load tags' });
  }
});

router.post('/tags', async (req, res) => {
  try {
    if (!isTicketManager(req.authUser)) {
      return res.status(403).json({ error: 'Only managers can create tags' });
    }
    const tag = await createTicketTag({
      name: req.body?.name,
      color: req.body?.color,
      created_by: req.authUser.id,
    });
    res.status(201).json({ success: true, data: tag });
  } catch (err) {
    console.error('POST /tags error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create tag' });
  }
});

router.patch('/tags/:id', async (req, res) => {
  try {
    if (!isTicketManager(req.authUser)) {
      return res.status(403).json({ error: 'Only managers can update tags' });
    }
    const tag = await updateTicketTag(req.params.id, {
      name: req.body?.name,
      color: req.body?.color,
    });
    res.json({ success: true, data: tag });
  } catch (err) {
    console.error('PATCH /tags error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update tag' });
  }
});

router.delete('/tags/:id', async (req, res) => {
  try {
    if (!isTicketManager(req.authUser)) {
      return res.status(403).json({ error: 'Only managers can delete tags' });
    }
    await deleteTicketTag(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /tags error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to delete tag' });
  }
});

// --- TICKET ENDPOINTS ---
router.get('/tickets', async (req, res) => {
  try {
    const { status, project_id, escalation_stage, tag_ids, tag_ids_any } = req.query;
    const tickets = await getAllTickets({
      status: status ? status.toUpperCase() : null,
      project_id: project_id ? parseInt(project_id, 10) : null,
      escalation_stage: escalation_stage ? String(escalation_stage) : null,
      tag_ids: parseIdList(tag_ids),
      tag_ids_any: parseIdList(tag_ids_any),
    });
    const visibleTickets = isTicketManager(req.authUser)
      ? tickets
      : tickets.filter((ticket) => canViewTicket(req.authUser, ticket));
    res.json({ success: true, count: visibleTickets.length, data: visibleTickets });
  } catch (err) {
    console.error('GET /tickets error:', err);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.post('/tickets', async (req, res) => {
  const {
    customer_id,
    title,
    category = 'general',
    priority = 'normal',
    description,
    assigned_to,
    route_to_unit,
    tag_ids,
    site_id,
  } = req.body;

  if (!customer_id || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Customer ID, title, and description are required' });
  }

  try {
    let targetUnit = null;
    if (route_to_unit) {
      const config = await getTicketEscalationConfig();
      const configuredStage = config.stages?.find((stage) => stage.key === route_to_unit);
      if (!configuredStage) {
        return res.status(400).json({ error: 'Selected ticket unit is not configured' });
      }
      targetUnit = configuredStage.key;
    }

    const custRes = await pool.query(`SELECT project_id FROM customers WHERE id = $1`, [customer_id]);
    if (custRes.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    const project_id = custRes.rows[0].project_id;

    if (site_id) {
      const siteRes = await pool.query(
        `SELECT id FROM customer_sites WHERE id = $1 AND customer_id = $2`,
        [parseInt(site_id, 10), parseInt(customer_id, 10)]
      );
      if (!siteRes.rowCount) {
        return res.status(400).json({ error: 'Selected site does not belong to this client' });
      }
    }

    const ticket = await createTicket(
      {
        project_id,
        customer_id: parseInt(customer_id),
        title: title.trim(),
        category,
        description: description.trim(),
        priority,
        site_id: site_id ? parseInt(site_id, 10) : null,
      },
      assigned_to ? parseInt(assigned_to) : null,
      req.authUser.id,
      req.ip,
      'staff',
      req.authUser.role.split(',')[0].trim().toUpperCase(),
      targetUnit
    );

    recordTimingEvent({
      workflowType: 'ticket', recordId: ticket.id, eventType: 'created', stageName: 'new',
      toUnitSlug: targetUnit || null, toUserId: ticket.assigned_to || null, triggeredByUserId: req.authUser.id,
    }).catch(() => {});

    try {
      const actorName = `${req.authUser.first_name || ''} ${req.authUser.last_name || ''}`.trim() || req.authUser.username;
      const recordChannelId = await ensureTicketThread(ticket, getRealtimeIo());
      const assigneeId = ticket.assigned_to || (assigned_to ? parseInt(assigned_to) : null);
      await postTicketSystemMessage({
        ticketId: ticket.ticket_id,
        title: title.trim(),
        actorName,
        io: getRealtimeIo(),
        assigneeId,
        recordChannelId,
        action: assigneeId ? 'created' : 'routed',
      });
    } catch (e) {
      console.warn('[chat] ticket system message failed:', e.message);
    }

    let tags = [];
    try {
      if (Array.isArray(tag_ids) && tag_ids.length) {
        tags = await addTagsToTicket(ticket.ticket_id, tag_ids, actorFromReq(req));
      } else {
        tags = await getTagsForTicket(ticket.ticket_id);
      }
    } catch (tagErr) {
      console.warn('[tags] apply on create failed:', tagErr.message);
    }

    try {
      // Assigned goes straight to the assignee; otherwise the whole queue that owns the target
      // unit gets it (same shape as an unclaimed ticket sitting in that unit's list).
      const assigneeId = ticket.assigned_to || (assigned_to ? parseInt(assigned_to, 10) : null);
      const recipientIds = assigneeId
        ? [assigneeId]
        : await resolveUnitRecipients({ unitSlugs: [targetUnit || 'cx'] });
      if (recipientIds.length) {
        await sendPushToUserIds(recipientIds, {
          title: assigneeId ? `Ticket #${ticket.ticket_id} assigned to you` : `New ticket in ${(targetUnit || 'cx').toUpperCase()}`,
          body: title.trim(),
          data: {
            url: `/staff/cx/tickets/${ticket.ticket_id}`,
            type: 'ticket', action: 'ticket_created',
            requestId: String(ticket.ticket_id), tag: `ticket-created-${ticket.ticket_id}`,
          },
        });
      }
    } catch (e) {
      console.warn('[push] ticket created push failed:', e.message);
    }

    res.status(201).json({ success: true, ticket_id: ticket.ticket_id, ticket: { ...ticket, tags } });
  } catch (err) {
    console.error('Ticket creation error:', err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.post('/tickets/:id/tags', async (req, res) => {
  try {
    const tags = await addTagsToTicket(req.params.id, req.body?.tag_ids || [], actorFromReq(req));
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('POST /tickets/:id/tags error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to add tags' });
  }
});

router.delete('/tickets/:id/tags/:tagId', async (req, res) => {
  try {
    const tags = await removeTagFromTicket(req.params.id, Number(req.params.tagId), actorFromReq(req));
    res.json({ success: true, data: tags });
  } catch (err) {
    console.error('DELETE /tickets/:id/tags/:tagId error:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to remove tag' });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status, comment, visibility = 'public', assigned_to, isEscalation = false } = req.body;

  try {
    // Unassigned tickets: any staff may claim (assign). Reassignment requires assignee, CX, or admin.
    if (assigned_to !== undefined && assigned_to) {
      const ticketCheck = await pool.query(
        `SELECT assigned_to, escalation_stage FROM tickets WHERE ticket_id = $1`,
        [id]
      );

      if (ticketCheck.rowCount > 0 && !ticketCheck.rows[0].assigned_to) {
        // Claim allowed — no extra gate
      } else if (ticketCheck.rowCount > 0 && ticketCheck.rows[0].assigned_to) {
        // Same rule as escalation: the current assignee, CX/admin, or a supervisor/manager of
        // the ticket's current unit may reassign it.
        if (!canEscalateTicket(req.authUser, ticketCheck.rows[0])) {
          const action = isEscalation ? 'escalate' : 'assign';
          return res.status(403).json({
            error: `Only the assigned person, this unit's supervisor/manager, CX members, or an administrator can ${action} this ticket.`,
            code: 'PERMISSION_DENIED',
            action: action
          });
        }
      }
    }

    const result = await updateTicketStaff(
      id,
      { status, assigned_to: assigned_to !== undefined ? parseInt(assigned_to) : undefined, comment, visibility, isEscalation },
      req.authUser.id,
      req.authUser.role.split(',')[0].trim().toUpperCase(),
      req.ip
    );

    try {
      if (assigned_to !== undefined && assigned_to) {
        const ticketRow = await pool.query(
          'SELECT ticket_id, title, assigned_to, created_by_id FROM tickets WHERE ticket_id = $1',
          [id]
        );
        const t = ticketRow.rows[0];
        if (t) {
          const assigneeId = parseInt(assigned_to, 10);
          const assigneeRes = await pool.query(
            'SELECT first_name, last_name, username FROM users WHERE id = $1',
            [assigneeId]
          );
          const assignee = assigneeRes.rows[0];
          const assigneeName = assignee
            ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || assignee.username
            : 'Assignee';
          const actorName =
            `${req.authUser.first_name || ''} ${req.authUser.last_name || ''}`.trim() ||
            req.authUser.username;
          const io = getRealtimeIo();
          await ensureTicketThread(
            { ticket_id: t.ticket_id, title: t.title, created_by_id: t.created_by_id, assigned_to: assigneeId },
            io
          );
          await syncTicketThreadAssignee(t.ticket_id, assigneeId, io);
          const isSelfClaim = assigneeId === req.authUser.id;
          await postTicketSystemMessage({
            ticketId: t.ticket_id,
            title: t.title,
            actorName: isSelfClaim ? assigneeName : actorName,
            action: 'assigned',
            assigneeId,
            io,
          });
        }
      } else if (status) {
        const ticketRow = await pool.query('SELECT ticket_id, title FROM tickets WHERE ticket_id = $1', [id]);
        const t = ticketRow.rows[0];
        if (t) {
          const actorName = `${req.authUser.first_name || ''} ${req.authUser.last_name || ''}`.trim() || req.authUser.username;
          await postTicketSystemMessage({
            ticketId: t.ticket_id,
            title: t.title,
            actorName,
            action: 'status',
            io: getRealtimeIo(),
          });
        }
      }
    } catch (e) {
      console.warn('[chat] ticket update system message failed:', e.message);
    }

    emitToStaff('staff:realtime', {
      topic: 'tickets',
      action: 'ticket_updated',
      ticketId: id,
      status: status || result?.status,
    });

    const actor = req.authUser.full_name || `${req.authUser.first_name || ''} ${req.authUser.last_name || ''}`.trim() || req.authUser.username;
    const ticketRow = await pool.query('SELECT id, ticket_id FROM tickets WHERE ticket_id=$1', [id]);
    const ticketRecord = ticketRow.rows[0];
    if (ticketRecord && comment?.trim()) await logUserAction(req.authUser, { actionType: 'ticket_commented', recordType: 'ticket', recordId: ticketRecord.id, recordRef: ticketRecord.ticket_id, description: `${actor} commented on Ticket #${ticketRecord.ticket_id}` });
    if (ticketRecord && status) {
      const statusLabel = String(status).replace(/_/g, ' ');
      await logUserAction(req.authUser, { actionType: 'ticket_status', recordType: 'ticket', recordId: ticketRecord.id, recordRef: ticketRecord.ticket_id, description: `${actor} changed status of Ticket #${ticketRecord.ticket_id} to ${statusLabel}` });
      if (String(status).toUpperCase() === 'CLOSED') await logUserAction(req.authUser, { actionType: 'ticket_closed', recordType: 'ticket', recordId: ticketRecord.id, recordRef: ticketRecord.ticket_id, description: `${actor} closed Ticket #${ticketRecord.ticket_id}` });
    }
    if (ticketRecord && assigned_to) {
      const assignee = await pool.query(`SELECT COALESCE(NULLIF(trim(concat_ws(' ',first_name,last_name)),''),username,'User') full_name, unit FROM users WHERE id=$1`, [assigned_to]);
      await logUserAction(req.authUser, { actionType: 'ticket_assigned', recordType: 'ticket', recordId: ticketRecord.id, recordRef: ticketRecord.ticket_id, description: `${actor} assigned Ticket #${ticketRecord.ticket_id} to ${assignee.rows[0]?.full_name || 'User'}` });
      recordTimingEvent({
        workflowType: 'ticket', recordId: ticketRecord.id, eventType: 'assigned', stageName: 'assigned',
        toUnitSlug: assignee.rows[0]?.unit || null, toUserId: Number(assigned_to), triggeredByUserId: req.authUser.id,
      }).catch(() => {});
    }
    if (ticketRecord && status) {
      // Preserve current ownership on a pure status change (not a reassignment) so the new
      // segment doesn't lose who/which unit the ticket is still actually held by.
      const owner = await pool.query(
        `SELECT t.assigned_to, u.unit FROM tickets t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = $1`,
        [ticketRecord.id]
      );
      recordTimingEvent({
        workflowType: 'ticket', recordId: ticketRecord.id,
        eventType: TICKET_TERMINAL_STATUSES.has(String(status).toUpperCase()) ? 'completed' : 'started',
        stageName: String(status).toLowerCase(),
        toUnitSlug: owner.rows[0]?.unit || null, toUserId: owner.rows[0]?.assigned_to || null,
        triggeredByUserId: req.authUser.id,
      }).catch(() => {});
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Ticket update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update ticket' });
  }
});

// --- ASSIGN/BACKFILL A TICKET'S SITE (Client/Site standardization) ---
// A ticket must have a Client and Site before it can be used for an overtime request or
// anywhere else the master data is required — this is how an existing ticket that's missing
// one gets fixed, via a searched-and-selected site only (never free text).
router.patch('/tickets/:id/site', async (req, res) => {
  const { id } = req.params;
  const { site_id } = req.body || {};
  try {
    if (!site_id) return res.status(400).json({ error: 'site_id is required' });
    const ticketRes = await pool.query('SELECT id, ticket_id, customer_id FROM tickets WHERE ticket_id = $1', [id]);
    if (ticketRes.rowCount === 0) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = ticketRes.rows[0];

    const siteRes = await pool.query('SELECT id, site_name, customer_id FROM customer_sites WHERE id = $1', [site_id]);
    if (siteRes.rowCount === 0) return res.status(404).json({ error: 'Site not found' });
    const site = siteRes.rows[0];
    if (ticket.customer_id && site.customer_id && Number(site.customer_id) !== Number(ticket.customer_id)) {
      return res.status(400).json({ error: "This site does not belong to the ticket's client." });
    }

    const updated = await pool.query(
      `UPDATE tickets SET site_id = $1, customer_id = COALESCE(customer_id, $2), updated_at = NOW()
       WHERE id = $3 RETURNING id, ticket_id, site_id, customer_id`,
      [site_id, site.customer_id, ticket.id]
    );
    res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('Ticket site update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update ticket site' });
  }
});

// --- MANUAL EMAIL SEND TO CUSTOMER ---
router.post('/tickets/:id/send-email', async (req, res) => {
  const { id } = req.params;
  const { subject, message } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const ticket = await getTicketByIdForStaff(id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (!ticket.contact_email) {
      return res.status(400).json({ error: 'Customer email not found for this ticket' });
    }

    const { sendTicketEmail } = await import('../emailService.js');
    
    try {
      await sendTicketEmail(
        ticket.contact_email,
        ticket.customer_name,
        ticket.customer_code,
        ticket.ticket_id,
        'manual',
        {
          subject: subject || `Update on Ticket ${ticket.ticket_id}`,
          message: message.trim(),
          status: ticket.status
        }
      );

      // Add timeline entry only if email was sent successfully
      const actorRes = await pool.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [req.authUser.id]);
      const actorName = actorRes.rows[0]
        ? `${actorRes.rows[0].first_name || ''} ${actorRes.rows[0].last_name || ''}`.trim()
        : 'Staff';

      const ticketRes = await pool.query(`SELECT id FROM tickets WHERE ticket_id = $1`, [id]);
      if (ticketRes.rowCount > 0) {
        await pool.query(
          `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
           VALUES ($1, 'EMAIL_SENT', $2, 'public', $3, $4, $5)`,
          [ticketRes.rows[0].id, `Email sent to customer: ${message.substring(0, 100)}...`, req.authUser.id, req.authUser.role.split(',')[0].trim().toUpperCase(), actorName]
        );
      }

      res.json({ success: true, message: 'Email sent successfully to customer' });
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
      // Still add timeline entry but mark it as failed
      const actorRes = await pool.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [req.authUser.id]);
      const actorName = actorRes.rows[0]
        ? `${actorRes.rows[0].first_name || ''} ${actorRes.rows[0].last_name || ''}`.trim()
        : 'Staff';

      const ticketRes = await pool.query(`SELECT id FROM tickets WHERE ticket_id = $1`, [id]);
      if (ticketRes.rowCount > 0) {
        await pool.query(
          `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
           VALUES ($1, 'EMAIL_FAILED', $2, 'internal', $3, $4, $5)`,
          [ticketRes.rows[0].id, `Failed to send email to customer: ${emailErr.message}`, req.authUser.id, req.authUser.role.split(',')[0].trim().toUpperCase(), actorName]
        );
      }
      
      res.status(500).json({ 
        error: emailErr.message || 'Failed to send email. Please check SMTP settings or try again later.',
        details: 'The ticket update was successful, but the email notification could not be sent.'
      });
    }
  } catch (err) {
    console.error('Send email error:', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
});

// PATCH /tickets/:id/escalate-unit — move a ticket to a different unit's queue, unassigned.
// Unlike the old flow, the escalator does NOT pick a person here: the ticket lands unassigned
// in the target unit and any member of that unit (typically its supervisor/manager) claims it
// or assigns a specific engineer afterward via the existing assign/claim paths.
router.patch('/tickets/:id/escalate-unit', async (req, res) => {
  const { id } = req.params;
  const targetUnit = canonicalizeTicketUnit(req.body?.target_unit);
  const reason = String(req.body?.reason || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!Object.prototype.hasOwnProperty.call(ESCALATION_UNIT_LABELS, targetUnit)) {
    return res.status(400).json({ error: 'A valid target unit is required' });
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason for escalation is required' });
  }

  try {
    const ticketRes = await pool.query(
      `SELECT id, ticket_id, title, assigned_to, escalation_stage, status FROM tickets WHERE ticket_id = $1`,
      [id]
    );
    const ticket = ticketRes.rows[0];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (TICKET_TERMINAL_STATUSES.has(String(ticket.status).toUpperCase())) {
      return res.status(400).json({ error: 'Cannot escalate a closed or resolved ticket' });
    }
    if (!canEscalateTicket(req.authUser, ticket)) {
      return res.status(403).json({
        error: "Only the assigned person, this unit's supervisor/manager, CX, or an administrator can escalate this ticket.",
        code: 'PERMISSION_DENIED',
        action: 'escalate',
      });
    }

    const fromLabel = ESCALATION_UNIT_LABELS[canonicalizeTicketUnit(ticket.escalation_stage)] || (ticket.escalation_stage || 'Unassigned');
    const toLabel = ESCALATION_UNIT_LABELS[targetUnit];
    const actorName = `${req.authUser.first_name || ''} ${req.authUser.last_name || ''}`.trim() || req.authUser.username;
    const actorRole = req.authUser.role?.split(',')[0]?.trim()?.toUpperCase() || 'STAFF';

    await pool.query(
      `UPDATE tickets SET
        escalation_stage = $1,
        assigned_to = NULL,
        stage_entered_at = CURRENT_TIMESTAMP,
        stage_accepted_at = NULL,
        status = CASE WHEN status = 'NEW' THEN 'OPEN' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [targetUnit, ticket.id]
    );

    await pool.query(
      `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
       VALUES ($1, 'ESCALATED', $2, 'public', $3, $4, $5)`,
      [ticket.id, `Escalated from ${fromLabel} to ${toLabel} — awaiting assignment. Reason: ${reason}`, req.authUser.id, actorRole, actorName]
    );
    if (notes) {
      await pool.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'COMMENT', $2, 'internal', $3, $4, $5)`,
        [ticket.id, `Escalation notes: ${notes}`, req.authUser.id, actorRole, actorName]
      );
    }

    recordTimingEvent({
      workflowType: 'ticket', recordId: ticket.id, eventType: 'transferred_to_unit',
      stageName: targetUnit, toUnitSlug: targetUnit, toUserId: null,
      triggeredByUserId: req.authUser.id, notes: reason,
    }).catch(() => {});

    logUserAction(req.authUser, {
      actionType: 'ticket_escalated', recordType: 'ticket', recordId: ticket.id, recordRef: ticket.ticket_id,
      description: `${actorName} escalated Ticket #${ticket.ticket_id} from ${fromLabel} to ${toLabel}`,
    });

    try {
      const io = getRealtimeIo();
      await postTicketSystemMessage({ ticketId: ticket.ticket_id, title: ticket.title, actorName, action: 'routed', io });
    } catch (e) {
      console.warn('[chat] escalate ticket system message failed:', e.message);
    }

    const fullTicket = await getTicketByIdForStaff(id);
    const timeline = await getTicketTimeline(id);
    res.json({ ticket: fullTicket, timeline });
  } catch (err) {
    console.error('PATCH /tickets/:id/escalate-unit error:', err);
    res.status(500).json({ error: err.message || 'Failed to escalate ticket' });
  }
});

router.patch('/tickets/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;

  if (!assigned_to || isNaN(assigned_to)) {
    return res.status(400).json({ error: 'assigned_to (user ID) is required' });
  }

  try {
    const userRes = await pool.query(
      `SELECT id, first_name, last_name, unit FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [assigned_to]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await updateTicketStaff(
      id,
      { assigned_to: parseInt(assigned_to) },
      req.authUser.id,
      req.authUser.role.split(',')[0].trim().toUpperCase(),
      req.ip
    );

    const assignedUser = userRes.rows[0];
    const assignedName = `${assignedUser.first_name || ''} ${assignedUser.last_name || ''}`.trim() || 'User';

    try {
      const ticketRow = await pool.query(
        'SELECT ticket_id, title, created_by_id FROM tickets WHERE ticket_id = $1',
        [id]
      );
      const t = ticketRow.rows[0];
      if (t) {
        const io = getRealtimeIo();
        await ensureTicketThread(
          {
            ticket_id: t.ticket_id,
            title: t.title,
            created_by_id: t.created_by_id,
            assigned_to: parseInt(assigned_to, 10),
          },
          io
        );
        await syncTicketThreadAssignee(t.ticket_id, parseInt(assigned_to, 10), io);
        await postTicketSystemMessage({
          ticketId: t.ticket_id,
          title: t.title,
          actorName: assignedName,
          action: 'assigned',
          assigneeId: parseInt(assigned_to, 10),
          io,
        });
      }
    } catch (e) {
      console.warn('[chat] assign ticket system message failed:', e.message);
    }
    const ticketRowForActivity = await pool.query('SELECT id, ticket_id FROM tickets WHERE ticket_id=$1', [id]);
    const ticketForActivity = ticketRowForActivity.rows[0];
    if (ticketForActivity) await logUserAction(req.authUser, { actionType: 'ticket_assigned', recordType: 'ticket', recordId: ticketForActivity.id, recordRef: ticketForActivity.ticket_id, description: `${req.authUser.full_name || req.authUser.username} assigned Ticket #${ticketForActivity.ticket_id} to ${assignedName}` });
    if (ticketForActivity) {
      recordTimingEvent({
        workflowType: 'ticket', recordId: ticketForActivity.id, eventType: 'assigned', stageName: 'assigned',
        toUnitSlug: assignedUser.unit || null, toUserId: assignedUser.id, triggeredByUserId: req.authUser.id,
      }).catch(() => {});
    }

    res.json({
      success: true,
      message: `Ticket assigned to ${assignedName}`,
      data: { ...result, assignee_name: assignedName }
    });
  } catch (err) {
    console.error('Assign error:', err);
    res.status(500).json({ error: err.message || 'Failed to assign ticket' });
  }
});

// --- PROJECTS & CUSTOMERS ---
router.get('/projects', async (req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

router.post('/projects', async (req, res) => {
  const { project_name, description } = req.body;
  if (!project_name?.trim()) return res.status(400).json({ error: 'Project name is required' });

  try {
    const project = await createProject(project_name.trim(), description?.trim() || '', req.authUser.id, req.ip || 'unknown');
    res.status(201).json(project);
  } catch (err) {
    console.error('POST /projects error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/customers', async (req, res) => {
  const { project_id } = req.query;
  try {
    const customers = await getCustomers(project_id ? parseInt(project_id, 10) : null);
    res.json(customers);
  } catch (err) {
    console.error('GET /customers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.post('/tickets/:id/accept', async (req, res) => {
  try {
    await markTicketStageAccepted(req.params.id, req.authUser.id);
    res.json({ success: true, message: 'Ticket accepted for current escalation stage' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to accept ticket' });
  }
});

router.post('/customers', async (req, res) => {
  const {
    customer_name,
    organization_name,
    contact_email,
    contact_phone,
    location,
    project_id,
  } = req.body;
  const orgName = (organization_name || customer_name || '').trim();
  if (!orgName) {
    return res.status(400).json({ error: 'Organization name is required' });
  }
  if (!contact_email?.trim()) {
    return res.status(400).json({ error: 'Email address is required' });
  }
  if (!contact_phone?.trim()) {
    return res.status(400).json({ error: 'Phone number is required' });
  }
  if (!location?.trim()) {
    return res.status(400).json({ error: 'Location is required' });
  }

  try {
    const customer = await createCustomer(
      orgName,
      contact_email.trim(),
      contact_phone.trim(),
      project_id ? parseInt(project_id, 10) : null,
      req.authUser.id,
      req.ip || 'unknown',
      location.trim()
    );
    res.status(201).json(customer);
  } catch (err) {
    console.error('POST /customers error:', err);
    res.status(500).json({ error: err.message || 'Failed to add customer' });
  }
});

// --- USER WORK HISTORY ---
router.get('/users/:id/work-history', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    const workHistory = await getUserWorkHistory(userId);
    res.json({ success: true, data: workHistory });
  } catch (err) {
    console.error('GET /users/:id/work-history error:', err);
    res.status(500).json({ error: 'Failed to fetch user work history' });
  }
});

// --- TICKET SEARCH WITH FULL DETAILS ---
router.get('/tickets/search/:ticketId', async (req, res) => {
  try {
    const { ticketId } = req.params;
    const fullDetails = await searchTicketWithFullDetails(ticketId);
    
    if (!fullDetails) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    
    res.json({ success: true, data: fullDetails });
  } catch (err) {
    console.error('GET /tickets/search/:ticketId error:', err);
    res.status(500).json({ error: 'Failed to search ticket' });
  }
});

// ═══════════════════════════════════════════
// CLIENTS (label) / customers (table) + SITES
// ═══════════════════════════════════════════
router.get('/clients', async (req, res) => {
  try {
    const { status, search, page, limit } = req.query;
    const result = await listClients({
      status: status || undefined,
      search: search || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('GET /clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.post('/clients', async (req, res) => {
  try {
    const {
      company_name,
      organization_name,
      customer_name,
      contact_person,
      email,
      contact_email,
      phone,
      contact_phone,
      location,
      status,
      site_ids,
    } = req.body;
    const name = (company_name || organization_name || customer_name || '').trim();
    const mail = (email || contact_email || '').trim();
    const tel = (phone || contact_phone || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required' });
    if (!mail) return res.status(400).json({ error: 'Email is required' });
    if (!tel) return res.status(400).json({ error: 'Phone is required' });
    if (!location?.trim()) return res.status(400).json({ error: 'Location is required' });

    const client = await createClient({
      company_name: name,
      contact_person,
      email: mail,
      phone: tel,
      location: location.trim(),
      status,
      site_ids: Array.isArray(site_ids) ? site_ids : [],
    });
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    console.error('POST /clients error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A client with that email already exists' });
    }
    res.status(500).json({ error: err.message || 'Failed to create client' });
  }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const client = await getClientById(parseInt(req.params.id, 10));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, data: client });
  } catch (err) {
    console.error('GET /clients/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

router.patch('/clients/:id', async (req, res) => {
  try {
    const client = await updateClient(parseInt(req.params.id, 10), req.body || {});
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json({ success: true, data: client });
  } catch (err) {
    console.error('PATCH /clients/:id error:', err);
    res.status(500).json({ error: err.message || 'Failed to update client' });
  }
});

router.post('/clients/:id/reset-password', async (req, res) => {
  try {
    const { new_password, reset_to_code, generate } = req.body || {};
    const result = await resetClientPassword(parseInt(req.params.id, 10), {
      new_password,
      reset_to_code: generate ? false : (reset_to_code !== false && !new_password),
      generate: !!generate,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /clients/:id/reset-password error:', err);
    res.status(400).json({ error: err.message || 'Failed to reset password' });
  }
});

router.get('/clients/:id/sites', async (req, res) => {
  try {
    const sites = await listSitesForClient(parseInt(req.params.id, 10));
    res.json({ success: true, data: sites });
  } catch (err) {
    console.error('GET /clients/:id/sites error:', err);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

router.post('/clients/:id/sites', async (req, res) => {
  try {
    const site = await createSite(parseInt(req.params.id, 10), req.body || {});
    res.status(201).json({ success: true, data: site });
  } catch (err) {
    console.error('POST /clients/:id/sites error:', err);
    res.status(400).json({ error: err.message || 'Failed to create site' });
  }
});

router.patch('/clients/:id/sites/:siteId', async (req, res) => {
  try {
    const site = await updateSite(
      parseInt(req.params.id, 10),
      parseInt(req.params.siteId, 10),
      req.body || {}
    );
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json({ success: true, data: site });
  } catch (err) {
    console.error('PATCH /clients/:id/sites/:siteId error:', err);
    res.status(400).json({ error: err.message || 'Failed to update site' });
  }
});

router.patch('/clients/:id/sites', async (req, res) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const siteIds = Array.isArray(req.body?.site_ids) ? req.body.site_ids : [];
    const linked = await linkSitesToClient(clientId, siteIds);
    const sites = await listSitesForClient(clientId);
    res.json({ success: true, linked, data: sites });
  } catch (err) {
    console.error('PATCH /clients/:id/sites error:', err);
    res.status(400).json({ error: err.message || 'Failed to link sites' });
  }
});

router.get('/sites', async (req, res) => {
  try {
    const { rows, total } = await listAllSites({
      client_id: req.query.client_id || req.query.customer_id,
      unassigned: req.query.unassigned,
      assignment: req.query.assignment,
      connection_status: req.query.connection_status,
      region: req.query.region,
      search: req.query.search,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({ success: true, data: rows, total, page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || total });
  } catch (err) {
    console.error('GET /sites error:', err);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

router.get('/sites/stats', async (req, res) => {
  try {
    const stats = await getSitesStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('GET /sites/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch site stats' });
  }
});

router.post('/sites', async (req, res) => {
  try {
    const site = await createStandaloneSite(req.body || {});
    res.status(201).json({ success: true, data: site });
  } catch (err) {
    console.error('POST /sites error:', err);
    res.status(400).json({ error: err.message || 'Failed to create site' });
  }
});

router.patch('/sites/:id', async (req, res) => {
  try {
    const site = await updateSiteById(parseInt(req.params.id, 10), req.body || {});
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json({ success: true, data: site });
  } catch (err) {
    console.error('PATCH /sites/:id error:', err);
    res.status(400).json({ error: err.message || 'Failed to update site' });
  }
});

export default router;
