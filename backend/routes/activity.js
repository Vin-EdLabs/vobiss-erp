import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getActivityForUser } from '../services/activityLog.js';
import { formatPersonName } from '../utils/displayName.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/me', async (req, res) => {
  try {
    const actorName = formatPersonName(req.user, req.user?.username);
    const items = await getActivityForUser(req.user.id, {
      type: req.query.type,
      range: req.query.range,
      from: req.query.from,
      to: req.query.to,
      search: req.query.search,
      limit: req.query.limit,
      actorName,
    });
    res.json({ items });
  } catch (error) {
    console.error('Error loading my activity:', error.stack);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

export default router;
