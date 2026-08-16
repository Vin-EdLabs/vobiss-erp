import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import {
  initProjectRequestTables,
  getProjectUnits,
  createProjectUnit,
  updateProjectUnit,
  getProjectUnitBySlug,
  getProjectRequestDashboardStats,
  listProjectRequests,
  createProjectRequest,
  getProjectRequestById,
  canViewRequestV2,
  canViewFullPipeline,
  addProjectRequestRemark,
  addProjectRequestAttachment,
  tsAcceptRequest,
  tsRejectRequest,
  ipForwardRequest,
  ipUpdateRequest,
  nocApproveRequest,
  projectCompleteRequest,
} from '../db/project.js';
import pool from '../db.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { postProjectRequestSystemMessage } from '../services/chatSystemMessage.js';
import { ensureProjectRequestThread } from '../services/chatRecordThreads.js';
import { effectiveUnitsForUser, hasProjectUnitAccess, isSystemAdminAccount, canonicalizeUnitSlug } from '../roles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const projectUploadsDir = path.join(__dirname, '..', 'uploads', 'project-request');
if (!fs.existsSync(projectUploadsDir)) {
  fs.mkdirSync(projectUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, projectUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'prj-' + unique + path.extname(file.originalname || ''));
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
  return effectiveUnitsForUser(user);
}

function isSystemAdmin(user) {
  return isSystemAdminAccount(user);
}

function isSuperAdmin(user) {
  return isSystemAdmin(user);
}

function isExecutive(user) {
  const r = String(user?.main_role || user?.role || '').toLowerCase();
  const pos = String(user?.position || '').trim().toLowerCase();
  return r === 'director' || r === 'cto' || pos === 'director' || pos === 'cto';
}

function requireSuperAdmin(req, res, next) {
  if (!isSystemAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function loadFullUser(req) {
  const { rows } = await pool.query(
    'SELECT id, username, first_name, last_name, role, main_role, units, unit, position FROM users WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return null;
  u.units = parseUserUnits(u);
  return u;
}

router.use(authenticateToken);
router.use(invalidateOnMutation);

// Init tables on first request (idempotent)
let tablesReady = false;
router.use(async (_req, _res, next) => {
  if (!tablesReady) {
    try {
      await initProjectRequestTables();
      tablesReady = true;
    } catch (e) {
      console.error('[project-request] init tables:', e);
    }
  }
  next();
});

// â”€â”€ Units (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/units', async (req, res) => {
  try {
    const units = await getProjectUnits(isSuperAdmin(req.user));
    res.json(units);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/units', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await createProjectUnit(req.body);
    res.status(201).json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/units/:id', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await updateProjectUnit(parseInt(req.params.id, 10), req.body);
    res.json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ My accessible units (for sidebar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/my-units', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const all = await getProjectUnits();
    const slugs = new Set(user.units || []);
    const isAdmin = isSuperAdmin(user) || isExecutive(user);
    const order = ['project', 'ts', 'ip', 'noc'];

    const sidebarUnits = order
      .map((slug) => all.find((u) => u.slug === slug))
      .filter(Boolean)
      .filter((u) => isAdmin || slugs.has(u.slug));

    const projectAccess = isAdmin || hasProjectUnitAccess(user);

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

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/dashboard/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slugs = user.units || [];
    const slug = canonicalizeUnitSlug(req.params.unitSlug);
    if (!isSuperAdmin(user) && !isExecutive(user) && !slugs.includes(slug)) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }
    const stats = await getProjectRequestDashboardStats(
      slug,
      user.id,
      slugs,
      isSuperAdmin(user) || isExecutive(user)
    );
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Requests list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/requests/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slug = canonicalizeUnitSlug(req.params.unitSlug);
    const unit = await getProjectUnitBySlug(slug);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (unit.unit_stage === 'project') {
      if (
        !isSuperAdmin(user) &&
        !isExecutive(user) &&
        !user.units.includes('project') &&
        !user.units.some((s) => s.startsWith('project'))
      ) {
        const projUnits = (await getProjectUnits()).filter((u) => u.unit_stage === 'project');
        if (!projUnits.some((u) => user.units.includes(u.slug))) {
          return res.status(403).json({ error: 'Not assigned to a project unit' });
        }
      }
    } else if (!isSuperAdmin(user) && !isExecutive(user) && !user.units.includes(slug)) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }

    const list = await listProjectRequests({
      unitSlug: slug,
      userId: user.id,
      userUnits: user.units,
      isSuperAdmin: isSuperAdmin(user) || isExecutive(user),
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

// â”€â”€ Create request (project unit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function createRequestForStage(req, res, routeToStage) {
  try {
    const user = await loadFullUser(req);
    const all = await getProjectUnits();
    const hasProject = hasProjectUnitAccess(user) ||
      all.some((u) => u.unit_stage === 'project' && user.units.includes(u.slug));

    if (!hasProject) return res.status(403).json({ error: 'Only project unit members can create requests' });

    const created = await createProjectRequest({ ...req.body, route_to_stage: routeToStage }, user);

    try {
      const io = getRealtimeIo();
      const recordChannelId = await ensureProjectRequestThread(created, io);
      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
      await postProjectRequestSystemMessage({
        projectRequestId: created.id,
        siteName: created.site_name || created.customer_name,
        actorName,
        io,
        recordChannelId,
      });
    } catch (e) {
      console.warn('[chat] service request thread failed:', e.message);
    }

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

// â”€â”€ Single request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/requests/detail/:id', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProjectRequestById(parseInt(req.params.id, 10));
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

// â”€â”€ Remarks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/requests/:id/remarks', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProjectRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { comment_text, stage } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ error: 'Comment required' });
    const { isProjectRequestLocked } = await import('../db/project.js');
    if (isProjectRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed â€” no further comments allowed' });
    }
    const remark = await addProjectRequestRemark(request.id, { comment_text, stage: stage || 'general' }, user);
    res.status(201).json(remark);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ Attachments (not NOC) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/requests/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProjectRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { isProjectRequestLocked } = await import('../db/project.js');
    if (isProjectRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed â€” no further uploads allowed' });
    }

    const nocOnly =
      user.units.includes('noc') &&
      !user.units.includes('ts') &&
      !user.units.includes('ip') &&
      !user.units.includes('project') &&
      !isSuperAdmin(user);
    if (nocOnly) return res.status(403).json({ error: 'NOC cannot upload attachments' });

    const file = {
      path: `/uploads/project-request/${req.file.filename}`,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    };
    const att = await addProjectRequestAttachment(
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

// â”€â”€ IP actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ NOC approve / complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Short alias â€” easier to proxy and backward-compatible */
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
      (await getProjectUnits()).some(
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

