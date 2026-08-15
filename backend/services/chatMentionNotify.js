/**
 * Notify users when @mentioned in chat (in-app bell, socket, desktop/mobile push).
 */
import pool from '../db.js';
import { createNotification } from '../db.js';
import { emitToUser } from '../realtime/channels.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { truncatePreview } from './chatHelpers.js';
import { sendPushToUserIds } from '../push/sendPush.js';
import { isChannelUnreadCountable } from './chatUnreadPolicy.js';

async function resolveChannelContext(channelId) {
  if (!channelId) return { label: 'Chat', url: '/chat' };
  const { rows } = await pool.query(
    `SELECT id, name, description, record_type, record_id
     FROM chat_channels WHERE id = $1`,
    [channelId]
  );
  const ch = rows[0];
  if (!ch) return { label: 'Chat', url: `/chat?channel=${channelId}` };
  const label = ch.description?.trim() || (ch.record_type ? ch.name : `#${ch.name}`);
  return {
    label,
    url: `/chat?channel=${encodeURIComponent(ch.id)}`,
    recordType: ch.record_type,
  };
}

/**
 * @param {object} opts
 * @param {{ userId: number }[]} opts.mentions
 * @param {number} opts.senderId
 * @param {string} opts.senderName
 * @param {string} [opts.messageBody]
 * @param {string} [opts.messageId]
 * @param {string} [opts.channelId]
 * @param {string} [opts.dmId]
 */
export async function notifyChatMentions({
  mentions,
  senderId,
  senderName,
  messageBody = '',
  messageId,
  channelId,
  dmId,
}) {
  if (!mentions?.length) return;

  const isDm = Boolean(dmId);
  const preview = truncatePreview(messageBody, 140);
  const baseCtx = isDm ? { label: 'Direct message', url: `/chat?dm=${dmId}` } : await resolveChannelContext(channelId);
  const separator = baseCtx.url.includes('?') ? '&' : '?';
  const ctx = {
    ...baseCtx,
    url: messageId ? `${baseCtx.url}${separator}message=${encodeURIComponent(messageId)}` : baseCtx.url,
  };
  const io = getRealtimeIo();
  const bumpUnread = isDm || (channelId ? await isChannelUnreadCountable(pool, channelId) : false);

  for (const mention of mentions) {
    const userId = mention.userId;
    if (!userId || userId === senderId) continue;

    const title = isDm
      ? `${senderName} mentioned you`
      : `${senderName} mentioned you in ${ctx.label}`;
    const message = preview || 'Open the conversation to read the message.';

    try {
      await createNotification(title, message, senderId, {
        targetUserId: userId,
        linkUrl: ctx.url,
        notificationType: 'chat_mention',
      });
    } catch (e) {
      console.warn('[chat] mention in-app notification failed:', e.message);
    }

    const payload = {
      topic: 'notifications',
      action: 'mention',
      messageId,
      channelId: channelId || undefined,
      dmId: dmId || undefined,
      title,
      body: message,
      url: ctx.url,
      forMentionedUser: true,
    };

    emitToUser(userId, 'staff:realtime', payload);

    if (io) {
      io.to(`user:${userId}`).emit('chat:mention', {
        messageId,
        channelId,
        dmId,
        title,
        body: message,
        url: ctx.url,
        senderName,
      });
      if (bumpUnread) {
        io.to(`user:${userId}`).emit('unread_increment', {
          channelId: channelId || null,
          dmId: dmId || null,
          delta: 1,
        });
      }
    }

    try {
      await sendPushToUserIds([userId], {
        title,
        body: message,
        data: {
          url: ctx.url,
          type: 'chat_mention',
          tag: messageId ? `mention-${messageId}-${userId}` : `mention-${Date.now()}`,
        },
      });
    } catch (e) {
      console.warn('[chat] mention push failed:', e.message);
    }
  }
}
