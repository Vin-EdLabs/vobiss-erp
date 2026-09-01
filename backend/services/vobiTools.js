/**
 * Controlled Vobi tools — role-gated ERP lookups (no raw SQL from the model).
 */
import pool from '../db.js';
import { getRoleAccess, canSeePayroll, ticketRecordLink, MODULE_LINKS } from './vobiRoles.js';
import { SchemaType } from '@google/generative-ai';
import { tierOfUser, unitsOfUser, listMyReports, listQueueForUser, listHrAccessible } from '../db/performanceReports.js';
import { getStaffAssessment } from './staffAssessment.js';

/** Adapts Vobi's toolCtx shape into the user-like object Performance Reports' own
 *  tierOfUser/unitsOfUser/listQueueForUser expect — reuses that module's real routing/visibility
 *  logic instead of re-deriving it here, so Vobi never drifts out of sync with it. */
function userLikeFrom(userCtx, userId) {
  const units = Array.isArray(userCtx.units) ? userCtx.units : [];
  return {
    id: userId,
    main_role: userCtx.role,
    role: userCtx.role,
    position: userCtx.position,
    unit: units[0] || null,
    units,
  };
}

/** {} (omit dateFrom/dateTo) means "this month" — getStaffAssessment's own default. */
function periodRangeFor(period) {
  const now = new Date();
  if (period === 'this_week') {
    const day = now.getDay();
    const from = new Date(now);
    from.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    from.setHours(0, 0, 0, 0);
    return { dateFrom: from.toISOString(), dateTo: now.toISOString() };
  }
  if (period === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() };
  }
  return {};
}

const OPEN_TICKET = `status NOT IN ('RESOLVED', 'CLOSED')`;

function modulesFor(role, position, userCtx = {}) {
  const access = getRoleAccess(role, position, {
    units: userCtx.units,
    unit: userCtx.unit,
    username: userCtx.username,
    full_name: userCtx.full_name,
    first_name: userCtx.first_name,
    last_name: userCtx.last_name,
    role: userCtx.role || role,
    main_role: userCtx.main_role || role,
    isSystemAdmin: userCtx.is_system_admin,
  });
  return { access, set: new Set(access.modules || []), seesAll: Boolean(access.sees_everything) };
}

function allow(mod, ctx) {
  if (ctx.seesAll) return true;
  return ctx.set.has(mod);
}

/** null = all queues; otherwise only these escalation/queue values */
function allowedTicketQueues(ctx) {
  if (ctx.seesAll || allow('tickets', ctx)) return null;
  const queues = [];
  if (allow('tickets_cx', ctx)) queues.push('cx');
  if (allow('tickets_noc', ctx)) queues.push('noc');
  if (allow('tickets_ip', ctx)) queues.push('ip');
  if (allow('tickets_tx', ctx)) queues.push('tx', 'ts');
  return queues;
}

function ticketQueueAllowed(ticket, queues) {
  if (!queues) return true;
  const stage = String(ticket?.escalation_stage || ticket?.queue || '').toLowerCase();
  return queues.includes(stage);
}

function deny(reason) {
  return { ok: false, error: reason };
}

async function safeQuery(sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (e) {
    console.warn('[vobi-tools] query:', e.message);
    return [];
  }
}

export const VOBI_TOOL_DECLARATIONS = [
  {
    name: 'search_clients',
    description: 'Search Vobiss clients (customers) by company name, code, email, or contact person.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Search text' },
        limit: { type: SchemaType.NUMBER, description: 'Max results (default 8)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_client',
    description: 'Get one client by id or customer_code, including linked sites summary.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        client_id: { type: SchemaType.NUMBER },
        customer_code: { type: SchemaType.STRING },
      },
    },
  },
  {
    name: 'search_sites',
    description: 'Search client sites by name, SITE code, region, or client name.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        client_id: { type: SchemaType.NUMBER },
        limit: { type: SchemaType.NUMBER },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_ticket',
    description: 'Full ticket lookup by TCK id — status, site, client, assignee, stage.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        ticket_id: { type: SchemaType.STRING, description: 'e.g. TCK-00042' },
      },
      required: ['ticket_id'],
    },
  },
  {
    name: 'search_tickets',
    description: 'Search open or recent tickets by title, client name, site, or status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_inventory',
    description: 'Search inventory items by name; includes quantity and low-stock flag.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        low_stock_only: { type: SchemaType.BOOLEAN },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_employees',
    description: 'Search employees / staff by name or department (HR-visible fields only).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_cash_requests',
    description: 'List pending or recent cash requests (finance). Optional requester name filter.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        pending_only: { type: SchemaType.BOOLEAN },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_assets',
    description: 'Search company assets by name or tag.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_projects_requests',
    description: 'Search production / project service requests by customer or site name.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'get_audit_logs',
    description:
      'Search audit logs with FULL details (who, action, item names, old/new quantities, reasons). Use for questions like who updated inventory, what changed, what was it before.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        action: {
          type: SchemaType.STRING,
          description: 'Filter e.g. update_item, create_item, issue_item, login, approve_request',
        },
        query: {
          type: SchemaType.STRING,
          description: 'Search in details JSON / item names / usernames',
        },
        user_name: { type: SchemaType.STRING, description: 'Filter by actor name' },
        hours: { type: SchemaType.NUMBER, description: 'Look back N hours (default 48)' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_system_docs',
    description:
      'Search official Vobiss documentation (README, ticketing, payroll, assets). Use for how-the-system-works questions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Topic e.g. ticket escalation, payroll PAYE, client portal' },
        doc_id: { type: SchemaType.STRING, description: 'Optional specific doc id: readme, ticketing, payroll, assets' },
      },
    },
  },
  {
    name: 'get_my_work_snapshot',
    description: 'Quick snapshot of the current user pending tickets, approvals, and chat mentions.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: 'get_my_performance_reports',
    description: 'The current user\'s own Performance & Reports submissions — status, stage, scores.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'get_performance_review_queue',
    description: 'Performance reports currently awaiting the current user\'s review (their tier + unit), or HR-accessible reports if the user is HR/exec.',
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: 'search_transport_requests',
    description: 'Search transport, fuel, or rental-vehicle requests by status. Regular staff see only their own; approvers/finance/admins/directors see everyone\'s.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        kind: { type: SchemaType.STRING, description: '"transport", "fuel", "vehicle", or omit for all three' },
        status: { type: SchemaType.STRING, description: 'e.g. pending, approved, rejected' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'get_assessment_score',
    description: 'Workflow-performance assessment (compliance/speed/volume score + attendance %) for the current user, or for a named staff member if the caller is a manager/director/HR.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        staff_name: { type: SchemaType.STRING, description: 'Look up someone else\'s assessment by name (managers/HR/directors only)' },
        period: { type: SchemaType.STRING, description: '"this_week", "this_month", or "last_month" (default this_month)' },
      },
    },
  },
  {
    name: 'search_network_assets',
    description: 'Search Network Assets — PoP register or Equipment inventory.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        kind: { type: SchemaType.STRING, description: '"pop" or "equipment"' },
        query: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_noc_shift_schedule',
    description: 'NOC shift schedule (who is on which shift) for today or this week.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        range: { type: SchemaType.STRING, description: '"today" or "week" (default today)' },
      },
    },
  },
  {
    name: 'search_incident_notes',
    description: 'Search NOC incident notes by site, client, or status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING, description: 'Open, Resolved, Monitoring, or Escalated' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_ip_circuits',
    description: 'Search IP Unit circuit inventory by circuit id, client, or status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING, description: 'active, available, inactive, or decommissioned' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_wip_entries',
    description: 'Search Project/Production WIP (work-in-progress) entries by customer, site, or status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_signoff_forms',
    description: 'Search Sign-Off Forms by reference number, site, client, or status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING },
        status: { type: SchemaType.STRING, description: 'draft, pending, approved, or rejected' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
  {
    name: 'search_archive',
    description: 'Search the Archive — folders and files the current user has access to (global, their unit, or their own private uploads).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: 'Folder or file name to search for' },
        limit: { type: SchemaType.NUMBER },
      },
    },
  },
];

export async function executeVobiTool(name, args = {}, userCtx = {}) {
  const role = userCtx.role || 'user';
  const position = userCtx.position || null;
  const userId = Number(userCtx.userId) || 0;
  const ctx = modulesFor(role, position, userCtx);
  const q = String(args.query || '').trim();
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 25);

  try {
    switch (name) {
      case 'search_clients': {
        if (!allow('tickets', ctx) && !allow('tickets_cx', ctx) && !allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('Clients are not in your role access.');
        }
        if (!q) return deny('query is required');
        const rows = await safeQuery(
          `SELECT c.id, c.customer_name AS company_name, c.customer_code, c.contact_person,
                  c.contact_email, c.contact_phone, c.status, c.location,
                  (SELECT COUNT(*)::int FROM customer_sites s WHERE s.customer_id = c.id) AS site_count
             FROM customers c
            WHERE c.deleted_at IS NULL
              AND (
                c.customer_name ILIKE $1 OR c.customer_code ILIKE $1
                OR COALESCE(c.contact_person,'') ILIKE $1
                OR COALESCE(c.contact_email,'') ILIKE $1
              )
            ORDER BY c.customer_name ASC
            LIMIT $2`,
          [`%${q}%`, limit]
        );
        return {
          ok: true,
          clients: rows.map((r) => ({ ...r, link: `/staff/cx/clients/${r.id}` })),
          links: { clients: '/staff/cx/clients' },
        };
      }

      case 'get_client': {
        if (!allow('tickets', ctx) && !allow('tickets_cx', ctx) && !allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('Clients are not in your role access.');
        }
        const id = Number(args.client_id);
        const code = String(args.customer_code || '').trim();
        const rows = await safeQuery(
          `SELECT c.id, c.customer_name AS company_name, c.customer_code, c.contact_person,
                  c.contact_email, c.contact_phone, c.status, c.location, c.created_at
             FROM customers c
            WHERE c.deleted_at IS NULL
              AND ($1::int IS NOT NULL AND c.id = $1 OR ($2 <> '' AND c.customer_code ILIKE $2))
            LIMIT 1`,
          [Number.isFinite(id) && id > 0 ? id : null, code]
        );
        if (!rows[0]) return { ok: false, error: 'Client not found' };
        const client = rows[0];
        const sites = await safeQuery(
          `SELECT id, site_code, site_name, region, connection_status, bandwidth, service_type
             FROM customer_sites WHERE customer_id = $1 ORDER BY site_name ASC LIMIT 30`,
          [client.id]
        );
        return {
          ok: true,
          client: { ...client, link: `/staff/cx/clients/${client.id}` },
          sites: sites.map((s) => ({ ...s, link: '/staff/cx/sites' })),
        };
      }

      case 'search_sites': {
        if (!allow('tickets', ctx) && !allow('tickets_cx', ctx) && !allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('Sites are not in your role access.');
        }
        const clientId = args.client_id ? Number(args.client_id) : null;
        const rows = await safeQuery(
          `SELECT s.id, s.site_code, s.site_name, s.region, s.connection_status,
                  s.bandwidth, s.service_type, s.customer_id,
                  c.customer_name AS client_name, c.customer_code
             FROM customer_sites s
             LEFT JOIN customers c ON c.id = s.customer_id
            WHERE ($1::int IS NULL OR s.customer_id = $1)
              AND (
                s.site_name ILIKE $2 OR s.site_code ILIKE $2
                OR COALESCE(s.region,'') ILIKE $2
                OR COALESCE(c.customer_name,'') ILIKE $2
              )
            ORDER BY s.site_name ASC
            LIMIT $3`,
          [clientId, `%${q || ''}%`, limit]
        );
        return { ok: true, sites: rows.map((r) => ({ ...r, link: '/staff/cx/sites' })) };
      }

      case 'get_ticket': {
        if (
          !ctx.seesAll &&
          !['tickets', 'tickets_cx', 'tickets_noc', 'tickets_ip', 'tickets_tx'].some((m) => allow(m, ctx))
        ) {
          return deny('Tickets are not in your role access.');
        }
        let ticketId = String(args.ticket_id || '').trim().toUpperCase();
        if (ticketId && !ticketId.startsWith('TCK') && /^\d+$/.test(ticketId)) ticketId = `TCK-${ticketId}`;
        if (ticketId.startsWith('TCK') && !ticketId.includes('-')) ticketId = ticketId.replace(/^TCK/, 'TCK-');
        try {
          const { searchTicketWithFullDetails } = await import('../db.ticketing.cjs');
          const details = await searchTicketWithFullDetails(ticketId);
          if (!details) return { ok: false, error: `Ticket ${ticketId} not found` };
          const ticket = details.ticket || details.report?.ticket;
          const queues = allowedTicketQueues(ctx);
          if (!ticketQueueAllowed(ticket, queues)) {
            return deny('That ticket is outside your assigned unit queue.');
          }
          return {
            ok: true,
            ticket,
            report: details.report || { narrative: details.reportNarrative },
            link: ticketRecordLink(ticket?.escalation_stage || ticket?.queue, ticketId),
          };
        } catch (e) {
          return deny(e.message || 'Ticket lookup failed');
        }
      }

      case 'search_tickets': {
        if (
          !ctx.seesAll &&
          !['tickets', 'tickets_cx', 'tickets_noc', 'tickets_ip', 'tickets_tx'].some((m) => allow(m, ctx))
        ) {
          return deny('Tickets are not in your role access.');
        }
        const status = String(args.status || '').trim().toUpperCase();
        const queues = allowedTicketQueues(ctx);
        const rows = await safeQuery(
          `SELECT t.ticket_id, t.title, t.status, t.priority, t.escalation_stage,
                  t.created_at, c.customer_name, s.site_name, s.site_code
             FROM tickets t
             LEFT JOIN customers c ON c.id = t.customer_id
             LEFT JOIN customer_sites s ON s.id = t.site_id
            WHERE ($1 = '' OR t.status = $1 OR ($1 = 'OPEN' AND t.${OPEN_TICKET}))
              AND (
                $2::text[] IS NULL
                OR lower(COALESCE(t.escalation_stage, '')) = ANY($2)
              )
              AND (
                $3 = '' OR t.title ILIKE $4 OR t.ticket_id ILIKE $4
                OR COALESCE(c.customer_name,'') ILIKE $4
                OR COALESCE(s.site_name,'') ILIKE $4
              )
            ORDER BY t.created_at DESC
            LIMIT $5`,
          [status, queues, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          tickets: rows.map((r) => ({
            ...r,
            link: ticketRecordLink(r.escalation_stage, r.ticket_id),
          })),
        };
      }

      case 'search_inventory': {
        if (!allow('inventory', ctx) && !ctx.seesAll) return deny('Inventory is not in your role access.');
        const lowOnly = Boolean(args.low_stock_only);
        const rows = await safeQuery(
          `SELECT i.id, i.name, i.quantity, COALESCE(i.low_stock_threshold, 5) AS reorder_level,
                  c.name AS category,
                  (i.quantity <= COALESCE(i.low_stock_threshold, 5)) AS low_stock
             FROM items i
             LEFT JOIN categories c ON c.id = i.category_id
            WHERE i.deleted_at IS NULL
              AND ($1 = '' OR i.name ILIKE $2 OR COALESCE(c.name,'') ILIKE $2)
              AND ($3::boolean = false OR i.quantity <= COALESCE(i.low_stock_threshold, 5))
            ORDER BY i.quantity ASC, i.name ASC
            LIMIT $4`,
          [q, `%${q}%`, lowOnly, limit]
        );
        return {
          ok: true,
          items: rows.map((r) => ({
            ...r,
            link: r.low_stock ? MODULE_LINKS.inventory.low_stock : MODULE_LINKS.inventory.items,
          })),
        };
      }

      case 'search_employees': {
        if (!allow('hr', ctx) && !ctx.seesAll && !ctx.access.hr_full_access) {
          return deny('Employee directory is not in your role access.');
        }
        if (!q) return deny('query is required');
        const rows = await safeQuery(
          `SELECT e.id,
                  TRIM(COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) AS name,
                  e.department, e.position, e.status, e.work_email
             FROM hr_employees e
            WHERE e.deleted_at IS NULL
              AND (
                e.first_name ILIKE $1 OR e.last_name ILIKE $1
                OR (COALESCE(e.first_name,'') || ' ' || COALESCE(e.last_name,'')) ILIKE $1
                OR COALESCE(e.department,'') ILIKE $1
              )
            ORDER BY e.first_name, e.last_name
            LIMIT $2`,
          [`%${q}%`, limit]
        );
        const payload = { ok: true, employees: rows.map((r) => ({ ...r, link: MODULE_LINKS.hr.employees })) };
        if (!canSeePayroll(ctx.access)) {
          /* already no salary fields */
        }
        return payload;
      }

      case 'get_cash_requests': {
        if (!allow('finance', ctx) && !allow('cash_requests', ctx) && !ctx.seesAll) {
          return deny('Finance data is not in your role access.');
        }
        const pendingOnly = args.pending_only !== false;
        const rows = await safeQuery(
          `SELECT r.id,
                  COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), r.created_by, 'Unknown') AS requested_by,
                  r.total_amount AS amount, r.purpose, r.status, r.created_at, r.department
             FROM requests r
             LEFT JOIN users u ON r.created_by_id = u.id
            WHERE r.deleted_at IS NULL AND r.type = 'cash_request'
              AND ($1::boolean = false OR r.status IN ('pending', 'supervisor_approved'))
              AND ($2 = '' OR r.purpose ILIKE $3 OR COALESCE(u.first_name,'') ILIKE $3 OR COALESCE(u.last_name,'') ILIKE $3)
            ORDER BY r.created_at DESC
            LIMIT $4`,
          [pendingOnly, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          currency: 'GHS',
          requests: rows.map((r) => ({
            ...r,
            amount_ghs: Number(r.amount) || 0,
            link: r.status === 'supervisor_approved'
              ? MODULE_LINKS.finance.finance_approvals
              : MODULE_LINKS.finance.cash_approvals,
          })),
        };
      }

      case 'search_assets': {
        if (!allow('assets', ctx) && !ctx.seesAll) return deny('Assets are not in your role access.');
        if (!q) return deny('query is required');
        const rows = await safeQuery(
          `SELECT a.id, a.name, a.tag, a.status, ac.name AS category, l.name AS location
             FROM assets a
             LEFT JOIN asset_categories ac ON ac.id = a.category_id
             LEFT JOIN asset_locations l ON l.id = a.location_id
            WHERE a.deleted_at IS NULL
              AND (a.name ILIKE $1 OR a.tag ILIKE $1 OR COALESCE(ac.name,'') ILIKE $1)
            ORDER BY a.name ASC
            LIMIT $2`,
          [`%${q}%`, limit]
        );
        return {
          ok: true,
          assets: rows.map((r) => ({ ...r, link: `/assets/${r.id}` })),
        };
      }

      case 'search_projects_requests': {
        if (!allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('Project requests are not in your role access.');
        }
        const rows = await safeQuery(
          `SELECT pr.id, pr.customer_name, pr.site_name, pr.status, pr.current_stage,
                  pr.project_unit_name, pr.created_at, pr.created_by_name
             FROM project_requests pr
            WHERE ($1 = '' OR pr.customer_name ILIKE $2 OR pr.site_name ILIKE $2 OR pr.status ILIKE $2)
            ORDER BY pr.created_at DESC
            LIMIT $3`,
          [q, `%${q}%`, limit]
        );
        return {
          ok: true,
          requests: rows.map((r) => ({
            ...r,
            link: `/project-request/${String(r.current_stage || 'project').toLowerCase() === 'tx' ? 'ts' : String(r.current_stage || 'project').toLowerCase()}/${r.id}`,
          })),
        };
      }

      case 'get_audit_logs': {
        const canAudit = allow('audit', ctx) || ctx.seesAll;
        const canInv = allow('inventory', ctx) || ctx.seesAll;
        if (!canAudit && !canInv) return deny('Audit history is not in your role access.');

        const hours = Math.min(Math.max(Number(args.hours) || 48, 1), 24 * 365);
        const actionFilter = String(args.action || '').trim().toLowerCase();
        const nameFilter = String(args.user_name || '').trim();
        const search = String(args.query || '').trim();

        // Inventory-only roles: restrict to inventory-related actions
        const inventoryActions = [
          'update_item',
          'create_item',
          'delete_item',
          'issue_item',
          'create_category',
          'update_category',
          'delete_category',
        ];

        const rows = await safeQuery(
          `SELECT al.id, al.action, al.timestamp, al.details,
                  TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, 'System')) AS user_name,
                  u.username
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
            WHERE al.timestamp >= NOW() - ($1::text || ' hours')::interval
              AND (
                $2 = ''
                OR LOWER(al.action) = $2
                OR LOWER(al.action) LIKE $2 || '%'
                OR ($2 IN ('delete', 'deleted', 'remove') AND (LOWER(al.action) LIKE '%delete%' OR LOWER(al.action) LIKE '%remove%'))
              )
              AND ($3 = '' OR COALESCE(u.first_name,'') ILIKE $4 OR COALESCE(u.last_name,'') ILIKE $4 OR COALESCE(u.username,'') ILIKE $4
                   OR TRIM(BOTH FROM COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ILIKE $4)
              AND ($5 = '' OR al.details::text ILIKE $6 OR al.action ILIKE $6
                   OR COALESCE(u.first_name,'') ILIKE $6 OR COALESCE(u.last_name,'') ILIKE $6)
            ORDER BY al.timestamp DESC
            LIMIT $7`,
          [
            String(hours),
            actionFilter,
            nameFilter,
            `%${nameFilter}%`,
            search,
            `%${search}%`,
            limit,
          ]
        );

        let filtered = rows;
        if (!canAudit && canInv) {
          filtered = rows.filter((r) => inventoryActions.includes(String(r.action || '').toLowerCase()));
        }

        return {
          ok: true,
          lookback_hours: hours,
          count: filtered.length,
          logs: filtered.map((r) => {
            const d = r.details && typeof r.details === 'object' ? r.details : {};
            return {
              id: r.id,
              action: r.action,
              timestamp: r.timestamp,
              user_name: r.user_name,
              username: r.username,
              details: d,
              item_name: d.item_name || d.new_name || null,
              old_quantity: d.old_quantity,
              new_quantity: d.new_quantity,
              reason: d.reason || null,
              link: MODULE_LINKS.audit,
            };
          }),
          tip: 'For update_item, details.old_quantity / new_quantity / item_name / reason answer "what item" and "what was it before".',
        };
      }

      case 'search_system_docs': {
        const { searchVobiDocs, getVobiDocById, listVobiDocs } = await import('./vobiDocs.js');
        if (args.doc_id) return getVobiDocById(args.doc_id);
        if (!q && !args.query) {
          return { ok: true, available_docs: listVobiDocs(), hint: 'Provide a query or doc_id.' };
        }
        return searchVobiDocs(args.query || q, Math.min(limit, 5));
      }

      case 'get_my_work_snapshot': {
        const [tickets, approvals, mentions] = await Promise.all([
          safeQuery(
            `SELECT ticket_id, title, status, priority, created_at
               FROM tickets
              WHERE assigned_to = $1 AND ${OPEN_TICKET}
              ORDER BY created_at DESC LIMIT 10`,
            [userId]
          ),
          safeQuery(
            `SELECT id, type, status, purpose, reason, total_amount, created_at
               FROM requests
              WHERE deleted_at IS NULL AND status IN ('pending', 'supervisor_approved')
                AND (created_by_id = $1 OR $1 IN (
                  SELECT id FROM users WHERE main_role IN ('finance','approver','director','superadmin','admin') AND id = $1
                ))
              ORDER BY created_at DESC LIMIT 10`,
            [userId]
          ),
          safeQuery(
            `SELECT m.body, m.created_at, c.name AS channel_name
               FROM chat_messages m
               JOIN chat_channels c ON c.id = m.channel_id
               JOIN message_mentions mm ON mm.message_id = m.id AND mm.user_id = $1
              WHERE m.created_at > NOW() - INTERVAL '7 days'
              ORDER BY m.created_at DESC LIMIT 8`,
            [userId]
          ).catch(() => []),
        ]);
        return {
          ok: true,
          my_tickets: tickets,
          pending_requests: approvals,
          recent_mentions: mentions,
          links: { workspace: MODULE_LINKS.workspace.my, chat: MODULE_LINKS.chat.general },
        };
      }

      case 'get_my_performance_reports': {
        const reports = await listMyReports(userId).catch(() => []);
        return {
          ok: true,
          reports: reports.map((r) => ({
            id: r.id, title: r.title, status: r.status, current_stage: r.current_stage,
            final_score: r.final_score, submitted_at: r.submitted_at,
            link: `/performance-reports/report/${r.id}`,
          })),
          links: { my_reports: MODULE_LINKS.performance_reports.my_reports },
        };
      }

      case 'get_performance_review_queue': {
        const userLike = userLikeFrom(userCtx, userId);
        const isHrOrExec = ctx.seesAll || ctx.access.hr_full_access;
        if (isHrOrExec) {
          const hrRows = await listHrAccessible().catch(() => []);
          return {
            ok: true,
            scope: 'hr_or_executive',
            reports: hrRows.map((r) => ({
              id: r.id, employee_name: r.employee_name, unit: r.unit, title: r.title,
              status: r.status, current_stage: r.current_stage, final_score: r.final_score,
              link: `/performance-reports/report/${r.id}`,
            })),
            links: { hr_access: MODULE_LINKS.performance_reports.hr_access },
          };
        }
        const tier = tierOfUser(userLike);
        if (tier === 'employee') {
          return { ok: true, scope: 'employee', reports: [], note: 'This user is not a reviewer for any performance reports — they only see their own submissions (use get_my_performance_reports).' };
        }
        const rows = await listQueueForUser(userLike).catch(() => []);
        return {
          ok: true,
          scope: tier,
          reports: rows.map((r) => ({
            id: r.id, employee_name: r.employee_name, unit: r.unit, title: r.title,
            status: r.status, current_stage: r.current_stage,
            link: `/performance-reports/report/${r.id}`,
          })),
          links: { team: MODULE_LINKS.performance_reports.team, unit_reviews: MODULE_LINKS.performance_reports.unit_reviews, executive: MODULE_LINKS.performance_reports.executive },
        };
      }

      case 'search_transport_requests': {
        const kind = String(args.kind || '').trim().toLowerCase();
        const status = String(args.status || '').trim().toLowerCase();
        const tLimit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
        // Approvers/finance/admin operators/directors see everyone's requests; regular staff see only their own.
        const canSeeAll = ctx.seesAll || allow('finance', ctx) || /manager|supervisor|approver|director|cto/i.test(String(userCtx.position || ''));
        const results = {};
        if (!kind || kind === 'transport') {
          results.transport = await safeQuery(
            `SELECT id, requester_name, site_name, client_name, status, created_at
               FROM transport_requests
              WHERE deleted_at IS NULL
                AND ($1::boolean OR requester_id = $2)
                AND ($3 = '' OR status = $3)
              ORDER BY created_at DESC LIMIT $4`,
            [canSeeAll, userId, status, tLimit]
          );
        }
        if (!kind || kind === 'fuel') {
          results.fuel = await safeQuery(
            `SELECT id, ref_no, requester_name, vehicle_plate, estimated_amount, status, created_at
               FROM fuel_requests
              WHERE deleted_at IS NULL
                AND ($1::boolean OR requester_id = $2)
                AND ($3 = '' OR status = $3)
              ORDER BY created_at DESC LIMIT $4`,
            [canSeeAll, userId, status, tLimit]
          );
        }
        if (!kind || kind === 'vehicle') {
          results.vehicle_rental = await safeQuery(
            `SELECT id, requestor_name, department, purpose, status, created_at
               FROM vehicle_request_forms
              WHERE deleted_at IS NULL
                AND ($1::boolean OR requester_id = $2)
                AND ($3 = '' OR status = $3)
              ORDER BY created_at DESC LIMIT $4`,
            [canSeeAll, userId, status, tLimit]
          );
        }
        return {
          ok: true,
          scope: canSeeAll ? 'all_requests' : 'own_requests_only',
          currency: 'GHS',
          ...results,
          links: MODULE_LINKS.transport,
        };
      }

      case 'get_assessment_score': {
        const staffName = String(args.staff_name || '').trim();
        let targetId = userId;
        let targetLabel = 'you';
        if (staffName) {
          const canLookupOthers = ctx.seesAll || ctx.access.hr_full_access || /manager|supervisor|director|cto/i.test(String(userCtx.position || ''));
          if (!canLookupOthers) return deny('You can only ask about your own assessment score.');
          const match = await safeQuery(
            `SELECT id, first_name, last_name FROM users
              WHERE deleted_at IS NULL AND (first_name || ' ' || last_name) ILIKE $1
              ORDER BY first_name LIMIT 1`,
            [`%${staffName}%`]
          );
          if (!match[0]) return deny(`No staff member found matching "${staffName}".`);
          targetId = match[0].id;
          targetLabel = `${match[0].first_name} ${match[0].last_name}`;
        }
        const period = String(args.period || 'this_month');
        const range = periodRangeFor(period);
        const assessment = await getStaffAssessment(targetId, range).catch(() => null);
        if (!assessment) return deny('Could not load an assessment for that person.');
        return {
          ok: true,
          for: targetLabel,
          period: assessment.period,
          score: assessment.score,
          attendance: assessment.attendance,
          link: staffName ? `/staff-assessment/${targetId}` : MODULE_LINKS.my_assessment.mine,
        };
      }

      case 'search_network_assets': {
        if (!allow('network_assets', ctx) && !ctx.seesAll) return deny('Network assets are not in your role access.');
        const kind = String(args.kind || '').trim().toLowerCase();
        if (kind === 'equipment') {
          const rows = await safeQuery(
            `SELECT pe.id, pe.quantity, pe.serial_number, pe.status, ec.category, ec.model_name, p.location_name AS pop_name
               FROM pop_equipment pe
               LEFT JOIN equipment_catalogue ec ON ec.id = pe.equipment_catalogue_id
               LEFT JOIN pops p ON p.id = pe.pop_id
              WHERE pe.deleted_at IS NULL
                AND ($1 = '' OR ec.model_name ILIKE $2 OR ec.category ILIKE $2 OR p.location_name ILIKE $2 OR pe.serial_number ILIKE $2)
              ORDER BY pe.id DESC LIMIT $3`,
            [q, `%${q}%`, limit]
          );
          return { ok: true, kind: 'equipment', equipment: rows, links: MODULE_LINKS.network_assets };
        }
        const rows = await safeQuery(
          `SELECT p.id, p.location_name, p.status, p.pop_type, r.name AS region, t.name AS territory
             FROM pops p
             LEFT JOIN regions r ON r.id = p.region_id
             LEFT JOIN territories t ON t.id = p.territory_id
            WHERE p.deleted_at IS NULL
              AND ($1 = '' OR p.location_name ILIKE $2 OR r.name ILIKE $2)
            ORDER BY p.location_name ASC LIMIT $3`,
          [q, `%${q}%`, limit]
        );
        return { ok: true, kind: 'pop', pops: rows, links: MODULE_LINKS.network_assets };
      }

      case 'get_noc_shift_schedule': {
        if (!allow('noc_shifts', ctx) && !ctx.seesAll) return deny('NOC shift schedule is not in your role access.');
        const range = String(args.range || 'today').trim().toLowerCase();
        const today = new Date();
        const from = today.toISOString().slice(0, 10);
        let to = from;
        if (range === 'week') {
          const end = new Date(today);
          end.setDate(today.getDate() + 6);
          to = end.toISOString().slice(0, 10);
        }
        const rows = await safeQuery(
          `SELECT s.schedule_date, d.name AS shift_name, d.start_time, d.end_time,
                  COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username) AS staff_name,
                  a.is_shift_lead
             FROM noc_shift_schedules s
             JOIN noc_shift_definitions d ON d.id = s.shift_definition_id
             LEFT JOIN noc_shift_staff_assignments a ON a.schedule_id = s.id
             LEFT JOIN users u ON u.id = a.user_id
            WHERE s.schedule_date BETWEEN $1 AND $2 AND s.is_published = true
            ORDER BY s.schedule_date ASC, d.display_order ASC`,
          [from, to]
        );
        return { ok: true, range, from, to, shifts: rows, links: { schedule: MODULE_LINKS.noc_shifts.schedule } };
      }

      case 'search_incident_notes': {
        if (!allow('noc_shifts', ctx) && !allow('tickets_noc', ctx) && !ctx.seesAll) {
          return deny('Incident notes are not in your role access.');
        }
        const status = String(args.status || '').trim();
        const rows = await safeQuery(
          `SELECT id, site_name, description, note_date, status, priority, client_name
             FROM noc_incident_notes
            WHERE deleted_at IS NULL
              AND ($1 = '' OR status ILIKE $1)
              AND ($2 = '' OR site_name ILIKE $3 OR client_name ILIKE $3 OR description ILIKE $3)
            ORDER BY note_date DESC LIMIT $4`,
          [status, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          notes: rows.map((r) => ({ ...r, link: `/noc/incident-notes/${r.id}` })),
          links: { home: MODULE_LINKS.noc_shifts.incident_notes },
        };
      }

      case 'search_ip_circuits': {
        if (!allow('ip_unit', ctx) && !allow('tickets_ip', ctx) && !ctx.seesAll) {
          return deny('IP circuit inventory is not in your role access.');
        }
        const status = String(args.status || '').trim();
        const rows = await safeQuery(
          `SELECT c.id, c.circuit_id, c.status, c.capacity, c.service_type, c.pop_name, c.region, cu.customer_name
             FROM ip_circuits c
             LEFT JOIN customers cu ON cu.id = c.client_id
            WHERE c.deleted_at IS NULL
              AND ($1 = '' OR c.status = $1)
              AND ($2 = '' OR c.circuit_id ILIKE $3 OR cu.customer_name ILIKE $3 OR c.pop_name ILIKE $3)
            ORDER BY c.id DESC LIMIT $4`,
          [status, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          circuits: rows.map((r) => ({ ...r, link: `/ip-unit/circuits/${r.id}` })),
          links: MODULE_LINKS.ip_unit,
        };
      }

      case 'search_wip_entries': {
        if (!allow('production', ctx) && !allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('WIP entries are not in your role access.');
        }
        const status = String(args.status || '').trim();
        const rows = await safeQuery(
          `SELECT id, customer_name, site_name, region, service_type, status, created_at
             FROM project_wip_entries
            WHERE deleted_at IS NULL
              AND ($1 = '' OR status ILIKE $1)
              AND ($2 = '' OR customer_name ILIKE $3 OR site_name ILIKE $3)
            ORDER BY created_at DESC LIMIT $4`,
          [status, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          wip_entries: rows.map((r) => ({ ...r, link: MODULE_LINKS.production.wip })),
          links: MODULE_LINKS.production,
        };
      }

      case 'search_signoff_forms': {
        if (!allow('production', ctx) && !allow('service_requests', ctx) && !ctx.seesAll) {
          return deny('Sign-off forms are not in your role access.');
        }
        const status = String(args.status || '').trim();
        const rows = await safeQuery(
          `SELECT id, reference_no, site_name, status, client_name, created_at
             FROM project_signoff_forms
            WHERE ($1 = '' OR status = $1)
              AND ($2 = '' OR site_name ILIKE $3 OR client_name ILIKE $3 OR reference_no ILIKE $3)
            ORDER BY created_at DESC LIMIT $4`,
          [status, q, `%${q}%`, limit]
        );
        return {
          ok: true,
          signoff_forms: rows.map((r) => ({ ...r, link: `/project-unit/signoff/${r.id}` })),
          links: MODULE_LINKS.production,
        };
      }

      case 'search_archive': {
        const units = unitsOfUser(userLikeFrom(userCtx, userId));
        const folderRows = await safeQuery(
          `SELECT id, name, scope, unit_slug FROM archive_folders
            WHERE scope = 'global'
               OR (scope = 'unit' AND unit_slug = ANY($1::text[]))
               OR (scope = 'private' AND created_by = $2)
            ORDER BY name ASC`,
          [units, userId]
        );
        const folderIds = folderRows.map((f) => f.id);
        let fileRows = [];
        if (q && folderIds.length) {
          fileRows = await safeQuery(
            `SELECT id, folder_id, display_name, original_name, extension, size_bytes, created_at
               FROM archive_files
              WHERE folder_id = ANY($1::int[]) AND (display_name ILIKE $2 OR original_name ILIKE $2)
              ORDER BY created_at DESC LIMIT $3`,
            [folderIds, `%${q}%`, limit]
          );
        }
        return { ok: true, folders: folderRows, files: fileRows, links: MODULE_LINKS.archive };
      }

      default:
        return deny(`Unknown tool: ${name}`);
    }
  } catch (e) {
    console.error('[vobi-tools]', name, e.message);
    return deny(e.message || 'Tool failed');
  }
}
