import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import { attachTenant } from '../middleware/tenant.js';
import { isSystemAdminAccount } from '../roles.js';
import { ensureExecutiveSummary, answerExecutiveFollowUp } from '../services/vobiExecSummary.js';

const router = express.Router();
router.use(authenticateToken);
router.use(attachTenant);

const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  keyGenerator: (req, res) => (req.user?.id != null ? `user:${req.user.id}` : ipKeyGenerator(req, res)),
});

function isExecutiveOrAdmin(user) {
  if (isSystemAdminAccount(user)) return true;
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const roles = Array.isArray(user?.roles) ? user.roles.map((r) => String(r || '').toLowerCase()) : [];
  const position = String(user?.position || '').trim().toLowerCase();
  return role === 'director' || role === 'cto' || roles.includes('director') || roles.includes('cto') || position === 'director' || position === 'cto';
}

function requireExecutive(req, res, next) {
  if (!isExecutiveOrAdmin(req.user)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// GET /api/vobi-exec-summary — the standing, pre-generated briefing. Never triggers a fresh
// generation on a normal request (it's kept warm by a background sweep); only a cold-boot
// first call falls back to generating once synchronously.
router.get('/', requireExecutive, async (req, res) => {
  try {
    const { summary, generated_at } = await ensureExecutiveSummary();
    res.json({ success: true, summary, generated_at });
  } catch (error) {
    console.error('GET /api/vobi-exec-summary error:', error.message);
    res.status(500).json({ error: 'Failed to load the executive summary' });
  }
});

// POST /api/vobi-exec-summary/ask — a follow-up question about the briefing, or about a named
// person in the system. Runs on the isolated Live Ops Gemini key pool (vobiFeedGemini.js), not
// the shared pool the regular Vobi chat assistant uses, so the two never compete for quota.
router.post('/ask', requireExecutive, askLimiter, async (req, res) => {
  try {
    const question = String(req.body?.question || req.body?.message || '').trim();
    if (!question) return res.status(400).json({ error: 'question is required' });
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    const viewer = { ...req.user, company: req.company };
    const answer = await answerExecutiveFollowUp(question, history, viewer);
    res.json({ success: true, answer, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('POST /api/vobi-exec-summary/ask error:', error.message);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
  }
});

export default router;
