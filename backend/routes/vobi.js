import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import {
  getVobiOverview,
  getVobiSummary,
  getVobiActions,
  ensureVobiThread,
  postVobiMessage,
  generateVobiReport,
  getPersonalDigest,
  getThreadSummary,
  getCrossThreadInsight,
  resolveUserChannel,
} from '../services/vobiService.js';
import { matchVobiIntent } from '../services/vobiIntents.js';
import { askVobi, loadVobiConversationHistory } from '../services/geminiService.js';
import { invalidateAllCache } from '../services/vobiCache.js';

const router = express.Router();
router.use(authenticateToken);

const vobiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

function vobiIdentity(req) {
  return {
    role: req.user?.main_role || req.user?.role || 'user',
    position: req.user?.position || null,
  };
}

function commandPrompts(req) {
  const role = vobiIdentity(req).role;
  return {
    'daily-summary': `Give me a full personalized daily briefing for my role (${role}). What needs my attention today? Include names and markdown links.`,
    'my-work': 'What is assigned to me or pending my action right now? Include names and links.',
    approvals: 'What approvals need my attention? Include who requested, what, and when. Add links.',
    tickets: 'Summarize my tickets and open tickets I am allowed to see. Which are urgent or escalated? Include links.',
    inventory: 'Inventory health report. List low/out of stock items by name with links.',
    'hr-summary': 'Full HR summary — who is in, who is late, who is absent, leave requests with names, payroll status if I am allowed to see it. Include links.',
    finance: 'Finance status — who has pending cash requests, amounts, purposes. Include links.',
    chat: 'What unread messages and mentions do I have? Who sent them and what did they say? Include links.',
    assets: 'What is the current asset status? Include names and links.',
    field: 'What field activities happened today? Include engineer names and links.',
    'service-requests': 'What service requests are pending or in progress? Include customer/site names and links.',
    briefing: `Give me my personalized daily briefing as ${role}. What are the top 5 things needing attention? Include real names and markdown links.`,
    overview: 'Give me a 2-sentence operational overview of the most important things right now for my role. Include a link if useful.',
    about: 'Introduce yourself as Vobi in a short briefing: what you help with now, using live data if useful.',
  };
}

async function persistReply(userId, reply, extra = {}) {
  try {
    const posted = await postVobiMessage(userId, reply, extra);
    return { channelId: posted.channelId, messageId: posted.message?.id };
  } catch (postErr) {
    console.warn('[vobi] persist:', postErr.message);
    return {};
  }
}

async function askFor(req, message, history) {
  const { role, position } = vobiIdentity(req);
  return askVobi(message, req.user.id, role, position, history || []);
}

async function historyFor(req) {
  if (Array.isArray(req.body?.history) && req.body.history.length) return req.body.history;
  return loadVobiConversationHistory(req.user.id);
}

async function cardsForIntent(userId, intent) {
  if (intent === 'approvals') {
    const data = await getVobiActions(userId, 'all', 'approval');
    return data.items || [];
  }
  if (intent === 'overdue') {
    const data = await getVobiActions(userId, 'overdue');
    return data.items || [];
  }
  if (intent === 'mentions' || intent === 'chat_mentions') {
    const data = await getVobiActions(userId, 'all', 'mention');
    return data.items || [];
  }
  if (intent === 'tasks') {
    const data = await getVobiActions(userId, 'all');
    return data.items || [];
  }
  return [];
}

async function enrichPrompt(userId, text, intent) {
  if (intent === 'summarise_thread') {
    try {
      const name = String(text || '')
        .replace(/summari[sz]e/ig, '')
        .replace(/what\s+happened\s+in/ig, '')
        .replace(/catch\s+me\s+up\s+on/ig, '')
        .replace(/\brecap\b/ig, '')
        .replace(/summary\s+of/ig, '')
        .replace(/what'?s\s+in/ig, '')
        .replace(/^the\s+/i, '')
        .replace(/^#/i, '')
        .trim();
      const channel = await resolveUserChannel(userId, name);
      if (channel?.id) {
        const summary = await getThreadSummary(userId, channel.id, {});
        return `${text}\n\nThread data:\n${JSON.stringify(summary)}`;
      }
    } catch (_) {
      /* fall through */
    }
  }
  if (intent === 'personal_digest' || intent === 'missed' || intent === 'chat_mentions') {
    try {
      const digest = await getPersonalDigest(userId);
      return `${text}\n\nChat digest data:\n${JSON.stringify(digest)}`;
    } catch (_) {
      /* fall through */
    }
  }
  return text;
}

router.get('/overview', async (req, res) => {
  try {
    const data = await getVobiOverview(req.user.id);
    const statusLine = await askFor(
      req,
      data.pendingCount > 0
        ? 'In one short sentence, say what needs my attention right now using the live data. Do not greet.'
        : 'In one short sentence, give one useful operational insight from the live data. Do not greet.',
      []
    );
    res.json({ ...data, statusLine });
  } catch (e) {
    console.error('[vobi] overview:', e);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
  }
});

router.get('/briefing', vobiLimiter, async (req, res) => {
  try {
    const response = await askFor(req, commandPrompts(req).briefing, []);
    res.json({ response, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[vobi] briefing:', error);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
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

router.post('/chat', vobiLimiter, async (req, res) => {
  try {
    const message = String(req.body?.message || req.body?.text || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const response = await askFor(req, message, await historyFor(req));
    res.json({ response, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Vobi chat error:', error);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
  }
});

router.post('/command', vobiLimiter, async (req, res) => {
  try {
    const commandKey = String(req.body?.command || '').trim();
    const text = String(req.body?.text || req.body?.message || commandKey || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });

    const prompts = commandPrompts(req);
    const intent = commandKey || matchVobiIntent(text);
    const prompt = prompts[commandKey] || prompts[intent] || text;
    const enriched = await enrichPrompt(req.user.id, prompt, intent);
    const reply = await askFor(req, enriched, await historyFor(req));
    const cards = await cardsForIntent(req.user.id, intent);

    let meta = { cardType: cards.length ? 'action_list' : 'text', intent };
    if (intent === 'personal_digest' || intent === 'missed' || intent === 'chat_mentions') {
      try {
        const digest = await getPersonalDigest(req.user.id);
        meta = {
          cardType: 'personal_digest',
          digest: intent === 'chat_mentions' ? { ...digest, activeThreads: [], systemEvents: [] } : digest,
        };
      } catch (_) {
        /* ignore */
      }
    }

    let channelId;
    let messageId;
    if (req.body?.persist === true) {
      const posted = await persistReply(req.user.id, reply, { ...meta, intent, cards });
      channelId = posted.channelId;
      messageId = posted.messageId;
    }

    res.json({
      intent,
      reply,
      cards,
      response: reply,
      timestamp: new Date().toISOString(),
      channelId,
      messageId,
      meta,
    });
  } catch (e) {
    console.error('[vobi] command:', e);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
  }
});

router.post('/message', vobiLimiter, async (req, res) => {
  try {
    const message = String(req.body?.message || req.body?.text || 'Hello').trim();
    const response = await askFor(req, message, await historyFor(req));
    res.json({ response, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[vobi] message:', error);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
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

router.post('/refresh-cache', async (req, res) => {
  try {
    invalidateAllCache();
    res.json({ message: 'Cache refreshed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh cache' });
  }
});

export default router;
