/**
 * Vobi persistent memory — strictly scoped to authenticated user_id.
 * Conversation history stays in chat_messages; this layer stores structured facts.
 */
import pool from '../db.js';

const MEMORY_TYPES = new Set([
  'preference',
  'work_context',
  'active_task',
  'long_term',
  'useful_fact',
]);

let schemaReady = false;

export async function ensureVobiMemorySchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vobi_user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vobi_memories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      memory_type TEXT NOT NULL DEFAULT 'useful_fact',
      memory_content TEXT NOT NULL,
      source_channel_id UUID,
      source_message_id UUID,
      confidence REAL NOT NULL DEFAULT 0.7,
      importance TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'active',
      expiration_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CHECK (memory_type IN ('preference','work_context','active_task','long_term','useful_fact')),
      CHECK (status IN ('active','pending','dismissed','expired')),
      CHECK (importance IN ('low','medium','high'))
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_vobi_memories_user_status
      ON vobi_memories (user_id, status, updated_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vobi_conversation_summaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id UUID,
      summary_text TEXT NOT NULL,
      topics TEXT[] DEFAULT '{}',
      entities TEXT[] DEFAULT '{}',
      message_count INTEGER DEFAULT 0,
      from_message_at TIMESTAMPTZ,
      to_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_vobi_summaries_user
      ON vobi_conversation_summaries (user_id, created_at DESC)
  `);
  schemaReady = true;
}

function uid(userId) {
  const n = Number.parseInt(String(userId), 10);
  if (!Number.isFinite(n) || n < 1) {
    const err = new Error('Invalid user');
    err.status = 400;
    throw err;
  }
  return n;
}

export async function getMemorySettings(userId) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const { rows } = await pool.query(
    `SELECT memory_enabled FROM vobi_user_settings WHERE user_id = $1`,
    [id]
  );
  return { memory_enabled: rows[0] ? Boolean(rows[0].memory_enabled) : true };
}

export async function setMemoryEnabled(userId, enabled) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  await pool.query(
    `INSERT INTO vobi_user_settings (user_id, memory_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET memory_enabled = EXCLUDED.memory_enabled, updated_at = NOW()`,
    [id, Boolean(enabled)]
  );
  return getMemorySettings(id);
}

export async function listMemories(userId, { status = 'active', limit = 100 } = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, memory_type, memory_content, source_channel_id, source_message_id,
            confidence, importance, status, expiration_at, created_at, updated_at
       FROM vobi_memories
      WHERE user_id = $1
        AND ($2::text IS NULL OR status = $2)
        AND (expiration_at IS NULL OR expiration_at > NOW())
      ORDER BY
        CASE importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT $3`,
    [id, status || null, lim]
  );
  return rows;
}

function asUuidOrNull(value) {
  const s = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
    return null;
  }
  return s;
}

export async function createMemory(userId, payload = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const content = String(payload.memory_content || payload.content || '').trim();
  if (!content || content.length < 3) {
    const err = new Error('Memory content is required');
    err.status = 400;
    throw err;
  }
  const type = MEMORY_TYPES.has(payload.memory_type) ? payload.memory_type : 'useful_fact';
  const status = ['active', 'pending', 'dismissed'].includes(payload.status) ? payload.status : 'active';
  const importance = ['low', 'medium', 'high'].includes(payload.importance) ? payload.importance : 'medium';
  const confidence = Math.min(1, Math.max(0, Number(payload.confidence) || 0.8));
  const sourceChannelId = asUuidOrNull(payload.source_channel_id);
  const sourceMessageId = asUuidOrNull(payload.source_message_id);

  // Dedupe near-identical active/pending memories for this user
  const { rows: existing } = await pool.query(
    `SELECT id, status FROM vobi_memories
      WHERE user_id = $1 AND status IN ('active', 'pending')
        AND lower(memory_content) = lower($2)
      LIMIT 1`,
    [id, content]
  );
  if (existing[0]) {
    const { rows } = await pool.query(
      `UPDATE vobi_memories
          SET updated_at = NOW(),
              confidence = GREATEST(confidence, $2),
              importance = $3,
              memory_type = $4,
              status = CASE
                WHEN $5::text = 'active' OR status = 'active' THEN 'active'
                ELSE status
              END
        WHERE id = $1 AND user_id = $6
      RETURNING *`,
      [existing[0].id, confidence, importance, type, status, id]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO vobi_memories (
       user_id, memory_type, memory_content, source_channel_id, source_message_id,
       confidence, importance, status, expiration_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      id,
      type,
      content,
      sourceChannelId,
      sourceMessageId,
      confidence,
      importance,
      status,
      payload.expiration_at || null,
    ]
  );
  return rows[0];
}

export async function updateMemory(userId, memoryId, patch = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const mid = Number.parseInt(String(memoryId), 10);
  if (!Number.isFinite(mid)) {
    const err = new Error('Invalid memory id');
    err.status = 400;
    throw err;
  }
  const fields = [];
  const vals = [];
  let i = 1;
  if (patch.memory_content != null) {
    fields.push(`memory_content = $${i++}`);
    vals.push(String(patch.memory_content).trim());
  }
  if (MEMORY_TYPES.has(patch.memory_type)) {
    fields.push(`memory_type = $${i++}`);
    vals.push(patch.memory_type);
  }
  if (['active', 'pending', 'dismissed', 'expired'].includes(patch.status)) {
    fields.push(`status = $${i++}`);
    vals.push(patch.status);
  }
  if (['low', 'medium', 'high'].includes(patch.importance)) {
    fields.push(`importance = $${i++}`);
    vals.push(patch.importance);
  }
  if (!fields.length) {
    const err = new Error('Nothing to update');
    err.status = 400;
    throw err;
  }
  fields.push('updated_at = NOW()');
  vals.push(mid, id);
  const { rows } = await pool.query(
    `UPDATE vobi_memories SET ${fields.join(', ')}
      WHERE id = $${i++} AND user_id = $${i}
    RETURNING *`,
    vals
  );
  if (!rows[0]) {
    const err = new Error('Memory not found');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

export async function deleteMemory(userId, memoryId) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const mid = Number.parseInt(String(memoryId), 10);
  const { rowCount } = await pool.query(
    `DELETE FROM vobi_memories WHERE id = $1 AND user_id = $2`,
    [mid, id]
  );
  if (!rowCount) {
    const err = new Error('Memory not found');
    err.status = 404;
    throw err;
  }
  return { deleted: true };
}

export async function clearAllMemories(userId) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const { rowCount } = await pool.query(`DELETE FROM vobi_memories WHERE user_id = $1`, [id]);
  return { deleted: rowCount };
}

export async function confirmMemory(userId, memoryId) {
  return updateMemory(userId, memoryId, { status: 'active' });
}

export async function dismissMemory(userId, memoryId) {
  return updateMemory(userId, memoryId, { status: 'dismissed' });
}

/** Keyword / recency search over this user's older Vobi messages (never other users). */
export async function searchUserConversationContext(userId, query, { limit = 8 } = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const tokens = q
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
    .slice(0, 8);
  if (!tokens.length) return [];

  const likeParams = tokens.map((t) => `%${t}%`);
  const likeClauses = likeParams.map((_, i) => `m.body ILIKE $${i + 2}`).join(' OR ');

  const { rows } = await pool.query(
    `SELECT m.body, m.message_type, m.sender_id, m.created_at
       FROM chat_messages m
       JOIN chat_channels c ON c.id = m.channel_id
      WHERE c.channel_type = 'vobi'
        AND c.vobi_user_id = $1
        AND (${likeClauses})
      ORDER BY m.created_at DESC
      LIMIT $${likeParams.length + 2}`,
    [id, ...likeParams, Math.min(Math.max(Number(limit) || 8, 1), 20)]
  );

  return rows.map((r) => ({
    role: r.message_type === 'vobi' || r.sender_id == null ? 'assistant' : 'user',
    content: String(r.body || '').slice(0, 500),
    created_at: r.created_at,
  }));
}

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'what', 'when',
  'where', 'which', 'about', 'would', 'could', 'should', 'there', 'their',
  'your', 'you', 'are', 'was', 'were', 'been', 'into', 'just', 'like', 'also',
  'vobi', 'please', 'show', 'tell', 'give', 'help', 'need', 'want',
]);

export async function getRelevantMemories(userId, query, { limit = 12 } = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const settings = await getMemorySettings(id);
  if (!settings.memory_enabled) return [];

  const all = await listMemories(id, { status: 'active', limit: 80 });
  if (!all.length) return [];

  const q = String(query || '').toLowerCase();
  const tokens = q
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));

  const scored = all.map((m) => {
    const text = String(m.memory_content || '').toLowerCase();
    let score = Number(m.confidence) || 0.5;
    if (m.importance === 'high') score += 0.25;
    if (m.importance === 'medium') score += 0.1;
    if (m.memory_type === 'preference') score += 0.15;
    if (m.memory_type === 'active_task') score += 0.2;
    for (const t of tokens) {
      if (text.includes(t)) score += 0.35;
    }
    // Recency boost
    const ageMs = Date.now() - new Date(m.updated_at || m.created_at).getTime();
    if (ageMs < 7 * 864e5) score += 0.15;
    return { ...m, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);
  // Always include preferences + high importance even if query mismatch
  const prefs = scored.filter((m) => m.memory_type === 'preference' || m.importance === 'high');
  const top = scored.slice(0, limit);
  const merged = [...prefs, ...top].filter(
    (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i
  );
  return merged.slice(0, limit).map(({ _score, ...rest }) => rest);
}

export async function getLatestSummaries(userId, limit = 3) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const { rows } = await pool.query(
    `SELECT id, summary_text, topics, entities, message_count, created_at
       FROM vobi_conversation_summaries
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [id, Math.min(Math.max(Number(limit) || 3, 1), 10)]
  );
  return rows;
}

/** Lightweight rolling summary from recent user turns (no extra LLM call). */
export async function maybeRefreshConversationSummary(userId) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS n, MIN(m.created_at) AS first_at, MAX(m.created_at) AS last_at,
            c.id AS channel_id
       FROM chat_messages m
       JOIN chat_channels c ON c.id = m.channel_id
      WHERE c.channel_type = 'vobi' AND c.vobi_user_id = $1
      GROUP BY c.id`,
    [id]
  );
  const meta = countRows[0];
  if (!meta || meta.n < 20) return null;

  const { rows: recent } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM vobi_conversation_summaries
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [id]
  );
  if ((recent[0]?.n || 0) > 0 && meta.n % 40 !== 0) return null;

  const { rows: msgs } = await pool.query(
    `SELECT m.body, m.message_type, m.sender_id
       FROM chat_messages m
       JOIN chat_channels c ON c.id = m.channel_id
      WHERE c.channel_type = 'vobi' AND c.vobi_user_id = $1
        AND m.sender_id IS NOT NULL
      ORDER BY m.created_at DESC
      LIMIT 30`,
    [id]
  );
  const userLines = msgs
    .reverse()
    .map((m) => String(m.body || '').trim())
    .filter(Boolean)
    .slice(-12);
  if (userLines.length < 4) return null;

  const topics = extractTopics(userLines.join(' '));
  const summary_text = [
    'Conversation summary:',
    ...userLines.slice(-6).map((l) => `- ${l.slice(0, 160)}`),
  ].join('\n');

  const { rows } = await pool.query(
    `INSERT INTO vobi_conversation_summaries
       (user_id, channel_id, summary_text, topics, entities, message_count, from_message_at, to_message_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      id,
      meta.channel_id,
      summary_text,
      topics,
      [],
      meta.n,
      meta.first_at,
      meta.last_at,
    ]
  );
  return rows[0];
}

function extractTopics(text) {
  const topics = [];
  const checks = [
    [/inventor/i, 'inventory'],
    [/ticket|TCK-/i, 'tickets'],
    [/payroll|salary/i, 'payroll'],
    [/approv/i, 'approvals'],
    [/client|site|CRM/i, 'clients'],
    [/asset/i, 'assets'],
    [/deploy|fibre|fiber|tema/i, 'deployment'],
    [/memory|vobi/i, 'vobi'],
  ];
  for (const [re, label] of checks) {
    if (re.test(text)) topics.push(label);
  }
  return topics.slice(0, 8);
}

/**
 * Detect memory candidates from a user message.
 * High-confidence preferences can auto-save; others return pending for confirmation.
 */
export function extractMemoryCandidates(userMessage) {
  const text = String(userMessage || '').trim();
  if (!text || text.length < 8) return [];

  const candidates = [];
  const push = (memory_type, memory_content, confidence, importance, autoSave = false) => {
    const content = String(memory_content || '').trim();
    if (!content || content.length < 8) return;
    candidates.push({ memory_type, memory_content: content, confidence, importance, autoSave });
  };

  // Normalize curly apostrophes
  const normalized = text.replace(/[\u2018\u2019]/g, "'");

  let m;
  if ((m = normalized.match(/\b(?:call me|please call me|my name is|i go by)\s+([A-Z][a-zA-Z'-]{1,30})\b/i))) {
    push('preference', `User prefers to be called ${m[1]}.`, 0.95, 'high', true);
  }
  if ((m = normalized.match(/\bi(?:'m| am)(?:\s+\w+){0,3}\s+responsible for\s+(.+?)(?:[.!?]|$)/i))) {
    push('work_context', `User is responsible for ${cleanClause(m[1])}.`, 0.88, 'high', false);
  }
  if ((m = normalized.match(/\bi(?:'m| am)(?:\s+\w+){0,2}\s+(?:working on|handling|leading|focusing on)\s+(.+?)(?:[.!?]|$)/i))) {
    push('active_task', `User is currently working on ${cleanClause(m[1])}.`, 0.85, 'high', false);
  }
  if ((m = normalized.match(/\bi prefer\s+(.+?)(?:[.!?]|$)/i))) {
    push('preference', `User prefers ${cleanClause(m[1])}.`, 0.9, 'medium', true);
  }
  if ((m = normalized.match(/\bmy (?:current )?project is\s+(.+?)(?:[.!?]|$)/i))) {
    push('work_context', `User's current project is ${cleanClause(m[1])}.`, 0.88, 'high', false);
  }
  if ((m = normalized.match(/\bi(?:'m| am) interested in\s+(.+?)(?:[.!?]|$)/i))) {
    push('long_term', `User is interested in ${cleanClause(m[1])}.`, 0.8, 'medium', false);
  }
  if ((m = normalized.match(/\bkeep in mind that\s+(.+?)(?:[.!?]|$)/i))) {
    push('useful_fact', cleanClause(m[1]), 0.82, 'medium', false);
  }
  if ((m = normalized.match(/\bremember (?:that |this[: ]?)(.+?)(?:[.!?]|$)/i))) {
    push('useful_fact', cleanClause(m[1]), 0.92, 'high', true);
  }
  if ((m = normalized.match(/\bi(?:'m| am) (?:the |a )?([\w\s/-]{3,60}?)(?:\s+for\s+|\s+at\s+)(.+?)(?:[.!?]|$)/i))) {
    const roleish = cleanClause(m[1]);
    const scope = cleanClause(m[2]);
    if (roleish && scope && !/sure|fine|ready|here|back/i.test(roleish)) {
      push('work_context', `User is ${roleish} for ${scope}.`, 0.78, 'medium', false);
    }
  }

  // Deduplicate by content
  const seen = new Set();
  return candidates.filter((c) => {
    const key = c.memory_content.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanClause(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^(that|this|the)\s+/i, '')
    .trim()
    .replace(/[.!?]+$/, '');
}

/** Handle "forget that…" / "forget I'm working on…" */
export async function tryForgetFromMessage(userId, userMessage) {
  const text = String(userMessage || '').trim();
  const forget =
    text.match(/\bforget (?:that |about )(.+?)(?:[.!?]|$)/i) ||
    text.match(/\bdon'?t remember (?:that )?(.+?)(?:[.!?]|$)/i) ||
    text.match(/\bremove (?:from memory|memory of)\s+(.+?)(?:[.!?]|$)/i) ||
    text.match(/\bforget (?:i(?:'m| am) .+?)(?:[.!?]|$)/i);
  if (!forget) return null;

  const needle = cleanClause(forget[1]).toLowerCase();
  if (!needle || needle.length < 3) return null;

  const memories = await listMemories(userId, { status: 'active', limit: 100 });
  const matches = memories.filter((m) => {
    const c = String(m.memory_content || '').toLowerCase();
    return c.includes(needle) || needle.split(/\s+/).filter((t) => t.length > 3).some((t) => c.includes(t));
  });

  if (!matches.length) {
    return {
      forgot: false,
      reply: "I don't have a saved memory that matches that. If you tell me which fact to clear, I can remove it.",
    };
  }

  for (const mem of matches) {
    await deleteMemory(userId, mem.id);
  }
  return {
    forgot: true,
    deleted: matches.length,
    reply: `Done — I removed ${matches.length} saved memor${matches.length === 1 ? 'y' : 'ies'} related to that.`,
  };
}

/**
 * Persist candidates: auto-save high confidence; others as pending + confirmation prompt.
 */
export async function processMemoryAfterTurn(userId, userMessage, { channelId, messageId } = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const settings = await getMemorySettings(id);
  if (!settings.memory_enabled) {
    return { memoryCandidates: [], confirmationPrompt: null, autoSaved: [] };
  }

  const forget = await tryForgetFromMessage(id, userMessage);
  if (forget) {
    return {
      memoryCandidates: [],
      confirmationPrompt: null,
      autoSaved: [],
      forgetReply: forget.reply,
      forgot: forget.forgot,
    };
  }

  const extracted = extractMemoryCandidates(userMessage);
  const autoSaved = [];
  const pending = [];

  for (const c of extracted) {
    if (c.autoSave && c.confidence >= 0.9) {
      const row = await createMemory(id, {
        ...c,
        status: 'active',
        source_channel_id: channelId || null,
        source_message_id: messageId || null,
      });
      autoSaved.push(row);
    } else if (c.confidence >= 0.75) {
      const row = await createMemory(id, {
        ...c,
        status: 'pending',
        source_channel_id: channelId || null,
        source_message_id: messageId || null,
      });
      pending.push(row);
    }
  }

  let confirmationPrompt = null;
  if (pending[0]) {
    const fact = pending[0].memory_content.replace(/^User\s+/i, 'you ');
    confirmationPrompt = {
      memoryId: pending[0].id,
      text: `Got it. Would you like me to remember that ${fact.replace(/\.$/, '')} so I can keep it in context in future conversations?`,
      memory_content: pending[0].memory_content,
    };
  }

  // Fire-and-forget summary refresh
  maybeRefreshConversationSummary(id).catch(() => {});

  return { memoryCandidates: pending, confirmationPrompt, autoSaved };
}

/** Bundle for askVobi prompt injection — always user-scoped. */
export async function buildMemoryContextForPrompt(userId, userMessage, options = {}) {
  await ensureVobiMemorySchema();
  const id = uid(userId);
  const light = Boolean(options.light);
  const settings = await getMemorySettings(id);
  const memories = settings.memory_enabled
    ? await getRelevantMemories(id, userMessage, { limit: light ? 4 : 12 })
    : [];
  const summaries = light ? [] : await getLatestSummaries(id, 2);
  const olderSnippets = light
    ? []
    : await searchUserConversationContext(id, userMessage, { limit: 6 });

  const preferred = memories.find((m) =>
    /prefers to be called|call me/i.test(m.memory_content)
  );
  let preferredName = null;
  if (preferred) {
    const m = preferred.memory_content.match(/called\s+([A-Za-z'-]+)/i);
    if (m) preferredName = m[1];
  }

  return {
    memory_enabled: settings.memory_enabled,
    persistent_memories: memories.map((m) => ({
      id: m.id,
      type: m.memory_type,
      content: m.memory_content,
      importance: m.importance,
      confidence: m.confidence,
    })),
    conversation_summaries: summaries.map((s) => ({
      summary: s.summary_text,
      topics: s.topics,
      at: s.created_at,
    })),
    relevant_older_turns: olderSnippets,
    preferred_name_from_memory: preferredName,
  };
}
