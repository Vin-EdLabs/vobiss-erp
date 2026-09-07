import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pool from '../db.js';
import { authenticateToken, isHrOrExecutive } from '../middleware/auth.js';
import {
  ensureFieldWorkTables,
  isFieldWorkSupervisor,
  isNocConfirmer,
  isAssignedEngineer,
  canViewFieldWork,
  createFieldWork,
  listFieldWork,
  listRecentArrivals,
  getFieldWorkDetail,
  addEngineers,
  removeEngineer,
  updateFieldWorkStatus,
  postFieldWorkUpdate,
  confirmFieldWork,
} from '../services/fieldWork.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'field-work');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `fw-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// Shared in-flight promise, not a boolean set after the await — otherwise every request that
// arrives before the first init finishes (a real burst right after a restart) starts its own
// parallel init run, and duplicate ALTER TABLE/ADD CONSTRAINT calls race and fail under load.
let initPromise = null;
router.use(async (_req, _res, next) => {
  try {
    if (!initPromise) initPromise = ensureFieldWorkTables();
    await initPromise;
    next();
  } catch (e) {
    initPromise = null;
    next(e);
  }
});
router.use(authenticateToken);

const requireSupervisor = (req, res, next) =>
  isFieldWorkSupervisor(req.user) ? next() : res.status(403).json({ error: 'Only the Transmission/Engineering supervisor or an admin can do this' });

// POST /api/field-work — create field work from a ticket or service request. Supervisor only.
router.post('/', requireSupervisor, async (req, res) => {
  try {
    const created = await createFieldWork(req.body || {}, req.user);
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/field-work — list, filterable. Supervisors/NOC/admin see everything; everyone else sees only what they're assigned to.
router.get('/', async (req, res) => {
  try {
    const rows = await listFieldWork({
      status: req.query.status, siteId: req.query.site_id, engineerId: req.query.engineer_id,
      sourceType: req.query.source_type, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo,
    });
    const privileged = isFieldWorkSupervisor(req.user) || isNocConfirmer(req.user);
    if (privileged) return res.json(rows);
    const mine = await pool.query(`SELECT field_work_id FROM field_work_engineers WHERE user_id = $1 AND removed_at IS NULL`, [req.user.id]);
    const allowedIds = new Set(mine.rows.map((r) => r.field_work_id));
    res.json(rows.filter((r) => allowedIds.has(r.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/my-work — everything assigned to the current engineer, active and completed.
router.get('/my-work', async (req, res) => {
  try {
    const rows = await listFieldWork({ engineerId: req.user.id });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/supervisor-view — everything visible to the supervisor (all field work, since supervisors see all).
router.get('/supervisor-view', requireSupervisor, async (req, res) => {
  try {
    const rows = await listFieldWork({});
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/arrivals — recent "Confirm I'm here" check-ins, for TX supervisors/managers
// and HR. Narrower than supervisor-view: just arrival check-ins (who, where, distance, photo),
// not full field-work case access.
router.get('/arrivals', async (req, res) => {
  try {
    if (!isFieldWorkSupervisor(req.user) && !isNocConfirmer(req.user) && !isHrOrExecutive(req.user)) {
      return res.status(403).json({ error: 'Not authorized to view field arrivals' });
    }
    const rows = await listRecentArrivals({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, limit: req.query.limit });
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/sites?q= — searchable site picker for the assignment form.
router.get('/sites', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) { params.push(`%${q}%`); where = `WHERE site_name ILIKE $1 OR site_address ILIKE $1`; }
    const rows = await pool.query(`SELECT id, site_name, site_address, region, customer_id, latitude, longitude FROM customer_sites ${where} ORDER BY site_name LIMIT 20`, params);
    res.json(rows.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/clients?q= — searchable client picker for the assignment form. Matches
// backend/services/ipUnit.js's searchClients() — customer_name is the real display name;
// contact_person is often unset, so it was falling back to blank names before this fix.
router.get('/clients', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = "WHERE deleted_at IS NULL";
    if (q) { params.push(`%${q}%`); where += ` AND (customer_name ILIKE $1 OR contact_person ILIKE $1 OR customer_code ILIKE $1)`; }
    const rows = await pool.query(`SELECT id, COALESCE(customer_name, contact_person) AS name, customer_code FROM customers ${where} ORDER BY name LIMIT 20`, params);
    res.json(rows.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/by-source/:sourceType/:sourceId — the field work (if any) for a given ticket/service request, for the detail-page section.
router.get('/by-source/:sourceType/:sourceId', async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT id FROM field_work WHERE source_type = $1 AND source_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [req.params.sourceType, Number(req.params.sourceId)]
    );
    if (!rows.rows[0]) return res.json(null);
    const detail = await getFieldWorkDetail(rows.rows[0].id);
    if (!(await canViewFieldWork(req.user, detail))) return res.status(403).json({ error: 'You do not have access to this field work' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/field-work/:id — full detail.
router.get('/:id', async (req, res) => {
  try {
    const detail = await getFieldWorkDetail(Number(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Field work not found' });
    if (!(await canViewFieldWork(req.user, detail))) return res.status(403).json({ error: 'You do not have access to this field work' });
    res.json(detail);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/field-work/:id/status — engineers update their own status, supervisors update any status.
// on_site/completed are deliberately refused here for a plain engineer — both are mandatory-GPS
// (or photo-fallback) transitions, only reachable through POST /:id/updates with
// update_type 'arrival'/'departure' (see postFieldWorkUpdate), which is the one place that
// validation actually runs. Without this guard, this route was a direct, unverified bypass.
router.patch('/:id/status', async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!status) return res.status(400).json({ error: 'status is required' });
    if (['on_site', 'completed'].includes(status) && !isFieldWorkSupervisor(req.user)) {
      return res.status(400).json({
        error: status === 'on_site'
          ? 'Use "Confirm I\'m here" to go on site — it requires your location.'
          : 'Use "Mark My Work Complete" to close this out — it requires your location or a photo.',
      });
    }
    const updated = await updateFieldWorkStatus(Number(req.params.id), status, req.user);
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/field-work/:id/engineers — add engineers. Supervisor only.
router.post('/:id/engineers', requireSupervisor, async (req, res) => {
  try {
    const updated = await addEngineers(Number(req.params.id), req.body?.engineer_ids || [], req.body?.lead_engineer_id, req.user);
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/field-work/:id/engineers/:userId — remove an engineer. Supervisor only.
router.delete('/:id/engineers/:userId', requireSupervisor, async (req, res) => {
  try {
    const updated = await removeEngineer(Number(req.params.id), Number(req.params.userId), req.user);
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/field-work/:id/updates — engineer posts a progress update/note, with optional file uploads.
router.post('/:id/updates', upload.array('files', 10), async (req, res) => {
  try {
    const files = (req.files || []).map((f) => ({
      path: `/uploads/field-work/${f.filename}`, name: f.originalname, mime_type: f.mimetype,
    }));
    const lat = req.body?.latitude != null && req.body.latitude !== '' ? Number(req.body.latitude) : undefined;
    const lng = req.body?.longitude != null && req.body.longitude !== '' ? Number(req.body.longitude) : undefined;
    const update = await postFieldWorkUpdate(Number(req.params.id), req.user, {
      updateType: req.body?.update_type, content: req.body?.content,
      progressPercentage: req.body?.progress_percentage != null && req.body.progress_percentage !== '' ? Number(req.body.progress_percentage) : null,
      attachments: files,
      latitude: lat, longitude: lng,
    });
    res.status(201).json(update);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/field-work/:id/confirm — NOC confirmation (or reject/send-back) and client confirmation.
router.post('/:id/confirm', async (req, res) => {
  try {
    const updated = await confirmFieldWork(Number(req.params.id), req.user, {
      confirmationType: req.body?.confirmation_type,
      notes: req.body?.notes,
      clientName: req.body?.client_name,
      clientSignature: req.body?.client_signature,
      outcome: req.body?.outcome || 'confirm',
    });
    res.json(updated);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
