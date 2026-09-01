/**
 * Auto-thread channels linked to operational records (tickets, requests, projects).
 */
import pool from '../db.js';
import { slugifyUnit } from './chatInit.js';
import { defaultUnitsForRole, parseUserUnitsArray } from '../roles.js';

const MANAGER_ROLES = ['superadmin', 'director', 'cto', 'noc_manager', 'ts_manager', 'ip_manager', 'finance_manager'];
const FINANCE_ROLES = ['finance', 'finance_manager', 'superadmin'];
const WAREHOUSE_ROLES = ['stock_admin', 'issuer', 'superadmin'];
const ISSUER_ROLES = ['issuer', 'stock_admin', 'superadmin'];
const CX_ROLES = ['cx', 'noc', 'noc_manager', 'superadmin'];
const DIRECTOR_THREAD_ROLES = ['director', 'cto', 'superadmin'];
/** Executive + escalation roles — can view and post in all ticket threads */
const TICKET_OVERSIGHT_ROLES = [
  'director',
  'cto',
  'superadmin',
  'relationship_officer',
  'noc_manager',
  ...CX_ROLES,
];

function truncate(text, max = 30) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function usersByRoles(roleList) {
  const { rows } = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND (
         LOWER(COALESCE(main_role, role)) = ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(
             CASE WHEN roles::text LIKE '[%' THEN roles::jsonb ELSE '[]'::jsonb END
           ) r WHERE LOWER(r) = ANY($1::text[])
         )
       )`,
    [roleList.map((r) => r.toLowerCase())]
  );
  return rows.map((r) => r.id);
}

/** Users assigned to project pipeline units (project, ts, ip, noc + custom project unit slugs). */
async function usersByProjectPipelineUnits() {
  const baseSlugs = ['project', 'ts', 'ip', 'noc'];
  const { rows: unitRows } = await pool.query(
    `SELECT LOWER(slug) AS slug FROM project_units
     WHERE COALESCE(is_active, true) = true
       AND unit_stage IN ('project', 'ts', 'ip', 'noc')`
  );
  const slugs = [...new Set([...baseSlugs, ...unitRows.map((r) => r.slug)])];

  const byUnits = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(
           CASE WHEN units::text LIKE '[%' THEN units::jsonb ELSE '[]'::jsonb END
         ) u WHERE LOWER(TRIM(u)) = ANY($1::text[])
       )`,
    [slugs]
  );

  const byRole = await pool.query(
    `SELECT id, role, main_role, units FROM users WHERE deleted_at IS NULL`
  );
  const roleMatched = byRole.rows
    .filter((u) => {
      const effective = [
        ...parseUserUnitsArray(u.units),
        ...defaultUnitsForRole(u.main_role || u.role),
      ];
      return effective.some((unit) => slugs.includes(unit));
    })
    .map((u) => u.id);

  return [...new Set([...byUnits.rows.map((r) => r.id), ...roleMatched])];
}

async function collectProjectThreadMemberIds(projectRequest) {
  const pipelineUsers = await usersByProjectPipelineUnits();
  const projectRoleUsers = await usersByRoles(['project']);
  const managers = await usersByRoles(MANAGER_ROLES);
  return [
    projectRequest.created_by_user_id,
    ...pipelineUsers,
    ...projectRoleUsers,
    ...managers,
  ];
}

async function addMembers(channelId, userIds, adminUserId) {
  const ids = [...new Set(userIds.filter(Boolean).map((id) => parseInt(id, 10)))];
  for (const uid of ids) {
    await pool.query(
      `INSERT INTO channel_members (channel_id, user_id, role, last_read_at, joined_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
      [channelId, uid, uid === adminUserId ? 'admin' : 'member']
    );
  }
  return ids;
}

function emitJoin(io, channelId, userIds) {
  if (!io) return;
  for (const uid of userIds) {
    io.to(`user:${uid}`).emit('chat:join_channel', { channelId });
    io.to(`user:${uid}`).emit('chat:group_created', { channelId });
  }
}

export async function getRecordChannelId(recordType, recordId) {
  const { rows } = await pool.query(
    `SELECT id FROM chat_channels
     WHERE record_type = $1 AND record_id = $2 AND COALESCE(is_archived, false) = false
     LIMIT 1`,
    [recordType, String(recordId)]
  );
  return rows[0]?.id || null;
}

export async function linkRecordChatChannel(table, recordPk, channelId) {
  const allowed = { tickets: 'id', requests: 'id', project_requests: 'id', project_wip_entries: 'id' };
  if (!allowed[table]) return;
  await pool.query(
    `UPDATE ${table} SET chat_channel_id = $1 WHERE ${allowed[table] === 'id' ? 'id' : 'id'} = $2`,
    [channelId, recordPk]
  );
}

/**
 * Create (or return existing) record-linked unit channel.
 */
export async function createRecordThreadChannel({
  recordType,
  recordId,
  displayTitle,
  description,
  memberIds,
  createdByUserId,
  io,
  tableName,
  tablePk,
}) {
  const existingId = await getRecordChannelId(recordType, recordId);
  if (existingId) return existingId;

  const slugBase = slugifyUnit(displayTitle) || `record-${recordType}-${recordId}`;
  const slug = `${slugBase}-${String(recordId).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`.slice(0, 100);

  const { rows } = await pool.query(
    `INSERT INTO chat_channels (name, description, channel_type, created_by, record_type, record_id)
     VALUES ($1, $2, 'unit', $3, $4, $5)
     RETURNING id`,
    [slug, description || displayTitle, createdByUserId || null, recordType, String(recordId)]
  );
  const channelId = rows[0].id;

  const members = await addMembers(channelId, [...memberIds, createdByUserId], createdByUserId);
  emitJoin(io, channelId, members);

  if (tableName && tablePk != null) {
    await pool.query(`UPDATE ${tableName} SET chat_channel_id = $1 WHERE id = $2`, [channelId, tablePk]);
  }

  return channelId;
}

/** Add assignee to an existing ticket thread (e.g. after self-assign from NOC). */
export async function syncTicketThreadAssignee(ticketPublicId, assigneeId, io) {
  if (!ticketPublicId || !assigneeId) return;
  const channelId = await getRecordChannelId('ticket', String(ticketPublicId).trim());
  if (!channelId) return;
  const members = await addMembers(channelId, [assigneeId], null);
  emitJoin(io, channelId, members);
}

async function collectTicketThreadMemberIds(ticket) {
  const oversight = await usersByRoles([...new Set(TICKET_OVERSIGHT_ROLES)]);
  return [...new Set([ticket.created_by_id, ticket.assigned_to, ...oversight].filter(Boolean))];
}

/** Ensure directors / executives are members of a ticket thread (idempotent). */
export async function ensureTicketThreadOversight(channelId, io = null) {
  if (!channelId) return;
  const oversight = await usersByRoles([...new Set(TICKET_OVERSIGHT_ROLES)]);
  const added = await addMembers(channelId, oversight, null);
  emitJoin(io, channelId, added);
}

/** On server boot: add oversight roles to every existing ticket thread. */
export async function syncAllTicketThreadOversightAccess(io = null) {
  const oversight = await usersByRoles([...new Set(TICKET_OVERSIGHT_ROLES)]);
  const { rows } = await pool.query(
    `SELECT id FROM chat_channels
     WHERE record_type = 'ticket' AND COALESCE(is_archived, false) = false`
  );
  for (const ch of rows) {
    const added = await addMembers(ch.id, oversight, null);
    emitJoin(io, ch.id, added);
  }
  return rows.length;
}

/** On server boot: let directors open and chat in every record thread under category hubs. */
export async function syncAllCategoryThreadDirectorAccess(io = null) {
  const directors = await usersByRoles(DIRECTOR_THREAD_ROLES);
  if (directors.length === 0) return 0;

  const { rows } = await pool.query(
    `SELECT id FROM chat_channels
     WHERE record_type IN ('material_request', 'item_return', 'cash_request', 'project_request', 'ticket')
       AND COALESCE(is_archived, false) = false`
  );
  for (const ch of rows) {
    const added = await addMembers(ch.id, directors, null);
    emitJoin(io, ch.id, added);
  }
  return rows.length;
}

export async function ensureTicketThread(ticket, io) {
  if (!ticket?.id) return null;
  const ticketKey = ticket.ticket_id ? String(ticket.ticket_id).trim() : '';
  if (!ticketKey || /^\d+$/.test(ticketKey)) {
    console.warn('[chat] ensureTicketThread: missing or invalid ticket_id', ticket.id);
    return null;
  }
  const existing = ticket.chat_channel_id || (await getRecordChannelId('ticket', ticketKey));
  if (existing) {
    await ensureTicketThreadOversight(existing, io);
    return existing;
  }

  const memberIds = await collectTicketThreadMemberIds(ticket);
  const title = truncate(ticket.title, 30);
  const displayTitle = `Ticket #${ticketKey} – ${title}`;

  return createRecordThreadChannel({
    recordType: 'ticket',
    recordId: ticketKey,
    displayTitle,
    description: displayTitle,
    memberIds,
    createdByUserId: ticket.created_by_id,
    io,
    tableName: 'tickets',
    tablePk: ticket.id,
  });
}

export async function ensureRequestThread(request, approverIds = [], io) {
  if (!request?.id) return null;
  const existing = request.chat_channel_id || (await getRecordChannelId(request.type, request.id));

  const type = request.type || 'material_request';
  let subtitle = request.project_name || request.purpose || request.reason || 'Request';
  if (type === 'material_request' && request.items?.length) {
    subtitle = request.items[0]?.name || subtitle;
  }
  const label =
    type === 'cash_request'
      ? `Cash Request #${request.id}`
      : type === 'item_return'
        ? `Item Return #${request.id}`
        : `Mat. Request #${request.id} – ${truncate(subtitle, 30)}`;

  const memberIds = [request.created_by_id, ...approverIds, ...(await usersByRoles(DIRECTOR_THREAD_ROLES))];
  if (type === 'cash_request') {
    memberIds.push(...(await usersByRoles(FINANCE_ROLES)));
  } else if (type === 'material_request' || type === 'item_return') {
    memberIds.push(...(await usersByRoles(WAREHOUSE_ROLES)));
    memberIds.push(...(await usersByRoles(ISSUER_ROLES)));
  }

  if (existing) {
    const added = await addMembers(existing, memberIds, request.created_by_id);
    emitJoin(io, existing, added);
    return existing;
  }

  return createRecordThreadChannel({
    recordType: type,
    recordId: request.id,
    displayTitle: label,
    description: label,
    memberIds,
    createdByUserId: request.created_by_id,
    io,
    tableName: 'requests',
    tablePk: request.id,
  });
}

export async function ensureProjectRequestThread(projectRequest, io) {
  if (!projectRequest?.id) return null;
  const existing =
    projectRequest.chat_channel_id ||
    (await getRecordChannelId('project_request', projectRequest.id));

  const name = truncate(projectRequest.site_name || projectRequest.customer_name || 'Project', 30);
  const displayTitle = `Project #${projectRequest.id} – ${name}`;
  const memberIds = await collectProjectThreadMemberIds(projectRequest);

  if (existing) {
    const added = await addMembers(existing, memberIds, projectRequest.created_by_user_id);
    emitJoin(io, existing, added);
    return existing;
  }

  return createRecordThreadChannel({
    recordType: 'project_request',
    recordId: projectRequest.id,
    displayTitle,
    description: displayTitle,
    memberIds,
    createdByUserId: projectRequest.created_by_user_id,
    io,
    tableName: 'project_requests',
    tablePk: projectRequest.id,
  });
}

/** A WIP row linked to a Service Request shares that SR's real chat channel rather than getting
 *  its own — one conversation per project, not two. Standalone (unlinked) WIP rows get a fresh
 *  channel of their own. */
export async function ensureWipEntryThread(wipEntry, io) {
  if (!wipEntry?.id) return null;

  if (wipEntry.project_request_id) {
    const { rows } = await pool.query('SELECT * FROM project_requests WHERE id = $1', [wipEntry.project_request_id]);
    const linkedSr = rows[0];
    if (linkedSr) {
      const channelId = await ensureProjectRequestThread(linkedSr, io);
      if (channelId && wipEntry.chat_channel_id !== channelId) {
        await pool.query('UPDATE project_wip_entries SET chat_channel_id = $1 WHERE id = $2', [channelId, wipEntry.id]);
      }
      return channelId;
    }
  }

  const existing = wipEntry.chat_channel_id || (await getRecordChannelId('wip_entry', wipEntry.id));
  if (existing) return existing;

  const displayTitle = `WIP-${String(wipEntry.id).padStart(3, '0')} – ${truncate(wipEntry.site_name || wipEntry.customer_name || 'WIP Entry', 30)}`;
  const memberIds = await usersByProjectPipelineUnits();

  return createRecordThreadChannel({
    recordType: 'wip_entry',
    recordId: wipEntry.id,
    displayTitle,
    description: displayTitle,
    memberIds,
    createdByUserId: wipEntry.created_by,
    io,
    tableName: 'project_wip_entries',
    tablePk: wipEntry.id,
  });
}

export async function resolveRequestChannelId(requestId, requestType) {
  const { rows } = await pool.query(
    'SELECT chat_channel_id, type FROM requests WHERE id = $1',
    [requestId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.chat_channel_id) return row.chat_channel_id;
  return getRecordChannelId(row.type || requestType, requestId);
}

export async function resolveTicketChannelId(ticketIdOrKey) {
  const { rows } = await pool.query(
    `SELECT chat_channel_id, ticket_id, id FROM tickets
     WHERE ticket_id = $1 OR id::text = $1 LIMIT 1`,
    [String(ticketIdOrKey)]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.chat_channel_id) return row.chat_channel_id;
  return getRecordChannelId('ticket', row.ticket_id);
}

export async function getApproversForRequest(requestId) {
  const { rows } = await pool.query(
    'SELECT approver_id FROM request_approvers WHERE request_id = $1',
    [requestId]
  );
  return rows.map((r) => r.approver_id);
}

export async function getRequesterId(requestId) {
  const { rows } = await pool.query('SELECT created_by_id FROM requests WHERE id = $1', [requestId]);
  return rows[0]?.created_by_id || null;
}
