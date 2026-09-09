import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import { ensureEmployeeForUser, hrUploadsDir, publicUploadUrl } from '../utils/hrShared.js';
import {
  listActiveCategories,
  searchRelieverCandidates,
  getApproverCandidatesForUser,
  submitLeaveRequest,
  listMyRequests,
  listPendingForUser,
  listActedByUser,
  respondToLeaveStage,
  getLeaveRequestDetail,
  getLeaveRequestHistory,
  canViewRequest,
  countBusinessDays,
} from '../services/leave.js';
import { isoDateOnly } from '../utils/hrShared.js';
import { renderLeaveRequestPdf } from '../utils/leavePdf.js';

const router = express.Router();
router.use(authenticateToken);
router.use(invalidateOnMutation);

if (!fs.existsSync(hrUploadsDir)) fs.mkdirSync(hrUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, hrUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `leave-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
    if (!allowed.includes(ext)) return cb(new Error('Attach an image or document (PDF, Word, Excel, or image)'));
    cb(null, true);
  },
});

async function requireLinkedEmployee(req, res) {
  const emp = await ensureEmployeeForUser(req.user);
  if (!emp) {
    res.status(404).json({ error: 'Your HR profile has not been set up yet. Contact HR to get started.' });
    return null;
  }
  return emp;
}

function companyOf(req) {
  return req.user?.company || null;
}

router.get('/categories', async (req, res) => {
  try {
    const categories = await listActiveCategories(companyOf(req));
    res.json({ categories });
  } catch (e) {
    console.error('[leave] GET /categories failed:', e);
    res.status(500).json({ error: 'Failed to load leave categories' });
  }
});

router.get('/reliever-candidates', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ candidates: [] });
    const candidates = await searchRelieverCandidates(q, emp.id);
    res.json({ candidates });
  } catch (e) {
    console.error('[leave] GET /reliever-candidates failed:', e);
    res.status(500).json({ error: 'Failed to search staff' });
  }
});

router.get('/approver-candidates', async (req, res) => {
  try {
    const candidates = await getApproverCandidatesForUser(req.user);
    res.json(candidates);
  } catch (e) {
    console.error('[leave] GET /approver-candidates failed:', e);
    res.status(500).json({ error: 'Failed to resolve approvers' });
  }
});

router.get('/preview-days', async (req, res) => {
  try {
    const start = isoDateOnly(req.query.startDate);
    const end = isoDateOnly(req.query.endDate);
    if (!start || !end || end < start) return res.status(400).json({ error: 'Select a valid date range' });
    const days = await countBusinessDays(start, end, companyOf(req));
    res.json({ days });
  } catch (e) {
    console.error('[leave] GET /preview-days failed:', e);
    res.status(500).json({ error: 'Failed to compute business days' });
  }
});

router.post('/requests', upload.single('attachment'), async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const b = req.body || {};
    const payload = {
      ...b,
      handoverConfirmed: b.handoverConfirmed === true || b.handoverConfirmed === 'true',
      relieverId: b.relieverId ? Number(b.relieverId) : undefined,
      supervisorApproverId: b.supervisorApproverId ? Number(b.supervisorApproverId) : undefined,
      managerApproverId: b.managerApproverId ? Number(b.managerApproverId) : undefined,
      attachmentUrl: req.file ? publicUploadUrl(req.file.filename) : undefined,
      attachmentName: req.file ? req.file.originalname : undefined,
    };
    const row = await submitLeaveRequest(req.user, emp, payload, companyOf(req));
    res.status(201).json(row);
  } catch (e) {
    console.error('[leave] POST /requests failed:', e);
    res.status(400).json({ error: e.message || 'Failed to submit leave request' });
  }
});

router.get('/requests/my', async (req, res) => {
  try {
    const rows = await listMyRequests(req.user);
    res.json({ requests: rows });
  } catch (e) {
    console.error('[leave] GET /requests/my failed:', e);
    res.status(500).json({ error: 'Failed to load your leave requests' });
  }
});

router.get('/requests/pending/mine', async (req, res) => {
  try {
    const rows = await listPendingForUser(req.user);
    res.json({ requests: rows });
  } catch (e) {
    console.error('[leave] GET /requests/pending/mine failed:', e);
    res.status(500).json({ error: 'Failed to load pending actions' });
  }
});

router.get('/requests/acted/mine', async (req, res) => {
  try {
    const rows = await listActedByUser(req.user);
    res.json({ requests: rows });
  } catch (e) {
    console.error('[leave] GET /requests/acted/mine failed:', e);
    res.status(500).json({ error: 'Failed to load your leave history' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const detail = await getLeaveRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Leave request not found' });
    if (!(await canViewRequest(req.user, detail))) return res.status(403).json({ error: 'Not authorized to view this request' });
    res.json(detail);
  } catch (e) {
    console.error('[leave] GET /requests/:id failed:', e);
    res.status(500).json({ error: 'Failed to load leave request' });
  }
});

router.get('/requests/:id/history', async (req, res) => {
  try {
    const row = await getLeaveRequestDetail(req.params.id);
    if (!row) return res.status(404).json({ error: 'Leave request not found' });
    if (!(await canViewRequest(req.user, row))) return res.status(403).json({ error: 'Not authorized to view this request' });
    const history = await getLeaveRequestHistory(req.params.id);
    res.json({ history });
  } catch (e) {
    console.error('[leave] GET /requests/:id/history failed:', e);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.post('/requests/:id/respond', async (req, res) => {
  try {
    const { action, reason, signature } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action is required' });
    const row = await respondToLeaveStage(req.user, req.params.id, { action, reason, signature });
    res.json(row);
  } catch (e) {
    console.error('[leave] POST /requests/:id/respond failed:', e);
    res.status(400).json({ error: e.message || 'Failed to respond' });
  }
});

router.get('/requests/:id/pdf', async (req, res) => {
  try {
    const detail = await getLeaveRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Leave request not found' });
    if (!(await canViewRequest(req.user, detail))) return res.status(403).json({ error: 'Not authorized to view this request' });
    const pdf = await renderLeaveRequestPdf(detail);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="leave-request-${detail.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[leave] GET /requests/:id/pdf failed:', e);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
