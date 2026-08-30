import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth.js';
import {
  getVobiOverview,
  getVobiSummary,
  getVobiActions,
  ensureVobiThread,
  postVobiMessage,
  postVobiUserMessage,
  generateVobiReport,
  getPersonalDigest,
  getThreadSummary,
  getCrossThreadInsight,
  resolveUserChannel,
} from '../services/vobiService.js';
import { matchVobiIntent } from '../services/vobiIntents.js';
import { askVobi, loadVobiConversationHistory, mergeVobiHistories } from '../services/geminiService.js';
import { invalidateAllCache } from '../services/vobiCache.js';
import {
  ensureVobiMemorySchema,
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  clearAllMemories,
  confirmMemory,
  dismissMemory,
  getMemorySettings,
  setMemoryEnabled,
  processMemoryAfterTurn,
  tryForgetFromMessage,
} from '../services/vobiMemory.js';
import { resolvePageKnowledge, buildPageBriefingPrompt } from '../services/vobiPageKnowledge.js';
import { searchVobiDocs } from '../services/vobiDocs.js';

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
    about:
      'Introduce yourself as Vobi Intelligence (users can call you Vobi). Explain you were created by Vincent Acquah together with a team of developers in a development lab, and you continue to evolve through research and training. Briefly explain you keep useful personal context for this user, understand follow-ups, and work with authorized live Vobiss ERP data for their role (tickets, clients/sites, inventory, finance, HR, assets, field, requests). Do not teach a specific page unless they ask. Keep it warm, respectful, and concise.',
    digest:
      'Catch me up with a clear personal digest for my role: unread chat, mentions, and important threads since I was last active. Be concise and include links.',
    'page-help':
      'Explain the current page the user is viewing: how it works, main actions, common mistakes, and the best next step. Be practical so they do not need to ask a colleague. Use CURRENT PAGE CONTEXT and LIVE UI SNAPSHOT. Only for this Guide request.',
    clients: 'Summarize clients and sites I can see — totals, notable statuses, and links. Use real names.',
    audit:
      'Using live audit details and deletion records, answer precisely. If they ask who deleted something, list recent deletions with who, what, and when. Include item names and old/new values when present. Link to /audit-logs.',
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

async function askFor(req, message, history, pageContext = null) {
  const { role, position } = vobiIdentity(req);
  return askVobi(message, req.user.id, role, position, history || [], pageContext);
}

async function historyFor(req, options = {}) {
  const clientHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const limit = options.light ? 8 : undefined;
  const dbHistory = await loadVobiConversationHistory(req.user.id, limit);
  return mergeVobiHistories(dbHistory, clientHistory);
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
    await ensureVobiMemorySchema();
    const commandKey = String(req.body?.command || '').trim();
    const text = String(req.body?.text || req.body?.message || commandKey || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });

    // Forget intents are handled without a model call when possible
    const forgetResult = await tryForgetFromMessage(req.user.id, text);
    if (forgetResult) {
      let channelId;
      let messageId;
      if (req.body?.persist === true || req.body?.persistUser === true) {
        if (req.body?.persistUser === true) {
          try {
            await postVobiUserMessage(req.user.id, text);
          } catch (e) {
            console.warn('[vobi] persist user:', e.message);
          }
        }
        const posted = await persistReply(req.user.id, forgetResult.reply, {
          intent: 'forget_memory',
          cardType: 'text',
        });
        channelId = posted.channelId;
        messageId = posted.messageId;
      }
      return res.json({
        intent: 'forget_memory',
        reply: forgetResult.reply,
        cards: [],
        response: forgetResult.reply,
        timestamp: new Date().toISOString(),
        channelId,
        messageId,
        meta: { cardType: 'text', intent: 'forget_memory' },
        memoryConfirmation: null,
        memoryCandidates: [],
      });
    }

    const prompts = commandPrompts(req);
    let intent = commandKey || matchVobiIntent(text);
    if (commandKey === 'digest' || intent === 'digest') intent = 'personal_digest';
    let prompt = prompts[commandKey] || prompts[intent] || text;

    const pathname = String(req.body?.pathname || '').trim() || null;
    const pageGuide = req.body?.pageGuide || null;
    const liveUi = req.body?.liveUi || null;
    const wantsPageHelp =
      commandKey === 'page-help' ||
      intent === 'page_help' ||
      /\b(help me with this page|guide me (on|through) this page|what can i do (on|here)|explain this page|how (do|does) this page)\b/i.test(
        text
      );

    // Page context is ONLY attached for explicit Guide / page-help — not every question.
    let pageContext = null;
    if (wantsPageHelp) {
      const pageKnowledge = pathname
        ? resolvePageKnowledge(pathname, pageGuide)
        : resolvePageKnowledge('/', pageGuide);
      pageContext = { page: pageKnowledge, liveUi: liveUi || null };
      prompt = buildPageBriefingPrompt(pageKnowledge, liveUi);

      if (pageKnowledge?.doc_ids?.length) {
        try {
          const docSearch = searchVobiDocs(pageKnowledge.page_name || pageKnowledge.module, 2);
          const hits = Array.isArray(docSearch?.results) ? docSearch.results : [];
          if (hits.length) {
            pageContext.related_docs = hits.map((h) => ({
              id: h.id,
              title: h.title,
              excerpt: String(h.snippet || '').slice(0, 1200),
            }));
          }
        } catch (_) {
          /* ignore */
        }
      }
    }

    const enriched = await enrichPrompt(req.user.id, prompt, intent);
    const lightChat =
      intent === 'greeting' ||
      /^(hi|hey|hello|thanks|thank you|ok|okay)[\s!.?]*$/i.test(text);
    let reply = await askFor(
      req,
      enriched,
      await historyFor(req, { light: lightChat }),
      pageContext
    );
    if (!String(reply || '').trim()) {
      reply =
        intent === 'audit'
          ? 'I checked recent audit activity but could not format an answer. Please open [Audit Logs](/audit-logs).'
          : "I couldn't produce an answer just now. Please try again.";
    }
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
    // persist:true → assistant only (chat UI already saved the user turn)
    // persistUser:true → also save the user turn (floating panel)
    if (req.body?.persist === true || req.body?.persistUser === true) {
      if (req.body?.persistUser === true) {
        try {
          await postVobiUserMessage(req.user.id, text);
        } catch (e) {
          console.warn('[vobi] persist user:', e.message);
        }
      }
      if (req.body?.persist === true || req.body?.persistUser === true) {
        const posted = await persistReply(req.user.id, reply, { ...meta, intent, cards });
        channelId = posted.channelId;
        messageId = posted.messageId;
      }
    }

    // Extract / confirm memory candidates after the turn (user-scoped)
    let memoryConfirmation = null;
    let memoryCandidates = [];
    try {
      const memResult = await processMemoryAfterTurn(req.user.id, text, {
        channelId,
        messageId,
      });
      memoryConfirmation = memResult.confirmationPrompt || null;
      memoryCandidates = memResult.memoryCandidates || [];
      if (memoryConfirmation?.text) {
        // Append a short confirmation ask if the model didn't already ask
        if (!/remember that|keep it in context|would you like me to remember/i.test(reply)) {
          reply = `${reply}\n\n${memoryConfirmation.text}`;
          if (messageId && channelId) {
            try {
              await persistReply(req.user.id, memoryConfirmation.text, {
                intent: 'memory_confirm',
                cardType: 'memory_confirm',
                memoryId: memoryConfirmation.memoryId,
              });
            } catch (_) {
              /* ignore */
            }
          }
        }
      }
    } catch (memErr) {
      console.warn('[vobi] memory after turn:', memErr.message);
    }

    res.json({
      intent,
      reply,
      cards,
      response: reply,
      timestamp: new Date().toISOString(),
      channelId,
      messageId,
      meta: {
        ...meta,
        memoryConfirmation,
        memoryCandidates,
      },
      memoryConfirmation,
      memoryCandidates,
    });
  } catch (e) {
    console.error('[vobi] command:', e);
    res.status(500).json({ error: 'Vobi is unavailable right now' });
  }
});

/** ——— Persistent memory (always filtered by req.user.id) ——— */
router.get('/memories', async (req, res) => {
  try {
    await ensureVobiMemorySchema();
    const status = req.query.status ? String(req.query.status) : 'active';
    const memories = await listMemories(req.user.id, { status: status === 'all' ? null : status });
    const settings = await getMemorySettings(req.user.id);
    res.json({ success: true, memories, settings });
  } catch (e) {
    console.error('[vobi] memories list:', e);
    res.status(e.status || 500).json({ error: e.message || 'Failed to load memories' });
  }
});

router.get('/memories/settings', async (req, res) => {
  try {
    const settings = await getMemorySettings(req.user.id);
    res.json({ success: true, ...settings });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load memory settings' });
  }
});

router.put('/memories/settings', async (req, res) => {
  try {
    const enabled = Boolean(req.body?.memory_enabled ?? req.body?.enabled);
    const settings = await setMemoryEnabled(req.user.id, enabled);
    res.json({ success: true, ...settings });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update memory settings' });
  }
});

router.post('/memories', async (req, res) => {
  try {
    const memory = await createMemory(req.user.id, {
      memory_type: req.body?.memory_type,
      memory_content: req.body?.memory_content || req.body?.content,
      importance: req.body?.importance || 'medium',
      confidence: req.body?.confidence ?? 1,
      status: 'active',
    });
    res.status(201).json({ success: true, memory });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to create memory' });
  }
});

router.patch('/memories/:id', async (req, res) => {
  try {
    const memory = await updateMemory(req.user.id, req.params.id, req.body || {});
    res.json({ success: true, memory });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to update memory' });
  }
});

router.post('/memories/:id/confirm', async (req, res) => {
  try {
    const memory = await confirmMemory(req.user.id, req.params.id);
    res.json({ success: true, memory });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to confirm memory' });
  }
});

router.post('/memories/:id/dismiss', async (req, res) => {
  try {
    const memory = await dismissMemory(req.user.id, req.params.id);
    res.json({ success: true, memory });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to dismiss memory' });
  }
});

router.delete('/memories/:id', async (req, res) => {
  try {
    await deleteMemory(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Failed to delete memory' });
  }
});

router.delete('/memories', async (req, res) => {
  try {
    const result = await clearAllMemories(req.user.id);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear memories' });
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
