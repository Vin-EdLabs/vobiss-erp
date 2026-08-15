/**
 * Production Request workflow — database layer
 */
import pool from '../db.js';

const PIPELINE_STAGES = ['ts', 'ip', 'noc'];

export async function initProductionTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_units (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      slug VARCHAR(60) UNIQUE NOT NULL,
      unit_stage VARCHAR(20) NOT NULL CHECK (unit_stage IN ('project', 'ts', 'ip', 'noc')),
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_requests (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(255) NOT NULL,
      site_name VARCHAR(255) NOT NULL,
      location TEXT,
      region VARCHAR(120),
      capacity VARCHAR(120),
      bandwidth VARCHAR(120),
      cable_displacement TEXT,
      service_type VARCHAR(120),
      cpe VARCHAR(255),
      start_date DATE,
      completion_date DATE,
      confirmation_date DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ongoing', 'integrated', 'rejected', 'completed')),
      current_stage VARCHAR(20) NOT NULL DEFAULT 'ts'
        CHECK (current_stage IN ('ts', 'ip', 'noc', 'done', 'rejected')),
      mrc DECIMAL(14,2),
      nrc DECIMAL(14,2),
      initial_remarks TEXT,
      project_unit_id INTEGER REFERENCES production_units(id),
      project_unit_name VARCHAR(120),
      created_by_user_id INTEGER REFERENCES users(id),
      created_by_name VARCHAR(255),
      circuit_id VARCHAR(120),
      integration_date DATE,
      ip_address VARCHAR(120),
      mac_address VARCHAR(120),
      integrated_by VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_request_remarks (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES production_requests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      author_name VARCHAR(255) NOT NULL,
      stage VARCHAR(20) NOT NULL,
      comment_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS production_request_attachments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES production_requests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      uploader_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120),
      stage VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prod_req_stage ON production_requests(current_stage, status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_prod_req_creator ON production_requests(created_by_user_id);`);

  await migrateProductionConstraints();

  const defaults = [
    { name: 'TX — Transmission', slug: 'ts', unit_stage: 'ts', sort_order: 1 },
    { name: 'IP', slug: 'ip', unit_stage: 'ip', sort_order: 2 },
    { name: 'NOC', slug: 'noc', unit_stage: 'noc', sort_order: 3 },
    { name: 'Project Unit', slug: 'project', unit_stage: 'project', sort_order: 0 },
  ];
  for (const u of defaults) {
    await pool.query(
      `INSERT INTO production_units (name, slug, unit_stage, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, unit_stage = EXCLUDED.unit_stage`,
      [u.name, u.slug, u.unit_stage, u.sort_order]
    );
  }
}

/** Drop every CHECK on production_requests (PG auto-names differ from our labels). */
async function dropProductionRequestCheckConstraints() {
  const { rows } = await pool.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'production_requests' AND c.contype = 'c'
  `);
  for (const { conname } of rows) {
    await pool.query(
      `ALTER TABLE production_requests DROP CONSTRAINT IF EXISTS "${conname.replace(/"/g, '""')}"`
    );
  }
}

async function migrateProductionConstraints() {
  try {
    await dropProductionRequestCheckConstraints();
    await pool.query(`
      ALTER TABLE production_requests ADD CONSTRAINT production_requests_status_check
      CHECK (status IN ('pending','ongoing','integrated','rejected','completed','noc_approved'));
    `);
    await pool.query(`
      ALTER TABLE production_requests ADD CONSTRAINT production_requests_current_stage_check
      CHECK (current_stage IN ('ts','ip','noc','done','rejected','project'));
    `);
    await pool.query(`
      UPDATE production_requests
      SET current_stage = 'project', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'integrated' AND current_stage = 'noc'
    `);
    console.log('[production] workflow constraints migrated');
  } catch (e) {
    console.error('[production] constraint migration failed:', e.message);
    throw e;
  }
}

export function isProductionRequestLocked(request) {
  return request?.status === 'completed' || request?.current_stage === 'done';
}

async function assertProductionRequestNotLocked(requestId) {
  const { rows } = await pool.query(
    'SELECT status, current_stage FROM production_requests WHERE id = $1',
    [requestId]
  );
  if (!rows[0]) throw new Error('Request not found');
  if (isProductionRequestLocked(rows[0])) {
    throw new Error('Request is completed — no further comments or uploads allowed');
  }
}

export async function ensureProductionWorkflowConstraints() {
  await migrateProductionConstraints();
}

export async function getProductionUnits(includeInactive = false) {
  const q = includeInactive
    ? 'SELECT * FROM production_units ORDER BY sort_order, name'
    : 'SELECT * FROM production_units WHERE is_active = true ORDER BY sort_order, name';
  const { rows } = await pool.query(q);
  return rows;
}

export async function createProductionUnit({ name, slug, unit_stage, description }) {
  const cleanSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stage = unit_stage || 'project';
  if (!['project', 'ts', 'ip', 'noc'].includes(stage)) throw new Error('Invalid unit stage');
  const { rows } = await pool.query(
    `INSERT INTO production_units (name, slug, unit_stage, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name.trim(), cleanSlug, stage, description || null]
  );
  return rows[0];
}

export async function updateProductionUnit(id, { name, description, is_active, sort_order }) {
  const { rows } = await pool.query(
    `UPDATE production_units SET
      name = COALESCE($2, name),
      description = COALESCE($3, description),
      is_active = COALESCE($4, is_active),
      sort_order = COALESCE($5, sort_order),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [id, name, description, is_active, sort_order]
  );
  if (!rows[0]) throw new Error('Unit not found');
  return rows[0];
}

export async function getProductionUnitBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM production_units WHERE slug = $1', [slug]);
  return rows[0] || null;
}

function mapRequestRow(r) {
  return {
    ...r,
    mrc: r.mrc != null ? Number(r.mrc) : null,
    nrc: r.nrc != null ? Number(r.nrc) : null,
  };
}

/** Dashboard counts for a unit view */
export async function getProductionDashboardStats(unitSlug, userId, userUnits, isSuperAdmin) {
  const unit = await getProductionUnitBySlug(unitSlug);
  if (!unit) throw new Error('Unit not found');

  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let rejected = 0;

  if (unit.unit_stage === 'project') {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS c FROM production_requests GROUP BY status`
    );
    for (const row of rows) {
      if (row.status === 'integrated' || row.status === 'noc_approved') pending += row.c;
      else if (row.status === 'pending' || row.status === 'ongoing') inProgress += row.c;
      else if (row.status === 'completed') completed += row.c;
      else if (row.status === 'rejected') rejected += row.c;
    }
  } else if (unit.unit_stage === 'ts') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests WHERE current_stage = 'ts' AND status = 'pending'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests
       WHERE NOT (current_stage = 'ts' AND status = 'pending')`
    );
    completed = r2.rows[0].c;
  } else if (unit.unit_stage === 'ip') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests WHERE current_stage = 'ip' AND status = 'ongoing'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests
       WHERE NOT (current_stage = 'ip' AND status = 'ongoing')
         AND (circuit_id IS NOT NULL OR current_stage IN ('project','done') OR status IN ('integrated','completed','rejected'))`
    );
    completed = r2.rows[0].c;
  } else if (unit.unit_stage === 'noc') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests
       WHERE status = 'integrated' AND current_stage = 'project'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM production_requests WHERE status = 'completed' OR current_stage = 'done'`
    );
    completed = r2.rows[0].c;
  }

  return { unit, pending, inProgress, completed, rejected };
}

export async function listProductionRequests({
  unitSlug,
  userId,
  userUnits,
  isSuperAdmin,
  status,
  search,
  sort = 'updated_at',
  order = 'desc',
  view = 'active',
}) {
  const unit = await getProductionUnitBySlug(unitSlug);
  if (!unit) throw new Error('Unit not found');

  const params = [];
  let where = 'WHERE 1=1';
  const isHistory = view === 'history';

  if (unit.unit_stage === 'project') {
    // Project unit monitors every request in the pipeline
  } else if (unit.unit_stage === 'ts') {
    if (isHistory) {
      where += ` AND NOT (pr.current_stage = 'ts' AND pr.status = 'pending')`;
    } else {
      where += ` AND pr.current_stage = 'ts' AND pr.status = 'pending'`;
    }
  } else if (unit.unit_stage === 'ip') {
    if (isHistory) {
      where += ` AND NOT (pr.current_stage = 'ip' AND pr.status = 'ongoing')`;
      where += ` AND (pr.circuit_id IS NOT NULL OR pr.current_stage IN ('noc','done') OR pr.status IN ('integrated','completed','rejected'))`;
    } else {
      where += ` AND pr.current_stage = 'ip' AND pr.status = 'ongoing'`;
    }
  } else if (unit.unit_stage === 'noc') {
    if (isHistory) {
      where += ` AND (pr.status = 'completed' OR pr.current_stage = 'done')`;
    } else {
      where += ` AND pr.status = 'integrated' AND pr.current_stage = 'project'`;
    }
  }

  if (status && status !== 'all') {
    params.push(status);
    where += ` AND pr.status = $${params.length}`;
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const i = params.length;
    where += ` AND (
      LOWER(pr.customer_name) LIKE $${i} OR
      LOWER(pr.site_name) LIKE $${i} OR
      LOWER(pr.region) LIKE $${i} OR
      LOWER(pr.created_by_name) LIKE $${i}
    )`;
  }

  const allowedSort = { updated_at: 'pr.updated_at', created_at: 'pr.created_at', customer_name: 'pr.customer_name', status: 'pr.status' };
  const sortCol = allowedSort[sort] || 'pr.updated_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const { rows } = await pool.query(
    `SELECT pr.id, pr.customer_name, pr.site_name, pr.region, pr.status, pr.current_stage,
            pr.created_at, pr.updated_at, pr.project_unit_name, pr.created_by_name
     FROM production_requests pr
     ${where}
     ORDER BY ${sortCol} ${sortDir}`,
    params
  );
  return rows.map(mapRequestRow);
}

export async function createProductionRequest(data, user) {
  const unit = data.project_unit_id
    ? (await pool.query('SELECT * FROM production_units WHERE id = $1', [data.project_unit_id])).rows[0]
    : await getProductionUnitBySlug('project');

  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const initialStage = ['ts', 'ip'].includes(data.route_to_stage) ? data.route_to_stage : 'ts';
  const initialStatus = initialStage === 'ip' ? 'ongoing' : 'pending';

  const { rows } = await pool.query(
    `INSERT INTO production_requests (
      customer_name, site_name, location, region, capacity, bandwidth,
      cable_displacement, service_type, cpe, start_date, completion_date, confirmation_date,
      status, current_stage, mrc, nrc, initial_remarks,
      project_unit_id, project_unit_name, created_by_user_id, created_by_name
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    RETURNING *`,
    [
      data.customer_name,
      data.site_name,
      data.location || null,
      data.region || null,
      data.capacity || null,
      data.bandwidth || null,
      data.cable_displacement || null,
      data.service_type || null,
      data.cpe || null,
      data.start_date || null,
      data.completion_date || null,
      data.confirmation_date || null,
      initialStatus,
      initialStage,
      data.mrc ?? null,
      data.nrc ?? null,
      data.initial_remarks || null,
      unit?.id || null,
      unit?.name || 'Project Unit',
      user.id,
      authorName,
    ]
  );
  const created = mapRequestRow(rows[0]);
  if (data.initial_remarks?.trim()) {
    await addProductionRemark(
      created.id,
      { comment_text: data.initial_remarks.trim(), stage: 'project' },
      user
    );
  }
  return getProductionRequestById(created.id);
}

export async function getProductionRequestById(id) {
  const { rows } = await pool.query('SELECT * FROM production_requests WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const request = mapRequestRow(rows[0]);

  const remarks = await pool.query(
    `SELECT * FROM production_request_remarks WHERE request_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  const attachments = await pool.query(
    `SELECT * FROM production_request_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  return {
    ...request,
    remarks: remarks.rows,
    attachments: attachments.rows,
  };
}

/** Can user view this request? */
export function canViewRequest(request, user, userUnits) {
  if (user.role === 'superadmin') return true;
  if (request.created_by_user_id === user.id) return true;

  const stage = request.current_stage;
  const status = request.status;

  if (stage === 'ts' && (userUnits.includes('ts') || user.role === 'noc')) {
    return status !== 'pending' || userUnits.includes('ts');
  }
  if (stage === 'ts' && userUnits.includes('ts')) return true;
  if (['ip', 'noc', 'done'].includes(stage) && userUnits.includes('ts')) return true;
  if (['ip', 'noc', 'done'].includes(stage) && userUnits.includes('ip')) return true;
  if (['noc', 'done'].includes(stage) && userUnits.includes('noc')) return true;

  if (stage === 'ip' && userUnits.includes('ip') && status !== 'pending') return true;
  if (stage === 'noc' && userUnits.includes('noc') && ['integrated', 'completed'].includes(status)) return true;
  if (stage === 'rejected' && (userUnits.includes('ts') || request.created_by_user_id === user.id)) return true;

  return false;
}

/** Project unit + superadmin see full pipeline on detail */
export function canViewFullPipeline(user, userUnits) {
  if (user.role === 'superadmin' || user.main_role === 'superadmin') return true;
  return userUnits.includes('project');
}

export function canViewRequestV2(request, user, userUnits) {
  if (user.role === 'superadmin' || user.main_role === 'superadmin') return true;
  if (canViewFullPipeline(user, userUnits)) return true;

  const { current_stage: stage, status } = request;

  if (userUnits.includes('ts')) {
    if (stage === 'ts') return true;
    if (stage === 'rejected' && status === 'rejected') return true;
    if (stage !== 'ts' || status !== 'pending') return true;
  }
  if (userUnits.includes('ip')) {
    if (stage === 'ip' && status === 'ongoing') return true;
    if (['noc', 'done'].includes(stage) || status === 'integrated' || status === 'completed') return true;
    if (request.circuit_id || request.ip_address) return true;
  }
  if (userUnits.includes('noc')) {
    if (status === 'integrated' && stage === 'project') return true;
    if (stage === 'done' || status === 'completed') return true;
    if (stage === 'noc' && status === 'integrated') return true;
  }
  if (userUnits.includes('project')) {
    if (status === 'completed' || stage === 'done') return true;
    if (status === 'integrated' && stage === 'project') return true;
    if (status === 'noc_approved' && stage === 'project') return true;
  }
  return false;
}

export async function addProductionRemark(requestId, { comment_text, stage }, user) {
  await assertProductionRequestNotLocked(requestId);
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO production_request_remarks (request_id, user_id, author_name, stage, comment_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [requestId, user.id, authorName, stage, comment_text.trim()]
  );
  await pool.query('UPDATE production_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [requestId]);
  return rows[0];
}

export async function addProductionAttachment(requestId, file, stage, user) {
  await assertProductionRequestNotLocked(requestId);
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO production_request_attachments
     (request_id, user_id, uploader_name, file_path, file_name, mime_type, stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [requestId, user.id, authorName, file.path, file.originalname, file.mimetype, stage]
  );
  await pool.query('UPDATE production_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [requestId]);
  return rows[0];
}

/** TX accept -> route to IP or back to Project Unit */
export async function tsAcceptRequest(requestId, user, routeToStage = 'ip') {
  const nextStage = routeToStage === 'project' ? 'project' : 'ip';
  const nextStatus = nextStage === 'project' ? 'integrated' : 'ongoing';
  const { rows } = await pool.query(
    `UPDATE production_requests SET
      status = $2, current_stage = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ts' AND status = 'pending'
     RETURNING *`,
    [requestId, nextStatus, nextStage]
  );
  if (!rows[0]) throw new Error('Request not found or not awaiting TX action');
  return mapRequestRow(rows[0]);
}

export async function tsRejectRequest(requestId, user) {
  const { rows } = await pool.query(
    `UPDATE production_requests SET
      status = 'rejected', current_stage = 'rejected', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ts' AND status = 'pending'
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) throw new Error('Request not found or not awaiting TX action');
  return mapRequestRow(rows[0]);
}

function pickIpPayload(data = {}) {
  const { comment_text, ...rest } = data;
  return {
    fields: {
      circuit_id: rest.circuit_id,
      integration_date: rest.integration_date,
      ip_address: rest.ip_address,
      mac_address: rest.mac_address,
      integrated_by: rest.integrated_by,
    },
    comment_text: typeof comment_text === 'string' ? comment_text.trim() : '',
  };
}

/** IP submit -> Project Unit, or back to TX when more transmission work is needed */
export async function ipForwardRequest(requestId, data, user) {
  await assertProductionRequestNotLocked(requestId);
  const { fields, comment_text } = pickIpPayload(data);
  const routeToStage = data?.route_to_stage === 'ts' ? 'ts' : 'project';
  const nextStatus = routeToStage === 'ts' ? 'pending' : 'integrated';
  const { rows } = await pool.query(
    `UPDATE production_requests SET
      circuit_id = $2,
      integration_date = $3,
      ip_address = $4,
      mac_address = $5,
      integrated_by = $6,
      status = $7,
      current_stage = $8,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ip' AND status = 'ongoing'
     RETURNING *`,
    [
      requestId,
      fields.circuit_id || null,
      fields.integration_date || null,
      fields.ip_address || null,
      fields.mac_address || null,
      fields.integrated_by || null,
      nextStatus,
      routeToStage,
    ]
  );
  if (!rows[0]) throw new Error('Request not found or not at IP stage');
  if (user && comment_text) {
    await addProductionRemark(requestId, { comment_text, stage: 'ip' }, user);
  }
  return getProductionRequestById(requestId);
}

/** IP save integration fields without forwarding (comment is ignored — use forward to send notes) */
export async function ipUpdateRequest(requestId, data, user) {
  await assertProductionRequestNotLocked(requestId);
  const { fields, comment_text } = pickIpPayload(data);
  const { rows } = await pool.query(
    `UPDATE production_requests SET
      circuit_id = COALESCE($2, circuit_id),
      integration_date = COALESCE($3, integration_date),
      ip_address = COALESCE($4, ip_address),
      mac_address = COALESCE($5, mac_address),
      integrated_by = COALESCE($6, integrated_by),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ip'
     RETURNING *`,
    [
      requestId,
      fields.circuit_id,
      fields.integration_date,
      fields.ip_address,
      fields.mac_address,
      fields.integrated_by,
    ]
  );
  if (!rows[0]) throw new Error('Request not found or not at IP stage');
  return getProductionRequestById(requestId);
}

/** NOC accepts — returns to Project Unit for final sign-off */
export async function nocApproveRequest(requestId) {
  try {
    const { rows } = await pool.query(
      `UPDATE production_requests SET
        status = 'noc_approved', current_stage = 'project', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND current_stage = 'noc' AND status = 'integrated'
       RETURNING *`,
      [requestId]
    );
    if (!rows[0]) {
      const { rows: cur } = await pool.query(
        `SELECT id, status, current_stage FROM production_requests WHERE id = $1`,
        [requestId]
      );
      if (!cur[0]) throw new Error('Request not found');
      const { status, current_stage } = cur[0];
      if (status === 'noc_approved' && current_stage === 'project') {
        throw new Error('This request was already approved and sent to Project Unit');
      }
      throw new Error(
        `Request is not awaiting NOC approval (stage: ${current_stage}, status: ${status})`
      );
    }
    return mapRequestRow(rows[0]);
  } catch (e) {
    if (e.code === '23514') {
      await migrateProductionConstraints();
      const { rows } = await pool.query(
        `UPDATE production_requests SET
          status = 'noc_approved', current_stage = 'project', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND current_stage = 'noc' AND status = 'integrated'
         RETURNING *`,
        [requestId]
      );
      if (!rows[0]) throw new Error('Request not found or not awaiting NOC approval');
      return mapRequestRow(rows[0]);
    }
    throw e;
  }
}

/** Project Unit approves and marks complete after IP submission */
export async function projectCompleteRequest(requestId, user) {
  const { rows: cur } = await pool.query(
    `SELECT id, status, current_stage FROM production_requests WHERE id = $1`,
    [requestId]
  );
  if (!cur[0]) throw new Error('Request not found');
  const { status, current_stage: stage } = cur[0];
  if (status === 'completed' || stage === 'done') {
    throw new Error('Request is already completed');
  }
  if (!['integrated', 'noc_approved'].includes(status)) {
    throw new Error(
      `Request is not awaiting Project Unit completion (status: ${status}, stage: ${stage})`
    );
  }

  const { rows } = await pool.query(
    `UPDATE production_requests SET
      status = 'completed', current_stage = 'done', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('integrated', 'noc_approved')
       AND current_stage NOT IN ('done', 'rejected')
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) throw new Error('Request is not awaiting Project Unit completion');
  return mapRequestRow(rows[0]);
}

export { PIPELINE_STAGES };
