import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import { ensureEmployeeForUser } from '../utils/hrShared.js';
import {
  buildInsuranceProfile,
  respondToTransfer,
  notifyTransferResolved,
} from '../services/insurance.js';
import pool from '../db.js';

const router = express.Router();
router.use(authenticateToken);
router.use(invalidateOnMutation);

async function requireLinkedEmployee(req, res) {
  const emp = await ensureEmployeeForUser(req.user);
  if (!emp) {
    res.status(404).json({ error: 'Your HR profile has not been set up yet. Contact HR to get started.' });
    return null;
  }
  return emp;
}

router.get('/me', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const company = req.user?.company || emp.company || 'CW';
    const profile = await buildInsuranceProfile(emp.id, company);
    if (!profile) return res.json(null);
    res.json(profile);
  } catch (e) {
    console.error('[insurance] GET /hr-self/insurance/me failed:', e);
    res.status(500).json({ error: 'Failed to load your insurance profile' });
  }
});

router.post('/transfers/:id/respond', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const { action, reason } = req.body || {};
    if (!action) return res.status(400).json({ error: 'action is required' });

    const transfer = await respondToTransfer(req.params.id, emp.id, action, req.user, reason);

    if (action === 'approve' || action === 'reject') {
      const initiatorRes = await pool.query(
        `SELECT id FROM users WHERE LOWER(TRIM(first_name || ' ' || last_name)) = LOWER(TRIM($1)) OR username = $1 LIMIT 1`,
        [transfer.initiated_by]
      ).catch(() => ({ rows: [] }));
      const initiatorUserId = initiatorRes.rows[0]?.id;
      if (initiatorUserId) {
        notifyTransferResolved(initiatorUserId, action === 'approve', emp.full_name, reason).catch(() => {});
      }
    }

    res.json({ transfer });
  } catch (e) {
    console.error('[insurance] POST /hr-self/insurance/transfers/:id/respond failed:', e);
    res.status(400).json({ error: e.message || 'Failed to respond to transfer' });
  }
});

export default router;
