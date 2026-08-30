/**
 * Load Vobiss docs into Vobi knowledge (cached in memory).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DOCS_DIR = path.join(ROOT, 'docs');

let cache = null;
let cacheAt = 0;
const TTL_MS = 10 * 60 * 1000;

const DOC_FILES = [
  { id: 'readme', file: 'README.md', title: 'Vobiss ERP overview' },
  { id: 'ticketing', file: path.join('docs', 'TICKETING.md'), title: 'Ticketing module guide' },
  { id: 'payroll', file: path.join('docs', 'PAYROLL.md'), title: 'Payroll / HR guide' },
  { id: 'assets', file: path.join('docs', 'ASSET_MANAGER_TEST.md'), title: 'Assets module notes' },
  {
    id: 'server_incident_report',
    file: path.join('docs', 'SERVER_INCIDENT_REPORT.md'),
    title: 'Server downtime incident report (26 Aug 2026)',
  },
  {
    id: 'server_login_history',
    file: path.join('docs', 'SERVER_LOGIN_HISTORY.md'),
    title: 'ERP server login history (last -a)',
  },
];

function readSafe(relPath, maxChars = 28000) {
  try {
    const full = path.isAbsolute(relPath) ? relPath : path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    let text = fs.readFileSync(full, 'utf8');
    if (text.length > maxChars) {
      text = `${text.slice(0, maxChars)}\n\n…[truncated for length — ask for a specific section]`;
    }
    return text;
  } catch (e) {
    console.warn('[vobi-docs] read failed:', relPath, e.message);
    return null;
  }
}

export function listVobiDocs() {
  return DOC_FILES.map((d) => ({ id: d.id, title: d.title }));
}

export function loadVobiDocsBundle() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;

  const docs = {};
  for (const d of DOC_FILES) {
    const body = readSafe(d.file);
    if (body) docs[d.id] = { title: d.title, body };
  }

  // Also list any other markdown under docs/
  try {
    if (fs.existsSync(DOCS_DIR)) {
      for (const name of fs.readdirSync(DOCS_DIR)) {
        if (!name.toLowerCase().endsWith('.md')) continue;
        const id = name.replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (docs[id]) continue;
        const body = readSafe(path.join('docs', name));
        if (body) docs[id] = { title: name.replace(/\.md$/i, ''), body };
      }
    }
  } catch (_) {
    /* ignore */
  }

  cache = {
    generated_at: new Date().toISOString(),
    index: Object.entries(docs).map(([id, v]) => ({ id, title: v.title, chars: v.body.length })),
    docs,
  };
  cacheAt = now;
  return cache;
}

/** Keyword search across docs for a focused answer. */
export function searchVobiDocs(query, limit = 4) {
  const q = String(query || '').trim().toLowerCase();
  const bundle = loadVobiDocsBundle();
  if (!q) {
    return { ok: true, index: bundle.index, hint: 'Pass a query like "ticket escalation" or "payroll tax".' };
  }

  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  const hits = [];

  for (const [id, doc] of Object.entries(bundle.docs)) {
    const lower = doc.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (lower.includes(t)) score += 1;
      if (doc.title.toLowerCase().includes(t)) score += 2;
    }
    if (id.includes(q.replace(/\s+/g, '_'))) score += 3;
    if (score === 0) continue;

    // Extract a relevant snippet around the first matching term
    let snippet = doc.body.slice(0, 900);
    const firstTerm = terms.find((t) => lower.includes(t));
    if (firstTerm) {
      const idx = lower.indexOf(firstTerm);
      const start = Math.max(0, idx - 200);
      snippet = doc.body.slice(start, start + 1200);
    }
    hits.push({ id, title: doc.title, score, snippet });
  }

  hits.sort((a, b) => b.score - a.score);
  return {
    ok: true,
    query: q,
    results: hits.slice(0, limit),
    available_docs: bundle.index,
  };
}

export function getVobiDocById(docId) {
  const bundle = loadVobiDocsBundle();
  const id = String(docId || '').toLowerCase().trim();
  const doc = bundle.docs[id];
  if (!doc) return { ok: false, error: `Doc "${docId}" not found`, available: bundle.index };
  return { ok: true, id, title: doc.title, body: doc.body };
}
