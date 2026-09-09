import express from 'express';
import { authenticateToken, isHrOrExecutive } from '../middleware/auth.js';
import { isSystemAdminAccount } from '../roles.js';
import { globalExecutiveSearch } from '../db/globalSearch.js';

const router = express.Router();

function hasSuperadminRole(user) {
  const slugs = new Set();
  const add = (value) => String(value || '').toLowerCase().split(',').forEach((p) => { const t = p.trim(); if (t) slugs.add(t); });
  add(user?.role);
  add(user?.main_role);
  if (Array.isArray(user?.roles)) user.roles.forEach(add);
  return slugs.has('superadmin');
}

// System Admin always sees everything, no negotiations; HR, Director, and CTO are also
// admitted — no other role.
function requireExecutive(req, res, next) {
  if (isSystemAdminAccount(req.user) || hasSuperadminRole(req.user) || isHrOrExecutive(req.user)) return next();
  return res.status(403).json({ error: 'Global search is not available for your role' });
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
