import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { notifyUnit, notifyMany } from '../services/unitNotify.js';
// Server-side LibreOffice conversion is temporarily disabled — reserved for a future unified
// DOCX/PPTX viewer upgrade. Not deleted, just no longer invoked from the upload route below.
// import { convertDocumentToPdf } from '../services/performanceDocumentConversion.js';
import {
  initPerformanceReportTables, tierOfUser, unitsOfUser, resolveNextStage, canAccessReport, listTierCandidates,
  listPeriods, createPeriod, getPeriodById,
  createReport, getReportById, submitReport, reviewAndForward, sendBackToRevision, finalizeReport,
  listQueueForUser, listMyReports, listHrAccessible, listRecentActivityForUser, addDocument, getDocumentById,
  getActiveWeights,
} from '../db/performanceReports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Deliberately outside the public /uploads static mount — these documents need per-stage/
// per-role visibility, not "anyone with the URL" (same reasoning as Archive's storage).
const storageDir = path.join(__dirname, '..', 'performance-report-storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storageDir),
  filename: (_req, file, cb) => cb(null, `perf-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = String(path.extname(file.originalname || '').slice(1)).toLowerCase();
    if (ALLOWED_EXT.has(ext)) cb(null, true);
    else cb(new Error(`File type .${ext || '?'} is not allowed — only PDF, Word, and PowerPoint documents.`));
  },
});

// A boolean flag set AFTER the await would let every request that arrives before the first
// finishes (a real scenario right after a restart, when a burst of concurrent requests hits
// this route) kick off its own initPerformanceReportTables() run in parallel — duplicate
// ALTER TABLE ADD CONSTRAINT calls then race and fail with "constraint already exists" (500s
// under load, confirmed with a live concurrency test). A shared in-flight promise instead
// makes every concurrent request await the exact same single run.
let initPromise = null;
router.use(async (_req, _res, next) => {
  try {
    if (!initPromise) initPromise = initPerformanceReportTables();
    await initPromise;
    next();
  } catch (e) {
    initPromise = null;
    next(e);
  }
});
router.use(authenticateToken);

function isHrStaff(user) {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  return role === 'hr' || unitsOfUser(user).includes('hr');
}

function authorName(user) {
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User';
}

async function notifyStage(report, stage, title, message) {
  const io = getRealtimeIo();
  const opts = { linkUrl: `/performance-reports/report/${report.id}`, notificationType: 'performance_report' };
  if (stage === 'employee') {
    await notifyMany([report.employee_id], title, message, null, opts);
    return;
  }
  const suffix = stage === 'manager' ? '_manager' : stage === 'supervisor' ? '_supervisor' : null;
  if (stage === 'cto') {
    await notifyUnit({ roles: ['director', 'cto'], title, message, actingUserId: null, ...opts });
  } else if (suffix) {
    // resolveUnitRecipients matches roles by exact slug, not suffix — build the concrete role list for this unit.
    const roles = [`${report.unit}${suffix}`];
    await notifyUnit({ roles, unitSlugs: [report.unit], title, message, actingUserId: null, ...opts });
  }
  // notifyUnit only reaches accounts whose role slug exactly matches (e.g. "ip_supervisor") —
  // most real accounts here carry a generic role with the job title in `position` instead, so
  // notifyUnit alone can silently miss them. When a specific recipient was chosen at
  // submit/forward time, notify them directly too so they're never missed.
  if (report.recipient_id) {
    await notifyMany([report.recipient_id], title, message, null, opts);
  }
  void io;
}

// ---- Periods ----
router.get('/periods', async (req, res) => {
  try { res.json(await listPeriods()); } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/periods', async (req, res) => {
  try { res.status(201).json(await createPeriod(req.body || {}, req.user)); } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Scoring weights ----
router.get('/weights', async (req, res) => {
  try { res.json(await getActiveWeights()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- My reports ----
router.get('/my-reports', async (req, res) => {
  try { res.json(await listMyReports(req.user.id)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reports', async (req, res) => {
  try { res.status(201).json(await createReport(req.body || {}, req.user)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/reports/:id', async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!canAccessReport(req.user, report, { isHr: isHrStaff(req.user) })) {
      return res.status(403).json({ error: 'You do not have access to this report' });
    }
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/reports/:id/next-reviewers', async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const myTier = tierOfUser(req.user);
    const isOwner = report.employee_id === req.user.id;
    const canAct = (report.current_stage === 'employee' && isOwner) || (report.current_stage !== 'employee' && report.current_stage === myTier);
    if (!canAct) return res.status(403).json({ error: 'You cannot act on this report right now' });

    const fromTier = report.current_stage === 'employee' ? myTier : report.current_stage;
    const nextStage = await resolveNextStage(report.unit, fromTier);
    const candidates = await listTierCandidates(report.unit, nextStage);
    res.json({
      next_stage: nextStage,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.username,
        position: c.position || null,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/reports/:id/submit', async (req, res) => {
  try {
    const report = await submitReport(req.params.id, req.user, req.body?.recipient_id);
    const nextTierLabel = report.current_stage === 'cto' ? 'CTO' : report.current_stage[0].toUpperCase() + report.current_stage.slice(1);
    await notifyStage(report, report.current_stage, 'Report Awaiting Review',
      `${authorName(req.user)} submitted a performance report — awaiting ${nextTierLabel} review.`);
    res.json(report);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/reports/:id/review', async (req, res) => {
  try {
    const stage = tierOfUser(req.user);
    if (stage === 'employee') return res.status(403).json({ error: 'Only supervisors, managers, or the CTO can review reports' });
    const report = await reviewAndForward(req.params.id, stage, { score: req.body?.score, comments: req.body?.comments }, req.user, req.body?.recipient_id);
    const nextTierLabel = report.current_stage === 'done' ? 'Done' : report.current_stage[0].toUpperCase() + report.current_stage.slice(1);
    await notifyStage(report, report.current_stage, 'Report Awaiting Review',
      `${authorName(req.user)} scored and forwarded a performance report — awaiting ${nextTierLabel} review.`);
    res.json(report);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/reports/:id/send-back', async (req, res) => {
  try {
    const stage = tierOfUser(req.user);
    const report = await sendBackToRevision(req.params.id, stage, req.body?.comment, req.user);
    await notifyStage(report, report.current_stage, 'Report Needs Revision',
      `${authorName(req.user)} sent a performance report back for revision: ${req.body?.comment || ''}`);
    res.json(report);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/reports/:id/finalize', async (req, res) => {
  try {
    const tier = tierOfUser(req.user);
    if (tier !== 'cto') return res.status(403).json({ error: 'Only the CTO/Director can finalize a report' });
    const report = await finalizeReport(req.params.id, { score: req.body?.score, comments: req.body?.comments }, req.user);
    await notifyMany([report.employee_id], 'Report Finalized', `Your performance report has been finalized. Final score: ${report.final_score ?? 'N/A'}.`, req.user.id, {
      linkUrl: `/performance-reports/report/${report.id}`, notificationType: 'performance_report',
    });
    res.json(report);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- Review queues (Team Reports / Unit Reviews / Executive Review) ----
router.get('/queue', async (req, res) => {
  try { res.json(await listQueueForUser(req.user, { status: req.query.status, period_id: req.query.period_id })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// What has THIS reviewer already acted on — so a queue that's empty right now still shows
// something meaningful instead of a blank page.
router.get('/my-activity', async (req, res) => {
  try { res.json(await listRecentActivityForUser(req.user.id, 5)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- HR access — automatic once a report reaches CTO ----
router.get('/hr-access', async (req, res) => {
  try {
    if (!isHrStaff(req.user)) return res.status(403).json({ error: 'HR Access is available to HR staff only' });
    res.json(await listHrAccessible({ status: req.query.status, period_id: req.query.period_id, unit: req.query.unit }, req.user));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---- Documents ----
router.post('/reports/:id/documents', upload.array('files', 5), async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const stage = tierOfUser(req.user);
    const created = [];
    for (const file of req.files || []) {
      const ext = String(path.extname(file.originalname || '').slice(1)).toLowerCase();
      const doc = await addDocument(report.id, stage, {
        original_name: file.originalname, mime_type: file.mimetype, extension: ext,
        size_bytes: file.size, file_path: file.path,
      }, req.user);
      created.push(doc);
      // Conversion is temporarily disabled — see the reserved import note above.
    }
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/documents/:id/file', async (req, res) => {
  try {
    const doc = await getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const report = await getReportById(doc.report_id);
    if (!report || !canAccessReport(req.user, report, { isHr: isHrStaff(req.user) })) {
      return res.status(403).json({ error: 'You do not have access to this document' });
    }
    const wantsPdf = req.query.view === 'pdf';
    const target = wantsPdf && doc.converted_pdf_path ? doc.converted_pdf_path : doc.file_path;
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found on disk' });
    res.sendFile(path.resolve(target));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/documents/:id/status', async (req, res) => {
  try {
    const doc = await getDocumentById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const report = await getReportById(doc.report_id);
    if (!report || !canAccessReport(req.user, report, { isHr: isHrStaff(req.user) })) {
      return res.status(403).json({ error: 'You do not have access to this document' });
    }
    res.json({ id: doc.id, conversion_status: doc.conversion_status, has_pdf: !!doc.converted_pdf_path || doc.extension === 'pdf' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
