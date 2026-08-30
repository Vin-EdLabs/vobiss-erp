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
  return /\b(how\s+does|how\s+do\s+i|documentation|payroll\s+guide|ticket\s+escalation|escalation\s+sla)\b/i.test(
    text
  );
}

function wantsServerIncident(text) {
  const t = String(text || '');
  if (/\b(server\s+(down|downtime|outage|reboot|shutdown|report|incident|update|updates|change|changes|status)|who\s+cleared|cleared\s+(their\s+)?activit|lost\s+memory\s+after|5:?34|12:?34)\b/i.test(t)) {
    return true;
  }
  // "changes/update … server" or "what happened on/to the server today"
  if (/\b(change|changes|update|updates|happened|report)\b/i.test(t) && /\bserver\b/i.test(t)) {
    return true;
  }
  if (/\bwhat\s+happened\s+(to\s+|on\s+)?(the\s+)?server\b/i.test(t)) return true;
  return false;
}

function wantsServerLogins(text) {
  return /\b(who\s+logged\s+in|server\s+login|login\s+history|ssh\s+session|last\s+-a|who\s+accessed\s+(the\s+)?server|list\s+(all\s+)?(server\s+)?logins?)\b/i.test(
    text
  );
}

function wantsServerOps(text) {
  return wantsServerIncident(text) || wantsServerLogins(text);
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

  if (wantsDocs(text) || wantsServerOps(text)) {
    jobs.push(
      (async () => {
        if (wantsServerOps(text)) {
          const docs = {
            login_history: await executeVobiTool(
              'search_system_docs',
              { doc_id: 'server_login_history' },
              toolCtx
            ),
            incident: await executeVobiTool(
              'search_system_docs',
              { doc_id: 'server_incident_report' },
              toolCtx
            ),
          };
          enrichment.results.docs = docs;
          enrichment.results.server_answer_priority =
            'Lead with SERVER INCIDENT + LOGIN HISTORY docs for erp-server. Then add ERP audit_logs as a separate section (app activity, not OS shutdown). Actor for the outage remains unknown.';
          // Also pull today's ERP audit so answers can include both feeds
          if (!enrichment.results.audit_logs) {
            enrichment.results.audit_logs = await executeVobiTool(
              'get_audit_logs',
              { hours: 24, limit: 20 },
              toolCtx
            );
          }
        } else {
          enrichment.results.docs = await executeVobiTool(
            'search_system_docs',
            { query: text.slice(0, 120) },
            toolCtx
          );
        }
      })()
    );
  }

  // Generic "who did X" without inventory keyword — still pull recent audit
  if (/\bwho\b/i.test(text) && !enrichment.results.audit_logs && !wantsServerOps(text) && jobs.length === 0) {
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
  const priority = enrichment.results.server_answer_priority
    ? `\nSERVER QUESTION PRIORITY:\n${enrichment.results.server_answer_priority}\n`
    : '';
  return `
TOOL LOOKUP RESULTS (authoritative — use these facts; if empty, say nothing matching was found):
${priority}${JSON.stringify(enrichment.results, null, 2)}
`.trim();
}
