/**
 * Controlled Vobi tools — role-gated ERP lookups (no raw SQL from the model).
 */
import pool from '../db.js';
import { getRoleAccess, canSeePayroll, ticketRecordLink, MODULE_LINKS } from './vobiRoles.js';
import { SchemaType } from '@google/generative-ai';

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

      default:
        return deny(`Unknown tool: ${name}`);
    }
  } catch (e) {
    console.error('[vobi-tools]', name, e.message);
    return deny(e.message || 'Tool failed');
  }
}
