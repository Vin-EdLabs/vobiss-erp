import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildVobiSystemPrompt } from './vobiPrompt.js';
import { getVobiSystemData } from './vobiDataService.js';
import pool from '../db.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MODEL_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];

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
    .slice(-10)
    .map((msg) => ({
      role: msg.role === 'assistant' || msg.role === 'model' || msg.message_type === 'vobi' ? 'model' : 'user',
      parts: [{ text: String(msg.content || msg.body || '').trim() }],
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

export async function loadVobiConversationHistory(userId) {
  try {
    const uid = Number.parseInt(String(userId), 10);
    if (!Number.isFinite(uid) || uid < 1) return [];
    const { rows } = await pool.query(
      `SELECT m.body, m.message_type, m.sender_id
         FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi' AND c.vobi_user_id = $1
        ORDER BY m.created_at DESC
        LIMIT 10`,
      [uid]
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

export async function askVobi(userMessage, userId, roleOrHistory, position, conversationHistory) {
  const { role, position: pos, history } = parseAskArgs(roleOrHistory, position, conversationHistory);
  try {
    const systemData = await getVobiSystemData(userId, role, pos);
    const genAI = getClient();
    const chatHistory = normalizeHistory(history);
    const preferred = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const models = [...new Set([preferred, ...MODEL_FALLBACKS])];
    let lastError;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: buildVobiSystemPrompt(systemData),
        });
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(String(userMessage || '').trim());
        const response = await result.response;
        return (response.text() || '').trim();
      } catch (error) {
        lastError = error;
        const status = error.status || error.statusCode;
        if (status === 404) {
          console.warn('[vobi] model unavailable, trying next:', modelName);
          continue;
        }
        throw error;
      }
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
    return "I'm having trouble connecting right now. Please try again shortly.";
  }
}
