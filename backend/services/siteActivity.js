// Site 360 aggregation layer — a reusable registry of "site activity providers" instead of a
// hand-rolled UNION query. Every provider here reads a real site_id FK (never a free-text
// name match, per the Client/Site standardization rule) and returns rows already normalized
// to the same shape, so the timeline/tab views never need to know which table a row came from.
// Adding a future module = adding one provider object below; nothing else changes.
import pool from '../db.js';
import { isSystemAdminAccount } from '../roles.js';
import { canApproveCashRequest } from '../permissions.js';

const alwaysVisible = () => true;
const cashVisible = (user) => canApproveCashRequest(user) || isSystemAdminAccount(user);

/**
 * Each provider:
 *  - key/label: identity shown in stats + tabs
 *  - permission(user): whether this viewer may see this module's rows at all
 *  - count(siteId): total rows for the stat card
 *  - list(siteId, {limit, offset}): paginated rows, normalized to
 *    { id, module, ref, title, subtitle, status, actor, date, href }
 */
const PROVIDERS = [
  {
    key: 'ticket',
    label: 'Tickets',
    permission: alwaysVisible,
    count: async (siteId) => {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM tickets WHERE site_id = $1`, [siteId]);
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT t.id, TRIM(t.ticket_id) AS ticket_id, t.title, t.status, t.priority, t.created_at,
                TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS created_by_name
         FROM tickets t
         LEFT JOIN users u ON u.id = t.created_by_id AND t.created_by_type = 'staff'
         WHERE t.site_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'ticket',
        ref: row.ticket_id,
        title: row.title || row.ticket_id,
        subtitle: `${row.priority || 'normal'} priority`,
        status: row.status,
        actor: row.created_by_name || null,
        date: row.created_at,
        href: `/staff/cx/tickets/${encodeURIComponent(row.ticket_id)}`,
      }));
    },
  },
  {
    key: 'material_request',
    label: 'Materials',
    permission: alwaysVisible,
    count: async (siteId) => {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM requests WHERE site_id = $1 AND type IN ('material_request','item_return') AND deleted_at IS NULL`,
        [siteId]
      );
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT r.id, r.type, r.project_name, r.status, r.created_at,
                TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS created_by_name
         FROM requests r
         LEFT JOIN users u ON u.id = r.created_by_id
         WHERE r.site_id = $1 AND r.type IN ('material_request','item_return') AND r.deleted_at IS NULL
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'material_request',
        ref: `${row.type === 'item_return' ? 'IR' : 'MR'}-${row.id}`,
        title: row.project_name || `Request #${row.id}`,
        subtitle: row.type === 'item_return' ? 'Item return' : 'Material request',
        status: row.status,
        actor: row.created_by_name || null,
        date: row.created_at,
        href: row.type === 'item_return' ? `/item-returns/${row.id}` : `/request-forms/${row.id}`,
      }));
    },
  },
  {
    key: 'cash_request',
    label: 'Cash',
    permission: cashVisible,
    count: async (siteId) => {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM requests WHERE site_id = $1 AND type = 'cash_request' AND deleted_at IS NULL`,
        [siteId]
      );
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT r.id, r.purpose, r.total_amount, r.status, r.created_at,
                TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS created_by_name
         FROM requests r
         LEFT JOIN users u ON u.id = r.created_by_id
         WHERE r.site_id = $1 AND r.type = 'cash_request' AND r.deleted_at IS NULL
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'cash_request',
        ref: `CR-${row.id}`,
        title: row.purpose || `Cash request #${row.id}`,
        subtitle: row.total_amount != null ? `GHS ${row.total_amount}` : null,
        status: row.status,
        actor: row.created_by_name || null,
        date: row.created_at,
        href: `/cash-details/${row.id}`,
      }));
    },
  },
  {
    key: 'overtime',
    label: 'Overtime',
    permission: alwaysVisible,
    count: async (siteId) => {
      const r = await pool.query(
        `SELECT COUNT(DISTINCT ot.id)::int AS n FROM ot_requests ot JOIN ot_request_tickets t ON t.ot_request_id = ot.id WHERE t.site_id = $1`,
        [siteId]
      );
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT DISTINCT ot.id, ot.staff_name, ot.status, ot.current_stage, ot.total_ot_hours, ot.created_at
         FROM ot_requests ot
         JOIN ot_request_tickets t ON t.ot_request_id = ot.id
         WHERE t.site_id = $1
         ORDER BY ot.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'overtime',
        ref: `OT-${row.id}`,
        title: `${row.staff_name || 'Staff'} — ${row.total_ot_hours || 0}h overtime`,
        subtitle: row.status === 'pending' ? `Awaiting ${row.current_stage}` : null,
        status: row.status,
        actor: row.staff_name || null,
        date: row.created_at,
        href: `/hr/overtime/${row.id}`,
      }));
    },
  },
  {
    key: 'service_request',
    label: 'Projects',
    permission: alwaysVisible,
    count: async (siteId) => {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM project_requests WHERE site_id = $1`, [siteId]);
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT pr.id, pr.status, pr.current_stage, pr.created_at, pr.created_by_name
         FROM project_requests pr
         WHERE pr.site_id = $1
         ORDER BY pr.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'service_request',
        ref: `SR-${row.id}`,
        title: `Service request #${row.id}`,
        subtitle: row.current_stage ? `Stage: ${row.current_stage}` : null,
        status: row.status,
        actor: row.created_by_name || null,
        date: row.created_at,
        href: `/project-request/${encodeURIComponent(row.current_stage || 'project')}/${row.id}`,
      }));
    },
  },
  {
    key: 'field_work',
    label: 'Field Work',
    permission: alwaysVisible,
    count: async (siteId) => {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM field_work WHERE site_id = $1`, [siteId]);
      return r.rows[0]?.n || 0;
    },
    list: async (siteId, { limit, offset }) => {
      const r = await pool.query(
        `SELECT fw.id, fw.title, fw.work_type, fw.status, fw.created_at,
                TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS created_by_name
         FROM field_work fw
         LEFT JOIN users u ON u.id = fw.created_by_user_id
         WHERE fw.site_id = $1
         ORDER BY fw.created_at DESC
         LIMIT $2 OFFSET $3`,
        [siteId, limit, offset]
      );
      return r.rows.map((row) => ({
        id: row.id,
        module: 'field_work',
        ref: `FW-${row.id}`,
        title: row.title || `Field work #${row.id}`,
        subtitle: row.work_type || null,
        status: row.status,
        actor: row.created_by_name || null,
        date: row.created_at,
        href: `/staff/field/field-work/${row.id}`,
      }));
    },
  },
];

function providersFor(user) {
  return PROVIDERS.filter((p) => p.permission(user));
}

export async function getSiteOverview(siteId) {
  const r = await pool.query(
    `SELECT s.id, s.site_code, s.site_name, s.site_address, s.location, s.region,
            s.connection_status, s.bandwidth, s.service_type, s.created_at, s.updated_at,
            c.id AS customer_id, c.customer_code, c.customer_name
     FROM customer_sites s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE s.id = $1`,
    [siteId]
  );
  const site = r.rows[0];
  if (!site) return null;
  return {
    id: site.id,
    siteCode: site.site_code,
    siteName: site.site_name,
    address: site.site_address || site.location || null,
    region: site.region,
    status: site.connection_status,
    bandwidth: site.bandwidth,
    serviceType: site.service_type,
    createdAt: site.created_at,
    updatedAt: site.updated_at,
    client: site.customer_id
      ? { id: site.customer_id, code: site.customer_code, name: site.customer_name }
      : null,
    // No "sales owner" column exists on customers/customer_sites yet — surfaced as null rather
    // than guessed, so the frontend can render "Not assigned" instead of fabricating a name.
    salesOwner: null,
  };
}

export async function getSiteStats(siteId, user) {
  const providers = providersFor(user);
  const entries = await Promise.all(
    providers.map(async (p) => [p.key, { label: p.label, count: await p.count(siteId) }])
  );
  return Object.fromEntries(entries);
}

/** One module's paginated activity. */
export async function getModuleActivity(siteId, user, moduleKey, { limit = 20, offset = 0 } = {}) {
  const provider = PROVIDERS.find((p) => p.key === moduleKey);
  if (!provider || !provider.permission(user)) return { items: [], total: 0 };
  const [items, total] = await Promise.all([
    provider.list(siteId, { limit, offset }),
    provider.count(siteId),
  ]);
  return { items, total };
}

/**
 * Merged chronological timeline across every module the viewer can see. Bounded per-module
 * fetch (never "load everything then sort") keeps this cheap even as more providers are added.
 */
export async function getSiteTimeline(siteId, user, { limit = 30, offset = 0 } = {}) {
  const providers = providersFor(user);
  const perModuleCap = Math.min(50, offset + limit);
  const lists = await Promise.all(
    providers.map((p) => p.list(siteId, { limit: perModuleCap, offset: 0 }).catch(() => []))
  );
  const merged = lists.flat().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return {
    items: merged.slice(offset, offset + limit),
    total: merged.length,
  };
}

export function listModuleKeys(user) {
  return providersFor(user).map((p) => ({ key: p.key, label: p.label }));
}
