import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { hrUploadsDir, publicUploadUrl } from '../utils/hrShared.js';
import {
  submitOTRequest,
  attachDocuments,
  listMyRequests,
  listPendingForUser,
  listAllRequests,
  getRequestDetail,
  getTicketsForRequest,
  getHistoryForRequest,
  respondToOTStage,
  canViewRequest,
  canViewAllRequests,
} from '../services/overtime.js';
import { renderOTRequestPdf } from '../utils/otPdf.js';

const router = express.Router();
router.use(authenticateToken);

const otUploadsDir = path.join(hrUploadsDir, 'overtime');
if (!fs.existsSync(otUploadsDir)) fs.mkdirSync(otUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, otUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `ot-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 40 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
    if (!allowed.includes(ext)) return cb(new Error('Attach an image or document (PDF, Word, Excel, or image)'));
    cb(null, true);
  },
});

function actorName(req) {
  const name = `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim();
  return name || req.user?.username || 'Staff';
}

// Files arrive with fieldnames like "ticket_0_files", "ticket_2_files", or "general_files" —
// bucket them here into per-row document records (mirrors the codebase's existing
// single-array-field multer convention, since no route here needed dynamic .fields() before).
router.post('/requests', upload.any(), async (req, res) => {
  try {
    const payload = JSON.parse(req.body.payload || '{}');
    const row = await submitOTRequest(req.user, payload);

    const ticketMeta = Array.isArray(payload.tickets) ? payload.tickets : [];
    const docTypeByIndex = ticketMeta.map((t) => t.documentTypeByFile || {});
    const tickets = await getTicketsForRequest(row.id);

    const documents = [];
    for (const file of req.files || []) {
      const match = /^ticket_(\d+)_files$/.exec(file.fieldname);
      const ticketRowId = match ? tickets[Number(match[1])]?.id || null : null;
      const rowIndex = match ? Number(match[1]) : null;
      const meta = rowIndex != null ? (docTypeByIndex[rowIndex] || {})[file.originalname] : null;
      documents.push({
        ticketRowId,
        documentType: meta?.documentType || 'other',
        otherLabel: meta?.otherLabel || null,
        fileName: file.originalname,
        filePath: publicUploadUrl(file.filename),
        fileSize: file.size,
        uploadedBy: actorName(req),
      });
    }
    if (documents.length) await attachDocuments(row.id, documents);

    res.status(201).json(row);
  } catch (e) {
    console.error('[overtime] POST /requests failed:', e);
    res.status(400).json({ error: e.message || 'Failed to submit overtime request' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    if (!canViewAllRequests(req.user)) return res.status(403).json({ error: 'HR, Finance, or Admin access required' });
    const requests = await listAllRequests({ status: req.query.status });
    res.json({ requests });
  } catch (e) {
    console.error('[overtime] GET /requests failed:', e);
    res.status(500).json({ error: 'Failed to load overtime requests' });
  }
});

router.get('/requests/my', async (req, res) => {
  try {
    const requests = await listMyRequests(req.user);
    res.json({ requests });
  } catch (e) {
    console.error('[overtime] GET /requests/my failed:', e);
    res.status(500).json({ error: 'Failed to load your overtime requests' });
  }
});

router.get('/requests/pending/mine', async (req, res) => {
  try {
    const requests = await listPendingForUser(req.user);
    res.json({ requests });
  } catch (e) {
    console.error('[overtime] GET /requests/pending/mine failed:', e);
    res.status(500).json({ error: 'Failed to load pending overtime requests' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const detail = await getRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Overtime request not found' });
    if (!(await canViewRequest(req.user, detail))) return res.status(403).json({ error: 'You do not have access to this request' });
    res.json(detail);
  } catch (e) {
    console.error('[overtime] GET /requests/:id failed:', e);
    res.status(500).json({ error: 'Failed to load overtime request' });
  }
});

router.get('/requests/:id/history', async (req, res) => {
  try {
    const history = await getHistoryForRequest(req.params.id);
    res.json({ history });
  } catch (e) {
    console.error('[overtime] GET /requests/:id/history failed:', e);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.post('/requests/:id/respond', async (req, res) => {
  try {
    const { action, reason, comment, amountPaid, paymentMethod, signature } = req.body || {};
    const updated = await respondToOTStage(req.user, req.params.id, { action, reason, comment, amountPaid, paymentMethod, signature });
    res.json(updated);
  } catch (e) {
    console.error('[overtime] POST /requests/:id/respond failed:', e);
    res.status(400).json({ error: e.message || 'Failed to respond to overtime request' });
  }
});

router.get('/requests/:id/pdf', async (req, res) => {
  try {
    const detail = await getRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Overtime request not found' });
    if (!(await canViewRequest(req.user, detail))) return res.status(403).json({ error: 'You do not have access to this request' });
    const pdf = await renderOTRequestPdf(detail);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="overtime-request-${detail.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[overtime] GET /requests/:id/pdf failed:', e);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

export default router;
