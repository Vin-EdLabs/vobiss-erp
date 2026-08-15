import { insertAuditLog } from '../db.js';

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

export function previewChatText(text, max = 120) {
  return String(text || '')
    .replace(/@\[[^\]]+\]\(\d+\)/g, (m) => {
      const name = m.match(/@\[([^\]]+)\]/)?.[1];
      return name ? `@${name}` : m;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Fire-and-forget chat audit log — never blocks or fails the chat request.
 */
export function logChatAudit(req, action, details = {}) {
  const userId = req.user?.id;
  if (!userId) return;

  insertAuditLog(userId, action, clientIp(req), {
    module: 'chat',
    ...details,
  }).catch((err) => {
    console.warn('[chat-audit] skipped:', err.message);
  });
}
