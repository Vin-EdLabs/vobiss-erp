import express from 'express';
import { authenticateToken, requireHR } from '../middleware/auth.js';
import { attachTenant } from '../middleware/tenant.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import {
  ensureInsuranceTables,
  getPolicyWithCategories,
  saveTemplate,
  triggerAnnualReset,
  getResetHistory,
  buildInsuranceProfile,
  setCategoryOverride,
  logClaim,
  initiateTransfer,
  reverseTransfer,
  getOverview,
  getPendingTransfers,
  notifyClaimLogged,
  notifyTransferInitiated,
} from '../services/insurance.js';
import pool from '../db.js';

const router = express.Router();
router.use(authenticateToken);
router.use(requireHR);
router.use(attachTenant);
router.use(invalidateOnMutation);

function actorName(req) {
  const u = req.user || {};
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  return name || u.username || 'HR';
}

router.get('/policy', async (req, res) => {
  try {
    await ensureInsuranceTables();
    const result = await getPolicyWithCategories(req.company);
    res.json(result);
  } catch (e) {
    console.error('[insurance] GET /policy failed:', e);
    res.status(500).json({ error: 'Failed to load policy' });
  }
});

router.post('/policy', async (req, res) => {
  try {
    const { name, description, policyStartDate, policyEndDate, categories } = req.body || {};
    if (!name || !policyStartDate || !policyEndDate) {
      return res.status(400).json({ error: 'name, policyStartDate and policyEndDate are required' });
    }
    const result = await saveTemplate(
      { companyId: req.company, name, description, policyStartDate, policyEndDate, categories: categories || [] },
      req.user
    );
    res.json(result);
  } catch (e) {
    console.error('[insurance] POST /policy failed:', e);
    res.status(500).json({ error: 'Failed to save policy' });
  }
});

router.post('/policy/reset', async (req, res) => {
  try {
    const policy = await getPolicyWithCategories(req.company);
    if (!policy.template) return res.status(404).json({ error: 'No active policy template' });
    const { newStartDate, newEndDate } = req.body || {};
    const result = await triggerAnnualReset(policy.template.id, { newStartDate, newEndDate }, actorName(req));
    res.json(result);
  } catch (e) {
    console.error('[insurance] POST /policy/reset failed:', e);
    res.status(500).json({ error: e.message || 'Failed to reset policy' });
  }
});

router.get('/policy/resets', async (req, res) => {
  try {
    const history = await getResetHistory(req.company);
    res.json({ resets: history });
  } catch (e) {
    console.error('[insurance] GET /policy/resets failed:', e);
    res.status(500).json({ error: 'Failed to load reset history' });
  }
});

router.get('/staff/:employeeId', async (req, res) => {
  try {
    const profile = await buildInsuranceProfile(req.params.employeeId, req.company);
    if (!profile) return res.status(404).json({ error: 'No active insurance policy for this company' });
    res.json(profile);
  } catch (e) {
    console.error('[insurance] GET /staff/:employeeId failed:', e);
    res.status(500).json({ error: 'Failed to load staff insurance profile' });
  }
});

router.post('/staff/:employeeId/override', async (req, res) => {
  try {
    const { categoryId, outpatientLimit, inpatientLimit, reason } = req.body || {};
    if (!categoryId) return res.status(400).json({ error: 'categoryId is required' });
    const override = await setCategoryOverride(
      req.params.employeeId, req.company,
      { categoryId, outpatientLimit, inpatientLimit, reason }, req.user
    );
    res.json({ override });
  } catch (e) {
    console.error('[insurance] POST /staff/:employeeId/override failed:', e);
    res.status(500).json({ error: e.message || 'Failed to save override' });
  }
});

router.post('/staff/:employeeId/claims', async (req, res) => {
  try {
    const { categoryId, claimType, amount, hospitalName, claimDate, notes, force } = req.body || {};
    if (!categoryId || !claimType || !amount) {
      return res.status(400).json({ error: 'categoryId, claimType and amount are required' });
    }
    const result = await logClaim(
      req.params.employeeId, req.company,
      { categoryId, claimType, amount, hospitalName, claimDate, notes }, req.user, { force: !!force }
    );
    if (result.exceeds) return res.status(409).json(result);

    const empRes = await pool.query(`SELECT id FROM hr_employees WHERE id = $1`, [req.params.employeeId]);
    if (empRes.rows[0]) {
      const categoryName = (await buildInsuranceProfile(req.params.employeeId, req.company))
        .categories.find((c) => c.id === Number(categoryId))?.name || 'a category';
      notifyClaimLogged(req.params.employeeId, result.claim, result.newRemaining, categoryName).catch(() => {});
    }
    res.status(201).json(result);
  } catch (e) {
    console.error('[insurance] POST /staff/:employeeId/claims failed:', e);
    res.status(500).json({ error: e.message || 'Failed to log claim' });
  }
});

router.get('/staff/:employeeId/claims', async (req, res) => {
  try {
    const profile = await buildInsuranceProfile(req.params.employeeId, req.company);
    if (!profile) return res.status(404).json({ error: 'No active insurance policy for this company' });
    res.json({ claims: profile.claims });
  } catch (e) {
    console.error('[insurance] GET /staff/:employeeId/claims failed:', e);
    res.status(500).json({ error: 'Failed to load claims' });
  }
});

router.post('/staff/:employeeId/transfers', async (req, res) => {
  try {
    const { fromCategoryId, toCategoryId, transferType, amount, reason, immediate } = req.body || {};
    if (!fromCategoryId || !toCategoryId || !transferType || !amount) {
      return res.status(400).json({ error: 'fromCategoryId, toCategoryId, transferType and amount are required' });
    }
    const transfer = await initiateTransfer(
      req.params.employeeId, req.company,
      { fromCategoryId, toCategoryId, transferType, amount, reason, immediate: !!immediate }, req.user
    );

    const profile = await buildInsuranceProfile(req.params.employeeId, req.company);
    const fromName = profile.categories.find((c) => c.id === Number(fromCategoryId))?.name || 'a category';
    const toName = profile.categories.find((c) => c.id === Number(toCategoryId))?.name || 'a category';
    notifyTransferInitiated(req.params.employeeId, transfer, fromName, toName).catch(() => {});

    res.status(201).json({ transfer });
  } catch (e) {
    console.error('[insurance] POST /staff/:employeeId/transfers failed:', e);
    res.status(500).json({ error: e.message || 'Failed to initiate transfer' });
  }
});

router.get('/staff/:employeeId/transfers', async (req, res) => {
  try {
    const profile = await buildInsuranceProfile(req.params.employeeId, req.company);
    if (!profile) return res.status(404).json({ error: 'No active insurance policy for this company' });
    res.json({ transfers: profile.transfers });
  } catch (e) {
    console.error('[insurance] GET /staff/:employeeId/transfers failed:', e);
    res.status(500).json({ error: 'Failed to load transfers' });
  }
});

router.post('/transfers/:id/reverse', async (req, res) => {
  try {
    const transfer = await reverseTransfer(req.params.id, req.user);
    res.json({ transfer });
  } catch (e) {
    console.error('[insurance] POST /transfers/:id/reverse failed:', e);
    res.status(400).json({ error: e.message || 'Failed to reverse transfer' });
  }
});

router.get('/overview', async (req, res) => {
  try {
    const overview = await getOverview(req.company);
    res.json(overview || {});
  } catch (e) {
    console.error('[insurance] GET /overview failed:', e);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

router.get('/pending-transfers', async (req, res) => {
  try {
    const pending = await getPendingTransfers(req.company);
    res.json({ transfers: pending });
  } catch (e) {
    console.error('[insurance] GET /pending-transfers failed:', e);
    res.status(500).json({ error: 'Failed to load pending transfers' });
  }
});

export default router;
