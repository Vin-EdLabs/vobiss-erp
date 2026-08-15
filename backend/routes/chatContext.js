import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { getDisplayName } from '../services/chatHelpers.js';
import { syncRequestPendingApprovalMessages } from '../services/chatSystemMessage.js';
import { getRealtimeIo } from '../realtime/channels.js';

const router = express.Router();
router.use(authenticateToken);

function keyFields(entries) {
  return entries.filter(([, v]) => v != null && v !== '');
}

function staffCxTicketLink(ticketNumber) {
  const raw = ticketNumber != null ? String(ticketNumber).trim().replace(/^#/, '') : '';
  if (!raw || /^\d+$/.test(raw)) return '/staff/cx/tickets';
  if (/^TCK-\d+/i.test(raw)) return `/staff/cx/tickets/${encodeURIComponent(raw.toUpperCase())}`;
  if (raw.length >= 3) return `/staff/cx/tickets/${encodeURIComponent(raw)}`;
  return '/staff/cx/tickets';
}

// GET /api/chat/context/ticket/:ticketId
router.get('/ticket/:ticketId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id AS internal_id, t.ticket_id, t.status, t.title AS subject, t.priority, t.created_at, t.updated_at,
              t.assigned_to,
              cu.customer_name AS requester,
              au.first_name AS assignee_first, au.last_name AS assignee_last, au.username AS assignee_username,
              cr.first_name AS creator_first, cr.last_name AS creator_last, cr.username AS creator_username
       FROM tickets t
       LEFT JOIN customers cu ON cu.id = t.customer_id
       LEFT JOIN users au ON au.id = t.assigned_to
       LEFT JOIN users cr ON cr.id = t.created_by_id
       WHERE t.ticket_id = $1 OR t.id::text = $1
       LIMIT 1`,
      [req.params.ticketId]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Ticket not found' });

    const assignee = row.assigned_to
      ? getDisplayName({ first_name: row.assignee_first, last_name: row.assignee_last, username: row.assignee_username })
      : null;

    res.json({
      id: row.ticket_id || row.internal_id,
      record_type: 'ticket',
      status: row.status,
      title: row.subject,
      subject: row.subject,
      requester: row.requester || getDisplayName({ first_name: row.creator_first, last_name: row.creator_last, username: row.creator_username }),
      assignee,
      created_at: row.created_at,
      updated_at: row.updated_at,
      linkUrl: staffCxTicketLink(row.ticket_id),
      key_fields: keyFields([
        ['Priority', row.priority],
        ['Status', row.status],
      ]),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function requestContext(req, res, typeFilter) {
  const id = parseInt(req.params.id, 10);
  const { rows } = await pool.query(
    `SELECT r.id, r.type, r.status, r.purpose, r.reason, r.project_name, r.department,
            r.total_amount, r.created_at, r.updated_at, r.created_by,
            u.first_name, u.last_name, u.username
     FROM requests r
     LEFT JOIN users u ON u.id = r.created_by_id
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [id]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Request not found' });
  if (typeFilter && row.type !== typeFilter) return res.status(404).json({ error: 'Request not found' });

  const requester = row.created_by || getDisplayName({ first_name: row.first_name, last_name: row.last_name, username: row.username });
  const title = row.purpose || row.reason || row.project_name || `Request #${row.id}`;
  const linkUrl =
    row.type === 'cash_request'
      ? `/cash-details/${row.id}`
      : row.type === 'item_return'
        ? `/item-returns/${row.id}`
        : `/request-forms/${row.id}`;

  syncRequestPendingApprovalMessages({
    requestId: row.id,
    requestType: row.type,
    io: getRealtimeIo(),
  }).catch(() => {});

  res.json({
    id: row.id,
    record_type: row.type,
    status: row.status,
    title,
    subject: title,
    requester,
    assignee: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    linkUrl,
    key_fields: keyFields([
      ['Department', row.department],
      ['Project', row.project_name],
      ['Amount', row.total_amount != null ? `GHS ${row.total_amount}` : null],
    ]),
  });
}

router.get('/material-request/:id', (req, res) => requestContext(req, res, 'material_request'));
router.get('/cash-request/:id', (req, res) => requestContext(req, res, 'cash_request'));
router.get('/item-return/:id', (req, res) => requestContext(req, res, 'item_return'));

router.get('/project-request/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT id, status, current_stage, site_name, customer_name, location, region,
              created_at, updated_at, created_by_name
       FROM project_requests WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Project request not found' });

    res.json({
      id: row.id,
      record_type: 'project_request',
      status: row.status,
      title: row.site_name || row.customer_name,
      subject: row.site_name,
      requester: row.created_by_name,
      assignee: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      linkUrl: `/project-request/project/${row.id}`,
      key_fields: keyFields([
        ['Customer', row.customer_name],
        ['Location', row.location],
        ['Stage', row.current_stage],
      ]),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
