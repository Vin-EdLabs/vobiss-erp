import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool, { createNotification, getUserById } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { formatPersonName } from '../utils/displayName.js';
import { logUserAction } from '../services/activityLog.js';
import { getRealtimeIo } from '../realtime/channels.js';
import {
  assertChannelMember,
  assertDmParticipant,
  getChannelMemberIds,
  getDmParticipantIds,
  hydrateMessages,
} from '../services/chatHelpers.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const router = express.Router();

const VALID_EXPIRY = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, never: null };

function expiresAtFor(expiry) {
  const hours = VALID_EXPIRY[expiry];
  return hours === null ? null : new Date(Date.now() + hours * 3600_000);
}

// In-memory per-token rate limiter for the public view endpoint (100 views/hour/token).
const viewHits = new Map();
function viewRateLimit(req, res, next) {
  const token = req.params.token;
  const now = Date.now();
  const recent = (viewHits.get(token) || []).filter((at) => now - at < 3600_000);
  if (recent.length >= 100) {
    return res.status(429).json({ error: 'This shared link has reached its hourly view limit. Please try again later.' });
  }
  recent.push(now);
  viewHits.set(token, recent);
  next();
}

// Attaches req.user if a valid token is present, but never rejects the request.
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (!err && decoded) {
      try {
        const dbUser = await getUserById(decoded.id || decoded.userId);
        req.user = dbUser
          ? { ...decoded, ...dbUser, id: dbUser.id, full_name: formatPersonName(dbUser, dbUser.username) }
          : decoded;
      } catch {
        req.user = decoded;
      }
    }
    next();
  });
}

function buildUrl(req, token) {
  const envBase = process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.VITE_APP_URL || '';
  const base = envBase ? envBase.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;
  return `${base}/shared/${token}`;
}

function serializeLink(row, req) {
  let preview = null;
  if (row.record_preview) {
    try { preview = JSON.parse(row.record_preview); } catch { preview = null; }
  }
  const expired = !!(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());
  const status = row.revoked ? 'revoked' : expired ? 'expired' : 'active';
  return {
    id: row.id,
    token: row.token,
    recordType: row.record_type,
    recordId: row.record_id,
    pagePath: row.page_path,
    pageTitle: row.page_title,
    recordPreview: preview,
    visibility: row.visibility,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    expiresAt: row.expires_at,
    revoked: row.revoked,
    viewCount: row.view_count,
    createdAt: row.created_at,
    status,
    url: buildUrl(req, row.token),
  };
}

// POST /api/shared-links/generate
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { recordType, recordId, pagePath, pageTitle, recordPreview, visibility = 'private', expiry = '7d' } = req.body || {};
    const numericRecordId = Number(recordId);
    if (!recordType || !String(recordType).trim()) return res.status(400).json({ error: 'recordType is required.' });
    if (!Number.isInteger(numericRecordId)) return res.status(400).json({ error: 'A valid recordId is required.' });
    if (!pagePath || !String(pagePath).startsWith('/')) return res.status(400).json({ error: 'A valid pagePath is required.' });
    if (!['public', 'private'].includes(visibility)) return res.status(400).json({ error: 'visibility must be public or private.' });
    if (!(expiry in VALID_EXPIRY)) return res.status(400).json({ error: 'Invalid expiry choice.' });

    const token = crypto.randomBytes(32).toString('base64url');
    const createdByName = formatPersonName(req.user, req.user?.username);

    const created = await pool.query(
      `INSERT INTO shared_links
         (token, record_type, record_id, page_path, page_title, record_preview, visibility, created_by_user_id, created_by_name, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        token,
        String(recordType).trim(),
        numericRecordId,
        String(pagePath),
        pageTitle ? String(pageTitle) : null,
        recordPreview ? JSON.stringify(recordPreview) : null,
        visibility,
        req.user.id,
        createdByName,
        expiresAtFor(expiry),
      ]
    );
    const link = serializeLink(created.rows[0], req);

    await logUserAction(req.user, {
      actionType: 'share_link_generated',
      recordType,
      recordId: numericRecordId,
      description: `${createdByName} generated a ${visibility} share link for ${pageTitle || `${recordType} #${recordId}`}`,
    });

    res.status(201).json({ token: link.token, url: link.url, link });
  } catch (error) {
    console.error('Error generating share link:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to generate share link.' });
  }
});

// GET /api/shared-links/view/:token
router.get('/view/:token', viewRateLimit, optionalAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shared_links WHERE token = $1', [req.params.token]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Link not found.', reason: 'not_found' });
    if (row.revoked) return res.status(410).json({ error: 'This link is no longer available.', reason: 'revoked' });
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'This link has expired. Please contact the sender for a new link.', reason: 'expired' });
    }
    if (row.visibility === 'private' && !req.user) {
      return res.status(401).json({ error: 'This is a private shared record. Please log in to view it.', reason: 'login_required' });
    }

    await pool.query('UPDATE shared_links SET view_count = view_count + 1 WHERE id = $1', [row.id]);
    row.view_count = Number(row.view_count) + 1;

    res.json({ link: serializeLink(row, req) });
  } catch (error) {
    console.error('Error viewing share link:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load shared link.' });
  }
});

// GET /api/shared-links/my-links
router.get('/my-links', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM shared_links WHERE created_by_user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ links: result.rows.map((row) => serializeLink(row, req)) });
  } catch (error) {
    console.error('Error listing share links:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load your share links.' });
  }
});

// PATCH /api/shared-links/revoke/:token
router.patch('/revoke/:token', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE shared_links SET revoked = TRUE WHERE token = $1 AND created_by_user_id = $2 RETURNING *',
      [req.params.token, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Share link not found.' });
    const link = serializeLink(result.rows[0], req);

    await logUserAction(req.user, {
      actionType: 'share_link_revoked',
      recordType: link.recordType,
      recordId: link.recordId,
      description: `${formatPersonName(req.user, req.user.username)} revoked a share link for ${link.pageTitle || `${link.recordType} #${link.recordId}`}`,
    });

    res.json({ link });
  } catch (error) {
    console.error('Error revoking share link:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to revoke share link.' });
  }
});

// PATCH /api/shared-links/extend/:token — change the expiry of an existing link.
router.patch('/extend/:token', authenticateToken, async (req, res) => {
  try {
    const { expiry } = req.body || {};
    if (!(expiry in VALID_EXPIRY)) return res.status(400).json({ error: 'Invalid expiry choice.' });
    const result = await pool.query(
      'UPDATE shared_links SET expires_at = $1, revoked = FALSE WHERE token = $2 AND created_by_user_id = $3 RETURNING *',
      [expiresAtFor(expiry), req.params.token, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Share link not found.' });
    res.json({ link: serializeLink(result.rows[0], req) });
  } catch (error) {
    console.error('Error extending share link:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to extend share link.' });
  }
});

// POST /api/shared-links/share-to-chat
router.post('/share-to-chat', authenticateToken, async (req, res) => {
  try {
    const {
      recordType,
      recordId,
      pagePath,
      pageTitle,
      recordPreview,
      destinationType,
      destinationId,
      destinationName,
    } = req.body || {};

    if (!recordType || recordId === undefined || recordId === null) {
      return res.status(400).json({ error: 'recordType and recordId are required.' });
    }
    if (!pagePath || !String(pagePath).startsWith('/')) return res.status(400).json({ error: 'A valid pagePath is required.' });
    if (!['channel', 'dm'].includes(destinationType) || !destinationId) {
      return res.status(400).json({ error: 'A valid chat destination is required.' });
    }

    const senderId = req.user.id;
    const senderName = formatPersonName(req.user, req.user.username);

    let memberIds;
    if (destinationType === 'channel') {
      await assertChannelMember(destinationId, senderId);
      memberIds = await getChannelMemberIds(destinationId, senderId);
    } else {
      await assertDmParticipant(destinationId, senderId);
      memberIds = await getDmParticipantIds(destinationId, senderId);
    }

    const notifyLabel = pageTitle || `${recordType} #${recordId}`;
    const meta = {
      relatedType: recordType,
      relatedId: recordId,
      linkUrl: pagePath,
      linkLabel: 'View in System',
      sharedRecord: {
        recordType,
        recordId,
        pagePath,
        pageTitle: pageTitle || null,
        recordPreview: recordPreview || null,
        sharedByName: senderName,
      },
    };

    const insertResult = await pool.query(
      `INSERT INTO chat_messages (channel_id, dm_id, sender_id, body, message_type, meta)
       VALUES ($1, $2, $3, $4, 'shared_record', $5::jsonb)
       RETURNING *`,
      [
        destinationType === 'channel' ? destinationId : null,
        destinationType === 'dm' ? destinationId : null,
        senderId,
        `${senderName} shared ${notifyLabel}`,
        JSON.stringify(meta),
      ]
    );
    const [message] = await hydrateMessages(insertResult.rows, senderId);

    const io = getRealtimeIo();
    const room = destinationType === 'channel' ? `channel:${destinationId}` : `dm:${destinationId}`;
    if (io) {
      io.to(room).emit('new_message', message);
      for (const uid of memberIds) {
        io.to(`user:${uid}`).emit('unread_increment', {
          channelId: destinationType === 'channel' ? destinationId : null,
          dmId: destinationType === 'dm' ? destinationId : null,
          delta: 1,
        });
      }
    }

    for (const uid of memberIds) {
      await createNotification(
        'Record shared with you',
        `${senderName} shared ${String(recordType).replace(/_/g, ' ')} — ${notifyLabel} with you`,
        senderId,
        { targetUserId: uid, linkUrl: pagePath, notificationType: 'shared_record' }
      );
    }

    await logUserAction(req.user, {
      actionType: 'share_to_chat',
      recordType,
      recordId: Number.isInteger(Number(recordId)) ? Number(recordId) : null,
      description: `${senderName} shared ${notifyLabel} to ${destinationName || 'chat'}`,
    });

    res.status(201).json({ message, chatName: destinationName || null });
  } catch (error) {
    console.error('Error sharing to chat:', error.stack);
    res.status(error.status || 500).json({ error: error.message || 'Failed to share to chat.' });
  }
});

export default router;
