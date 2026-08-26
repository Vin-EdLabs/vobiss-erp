/**
 * System Admin–only Vobi Chat Vault API.
 * Requires staff JWT + vault unlock token (after access key).
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import { isSystemAdminAccount } from '../roles.js';
import {
  getVaultStatus,
  setupVaultAccessKey,
  unlockVault,
  verifyVaultToken,
  listVaultThreads,
  getVaultThreadMessages,
  getVaultOverviewStats,
} from '../services/vobiVault.js';

const router = express.Router();

const vaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many vault requests. Slow down.' },
});

const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many unlock attempts. Try again later.' },
});

function requireSystemAdmin(req, res, next) {
  if (!isSystemAdminAccount(req.user)) {
    return res.status(403).json({ error: 'Vobi Vault is restricted to System Admin.' });
  }
  return next();
}

function requireVaultUnlock(req, res, next) {
  const header = req.headers['x-vobi-vault-token'] || req.headers['x-vault-token'];
  const bodyToken = req.body?.vaultToken;
  const queryToken = req.query?.vaultToken;
  const token = String(header || bodyToken || queryToken || '').trim();
  if (!verifyVaultToken(token, req.user.id)) {
    return res.status(401).json({ error: 'Vault locked. Enter the access key to continue.', code: 'VAULT_LOCKED' });
  }
  req.vaultToken = token;
  return next();
}

router.use(authenticateToken);
router.use(requireSystemAdmin);
router.use(vaultLimiter);

/** Public to System Admin: is key set? */
router.get('/status', async (req, res) => {
  try {
    const status = await getVaultStatus();
    res.json({ success: true, ...status });
  } catch (e) {
    console.error('[vobi-vault] status:', e);
    res.status(500).json({ error: 'Failed to load vault status' });
  }
});

/** First-time setup — set access key (only when not configured). */
router.post('/setup', unlockLimiter, async (req, res) => {
  try {
    const { accessKey, confirmKey } = req.body || {};
    if (!accessKey || accessKey !== confirmKey) {
      return res.status(400).json({ error: 'Access key and confirmation must match.' });
    }
    const result = await setupVaultAccessKey(accessKey, req.user.id);
    res.status(201).json({
      success: true,
      message: 'Vault access key saved. Keep it safe — it cannot be recovered.',
      vaultToken: result.token,
      expiresIn: result.expiresIn,
    });
  } catch (e) {
    console.error('[vobi-vault] setup:', e);
    res.status(e.status || 500).json({ error: e.message || 'Setup failed' });
  }
});

/** Unlock with access key → vault session token */
router.post('/unlock', unlockLimiter, async (req, res) => {
  try {
    const { accessKey } = req.body || {};
    if (!accessKey) return res.status(400).json({ error: 'Access key is required.' });
    const result = await unlockVault(accessKey, req.user.id);
    res.json({
      success: true,
      vaultToken: result.token,
      expiresIn: result.expiresIn,
    });
  } catch (e) {
    console.error('[vobi-vault] unlock:', e);
    res.status(e.status || 500).json({ error: e.message || 'Unlock failed' });
  }
});

router.get('/stats', requireVaultUnlock, async (req, res) => {
  try {
    const stats = await getVaultOverviewStats();
    res.json({ success: true, stats });
  } catch (e) {
    console.error('[vobi-vault] stats:', e);
    res.status(500).json({ error: 'Failed to load vault stats' });
  }
});

router.get('/threads', requireVaultUnlock, async (req, res) => {
  try {
    const data = await listVaultThreads({
      search: req.query.q || req.query.search || '',
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[vobi-vault] threads:', e);
    res.status(500).json({ error: 'Failed to load Vobi threads' });
  }
});

router.get('/threads/:userId/messages', requireVaultUnlock, async (req, res) => {
  try {
    const data = await getVaultThreadMessages(req.params.userId, {
      limit: req.query.limit,
      before: req.query.before || null,
    });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[vobi-vault] messages:', e);
    res.status(e.status || 500).json({ error: e.message || 'Failed to load messages' });
  }
});

export default router;
