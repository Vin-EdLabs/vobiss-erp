import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildVobiSystemPrompt } from './vobiPrompt.js';
import { getVobiSystemData, getVobiLightSystemData } from './vobiDataService.js';
import { executeVobiTool } from './vobiTools.js';
import { gatherVobiToolContext, formatToolEnrichmentForPrompt } from './vobiToolRouter.js';
import { getRecentDeletions } from './vobiDeletions.js';
import { buildMemoryContextForPrompt } from './vobiMemory.js';
import pool from '../db.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MODEL_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.6-flash'];
const HISTORY_LIMIT = 28;
const LIGHT_TIMEOUT_MS = 12000;
const NORMAL_TIMEOUT_MS = 22000;
const KEY_COOLDOWN_MS = 2 * 60 * 1000; // 2 min after full key failure
const MODEL_COOLDOWN_MS = 10 * 60 * 1000; // 10 min per model after quota

/** @type {{ key: string, label: string, coolUntil: number }[]} */
let apiKeyPool = null;
let activeKeyIndex = 0;
/** @type {Map<string, number>} keyIndex:modelName -> coolUntil */
const modelCooldownUntil = new Map();

function loadApiKeyPool() {
  if (apiKeyPool) return apiKeyPool;
  const collected = [];
  const push = (raw, label) => {
    const key = String(raw || '').trim();
    if (!key || key === 'your_key_here') return;
    if (collected.some((k) => k.key === key)) return;
    collected.push({ key, label, coolUntil: 0 });
  };

  push(process.env.GEMINI_API_KEY, 'key1');
  push(process.env.GEMINI_API_KEY_2, 'key2');
  push(process.env.GEMINI_API_KEY_BACKUP, 'backup');
  String(process.env.GEMINI_API_KEYS || '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .forEach((k, i) => push(k, `keys[${i}]`));

  apiKeyPool = collected;
  return apiKeyPool;
}

function maskKey(key) {
  const s = String(key || '');
  if (s.length < 10) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function modelCoolKey(keyIdx, modelName) {
  return `${keyIdx}:${modelName}`;
}

function isModelCooling(keyIdx, modelName) {
  const until = modelCooldownUntil.get(modelCoolKey(keyIdx, modelName)) || 0;
  return until > Date.now();
}

function markModelCooling(keyIdx, modelName, reason) {
  modelCooldownUntil.set(modelCoolKey(keyIdx, modelName), Date.now() + MODEL_COOLDOWN_MS);
  console.warn(
    `[vobi] cooling model ${modelName} on key#${keyIdx + 1} for ${MODEL_COOLDOWN_MS / 1000}s — ${reason}`
  );
}

function extractRetryMs(error) {
  const msg = String(error?.message || '');
  const m = msg.match(/retry in ([\d.]+)\s*s/i);
  if (m) return Math.min(Math.ceil(parseFloat(m[1]) * 1000) + 500, 30000);
  const details = error?.errorDetails;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d?.retryDelay) {
        const sec = parseFloat(String(d.retryDelay).replace(/s$/i, ''));
        if (Number.isFinite(sec)) return Math.min(Math.ceil(sec * 1000) + 500, 30000);
      }
    }
  }
  return 0;
}

function isQuotaOrRateLimitError(error) {
  const status = error?.status || error?.statusCode || error?.httpStatusCode;
  const msg = String(error?.message || error || '').toLowerCase();
  if (status === 429) return true;
  if (/resource_exhausted|quota|rate[\s_-]?limit|too many requests|billing|exhausted/i.test(msg)) return true;
  return false;
}

function isModelSpecificQuota(error) {
  const msg = String(error?.message || '');
  return /GenerateRequestsPerDayPerProjectPerModel|quotaDimensions[\s\S]*model|limit:.*model:/i.test(msg);
}

function isSwitchableKeyError(error) {
  if (isQuotaOrRateLimitError(error)) return true;
  const status = error?.status || error?.statusCode || error?.httpStatusCode;
  if (status === 401 || status === 403) return true;
  const msg = String(error?.message || error || '').toLowerCase();
  if (/api[_ ]?key|permission|unauthorized|forbidden|invalid.*key/i.test(msg)) return true;
  if (/fetch failed|network|econnreset|etimedout/i.test(msg)) return true;
  return false;
}

function orderedKeyIndexes() {
  const pool = loadApiKeyPool();
  const now = Date.now();
  const idxs = pool.map((_, i) => i);
  idxs.sort((a, b) => {
    const aCool = pool[a].coolUntil > now ? 1 : 0;
    const bCool = pool[b].coolUntil > now ? 1 : 0;
    if (aCool !== bCool) return aCool - bCool;
    if (a === activeKeyIndex) return -1;
    if (b === activeKeyIndex) return 1;
    return a - b;
  });
  return idxs;
}

function markKeyCooling(index, reason) {
  const pool = loadApiKeyPool();
  if (!pool[index]) return;
  pool[index].coolUntil = Date.now() + KEY_COOLDOWN_MS;
  console.warn(
    `[vobi] cooling ${pool[index].label} (${maskKey(pool[index].key)}) for ${KEY_COOLDOWN_MS / 1000}s — ${reason}`
  );
}

function getClientForKey(key) {
  if (!key) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return new GoogleGenerativeAI(key);
}

function isLightMessage(msg) {
  const t = String(msg || '').trim();
  if (!t) return true;
  if (t.length > 80) return false;
  if (/^(hi|hey|hello|yo|sup|thanks|thank you|ok|okay|cool|good\s*(morning|afternoon|evening)|bye|goodbye)[\s!.?]*$/i.test(t)) {
    return true;
  }
  if (/^(how are you|what'?s up|who are you|about vobi)\b/i.test(t) && t.length < 40) {
    return true;
  }
  return false;
}

function withTimeout(promise, ms, label = 'vobi') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`${label} timed out after ${ms}ms`);
        err.status = 504;
        reject(err);
      }, ms);
    }),
  ]);
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
    const msg = String(userMessage || '').trim();
    const light = isLightMessage(msg) && !pageContext;

    const systemData = light
      ? await getVobiLightSystemData(userId, role, pos)
      : await getVobiSystemData(userId, role, pos);

    if (pageContext) {
      systemData.current_page = pageContext.page || null;
      systemData.live_ui_snapshot = pageContext.liveUi || null;
      if (pageContext.related_docs) systemData.related_docs = pageContext.related_docs;
    }

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

    let enrichment = null;

    if (!light) {
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
    }

    try {
      const memoryCtx = await buildMemoryContextForPrompt(userId, msg, { light });
      systemData.user_memory = memoryCtx;
      if (memoryCtx.preferred_name_from_memory && systemData.role_context) {
        systemData.role_context.preferred_name = memoryCtx.preferred_name_from_memory;
        systemData.role_context.first_name = memoryCtx.preferred_name_from_memory;
      }
    } catch (e) {
      console.warn('[vobi] memory context:', e.message);
    }

    const pool = loadApiKeyPool();
    if (!pool.length) {
      const err = new Error('GEMINI_API_KEY is not configured');
      err.status = 503;
      throw err;
    }

    const chatHistory = light ? normalizeHistory(history).slice(-6) : normalizeHistory(history);
    const preferred = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    // Always prefer flash-lite first (higher free quota); keep 3.6 as secondary
    const models = [...new Set([
      preferred,
      'gemini-flash-lite-latest',
      ...MODEL_FALLBACKS,
    ])];
    let lastError;
    const timeoutMs = light ? LIGHT_TIMEOUT_MS : NORMAL_TIMEOUT_MS;

    const systemInstruction = buildVobiSystemPrompt(systemData);
    const keyOrder = orderedKeyIndexes();

    for (const keyIdx of keyOrder) {
      const entry = pool[keyIdx];
      const genAI = getClientForKey(entry.key);
      let keyHadModelSuccessPath = false;

      for (const modelName of models) {
        if (isModelCooling(keyIdx, modelName)) {
          console.warn(`[vobi] skip cooled model ${modelName} on ${entry.label}`);
          continue;
        }
        keyHadModelSuccessPath = true;
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
          });
          const chat = model.startChat({ history: chatHistory });
          const result = await withTimeout(
            chat.sendMessage(msg),
            timeoutMs,
            `gemini:${entry.label}:${modelName}`
          );
          const text = (result.response.text() || '').trim();
          if (text) {
            activeKeyIndex = keyIdx;
            entry.coolUntil = 0;
            return text;
          }

          const fallback = fallbackFromEnrichment(msg, enrichment);
          if (fallback) return fallback;
          if (light) {
            const name = systemData?.role_context?.preferred_name || systemData?.role_context?.first_name || 'there';
            return `Hi ${name} — I'm here. What do you need?`;
          }
          return "I looked that up but didn't get a clear answer. Try asking with a bit more detail, or open [Audit Logs](/audit-logs).";
        } catch (error) {
          lastError = error;
          const status = error.status || error.statusCode;

          // Model-specific daily quota → cool THIS model only, try next model on same key
          if (isQuotaOrRateLimitError(error) && isModelSpecificQuota(error)) {
            markModelCooling(keyIdx, modelName, String(error.message || 'model quota').slice(0, 100));
            console.warn(`[vobi] ${entry.label} quota on ${modelName} — trying next model`);
            continue;
          }

          // Short rate-limit with retry delay → brief wait then try next model/key
          if (isQuotaOrRateLimitError(error)) {
            const waitMs = extractRetryMs(error);
            markModelCooling(keyIdx, modelName, String(error.message || '429').slice(0, 100));
            if (waitMs > 0 && waitMs <= 12000) {
              console.warn(`[vobi] brief retry wait ${waitMs}ms after 429 on ${modelName}`);
              await new Promise((r) => setTimeout(r, waitMs));
            }
            console.warn(`[vobi] ${entry.label} rate-limited on ${modelName} — trying next model`);
            continue;
          }

          if (status === 404 || status === 504) {
            markModelCooling(keyIdx, modelName, String(error.message || status).slice(0, 100));
            console.warn('[vobi] model unavailable/timeout, trying next:', modelName, error.message);
            continue;
          }

          if (isSwitchableKeyError(error)) {
            markKeyCooling(keyIdx, String(error.message || status || 'key error').slice(0, 120));
            console.warn(`[vobi] switching API key after ${entry.label} failed on ${modelName}`);
            break;
          }

          const fallback = fallbackFromEnrichment(msg, enrichment);
          if (fallback) return fallback;
          markKeyCooling(keyIdx, String(error.message || 'unknown').slice(0, 120));
          break;
        }
      }

      if (!keyHadModelSuccessPath) {
        markKeyCooling(keyIdx, 'all models cooling');
      }
    }

    const fallback = fallbackFromEnrichment(msg, enrichment);
    if (fallback) return fallback;
    if (light) {
      const name = systemData?.role_context?.preferred_name || systemData?.role_context?.first_name || 'there';
      return `Hi ${name} — I'm here. What do you need?`;
    }
    if (lastError && isQuotaOrRateLimitError(lastError)) {
      return "I've hit the AI usage limit for now. Please try again in a few minutes — I'll switch models/keys automatically when quota frees up.";
    }
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
    if (status === 504) {
      return "That took too long on my side. Try again with a shorter question.";
    }
    return "I'm having trouble connecting right now. Please try again shortly.";
  }
}
