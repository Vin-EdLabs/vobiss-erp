import express from 'express';
import { authenticateToken, requireHR } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import {
  listAllCategories,
  createCategory,
  updateCategory,
  listAllRequests,
  getLeaveRequestDetail,
  getLeaveRequestHistory,
  getLeaveOverview,
} from '../services/leave.js';
import { renderLeaveRequestPdf } from '../utils/leavePdf.js';

const router = express.Router();
router.use(authenticateToken);
router.use(requireHR);
router.use(invalidateOnMutation);

function companyOf(req) {
  return req.user?.company || null;
}

router.get('/requests', async (req, res) => {
  try {
    const { status, department, from, to } = req.query;
    const rows = await listAllRequests({ status, department, from, to, company: companyOf(req) });
    res.json({ requests: rows });
  } catch (e) {
    console.error('[leave] GET /hr/leave/requests failed:', e);
    res.status(500).json({ error: 'Failed to load leave requests' });
  }
});

router.get('/requests/:id', async (req, res) => {
  try {
    const detail = await getLeaveRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Leave request not found' });
    res.json(detail);
  } catch (e) {
    console.error('[leave] GET /hr/leave/requests/:id failed:', e);
    res.status(500).json({ error: 'Failed to load leave request' });
  }
});

router.get('/requests/:id/history', async (req, res) => {
  try {
    const history = await getLeaveRequestHistory(req.params.id);
    res.json({ history });
  } catch (e) {
    console.error('[leave] GET /hr/leave/requests/:id/history failed:', e);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.get('/requests/:id/pdf', async (req, res) => {
  try {
    const detail = await getLeaveRequestDetail(req.params.id);
    if (!detail) return res.status(404).json({ error: 'Leave request not found' });
    const pdf = await renderLeaveRequestPdf(detail);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="leave-request-${detail.id}.pdf"`);
    res.send(pdf);
  } catch (e) {
    console.error('[leave] GET /hr/leave/requests/:id/pdf failed:', e);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await listAllCategories(companyOf(req));
    res.json({ categories });
  } catch (e) {
    console.error('[leave] GET /hr/leave/categories failed:', e);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, maxDaysPerYear, maxRequestsPerYear } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const category = await createCategory({ name, maxDaysPerYear, maxRequestsPerYear, company: companyOf(req) || 'ALL' });
    res.status(201).json({ category });
  } catch (e) {
    console.error('[leave] POST /hr/leave/categories failed:', e);
    res.status(400).json({ error: e.message || 'Failed to create category' });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const { name, maxDaysPerYear, maxRequestsPerYear, isActive } = req.body || {};
    const category = await updateCategory(req.params.id, { name, maxDaysPerYear, maxRequestsPerYear, isActive });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json({ category });
  } catch (e) {
    console.error('[leave] PUT /hr/leave/categories/:id failed:', e);
    res.status(400).json({ error: e.message || 'Failed to update category' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const overview = await getLeaveOverview(companyOf(req));
    res.json(overview);
  } catch (e) {
    console.error('[leave] GET /hr/leave/overview failed:', e);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

export default router;
