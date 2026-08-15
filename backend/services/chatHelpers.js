import pool from '../db.js';

export const AVATAR_COLOR_CLASSES = [
  'bg-teal-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-orange-400',
  'bg-blue-500',
  'bg-emerald-500',
  'bg-pink-500',
  'bg-slate-500',
];

export function getInitials(firstName, lastName, username) {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (username) return String(username).slice(0, 2).toUpperCase();
  return '??';
}

export function getDisplayName(user) {
  if (!user) return 'Unknown';
  const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  return full || user.username || 'Unknown';
}

export function getAvatarColorIndex(userId) {
  const id = Number(userId) || 0;
  return Math.abs(id) % AVATAR_COLOR_CLASSES.length;
}

export function getAvatarColorClass(userId) {
  return AVATAR_COLOR_CLASSES[getAvatarColorIndex(userId)];
}

export function formatRoleBadge(role) {
  const map = {
    superadmin: 'Admin',
    director: 'Director',
    cto: 'Director',
    finance: 'Finance',
    finance_manager: 'Finance',
    approver: 'Manager',
    issuer: 'Operations',
    requester: 'Operations',
    cx: 'Support',
    noc: 'Operations',
    stock_admin: 'Operations',
  };
  return map[role] || 'Staff';
}

export function formatUnitBadge(unit) {
  const value = String(unit || '').trim();
  if (!value) return '';
  const upper = value.toUpperCase();
  if (['NOC', 'IP', 'TX', 'CX'].includes(upper)) return upper;
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isAdminSuperAccount(user) {
  const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
  const username = String(user?.username || '').trim().toLowerCase();
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim().toLowerCase();
  return (
    username === 'superadmin' ||
    (role === 'superadmin' && (fullName === 'admin super' || fullName === 'system admin'))
  );
}

export function formatUserChatBadge(user) {
  const role = String(user?.main_role || user?.role || '').trim().toLowerCase();
  const position = String(user?.position || '').trim();
  const unit = formatUnitBadge(user?.unit);

  if (isAdminSuperAccount(user)) return 'System Admin';
  if (role === 'director' || role === 'cto' || position.toLowerCase().includes('director')) {
    return position || 'Director';
  }

  return unit || 'Staff';
}

const MENTION_REGEX = /@\[([^\]]+)\]\((\d+)\)/g;

export function parseMentions(body) {
  const mentions = [];
  if (!body) return mentions;
  let match;
  const re = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = re.exec(body)) !== null) {
    mentions.push({ name: match[1], userId: parseInt(match[2], 10) });
  }
  return mentions;
}

export function truncatePreview(text, max = 60) {
  const raw = String(text || '').trim();
  if (!raw || raw === '(attachment)') return 'Attachment';
  const clean = raw.replace(MENTION_REGEX, '@$1').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export async function fetchUserMap(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, role, main_role, unit, units, position, avatar_url
     FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
    [ids]
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export async function hydrateMessages(messageRows, currentUserId) {
  if (!messageRows.length) return [];

  const ids = messageRows.map((m) => m.id);
  const replyIds = messageRows.map((m) => m.reply_to).filter(Boolean);
  const senderIds = messageRows.map((m) => m.sender_id).filter(Boolean);

  const forwardedIds = messageRows.map((m) => m.forwarded_from).filter(Boolean);
  const originMap = await fetchForwardedOrigins(forwardedIds);

  const [attachmentsRes, reactionsRes, replyRes] = await Promise.all([
    pool.query(
      `SELECT id, message_id, file_name, file_url, file_size, mime_type
       FROM chat_attachments WHERE message_id = ANY($1::uuid[])`,
      [ids]
    ),
    pool.query(
      `SELECT message_id, emoji, user_id
       FROM message_reactions WHERE message_id = ANY($1::uuid[])`,
      [ids]
    ),
    replyIds.length
      ? pool.query(
          `SELECT m.id, m.body, m.sender_id, u.first_name, u.last_name, u.username
           FROM chat_messages m
           LEFT JOIN users u ON u.id = m.sender_id
           WHERE m.id = ANY($1::uuid[])`,
          [replyIds]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const userMap = await fetchUserMap([
    ...senderIds,
    ...replyRes.rows.map((r) => r.sender_id).filter(Boolean),
  ]);

  const attachmentsByMsg = new Map();
  for (const a of attachmentsRes.rows) {
    if (!attachmentsByMsg.has(a.message_id)) attachmentsByMsg.set(a.message_id, []);
    attachmentsByMsg.get(a.message_id).push({
      id: a.id,
      file_name: a.file_name,
      file_url: a.file_url,
      file_size: a.file_size,
      mime_type: a.mime_type,
    });
  }

  const reactionsByMsg = new Map();
  for (const r of reactionsRes.rows) {
    if (!reactionsByMsg.has(r.message_id)) reactionsByMsg.set(r.message_id, []);
    reactionsByMsg.get(r.message_id).push(r);
  }

  const replyMap = new Map(replyRes.rows.map((r) => [r.id, r]));

  return messageRows.map((m) => formatMessageRow(m, {
    currentUserId,
    userMap,
    attachments: attachmentsByMsg.get(m.id) || [],
    reactions: reactionsByMsg.get(m.id) || [],
    reply: m.reply_to ? replyMap.get(m.reply_to) : null,
    meta: m.meta && typeof m.meta === 'object' ? m.meta : null,
    forwardedOrigin: m.forwarded_from ? originMap.get(m.forwarded_from) || null : null,
  }));
}

/** Resolve original messages referenced by forwarded_from. */
export async function fetchForwardedOrigins(forwardedIds) {
  const ids = [...new Set(forwardedIds.filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  const { rows } = await pool.query(
    `SELECT m.id, m.body, m.created_at, m.sender_id,
            u.first_name, u.last_name, u.username
     FROM chat_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.id = ANY($1::uuid[])`,
    [ids]
  );

  const { rows: attRows } = await pool.query(
    `SELECT message_id, file_name, file_url, mime_type
     FROM chat_attachments WHERE message_id = ANY($1::uuid[])`,
    [ids]
  );

  const attByMsg = new Map();
  for (const a of attRows) {
    if (!attByMsg.has(a.message_id)) attByMsg.set(a.message_id, []);
    attByMsg.get(a.message_id).push({
      file_name: a.file_name,
      file_url: a.file_url,
      mime_type: a.mime_type,
    });
  }

  for (const row of rows) {
    const sender = row.sender_id
      ? getDisplayName({
          first_name: row.first_name,
          last_name: row.last_name,
          username: row.username,
        })
      : 'System';
    map.set(row.id, {
      id: row.id,
      sender_name: sender,
      body: row.body || '',
      created_at: row.created_at,
      attachments: attByMsg.get(row.id) || [],
    });
  }
  return map;
}

export async function assertMessageAccess(messageId, userId) {
  const { rows } = await pool.query(
    'SELECT id, channel_id, dm_id, message_type FROM chat_messages WHERE id = $1',
    [messageId]
  );
  const msg = rows[0];
  if (!msg) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }
  if (msg.channel_id) {
    await assertChannelMember(msg.channel_id, userId);
  } else if (msg.dm_id) {
    await assertDmParticipant(msg.dm_id, userId);
  } else {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }
  return msg;
}

export function formatMessageRow(m, { currentUserId, userMap, attachments, reactions, reply, meta, forwardedOrigin }) {
  const sender = m.sender_id ? userMap.get(m.sender_id) : null;
  const role = sender?.main_role || sender?.role || null;

  const reactionGroups = [];
  const byEmoji = new Map();
  for (const r of reactions) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, reacted_by_me: false, user_ids: [] });
    const g = byEmoji.get(r.emoji);
    g.count += 1;
    g.user_ids.push(r.user_id);
    if (r.user_id === currentUserId) g.reacted_by_me = true;
  }
  for (const g of byEmoji.values()) reactionGroups.push(g);

  return {
    id: m.id,
    channel_id: m.channel_id || null,
    dm_id: m.dm_id || null,
    body: m.body,
    sender_id: m.sender_id,
    sender_name: sender ? getDisplayName(sender) : 'System',
    sender_initials: sender ? getInitials(sender.first_name, sender.last_name, sender.username) : 'SYS',
    sender_unit: sender?.unit || null,
    sender_position: sender?.position || null,
    sender_role: role,
    sender_avatar_color: sender ? getAvatarColorClass(sender.id) : 'bg-slate-400',
    sender_avatar_url: sender?.avatar_url || null,
    created_at: m.created_at,
    edited_at: m.edited_at,
    message_type: m.message_type || 'user',
    reply_to: m.reply_to
      ? {
          id: m.reply_to,
          body: reply?.body || '',
          sender_name: reply ? getDisplayName(reply) : 'Unknown',
        }
      : null,
    attachments,
    reactions: reactionGroups,
    meta: meta || null,
    forwarded_from: m.forwarded_from || null,
    forwardedOrigin: forwardedOrigin || null,
  };
}

export async function assertChannelMember(channelId, userId) {
  const { rows } = await pool.query(
    `SELECT cm.role, c.channel_type, c.name
     FROM channel_members cm
     JOIN chat_channels c ON c.id = cm.channel_id
     WHERE cm.channel_id = $1 AND cm.user_id = $2 AND COALESCE(c.is_archived, false) = false`,
    [channelId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Not a member of this channel');
    err.status = 403;
    throw err;
  }
  return rows[0];
}

export async function assertDmParticipant(dmId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM dm_participants WHERE dm_id = $1 AND user_id = $2',
    [dmId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Not a participant in this conversation');
    err.status = 403;
    throw err;
  }
}

export async function markChannelRead(channelId, userId) {
  await pool.query(
    `UPDATE channel_members SET last_read_at = NOW()
     WHERE channel_id = $1 AND user_id = $2`,
    [channelId, userId]
  );
  await markLinkedChatMentionNotificationsRead(userId, 'channel', channelId);
}

export async function markDmRead(dmId, userId) {
  await pool.query(
    `UPDATE dm_participants SET last_read_at = NOW()
     WHERE dm_id = $1 AND user_id = $2`,
    [dmId, userId]
  );
  await markLinkedChatMentionNotificationsRead(userId, 'dm', dmId);
}

async function markLinkedChatMentionNotificationsRead(userId, key, id) {
  if (!userId || !id) return;
  const needle = `%${key}=${id}%`;
  try {
    await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id)
       SELECT n.id, $1
         FROM system_notifications n
        WHERE n.is_active = TRUE
          AND n.notification_type = 'chat_mention'
          AND n.target_user_id = $1
          AND n.link_url LIKE $2
       ON CONFLICT (notification_id, user_id) DO NOTHING`,
      [userId, needle]
    );
  } catch (e) {
    console.warn('[chat] mark linked mention notifications read:', e.message);
  }
}

export async function getChannelMemberIds(channelId, excludeUserId = null) {
  const { rows } = await pool.query(
    `SELECT user_id FROM channel_members WHERE channel_id = $1`,
    [channelId]
  );
  return rows.map((r) => r.user_id).filter((id) => id !== excludeUserId);
}

export async function getDmParticipantIds(dmId, excludeUserId = null) {
  const { rows } = await pool.query(
    `SELECT user_id FROM dm_participants WHERE dm_id = $1`,
    [dmId]
  );
  return rows.map((r) => r.user_id).filter((id) => id !== excludeUserId);
}
