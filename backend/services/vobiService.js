import pool from '../db.js';
import { getUserWorkspace } from '../db.js';
import { matchVobiIntent, vobiReplyTone } from './vobiIntents.js';

const TEAL = '#1D9E75';

function parseUserId(raw) {
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('Invalid user id');
  }
  return n;
}

async function ensureVobiSchema() {
  await pool.query(`
    ALTER TABLE chat_channels
      ADD COLUMN IF NOT EXISTS vobi_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_channels_vobi_user
      ON chat_channels(vobi_user_id)
      WHERE channel_type = 'vobi'
  `);
  await pool.query(`
    ALTER TABLE chat_messages
      ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb
  `).catch(() => {});
}

function greetingPeriod() {
  const h = new Date().getHours();
  if (h < 12) return { key: 'morning', label: 'Good morning' };
  if (h < 17) return { key: 'afternoon', label: 'Good afternoon' };
  return { key: 'evening', label: 'Good evening' };
}

function ageLabel(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function mapAttentionItem(item) {
  const badge =
    item.kind === 'approval'
      ? 'APR'
      : item.kind === 'ticket'
        ? 'TKT'
        : item.kind === 'project'
          ? 'PRJ'
          : item.kind === 'chat'
            ? 'CHT'
            : 'ALT';
  return {
    id: item.id,
    kind: item.kind,
    recordType: badge,
    badge,
    title: item.title,
    subtitle: item.subtitle,
    age: ageLabel(item.created_at),
    link: item.link,
    actionLabel: item.kind === 'approval' ? 'Review' : item.kind === 'ticket' ? 'Open' : 'View',
    priority: item.priority || 'normal',
    created_at: item.created_at,
  };
}

async function getUserFirstName(userId) {
  const uid = parseUserId(userId);
  const { rows } = await pool.query(
    `SELECT first_name, last_name, username FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [uid]
  );
  const u = rows[0];
  if (!u) return 'there';
  if (u.first_name) return u.first_name;
  const name =
    [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'there';
  return String(name).split(/\s+/)[0];
}

async function getLastLoginAt(userId) {
  const { rows } = await pool.query(
    `SELECT timestamp FROM audit_logs
      WHERE user_id = $1 AND action = 'login'
      ORDER BY timestamp DESC
      LIMIT 1`,
    [userId]
  );
  return rows[0]?.timestamp ?? null;
}

async function fetchPendingApprovals(userId) {
  try {
    const ws = await getUserWorkspace(parseUserId(userId));
    return (ws.attentionItems || []).filter((i) => i.kind === 'approval').map(mapAttentionItem);
  } catch (e) {
    console.warn('[vobi] approvals:', e.message);
    return [];
  }
}

async function fetchAssignedTickets(userId) {
  try {
    const ws = await getUserWorkspace(parseUserId(userId));
    return (ws.attentionItems || []).filter((i) => i.kind === 'ticket').map(mapAttentionItem);
  } catch (e) {
    console.warn('[vobi] tickets:', e.message);
    return [];
  }
}

async function fetchMentions(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT m.id AS message_id, m.body, m.created_at, m.channel_id,
              ch.name AS channel_name, ch.record_type, ch.record_id,
              sender.first_name, sender.last_name, sender.username,
              cm.last_read_at
         FROM message_mentions mm
         JOIN chat_messages m ON m.id = mm.message_id
         JOIN chat_channels ch ON ch.id = m.channel_id
         JOIN channel_members cm ON cm.channel_id = ch.id AND cm.user_id = $1
         LEFT JOIN users sender ON sender.id = m.sender_id
        WHERE mm.user_id = $1
          AND m.created_at >= NOW() - INTERVAL '7 days'
          AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamp)
        ORDER BY m.created_at DESC
        LIMIT 10`,
      [userId]
    );
    return rows.map((r) => {
      const who =
        [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username || 'Someone';
      const ctx = r.record_type
        ? `${r.record_type} #${r.record_id || ''}`
        : r.channel_name || 'chat';
      return {
        id: `mention-${r.message_id}`,
        kind: 'chat',
        recordType: 'CHT',
        badge: 'CHT',
        title: `${who} mentioned you`,
        subtitle: ctx,
        age: ageLabel(r.created_at),
        link: r.channel_id ? `/chat?channel=${r.channel_id}` : '/chat',
        actionLabel: 'Go to thread',
        priority: 'normal',
        created_at: r.created_at,
      };
    });
  } catch (e) {
    console.warn('[vobi] mentions:', e.message);
    return [];
  }
}

async function fetchOverdueItems(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT TRIM(ticket_id) AS ticket_id, title, escalation_due_at, created_at, status
         FROM tickets
        WHERE assigned_to = $1
          AND escalation_due_at IS NOT NULL
          AND escalation_due_at < NOW()
          AND UPPER(status) NOT IN ('CLOSED', 'RESOLVED', 'CANCELLED')
          AND ticket_id IS NOT NULL
        ORDER BY escalation_due_at ASC
        LIMIT 8`,
      [userId]
    );
    return rows.map((t) => ({
      id: `overdue-${t.ticket_id}`,
      kind: 'ticket',
      recordType: 'TKT',
      badge: 'TKT',
      title: `${t.ticket_id} — escalation overdue`,
      subtitle: t.title || t.status,
      age: ageLabel(t.escalation_due_at || t.created_at),
      link: `/staff/cx/tickets/${t.ticket_id}`,
      actionLabel: 'Handle',
      priority: 'high',
      created_at: t.escalation_due_at || t.created_at,
    }));
  } catch (e) {
    console.warn('[vobi] overdue:', e.message);
    return [];
  }
}

async function fetchChangesSinceLogin(userId, lastLoginAt) {
  const since = lastLoginAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
  const items = [];
  try {
    const { rows } = await pool.query(
      `SELECT t.ticket_id, tt.message, tt.created_at, tt.actor_name
         FROM ticket_timeline tt
         JOIN tickets t ON t.id = tt.ticket_id
        WHERE t.assigned_to = $1
          AND tt.actor_id IS DISTINCT FROM $1
          AND tt.created_at > $2
        ORDER BY tt.created_at DESC
        LIMIT 6`,
      [userId, since]
    );
    for (const r of rows) {
      items.push({
        id: `chg-tkt-${r.ticket_id}-${r.created_at}`,
        kind: 'ticket',
        recordType: 'TKT',
        badge: 'TKT',
        title: `${r.ticket_id} updated`,
        subtitle: r.message || r.actor_name || 'Status change',
        age: ageLabel(r.created_at),
        link: `/staff/cx/tickets/${r.ticket_id}`,
        actionLabel: 'View',
        priority: 'normal',
        created_at: r.created_at,
      });
    }
  } catch (e) {
    console.warn('[vobi] ticket changes:', e.message);
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, action, timestamp, details::text AS details_text
         FROM audit_logs
        WHERE user_id = $1
          AND action IN ('approve_request', 'reject_request', 'create_request')
          AND timestamp > $2
        ORDER BY timestamp DESC
        LIMIT 4`,
      [userId, since]
    );
    for (const r of rows) {
      items.push({
        id: `chg-audit-${r.id}`,
        kind: 'approval',
        recordType: 'APR',
        badge: 'APR',
        title: r.action.replace(/_/g, ' '),
        subtitle: 'Your activity',
        age: ageLabel(r.timestamp),
        link: '/workspace',
        actionLabel: 'View',
        priority: 'normal',
        created_at: r.timestamp,
      });
    }
  } catch (_) {
    /* ignore */
  }

  return items.slice(0, 8);
}

export async function getVobiOverview(userId) {
  const uid = parseUserId(userId);
  let firstName = 'there';
  try {
    firstName = await getUserFirstName(uid);
  } catch (e) {
    console.warn('[vobi] firstName:', e.message);
  }
  const g = greetingPeriod();
  const [needsAction, mentions, sinceLogin, overdue] = await Promise.all([
    (async () => {
      const approvals = await fetchPendingApprovals(uid);
      const tickets = await fetchAssignedTickets(uid);
      return [...approvals, ...tickets].slice(0, 5);
    })(),
    fetchMentions(uid),
    (async () => {
      const lastLogin = await getLastLoginAt(uid);
      return fetchChangesSinceLogin(uid, lastLogin);
    })(),
    fetchOverdueItems(uid),
  ]);

  const pendingCount =
    needsAction.length + mentions.length + overdue.length;
  const actionPart = needsAction.length + overdue.length;
  const mentionPart = mentions.length;
  let statusLine = 'You are all caught up';
  if (pendingCount > 0) {
    const bits = [];
    if (actionPart > 0) bits.push(`${actionPart} pending action${actionPart === 1 ? '' : 's'}`);
    if (mentionPart > 0) bits.push(`${mentionPart} mention${mentionPart === 1 ? '' : 's'}`);
    statusLine = `You have ${bits.join(' and ')}`;
  }

  return {
    greeting: { period: g.key, label: g.label, firstName },
    statusLine,
    pendingCount,
    groups: {
      needsAction,
      mentions,
      sinceLogin,
      overdue,
    },
    accentColor: TEAL,
  };
}

export async function getVobiActions(userId, filter = 'all', type = null) {
  const overview = await getVobiOverview(userId);
  let items = [
    ...overview.groups.needsAction,
    ...overview.groups.overdue,
    ...overview.groups.mentions,
  ];
  const normalized = String(type || filter || 'all').toLowerCase();
  if (normalized === 'approval' || normalized === 'approvals') {
    items = items.filter((i) => i.kind === 'approval' || i.recordType === 'APR');
  } else if (normalized === 'ticket' || normalized === 'tickets') {
    items = items.filter((i) => i.kind === 'ticket' || i.recordType === 'TKT');
  } else if (normalized === 'request' || normalized === 'requests') {
    items = items.filter((i) => i.recordType === 'MAT' || i.recordType === 'CSH' || i.kind === 'approval');
  } else if (normalized === 'mention' || normalized === 'mentions') {
    items = overview.groups.mentions;
  } else if (normalized === 'overdue') {
    items = overview.groups.overdue;
  }
  return { filter: normalized, items, total: items.length };
}

function periodStart(period) {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === 'week') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  return null;
}

export async function getVobiSummary(userId, period = 'since_login', type = null) {
  const since =
    period === 'since_login'
      ? (await getLastLoginAt(userId)) || new Date(Date.now() - 24 * 60 * 60 * 1000)
      : periodStart(period) || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const sections = {
    tickets: { resolved: [], open: [], overdue: [], escalated: [] },
    requests: { approved: 0, rejected: 0, pending: 0 },
    chat: { mentioned: 0, unread_threads: 0 },
    projects: { updated: 0, in_production: 0 },
  };

  try {
    const resolved = await pool.query(
      `SELECT TRIM(ticket_id) AS ticket_id FROM tickets t
        JOIN ticket_timeline tt ON tt.ticket_id = t.id
       WHERE (t.assigned_to = $1 OR t.created_by_id = $1)
         AND tt.created_at > $2
         AND tt.action ILIKE '%resolv%'
       LIMIT 20`,
      [userId, since]
    );
    sections.tickets.resolved = resolved.rows.map((r) => r.ticket_id).filter(Boolean);
  } catch (_) {
    /* ignore */
  }

  try {
    const open = await pool.query(
      `SELECT TRIM(ticket_id) AS ticket_id FROM tickets
        WHERE assigned_to = $1
          AND UPPER(status) NOT IN ('CLOSED', 'RESOLVED', 'CANCELLED')
          AND ticket_id IS NOT NULL`,
      [userId]
    );
    sections.tickets.open = open.rows.map((r) => r.ticket_id).filter(Boolean);
  } catch (_) {
    /* ignore */
  }

  const overdue = await fetchOverdueItems(userId);
  sections.tickets.overdue = overdue.map((o) => o.title.split(' ')[0]).filter(Boolean);

  try {
    const appr = await pool.query(
      `SELECT COUNT(*)::int AS c FROM audit_logs
        WHERE user_id = $1 AND action = 'approve_request' AND timestamp > $2`,
      [userId, since]
    );
    sections.requests.approved = appr.rows[0]?.c ?? 0;
    const rej = await pool.query(
      `SELECT COUNT(*)::int AS c FROM audit_logs
        WHERE user_id = $1 AND action = 'reject_request' AND timestamp > $2`,
      [userId, since]
    );
    sections.requests.rejected = rej.rows[0]?.c ?? 0;
  } catch (_) {
    /* ignore */
  }

  const pending = await fetchPendingApprovals(userId);
  sections.requests.pending = pending.length;

  const mentions = await fetchMentions(userId);
  sections.chat.mentioned = mentions.length;

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT cm.channel_id)::int AS c
         FROM channel_members cm
         JOIN chat_channels ch ON ch.id = cm.channel_id
         JOIN chat_messages m ON m.channel_id = ch.id
        WHERE cm.user_id = $1
          AND m.created_at > cm.last_read_at
          AND (m.sender_id IS NULL OR m.sender_id <> $1)
          AND ch.channel_type NOT IN ('category', 'vobi')`,
      [userId]
    );
    sections.chat.unread_threads = rows[0]?.c ?? 0;
  } catch (_) {
    /* ignore */
  }

  return { period, type, since, sections };
}

function displayName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username || 'System';
}

function truncateText(value, max = 80) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function parseSince(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function getRecordStatus(recordType, recordId) {
  if (!recordType || !recordId) return null;
  const type = String(recordType).toLowerCase();
  try {
    if (type.includes('ticket') || type === 'tkt') {
      const { rows } = await pool.query(
        `SELECT status FROM tickets WHERE id::text = $1 OR TRIM(ticket_id) = $1 LIMIT 1`,
        [String(recordId)]
      );
      return rows[0]?.status || null;
    }
    if (type.includes('request') || ['material', 'cash', 'mat', 'csh'].includes(type)) {
      const { rows } = await pool.query(
        `SELECT status FROM requests WHERE id::text = $1 LIMIT 1`,
        [String(recordId)]
      );
      return rows[0]?.status || null;
    }
  } catch (e) {
    console.warn('[vobi] record status:', e.message);
  }
  return null;
}

export async function getThreadSummary(userId, channelId, opts = {}) {
  const uid = parseUserId(userId);
  const limit = Math.min(Math.max(parseInt(String(opts.limit || 50), 10) || 50, 1), 100);
  const fallbackSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since = parseSince(opts.since, fallbackSince);

  const channelRes = await pool.query(
    `SELECT ch.id, ch.name, ch.description, ch.record_type, ch.record_id
       FROM chat_channels ch
       JOIN channel_members cm ON cm.channel_id = ch.id AND cm.user_id = $2
      WHERE ch.id = $1
      LIMIT 1`,
    [channelId, uid]
  );
  const channel = channelRes.rows[0];
  if (!channel) {
    const err = new Error('You do not have access to this chat thread');
    err.status = 403;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT m.id, m.body, m.message_type, m.created_at, m.sender_id,
            u.first_name, u.last_name, u.username
       FROM chat_messages m
       JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $2
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.channel_id = $1
        AND m.created_at >= $3
      ORDER BY m.created_at DESC
      LIMIT $4`,
    [channelId, uid, since, limit]
  );
  const messages = rows.reverse();
  const userMessages = messages.filter((m) => (m.message_type || 'user') === 'user');
  const systemMessages = messages.filter((m) => ['system', 'vobi'].includes(m.message_type));

  const participantMap = new Map();
  for (const msg of userMessages) {
    const key = msg.sender_id || 0;
    const existing = participantMap.get(key) || {
      userId: msg.sender_id,
      displayName: displayName(msg),
      messageCount: 0,
    };
    existing.messageCount += 1;
    participantMap.set(key, existing);
  }

  const lastUserMessage = userMessages[userMessages.length - 1] || null;
  const lastMessage = messages[messages.length - 1] || null;
  const currentStatus = await getRecordStatus(channel.record_type, channel.record_id);

  return {
    channelId: channel.id,
    channelName: channel.description || channel.name,
    recordType: channel.record_type || null,
    recordId: channel.record_id || null,
    period: {
      from: since,
      to: lastMessage?.created_at || new Date(),
    },
    messageCount: messages.length,
    participants: Array.from(participantMap.values()).sort((a, b) => b.messageCount - a.messageCount),
    systemEvents: systemMessages.slice(0, 8).map((m) => ({
      created_at: m.created_at,
      body: truncateText(m.body, 120),
    })),
    keyMessages: userMessages.slice(0, 3).map((m) => ({
      sender: displayName(m),
      body: truncateText(m.body, 120),
      created_at: m.created_at,
    })),
    lastMessage: lastUserMessage
      ? {
          sender: displayName(lastUserMessage),
          body: truncateText(lastUserMessage.body, 120),
          created_at: lastUserMessage.created_at,
        }
      : null,
    lastActivity: lastMessage?.created_at || null,
    currentStatus,
  };
}

export async function resolveUserChannel(userId, rawName) {
  const uid = parseUserId(userId);
  const needle = String(rawName || '').replace(/^#/, '').trim().toLowerCase();
  if (!needle) return null;
  const { rows } = await pool.query(
    `SELECT ch.id, ch.name, ch.description, ch.record_type
       FROM chat_channels ch
       JOIN channel_members cm ON cm.channel_id = ch.id AND cm.user_id = $1
      WHERE ch.channel_type <> 'vobi'`,
    [uid]
  );
  return (
    rows.find((ch) => ch.name?.toLowerCase() === needle) ||
    rows.find((ch) => ch.name?.toLowerCase().includes(needle)) ||
    rows.find((ch) => String(ch.description || '').toLowerCase().includes(needle)) ||
    null
  );
}

export async function getPersonalDigest(userId, sinceInput = null) {
  const uid = parseUserId(userId);
  const since = parseSince(sinceInput, (await getLastLoginAt(uid)) || new Date(Date.now() - 24 * 60 * 60 * 1000));

  const channelRes = await pool.query(
    `WITH unread AS (
       SELECT ch.id AS channel_id, ch.name, ch.description, ch.record_type, cm.last_read_at,
              m.id AS message_id, m.body, m.message_type, m.created_at,
              COALESCE(NULLIF(TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')), ''), u.username, 'System') AS sender_name
         FROM channel_members cm
         JOIN chat_channels ch ON ch.id = cm.channel_id
         JOIN chat_messages m ON m.channel_id = ch.id
         LEFT JOIN users u ON u.id = m.sender_id
        WHERE cm.user_id = $1
          AND ch.channel_type <> 'vobi'
          AND m.created_at > GREATEST($2::timestamp, COALESCE(cm.last_read_at, '1970-01-01'::timestamp))
          AND (m.sender_id IS NULL OR m.sender_id <> $1)
     )
     SELECT channel_id, name, description, record_type,
            COUNT(*)::int AS unread_count,
            COUNT(*) FILTER (WHERE message_type IN ('system','vobi'))::int AS system_count,
            COUNT(*) FILTER (WHERE COALESCE(message_type, 'user') = 'user')::int AS user_count,
            BOOL_OR(mm.user_id IS NOT NULL) AS mentioned,
            (ARRAY_AGG(body ORDER BY created_at DESC))[1] AS last_body,
            (ARRAY_AGG(sender_name ORDER BY created_at DESC))[1] AS last_sender,
            MAX(created_at) AS last_created_at
       FROM unread u
       LEFT JOIN message_mentions mm ON mm.message_id = u.message_id AND mm.user_id = $1
      GROUP BY channel_id, name, description, record_type
      ORDER BY MAX(created_at) DESC
      LIMIT 30`,
    [uid, since]
  );

  const dmRes = await pool.query(
    `WITH unread AS (
       SELECT d.id AS dm_id, dp.last_read_at, m.id AS message_id, m.body, m.created_at,
              COALESCE(NULLIF(TRIM(sender.first_name || ' ' || COALESCE(sender.last_name, '')), ''), sender.username, 'Someone') AS sender_name,
              COALESCE(NULLIF(TRIM(other_u.first_name || ' ' || COALESCE(other_u.last_name, '')), ''), other_u.username, 'Direct message') AS thread_name
         FROM dm_participants dp
         JOIN dm_conversations d ON d.id = dp.dm_id
         JOIN dm_participants other_dp ON other_dp.dm_id = d.id AND other_dp.user_id <> $1
         LEFT JOIN users other_u ON other_u.id = other_dp.user_id
         JOIN chat_messages m ON m.dm_id = d.id
         LEFT JOIN users sender ON sender.id = m.sender_id
        WHERE dp.user_id = $1
          AND m.created_at > GREATEST($2::timestamp, COALESCE(dp.last_read_at, '1970-01-01'::timestamp))
          AND m.sender_id <> $1
     )
     SELECT dm_id, thread_name,
            COUNT(*)::int AS unread_count,
            BOOL_OR(mm.user_id IS NOT NULL) AS mentioned,
            (ARRAY_AGG(body ORDER BY created_at DESC))[1] AS last_body,
            (ARRAY_AGG(sender_name ORDER BY created_at DESC))[1] AS last_sender,
            MAX(created_at) AS last_created_at
       FROM unread u
       LEFT JOIN message_mentions mm ON mm.message_id = u.message_id AND mm.user_id = $1
      GROUP BY dm_id, thread_name
      ORDER BY MAX(created_at) DESC
      LIMIT 20`,
    [uid, since]
  );

  const mentionedIn = [];
  const activeThreads = [];
  const systemEvents = [];
  for (const row of channelRes.rows) {
    const item = {
      channelName: row.description || row.name,
      channelId: row.channel_id,
      unreadCount: row.unread_count,
      lastMessage: {
        body: truncateText(row.last_body),
        sender: row.last_sender || 'System',
        created_at: row.last_created_at,
      },
      recordType: row.record_type || null,
    };
    if (row.mentioned) mentionedIn.push(item);
    else if (row.system_count > 0 && row.user_count === 0) systemEvents.push(item);
    else activeThreads.push(item);
  }
  for (const row of dmRes.rows) {
    const item = {
      channelName: row.thread_name,
      dmId: row.dm_id,
      unreadCount: row.unread_count,
      lastMessage: {
        body: truncateText(row.last_body),
        sender: row.last_sender || 'Someone',
        created_at: row.last_created_at,
      },
      recordType: 'DM',
    };
    if (row.mentioned) mentionedIn.push(item);
    else activeThreads.push(item);
  }

  return {
    since,
    totalUnread: [...mentionedIn, ...activeThreads, ...systemEvents].reduce((sum, item) => sum + item.unreadCount, 0),
    mentionedIn,
    activeThreads,
    systemEvents,
  };
}

export async function getCrossThreadInsight(userId) {
  const uid = parseUserId(userId);
  const topItems = [];
  const mentions = await pool.query(
    `SELECT ch.id AS channel_id, ch.name, ch.description, m.body
       FROM message_mentions mm
       JOIN chat_messages m ON m.id = mm.message_id
       JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
       JOIN chat_channels ch ON ch.id = m.channel_id
      WHERE mm.user_id = $1
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamp)
      ORDER BY m.created_at DESC
      LIMIT 5`,
    [uid]
  );
  topItems.push(...mentions.rows.map((r) => ({
    type: 'mention',
    channelId: r.channel_id,
    channelName: r.description || r.name,
    detail: truncateText(r.body),
  })));

  const actions = await pool.query(
    `SELECT ch.id AS channel_id, ch.name, ch.description, m.body
       FROM channel_members cm
       JOIN chat_channels ch ON ch.id = cm.channel_id
       JOIN chat_messages m ON m.channel_id = ch.id
       JOIN users u ON u.id = cm.user_id
      WHERE cm.user_id = $1
        AND m.meta->'actions' IS NOT NULL
        AND m.meta->>'actionState' IS NULL
        AND COALESCE(u.role, u.main_role, '') IN ('approver','finance_manager','director','cto','superadmin')
      ORDER BY m.created_at DESC
      LIMIT 5`,
    [uid]
  );
  topItems.push(...actions.rows.map((r) => ({
    type: 'action',
    channelId: r.channel_id,
    channelName: r.description || r.name,
    detail: truncateText(r.body),
  })));

  const updates = await pool.query(
    `SELECT ch.id AS channel_id, ch.name, ch.description, MAX(m.created_at) AS last_at
       FROM channel_members cm
       JOIN chat_channels ch ON ch.id = cm.channel_id
       JOIN chat_messages m ON m.channel_id = ch.id
      WHERE cm.user_id = $1
        AND m.created_at > NOW() - INTERVAL '1 hour'
        AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamp)
        AND (m.sender_id IS NULL OR m.sender_id <> $1)
      GROUP BY ch.id, ch.name, ch.description
      ORDER BY MAX(m.created_at) DESC
      LIMIT 5`,
    [uid]
  );
  topItems.push(...updates.rows.map((r) => ({
    type: 'update',
    channelId: r.channel_id,
    channelName: r.description || r.name,
    detail: 'Thread updated in the last hour',
  })));

  return {
    urgentMentions: mentions.rowCount,
    pendingActions: actions.rowCount,
    recentActivity: updates.rowCount,
    topItems: topItems.slice(0, 10),
  };
}

export async function ensureVobiThread(userId) {
  const uid = parseUserId(userId);
  await ensureVobiSchema();

  const userCheck = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [uid]
  );
  if (!userCheck.rows[0]) {
    throw new Error('User not found');
  }

  const existing = await pool.query(
    `SELECT id, name, description FROM chat_channels
      WHERE channel_type = 'vobi' AND vobi_user_id = $1
      LIMIT 1`,
    [uid]
  );
  if (existing.rows[0]) {
    return { channelId: existing.rows[0].id, created: false };
  }

  const ins = await pool.query(
    `INSERT INTO chat_channels (name, description, channel_type, vobi_user_id, created_by)
     VALUES ('Vobi', 'Your personal work assistant', 'vobi', $1, $1)
     RETURNING id, name, description`,
    [uid]
  );
  const channelId = ins.rows[0].id;
  await pool.query(
    `INSERT INTO channel_members (channel_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (channel_id, user_id) DO NOTHING`,
    [channelId, uid]
  );

  const firstName = await getUserFirstName(uid);
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 17
        ? 'Good afternoon'
        : 'Good evening';
  try {
    await insertVobiMessage(
      channelId,
      `I'm Vobi, your personal work assistant inside Vobiss.\n\nI watch approvals, tickets, requests, projects, chat mentions, and urgent updates so you can quickly see what needs attention.\n\nMy future ambition is to become a calm operations layer for every staff member: predicting urgent work early, preparing handovers and reports, and guiding you to the next best action.\n\n${greeting}, ${firstName}. Ask me things like "what did I miss today?", "show my approvals", or "my mentions" anytime.`,
      { cardType: 'welcome', firstName }
    );
  } catch (e) {
    console.warn('[vobi] welcome message:', e.message);
  }

  return { channelId, created: true };
}

async function insertVobiMessage(channelId, content, meta = {}) {
  const { rows } = await pool.query(
    `INSERT INTO chat_messages (channel_id, sender_id, body, message_type, meta)
     VALUES ($1, NULL, $2, 'vobi', $3::jsonb)
     RETURNING id, channel_id, body, message_type, meta, created_at`,
    [channelId, content, JSON.stringify(meta ?? {})]
  );
  return rows[0];
}

export async function postVobiMessage(userId, content, meta = {}) {
  const { channelId } = await ensureVobiThread(userId);
  const message = await insertVobiMessage(channelId, content, meta);
  return { channelId, message };
}

function extractThreadName(text) {
  return String(text || '')
    .replace(/summari[sz]e/ig, '')
    .replace(/what\s+happened\s+in/ig, '')
    .replace(/catch\s+me\s+up\s+on/ig, '')
    .replace(/\brecap\b/ig, '')
    .replace(/summary\s+of/ig, '')
    .replace(/what'?s\s+in/ig, '')
    .replace(/^the\s+/i, '')
    .replace(/^#/i, '')
    .trim();
}

function formatThreadSummaryReply(summary) {
  return summary.messageCount > 0
    ? `Caught you up on ${summary.channelName} — here's the recap.`
    : `You're all caught up in ${summary.channelName} — nothing new in this window.`;
}

function formatDigestReply(digest, mentionsOnly = false) {
  if (mentionsOnly) {
    return digest.mentionedIn.length
      ? `You were mentioned in ${digest.mentionedIn.length} thread${digest.mentionedIn.length === 1 ? '' : 's'}. Here's where:`
      : 'No new chat mentions right now.';
  }
  const threadCount = digest.mentionedIn.length + digest.activeThreads.length + digest.systemEvents.length;
  if (!threadCount) return "You're all caught up — nothing new since your last login.";
  return `${threadCount} thread${threadCount === 1 ? '' : 's'} had activity since you were away.`;
}

export async function runVobiCommand(userId, text) {
  const uid = parseUserId(userId);
  const intent = matchVobiIntent(text);

  if (intent === 'summarise_thread') {
    const channelName = extractThreadName(text);
    const channel = await resolveUserChannel(uid, channelName);
    if (!channel) {
      return {
        intent,
        reply: `I couldn't find a chat thread named "${channelName || 'that'}" that you belong to.`,
        cards: [],
        meta: { cardType: 'text', intent },
      };
    }
    const threadSummary = await getThreadSummary(uid, channel.id, {});
    return {
      intent,
      reply: formatThreadSummaryReply(threadSummary),
      cards: [],
      meta: { cardType: 'thread_summary', threadSummary },
    };
  }

  if (intent === 'personal_digest' || intent === 'missed') {
    const digest = await getPersonalDigest(uid);
    return {
      intent: 'personal_digest',
      reply: formatDigestReply(digest),
      cards: [],
      meta: { cardType: 'personal_digest', digest },
    };
  }

  if (intent === 'chat_mentions') {
    const digest = await getPersonalDigest(uid);
    return {
      intent,
      reply: formatDigestReply(digest, true),
      cards: [],
      meta: { cardType: 'personal_digest', digest: { ...digest, activeThreads: [], systemEvents: [] } },
    };
  }

  const overview = await getVobiOverview(uid);
  const actions = await getVobiActions(uid, 'all');
  let summary = await getVobiSummary(uid, 'since_login');

  const openTickets = summary.sections.tickets.open?.length ?? 0;
  const g = overview.greeting;

  let cards = [];
  let filter = null;

  switch (intent) {
    case 'greeting':
      break;
    case 'tasks':
      cards = actions.items.slice(0, 8);
      filter = 'all';
      break;
    case 'approvals':
      cards = (await getVobiActions(uid, 'all', 'approval')).items;
      filter = 'approvals';
      return {
        intent,
        reply: `${cards.length} approval${cards.length === 1 ? '' : 's'} waiting.`,
        cards,
        filter,
        meta: { cardType: 'action_list', intent },
      };
    case 'tickets_summary': {
      summary = await getVobiSummary(uid, 'today', 'tickets');
      const s = summary.sections.tickets;
      const lines = [];
      if (s.resolved?.length) lines.push(`Resolved: ${s.resolved.join(', ')}`);
      if (s.open?.length) lines.push(`Open: ${s.open.join(', ')}`);
      if (s.overdue?.length) lines.push(`Overdue: ${s.overdue.join(', ')}`);
      return {
        intent,
        reply: vobiReplyTone(intent, {
          summaryText: lines.length ? lines.join('\n') : 'No ticket activity in this period.',
        }),
        cards: [],
        meta: { cardType: 'text', sections: summary.sections.tickets },
      };
    }
    case 'overdue':
      cards = overview.groups.overdue;
      return {
        intent,
        reply: cards.length
          ? `${cards.length} overdue item${cards.length === 1 ? '' : 's'}.`
          : 'Nothing overdue right now.',
        cards,
        filter: 'overdue',
        meta: { cardType: 'action_list', intent },
      };
    case 'mentions':
      cards = overview.groups.mentions;
      return {
        intent,
        reply: cards.length
          ? `${cards.length} mention${cards.length === 1 ? '' : 's'} found.`
          : 'No new mentions.',
        cards,
        filter: 'mentions',
        meta: { cardType: 'action_list', intent },
      };
    case 'open_tickets_count':
      return {
        intent,
        reply: vobiReplyTone(intent, { openTickets }),
        cards: [],
        meta: { cardType: 'stat', openTickets },
      };
    case 'about':
      return {
        intent,
        reply: vobiReplyTone(intent, {}),
        cards: [],
        meta: { cardType: 'text', intent },
      };
    case 'report':
      summary = await getVobiSummary(uid, 'today');
      return {
        intent,
        reply: formatVobiSummaryText(summary, 'Here is today’s report summary:'),
        cards: [],
        meta: { cardType: 'report_hint', period: 'today' },
      };
    default:
      break;
  }

  const reply = vobiReplyTone(intent, {
    greeting: `${g.label}, ${g.firstName}`,
    statusLine: overview.statusLine,
    actionCount: cards.length || actions.total,
    total: cards.length,
    openTickets,
    summaryText: overview.statusLine,
  });

  return {
    intent,
    reply:
      intent === 'tasks'
        ? cards.length
          ? 'Here are your open tasks:'
          : "You're all clear — no open tasks right now."
        : reply,
    cards,
    filter,
    meta: { cardType: cards.length ? 'action_list' : 'text', intent },
  };
}

function formatVobiSummaryText(summary, heading = 'Here is what changed:') {
  const t = summary.sections.tickets;
  const r = summary.sections.requests;
  const c = summary.sections.chat;
  return [
    heading,
    `Tickets: ${t.open.length} open, ${t.overdue.length} overdue, ${t.resolved.length} resolved.`,
    `Requests: ${r.pending} pending, ${r.approved} approved, ${r.rejected} rejected.`,
    `Chat: ${c.mentioned} mentions, ${c.unread_threads} unread threads.`,
  ].join('\n');
}

export async function generateVobiReport(userId, period = 'today') {
  const summary = await getVobiSummary(userId, period === 'week' ? 'week' : 'today');
  const overview = await getVobiOverview(userId);
  const lines = [];
  lines.push(`Vobiss — Vobi ${period} report`);
  lines.push(`${overview.greeting.label}, ${overview.greeting.firstName}`);
  lines.push(overview.statusLine);
  lines.push('');
  lines.push('TICKETS');
  const t = summary.sections.tickets;
  if (t.resolved?.length) lines.push(`• Resolved: ${t.resolved.join(', ')}`);
  if (t.open?.length) lines.push(`• Open: ${t.open.join(', ')}`);
  if (t.overdue?.length) lines.push(`• Overdue: ${t.overdue.join(', ')}`);
  lines.push('');
  lines.push('REQUESTS');
  lines.push(`• Approved: ${summary.sections.requests.approved}`);
  lines.push(`• Pending: ${summary.sections.requests.pending}`);
  lines.push('');
  lines.push('CHAT');
  lines.push(`• Mentions: ${summary.sections.chat.mentioned}`);
  lines.push(`• Unread threads: ${summary.sections.chat.unread_threads}`);

  const body = lines.join('\n');
  return {
    period,
    filename: `vobi-report-${period}-${new Date().toISOString().slice(0, 10)}.txt`,
    contentType: 'text/plain',
    body,
  };
}

/** Run schema migration on module load (idempotent). */
ensureVobiSchema().catch((e) => console.warn('[vobi] schema:', e.message));
