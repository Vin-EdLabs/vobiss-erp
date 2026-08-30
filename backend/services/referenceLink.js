import pool, { getWorkflowConfig } from '../db.js';

export const REFERENCE_TYPES = ['ticket', 'project', 'material_request'];

export function isReferenceRequired(transport = {}) {
  return transport.require_reference_link === true || transport.require_reference_link === 'required';
}

export async function getReferenceRequirement() {
  const config = await getWorkflowConfig();
  return isReferenceRequired(config.transport || {});
}

// Per-request-type reference-linking requirement (Transport / Fuel / Vehicle Rental each
// have their own toggle now — see ConfigurationPage.tsx). `require_reference_link` (no
// suffix) remains Transport's own setting for backward compatibility with the single
// toggle this used to be.
const REQUIREMENT_KEY_BY_TYPE = {
  transport_request: 'require_reference_link',
  fuel_request: 'require_reference_link_fuel',
  vehicle_request: 'require_reference_link_vehicle',
};

export function isReferenceRequiredFor(requestType, transport = {}) {
  const key = REQUIREMENT_KEY_BY_TYPE[requestType] || 'require_reference_link';
  return transport[key] === true || transport[key] === 'required';
}

export async function getReferenceRequirementFor(requestType) {
  const config = await getWorkflowConfig();
  return isReferenceRequiredFor(requestType, config.transport || {});
}

export function normalizeReferenceType(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (raw === 'ticket') return 'ticket';
  if (raw === 'project') return 'project';
  if (raw === 'material' || raw === 'material_request' || raw === 'materialrequest') return 'material_request';
  return null;
}

export function padRef(prefix, id) {
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

export function referenceLinkFor(type, id, extra = {}) {
  if (type === 'ticket') return `/staff/cx/tickets/${id}`;
  if (type === 'project') {
    const stage = String(extra.current_stage || extra.stage || 'project').toLowerCase();
    const slug = !stage || stage === 'done' || stage === 'rejected' ? 'project' : stage;
    return `/project-request/${slug}/${id}`;
  }
  if (type === 'material_request') return `/request-forms/${id}`;
  return null;
}

function likeParams(query) {
  const q = String(query || '').trim();
  return { empty: !q, like: `%${q}%`, q };
}

async function searchTickets(query) {
  const { empty, like } = likeParams(query);
  try {
    const result = await pool.query(
      `SELECT id, title, status, ticket_id
       FROM tickets
       WHERE ($1::boolean OR CAST(id AS TEXT) ILIKE $2 OR COALESCE(ticket_id, '') ILIKE $2 OR COALESCE(title, '') ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 20`,
      [empty, like]
    );
    return result.rows.map((row) => ({
      type: 'ticket',
      id: Number(row.id),
      number: row.ticket_id || padRef('TKT', row.id),
      title: row.title || 'Ticket',
      status: row.status || 'Open',
      link: referenceLinkFor('ticket', row.id),
    }));
  } catch (error) {
    console.warn('reference search tickets:', error.message);
    return [];
  }
}

async function searchProjects(query) {
  const { empty, like } = likeParams(query);
  try {
    const result = await pool.query(
      `SELECT id, customer_name, site_name, status, current_stage
       FROM project_requests
       WHERE ($1::boolean OR CAST(id AS TEXT) ILIKE $2 OR COALESCE(customer_name, '') ILIKE $2
            OR COALESCE(site_name, '') ILIKE $2 OR COALESCE(status, '') ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 20`,
      [empty, like]
    );
    return result.rows.map((row) => ({
      type: 'project',
      id: Number(row.id),
      number: padRef('PRJ', row.id),
      title: row.site_name || row.customer_name || 'Project',
      status: row.status || row.current_stage || 'Active',
      link: referenceLinkFor('project', row.id, { current_stage: row.current_stage }),
    }));
  } catch (error) {
    console.warn('reference search projects:', error.message);
    return [];
  }
}

async function searchMaterialRequests(query) {
  const { empty, like } = likeParams(query);
  try {
    const result = await pool.query(
      `SELECT id, project_name, purpose, status, type
       FROM requests
       WHERE COALESCE(type, 'material_request') = 'material_request'
         AND deleted_at IS NULL
         AND ($1::boolean OR CAST(id AS TEXT) ILIKE $2 OR COALESCE(project_name, '') ILIKE $2
              OR COALESCE(purpose, '') ILIKE $2 OR COALESCE(status, '') ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 20`,
      [empty, like]
    );
    return result.rows.map((row) => ({
      type: 'material_request',
      id: Number(row.id),
      number: padRef('MR', row.id),
      title: row.project_name || row.purpose || 'Material request',
      status: row.status || 'pending',
      link: referenceLinkFor('material_request', row.id),
    }));
  } catch (error) {
    console.warn('reference search material requests:', error.message);
    return [];
  }
}

export async function searchReferences(type, query) {
  const normalized = normalizeReferenceType(type);
  if (!normalized) return [];
  if (normalized === 'ticket') return searchTickets(query);
  if (normalized === 'project') return searchProjects(query);
  return searchMaterialRequests(query);
}

export async function getReferenceRecord(type, id) {
  const normalized = normalizeReferenceType(type);
  const recordId = Number(id);
  if (!normalized || !Number.isInteger(recordId) || recordId <= 0) return null;
  const rows = await searchReferences(normalized, String(recordId));
  const exact = rows.find((row) => Number(row.id) === recordId);
  if (exact) return exact;
  if (normalized === 'ticket') {
    try {
      const result = await pool.query(`SELECT id, title, status, ticket_id FROM tickets WHERE id = $1 LIMIT 1`, [recordId]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        type: 'ticket',
        id: Number(row.id),
        number: row.ticket_id || padRef('TKT', row.id),
        title: row.title || 'Ticket',
        status: row.status || 'Open',
        link: referenceLinkFor('ticket', row.id),
      };
    } catch {
      return null;
    }
  }
  if (normalized === 'project') {
    try {
      const result = await pool.query(
        `SELECT id, customer_name, site_name, status, current_stage FROM project_requests WHERE id = $1 LIMIT 1`,
        [recordId]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        type: 'project',
        id: Number(row.id),
        number: padRef('PRJ', row.id),
        title: row.site_name || row.customer_name || 'Project',
        status: row.status || row.current_stage || 'Active',
        link: referenceLinkFor('project', row.id, { current_stage: row.current_stage }),
      };
    } catch {
      return null;
    }
  }
  try {
    const result = await pool.query(
      `SELECT id, project_name, purpose, status FROM requests
       WHERE id = $1 AND COALESCE(type, 'material_request') = 'material_request' AND deleted_at IS NULL LIMIT 1`,
      [recordId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      type: 'material_request',
      id: Number(row.id),
      number: padRef('MR', row.id),
      title: row.project_name || row.purpose || 'Material request',
      status: row.status || 'pending',
      link: referenceLinkFor('material_request', row.id),
    };
  } catch {
    return null;
  }
}

export function attachReference(row = {}) {
  const type = normalizeReferenceType(row.reference_type);
  const id = Number(row.reference_id);
  if (!type || !Number.isInteger(id) || id <= 0) {
    return {
      reference_type: null,
      reference_id: null,
      reference_number: null,
      reference_title: null,
      reference_status: null,
    };
  }
  return {
    reference_type: type,
    reference_id: id,
    reference_number: row.reference_number || padRef(type === 'ticket' ? 'TKT' : type === 'project' ? 'PRJ' : 'MR', id),
    reference_title: row.reference_title || null,
    reference_status: row.reference_status || null,
  };
}

export async function resolveReferenceInput(body = {}, { required = false } = {}) {
  const type = normalizeReferenceType(body.reference_type);
  const id = Number(body.reference_id);
  const hasAny = Boolean(type || (Number.isInteger(id) && id > 0) || String(body.reference_number || '').trim());
  if (!hasAny) {
    if (required) {
      const error = new Error('A linked reference is required before this request can be submitted.');
      error.status = 400;
      throw error;
    }
    return {
      reference_type: null,
      reference_id: null,
      reference_number: null,
      reference_title: null,
      reference_status: null,
    };
  }
  const record = await getReferenceRecord(type, id);
  if (!record) {
    const error = new Error('The selected reference does not exist.');
    error.status = 400;
    throw error;
  }
  return {
    reference_type: record.type,
    reference_id: record.id,
    reference_number: record.number,
    reference_title: record.title,
    reference_status: record.status,
  };
}
