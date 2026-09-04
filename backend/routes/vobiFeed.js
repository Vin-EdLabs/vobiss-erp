import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { ensureVobiFeedTable } from '../services/vobiLiveFeed.js';

const router = express.Router();

// GET /api/vobi-feed?company=CW — last 20 entries, newest first. Company scope defaults to
// CW for now (the only company this feed covers today); pass ?company= to widen later.
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureVobiFeedTable();
    const company = String(req.query.company || 'CW').trim().toUpperCase();
    const result = await pool.query(
      `SELECT id, company, narrated_text, created_at, expires_at
       FROM vobi_feed
       WHERE company = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT 20`,
      [company]
    );
    res.json({ entries: result.rows });
  } catch (error) {
    console.error('GET /api/vobi-feed error:', error.message);
    res.status(500).json({ error: 'Failed to load the Live Ops feed' });
  }
});

export default router;
