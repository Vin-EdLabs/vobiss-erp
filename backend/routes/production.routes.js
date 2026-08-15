import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import {
  initProductionTables,
  getProductionUnits,
  createProductionUnit,
  updateProductionUnit,
  getProductionUnitBySlug,
  getProductionDashboardStats,
  listProductionRequests,
  createProductionRequest,
  getProductionRequestById,
  canViewRequestV2,
  canViewFullPipeline,
  addProductionRemark,
  addProductionAttachment,
  tsAcceptRequest,
  tsRejectRequest,
  ipForwardRequest,
  ipUpdateRequest,
  nocApproveRequest,
  projectCompleteRequest,
} from '../db/production.js';
import pool from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const prodUploadsDir = path.join(__dirname, '..', 'uploads', 'production');
if (!fs.existsSync(prodUploadsDir)) {
  fs.mkdirSync(prodUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, prodUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'prod-' + unique + path.extname(file.originalname || ''));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

function parseUserUnits(user) {
  let units = user.units || [];
  if (typeof units === 'string') {
    try {
      units = JSON.parse(units);
    } catch {
      units = [];
    }
  }
  if (!Array.isArray(units)) return [];
  return units
    .map((u) => (typeof u === 'string' ? u : u?.slug || u?.unit_stage || ''))
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
}

function isSuperAdmin(user) {
  const role = String(user.main_role || user.role || '').toLowerCase();
  return role === 'superadmin' || role === 'admin';
}

function requireSuperAdmin(req, res, next) {
  if (!isSuperAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function loadFullUser(req) {
  const { rows } = await pool.query(
    'SELECT id, username, first_name, last_name, role, main_role, units FROM users WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return null;
  u.units = parseUserUnits(u);
  return u;
}

router.use(authenticateToken);

// Init tables on first request (idempotent)
let tablesReady = false;
router.use(async (_req, _res, next) => {
  if (!tablesReady) {
    try {
      await initProductionTables();
      tablesReady = true;
    } catch (e) {
      console.error('[production] init tables:', e);
    }
  }
  next();
});

// ── Units (admin) ──────────────────────────────────────────────

router.get('/units', async (req, res) => {
  try {
    const units = await getProductionUnits(isSuperAdmin(req.user));
    res.json(units);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/units', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await createProductionUnit(req.body);
    res.status(201).json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/units/:id', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await updateProductionUnit(parseInt(req.params.id, 10), req.body);
    res.json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── My accessible units (for sidebar) ──────────────────────────

router.get('/my-units', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const all = await getProductionUnits();
    const slugs = new Set(user.units || []);
    const isAdmin = isSuperAdmin(user);
    const order = ['project', 'ts', 'noc', 'ip'];

    const sidebarUnits = order
      .map((slug) => all.find((u) => u.slug === slug))
      .filter(Boolean)
      .filter((u) => isAdmin || slugs.has(u.slug));

    const projectAccess = isAdmin || slugs.has('project');

    res.json({
      units: sidebarUnits,
      canCreate: projectAccess,
      pipelineUnits: sidebarUnits.filter((u) => ['ts', 'ip', 'noc'].includes(u.unit_stage)),
      projectUnits: sidebarUnits.filter((u) => u.unit_stage === 'project'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Dashboard ──────────────────────────────────────────────────

router.get('/dashboard/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slugs = user.units || [];
    const slug = req.params.unitSlug;
    if (!isSuperAdmin(user) && !slugs.includes(slug)) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }
    const stats = await getProductionDashboardStats(slug, user.id, slugs, isSuperAdmin(user));
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Requests list ──────────────────────────────────────────────

router.get('/requests/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slug = req.params.unitSlug;
    const unit = await getProductionUnitBySlug(slug);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (unit.unit_stage === 'project') {
      if (!isSuperAdmin(user) && !user.units.includes('project') && !user.units.some((s) => s.startsWith('project'))) {
        const projUnits = (await getProductionUnits()).filter((u) => u.unit_stage === 'project');
        if (!projUnits.some((u) => user.units.includes(u.slug))) {
          return res.status(403).json({ error: 'Not assigned to a project unit' });
        }
      }
    } else if (!isSuperAdmin(user) && !user.units.includes(slug)) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }

    const list = await listProductionRequests({
      unitSlug: slug,
      userId: user.id,
      userUnits: user.units,
      isSuperAdmin: isSuperAdmin(user),
      status: req.query.status,
      search: req.query.search,
      sort: req.query.sort,
      order: req.query.order,
      view: req.query.view === 'history' ? 'history' : 'active',
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create request (project unit) ──────────────────────────────

async function createRequestForStage(req, res, routeToStage) {
  try {
    const user = await loadFullUser(req);
    const all = await getProductionUnits();
    const hasProject =
      isSuperAdmin(user) ||
      user.units.includes('project') ||
      all.some((u) => u.unit_stage === 'project' && user.units.includes(u.slug));

    if (!hasProject) return res.status(403).json({ error: 'Only project unit members can create requests' });

    const created = await createProductionRequest({ ...req.body, route_to_stage: routeToStage }, user);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

router.post('/requests/to/:routeToStage', async (req, res) => {
  const routeToStage = req.params.routeToStage === 'ip' ? 'ip' : 'ts';
  return createRequestForStage(req, res, routeToStage);
});

router.post('/requests', async (req, res) => {
  const routeToStage = req.body?.route_to_stage === 'ip' ? 'ip' : 'ts';
  return createRequestForStage(req, res, routeToStage);
});

// ── Single request ─────────────────────────────────────────────

router.get('/requests/detail/:id', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProductionRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      ...request,
      fullPipeline: canViewFullPipeline(user, user.units),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Remarks ────────────────────────────────────────────────────

router.post('/requests/:id/remarks', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProductionRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { comment_text, stage } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ error: 'Comment required' });
    const { isProductionRequestLocked } = await import('../db/production.js');
    if (isProductionRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed — no further comments allowed' });
    }
    const remark = await addProductionRemark(request.id, { comment_text, stage: stage || 'general' }, user);
    res.status(201).json(remark);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Attachments (not NOC) ──────────────────────────────────────

router.post('/requests/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProductionRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { isProductionRequestLocked } = await import('../db/production.js');
    if (isProductionRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed — no further uploads allowed' });
    }

    const nocOnly =
      user.units.includes('noc') &&
      !user.units.includes('ts') &&
      !user.units.includes('ip') &&
      !user.units.includes('project') &&
      !isSuperAdmin(user);
    if (nocOnly) return res.status(403).json({ error: 'NOC cannot upload attachments' });

    const file = {
      path: `/uploads/production/${req.file.filename}`,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    };
    const att = await addProductionAttachment(
      request.id,
      file,
      req.body.stage || 'general',
      user
    );
    res.status(201).json(att);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// TX actions

router.post('/requests/:id/ts/accept', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ts')) {
      return res.status(403).json({ error: 'TX access required' });
    }
    const updated = await tsAcceptRequest(parseInt(req.params.id, 10), user, req.body?.route_to_stage);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/ts/reject', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ts')) {
      return res.status(403).json({ error: 'TX access required' });
    }
    const updated = await tsRejectRequest(parseInt(req.params.id, 10), user);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── IP actions ─────────────────────────────────────────────────

router.put('/requests/:id/ip', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ip')) {
      return res.status(403).json({ error: 'IP access required' });
    }
    const updated = await ipUpdateRequest(parseInt(req.params.id, 10), req.body, user);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/ip/forward', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ip')) {
      return res.status(403).json({ error: 'IP access required' });
    }
    const updated = await ipForwardRequest(parseInt(req.params.id, 10), req.body, user);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── NOC approve / complete ─────────────────────────────────────

/** Short alias — easier to proxy and backward-compatible */
router.post('/noc-approve/:id', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10));
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/noc/approve', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10));
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Legacy alias */
router.post('/requests/:id/noc/complete', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10));
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/project/complete', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const hasProject =
      isSuperAdmin(user) ||
      user.units.includes('project') ||
      (await getProductionUnits()).some(
        (u) => u.unit_stage === 'project' && user.units.includes(u.slug)
      );
    if (!hasProject) {
      return res.status(403).json({ error: 'Project Unit access required' });
    }
    const updated = await projectCompleteRequest(parseInt(req.params.id, 10), user);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
