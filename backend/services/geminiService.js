import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildVobiSystemPrompt } from './vobiPrompt.js';
import { getVobiSystemData } from './vobiDataService.js';
import { executeVobiTool } from './vobiTools.js';
import { gatherVobiToolContext, formatToolEnrichmentForPrompt } from './vobiToolRouter.js';
import { getRecentDeletions } from './vobiDeletions.js';
import { buildMemoryContextForPrompt } from './vobiMemory.js';
import pool from '../db.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MODEL_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-2.0-flash', 'gemini-1.5-flash'];
const HISTORY_LIMIT = 28;

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'your_key_here') {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return new GoogleGenerativeAI(key);
}

function normalizeHistory(conversationHistory = []) {
  const mapped = conversationHistory
    .slice(-HISTORY_LIMIT)
    .map((msg) => ({
      role: msg.role === 'assistant' || msg.role === 'model' || msg.role === 'vobi' || msg.message_type === 'vobi' ? 'model' : 'user',
      parts: [{ text: String(msg.content || msg.body || msg.text || '').trim() }],
    }))
    .filter((msg) => msg.parts[0].text);

  while (mapped.length && mapped[0].role !== 'user') mapped.shift();

  const merged = [];
  for (const msg of mapped) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.parts[0].text += `\n${msg.parts[0].text}`;
    } else {
      merged.push(msg);
    }
  }

  if (merged.length && merged[merged.length - 1].role === 'user') merged.pop();
  return merged;
}

export async function loadVobiConversationHistory(userId, limit = HISTORY_LIMIT) {
  try {
    const uid = Number.parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid < 1) return [];
    const { rows } = await pool.query(
      `SELECT m.body, m.message_type, m.sender_id
         FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi' AND c.vobi_user_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2`,
      [uid, Math.min(Math.max(Number(limit) || HISTORY_LIMIT, 5), 50)]
    );
    return rows.reverse().map((row) => ({
      role: row.message_type === 'vobi' || row.sender_id == null ? 'assistant' : 'user',
      content: row.body,
    }));
  } catch (error) {
    console.warn('[vobi] history load:', error.message);
    return [];
  }
}

export function mergeVobiHistories(dbHistory = [], clientHistory = []) {
  const out = [];
  const push = (role, content) => {
    const text = String(content || '').trim();
    if (!text) return;
    const r = role === 'assistant' || role === 'model' || role === 'vobi' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === r && last.content === text) return;
    out.push({ role: r, content: text });
  };
  for (const msg of dbHistory || []) push(msg.role, msg.content || msg.body || msg.text);
  for (const msg of clientHistory || []) push(msg.role, msg.content || msg.body || msg.text);
  return out.slice(-HISTORY_LIMIT);
}

function parseAskArgs(roleOrHistory, position, conversationHistory) {
  if (Array.isArray(roleOrHistory) || (roleOrHistory == null && position == null && conversationHistory == null)) {
    return { role: null, position: null, history: roleOrHistory || [] };
  }
  if (roleOrHistory && typeof roleOrHistory === 'object' && !Array.isArray(roleOrHistory)) {
    return {
      role: roleOrHistory.main_role || roleOrHistory.role || null,
      position: roleOrHistory.position || null,
      history: Array.isArray(position) ? position : conversationHistory || [],
    };
  }
  return {
    role: roleOrHistory || null,
    position: position ?? null,
    history: conversationHistory || [],
  };
}

function fallbackFromEnrichment(msg, enrichment) {
  const deletions = enrichment?.results?.recent_deletions;
  if (deletions?.deletions?.length) {
    const lines = deletions.deletions.slice(0, 8).map((d, i) => {
      const when = d.timestamp ? new Date(d.timestamp).toLocaleString() : 'unknown time';
      return `${i + 1}. **${d.user_name || 'Someone'}** deleted **${d.target || d.action}** (${d.action}) — ${when}`;
    });
    return `Here are the recent deletions I found:\n\n${lines.join('\n')}\n\nFull trail: [Audit Logs](/audit-logs)`;
  }
  if (deletions && /\bdelet/i.test(msg)) {
    return deletions.summary || 'I could not find any recent deletions in audit logs or soft-deleted records.';
  }
  const logs = enrichment?.results?.audit_logs?.logs || enrichment?.results?.audit_logs_broad?.logs;
  if (logs?.length) {
    const lines = logs.slice(0, 6).map((l, i) => {
      const when = l.timestamp ? new Date(l.timestamp).toLocaleString() : '';
      const item = l.item_name || l.details?.item_name || l.action;
      const qty =
        l.old_quantity !== undefined && l.new_quantity !== undefined
          ? ` (qty ${l.old_quantity} → ${l.new_quantity})`
          : '';
      return `${i + 1}. **${l.user_name}** — ${l.action}: ${item}${qty} — ${when}`;
    });
    return `From the audit trail:\n\n${lines.join('\n')}\n\n[Open Audit Logs](/audit-logs)`;
  }
  return null;
}

export async function askVobi(userMessage, userId, roleOrHistory, position, conversationHistory, pageContext = null) {
  const { role, position: pos, history } = parseAskArgs(roleOrHistory, position, conversationHistory);
  try {
    const systemData = await getVobiSystemData(userId, role, pos);
    if (pageContext) {
      systemData.current_page = pageContext.page || null;
      systemData.live_ui_snapshot = pageContext.liveUi || null;
      if (pageContext.related_docs) systemData.related_docs = pageContext.related_docs;
    }
    const msg = String(userMessage || '').trim();
    const toolCtx = {
      userId,
      role: systemData?.role_context?.role || role,
      position: systemData?.role_context?.position || pos,
      units: systemData?.role_context?.units || [],
      is_system_admin: Boolean(systemData?.role_context?.is_system_admin),
      full_name: systemData?.role_context?.full_name,
      first_name: systemData?.role_context?.first_name,
      last_name: systemData?.role_context?.last_name,
    };

    // Ticket deep-dive
    const ticketRef =
      msg.match(/\bTCK-?\d{3,}\b/i)?.[0] ||
      msg.match(/\bticket\s*(?:#|number|id)?\s*[:#]?\s*(TCK-?\d{3,}|\d{3,})\b/i)?.[1];
    if (ticketRef) {
      try {
        const details = await executeVobiTool('get_ticket', { ticket_id: ticketRef }, toolCtx);
        if (details?.ok) {
          systemData.focused_ticket_report = details;
          systemData.instruction_extra =
            'The user asked about a specific ticket. Prefer focused_ticket_report.';
        }
      } catch (e) {
        console.warn('[vobi] ticket lookup failed:', e.message);
      }
    }

    // Server-side tools (reliable — Gemini flash-lite rejects function roles)
    let enrichment = null;
    try {
      enrichment = await gatherVobiToolContext(msg, toolCtx);
      if (/\b(delet|remov)/i.test(msg)) {
        const deletions = await getRecentDeletions({ hours: 720, limit: 25 });
        enrichment = enrichment || { source: 'server_tool_router', results: {} };
        enrichment.results.recent_deletions = deletions;
      }
      if (enrichment) {
        systemData.tool_lookup_results = enrichment.results;
        systemData.instruction_extra = [
          systemData.instruction_extra || '',
          'Use TOOL LOOKUP RESULTS / tool_lookup_results as authoritative facts for this question.',
          formatToolEnrichmentForPrompt(enrichment),
        ]
          .filter(Boolean)
          .join('\n');
      }
    } catch (e) {
      console.warn('[vobi] tool router:', e.message);
    }

    // Persistent memory + older conversation snippets (this user only)
    try {
      const memoryCtx = await buildMemoryContextForPrompt(userId, msg);
      systemData.user_memory = memoryCtx;
      if (memoryCtx.preferred_name_from_memory && systemData.role_context) {
        systemData.role_context.preferred_name = memoryCtx.preferred_name_from_memory;
        systemData.role_context.first_name = memoryCtx.preferred_name_from_memory;
      }
    } catch (e) {
      console.warn('[vobi] memory context:', e.message);
    }

    const genAI = getClient();
    const chatHistory = normalizeHistory(history);
    const preferred = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const models = [...new Set([preferred, ...MODEL_FALLBACKS])];
    let lastError;

    const systemInstruction = buildVobiSystemPrompt(systemData);

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction,
        });
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(msg);
        const text = (result.response.text() || '').trim();
        if (text) return text;

        // Empty model reply — answer from tool data directly
        const fallback = fallbackFromEnrichment(msg, enrichment);
        if (fallback) return fallback;
        return "I looked that up but didn't get a clear answer. Try asking with a bit more detail, or open [Audit Logs](/audit-logs).";
      } catch (error) {
        lastError = error;
        const status = error.status || error.statusCode;
        if (status === 404) {
          console.warn('[vobi] model unavailable, trying next:', modelName);
          continue;
        }
        // On model failure, still try deterministic fallback
        const fallback = fallbackFromEnrichment(msg, enrichment);
        if (fallback) return fallback;
        throw error;
      }
    }
    const fallback = fallbackFromEnrichment(msg, enrichment);
    if (fallback) return fallback;
    throw lastError;
  } catch (error) {
    console.error('Gemini/Vobi error:', error);
    const status = error.status || error.statusCode || error.httpStatusCode;
    if (status === 503 && /GEMINI_API_KEY/.test(error.message || '')) {
      return "I'm not fully configured yet. Ask your administrator to set the Vobi API key.";
    }
    if (status === 429) {
      return "I'm handling a lot right now. Give me a moment and try again.";
    }
    if (status === 400) {
      return "I couldn't process that request. Try rephrasing.";
    }
    return "I'm having trouble connecting right now. Please try again shortly.";
  }
}
