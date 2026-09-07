import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { emitToStaff } from '../realtime/channels.js';
import { getInitials } from '../services/chatHelpers.js';
import {
  ensureVobiFeedTable,
  attachFeedEngagement,
  toggleFeedReaction,
  recordFeedSeen,
} from '../services/vobiLiveFeed.js';

const router = express.Router();
const FEED_LIMIT = 3;

// GET /api/vobi-feed?company=CW — the 3 most recent entries, newest first, with each entry's
// reaction counts and "seen by" initials already embedded — the panel never needs a second
// round-trip to render a card.
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureVobiFeedTable();
    const company = String(req.query.company || 'CW').trim().toUpperCase();
    const result = await pool.query(
      `SELECT id, company, narrated_text, created_at, expires_at
       FROM vobi_feed
       WHERE company = $1 AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT $2`,
      [company, FEED_LIMIT]
    );
    const entries = await attachFeedEngagement(result.rows, String(req.user.id));
    res.json({ entries });
  } catch (error) {
    console.error('GET /api/vobi-feed error:', error.message);
    res.status(500).json({ error: 'Failed to load the Live Ops feed' });
  }
});

// GET /api/vobi-feed/:id/reactions — reaction counts for one entry.
router.get('/:id/reactions', authenticateToken, async (req, res) => {
  try {
    await ensureVobiFeedTable();
    const feedId = Number(req.params.id);
    if (!Number.isFinite(feedId)) return res.status(400).json({ error: 'Invalid feed id' });
    const [entry] = await attachFeedEngagement([{ id: feedId }], String(req.user.id));
    res.json({ reactions: entry?.reactions || [] });
  } catch (error) {
    console.error('GET /api/vobi-feed/:id/reactions error:', error.message);
    res.status(500).json({ error: 'Failed to load reactions' });
  }
});

// POST /api/vobi-feed/:id/react   body: { emoji } — toggles the current staff member's
// reaction (add if they hadn't reacted with this emoji, remove if they had), then broadcasts
// the emoji's new total to every connected staff client.
router.post('/:id/react', authenticateToken, async (req, res) => {
  try {
    await ensureVobiFeedTable();
    const feedId = Number(req.params.id);
    const emoji = String(req.body?.emoji || '').trim();
    if (!Number.isFinite(feedId)) return res.status(400).json({ error: 'Invalid feed id' });
    if (!emoji) return res.status(400).json({ error: 'emoji is required' });

    const staffId = String(req.user.id);
    const { action, count } = await toggleFeedReaction(feedId, staffId, emoji);
    const payload = { feedId, emoji, count, staffId, action };
    emitToStaff('vobi:reaction-update', payload);
    res.json(payload);
  } catch (error) {
    console.error('POST /api/vobi-feed/:id/react error:', error.message);
    res.status(500).json({ error: 'Failed to react' });
  }
});

// POST /api/vobi-feed/:id/seen — marks the entry seen for the current staff member only; every
// other staff member keeps their own independent read state. Identity always comes from the
// authenticated JWT, never the request body, so one person can't mark it seen for another.
router.post('/:id/seen', authenticateToken, async (req, res) => {
  try {
    await ensureVobiFeedTable();
    const feedId = Number(req.params.id);
    if (!Number.isFinite(feedId)) return res.status(400).json({ error: 'Invalid feed id' });

    const staffId = String(req.user.id);
    const initials = getInitials(req.user.first_name, req.user.last_name, req.user.username);
    await recordFeedSeen(feedId, staffId, initials);
    const payload = { feedId, staffId, initials };
    emitToStaff('vobi:seen-update', payload);
    res.json({ ok: true, ...payload });
  } catch (error) {
    console.error('POST /api/vobi-feed/:id/seen error:', error.message);
    res.status(500).json({ error: 'Failed to mark seen' });
  }
});

export default router;
