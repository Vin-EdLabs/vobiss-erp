import pool from '../db.js';

/**
 * Canonical registry of every "request-like" record type that can be linked to from a
 * reference-linking form or found via global search. `refCol` is the REAL stored reference
 * column when one exists (e.g. fuel_requests.ref_no is generated as FR-YYYYMM-NNNN,
 * tickets.ticket_id as TCK-NNNNNN, project_signoff_forms.reference_no as SOF-NNN) — those
 * are used verbatim. Tables with no stored reference column get a computed `PREFIX-NNN`
 * (zero-padded id) purely for display/search purposes; nothing is written back to those
 * tables. This mirrors the real formats already used elsewhere in the app rather than
 * inventing new ones.
 */
export const REFERENCE_REGISTRY = {
  ticket: {
    prefix: 'TCK',
    label: 'Ticket',
    table: 'tickets',
    idCol: 'id',
    refCol: 'ticket_id',
    titleCol: 'title',
    statusCol: 'status',
    where: null,
    path: (id) => `/staff/cx/tickets/${id}`,
  },
  transport_request: {
    prefix: 'TR',
    label: 'Transport Request',
    table: 'transport_requests',
    idCol: 'id',
    refCol: null,
    titleFn: (row) => [row.site_name, row.client_name].filter(Boolean).join(' — ') || 'Transport request',
    searchCols: ['site_name', 'client_name', 'location'],
    statusCol: 'status',
    where: 'deleted_at IS NULL',
    path: (id) => `/transport-requests/${id}`,
  },
  fuel_request: {
    prefix: 'FR',
    label: 'Fuel Request',
    table: 'fuel_requests',
    idCol: 'id',
    refCol: 'ref_no',
    titleCol: 'purpose',
    statusCol: 'status',
    where: 'deleted_at IS NULL',
    path: (id) => `/transport/fuel-requests/${id}`,
  },
  vehicle_request: {
    prefix: 'RV',
    label: 'Vehicle Rental Request',
    table: 'vehicle_request_forms',
    idCol: 'id',
    refCol: null,
    titleCol: 'purpose',
    statusCol: 'status',
    where: 'deleted_at IS NULL',
    path: (id) => `/transport/vehicle-rental-requests/${id}`,
  },
  material_request: {
    prefix: 'MR',
    label: 'Material Request',
    table: 'requests',
    idCol: 'id',
    refCol: null,
    titleCol: 'project_name',
    statusCol: 'status',
    where: "type = 'material_request' AND deleted_at IS NULL",
    path: (id) => `/request-forms/${id}`,
  },
  cash_request: {
    prefix: 'CR',
    label: 'Cash Request',
    table: 'requests',
    idCol: 'id',
    refCol: null,
    titleCol: 'purpose',
    statusCol: 'status',
    where: "type = 'cash_request' AND deleted_at IS NULL",
    path: (id) => `/cash-details/${id}`,
  },
  item_return: {
    prefix: 'IR',
    label: 'Item Return',
    table: 'requests',
    idCol: 'id',
    refCol: null,
    titleCol: 'project_name',
    statusCol: 'status',
    where: "type = 'item_return' AND deleted_at IS NULL",
    path: (id) => `/item-returns/${id}`,
  },
  service_request: {
    prefix: 'SR',
    label: 'Service Request',
    table: 'project_requests',
    idCol: 'id',
    refCol: null,
    titleFn: (row) => [row.customer_name, row.site_name].filter(Boolean).join(' — ') || 'Service request',
    searchCols: ['customer_name', 'site_name', 'region'],
    statusCol: 'status',
    where: null,
    path: (id, row) => `/project-request/${row?.current_stage || 'project'}/${id}`,
  },
  wip_entry: {
    prefix: 'WIP',
    label: 'WIP Entry',
    table: 'project_wip_entries',
    idCol: 'id',
    refCol: null,
    titleCol: 'customer_name',
    statusCol: 'status',
    where: 'deleted_at IS NULL',
    path: () => `/project-unit/wip`,
  },
  incident_note: {
    prefix: 'INC',
    label: 'Incident Note',
    table: 'noc_incident_notes',
    idCol: 'id',
    refCol: null,
    titleCol: 'site_name',
    statusCol: 'status',
    where: 'deleted_at IS NULL',
    path: (id) => `/noc/incident-notes/${id}`,
  },
  signoff_form: {
    prefix: 'SOF',
    label: 'Sign-Off Form',
    table: 'project_signoff_forms',
    idCol: 'id',
    refCol: 'reference_no',
    titleCol: 'site_name',
    statusCol: 'status',
    where: null,
    path: (id) => `/project-unit/signoff/${id}`,
  },
};

export function computeRefNumber(type, row) {
  const def = REFERENCE_REGISTRY[type];
  if (!def || !row) return null;
  if (def.refCol && row[def.refCol]) return row[def.refCol];
  return `${def.prefix}-${String(row[def.idCol]).padStart(3, '0')}`;
}

function rowTitle(def, row) {
  if (def.titleFn) return def.titleFn(row) || def.label;
  return row[def.titleCol] || def.label;
}

export function toSummary(type, row) {
  const def = REFERENCE_REGISTRY[type];
  if (!def || !row) return null;
  return {
    type,
    label: def.label,
    id: Number(row[def.idCol]),
    referenceNumber: computeRefNumber(type, row),
    title: rowTitle(def, row),
    status: row[def.statusCol] || null,
    pagePath: def.path(row[def.idCol], row),
  };
}

async function fetchById(type, id) {
  const def = REFERENCE_REGISTRY[type];
  if (!def) return null;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const where = [`${def.idCol} = $1`, def.where].filter(Boolean).join(' AND ');
  const result = await pool.query(`SELECT * FROM ${def.table} WHERE ${where} LIMIT 1`, [numericId]);
  return result.rows[0] || null;
}

async function fetchByRefColumn(type, refValue) {
  const def = REFERENCE_REGISTRY[type];
  if (!def || !def.refCol) return null;
  const where = [`${def.refCol} ILIKE $1`, def.where].filter(Boolean).join(' AND ');
  const result = await pool.query(`SELECT * FROM ${def.table} WHERE ${where} LIMIT 1`, [refValue]);
  return result.rows[0] || null;
}

/** Parses "PREFIX-REST" into a known type + the trailing id/ref portion. Case-insensitive. */
function parsePrefixed(input) {
  const trimmed = String(input || '').trim();
  const match = trimmed.match(/^([a-z]+)[\s-]+(.+)$/i);
  if (!match) return null;
  const prefix = match[1].toUpperCase();
  const rest = match[2].trim();
  const type = Object.keys(REFERENCE_REGISTRY).find((key) => REFERENCE_REGISTRY[key].prefix === prefix);
  if (!type) return null;
  return { type, rest };
}

/**
 * Resolves any pasted/typed reference string to the record it identifies, searching every
 * registered type. Tries the recognized-prefix type first (fast path), then falls back to
 * treating the whole string as a stored reference value or bare numeric id across all types.
 */
export async function findByReferenceString(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const parsed = parsePrefixed(raw);
  if (parsed) {
    const def = REFERENCE_REGISTRY[parsed.type];
    if (def.refCol) {
      const byRef = await fetchByRefColumn(parsed.type, raw) || await fetchByRefColumn(parsed.type, parsed.rest);
      if (byRef) return toSummary(parsed.type, byRef);
    }
    const numeric = Number(parsed.rest.replace(/^0+(?=\d)/, ''));
    if (Number.isInteger(numeric) && numeric > 0) {
      const byId = await fetchById(parsed.type, numeric);
      if (byId) return toSummary(parsed.type, byId);
    }
  }

  // Fallback: try every type's stored ref column against the raw string, then bare numeric id.
  for (const type of Object.keys(REFERENCE_REGISTRY)) {
    const def = REFERENCE_REGISTRY[type];
    if (def.refCol) {
      const row = await fetchByRefColumn(type, raw);
      if (row) return toSummary(type, row);
    }
  }
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    for (const type of Object.keys(REFERENCE_REGISTRY)) {
      const row = await fetchById(type, numeric);
      if (row) return toSummary(type, row);
    }
  }
  return null;
}

/** Re-fetches a specific record by type + id for a fresh summary (used when snapshotting a link). */
export async function getRecordSummary(type, id) {
  const row = await fetchById(type, id);
  if (!row) return null;
  return toSummary(type, row);
}

/** Free-text search across every registered type, for global search. */
export async function searchAllReferenceTypes(query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return [];
  const like = `%${q}%`;
  const results = [];
  for (const type of Object.keys(REFERENCE_REGISTRY)) {
    const def = REFERENCE_REGISTRY[type];
    const titleExpr = def.titleFn ? null : `COALESCE(${def.titleCol}::text, '')`;
    const clauses = [`CAST(${def.idCol} AS TEXT) ILIKE $1`];
    if (def.refCol) clauses.push(`COALESCE(${def.refCol}, '') ILIKE $1`);
    if (titleExpr) clauses.push(`${titleExpr} ILIKE $1`);
    for (const col of def.searchCols || []) clauses.push(`COALESCE(${col}::text, '') ILIKE $1`);
    const where = [`(${clauses.join(' OR ')})`, def.where].filter(Boolean).join(' AND ');
    try {
      const result = await pool.query(`SELECT * FROM ${def.table} WHERE ${where} LIMIT $2`, [like, limit]);
      for (const row of result.rows) results.push(toSummary(type, row));
    } catch (error) {
      console.warn(`[referenceRegistry] search failed for ${type}:`, error.message);
    }
  }
  return results;
}
