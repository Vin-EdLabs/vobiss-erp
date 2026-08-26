// src/routes/cx.routes.js — FIXED: MULTI-ROLE SUPPORT + REMOVE OLD CONSTRAINT + PIN RESET
// Updated: January 12, 2026

import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
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
  resetClientPassword,
} from '../db.clients.cjs';
import { getUserById } from '../db.js';
import { emitToStaff } from '../realtime/channels.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { postTicketSystemMessage } from '../services/chatSystemMessage.js';
import { ensureTicketThread, syncTicketThreadAssignee } from '../services/chatRecordThreads.js';
import { TICKET_SUPPORT_ROLES } from '../roles.js';
import { getTicketEscalationConfig, markTicketStageAccepted } from '../ticketEscalation.js';
import { invalidateOnMutation } from '../services/vobiCache.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

// --- AUTH MIDDLEWARE ---
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id || decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.authUser = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
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

function getUserUnitSlugs(user) {
  const units = new Set();
  if (user?.unit) units.add(normalize(user.unit));
  parseJsonArray(user?.units).forEach((unit) => units.add(normalize(unit)));
  return [...units].filter(Boolean);
}

function isTicketManager(user) {
  const roles = getUserRoleSlugs(user);
  const position = normalize(user?.position);
  return (
    roles.some((role) => ['superadmin', 'admin', 'director', 'cto'].includes(role)) ||
    position === 'director' ||
    position.includes('manager') ||
    position.includes('supervisor')
  );
}

function canAccessSupportTickets(user) {
  const roles = getUserRoleSlugs(user);
  const units = getUserUnitSlugs(user);
  const position = normalize(user?.position);
  return (
    roles.some((role) => TICKET_SUPPORT_ROLES.includes(role)) ||
    units.some((unit) => ['cx', 'noc', 'ip', 'tx'].includes(unit)) ||
    ['customer support', 'relationship officer', 'engineer'].includes(position) ||
    position.includes('manager') ||
    position.includes('supervisor') ||
    position === 'director'
  );
}

function canViewTicket(user, ticket) {
  if (isTicketManager(user)) return true;
  if (!ticket) return false;
  const userId = Number(user?.id);
  return Number(ticket.assigned_to) === userId || (ticket.created_by_type === 'staff' && Number(ticket.created_by_id) === userId);
}

// Support check — supports both legacy roles and new unit/position access
function requireSupportRole(req, res, next) {
  if (!canAccessSupportTickets(req.authUser)) {
    return res.status(403).json({ error: 'Access denied. Requires support role.' });
  }
  next();
}

router.use(authenticateToken);

router.use(requireSupportRole);
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
router.get('/team-members', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, first_name, last_name, username, email, role, unit, position
      FROM users 
      WHERE (
        role ILIKE '%cx%' OR 
        role ILIKE '%noc%' OR 
        role ILIKE '%ip%' OR 
        role ILIKE '%field_engineer%' OR 
        role ILIKE '%approver%' OR 
        role ILIKE '%director%' OR
        role ILIKE '%relationship_officer%' OR
        role ILIKE '%noc_manager%' OR
        role ILIKE '%noc_supervisor%' OR
        role ILIKE '%ts_manager%' OR
        role ILIKE '%ip_manager%' OR
        role ILIKE '%cto%' OR
        unit IN ('cx', 'noc', 'ip', 'tx') OR
        LOWER(COALESCE(position, '')) IN ('customer support', 'relationship officer', 'engineer') OR
        LOWER(COALESCE(position, '')) LIKE '%manager%' OR
        LOWER(COALESCE(position, '')) LIKE '%supervisor%'
      )
      AND deleted_at IS NULL
      ORDER BY first_name, last_name
    `);

    const teamMembers = result.rows.map(user => ({
      id: user.id,
      fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
      username: user.username,
      email: user.email,
      unit: user.unit,
      position: user.position,
      role: user.role.includes(',') ? user.role.split(',')[0].trim() : user.role.trim()
    }));

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

router.get('/tickets/:id', async (req, res) => {
  try {
    const id = normalizeTicketRef(req.params.id);
    if (!id || id === 'report') {
      return res.status(400).json({
        error: 'Use GET /api/reports/tickets for the ticket report (this path is a ticket ID).',
      });
    }
    const ticket = await getTicketByIdForStaff(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (!canViewTicket(req.authUser, ticket)) {
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

    const timeline = await getTicketTimeline(id);
    const tags = await getTagsForTicket(id);
    res.json({ success: true, data: { ticket: { ...ticket, tags }, timeline } });
  } catch (err) {
    console.error('GET /tickets/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch ticket details' });
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
        const currentAssignee = ticketCheck.rows[0].assigned_to;
        const userRole = req.authUser.role?.toLowerCase() || '';
        const userRoles = Array.isArray(req.authUser.roles) ? req.authUser.roles : (req.authUser.roles ? JSON.parse(req.authUser.roles) : []);
        const isCX = userRole.includes('cx') || userRole === 'cx' || userRoles.some((r) => r.toLowerCase() === 'cx');
        const isSuperAdmin = userRole.includes('superadmin') || userRoles.some((r) => r.toLowerCase() === 'superadmin');
        const isAssignedUser = currentAssignee === req.authUser.id;
        
        // Only allow if user is CX, SuperAdmin or is the currently assigned user
        if (!isCX && !isAssignedUser && !isSuperAdmin) {
          const action = isEscalation ? 'escalate' : 'assign';
          return res.status(403).json({ 
            error: `Only the assigned person, CX members, or an administrator can ${action} this ticket.`,
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

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Ticket update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update ticket' });
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

router.patch('/tickets/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { assigned_to } = req.body;

  if (!assigned_to || isNaN(assigned_to)) {
    return res.status(400).json({ error: 'assigned_to (user ID) is required' });
  }

  try {
    const userRes = await pool.query(
      `SELECT id, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
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
    const sites = await listAllSites({
      client_id: req.query.client_id || req.query.customer_id,
      unassigned: req.query.unassigned,
      connection_status: req.query.connection_status,
      region: req.query.region,
      search: req.query.search,
    });
    res.json({ success: true, data: sites });
  } catch (err) {
    console.error('GET /sites error:', err);
    res.status(500).json({ error: 'Failed to fetch sites' });
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