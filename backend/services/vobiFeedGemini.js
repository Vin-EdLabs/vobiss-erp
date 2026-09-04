import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  isQuotaOrRateLimitError,
  isModelSpecificQuota,
  isSwitchableKeyError,
  extractRetryMs,
  withTimeout,
} from './geminiService.js';

/**
 * A completely separate Gemini key pool, used ONLY by the Vobi Live Ops Feed sweep — never
 * by the Vobi chat assistant (geminiService.js's own GEMINI_API_KEY* pool). Exhausting one
 * side's quota must never affect the other. The rotation/cooldown mechanics mirror
 * geminiService.js exactly (same pure error-classification helpers, reused directly) but the
 * key pool, cooldown state, and GoogleGenerativeAI client instances are entirely dedicated.
 */

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MODEL_FALLBACKS = ['gemini-flash-lite-latest', 'gemini-3.6-flash'];
const KEY_COOLDOWN_MS = 2 * 60 * 1000;
const MODEL_COOLDOWN_MS = 10 * 60 * 1000;

let keyPool = null;
let activeKeyIndex = 0;
const modelCooldownUntil = new Map();

function loadKeyPool() {
  if (keyPool) return keyPool;
  const collected = [];
  const push = (raw, label) => {
    const key = String(raw || '').trim();
    if (!key || key === 'your_key_here') return;
    if (collected.some((k) => k.key === key)) return;
    collected.push({ key, label, coolUntil: 0 });
  };

  push(process.env.VOBI_FEED_GEMINI_API_KEY_1, 'feed-key1');
  push(process.env.VOBI_FEED_GEMINI_API_KEY_2, 'feed-key2');
  push(process.env.VOBI_FEED_GEMINI_API_KEY_3, 'feed-key3');
  String(process.env.VOBI_FEED_GEMINI_API_KEYS || '')
    .split(/[,;\s]+/)
    .filter(Boolean)
    .forEach((k, i) => push(k, `feed-keys[${i}]`));

  keyPool = collected;
  return keyPool;
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
  console.warn(`[vobi-feed-gemini] cooling model ${modelName} on key#${keyIdx + 1} for ${MODEL_COOLDOWN_MS / 1000}s — ${reason}`);
}

function markKeyCooling(index, reason) {
  const pool = loadKeyPool();
  if (!pool[index]) return;
  pool[index].coolUntil = Date.now() + KEY_COOLDOWN_MS;
  console.warn(`[vobi-feed-gemini] cooling ${pool[index].label} for ${KEY_COOLDOWN_MS / 1000}s — ${reason}`);
}

function orderedKeyIndexes() {
  const pool = loadKeyPool();
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

function getClientForKey(key) {
  if (!key) {
    const err = new Error('VOBI_FEED_GEMINI_API_KEY_1 is not configured');
    err.status = 503;
    throw err;
  }
  return new GoogleGenerativeAI(key);
}

/**
 * One-shot text generation for the Live Ops sweep. Tries each configured key in order,
 * falling back to the next model on that key, then the next key — the same "switch to the
 * next smoothly" behavior as the chat assistant's pool, just isolated to these keys.
 */
export async function generateLiveOpsNarration(systemInstruction, userMessage, { timeoutMs = 45000, label = 'vobi-feed' } = {}) {
  const pool = loadKeyPool();
  if (!pool.length) {
    const err = new Error('No VOBI_FEED_GEMINI_API_KEY_* configured');
    err.status = 503;
    throw err;
  }

  const preferred = process.env.VOBI_FEED_GEMINI_MODEL || DEFAULT_MODEL;
  const models = [...new Set([preferred, 'gemini-flash-lite-latest', ...MODEL_FALLBACKS])];
  const keyOrder = orderedKeyIndexes();
  let lastError;

  for (const keyIdx of keyOrder) {
    const entry = pool[keyIdx];
    const genAI = getClientForKey(entry.key);
    let keyHadModelSuccessPath = false;

    for (const modelName of models) {
      if (isModelCooling(keyIdx, modelName)) continue;
      keyHadModelSuccessPath = true;
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
        const result = await withTimeout(
          model.generateContent(userMessage),
          timeoutMs,
          `${label}:${entry.label}:${modelName}`
        );
        const text = (result.response.text() || '').trim();
        if (text) {
          activeKeyIndex = keyIdx;
          entry.coolUntil = 0;
          return text;
        }
      } catch (error) {
        lastError = error;

        if (isQuotaOrRateLimitError(error) && isModelSpecificQuota(error)) {
          markModelCooling(keyIdx, modelName, String(error.message || 'model quota').slice(0, 100));
          continue;
        }
        if (isQuotaOrRateLimitError(error)) {
          const waitMs = extractRetryMs(error);
          markModelCooling(keyIdx, modelName, String(error.message || '429').slice(0, 100));
          if (waitMs > 0 && waitMs <= 12000) await new Promise((r) => setTimeout(r, waitMs));
          console.warn(`[vobi-feed-gemini] ${entry.label} rate-limited on ${modelName} — switching to next model/key smoothly`);
          continue;
        }
        if (error.status === 404 || error.status === 504) {
          markModelCooling(keyIdx, modelName, String(error.message || error.status).slice(0, 100));
          continue;
        }
        if (isSwitchableKeyError(error)) {
          markKeyCooling(keyIdx, String(error.message || error.status || 'key error').slice(0, 120));
          console.warn(`[vobi-feed-gemini] ${entry.label} exhausted — switching to next Live Ops key smoothly`);
          break;
        }
        markKeyCooling(keyIdx, String(error.message || 'unknown').slice(0, 120));
        break;
      }
    }

    if (!keyHadModelSuccessPath) {
      markKeyCooling(keyIdx, 'all models cooling');
    }
  }

  throw lastError || new Error('Vobi Live Ops Feed: all Gemini keys exhausted for this sweep.');
}
