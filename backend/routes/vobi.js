import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getVobiOverview,
  getVobiSummary,
  getVobiActions,
  ensureVobiThread,
  runVobiCommand,
  postVobiMessage,
  generateVobiReport,
  getPersonalDigest,
  getThreadSummary,
  getCrossThreadInsight,
} from '../services/vobiService.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/overview', async (req, res) => {
  try {
    const data = await getVobiOverview(req.user.id);
    res.json(data);
  } catch (e) {
    console.error('[vobi] overview:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const period = req.query.period || 'since_login';
    const data = await getVobiSummary(req.user.id, period, req.query.type);
    res.json(data);
  } catch (e) {
    console.error('[vobi] summary:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/actions', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const data = await getVobiActions(req.user.id, filter, req.query.type);
    res.json(data);
  } catch (e) {
    console.error('[vobi] actions:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/thread', async (req, res) => {
  try {
    const data = await ensureVobiThread(req.user.id);
    res.json(data);
  } catch (e) {
    console.error('[vobi] thread:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/chat/digest', async (req, res) => {
  try {
    const data = await getPersonalDigest(req.user.id, req.query.since || null);
    res.json(data);
  } catch (e) {
    console.error('[vobi] chat digest:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/chat/thread/:channelId', async (req, res) => {
  try {
    const data = await getThreadSummary(req.user.id, req.params.channelId, {
      since: req.query.since,
      limit: req.query.limit,
    });
    res.json(data);
  } catch (e) {
    console.error('[vobi] chat thread:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/chat/insight', async (req, res) => {
  try {
    const data = await getCrossThreadInsight(req.user.id);
    res.json(data);
  } catch (e) {
    console.error('[vobi] chat insight:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/command', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    const result = await runVobiCommand(req.user.id, text);
    let channelId;
    let messageId;
    if (req.body?.persist === true) {
      try {
        const posted = await postVobiMessage(req.user.id, result.reply, {
          ...(result.meta || {}),
          intent: result.intent,
          cards: result.cards ?? [],
        });
        channelId = posted.channelId;
        messageId = posted.message?.id;
      } catch (postErr) {
        console.warn('[vobi] command persist:', postErr.message);
      }
    }
    res.json({ ...result, channelId, messageId });
  } catch (e) {
    console.error('[vobi] command:', e);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/report/generate', async (req, res) => {
  try {
    const period = req.body?.period === 'week' ? 'week' : 'today';
    const report = await generateVobiReport(req.user.id, period);
    res.json(report);
  } catch (e) {
    console.error('[vobi] report:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
