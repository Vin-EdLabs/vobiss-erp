import express from 'express';
import { authenticateToken, isHrOrExecutive } from '../middleware/auth.js';
import { isSystemAdminAccount } from '../roles.js';
import {
  getSiteOverview,
  getSiteStats,
  getModuleActivity,
  getSiteTimeline,
  listModuleKeys,
} from '../services/siteActivity.js';

const router = express.Router();

function hasSuperadminRole(user) {
  const slugs = new Set();
  const add = (value) => String(value || '').toLowerCase().split(',').forEach((p) => { const t = p.trim(); if (t) slugs.add(t); });
  add(user?.role);
  add(user?.main_role);
  if (Array.isArray(user?.roles)) user.roles.forEach(add);
  return slugs.has('superadmin');
}

// Same audience as Global Search — Site 360 is reached from it, so access must match exactly.
function requireSiteAccess(req, res, next) {
  if (isSystemAdminAccount(req.user) || hasSuperadminRole(req.user) || isHrOrExecutive(req.user)) return next();
  return res.status(403).json({ error: 'Site 360 is not available for your role' });
}

router.use(authenticateToken, requireSiteAccess);

function parsePaging(req) {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  return { limit, offset };
}

router.get('/:siteId/overview', async (req, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    const overview = await getSiteOverview(siteId);
    if (!overview) return res.status(404).json({ error: 'Site not found' });
    res.json({ success: true, site: overview, modules: listModuleKeys(req.user) });
  } catch (e) {
    console.error('[site360] overview:', e);
    res.status(500).json({ error: e.message || 'Failed to load site' });
  }
});

router.get('/:siteId/stats', async (req, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    const stats = await getSiteStats(siteId, req.user);
    res.json({ success: true, stats });
  } catch (e) {
    console.error('[site360] stats:', e);
    res.status(500).json({ error: e.message || 'Failed to load stats' });
  }
});

router.get('/:siteId/activity', async (req, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    const moduleKey = String(req.query.module || '').trim();
    if (!moduleKey) return res.status(400).json({ error: 'module is required' });
    const { limit, offset } = parsePaging(req);
    const result = await getModuleActivity(siteId, req.user, moduleKey, { limit, offset });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[site360] activity:', e);
    res.status(500).json({ error: e.message || 'Failed to load activity' });
  }
});

router.get('/:siteId/timeline', async (req, res) => {
  try {
    const siteId = parseInt(req.params.siteId, 10);
    if (!Number.isFinite(siteId)) return res.status(400).json({ error: 'Invalid site id' });
    const { limit, offset } = parsePaging(req);
    const result = await getSiteTimeline(siteId, req.user, { limit, offset });
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[site360] timeline:', e);
    res.status(500).json({ error: e.message || 'Failed to load timeline' });
  }
});

export default router;
