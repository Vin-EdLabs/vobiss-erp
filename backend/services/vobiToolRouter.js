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

function wantsPerformanceReports(text) {
  return /\b(performance\s*report|my\s+reports?\b.*\bperform|review\s+queue|awaiting\s+(my\s+)?review|team\s+reports?|unit\s+reviews?|executive\s+review|performance\s*&?\s*reports?)\b/i.test(text);
}

function wantsTransport(text) {
  return /\b(transport\s*requests?|fuel\s*requests?|rental\s*(vehicles?|cars?)|vehicle\s*rentals?)\b/i.test(text);
}

function wantsAssessment(text) {
  return /\b(my\s+assessments?|assessment\s+scores?|attendance|workflow\s+performance|compliance\s+scores?|sla\s+compliance)\b/i.test(text);
}

function wantsNetworkAssets(text) {
  return /\b(pops?|pop\s+register|equipment\s+inventor(?:y|ies)|network\s+assets?|passive\s+infrastructure)\b/i.test(text);
}

function wantsNocShifts(text) {
  return /\b(shift\s+schedule|on\s+shift|who'?s?\s+on\s+(?:duty|shift)|noc\s+shift)\b/i.test(text);
}

function wantsIncidentNotes(text) {
  return /\b(incident\s+notes?)\b/i.test(text);
}

function wantsIpCircuits(text) {
  return /\b(circuits?|circuit\s+inventor(?:y|ies))\b/i.test(text);
}

function wantsWip(text) {
  return /\b(wip|work[\s-]in[\s-]progress)\b/i.test(text);
}

function wantsSignoff(text) {
  return /\b(sign[\s-]?off\s*forms?|sof-?\d+)\b/i.test(text);
}

function wantsArchive(text) {
  return /\b(archive|archived\s+(?:file|folder|document))\b/i.test(text);
}

const NAME_FILLER_WORDS = new Set([
  'whats', "what's", 'what', 'is', 'are', 'was', 'were', 'my', 'the', 'a', 'an', 'our',
  'his', 'her', 'their', 'your', 'this', 'that', 'tell', 'me', 'show', 'know', 'do', 'does',
  'did', 'get', 'give', 'check', 'please', 'can', 'could', 'you', 'i',
]);

function cleanExtractedName(raw) {
  const words = String(raw || '')
    .trim()
    .split(/\s+/)
    .filter((w) => !NAME_FILLER_WORDS.has(w.toLowerCase()));
  if (!words.length) return undefined;
  const candidate = words.join(' ').replace(/'s$/i, '').replace(/s$/i, '');
  return candidate || undefined;
}

/** Pull a staff name out of casual phrasing like "what's Goodwill's attendance" or "goodwills
 *  attendance this month" (apostrophes routinely get dropped in chat) — undefined means "self". */
function extractStaffNameQuery(text) {
  const explicit = text.match(/(?:assessment|attendance|score)\s+(?:for|of)\s+([A-Za-z][A-Za-z .-]{1,40})/i);
  if (explicit) return cleanExtractedName(explicit[1]);
  const adjacent = text.match(/\b([A-Za-z][A-Za-z'-]{1,20}(?:\s+[A-Za-z][A-Za-z'-]{1,20})?)\s+(?:attendance|assessment|score)\b/i);
  if (!adjacent) return undefined;
  return cleanExtractedName(adjacent[1]);
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

  if (wantsPerformanceReports(text)) {
    jobs.push(
      (async () => {
        const [mine, queue] = await Promise.all([
          executeVobiTool('get_my_performance_reports', {}, toolCtx),
          executeVobiTool('get_performance_review_queue', {}, toolCtx),
        ]);
        enrichment.results.my_performance_reports = mine;
        enrichment.results.performance_review_queue = queue;
      })()
    );
  }

  if (wantsTransport(text)) {
    jobs.push(
      (async () => {
        const kindMatch = /\bfuel\b/i.test(text) ? 'fuel' : /\brental|vehicle\b/i.test(text) ? 'vehicle' : /\btransport\b/i.test(text) ? 'transport' : undefined;
        enrichment.results.transport_requests = await executeVobiTool(
          'search_transport_requests',
          { kind: kindMatch, limit: 12 },
          toolCtx
        );
      })()
    );
  }

  if (wantsAssessment(text)) {
    jobs.push(
      (async () => {
        const staffName = extractStaffNameQuery(text);
        const period = /this\s+week/i.test(text) ? 'this_week' : /last\s+month/i.test(text) ? 'last_month' : 'this_month';
        enrichment.results.assessment = await executeVobiTool(
          'get_assessment_score',
          { staff_name: staffName, period },
          toolCtx
        );
      })()
    );
  }

  if (wantsNetworkAssets(text)) {
    jobs.push(
      (async () => {
        const kind = /equipment/i.test(text) ? 'equipment' : 'pop';
        const m = text.match(/(?:pop|equipment|assets?)\s+([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})/i);
        enrichment.results.network_assets = await executeVobiTool(
          'search_network_assets',
          { kind, query: m?.[1]?.trim() || '', limit: 12 },
          toolCtx
        );
      })()
    );
  }

  if (wantsNocShifts(text)) {
    jobs.push(
      (async () => {
        const range = /this\s+week|week/i.test(text) ? 'week' : 'today';
        enrichment.results.noc_shift_schedule = await executeVobiTool('get_noc_shift_schedule', { range }, toolCtx);
      })()
    );
  }

  if (wantsIncidentNotes(text)) {
    jobs.push(
      (async () => {
        enrichment.results.incident_notes = await executeVobiTool('search_incident_notes', { limit: 10 }, toolCtx);
      })()
    );
  }

  if (wantsIpCircuits(text)) {
    jobs.push(
      (async () => {
        const m = text.match(/circuits?\s+([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})/i);
        enrichment.results.ip_circuits = await executeVobiTool('search_ip_circuits', { query: m?.[1]?.trim() || '', limit: 10 }, toolCtx);
      })()
    );
  }

  if (wantsWip(text)) {
    jobs.push(
      (async () => {
        enrichment.results.wip_entries = await executeVobiTool('search_wip_entries', { limit: 10 }, toolCtx);
      })()
    );
  }

  if (wantsSignoff(text)) {
    jobs.push(
      (async () => {
        enrichment.results.signoff_forms = await executeVobiTool('search_signoff_forms', { limit: 10 }, toolCtx);
      })()
    );
  }

  if (wantsArchive(text)) {
    jobs.push(
      (async () => {
        const m = text.match(/archive[d]?\s+([A-Za-z0-9][A-Za-z0-9 ._-]{1,40})/i);
        enrichment.results.archive = await executeVobiTool('search_archive', { query: m?.[1]?.trim() || '', limit: 10 }, toolCtx);
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
