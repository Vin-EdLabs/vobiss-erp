/**
 * Premium thread-opening summaries for record-linked chat channels.
 */
import pool from '../db.js';
import { getRequestDetails } from '../db.js';

function truncate(text, max = 140) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function titleCase(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoney(amount) {
  const n = parseFloat(amount);
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n);
}

function field(label, value, highlight = false) {
  const v = value == null || value === '' ? '—' : String(value);
  return { label, value: v, highlight };
}

function buildCard({ variant, headline, tagline, fields, note, status, priority }) {
  return {
    variant,
    headline,
    tagline,
    fields: fields.filter((f) => f && f.value !== '—'),
    note: note || null,
    status: status || null,
    priority: priority || null,
  };
}

async function fetchTicketSummary(ticketId) {
  const { rows } = await pool.query(
    `SELECT t.ticket_id, t.title, t.category, t.priority, t.status, t.description, t.source,
            t.escalation_stage, t.assigned_to,
            c.customer_name, p.project_name,
            u.first_name || ' ' || u.last_name AS assignee_name,
            CASE WHEN t.created_by_type = 'staff' THEN uc.first_name || ' ' || uc.last_name
                 ELSE c.customer_name END AS creator_label,
            t.created_by_type
     FROM tickets t
     JOIN customers c ON t.customer_id = c.id
     JOIN projects p ON t.project_id = p.id
     LEFT JOIN users u ON t.assigned_to = u.id
     LEFT JOIN users uc ON t.created_by_id = uc.id AND t.created_by_type = 'staff'
     WHERE TRIM(t.ticket_id) = $1 OR t.id::text = $1
     LIMIT 1`,
    [String(ticketId).trim()]
  );
  return rows[0] || null;
}

async function fetchProjectSummary(projectRequestId) {
  const { rows } = await pool.query(
    `SELECT id, site_name, customer_name, location, region, status, current_stage,
            service_type, capacity, project_unit_name, created_by_name, initial_remarks
     FROM project_requests WHERE id = $1`,
    [parseInt(projectRequestId, 10)]
  );
  return rows[0] || null;
}

export async function buildTicketThreadSummary(ticketId, { actorName, routed = false } = {}) {
  const t = await fetchTicketSummary(ticketId);
  if (!t) {
    return {
      fallbackBody: `Ticket #${ticketId} — conversation started.`,
      card: buildCard({
        variant: 'ticket',
        headline: `Ticket #${ticketId}`,
        tagline: 'Support thread',
        fields: [field('Opened by', actorName || 'System')],
      }),
    };
  }

  const assignee = t.assignee_name?.trim() || (routed ? 'Unassigned — awaiting owner' : 'Unassigned');
  const stage = t.escalation_stage ? titleCase(t.escalation_stage) : 'NOC';

  const card = buildCard({
    variant: 'ticket',
    headline: `Ticket #${t.ticket_id}`,
    tagline: routed
      ? 'Support thread · routed to queue'
      : `Support thread · ${titleCase(t.source || 'portal')}`,
    status: titleCase(t.status),
    priority: titleCase(t.priority),
    fields: [
      field('Subject', t.title, true),
      field('Customer', t.customer_name),
      field('Project', t.project_name),
      field('Category', titleCase(t.category)),
      field('Queue', stage),
      field('Owner', assignee, !t.assignee_name),
      field('Submitted by', t.creator_label || actorName),
    ],
    note: truncate(t.description, 160),
  });

  const fallbackBody = routed
    ? `${card.headline} — ${t.title} is in the ${stage} queue (unassigned).`
    : `${card.headline} — ${truncate(t.title, 60)}`;

  return { fallbackBody, card };
}

export async function buildRequestThreadSummary(requestId, requestType, { actorName } = {}) {
  let details;
  try {
    details = await getRequestDetails(requestId);
  } catch {
    details = null;
  }

  const type = requestType || details?.type || 'material_request';
  const variant =
    type === 'cash_request' ? 'cash_request' : type === 'item_return' ? 'item_return' : 'material_request';

  const label =
    type === 'cash_request'
      ? `Cash Request #${requestId}`
      : type === 'item_return'
        ? `Item Return #${requestId}`
        : `Material Request #${requestId}`;

  if (!details) {
    return {
      fallbackBody: `${label} submitted.`,
      card: buildCard({
        variant,
        headline: label,
        tagline: 'Operations thread',
        fields: [field('Submitted by', actorName || 'Staff')],
      }),
    };
  }

  const requester = details.created_by || actorName || 'Staff';
  const fields = [
    field('Submitted by', requester),
    field('Status', titleCase(details.status)),
    field('Project', details.project_name || details.purpose),
  ];

  let note = null;
  if (type === 'cash_request') {
    const amount = formatMoney(details.total_amount);
    if (amount) fields.unshift(field('Amount', amount, true));
    if (details.reason) fields.push(field('Purpose', truncate(details.reason, 80)));
    if (details.expenses?.length) {
      const lines = details.expenses
        .slice(0, 3)
        .map((e) => truncate(e.description || 'Line item', 40))
        .join(' · ');
      note = details.expenses.length > 3 ? `${lines} (+${details.expenses.length - 3} more)` : lines;
    }
  } else {
    if (details.items?.length) {
      const itemLine = details.items
        .slice(0, 4)
        .map((i) => `${i.quantity_requested || i.qty || 1}× ${i.item_name || i.name}`)
        .join(', ');
      fields.unshift(field('Items', itemLine, true));
      if (details.items.length > 4) {
        note = `+${details.items.length - 4} more line item(s)`;
      }
    }
    if (details.purpose && type === 'material_request') {
      fields.push(field('Purpose', truncate(details.purpose, 80)));
    }
    if (details.reason && type === 'item_return') {
      fields.push(field('Reason', truncate(details.reason, 80)));
    }
  }

  if (details.ticket_display_id) {
    fields.push(field('Linked ticket', details.ticket_display_id));
  }

  const card = buildCard({
    variant,
    headline: label,
    tagline:
      type === 'cash_request'
        ? 'Finance & approvals thread'
        : type === 'item_return'
          ? 'Returns & warehouse thread'
          : 'Inventory & approvals thread',
    status: titleCase(details.status),
    fields,
    note: note || truncate(details.notes || details.remarks, 120),
  });

  return {
    fallbackBody: `${label} — ${requester}`,
    card,
  };
}

export async function buildProjectThreadSummary(projectRequestId, { actorName } = {}) {
  const p = await fetchProjectSummary(projectRequestId);
  const label = `Service Request #${projectRequestId}`;

  if (!p) {
    return {
      fallbackBody: `${label} submitted.`,
      card: buildCard({
        variant: 'project_request',
        headline: label,
        tagline: 'Service request thread',
        fields: [field('Submitted by', actorName || 'Staff')],
      }),
    };
  }

  const site = p.site_name || 'Site';
  const card = buildCard({
    variant: 'project_request',
    headline: `${label} — ${truncate(site, 48)}`,
    tagline: 'Service Request Comment / Remarks thread',
    status: titleCase(p.status),
    fields: [
      field('Customer', p.customer_name),
      field('Site', p.site_name, true),
      field('Location', [p.location, p.region].filter(Boolean).join(', ') || null),
      field('Comment / Remarks stage', titleCase(p.current_stage)),
      field('Unit', p.project_unit_name),
      field('Service', p.service_type),
      field('Capacity', p.capacity),
      field('Submitted by', p.created_by_name || actorName),
    ],
    note: truncate(p.initial_remarks, 160),
  });

  return {
    fallbackBody: `${label} — ${site}`,
    card,
  };
}

export async function buildRecordThreadSummary(recordType, recordId, options = {}) {
  if (recordType === 'ticket') {
    return buildTicketThreadSummary(recordId, options);
  }
  if (recordType === 'project_request') {
    return buildProjectThreadSummary(recordId, options);
  }
  if (['material_request', 'cash_request', 'item_return'].includes(recordType)) {
    return buildRequestThreadSummary(recordId, recordType, options);
  }
  return {
    fallbackBody: 'Conversation thread opened.',
    card: buildCard({
      variant: 'ticket',
      headline: 'Record thread',
      tagline: 'Operations',
      fields: [field('Reference', String(recordId))],
    }),
  };
}
