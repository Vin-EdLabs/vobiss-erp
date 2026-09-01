/**
 * Service Request workflow — database layer
 */
import pool from '../db.js';
import { syncProjectRequestToWip } from '../services/wipSync.js';

const PIPELINE_STAGES = ['ts', 'ip', 'noc'];

function syncWip(requestId) {
  return syncProjectRequestToWip(requestId).catch((e) => console.error('[wipSync] sync failed', requestId, e.message));
}

/** Rename legacy production_* tables if they exist (one-time on existing DBs). */
async function migrateRenameLegacyProductionTables() {
  const renames = [
    ['production_units', 'project_units'],
    ['production_requests', 'project_requests'],
    ['production_request_remarks', 'project_request_remarks'],
    ['production_request_attachments', 'project_request_attachments'],
  ];
  for (const [from, to] of renames) {
    const { rows } = await pool.query(
      `SELECT to_regclass($1) AS old_tbl, to_regclass($2) AS new_tbl`,
      [`public.${from}`, `public.${to}`]
    );
    const { old_tbl, new_tbl } = rows[0] || {};
    if (old_tbl && !new_tbl) {
      await pool.query(`ALTER TABLE ${from} RENAME TO ${to}`);
      console.log(`[project-request] renamed table ${from} -> ${to}`);
    }
  }
}

// Called from many places — a router-level "run once" middleware in project.routes.js, plus
// several individual WIP route handlers that call it directly and were never covered by that
// middleware (they're registered earlier in the file, before the middleware's router.use()).
// Without a guard at the source, concurrent requests each trigger their own full run, and the
// DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT calls inside race and fail with "constraint already
// exists" (confirmed with a live concurrency test — this is what a burst of requests right after
// a restart looks like). Caching the in-flight/completed promise here means every caller, no
// matter where it's called from, safely shares the exact same single run.
let initPromise = null;
export function initProjectRequestTables() {
  if (!initPromise) {
    initPromise = runInitProjectRequestTables().catch((e) => {
      initPromise = null;
      throw e;
    });
  }
  return initPromise;
}

async function runInitProjectRequestTables() {
  await migrateRenameLegacyProductionTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_units (
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
    CREATE TABLE IF NOT EXISTS project_requests (
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
      project_unit_id INTEGER REFERENCES project_units(id),
      project_unit_name VARCHAR(120),
      created_by_user_id INTEGER REFERENCES users(id),
      created_by_name VARCHAR(255),
      circuit_id VARCHAR(120),
      integration_date DATE,
      ip_address VARCHAR(120),
      mac_address VARCHAR(120),
      integrated_by VARCHAR(255),
      isp VARCHAR(255),
      survey_date DATE,
      design_specification TEXT,
      design_reference TEXT,
      is_design_request BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS isp VARCHAR(255);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS survey_date DATE;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS design_specification TEXT;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS design_reference TEXT;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS is_design_request BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS adss TEXT;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS drop_cable TEXT;`);
  // 360° Service Request Flow — real links to the same customers/customer_sites tables
  // Tickets/Field Work/IP Unit already use (customer_name/site_name text columns above stay
  // untouched for legacy rows), and the "Design confirmed → SR-XXXX is real" moment.
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS design_confirmed_at TIMESTAMP;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_proj_req_customer ON project_requests(customer_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_proj_req_site ON project_requests(site_id);`);

  // 360° Service Request Flow v2 — Sales's Feasibility Request Form fields (not covered by any
  // existing column) and TX/NOC's own notes field (Design and IP already had a place to leave
  // stage-specific detail; TX and NOC only had the shared comment thread until now).
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS account_manager VARCHAR(255);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS feasibility_type VARCHAR(60);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(60);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS technical_contact_name VARCHAR(255);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS technical_contact_email VARCHAR(255);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS technical_contact_phone VARCHAR(60);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS site_coordinates VARCHAR(120);`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS ts_notes TEXT;`);
  await pool.query(`ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS noc_notes TEXT;`);

  await pool.query(`CREATE TABLE IF NOT EXISTS project_wip_entries (
    id SERIAL PRIMARY KEY, deleted_at TIMESTAMP, customer_name TEXT, site_name TEXT, location TEXT, region TEXT,
    capacity TEXT, bandwidth TEXT, planned_adss_distance TEXT, planned_drop_cable_distance TEXT, service_type TEXT, cpe TEXT,
    start_date DATE, completion_date DATE, confirmation_date DATE, status VARCHAR(30) NOT NULL DEFAULT 'In Progress',
    mrc TEXT, sale_price TEXT, through_value TEXT, existing_poles TEXT, remarks TEXT,
    created_by INTEGER REFERENCES users(id), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  // Service Request -> WIP auto-sync — each confirmed SR keeps a mirrored WIP row (see
  // services/wipSync.js) and, once linked, shares its real chat channel with the WIP row too.
  await pool.query(`ALTER TABLE project_wip_entries ADD COLUMN IF NOT EXISTS project_request_id INTEGER UNIQUE REFERENCES project_requests(id) ON DELETE SET NULL;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wip_project_request ON project_wip_entries(project_request_id);`);
  // chat_channels is created later in boot by initChat() (server.js), so on a first-ever boot
  // this FK can't be added yet — harmless, it succeeds on the next restart once that table exists.
  await pool.query(`ALTER TABLE project_wip_entries ADD COLUMN IF NOT EXISTS chat_channel_id UUID REFERENCES chat_channels(id) ON DELETE SET NULL;`).catch((e) => {
    console.warn('project_wip_entries.chat_channel_id column pending (chat_channels not ready yet):', e.message);
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS project_wip_history (
    id SERIAL PRIMARY KEY, entry_id INTEGER NOT NULL, field_name TEXT NOT NULL, old_value TEXT, new_value TEXT,
    changed_by INTEGER REFERENCES users(id), changed_by_name TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS project_wip_remarks (
    id SERIAL PRIMARY KEY, entry_id INTEGER NOT NULL, user_id INTEGER REFERENCES users(id), author_name TEXT NOT NULL,
    note_text TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // Project Unit customer acceptance documents.  Signatures are stored as data
  // URLs so a form remains self-contained and can be rendered/printed later.
  await pool.query(`CREATE TABLE IF NOT EXISTS project_signoff_forms (
    id SERIAL PRIMARY KEY,
    reference_no VARCHAR(40) UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
    contractor VARCHAR(255) NOT NULL DEFAULT 'Vobiss Solutions Ltd',
    site_name VARCHAR(255) NOT NULL,
    circuit_id VARCHAR(120), type_of_service VARCHAR(160), contractual_bandwidth VARCHAR(120), test_date DATE,
    device_type VARCHAR(160), device_model VARCHAR(160), device_serial_number VARCHAR(160),
    packet_loss VARCHAR(120), latency VARCHAR(120), jitter VARCHAR(120), billing_date DATE,
    client_signature TEXT, client_name VARCHAR(255), client_date DATE, client_telephone VARCHAR(80), client_company_name VARCHAR(255),
    vobiss_signature TEXT, vobiss_name VARCHAR(255), vobiss_date DATE, vobiss_telephone VARCHAR(80),
    manager_signature TEXT, manager_name VARCHAR(255), manager_date DATE, rejection_reason TEXT,
    linked_record_type VARCHAR(40), linked_record_id INTEGER, linked_record_ref VARCHAR(120),
    created_by INTEGER NOT NULL REFERENCES users(id), created_by_name VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMP, approved_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signoff_status ON project_signoff_forms(status, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_signoff_creator ON project_signoff_forms(created_by)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS design_materials (
      id SERIAL PRIMARY KEY,
      material_name VARCHAR(255) NOT NULL,
      unit VARCHAR(80) NOT NULL,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      calculation_formula TEXT,
      is_primary_input BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_one_design_primary ON design_materials ((is_primary_input)) WHERE is_primary_input;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_request_design_materials (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
      material_id INTEGER REFERENCES design_materials(id) ON DELETE SET NULL,
      material_name VARCHAR(255) NOT NULL,
      unit VARCHAR(80) NOT NULL,
      unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
      quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
      line_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
      calculation_formula TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_request_remarks (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      author_name VARCHAR(255) NOT NULL,
      stage VARCHAR(20) NOT NULL,
      comment_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_request_attachments (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      uploader_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120),
      stage VARCHAR(20) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_proj_req_stage ON project_requests(current_stage, status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_proj_req_creator ON project_requests(created_by_user_id);`);

  await migrateProjectRequestConstraints();

  const defaults = [
    { name: 'TS — Transmission', slug: 'ts', unit_stage: 'ts', sort_order: 1 },
    { name: 'IP', slug: 'ip', unit_stage: 'ip', sort_order: 2 },
    { name: 'NOC', slug: 'noc', unit_stage: 'noc', sort_order: 3 },
    { name: 'Project Unit', slug: 'project', unit_stage: 'project', sort_order: 0 },
  ];
  for (const u of defaults) {
    await pool.query(
      `INSERT INTO project_units (name, slug, unit_stage, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, unit_stage = EXCLUDED.unit_stage`,
      [u.name, u.slug, u.unit_stage, u.sort_order]
    );
  }
}

/** Drop every CHECK on project_requests (PG auto-names differ from our labels). */
async function dropProjectRequestCheckConstraints() {
  const { rows } = await pool.query(`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'project_requests' AND c.contype = 'c'
  `);
  for (const { conname } of rows) {
    await pool.query(
      `ALTER TABLE project_requests DROP CONSTRAINT IF EXISTS "${conname.replace(/"/g, '""')}"`
    );
  }
}

async function migrateProjectRequestConstraints() {
  try {
    // Drop + recreate every time (idempotent, cheap) rather than "add only if the constraint
    // name doesn't exist yet" — that check-then-add pattern is what let 'sales' silently stay
    // OFF the allowed current_stage list for a long time even though submitDesignRequest()
    // has always written current_stage='sales': the constraint got created once, early, before
    // 'sales' was added to the source list here, and never got refreshed. Unconditional
    // drop+add means every deploy actually reflects the current allowed-values list below.
    await pool.query(`ALTER TABLE project_requests DROP CONSTRAINT IF EXISTS project_requests_status_check`);
    await pool.query(`
      ALTER TABLE project_requests ADD CONSTRAINT project_requests_status_check
      CHECK (status IN ('pending','ongoing','integrated','rejected','completed','noc_approved','submitted_to_sales'));
    `);

    await pool.query(`ALTER TABLE project_requests DROP CONSTRAINT IF EXISTS project_requests_current_stage_check`);
    await pool.query(`
      ALTER TABLE project_requests ADD CONSTRAINT project_requests_current_stage_check
      CHECK (current_stage IN ('ts','ip','noc','done','rejected','project','design','sales'));
    `);

    await pool.query(`
      UPDATE project_requests
      SET current_stage = 'project', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'integrated' AND current_stage = 'noc'
    `);
    console.log('[project-request] workflow constraints migrated');
  } catch (e) {
    console.error('[project-request] constraint migration failed:', e.message);
    throw e;
  }
}

export function isProjectRequestLocked(request) {
  return request?.status === 'completed' || request?.current_stage === 'done';
}

async function assertProjectRequestNotLocked(requestId) {
  const { rows } = await pool.query(
    'SELECT status, current_stage FROM project_requests WHERE id = $1',
    [requestId]
  );
  if (!rows[0]) throw new Error('Request not found');
  if (isProjectRequestLocked(rows[0])) {
    throw new Error('Request is completed â€” no further comments or uploads allowed');
  }
}

export async function ensureProjectRequestWorkflowConstraints() {
  await migrateProjectRequestConstraints();
}

export async function getProjectUnits(includeInactive = false) {
  const q = includeInactive
    ? 'SELECT * FROM project_units ORDER BY sort_order, name'
    : 'SELECT * FROM project_units WHERE is_active = true ORDER BY sort_order, name';
  const { rows } = await pool.query(q);
  return rows;
}

export async function createProjectUnit({ name, slug, unit_stage, description }) {
  const cleanSlug = (slug || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stage = unit_stage || 'project';
  if (!['project', 'ts', 'ip', 'noc'].includes(stage)) throw new Error('Invalid unit stage');
  const { rows } = await pool.query(
    `INSERT INTO project_units (name, slug, unit_stage, description)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name.trim(), cleanSlug, stage, description || null]
  );
  return rows[0];
}

export async function updateProjectUnit(id, { name, description, is_active, sort_order }) {
  const { rows } = await pool.query(
    `UPDATE project_units SET
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

export async function getProjectUnitBySlug(slug) {
  const canonical = String(slug || '').toLowerCase() === 'tx' ? 'ts' : slug;
  const { rows } = await pool.query('SELECT * FROM project_units WHERE slug = $1', [canonical]);
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
export async function getProjectRequestDashboardStats(unitSlug, userId, userUnits, isSuperAdmin) {
  const unit = await getProjectUnitBySlug(unitSlug);
  if (!unit) throw new Error('Unit not found');

  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let rejected = 0;

  if (unit.unit_stage === 'project') {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int AS c FROM project_requests GROUP BY status`
    );
    for (const row of rows) {
      if (row.status === 'integrated' || row.status === 'noc_approved') pending += row.c;
      else if (row.status === 'pending' || row.status === 'ongoing') inProgress += row.c;
      else if (row.status === 'completed') completed += row.c;
      else if (row.status === 'rejected') rejected += row.c;
    }
  } else if (unit.unit_stage === 'ts') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests WHERE current_stage = 'ts' AND status = 'pending'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests
       WHERE NOT (current_stage = 'ts' AND status = 'pending')`
    );
    completed = r2.rows[0].c;
  } else if (unit.unit_stage === 'ip') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests WHERE current_stage = 'ip' AND status = 'ongoing'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests
       WHERE NOT (current_stage = 'ip' AND status = 'ongoing')
         AND (circuit_id IS NOT NULL OR current_stage IN ('project','done') OR status IN ('integrated','completed','rejected'))`
    );
    completed = r2.rows[0].c;
  } else if (unit.unit_stage === 'noc') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests
       WHERE status = 'integrated' AND current_stage = 'project'`
    );
    pending = r.rows[0].c;
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM project_requests WHERE status = 'completed' OR current_stage = 'done'`
    );
    completed = r2.rows[0].c;
  }

  return { unit, pending, inProgress, completed, rejected };
}

export async function listProjectRequests({
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
  const unit = await getProjectUnitBySlug(unitSlug);
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
            pr.created_at, pr.updated_at, pr.project_unit_name, pr.created_by_name,
            pr.chat_channel_id
     FROM project_requests pr
     ${where}
     ORDER BY ${sortCol} ${sortDir}`,
    params
  );
  return rows.map(mapRequestRow);
}

export async function createProjectRequest(data, user) {
  const unit = data.project_unit_id
    ? (await pool.query('SELECT * FROM project_units WHERE id = $1', [data.project_unit_id])).rows[0]
    : await getProjectUnitBySlug('project');

  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const initialStage = ['ts', 'ip'].includes(data.route_to_stage) ? data.route_to_stage : 'ts';
  const initialStatus = initialStage === 'ip' ? 'ongoing' : 'pending';

  const { rows } = await pool.query(
    `INSERT INTO project_requests (
      customer_name, site_name, location, region, capacity, bandwidth,
      cable_displacement, adss, drop_cable, service_type, cpe, start_date, completion_date, confirmation_date,
      status, current_stage, mrc, nrc, initial_remarks,
      project_unit_id, project_unit_name, created_by_user_id, created_by_name, customer_id, site_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
    RETURNING *`,
    [
      data.customer_name,
      data.site_name,
      data.location || null,
      data.region || null,
      data.capacity || null,
      data.bandwidth || null,
      data.cable_displacement || null,
      data.adss || null,
      data.drop_cable || null,
      data.service_type || null,
      data.cpe || null,
      data.start_date || null,
      data.completion_date || null,
      data.confirmation_date || null,
      initialStatus, initialStage, data.mrc ?? null, data.nrc ?? null, data.initial_remarks || null, unit?.id || null, unit?.name || 'Project Unit', user.id, authorName,
      data.customer_id || null, data.site_id || null,
    ]
  );
  const created = mapRequestRow(rows[0]);
  if (data.initial_remarks?.trim()) {
    await addProjectRequestRemark(
      created.id,
      { comment_text: data.initial_remarks.trim(), stage: 'project' },
      user
    );
  }
  return getProjectRequestById(created.id);
}

export async function getProjectRequestById(id) {
  const { rows } = await pool.query('SELECT * FROM project_requests WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const request = mapRequestRow(rows[0]);

  const remarks = await pool.query(
    `SELECT * FROM project_request_remarks WHERE request_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  const attachments = await pool.query(
    `SELECT * FROM project_request_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  const designMaterials = await pool.query(
    `SELECT id, material_id, material_name, unit, unit_price::float, quantity::float, line_cost::float, calculation_formula
     FROM project_request_design_materials WHERE request_id = $1 ORDER BY id`,
    [id]
  );
  return {
    ...request,
    remarks: remarks.rows,
    attachments: attachments.rows,
    design_materials: designMaterials.rows,
  };
}

export async function getDesignMaterials() {
  const { rows } = await pool.query(
    `SELECT id, material_name, unit, unit_price::float, calculation_formula, is_primary_input, sort_order
     FROM design_materials ORDER BY sort_order, material_name`
  );
  return rows;
}

export async function saveDesignMaterial(data, id = null) {
  const name = String(data.material_name || '').trim();
  const unit = String(data.unit || '').trim();
  if (!name || !unit) throw new Error('Material name and unit are required');
  const price = Number(data.unit_price);
  if (!Number.isFinite(price) || price < 0) throw new Error('Unit price must be a valid positive amount');
  const primary = Boolean(data.is_primary_input);
  if (primary) await pool.query('UPDATE design_materials SET is_primary_input = false WHERE is_primary_input = true');
  const values = [name, unit, price, String(data.calculation_formula || '').trim() || null, primary, Number(data.sort_order) || 0];
  const query = id
    ? `UPDATE design_materials SET material_name=$1, unit=$2, unit_price=$3, calculation_formula=$4, is_primary_input=$5, sort_order=$6, updated_at=CURRENT_TIMESTAMP WHERE id=$7 RETURNING id, material_name, unit, unit_price::float, calculation_formula, is_primary_input, sort_order`
    : `INSERT INTO design_materials (material_name, unit, unit_price, calculation_formula, is_primary_input, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, material_name, unit, unit_price::float, calculation_formula, is_primary_input, sort_order`;
  if (id) values.push(Number(id));
  const { rows } = await pool.query(query, values);
  if (!rows[0]) throw new Error('Material not found');
  return rows[0];
}

export async function deleteDesignMaterial(id) {
  const { rowCount } = await pool.query('DELETE FROM design_materials WHERE id = $1', [id]);
  if (!rowCount) throw new Error('Material not found');
}

export async function createDesignRequest(data, user) {
  const siteName = String(data.site_name || '').trim();
  if (!siteName) throw new Error('Site name is required');
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO project_requests (customer_name, site_name, location, region, isp, survey_date, design_specification, design_reference,
      status, current_stage, project_unit_name, created_by_user_id, created_by_name, is_design_request)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted_to_sales','project','Sales',$9,$10,true) RETURNING *`,
    [data.customer_name || siteName, siteName, data.location || null, data.region || null, data.isp || null, data.survey_date || null,
      data.design_specification || null, data.design_reference || null, user.id, authorName]
  );
  const request = rows[0];
  const materials = Array.isArray(data.materials) ? data.materials : [];
  for (const item of materials) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    await pool.query(
      `INSERT INTO project_request_design_materials (request_id, material_id, material_name, unit, unit_price, quantity, line_cost, calculation_formula)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [request.id, item.material_id || null, item.material_name, item.unit, unitPrice, quantity, quantity * unitPrice, item.calculation_formula || null]
    );
  }
  return getProjectRequestById(request.id);
}

export async function createSalesRequest(data, user) {
  const siteName = String(data.site_name || '').trim();
  if (!siteName) throw new Error('Site name is required');
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO project_requests (customer_name, site_name, location, region, isp, initial_remarks, status, current_stage,
      project_unit_name, created_by_user_id, created_by_name, is_design_request, customer_id, site_id,
      capacity, service_type, account_manager, feasibility_type, request_type,
      technical_contact_name, technical_contact_email, technical_contact_phone, site_coordinates)
     VALUES ($1,$2,$3,$4,$5,$6,'pending','design','Design Unit',$7,$8,true,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
    [data.customer_name || siteName, siteName, data.location || null, data.region || null, data.isp || null,
      data.initial_remarks || null, user.id, authorName, data.customer_id || null, data.site_id || null,
      data.capacity || null, data.service_type || null, data.account_manager || null, data.feasibility_type || null, data.request_type || null,
      data.technical_contact_name || null, data.technical_contact_email || null, data.technical_contact_phone || null, data.site_coordinates || null]
  );
  return getProjectRequestById(rows[0].id);
}

export async function submitDesignRequest(id, data, user) {
  const siteName = String(data.site_name || '').trim();
  if (!siteName) throw new Error('Site name is required');
  const { rows } = await pool.query(
    `UPDATE project_requests SET site_name=$2, location=$3, region=$4, isp=$5, survey_date=$6, design_specification=$7,
      design_reference=$8, cable_displacement=$9, adss=$10, drop_cable=$11,
      status='submitted_to_sales', current_stage='sales', project_unit_name='Sales', updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND is_design_request=true AND current_stage='design' RETURNING *`,
    [id, siteName, data.location || null, data.region || null, data.isp || null, data.survey_date || null,
      data.design_specification || null, data.design_reference || null,
      data.cable_displacement || null, data.adss || null, data.drop_cable || null]
  );
  if (!rows[0]) throw new Error('Request is not awaiting Design Unit work');
  await pool.query('DELETE FROM project_request_design_materials WHERE request_id = $1', [id]);
  for (const item of Array.isArray(data.materials) ? data.materials : []) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    await pool.query(
      `INSERT INTO project_request_design_materials (request_id, material_id, material_name, unit, unit_price, quantity, line_cost, calculation_formula)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, item.material_id || null, item.material_name, item.unit, unitPrice, quantity, quantity * unitPrice, item.calculation_formula || null]
    );
  }
  if (data.design_specification?.trim()) await addProjectRequestRemark(id, { comment_text: 'Design survey submitted to Sales.', stage: 'design' }, user);
  await syncWip(id);
  return getProjectRequestById(id);
}

/**
 * "Confirm & Forward to Project" — the 360° flow's core moment, lives with Sales's review of
 * Design's completed survey (current_stage='sales', set by submitDesignRequest() above once
 * Design sends the survey back). Sets design_confirmed_at, which is what the SR profile uses to
 * decide whether to show "Draft" or the real SR-XXXX banner — see referenceRegistry.js's
 * computeRefNumber() for where SR-XXXX itself is (and always was) computed from the row id.
 */
export async function confirmDesignRequest(id, user) {
  const { rows } = await pool.query(
    `UPDATE project_requests
     SET current_stage='project', status='pending', design_confirmed_at=CURRENT_TIMESTAMP, project_unit_name='Project Unit', updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND current_stage='sales' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Request is not awaiting Sales review');
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  await addProjectRequestRemark(id, { comment_text: `${authorName} confirmed the design — ready for Project Unit.`, stage: 'sales' }, user);
  await syncWip(id);
  return getProjectRequestById(id);
}

/** Sales rejects Design's survey and bounces it back — the first real "send it back" path in
 *  the flow. Comment is required so Design knows what to fix. */
export async function rejectSalesReview(id, comment, user) {
  const text = String(comment || '').trim();
  if (!text) throw new Error('A comment is required when rejecting back to Design');
  const { rows } = await pool.query(
    `UPDATE project_requests
     SET current_stage='design', status='pending', updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND current_stage='sales' RETURNING *`,
    [id]
  );
  if (!rows[0]) throw new Error('Request is not awaiting Sales review');
  await addProjectRequestRemark(id, { comment_text: text, stage: 'sales' }, user);
  return getProjectRequestById(id);
}

// Project's technical/commercial fields — fillable inline at the routing step (project -> ts/ip),
// same "save fields and advance stage in one call" shape IP's own forward already uses.
const PROJECT_STAGE_FIELDS = [
  'capacity', 'bandwidth', 'cpe', 'cable_displacement', 'adss', 'drop_cable',
  'start_date', 'completion_date', 'confirmation_date', 'mrc', 'nrc',
];

export async function forwardWorkflowRequest(id, fromStage, toStage, fields) {
  const transitions = {
    sales: { project: { status: 'pending', stage: 'project' } },
    project: { ts: { status: 'pending', stage: 'ts' }, ip: { status: 'ongoing', stage: 'ip' }, noc: { status: 'integrated', stage: 'noc' } },
  };
  const next = transitions[fromStage]?.[toStage];
  if (!next) throw new Error('Invalid workflow route');

  const setClauses = ['status=$3', 'current_stage=$4', 'project_unit_name=$5', 'updated_at=CURRENT_TIMESTAMP'];
  const params = [id, fromStage, next.status, next.stage, toStage === 'ts' ? 'TS — Transmission' : toStage === 'ip' ? 'IP' : toStage === 'noc' ? 'NOC' : 'Project Unit'];
  if (fromStage === 'project' && fields && typeof fields === 'object') {
    for (const key of PROJECT_STAGE_FIELDS) {
      if (fields[key] === undefined) continue;
      params.push(fields[key] === '' ? null : fields[key]);
      setClauses.push(`${key}=$${params.length}`);
    }
  }

  const { rows } = await pool.query(
    `UPDATE project_requests SET ${setClauses.join(', ')} WHERE id=$1 AND current_stage=$2 RETURNING *`,
    params
  );
  if (!rows[0]) throw new Error(`Request is no longer awaiting ${fromStage} action`);
  await syncWip(id);
  return getProjectRequestById(id);
}

export async function listDesignRequests() {
  const { rows } = await pool.query(
    `SELECT id, customer_name, site_name, location, region, isp, survey_date, status, current_stage, created_by_name, created_at, updated_at
     FROM project_requests WHERE is_design_request = true ORDER BY updated_at DESC`
  );
  return rows;
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

  const designRoles = [user?.role, user?.main_role, ...(Array.isArray(user?.roles) ? user.roles : [])]
    .map((value) => String(value || '').toLowerCase());
  if (request.is_design_request && (userUnits.includes('design') || designRoles.includes('design_manager') || designRoles.includes('design_supervisor'))) return true;

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
    if (request.is_design_request && status === 'submitted_to_sales') return true;
    if (status === 'completed' || stage === 'done') return true;
    if (status === 'integrated' && stage === 'project') return true;
    if (status === 'noc_approved' && stage === 'project') return true;
  }
  // Sales originates every 360° Service Request Flow SR (is_design_request is set on both the
  // Sales and Design creation paths) — same "visible for the life of the request" treatment as
  // Design above, not just while it's sitting in their own submitted_to_sales queue.
  if (userUnits.includes('sales') && request.is_design_request) return true;
  return false;
}

export async function addProjectRequestRemark(requestId, { comment_text, stage }, user) {
  await assertProjectRequestNotLocked(requestId);
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO project_request_remarks (request_id, user_id, author_name, stage, comment_text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [requestId, user.id, authorName, stage, comment_text.trim()]
  );
  await pool.query('UPDATE project_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [requestId]);
  return rows[0];
}

export async function addProjectRequestAttachment(requestId, file, stage, user) {
  await assertProjectRequestNotLocked(requestId);
  const authorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const { rows } = await pool.query(
    `INSERT INTO project_request_attachments
     (request_id, user_id, uploader_name, file_path, file_name, mime_type, stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [requestId, user.id, authorName, file.path, file.originalname, file.mimetype, stage]
  );
  await pool.query('UPDATE project_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [requestId]);
  return rows[0];
}

/** TX accept -> route to IP or back to Project Unit. notes (optional) is TX's own stage-specific
 *  field, same shape as ip_forward saving its integration fields in the same call. */
export async function tsAcceptRequest(requestId, user, routeToStage = 'ip', notes) {
  const nextStage = routeToStage === 'project' ? 'project' : 'ip';
  const nextStatus = nextStage === 'project' ? 'integrated' : 'ongoing';
  const { rows } = await pool.query(
    `UPDATE project_requests SET
      status = $2, current_stage = $3, ts_notes = COALESCE($4, ts_notes), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ts' AND status = 'pending'
     RETURNING *`,
    [requestId, nextStatus, nextStage, notes?.trim() || null]
  );
  if (!rows[0]) throw new Error('Request not found or not awaiting TX action');
  await syncWip(requestId);
  return mapRequestRow(rows[0]);
}

export async function tsRejectRequest(requestId, user) {
  const { rows } = await pool.query(
    `UPDATE project_requests SET
      status = 'rejected', current_stage = 'rejected', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND current_stage = 'ts' AND status = 'pending'
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) throw new Error('Request not found or not awaiting TX action');
  await syncWip(requestId);
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
  await assertProjectRequestNotLocked(requestId);
  const { fields, comment_text } = pickIpPayload(data);
  const routeToStage = data?.route_to_stage === 'ts' ? 'ts' : 'project';
  const nextStatus = routeToStage === 'ts' ? 'pending' : 'integrated';
  const { rows } = await pool.query(
    `UPDATE project_requests SET
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
    await addProjectRequestRemark(requestId, { comment_text, stage: 'ip' }, user);
  }
  await syncWip(requestId);
  return getProjectRequestById(requestId);
}

/** IP save integration fields without forwarding (comment is ignored â€” use forward to send notes) */
export async function ipUpdateRequest(requestId, data, user) {
  await assertProjectRequestNotLocked(requestId);
  const { fields, comment_text } = pickIpPayload(data);
  const { rows } = await pool.query(
    `UPDATE project_requests SET
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
  return getProjectRequestById(requestId);
}

/** NOC accepts â€” returns to Project Unit for final sign-off */
export async function nocApproveRequest(requestId, notes) {
  const notesValue = notes?.trim() || null;
  try {
    const { rows } = await pool.query(
      `UPDATE project_requests SET
        status = 'noc_approved', current_stage = 'project', noc_notes = COALESCE($2, noc_notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND current_stage = 'noc' AND status = 'integrated'
       RETURNING *`,
      [requestId, notesValue]
    );
    if (!rows[0]) {
      const { rows: cur } = await pool.query(
        `SELECT id, status, current_stage FROM project_requests WHERE id = $1`,
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
    await syncWip(requestId);
    return mapRequestRow(rows[0]);
  } catch (e) {
    if (e.code === '23514') {
      await migrateProjectRequestConstraints();
      const { rows } = await pool.query(
        `UPDATE project_requests SET
          status = 'noc_approved', current_stage = 'project', noc_notes = COALESCE($2, noc_notes), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND current_stage = 'noc' AND status = 'integrated'
         RETURNING *`,
        [requestId, notesValue]
      );
      if (!rows[0]) throw new Error('Request not found or not awaiting NOC approval');
      await syncWip(requestId);
      return mapRequestRow(rows[0]);
    }
    throw e;
  }
}

/** Project Unit approves and marks complete after IP submission */
export async function projectCompleteRequest(requestId, user) {
  const { rows: cur } = await pool.query(
    `SELECT id, status, current_stage FROM project_requests WHERE id = $1`,
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
    `UPDATE project_requests SET
      status = 'completed', current_stage = 'done', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('integrated', 'noc_approved')
       AND current_stage NOT IN ('done', 'rejected')
     RETURNING *`,
    [requestId]
  );
  if (!rows[0]) throw new Error('Request is not awaiting Project Unit completion');
  await syncWip(requestId);
  return mapRequestRow(rows[0]);
}

export { PIPELINE_STAGES };
