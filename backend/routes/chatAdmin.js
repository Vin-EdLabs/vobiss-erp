import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { isSuperAdmin } from '../roles.js';
import { insertAuditLog } from '../db.js';
import {
  backupChatData,
  clearAllChatData,
  restoreChatData,
} from '../services/chatAdmin.js';

const router = express.Router();
router.use(authenticateToken);

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

router.use(requireSuperAdmin);

// POST /api/chat/admin/backup
router.post('/backup', async (req, res) => {
  try {
    const { developerCode } = req.body || {};
    const backup = await backupChatData(developerCode);
    await insertAuditLog(req.user.id, 'chat_backup', clientIp(req), {
      exported_at: backup.exported_at,
      message_count: backup.tables?.chat_messages?.length ?? 0,
    });
    res.json(backup);
  } catch (e) {
    res.status(e.message === 'Invalid developer code' ? 403 : 500).json({ error: e.message });
  }
});

// POST /api/chat/admin/restore
router.post('/restore', async (req, res) => {
  try {
    const { developerCode, backup } = req.body || {};
    if (!backup) {
      return res.status(400).json({ error: 'Backup data is required' });
    }
    const payload = typeof backup === 'string' ? JSON.parse(backup) : backup;
    const result = await restoreChatData(payload, developerCode);
    await insertAuditLog(req.user.id, 'chat_restore', clientIp(req), {
      message_count: payload.tables?.chat_messages?.length ?? payload.chat_messages?.length ?? 0,
    });
    res.json(result);
  } catch (e) {
    const status =
      e.message === 'Invalid developer code' ? 403 : e.message?.includes('Invalid') ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
});

// POST /api/chat/admin/clear
router.post('/clear', async (req, res) => {
  try {
    const { developerCode } = req.body || {};
    const result = await clearAllChatData(developerCode);
    await insertAuditLog(req.user.id, 'chat_clear_all', clientIp(req), {});
    res.json(result);
  } catch (e) {
    res.status(e.message === 'Invalid developer code' ? 403 : 500).json({ error: e.message });
  }
});

export default router;
