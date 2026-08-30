import pool from '../db.js';
import { searchAllReferenceTypes } from '../services/referenceRegistry.js';

// Types already covered by the hand-tuned queries below (richer subtitles/joins); the
// registry-driven pass only fills in the request types global search didn't reach yet.
const ALREADY_COVERED_TYPES = new Set(['ticket', 'material_request', 'cash_request', 'item_return', 'service_request']);

const LIMIT = 10;

function likePattern(q) {
  return `%${String(q).trim().toLowerCase()}%`;
}

function isNumericId(q) {
  return /^\d+$/.test(String(q).trim());
}

function digitsFromQuery(q) {
  const m = String(q).match(/\d+/g);
  return m ? m.join('') : '';
}

/**
 * Executive global search — tickets, inventory/cash requests, service requests.
 */
export async function globalExecutiveSearch(query) {
  const q = String(query || '').trim();
  if (!q) return [];

  const like = likePattern(q);
  const numeric = isNumericId(q);
  const digits = digitsFromQuery(q);
  const results = [];

  try {
    const ticketRes = await pool.query(
      `SELECT t.id, TRIM(t.ticket_id) AS ticket_id, t.title, t.status,
              COALESCE(c.customer_name, 'Unknown') AS customer_name
       FROM tickets t
       LEFT JOIN customers c ON c.id = t.customer_id
       WHERE TRIM(COALESCE(t.ticket_id, '')) <> ''
         AND (
           LOWER(TRIM(t.ticket_id)) LIKE $1
           OR LOWER(COALESCE(t.title, '')) LIKE $1
           OR LOWER(COALESCE(c.customer_name, '')) LIKE $1
           OR LOWER(COALESCE(t.description, '')) LIKE $1
           OR LOWER(COALESCE(t.id::text, '')) LIKE $1
         )
       ORDER BY
         CASE WHEN LOWER(TRIM(t.ticket_id)) LIKE $1 THEN 0 ELSE 1 END,
         t.updated_at DESC NULLS LAST,
         t.created_at DESC
       LIMIT $2`,
      [like, LIMIT]
    );

    for (const row of ticketRes.rows) {
      const code = String(row.ticket_id).trim();
      if (!code) continue;
      results.push({
        kind: 'ticket',
        id: String(row.id),
        title: row.title || code,
        subtitle: `${code} · ${row.customer_name} · ${row.status}`,
        href: `/staff/cx/tickets/${encodeURIComponent(code)}`,
      });
    }
  } catch (e) {
    console.error('[global-search] tickets:', e.message);
  }

  try {
    const reqParams = [like, LIMIT * 2];
    let reqExtra = ` OR REPLACE(LOWER(COALESCE(r.type, '')), '_', ' ') LIKE $1`;
    if (numeric) {
      reqParams.push(q);
      reqExtra += ` OR r.id = $${reqParams.length}::int`;
    }
    if (digits && digits !== q) {
      reqParams.push(`%${digits}%`);
      reqExtra += ` OR r.id::text LIKE $${reqParams.length}`;
    }
    reqParams.push(`%${digits || q}%`);
    reqExtra += ` OR r.id::text LIKE $${reqParams.length}`;

    const reqRes = await pool.query(
      `SELECT r.id, r.type, r.status, r.purpose, r.reason, r.project_name, r.total_amount,
              TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS created_by
       FROM requests r
       LEFT JOIN users u ON u.id = r.created_by_id
       WHERE r.deleted_at IS NULL
         AND (
           LOWER(COALESCE(r.purpose, '')) LIKE $1
           OR LOWER(COALESCE(r.reason, '')) LIKE $1
           OR LOWER(COALESCE(r.project_name, '')) LIKE $1
           OR LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE $1
           OR LOWER(COALESCE(u.username, '')) LIKE $1
           OR LOWER(COALESCE(r.department, '')) LIKE $1
           ${reqExtra}
         )
       ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
       LIMIT $2`,
      reqParams
    );

    const requestKindLabel = {
      cash_request: 'Cash request',
      material_request: 'Material request',
      item_return: 'Item return',
    };

    const requestHref = {
      cash_request: (id) => `/cash-details/${id}`,
      material_request: (id) => `/request-forms/${id}`,
      item_return: (id) => `/item-returns/${id}`,
    };

    for (const row of reqRes.rows) {
      const type = row.type || 'material_request';
      const label = requestKindLabel[type] || 'Request';
      const title =
        row.purpose ||
        row.reason ||
        row.project_name ||
        `${label} #${row.id}`;
      const amount =
        type === 'cash_request' && row.total_amount != null
          ? ` · GHS ${row.total_amount}`
          : '';
      const pathFn = requestHref[type] || requestHref.material_request;
      results.push({
        kind: type,
        id: String(row.id),
        title,
        subtitle: `${label} #${row.id} · ${row.status}${amount}${row.created_by ? ` · ${row.created_by}` : ''}`,
        href: pathFn(row.id),
      });
    }
  } catch (e) {
    console.error('[global-search] requests:', e.message);
  }

  try {
    const prjParams = [like, LIMIT];
    let prjExtra = '';
    if (numeric) {
      prjParams.push(q);
      prjExtra = ` OR pr.id = $${prjParams.length}::int`;
    }
    if (digits && digits !== q) {
      prjParams.push(`%${digits}%`);
      prjExtra += ` OR pr.id::text LIKE $${prjParams.length}`;
    }

    const prjRes = await pool.query(
      `SELECT pr.id, pr.customer_name, pr.site_name, pr.status, pr.current_stage, pr.region
       FROM project_requests pr
       WHERE (
         LOWER(COALESCE(pr.customer_name, '')) LIKE $1
         OR LOWER(COALESCE(pr.site_name, '')) LIKE $1
         OR LOWER(COALESCE(pr.region, '')) LIKE $1
         OR LOWER(COALESCE(pr.created_by_name, '')) LIKE $1
         OR pr.id::text LIKE $1
         ${prjExtra}
       )
       ORDER BY pr.updated_at DESC NULLS LAST, pr.created_at DESC
       LIMIT $2`,
      prjParams
    );

    for (const row of prjRes.rows) {
      const stage = row.current_stage || 'project';
      results.push({
        kind: 'project_request',
        id: String(row.id),
        title: `${row.customer_name} — ${row.site_name}`,
        subtitle: `Project #${row.id} · ${row.status} · stage ${stage}${row.region ? ` · ${row.region}` : ''}`,
        href: `/project-request/${encodeURIComponent(stage)}/${row.id}`,
      });
    }
  } catch (e) {
    console.error('[global-search] project:', e.message);
  }

  // Transport / fuel / rental / WIP / incident / sign-off — driven by the shared reference
  // registry so this list stays in sync with what reference linking already knows about,
  // instead of hand-rolling another set of per-table queries here.
  try {
    const registryResults = await searchAllReferenceTypes(q, 8);
    for (const summary of registryResults) {
      if (ALREADY_COVERED_TYPES.has(summary.type)) continue;
      results.push({
        kind: summary.type,
        id: String(summary.id),
        title: summary.title,
        subtitle: `${summary.label} ${summary.referenceNumber}${summary.status ? ` · ${summary.status}` : ''}`,
        href: summary.pagePath,
      });
    }
  } catch (e) {
    console.error('[global-search] registry types:', e.message);
  }

  return results.slice(0, 30);
}
