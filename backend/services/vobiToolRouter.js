/**
 * Server-side tool routing for Vobi.
 * Gemini flash-lite rejects function-call roles, so we run tools in Node
 * and inject results into the prompt instead.
 */
import { executeVobiTool } from './vobiTools.js';
import pool from '../db.js';

function wantsDeletes(text) {
  return /\b(delet(?:e|ed|ing)|remov(?:e|ed|ing)|who\s+.*\b(deleted|removed)|soft\s*delet)/i.test(text);
}

function wantsAudit(text) {
  return (
    wantsDeletes(text) ||
    /\b(who\s+(just\s+)?(updated|changed|edited)|what\s+was\s+it\s+before|audit|recent\s+changes?|last\s+(inventory\s+)?(update|change)|who\s+updated)/i.test(
      text
    )
  );
}

function wantsInventory(text) {
  return /\b(inventory|stock|item|low\s*stock|out\s*of\s*stock)\b/i.test(text);
}

function wantsClients(text) {
  return /\b(client|customer|site|sites)\b/i.test(text);
}

function wantsDocs(text) {
  return /\b(how\s+does|how\s+do\s+i|explain|documentation|what\s+is\s+(a\s+)?ticket|payroll|escalation|sla)\b/i.test(
    text
  );
}

async function softDeletedInventory(limit = 15) {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.name, i.quantity, i.deleted_at,
              TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, 'Unknown')) AS deleted_by_guess
         FROM items i
         LEFT JOIN LATERAL (
           SELECT al.user_id
             FROM audit_logs al
            WHERE al.action = 'delete_item'
              AND (al.details->>'item_id')::int = i.id
            ORDER BY al.timestamp DESC
            LIMIT 1
         ) d ON true
         LEFT JOIN users u ON u.id = d.user_id
        WHERE i.deleted_at IS NOT NULL
        ORDER BY i.deleted_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  } catch (e) {
    console.warn('[vobi-route] soft deleted items:', e.message);
    return [];
  }
}

async function softDeletedUsers(limit = 10) {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, first_name, last_name, deleted_at, role, main_role
         FROM users
        WHERE deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Run relevant tools for a user message and return structured enrichment.
 */
export async function gatherVobiToolContext(message, toolCtx) {
  const text = String(message || '').trim();
  if (!text) return null;

  const enrichment = {
    source: 'server_tool_router',
    results: {},
  };

  const jobs = [];

  if (wantsAudit(text) || wantsDeletes(text)) {
    jobs.push(
      (async () => {
        const hours = wantsDeletes(text) ? 720 : 72;
        const actionHint = wantsDeletes(text) ? 'delete' : '';
        const queryHint = wantsDeletes(text)
          ? 'delete'
          : wantsInventory(text)
            ? 'item'
            : '';
        enrichment.results.audit_logs = await executeVobiTool(
          'get_audit_logs',
          {
            action: actionHint,
            query: queryHint || undefined,
            hours,
            limit: 20,
          },
          toolCtx
        );
        if (wantsDeletes(text)) {
          // Soft-delete dumps are System Admin / full-access only — unit admins stay in their modules.
          if (toolCtx?.is_system_admin) {
            enrichment.results.soft_deleted_items = await softDeletedInventory(15);
            enrichment.results.soft_deleted_users = await softDeletedUsers(10);
          }
          // Broader audit pass without action filter but query delete (still role-gated in executeVobiTool)
          if (!enrichment.results.audit_logs?.logs?.length) {
            enrichment.results.audit_logs_broad = await executeVobiTool(
              'get_audit_logs',
              { query: 'delete', hours: 2160, limit: 25 },
              toolCtx
            );
          }
        }
      })()
    );
  }

  if (wantsInventory(text) && !wantsAudit(text)) {
    jobs.push(
      (async () => {
        enrichment.results.inventory = await executeVobiTool(
          'search_inventory',
          { query: '', low_stock_only: /low|out/.test(text.toLowerCase()), limit: 12 },
          toolCtx
        );
      })()
    );
  }

  if (wantsClients(text)) {
    jobs.push(
      (async () => {
        const m = text.match(/(?:client|customer|site)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})/i);
        const q = m?.[1]?.trim() || text.replace(/who|what|show|list|me|the|a|an/gi, ' ').trim().slice(0, 40);
        enrichment.results.clients = await executeVobiTool('search_clients', { query: q || 'a', limit: 8 }, toolCtx);
        enrichment.results.sites = await executeVobiTool('search_sites', { query: q || 'a', limit: 8 }, toolCtx);
      })()
    );
  }

  if (wantsDocs(text)) {
    jobs.push(
      (async () => {
        enrichment.results.docs = await executeVobiTool(
          'search_system_docs',
          { query: text.slice(0, 120) },
          toolCtx
        );
      })()
    );
  }

  // Generic "who did X" without inventory keyword — still pull recent audit
  if (/\bwho\b/i.test(text) && !enrichment.results.audit_logs && jobs.length === 0) {
    jobs.push(
      (async () => {
        enrichment.results.audit_logs = await executeVobiTool(
          'get_audit_logs',
          { hours: 168, limit: 15 },
          toolCtx
        );
      })()
    );
  }

  if (!jobs.length) return null;
  await Promise.all(jobs);
  return enrichment;
}

export function formatToolEnrichmentForPrompt(enrichment) {
  if (!enrichment?.results) return '';
  return `
TOOL LOOKUP RESULTS (authoritative — use these facts; if empty, say nothing matching was found):
${JSON.stringify(enrichment.results, null, 2)}
`.trim();
}
