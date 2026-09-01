import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import {
  ensureIpUnitTables, canUseIpUnit, canManageIpUnit,
  previewNextCircuitId, listCircuits, getCircuitDetail, createCircuit, updateCircuit,
  getCircuitDashboardStats, getRecentIpActivity, getReportsSummary,
  listCircuitAttachments, addCircuitAttachment, getAttachmentForDownload, deleteCircuitAttachment,
  listCircuitRequests, getCircuitRequestDetail, createCircuitRequest,
  generateCircuitFromRequest, returnCircuitRequest, rejectCircuitRequest,
  searchClients, searchSites, searchPops, searchStaff,
} from '../services/ipUnit.js';

// Deliberately NOT under backend/uploads (public static mount) — circuit configs/BOQs can be
// sensitive, so downloads always go through the authenticated route below, mirroring Archive's
// non-static storage convention.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const storageDir = path.join(__dirname, '..', 'ip-unit-storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storageDir),
  filename: (_req, file, cb) => cb(null, `ckt-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|xls|xlsx|csv|doc|docx|kmz|kml|png|jpe?g|gif|webp|zip|txt|conf|cfg)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error(`File type not allowed for circuit attachments`));
  },
});

const router = express.Router();

// Shared in-flight promise, not a boolean set after the await — otherwise every request that
// arrives before the first init finishes (a real burst right after a restart) starts its own
// parallel init run, and duplicate ALTER TABLE/ADD CONSTRAINT calls race and fail under load.
let initPromise = null;
router.use(async (_req, _res, next) => {
  try {
    if (!initPromise) initPromise = ensureIpUnitTables();
    await initPromise;
    next();
  } catch (e) {
    initPromise = null;
    next(e);
  }
});
router.use(authenticateToken);

const requireIpUnit = (req, res, next) =>
  canUseIpUnit(req.user) ? next() : res.status(403).json({ error: 'IP Unit access is required' });
const requireIpUnitManager = (req, res, next) =>
  canManageIpUnit(req.user) ? next() : res.status(403).json({ error: 'Only an IP Manager/Supervisor can do this' });

router.use(requireIpUnit);

// ---------------------------------------------------------------------------
// Dashboard / Reports
// ---------------------------------------------------------------------------

router.get('/dashboard', async (req, res) => {
  try {
    const [stats, recentActivity] = await Promise.all([getCircuitDashboardStats(), getRecentIpActivity(10)]);
    res.json({ ...stats, recentActivity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/summary', async (req, res) => {
  try {
    res.json(await getReportsSummary({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Circuits — Inventory / Add Circuit / Circuit Profile
// ---------------------------------------------------------------------------

router.get('/circuits/next-id', async (req, res) => {
  try {
    res.json({ circuit_id: await previewNextCircuitId(req.query.service_type || 'GEN') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/circuits', async (req, res) => {
  try {
    const rows = await listCircuits({
      q: req.query.q, status: req.query.status, clientId: req.query.client_id,
      popId: req.query.pop_id, serviceType: req.query.service_type,
    });
    res.json({ circuits: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/circuits', async (req, res) => {
  try {
    res.status(201).json(await createCircuit(req.body || {}, req.user));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/circuits/:id', async (req, res) => {
  try {
    const circuit = await getCircuitDetail(Number(req.params.id));
    if (!circuit) return res.status(404).json({ error: 'Circuit not found' });
    res.json(circuit);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/circuits/:id', async (req, res) => {
  try {
    res.json(await updateCircuit(Number(req.params.id), req.body || {}, req.user));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/circuits/:id/history', async (req, res) => {
  try {
    const circuit = await getCircuitDetail(Number(req.params.id));
    if (!circuit) return res.status(404).json({ error: 'Circuit not found' });
    res.json(circuit.history);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

router.get('/circuits/:id/attachments', async (req, res) => {
  try {
    res.json(await listCircuitAttachments(Number(req.params.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/circuits/:id/attachments', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(err.message?.includes('not allowed') ? 415 : 400).json({ error: err.message || 'Upload failed' });
    try {
      if (!req.file) return res.status(400).json({ error: 'No file was uploaded' });
      const record = await addCircuitAttachment(Number(req.params.id), req.user, {
        filePath: req.file.path, fileName: req.file.originalname, mimeType: req.file.mimetype,
      });
      res.status(201).json(record);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
});

router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    const attachment = await getAttachmentForDownload(Number(req.params.attachmentId));
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
    if (!fs.existsSync(attachment.file_path)) return res.status(404).json({ error: 'The file is missing from storage' });
    res.download(attachment.file_path, attachment.file_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/attachments/:attachmentId', async (req, res) => {
  try {
    const attachment = await deleteCircuitAttachment(Number(req.params.attachmentId), req.user);
    if (fs.existsSync(attachment.file_path)) fs.unlink(attachment.file_path, () => {});
    res.json({ deleted: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Circuit Requests
// ---------------------------------------------------------------------------

router.get('/requests', async (req, res) => {
  try {
    res.json(await listCircuitRequests({ status: req.query.status }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/requests', async (req, res) => {
  try {
    res.status(201).json(await createCircuitRequest(req.body || {}, req.user));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const request = await getCircuitRequestDetail(Number(req.params.id));
    if (!request) return res.status(404).json({ error: 'Circuit request not found' });
    res.json(request);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/requests/:id/generate', requireIpUnitManager, async (req, res) => {
  try {
    res.json(await generateCircuitFromRequest(Number(req.params.id), req.user, { circuitId: req.body?.circuit_id }));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/requests/:id/return', requireIpUnitManager, async (req, res) => {
  try {
    res.json(await returnCircuitRequest(Number(req.params.id), req.user, req.body?.notes));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/requests/:id/reject', requireIpUnitManager, async (req, res) => {
  try {
    res.json(await rejectCircuitRequest(Number(req.params.id), req.user, req.body?.notes));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

router.get('/clients', async (req, res) => {
  try { res.json(await searchClients(req.query.q)); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/sites', async (req, res) => {
  try { res.json(await searchSites(req.query.q)); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/pops', async (req, res) => {
  try { res.json(await searchPops(req.query.q)); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.get('/staff', async (req, res) => {
  try { res.json(await searchStaff(req.query.q)); } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
