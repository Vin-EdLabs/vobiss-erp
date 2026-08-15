import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { globalExecutiveSearch } from '../db/globalSearch.js';

const router = express.Router();

const EXEC_ROLES = new Set(['director', 'cto', 'superadmin']);

function collectRoles(user) {
  const roles = new Set();
  const add = (value) => {
    String(value || '')
      .toLowerCase()
      .split(',')
      .forEach((part) => {
        const t = part.trim();
        if (t) roles.add(t);
      });
  };
  add(user?.main_role);
  add(user?.role);
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((r) => add(r));
  }
  return roles;
}

function requireExecutive(req, res, next) {
  const roles = collectRoles(req.user);
  const allowed = [...roles].some((r) => EXEC_ROLES.has(r));
  if (!allowed) {
    return res.status(403).json({ error: 'Executive search is not available for your role' });
  }
  next();
}

router.use(authenticateToken, requireExecutive);

/** GET /api/search/global?q= */
router.get('/global', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 1) {
      return res.json({ success: true, results: [], query: q });
    }
    const results = await globalExecutiveSearch(q);
    res.json({ success: true, results, query: q });
  } catch (e) {
    console.error('[global-search]', e);
    res.status(500).json({ error: e.message || 'Search failed' });
  }
});

export default router;
