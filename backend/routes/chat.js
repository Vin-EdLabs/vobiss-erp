import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import { notifyChatMentions } from '../services/chatMentionNotify.js';
import { getRealtimeIo } from '../realtime/channels.js';
import {
  assertChannelMember,
  assertDmParticipant,
  formatUserChatBadge,
  getAvatarColorClass,
  getDisplayName,
  getInitials,
  hydrateMessages,
  markChannelRead,
  markDmRead,
  parseMentions,
  truncatePreview,
  getChannelMemberIds,
  getDmParticipantIds,
  assertMessageAccess,
} from '../services/chatHelpers.js';
import { slugifyUnit } from '../services/chatInit.js';
import { canManageUnitGroups, isSuperAdmin, parseUserUnitsArray } from '../roles.js';
import { getSystemRole } from '../permissions.js';
import { logChatAudit, previewChatText } from '../services/chatAudit.js';
import {
  COUNTABLE_CHANNEL_SQL,
  isChannelUnreadCountable,
} from '../services/chatUnreadPolicy.js';
import { sendPushToUserIds } from '../push/sendPush.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Lives under archive-storage (the File Storage feature's own directory, confirmed working in
// production) rather than backend/uploads/chat — see backend/server.js's /chat-uploads static
// route for why. Served at the matching /chat-uploads public path, not /uploads.
const chatUploadsDir = path.join(__dirname, '../archive-storage/chat');
if (!fs.existsSync(chatUploadsDir)) {
  fs.mkdirSync(chatUploadsDir, { recursive: true });
}

// Phone photos (HEIC/HEIF in particular) are frequently handed to us by the browser with an
// empty or generic mimetype ('', 'application/octet-stream') instead of 'image/...' — the OS
// file picker still filtered by extension correctly, multer just never sees that. Falling back
// to the extension keeps those uploads working instead of failing silently on mimetype alone.
const MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'avif',
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp',
  'mp3', 'wav', 'm4a', 'aac', 'ogg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, chatUploadsDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `chat-${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mimeOk =
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/pdf';
    const ext = path.extname(file.originalname || '').slice(1).toLowerCase();
    const ok = mimeOk || MEDIA_EXTENSIONS.has(ext);
    cb(ok ? null : new Error('That file type is not supported here'), ok);
  },
});

const router = express.Router();
router.use(authenticateToken);
router.use(invalidateOnMutation);

async function ensurePinTableReady() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_pins (
      message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
      channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
      dm_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
      pinned_by INTEGER NOT NULL,
      pinned_at TIMESTAMP DEFAULT NOW(),
      CHECK (
        (channel_id IS NOT NULL AND dm_id IS NULL) OR
        (dm_id IS NOT NULL AND channel_id IS NULL)
      )
    )
  `);
}

async function pinMessageForUser({ messageId, channelId, dmId, userId }) {
  await ensurePinTableReady();

  const { rows } = await pool.query(
    'SELECT id, channel_id, dm_id FROM chat_messages WHERE id = $1',
    [messageId]
  );
  const msg = rows[0];
  if (!msg) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  if (channelId) {
    await assertChannelMember(channelId, userId);
    if (msg.channel_id !== channelId) {
      const err = new Error('Message not found in this channel');
      err.status = 404;
      throw err;
    }
    await pool.query(
      `INSERT INTO message_pins (message_id, channel_id, pinned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id) DO NOTHING`,
      [messageId, channelId, userId]
    );
    return { channelId, dmId: null };
  }

  if (dmId) {
    await assertDmParticipant(dmId, userId);
    if (msg.dm_id !== dmId) {
      const err = new Error('Message not found in this conversation');
      err.status = 404;
      throw err;
    }
    await pool.query(
      `INSERT INTO message_pins (message_id, dm_id, pinned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id) DO NOTHING`,
      [messageId, dmId, userId]
    );
    return { channelId: null, dmId };
  }

  const err = new Error('channelId or dmId is required');
  err.status = 400;
  throw err;
}

async function unpinMessageForUser({ messageId, channelId, dmId, userId }) {
  await ensurePinTableReady();

  if (channelId) {
    await assertChannelMember(channelId, userId);
    await pool.query(
      'DELETE FROM message_pins WHERE message_id = $1 AND channel_id = $2',
      [messageId, channelId]
    );
    return { channelId, dmId: null };
  }

  if (dmId) {
    await assertDmParticipant(dmId, userId);
    await pool.query(
      'DELETE FROM message_pins WHERE message_id = $1 AND dm_id = $2',
      [messageId, dmId]
    );
    return { channelId: null, dmId };
  }

  const err = new Error('channelId or dmId is required');
  err.status = 400;
  throw err;
}

async function ensureMessageDeletionTableReady() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_message_deletions (
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      deleted_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chat_message_deletions_user
    ON chat_message_deletions(user_id, deleted_at DESC)
  `);
}

async function hideMessageForUser(messageId, userId) {
  await ensureMessageDeletionTableReady();
  await pool.query('DELETE FROM chat_bookmarks WHERE message_id = $1 AND user_id = $2', [messageId, userId]);
  await pool.query(
    `INSERT INTO chat_message_deletions (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_id)
     DO UPDATE SET deleted_at = NOW()`,
    [messageId, userId]
  );
}

async function isMessageHiddenForUser(messageId, userId) {
  await ensureMessageDeletionTableReady();
  const { rows } = await pool.query(
    'SELECT 1 FROM chat_message_deletions WHERE message_id = $1 AND user_id = $2',
    [messageId, userId]
  );
  return !!rows[0];
}

async function toggleMessageReaction(messageId, userId, emoji) {
  const existing = await pool.query(
    'SELECT 1 FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
    [messageId, userId, emoji]
  );
  if (existing.rowCount > 0) {
    await pool.query(
      'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji]
    );
  } else {
    await pool.query(
      'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
      [messageId, userId, emoji]
    );
  }
  const reactions = await pool.query(
    'SELECT emoji, user_id FROM message_reactions WHERE message_id = $1',
    [messageId]
  );
  const groups = [];
  const map = new Map();
  for (const r of reactions.rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, { emoji: r.emoji, count: 0, reacted_by_me: false, user_ids: [] });
    const g = map.get(r.emoji);
    g.count += 1;
    g.user_ids.push(r.user_id);
    if (r.user_id === userId) g.reacted_by_me = true;
  }
  for (const g of map.values()) groups.push(g);
  return groups;
}

async function notifyUnread(io, { channelId, dmId, senderId, memberIds }) {
  if (!io) return;
  if (channelId && !(await isChannelUnreadCountable(pool, channelId))) return;
  for (const uid of memberIds) {
    if (uid === senderId) continue;
    io.to(`user:${uid}`).emit('unread_increment', { channelId, dmId, delta: 1 });
  }
}

async function notifyMessagePush({ userIds, senderName, body, channelId, dmId, channelLabel, messageId, type }) {
  const recipients = [...new Set((userIds || []).filter(Boolean))];
  if (!recipients.length) return;
  const isDm = Boolean(dmId);
  const isAnnouncement = type === 'announcement';
  const title = isAnnouncement
    ? `Announcement from ${senderName}`
    : isDm
      ? `${senderName} sent you a message`
      : `${senderName} in ${channelLabel || 'Chat'}`;
  const preview = truncatePreview(body || 'Attachment', 140);
  const messageParam = messageId ? `&message=${encodeURIComponent(messageId)}` : '';
  const url = isDm
    ? `/chat?dm=${encodeURIComponent(dmId)}${messageParam}`
    : `/chat?channel=${encodeURIComponent(channelId)}${messageParam}`;

  try {
    await sendPushToUserIds(recipients, {
      title,
      body: preview,
      data: {
        url,
        type: isAnnouncement ? 'announcement' : 'chat_message',
        messageId,
        channelId: channelId || undefined,
        dmId: dmId || undefined,
        requireInteraction: isAnnouncement ? '1' : undefined,
        tag: messageId ? `chat-${messageId}` : `chat-${Date.now()}`,
      },
    });
  } catch (e) {
    console.warn('[chat] message push failed:', e.message);
  }
}

function actorCanManageGroups(user) {
  if (!user) return false;
  if (canManageUnitGroups(user)) return true;
  const sys = getSystemRole(user);
  return sys === 'admin' || sys === 'superadmin' || sys === 'system_admin';
}

async function loadDbUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, username, first_name, last_name, role, main_role, roles, units, unit, position
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const user = rows[0];
  if (!user) return null;
  let roles = user.roles;
  if (typeof roles === 'string') {
    try {
      roles = JSON.parse(roles);
    } catch {
      roles = [];
    }
  }
  return {
    ...user,
    main_role: user.main_role || user.role,
    roles: Array.isArray(roles) && roles.length ? roles : [user.role],
    units: parseUserUnitsArray(user.units),
  };
}

async function assertCanManageUnitGroup(channelId, userId, reqUser) {
  const { rows } = await pool.query(
    `SELECT c.created_by, c.channel_type, cm.role
     FROM chat_channels c
     JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $2
     WHERE c.id = $1 AND COALESCE(c.is_archived, false) = false`,
    [channelId, userId]
  );
  if (!rows[0]) {
    const err = new Error('Channel not found or access denied');
    err.status = 403;
    throw err;
  }
  if (rows[0].channel_type !== 'unit') {
    const err = new Error('Only unit groups support member management');
    err.status = 400;
    throw err;
  }
  if (actorCanManageGroups((await loadDbUser(userId)) || reqUser)) return rows[0];
  if (rows[0].role === 'admin' || rows[0].created_by === userId) return rows[0];
  const err = new Error('Only group admins or managers can manage members');
  err.status = 403;
  throw err;
}

async function canPostToChannel(channelId, userId, userRole) {
  const membership = await assertChannelMember(channelId, userId);
  if (membership.channel_type !== 'announcements') return true;
  if (membership.role === 'admin') return true;
  if (['superadmin', 'director', 'cto'].includes(userRole)) return true;
  const err = new Error('Only admins can post in #announcements');
  err.status = 403;
  throw err;
}

async function insertMessageWithAttachments({
  channelId,
  dmId,
  senderId,
  body,
  replyTo,
  files,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO chat_messages (channel_id, dm_id, sender_id, body, reply_to, message_type)
       VALUES ($1, $2, $3, $4, $5, 'user')
       RETURNING *`,
      [channelId || null, dmId || null, senderId, body, replyTo || null]
    );
    const message = rows[0];

    const attachments = [];
    for (const file of files || []) {
      const url = `/chat-uploads/${file.filename}`;
      const ins = await client.query(
        `INSERT INTO chat_attachments (message_id, file_name, file_url, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [message.id, file.originalname, url, file.size, file.mimetype]
      );
      attachments.push(ins.rows[0]);
    }

    const mentions = parseMentions(body);
    for (const m of mentions) {
      await client.query(
        `INSERT INTO message_mentions (message_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [message.id, m.userId]
      );
    }

    await client.query('COMMIT');
    return { message, attachments, mentions };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// POST /api/chat/messages/:messageId/pin — primary pin endpoint
router.post('/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { channelId, dmId } = req.body || {};
    const target = await pinMessageForUser({ messageId, channelId, dmId, userId });

    const io = getRealtimeIo();
    if (io) {
      if (target.channelId) io.to(`channel:${target.channelId}`).emit('pin_update', target);
      if (target.dmId) io.to(`dm:${target.dmId}`).emit('pin_update', target);
    }

    res.json({ ok: true, messageId });
    logChatAudit(req, 'chat_pin_message', {
      message_id: messageId,
      channel_id: target.channelId || undefined,
      dm_id: target.dmId || undefined,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/messages/:messageId/pin?channelId=|dmId=
router.delete('/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const channelId = req.query.channelId || null;
    const dmId = req.query.dmId || null;
    const target = await unpinMessageForUser({ messageId, channelId, dmId, userId });

    const io = getRealtimeIo();
    if (io) {
      if (target.channelId) io.to(`channel:${target.channelId}`).emit('pin_update', target);
      if (target.dmId) io.to(`dm:${target.dmId}`).emit('pin_update', target);
    }

    res.json({ ok: true, messageId });
    logChatAudit(req, 'chat_unpin_message', {
      message_id: messageId,
      channel_id: target.channelId || undefined,
      dm_id: target.dmId || undefined,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// PATCH /api/chat/messages/:messageId — edit own message within 15 minutes
router.patch('/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { channelId, dmId, body } = req.body || {};
    const newBody = String(body || '').trim();

    if (!newBody) return res.status(400).json({ error: 'Message body is required' });
    if (!channelId && !dmId) return res.status(400).json({ error: 'channelId or dmId is required' });

    const { rows } = await pool.query(
      'SELECT id, sender_id, channel_id, dm_id, created_at, message_type, body FROM chat_messages WHERE id = $1',
      [messageId]
    );
    const msg = rows[0];
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const previousBody = msg.body;
    if (msg.sender_id !== userId) return res.status(403).json({ error: 'You can only edit your own messages' });
    if (msg.message_type !== 'user') return res.status(400).json({ error: 'This message cannot be edited' });

    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (ageMs > 15 * 60 * 1000) {
      return res.status(403).json({ error: 'Messages can only be edited within 15 minutes of sending' });
    }

    if (channelId) {
      await assertChannelMember(channelId, userId);
      if (msg.channel_id !== channelId) return res.status(404).json({ error: 'Message not found in this channel' });
    } else {
      await assertDmParticipant(dmId, userId);
      if (msg.dm_id !== dmId) return res.status(404).json({ error: 'Message not found in this conversation' });
    }

    const { rows: updated } = await pool.query(
      `UPDATE chat_messages SET body = $1, edited_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [newBody, messageId]
    );

    const [full] = await hydrateMessages(updated, userId);
    const io = getRealtimeIo();
    if (io) {
      if (channelId) io.to(`channel:${channelId}`).emit('message_edit', full);
      if (dmId) io.to(`dm:${dmId}`).emit('message_edit', full);
    }

    res.json(full);
    logChatAudit(req, 'chat_edit_message', {
      message_id: messageId,
      channel_id: channelId || undefined,
      dm_id: dmId || undefined,
      before: previewChatText(previousBody),
      after: previewChatText(newBody),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/messages/:messageId
// - Own user messages under 24h are deleted for everyone.
// - Own user messages after 24h are hidden only for the sender.
// - Any accessible message from someone else is hidden only for the current user.
router.delete('/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { channelId, dmId } = req.body || {};

    if (!channelId && !dmId) return res.status(400).json({ error: 'channelId or dmId is required' });

    const { rows } = await pool.query(
      'SELECT id, sender_id, channel_id, dm_id, created_at, message_type FROM chat_messages WHERE id = $1',
      [messageId]
    );
    const msg = rows[0];
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    if (channelId) {
      await assertChannelMember(channelId, userId);
      if (msg.channel_id !== channelId) return res.status(404).json({ error: 'Message not found in this channel' });
    } else {
      await assertDmParticipant(dmId, userId);
      if (msg.dm_id !== dmId) return res.status(404).json({ error: 'Message not found in this conversation' });
    }

    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    const canDeleteForEveryone =
      msg.sender_id === userId &&
      msg.message_type === 'user' &&
      ageMs <= 24 * 60 * 60 * 1000;

    const io = getRealtimeIo();

    if (canDeleteForEveryone) {
      await ensureMessageDeletionTableReady();
      const participants = channelId
        ? await getChannelMemberIds(channelId, userId)
        : await getDmParticipantIds(dmId, userId);
      const userIds = [...new Set([userId, ...participants])];
      await pool.query('DELETE FROM chat_bookmarks WHERE message_id = $1 AND user_id = ANY($2::int[])', [
        messageId,
        userIds,
      ]);
      await pool.query(
        `INSERT INTO chat_message_deletions (message_id, user_id)
         SELECT $1, UNNEST($2::int[])
         ON CONFLICT (message_id, user_id)
         DO UPDATE SET deleted_at = NOW()`,
        [messageId, userIds]
      );
      if (io) {
        if (channelId) io.to(`channel:${channelId}`).emit('message_delete', { messageId, channelId, scope: 'everyone' });
        if (dmId) io.to(`dm:${dmId}`).emit('message_delete', { messageId, dmId, scope: 'everyone' });
      }
      res.json({ ok: true, messageId, scope: 'everyone' });
      logChatAudit(req, 'chat_delete_message_everyone', {
        message_id: messageId,
        channel_id: channelId || undefined,
        dm_id: dmId || undefined,
      });
      return;
    }

    await hideMessageForUser(messageId, userId);
    if (io) {
      io.to(`user:${userId}`).emit('message_delete', {
        messageId,
        channelId: channelId || undefined,
        dmId: dmId || undefined,
        scope: 'self',
      });
    }
    res.json({ ok: true, messageId, scope: 'self' });
    logChatAudit(req, 'chat_delete_message_self', {
      message_id: messageId,
      channel_id: channelId || undefined,
      dm_id: dmId || undefined,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/channels/:channelId/messages — "Clear chat" for the current user only.
// Reuses the same chat_message_deletions "hide for me" mechanism as deleting a single message
// someone else sent, just applied to every message in the channel at once — every other member
// keeps their own copy untouched, and the channel list preview naturally goes blank for this
// user too, since it already filters through the same table.
router.delete('/channels/:channelId/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    await assertChannelMember(channelId, userId);
    await ensureMessageDeletionTableReady();

    await pool.query(
      `DELETE FROM chat_bookmarks WHERE user_id = $1
       AND message_id IN (SELECT id FROM chat_messages WHERE channel_id = $2)`,
      [userId, channelId]
    );
    await pool.query(
      `INSERT INTO chat_message_deletions (message_id, user_id)
       SELECT id, $2 FROM chat_messages WHERE channel_id = $1
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [channelId, userId]
    );

    const io = getRealtimeIo();
    if (io) io.to(`user:${userId}`).emit('chat_cleared', { channelId });

    res.json({ ok: true });
    logChatAudit(req, 'chat_clear_all_self', { channel_id: channelId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/dms/:dmId/messages — same "Clear chat" behavior for a direct message.
router.delete('/dms/:dmId/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId } = req.params;
    await assertDmParticipant(dmId, userId);
    await ensureMessageDeletionTableReady();

    await pool.query(
      `DELETE FROM chat_bookmarks WHERE user_id = $1
       AND message_id IN (SELECT id FROM chat_messages WHERE dm_id = $2)`,
      [userId, dmId]
    );
    await pool.query(
      `INSERT INTO chat_message_deletions (message_id, user_id)
       SELECT id, $2 FROM chat_messages WHERE dm_id = $1
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [dmId, userId]
    );

    const io = getRealtimeIo();
    if (io) io.to(`user:${userId}`).emit('chat_cleared', { dmId });

    res.json({ ok: true });
    logChatAudit(req, 'chat_clear_all_self', { dm_id: dmId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// GET /api/chat/messages/:messageId
router.get('/messages/:messageId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await assertMessageAccess(messageId, userId);
    if (await isMessageHiddenForUser(messageId, userId)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const { rows } = await pool.query('SELECT * FROM chat_messages WHERE id = $1', [messageId]);
    if (!rows[0]) return res.status(404).json({ error: 'Message not found' });

    const [full] = await hydrateMessages(rows, userId);
    res.json(full);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/messages/:messageId/thread — the root message plus every reply to it, in
// chronological order. Replies always live in the same channel/DM as their root, so access to
// the root implies access to the whole thread.
router.get('/messages/:messageId/thread', async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId } = req.params;

    await assertMessageAccess(messageId, userId);
    if (await isMessageHiddenForUser(messageId, userId)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const { rows: rootRows } = await pool.query('SELECT * FROM chat_messages WHERE id = $1', [messageId]);
    if (!rootRows[0]) return res.status(404).json({ error: 'Message not found' });

    const { rows: replyRows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       WHERE m.reply_to = $1
         AND m.message_type = 'user'
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d WHERE d.message_id = m.id AND d.user_id = $2
         )
       ORDER BY m.created_at ASC`,
      [messageId, userId]
    );

    const [root, ...replies] = await hydrateMessages([...rootRows, ...replyRows], userId);
    res.json({ root, replies });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/messages/:messageId/forward
router.post('/messages/:messageId/forward', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { messageId } = req.params;
    const { destinations, note } = req.body || {};

    if (!Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({ error: 'destinations must be a non-empty array' });
    }
    if (destinations.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 destinations per forward' });
    }

    await assertMessageAccess(messageId, userId);
    if (await isMessageHiddenForUser(messageId, userId)) {
      return res.status(404).json({ error: 'Message not found' });
    }
    const { rows: origCheck } = await pool.query(
      'SELECT message_type FROM chat_messages WHERE id = $1',
      [messageId]
    );
    if (origCheck[0]?.message_type === 'system') {
      return res.status(400).json({ error: 'System messages cannot be forwarded' });
    }

    const noteText = String(note || '').trim().slice(0, 500);

    const normalized = [];
    for (const dest of destinations) {
      const type = dest?.type;
      const id = dest?.id;
      if (type !== 'channel' && type !== 'dm') {
        return res.status(400).json({ error: 'Each destination must have type channel or dm' });
      }
      if (!isUuid(id)) {
        return res.status(400).json({ error: 'Invalid destination id' });
      }
      if (type === 'channel') {
        await assertChannelMember(id, userId);
      } else {
        await assertDmParticipant(id, userId);
      }
      normalized.push({ type, id });
    }

    await client.query('BEGIN');

    const insertedRows = [];
    for (const dest of normalized) {
      const channelId = dest.type === 'channel' ? dest.id : null;
      const dmId = dest.type === 'dm' ? dest.id : null;
      const { rows } = await client.query(
        `INSERT INTO chat_messages (channel_id, dm_id, sender_id, body, message_type, forwarded_from, reply_to)
         VALUES ($1, $2, $3, $4, 'user', $5, NULL)
         RETURNING *`,
        [channelId, dmId, userId, noteText, messageId]
      );
      insertedRows.push({ destination: dest, message: rows[0] });
    }

    await client.query('COMMIT');

    const io = getRealtimeIo();
    const forwarded = [];

    for (const { destination, message } of insertedRows) {
      const [full] = await hydrateMessages([message], userId);
      forwarded.push({ destinationId: destination.id, messageId: message.id });

      if (io) {
        if (destination.type === 'channel') {
          io.to(`channel:${destination.id}`).emit('new_message', full);
          const memberIds = await getChannelMemberIds(destination.id);
          await notifyUnread(io, {
            channelId: destination.id,
            dmId: null,
            senderId: userId,
            memberIds,
          });
        } else {
          io.to(`dm:${destination.id}`).emit('new_message', full);
          const memberIds = await getDmParticipantIds(destination.id);
          await notifyUnread(io, {
            channelId: null,
            dmId: destination.id,
            senderId: userId,
            memberIds,
          });
        }
      }
    }

    res.status(201).json({ success: true, forwarded });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

function formatBookmarkTimestamp(iso) {
  return iso instanceof Date ? iso.toISOString() : iso;
}

function mapBookmarkRows(rows, userId) {
  return rows.map((r) => {
    const isChannel = !!r.channel_id;
    const sourceId = isChannel ? r.channel_id : r.dm_id;
    const sourceType = isChannel ? 'channel' : 'dm';
    let sourceName = r.channel_name || r.dm_other_name || 'Conversation';
    if (isChannel && r.channel_name && !String(r.channel_name).startsWith('#')) {
      sourceName = r.channel_name;
    }
    const deepLink = isChannel
      ? `/chat?channel=${encodeURIComponent(sourceId)}`
      : `/chat?dm=${encodeURIComponent(sourceId)}`;

    const attachments = [];
    if (r.att_file_name) {
      attachments.push({
        file_name: r.att_file_name,
        file_url: r.att_file_url,
        mime_type: r.att_mime_type,
      });
    }

    return {
      bookmark_id: r.bookmark_id,
      bookmarked_at: formatBookmarkTimestamp(r.bookmarked_at),
      message: {
        id: r.message_id,
        body: r.body || '',
        message_type: r.message_type || 'user',
        created_at: formatBookmarkTimestamp(r.message_created_at),
        sender_name:
          r.message_type === 'system'
            ? null
            : getDisplayName({
                first_name: r.first_name,
                last_name: r.last_name,
                username: r.username,
              }),
        forwarded_from: r.forwarded_from || null,
        attachments,
        source: {
          type: sourceType,
          id: sourceId,
          name: sourceName,
          record_type: r.record_type || null,
          deep_link: deepLink,
        },
      },
    };
  });
}

// GET /api/chat/bookmarks
router.get('/bookmarks', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT b.id AS bookmark_id,
              b.created_at AS bookmarked_at,
              m.id AS message_id,
              m.body,
              m.message_type,
              m.created_at AS message_created_at,
              m.forwarded_from,
              m.channel_id,
              m.dm_id,
              u.first_name,
              u.last_name,
              u.username,
              c.name AS channel_name,
              c.record_type,
              (
                SELECT u2.first_name FROM dm_participants dp2
                JOIN users u2 ON u2.id = dp2.user_id
                WHERE dp2.dm_id = m.dm_id AND dp2.user_id <> $1
                LIMIT 1
              ) AS dm_other_first,
              (
                SELECT u2.last_name FROM dm_participants dp2
                JOIN users u2 ON u2.id = dp2.user_id
                WHERE dp2.dm_id = m.dm_id AND dp2.user_id <> $1
                LIMIT 1
              ) AS dm_other_last,
              (
                SELECT u2.username FROM dm_participants dp2
                JOIN users u2 ON u2.id = dp2.user_id
                WHERE dp2.dm_id = m.dm_id AND dp2.user_id <> $1
                LIMIT 1
              ) AS dm_other_username,
              att.file_name AS att_file_name,
              att.file_url AS att_file_url,
              att.mime_type AS att_mime_type
       FROM chat_bookmarks b
       JOIN chat_messages m ON m.id = b.message_id
       LEFT JOIN users u ON u.id = m.sender_id
       LEFT JOIN chat_channels c ON c.id = m.channel_id
       LEFT JOIN LATERAL (
         SELECT file_name, file_url, mime_type
         FROM chat_attachments
         WHERE message_id = m.id
         ORDER BY created_at ASC
         LIMIT 1
       ) att ON true
       WHERE b.user_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $1
         )
         AND (
           (m.channel_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM channel_members cm
             WHERE cm.channel_id = m.channel_id AND cm.user_id = $1
           ))
           OR (m.dm_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM dm_participants dp
             WHERE dp.dm_id = m.dm_id AND dp.user_id = $1
           ))
         )
       ORDER BY b.created_at DESC`,
      [userId]
    );

    const withDmNames = rows.map((r) => ({
      ...r,
      dm_other_name: r.dm_id
        ? getDisplayName({
            first_name: r.dm_other_first,
            last_name: r.dm_other_last,
            username: r.dm_other_username,
          })
        : null,
    }));

    res.json(mapBookmarkRows(withDmNames, userId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/bookmarks/check?message_ids=
router.get('/bookmarks/check', async (req, res) => {
  try {
    const userId = req.user.id;
    const raw = String(req.query.message_ids || '').trim();
    if (!raw) return res.json({ bookmarked: [] });

    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => isUuid(s))
      .slice(0, 50);

    if (!ids.length) return res.json({ bookmarked: [] });

    const { rows } = await pool.query(
      `SELECT message_id::text FROM chat_bookmarks
       WHERE user_id = $1 AND message_id = ANY($2::uuid[])`,
      [userId, ids]
    );

    res.json({ bookmarked: rows.map((r) => r.message_id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/bookmarks
router.post('/bookmarks', async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.body?.message_id;

    if (!isUuid(messageId)) {
      return res.status(400).json({ error: 'message_id must be a valid UUID' });
    }

    await assertMessageAccess(messageId, userId);

    const existing = await pool.query(
      `SELECT id, created_at FROM chat_bookmarks
       WHERE user_id = $1 AND message_id = $2`,
      [userId, messageId]
    );

    if (existing.rows[0]) {
      return res.json({
        bookmark_id: existing.rows[0].id,
        message_id: messageId,
        bookmarked_at: formatBookmarkTimestamp(existing.rows[0].created_at),
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO chat_bookmarks (user_id, message_id)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [userId, messageId]
    );

    res.status(201).json({
      bookmark_id: rows[0].id,
      message_id: messageId,
      bookmarked_at: formatBookmarkTimestamp(rows[0].created_at),
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/bookmarks/:bookmarkId
router.delete('/bookmarks/:bookmarkId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { bookmarkId } = req.params;

    if (!isUuid(bookmarkId)) {
      return res.status(400).json({ error: 'Invalid bookmark id' });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM chat_bookmarks WHERE id = $1 AND user_id = $2`,
      [bookmarkId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/unread-total', async (req, res) => {
  try {
    const userId = req.user.id;
    const channelUnread = await pool.query(
      `SELECT COALESCE(SUM(cnt), 0)::int AS total FROM (
         SELECT COUNT(*)::int AS cnt
         FROM chat_messages cm
         JOIN channel_members mem ON mem.channel_id = cm.channel_id
         JOIN chat_channels ch ON ch.id = cm.channel_id
         WHERE mem.user_id = $1
           AND cm.channel_id IS NOT NULL
           AND cm.created_at > mem.last_read_at
           AND (cm.sender_id IS NULL OR cm.sender_id <> $1)
           AND NOT EXISTS (
             SELECT 1 FROM chat_message_deletions d
             WHERE d.message_id = cm.id AND d.user_id = $1
           )
           AND ${COUNTABLE_CHANNEL_SQL}
         GROUP BY cm.channel_id
       ) s`,
      [userId]
    );
    const dmUnread = await pool.query(
      `SELECT COALESCE(SUM(cnt), 0)::int AS total FROM (
         SELECT COUNT(*)::int AS cnt
         FROM chat_messages cm
         JOIN dm_participants dp ON dp.dm_id = cm.dm_id
         WHERE dp.user_id = $1
           AND cm.dm_id IS NOT NULL
           AND cm.created_at > dp.last_read_at
           AND cm.sender_id <> $1
           AND NOT EXISTS (
             SELECT 1 FROM chat_message_deletions d
             WHERE d.message_id = cm.id AND d.user_id = $1
           )
         GROUP BY cm.dm_id
       ) s`,
      [userId]
    );
    const total = (channelUnread.rows[0]?.total || 0) + (dmUnread.rows[0]?.total || 0);
    res.json({ total, count: total });
  } catch (e) {
    console.error('Error fetching chat unread total:', e.stack || e.message);
    res.json({ total: 0, count: 0 });
  }
});

// GET /api/chat/channels
router.get('/channels', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.channel_type, c.record_type, c.record_id,
              (
                CASE
                  WHEN c.channel_type = 'category' THEN 0
                  WHEN c.channel_type = 'unit' AND c.record_type IS NULL THEN 0
                  ELSE (
                    SELECT COUNT(*)::int FROM chat_messages cm
                    WHERE cm.channel_id = c.id
                      AND cm.created_at > mem.last_read_at
                      AND (cm.sender_id IS NULL OR cm.sender_id <> $1)
                      AND NOT EXISTS (
                        SELECT 1 FROM chat_message_deletions d
                        WHERE d.message_id = cm.id AND d.user_id = $1
                      )
                  )
                END
              ) AS unread_count,
              (
                SELECT cm.body FROM chat_messages cm
                WHERE cm.channel_id = c.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions d
                    WHERE d.message_id = cm.id AND d.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_body,
              (
                SELECT cm.created_at FROM chat_messages cm
                WHERE cm.channel_id = c.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions d
                    WHERE d.message_id = cm.id AND d.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_at,
              (
                SELECT u.first_name FROM chat_messages cm
                LEFT JOIN users u ON u.id = cm.sender_id
                WHERE cm.channel_id = c.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions d
                    WHERE d.message_id = cm.id AND d.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_first,
              (
                SELECT u.last_name FROM chat_messages cm
                LEFT JOIN users u ON u.id = cm.sender_id
                WHERE cm.channel_id = c.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions d
                    WHERE d.message_id = cm.id AND d.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_last,
              (
                SELECT cm.message_type FROM chat_messages cm
                WHERE cm.channel_id = c.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions d
                    WHERE d.message_id = cm.id AND d.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_type,
              (
                SELECT COUNT(*)::int FROM channel_members WHERE channel_id = c.id
              ) AS member_count
       FROM chat_channels c
       JOIN channel_members mem ON mem.channel_id = c.id
       WHERE mem.user_id = $1 AND COALESCE(c.is_archived, false) = false
       ORDER BY
         CASE c.channel_type
           WHEN 'announcements' THEN 0
           WHEN 'general' THEN 1
           WHEN 'category' THEN 2
           WHEN 'unit' THEN 3
           WHEN 'group_dm' THEN 4
           ELSE 5
         END,
         c.name`,
      [userId]
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.record_type ? (r.description || r.name) : r.name,
        slug: r.name,
        description: r.description,
        channel_type: r.channel_type,
        record_type: r.record_type || null,
        record_id: r.record_id || null,
        unread_count: r.unread_count,
        member_count: r.member_count,
        last_message: r.last_body
          ? {
              body: truncatePreview(r.last_body),
              sender_name: r.last_type === 'system' ? 'System' : getDisplayName({ first_name: r.last_first, last_name: r.last_last }),
              created_at: r.last_at,
            }
          : null,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/channels/:channelId/messages
router.get('/channels/:channelId/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const before = req.query.before || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    await assertChannelMember(channelId, userId);

    const { rows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       WHERE m.channel_id = $1
         AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz)
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $4
         )
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [channelId, before, limit, userId]
    );

    await markChannelRead(channelId, userId);
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages: messages.reverse() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/channels/:channelId/messages
router.post('/channels/:channelId/messages', upload.array('files', 5), async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const body = (req.body.body || '').trim();
    const replyTo = req.body.reply_to || null;

    if (!body && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Message body or attachment required' });
    }

    const membership = await assertChannelMember(channelId, userId);
    await canPostToChannel(channelId, userId, req.user.role || req.user.main_role);

    const { message, mentions } = await insertMessageWithAttachments({
      channelId,
      dmId: null,
      senderId: userId,
      body: body || '',
      replyTo,
      files: req.files,
    });

    const [full] = await hydrateMessages([message], userId);
    const memberIds = await getChannelMemberIds(channelId, userId);
    const io = getRealtimeIo();
    if (io) {
      io.to(`channel:${channelId}`).emit('new_message', full);
      await notifyUnread(io, { channelId, dmId: null, senderId: userId, memberIds });
    }

    const senderRes = await pool.query(
      'SELECT first_name, last_name, username FROM users WHERE id = $1',
      [userId]
    );
    const senderName = getDisplayName(senderRes.rows[0]);
    const mentionUserIds = new Set((mentions || []).map((m) => m.userId).filter(Boolean));
    await notifyMessagePush({
      userIds: memberIds.filter((id) => !mentionUserIds.has(id)),
      senderName,
      body,
      channelId,
      dmId: null,
      channelLabel: membership.name ? `#${membership.name}` : 'Chat',
      messageId: message.id,
      type: membership.channel_type,
    });
    await notifyChatMentions({
      mentions,
      senderId: userId,
      senderName,
      messageBody: body,
      messageId: message.id,
      channelId,
    });

    res.status(201).json(full);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/channels/:channelId/messages/:messageId/react
router.post('/channels/:channelId/messages/:messageId/react', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId, messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    await assertChannelMember(channelId, userId);

    const groups = await toggleMessageReaction(messageId, userId, emoji);

    const io = getRealtimeIo();
    if (io) {
      io.to(`channel:${channelId}`).emit('reaction_update', { messageId, reactions: groups });
    }

    res.json({ messageId, reactions: groups });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/dms/:dmId/messages/:messageId/react
router.post('/dms/:dmId/messages/:messageId/react', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId, messageId } = req.params;
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    await assertDmParticipant(dmId, userId);

    const msgCheck = await pool.query(
      'SELECT id FROM chat_messages WHERE id = $1 AND dm_id = $2',
      [messageId, dmId]
    );
    if (!msgCheck.rows[0]) return res.status(404).json({ error: 'Message not found' });

    const groups = await toggleMessageReaction(messageId, userId, emoji);

    const io = getRealtimeIo();
    if (io) {
      io.to(`dm:${dmId}`).emit('reaction_update', { messageId, reactions: groups });
    }

    res.json({ messageId, reactions: groups });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/channels/:channelId/read
router.post('/channels/:channelId/read', async (req, res) => {
  try {
    await assertChannelMember(req.params.channelId, req.user.id);
    await markChannelRead(req.params.channelId, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/dms/:dmId/read
router.post('/dms/:dmId/read', async (req, res) => {
  try {
    await assertDmParticipant(req.params.dmId, req.user.id);
    await markDmRead(req.params.dmId, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/channels/:channelId/members
router.get('/channels/:channelId/members', async (req, res) => {
  try {
    await assertChannelMember(req.params.channelId, req.user.id);
    const { rows } = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.username, u.role, u.main_role, u.unit, u.position, u.avatar_url,
              u.chat_status_text, u.chat_status_emoji, cm.role AS channel_role
       FROM channel_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.channel_id = $1 AND u.deleted_at IS NULL
       ORDER BY u.first_name, u.last_name`,
      [req.params.channelId]
    );
    res.json(
      rows.map((u) => ({
        id: u.id,
        name: getDisplayName(u),
        initials: getInitials(u.first_name, u.last_name, u.username),
        unit: u.unit,
        role: formatUserChatBadge(u),
        channel_role: u.channel_role,
        avatar_color: getAvatarColorClass(u.id),
        avatar_url: u.avatar_url || null,
        status_text: u.chat_status_text || null,
        status_emoji: u.chat_status_emoji || null,
      }))
    );
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/dms
router.get('/dms', async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT d.id AS dm_id,
              (
                SELECT COUNT(*)::int FROM chat_messages cm
                WHERE cm.dm_id = d.id
                  AND cm.created_at > dp.last_read_at
                  AND cm.sender_id <> $1
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions del
                    WHERE del.message_id = cm.id AND del.user_id = $1
                  )
              ) AS unread_count,
              (
                SELECT cm.body FROM chat_messages cm
                WHERE cm.dm_id = d.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions del
                    WHERE del.message_id = cm.id AND del.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_body,
              (
                SELECT cm.created_at FROM chat_messages cm
                WHERE cm.dm_id = d.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions del
                    WHERE del.message_id = cm.id AND del.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_at,
              (
                SELECT u.first_name FROM chat_messages cm
                JOIN users u ON u.id = cm.sender_id
                WHERE cm.dm_id = d.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions del
                    WHERE del.message_id = cm.id AND del.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_first,
              (
                SELECT u.last_name FROM chat_messages cm
                JOIN users u ON u.id = cm.sender_id
                WHERE cm.dm_id = d.id
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_message_deletions del
                    WHERE del.message_id = cm.id AND del.user_id = $1
                  )
                ORDER BY cm.created_at DESC LIMIT 1
              ) AS last_last
       FROM dm_conversations d
       JOIN dm_participants dp ON dp.dm_id = d.id
       WHERE dp.user_id = $1
       ORDER BY COALESCE(
         (
           SELECT MAX(created_at) FROM chat_messages cm
           WHERE cm.dm_id = d.id
             AND NOT EXISTS (
               SELECT 1 FROM chat_message_deletions del
               WHERE del.message_id = cm.id AND del.user_id = $1
             )
         ),
         d.created_at
       ) DESC`,
      [userId]
    );

    const result = [];
    for (const r of rows) {
      const other = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.username, u.role, u.main_role, u.unit, u.position, u.avatar_url,
                u.chat_status_text, u.chat_status_emoji
         FROM dm_participants dp
         JOIN users u ON u.id = dp.user_id
         WHERE dp.dm_id = $1 AND dp.user_id <> $2`,
        [r.dm_id, userId]
      );
      const o = other.rows[0];
      result.push({
        id: r.dm_id,
        unread_count: r.unread_count,
        other_user: o
          ? {
              id: o.id,
              name: getDisplayName(o),
              initials: getInitials(o.first_name, o.last_name, o.username),
              unit: o.unit,
              role: formatUserChatBadge(o),
              avatar_color: getAvatarColorClass(o.id),
              avatar_url: o.avatar_url || null,
              status_text: o.chat_status_text || null,
              status_emoji: o.chat_status_emoji || null,
            }
          : null,
        last_message: r.last_body
          ? {
              body: truncatePreview(r.last_body),
              sender_name: getDisplayName({ first_name: r.last_first, last_name: r.last_last }),
              created_at: r.last_at,
            }
          : null,
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat/dms
router.post('/dms', async (req, res) => {
  try {
    const userId = req.user.id;
    const targetUserId = parseInt(req.body.targetUserId, 10);
    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ error: 'Valid targetUserId required' });
    }

    const existing = await pool.query(
      `SELECT d.id FROM dm_conversations d
       JOIN dm_participants p1 ON p1.dm_id = d.id AND p1.user_id = $1
       JOIN dm_participants p2 ON p2.dm_id = d.id AND p2.user_id = $2
       LIMIT 1`,
      [userId, targetUserId]
    );
    if (existing.rows[0]) {
      return res.json({ dmId: existing.rows[0].id });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dm = await client.query('INSERT INTO dm_conversations DEFAULT VALUES RETURNING id');
      const dmId = dm.rows[0].id;
      await client.query(
        'INSERT INTO dm_participants (dm_id, user_id) VALUES ($1, $2), ($1, $3)',
        [dmId, userId, targetUserId]
      );
      await client.query('COMMIT');
      const io = getRealtimeIo();
      if (io) {
        io.to(`user:${userId}`).emit('chat:join_dm', { dmId });
        io.to(`user:${targetUserId}`).emit('chat:join_dm', { dmId });
      }
      res.status(201).json({ dmId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/chat/dms/:dmId/messages
router.get('/dms/:dmId/messages', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId } = req.params;
    const before = req.query.before || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);

    await assertDmParticipant(dmId, userId);

    const { rows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       WHERE m.dm_id = $1
         AND ($2::timestamptz IS NULL OR m.created_at < $2::timestamptz)
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $4
         )
       ORDER BY m.created_at DESC
       LIMIT $3`,
      [dmId, before, limit, userId]
    );

    await markDmRead(dmId, userId);
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages: messages.reverse() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/dms/:dmId/messages
router.post('/dms/:dmId/messages', upload.array('files', 5), async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId } = req.params;
    const body = (req.body.body || '').trim();
    const replyTo = req.body.reply_to || null;

    if (!body && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ error: 'Message body or attachment required' });
    }

    await assertDmParticipant(dmId, userId);

    const { message, mentions } = await insertMessageWithAttachments({
      channelId: null,
      dmId,
      senderId: userId,
      body: body || '',
      replyTo,
      files: req.files,
    });

    const [full] = await hydrateMessages([message], userId);
    const memberIds = await getDmParticipantIds(dmId, userId);
    const io = getRealtimeIo();
    if (io) {
      io.to(`dm:${dmId}`).emit('new_message', full);
      await notifyUnread(io, { channelId: null, dmId, senderId: userId, memberIds });
    }

    const senderRes = await pool.query(
      'SELECT first_name, last_name, username FROM users WHERE id = $1',
      [userId]
    );
    const senderName = getDisplayName(senderRes.rows[0]);
    const mentionUserIds = new Set((mentions || []).map((m) => m.userId).filter(Boolean));
    await notifyMessagePush({
      userIds: memberIds.filter((id) => !mentionUserIds.has(id)),
      senderName,
      body,
      channelId: null,
      dmId,
      channelLabel: 'Direct message',
      messageId: message.id,
      type: 'dm',
    });
    await notifyChatMentions({
      mentions,
      senderId: userId,
      senderName,
      messageBody: body,
      messageId: message.id,
      dmId,
    });

    res.status(201).json(full);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/groups — create a private unit group with selected members
router.post('/groups', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const actor = (await loadDbUser(userId)) || req.user;
    if (!actorCanManageGroups(actor)) {
      return res.status(403).json({
        error: 'Only Admin, HR, and manager roles can create unit groups',
      });
    }
    const { name, description, memberIds = [] } = req.body;
    const trimmed = String(name || '').trim().slice(0, 100);
    if (!trimmed) return res.status(400).json({ error: 'Group name is required' });

    const slug = slugifyUnit(trimmed) || `group-${Date.now()}`;
    const dup = await client.query(
      `SELECT id FROM chat_channels
       WHERE COALESCE(is_archived, false) = false
         AND (LOWER(name) = LOWER($1) OR LOWER(name) = LOWER($2))`,
      [trimmed, slug]
    );
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: 'A group with this name already exists' });
    }

    const ids = [...new Set([userId, ...memberIds.map((id) => parseInt(id, 10)).filter(Boolean)])];

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO chat_channels (name, description, channel_type, created_by)
       VALUES ($1, $2, 'unit', $3)
       RETURNING id, name, description, channel_type, created_at`,
      [trimmed, description?.trim() || `${trimmed} group`, userId]
    );
    const channel = rows[0];

    for (const uid of ids) {
      await client.query(
        `INSERT INTO channel_members (channel_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [channel.id, uid, uid === userId ? 'admin' : 'member']
      );
    }
    await client.query('COMMIT');

    const io = getRealtimeIo();
    if (io) {
      for (const uid of ids) {
        io.to(`user:${uid}`).emit('chat:join_channel', { channelId: channel.id });
        io.to(`user:${uid}`).emit('chat:group_created', { channelId: channel.id, name: channel.name });
      }
    }

    res.status(201).json({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      channel_type: 'unit',
      member_count: ids.length,
      unread_count: 0,
      last_message: null,
    });
    logChatAudit(req, 'chat_create_group', {
      channel_id: channel.id,
      channel_name: channel.name,
      member_count: ids.length,
      member_ids: ids,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[chat] create group failed:', e);
    res.status(e.status || 500).json({ error: e.message || 'Failed to create group' });
  } finally {
    client.release();
  }
});

// POST /api/chat/group-dms — ad-hoc group chat, open to any user (unlike /groups, which is
// admin/HR/manager-only for org-wide unit groups). Auto-named from participants unless a name
// is given; needs at least 2 other people (3 total) or it's just a regular DM.
router.post('/group-dms', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const memberIds = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.map((id) => parseInt(id, 10)).filter(Boolean)
      : [];
    const ids = [...new Set([userId, ...memberIds])];
    if (ids.length < 3) {
      return res.status(400).json({ error: 'Select at least 2 other people to start a group chat' });
    }

    const otherIds = ids.filter((id) => id !== userId);
    const namesRes = await client.query(
      `SELECT first_name, last_name, username FROM users WHERE id = ANY($1::int[])`,
      [otherIds]
    );
    const names = namesRes.rows.map((r) => getDisplayName(r));
    const requestedName = String(req.body.name || '').trim().slice(0, 100);
    const autoName = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
    const finalName = requestedName || autoName || 'Group chat';

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO chat_channels (name, description, channel_type, created_by)
       VALUES ($1, $2, 'group_dm', $3)
       RETURNING id, name, description, channel_type, created_at`,
      [finalName, finalName, userId]
    );
    const channel = rows[0];

    for (const uid of ids) {
      await client.query(
        `INSERT INTO channel_members (channel_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [channel.id, uid, uid === userId ? 'admin' : 'member']
      );
    }
    await client.query('COMMIT');

    const io = getRealtimeIo();
    if (io) {
      for (const uid of ids) {
        io.to(`user:${uid}`).emit('chat:join_channel', { channelId: channel.id });
        io.to(`user:${uid}`).emit('chat:group_created', { channelId: channel.id, name: channel.name });
      }
    }

    res.status(201).json({
      id: channel.id,
      channelId: channel.id,
      name: channel.name,
      description: channel.description,
      channel_type: 'group_dm',
      member_count: ids.length,
      unread_count: 0,
      last_message: null,
    });
    logChatAudit(req, 'chat_create_group_dm', {
      channel_id: channel.id,
      channel_name: channel.name,
      member_count: ids.length,
      member_ids: ids,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('[chat] create group dm failed:', e);
    res.status(e.status || 500).json({ error: e.message || 'Failed to create group chat' });
  } finally {
    client.release();
  }
});

// POST /api/chat/channels/:channelId/members — add members to a unit group
router.post('/channels/:channelId/members', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const { userIds = [] } = req.body;

    await assertCanManageUnitGroup(channelId, userId, req.user);

    const ids = [...new Set(userIds.map((id) => parseInt(id, 10)).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'userIds required' });

    for (const uid of ids) {
      await pool.query(
        `INSERT INTO channel_members (channel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (channel_id, user_id) DO NOTHING`,
        [channelId, uid]
      );
    }

    const io = getRealtimeIo();
    if (io) {
      for (const uid of ids) {
        io.to(`user:${uid}`).emit('chat:join_channel', { channelId });
        io.to(`user:${uid}`).emit('chat:added_to_group', { channelId });
      }
    }

    res.json({ ok: true, added: ids.length });
    logChatAudit(req, 'chat_add_members', {
      channel_id: channelId,
      added_user_ids: ids,
      added_count: ids.length,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/channels/:channelId/members/:userId — superadmin removes a member
router.delete('/channels/:channelId/members/:userId', async (req, res) => {
  try {
    if (!actorCanManageGroups((await loadDbUser(req.user.id)) || req.user) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only Admin can remove members from groups' });
    }
    const { channelId } = req.params;
    const targetUserId = parseInt(req.params.userId, 10);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });

    const channel = await pool.query(
      `SELECT id, channel_type, name FROM chat_channels
       WHERE id = $1 AND COALESCE(is_archived, false) = false`,
      [channelId]
    );
    if (!channel.rows[0]) return res.status(404).json({ error: 'Channel not found' });
    if (channel.rows[0].channel_type !== 'unit') {
      return res.status(400).json({ error: 'Members can only be removed from unit groups' });
    }

    await pool.query(
      'DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2',
      [channelId, targetUserId]
    );

    const io = getRealtimeIo();
    if (io) {
      io.to(`user:${targetUserId}`).emit('chat:removed_from_group', { channelId });
    }

    res.json({ ok: true });
    logChatAudit(req, 'chat_remove_member', {
      channel_id: channelId,
      channel_name: channel.rows[0].name,
      removed_user_id: targetUserId,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/channels/:channelId/pins
router.get('/channels/:channelId/pins', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    await assertChannelMember(channelId, userId);
    await ensurePinTableReady();

    const { rows } = await pool.query(
      `SELECT m.* FROM message_pins p
       JOIN chat_messages m ON m.id = p.message_id
       WHERE p.channel_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $2
         )
       ORDER BY p.pinned_at DESC`,
      [channelId, userId]
    );
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/dms/:dmId/pins
router.get('/dms/:dmId/pins', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId } = req.params;
    await assertDmParticipant(dmId, userId);
    await ensurePinTableReady();

    const { rows } = await pool.query(
      `SELECT m.* FROM message_pins p
       JOIN chat_messages m ON m.id = p.message_id
       WHERE p.dm_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $2
         )
       ORDER BY p.pinned_at DESC`,
      [dmId, userId]
    );
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/search?q= — cross-channel/cross-DM search over every channel and DM the
// caller is a member of, not just the one currently open (Teams-style global search).
router.get('/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ messages: [] });

    const { rows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       LEFT JOIN chat_channels c ON c.id = m.channel_id
       WHERE m.message_type = 'user'
         AND (
           (m.channel_id IS NOT NULL AND COALESCE(c.is_archived, false) = false
             AND EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = m.channel_id AND cm.user_id = $2))
           OR (m.dm_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM dm_participants dp WHERE dp.dm_id = m.dm_id AND dp.user_id = $2))
         )
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $2
         )
         AND (
           m.body ILIKE $1
           OR regexp_replace(m.body, '@\\[([^\\]]+)\\]\\([0-9]+\\)', '@\\1', 'g') ILIKE $1
           OR EXISTS (
             SELECT 1 FROM chat_attachments a
             WHERE a.message_id = m.id AND a.file_name ILIKE $1
           )
         )
       ORDER BY m.created_at DESC
       LIMIT 60`,
      [`%${q}%`, userId]
    );
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/channels/:channelId/search?q=
router.get('/channels/:channelId/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId } = req.params;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ messages: [] });

    await assertChannelMember(channelId, userId);

    const { rows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       WHERE m.channel_id = $1
         AND m.message_type = 'user'
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $3
         )
         AND (
           m.body ILIKE $2
           OR regexp_replace(m.body, '@\\[([^\\]]+)\\]\\([0-9]+\\)', '@\\1', 'g') ILIKE $2
           OR EXISTS (
             SELECT 1 FROM chat_attachments a
             WHERE a.message_id = m.id AND a.file_name ILIKE $2
           )
         )
       ORDER BY m.created_at DESC
       LIMIT 40`,
      [channelId, `%${q}%`, userId]
    );
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/dms/:dmId/search?q=
router.get('/dms/:dmId/search', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId } = req.params;
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ messages: [] });

    await assertDmParticipant(dmId, userId);

    const { rows } = await pool.query(
      `SELECT m.* FROM chat_messages m
       WHERE m.dm_id = $1
         AND m.message_type = 'user'
         AND NOT EXISTS (
           SELECT 1 FROM chat_message_deletions d
           WHERE d.message_id = m.id AND d.user_id = $3
         )
         AND (
           m.body ILIKE $2
           OR regexp_replace(m.body, '@\\[([^\\]]+)\\]\\([0-9]+\\)', '@\\1', 'g') ILIKE $2
           OR EXISTS (
             SELECT 1 FROM chat_attachments a
             WHERE a.message_id = m.id AND a.file_name ILIKE $2
           )
         )
       ORDER BY m.created_at DESC
       LIMIT 40`,
      [dmId, `%${q}%`, userId]
    );
    const messages = await hydrateMessages(rows, userId);
    res.json({ messages });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/channels/:channelId/messages/:messageId/pin
router.post('/channels/:channelId/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId, messageId } = req.params;
    const target = await pinMessageForUser({ messageId, channelId, dmId: null, userId });

    const io = getRealtimeIo();
    if (io) io.to(`channel:${channelId}`).emit('pin_update', target);

    res.json({ ok: true, messageId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/channels/:channelId/messages/:messageId/pin
router.delete('/channels/:channelId/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { channelId, messageId } = req.params;
    const target = await unpinMessageForUser({ messageId, channelId, dmId: null, userId });

    const io = getRealtimeIo();
    if (io) io.to(`channel:${channelId}`).emit('pin_update', target);

    res.json({ ok: true, messageId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/chat/dms/:dmId/messages/:messageId/pin
router.post('/dms/:dmId/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId, messageId } = req.params;
    const target = await pinMessageForUser({ messageId, channelId: null, dmId, userId });

    const io = getRealtimeIo();
    if (io) io.to(`dm:${dmId}`).emit('pin_update', target);

    res.json({ ok: true, messageId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// DELETE /api/chat/dms/:dmId/messages/:messageId/pin
router.delete('/dms/:dmId/messages/:messageId/pin', async (req, res) => {
  try {
    const userId = req.user.id;
    const { dmId, messageId } = req.params;
    const target = await unpinMessageForUser({ messageId, channelId: null, dmId, userId });

    const io = getRealtimeIo();
    if (io) io.to(`dm:${dmId}`).emit('pin_update', target);

    res.json({ ok: true, messageId });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Legacy duplicate handlers below removed — see pinMessageForUser above

// PATCH /api/chat/me/status — set or clear the caller's custom status text/emoji.
router.patch('/me/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const statusText = String(req.body.status_text || '').trim().slice(0, 100) || null;
    const statusEmoji = String(req.body.status_emoji || '').trim().slice(0, 8) || null;

    await pool.query(
      `UPDATE users SET chat_status_text = $1, chat_status_emoji = $2 WHERE id = $3`,
      [statusText, statusEmoji, userId]
    );

    const io = getRealtimeIo();
    if (io) {
      io.emit('user_status_update', { userId, status_text: statusText, status_emoji: statusEmoji });
    }

    res.json({ status_text: statusText, status_emoji: statusEmoji });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /api/chat/users
router.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, username, role, main_role, unit, position, avatar_url,
              chat_status_text, chat_status_emoji
       FROM users WHERE deleted_at IS NULL
       ORDER BY first_name, last_name`
    );

    const { getOnlineUserIds } = await import('../realtime/chatSocket.js');
    const onlineSet = getOnlineUserIds();

    res.json(
      rows.map((u) => ({
        id: u.id,
        name: getDisplayName(u),
        initials: getInitials(u.first_name, u.last_name, u.username),
        unit: u.unit,
        role: formatUserChatBadge(u),
        avatar_color: getAvatarColorClass(u.id),
        is_online: onlineSet.has(u.id),
        avatar_url: u.avatar_url || null,
        status_text: u.chat_status_text || null,
        status_emoji: u.chat_status_emoji || null,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Multer (upload.array) reports failures — oversized file, rejected type, disk write error —
// by calling next(err) *before* any route handler's own try/catch runs, so without this they
// fall through to Express's default handler, which sends an HTML error page instead of JSON.
// The frontend's chatFetch expects JSON on every response; against an HTML body its
// res.json() parse fails and the real reason (e.g. "file too large") never reaches the user.
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (max 200MB).' : err.message;
    return res.status(status).json({ error: message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
  res.status(500).json({ error: 'Unexpected error' });
});

export default router;
