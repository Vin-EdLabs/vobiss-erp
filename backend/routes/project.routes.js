import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import {
  initProjectRequestTables,
  getProjectUnits,
  createProjectUnit,
  updateProjectUnit,
  getProjectUnitBySlug,
  getProjectRequestDashboardStats,
  listProjectRequests,
  createProjectRequest,
  getProjectRequestById,
  canViewRequestV2,
  canViewFullPipeline,
  addProjectRequestRemark,
  addProjectRequestAttachment,
  tsAcceptRequest,
  tsRejectRequest,
  ipForwardRequest,
  ipUpdateRequest,
  nocApproveRequest,
  projectCompleteRequest,
  getDesignMaterials,
  saveDesignMaterial,
  deleteDesignMaterial,
  createDesignRequest,
  listDesignRequests,
  createSalesRequest,
  submitDesignRequest,
  confirmDesignRequest,
  rejectSalesReview,
  forwardWorkflowRequest,
} from '../db/project.js';
import pool from '../db.js';
import { createNotification, insertAuditLog } from '../db.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { postProjectRequestSystemMessage } from '../services/chatSystemMessage.js';
import { logUserAction, recordViewPath } from '../services/activityLog.js';
import { recordTimingEvent } from '../services/workflowTimeEngine.js';
import { ensureProjectRequestThread } from '../services/chatRecordThreads.js';
import { effectiveUnitsForUser, hasProjectUnitAccess, hasDesignUnitAccess, isSystemAdminAccount, canonicalizeUnitSlug } from '../roles.js';
import { notifyUnit, notifyMany } from '../services/unitNotify.js';

// Who gets notified when a Service Request lands on each stage — mirrors the role/unit
// conventions already used across NOC Shift Schedule, IP Unit, and Field Work this session.
const STAGE_NOTIFY = {
  design: { roles: ['design_manager', 'design_supervisor'], unitSlugs: ['design'], label: 'Design' },
  sales: { roles: [], unitSlugs: ['sales'], label: 'Sales' },
  project: { roles: ['project_manager', 'project_supervisor'], unitSlugs: ['project'], label: 'Project Unit' },
  ts: { roles: ['ts_manager', 'ts_supervisor', 'field_engineer_admin'], unitSlugs: ['ts', 'tx'], label: 'TX' },
  ip: { roles: ['ip_manager', 'ip_supervisor'], unitSlugs: ['ip'], label: 'IP' },
  noc: { roles: ['noc_manager', 'noc_supervisor'], unitSlugs: ['noc'], label: 'NOC' },
};

async function notifySrStage(stage, { requestId, actingUserId, refLabel }) {
  const target = STAGE_NOTIFY[stage];
  if (!target) return;
  await notifyUnit({
    roles: target.roles, unitSlugs: target.unitSlugs,
    title: `Service Request needs ${target.label}`,
    message: `${refLabel} has moved to ${target.label} and is awaiting action.`,
    actingUserId, linkUrl: recordViewPath('service_request', requestId),
    notificationType: 'service_request_stage',
  }).catch(() => {});
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const wipName = (user) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'User';
const ensureWipTables = () => initProjectRequestTables();

router.get('/wip/options', authenticateToken, async (_req, res) => {
  await ensureWipTables();
  const [regions, serviceTypes] = await Promise.all([
    pool.query(`SELECT DISTINCT region AS value FROM project_wip_entries WHERE deleted_at IS NULL AND region IS NOT NULL AND region <> '' UNION SELECT DISTINCT region FROM project_requests WHERE region IS NOT NULL AND region <> '' ORDER BY 1`),
    pool.query(`SELECT DISTINCT service_type AS value FROM project_wip_entries WHERE deleted_at IS NULL AND service_type IS NOT NULL AND service_type <> '' UNION SELECT DISTINCT service_type FROM project_requests WHERE service_type IS NOT NULL AND service_type <> '' ORDER BY 1`),
  ]);
  res.json({ regions: regions.rows.map((r) => r.value), serviceTypes: serviceTypes.rows.map((r) => r.value) });
});

router.get('/wip', authenticateOrShareToken('wip_entry', authenticateToken), async (req, res) => {
  await ensureWipTables();
  if (req.isSharedView) {
    // A wip_entry share token authorizes exactly one row — never the whole register.
    const row = await pool.query(`SELECT * FROM project_wip_entries WHERE id = $1 AND deleted_at IS NULL`, [req.shareLink.record_id]);
    return res.json(row.rows);
  }
  const rows = await pool.query(`SELECT * FROM project_wip_entries WHERE deleted_at IS NULL ORDER BY id`);
  res.json(rows.rows);
});

// Registered before the router-wide auth gate below so a valid share token can serve
// these two read-only detail routes without a user session; every other route in this
// file (including mutations) still requires full authentication.
router.get('/requests/detail/:id', authenticateOrShareToken(['project_request', 'service_request', 'design_request', 'sales_request'], authenticateToken), async (req, res) => {
  try {
    const requestId = req.isSharedView ? Number(req.shareLink.record_id) : parseInt(req.params.id, 10);
    const request = await getProjectRequestById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (req.isSharedView) {
      return res.json({ ...request, fullPipeline: false });
    }
    const user = await loadFullUser(req);
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      ...request,
      fullPipeline: canViewFullPipeline(user, user.units),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/signoff/:id', authenticateOrShareToken('signoff_form', (req, res, next) => authenticateToken(req, res, () => requireProjectSignoffAccess(req, res, next))), async (req, res) => {
  try {
    const id = req.isSharedView ? req.shareLink.record_id : req.params.id;
    const result = await pool.query('SELECT * FROM project_signoff_forms WHERE id=$1', [id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Sign-off form not found' });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/wip', authenticateToken, async (req, res) => {
  await ensureWipTables();
  const fields = ['customer_name','site_name','location','region','capacity','bandwidth','planned_adss_distance','planned_drop_cable_distance','service_type','cpe','start_date','completion_date','confirmation_date','status','mrc','sale_price','through_value','existing_poles','remarks'];
  const values = fields.map((field) => req.body?.[field] || null);
  const result = await pool.query(`INSERT INTO project_wip_entries (${fields.join(',')}, created_by) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}, $${fields.length + 1}) RETURNING *`, [...values, req.user.id]);
  const entry = result.rows[0];
  await insertAuditLog(req.user.id, 'Created WIP entry', req.ip, { entry_id: entry.id, customer_name: entry.customer_name });
  await logUserAction(req.user, { actionType: 'submit', recordType: 'wip_entry', recordId: entry.id, description: `${wipName(req.user)} added a new WIP entry for ${entry.customer_name || 'an unnamed customer'}` });
  recordTimingEvent({
    workflowType: 'wip_entry', recordId: entry.id, eventType: 'created',
    stageName: String(entry.status || 'In Progress').toLowerCase().replace(/\s+/g, '_'),
    triggeredByUserId: req.user.id,
  }).catch(() => {});
  res.status(201).json(entry);
});

router.put('/wip/:id', authenticateToken, async (req, res) => {
  await ensureWipTables();
  const fields = ['customer_name','site_name','location','region','capacity','bandwidth','planned_adss_distance','planned_drop_cable_distance','service_type','cpe','start_date','completion_date','confirmation_date','status','mrc','sale_price','through_value','existing_poles','remarks'];
  const existing = await pool.query(`SELECT * FROM project_wip_entries WHERE id=$1 AND deleted_at IS NULL`, [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: 'WIP entry not found' });
  const changes = fields.filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field) && String(existing.rows[0][field] ?? '') !== String(req.body[field] ?? ''));
  if (!changes.length) return res.json(existing.rows[0]);
  const sets = changes.map((field, i) => `${field}=$${i + 1}`);
  const updated = await pool.query(`UPDATE project_wip_entries SET ${sets.join(',')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${changes.length + 1} RETURNING *`, [...changes.map((field) => req.body[field] || null), req.params.id]);
  for (const field of changes) await pool.query(`INSERT INTO project_wip_history (entry_id,field_name,old_value,new_value,changed_by,changed_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [req.params.id, field, String(existing.rows[0][field] ?? ''), String(req.body[field] ?? ''), req.user.id, wipName(req.user)]);
  await insertAuditLog(req.user.id, 'Updated WIP entry', req.ip, { entry_id: Number(req.params.id), changes: changes.map((field) => ({ field, old_value: existing.rows[0][field] ?? null, new_value: req.body[field] ?? null })) });
  await logUserAction(req.user, { actionType: 'status_change', recordType: 'wip_entry', recordId: Number(req.params.id), description: `${wipName(req.user)} updated ${changes[0].replace(/_/g, ' ')} on WIP entry for ${updated.rows[0].customer_name || 'an unnamed customer'}` });
  if (changes.includes('status')) {
    const newStatus = String(updated.rows[0].status || '');
    const terminal = /^(completed|cancelled)$/i.test(newStatus);
    recordTimingEvent({
      workflowType: 'wip_entry', recordId: Number(req.params.id),
      eventType: terminal ? (newStatus.toLowerCase() === 'cancelled' ? 'cancelled' : 'completed') : 'started',
      stageName: newStatus.toLowerCase().replace(/\s+/g, '_'),
      triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});
  }
  res.json(updated.rows[0]);
});

router.get('/wip/:id/history', authenticateToken, async (req, res) => { await ensureWipTables(); const rows = await pool.query(`SELECT * FROM project_wip_history WHERE entry_id=$1 ORDER BY created_at DESC`, [req.params.id]); res.json(rows.rows); });
router.post('/wip/:id/remarks', authenticateToken, async (req, res) => { await ensureWipTables(); const text = String(req.body?.note_text || '').trim(); if (!text) return res.status(400).json({ error: 'Remark is required' }); const row = await pool.query(`INSERT INTO project_wip_remarks (entry_id,user_id,author_name,note_text) VALUES ($1,$2,$3,$4) RETURNING *`, [req.params.id, req.user.id, wipName(req.user), text]); await insertAuditLog(req.user.id, 'Added WIP remark', req.ip, { entry_id: Number(req.params.id), note: text }); await logUserAction(req.user, { actionType: 'note', recordType: 'wip_entry', recordId: Number(req.params.id) }); res.status(201).json(row.rows[0]); });
router.get('/wip/:id/remarks', authenticateToken, async (req, res) => { await ensureWipTables(); const rows = await pool.query(`SELECT * FROM project_wip_remarks WHERE entry_id=$1 ORDER BY created_at DESC`, [req.params.id]); res.json(rows.rows); });
router.delete('/wip/:id', authenticateToken, async (req, res) => { await ensureWipTables(); if (!isSystemAdmin(req.user)) return res.status(403).json({ error: 'Only System Admin can archive a WIP row' }); const row = await pool.query(`UPDATE project_wip_entries SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [req.params.id]); if (!row.rowCount) return res.status(404).json({ error: 'WIP entry not found' }); await insertAuditLog(req.user.id, 'Archived WIP entry', req.ip, { entry_id: Number(req.params.id), customer_name: row.rows[0].customer_name }); res.json({ ok: true }); });
router.post('/wip/:id/restore', authenticateToken, async (req, res) => { await ensureWipTables(); if (!isSystemAdmin(req.user)) return res.status(403).json({ error: 'Only System Admin can restore a WIP row' }); const row = await pool.query(`UPDATE project_wip_entries SET deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NOT NULL RETURNING *`, [req.params.id]); if (!row.rowCount) return res.status(404).json({ error: 'Archived WIP entry not found' }); await insertAuditLog(req.user.id, 'Restored WIP entry', req.ip, { entry_id: Number(req.params.id), customer_name: row.rows[0].customer_name }); res.json(row.rows[0]); });

const projectUploadsDir = path.join(__dirname, '..', 'uploads', 'project-request');
if (!fs.existsSync(projectUploadsDir)) {
  fs.mkdirSync(projectUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, projectUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'prj-' + unique + path.extname(file.originalname || ''));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpe?g|png|gif|webp|pdf|doc|docx|xls|xlsx|txt|csv|kmz|kml)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

function parseUserUnits(user) {
  return effectiveUnitsForUser(user);
}

function isSystemAdmin(user) {
  return isSystemAdminAccount(user);
}

function isSuperAdmin(user) {
  return isSystemAdmin(user);
}

function isExecutive(user) {
  const r = String(user?.main_role || user?.role || '').toLowerCase();
  const pos = String(user?.position || '').trim().toLowerCase();
  return r === 'director' || r === 'cto' || pos === 'director' || pos === 'cto';
}

function requireSuperAdmin(req, res, next) {
  if (!isSystemAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
  next();
}

async function requireDesignAccess(req, res, next) {
  const databaseUser = await loadFullUser(req).catch(() => null);
  const accessUser = databaseUser || req.user;
  const role = String(accessUser?.main_role || accessUser?.role || '').toLowerCase();
  if (!isSystemAdmin(accessUser) && !['admin', 'superadmin', 'system_admin'].includes(role) && !hasDesignUnitAccess(accessUser)) {
    return res.status(403).json({ error: 'Design Unit access required' });
  }
  next();
}

async function requireSalesAccess(req, res, next) {
  const databaseUser = await loadFullUser(req).catch(() => null);
  const accessUser = databaseUser || req.user;
  const role = String(accessUser?.main_role || accessUser?.role || '').toLowerCase();
  const units = effectiveUnitsForUser(accessUser);
  if (!isSystemAdmin(accessUser) && !['admin', 'superadmin', 'system_admin', 'sales'].includes(role) && !units.includes('sales')) {
    return res.status(403).json({ error: 'Sales access required' });
  }
  next();
}

async function loadFullUser(req) {
  const { rows } = await pool.query(
    'SELECT id, username, first_name, last_name, role, main_role, units, unit, position FROM users WHERE id = $1 AND deleted_at IS NULL',
    [req.user.id]
  );
  const u = rows[0];
  if (!u) return null;
  u.units = parseUserUnits(u);
  return u;
}

router.use(authenticateToken);
router.use(invalidateOnMutation);

// ── Project Unit sign-off forms ────────────────────────────────────────────
const signoffDisplayName = (user) => `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.username || 'User';
const isProjectManager = (user) => {
  const position = String(user?.position || '').trim().toLowerCase();
  const roles = [user?.role, user?.main_role, ...(Array.isArray(user?.roles) ? user.roles : [])].map((r) => String(r || '').toLowerCase());
  return isSystemAdmin(user) || position === 'project manager' || roles.includes('project_manager');
};
const isProjectSupervisor = (user) => !isProjectManager(user) && (String(user?.position || '').trim().toLowerCase() === 'project supervisor' || hasProjectUnitAccess(user));
async function requireProjectSignoffAccess(req, res, next) {
  const user = await loadFullUser(req).catch(() => null);
  if (!user || (!isProjectManager(user) && !isProjectSupervisor(user))) return res.status(403).json({ error: 'Project Unit access required' });
  req.projectUser = user;
  next();
}
const signoffFields = ['site_name','circuit_id','type_of_service','contractual_bandwidth','test_date','device_type','device_model','device_serial_number','packet_loss','latency','jitter','billing_date','client_signature','client_name','client_date','client_telephone','client_company_name','vobiss_signature','vobiss_name','vobiss_date','vobiss_telephone','linked_record_type','linked_record_id','linked_record_ref'];
const signoffReference = (id) => `SOF-${String(id).padStart(3, '0')}`;
function safeSignoffPayload(body, user) {
  const data = {};
  for (const field of signoffFields) if (Object.prototype.hasOwnProperty.call(body || {}, field)) data[field] = body[field] === '' ? null : body[field];
  data.site_name = String(data.site_name || '').trim();
  data.vobiss_name = String(data.vobiss_name || signoffDisplayName(user)).trim();
  data.vobiss_date = data.vobiss_date || new Date().toISOString().slice(0, 10);
  return data;
}
async function notifyProjectManagers(title, message, actorId, linkUrl) {
  const { rows } = await pool.query(`SELECT id FROM users WHERE deleted_at IS NULL AND LOWER(COALESCE(position,'')) = 'project manager'`);
  await Promise.all(rows.map((row) => createNotification(title, message, actorId, { targetUserId: row.id, linkUrl, notificationType: 'project_signoff' })));
}

router.get('/signoff', requireProjectSignoffAccess, async (req, res) => {
  try {
    const term = String(req.query.search || '').trim(); const status = String(req.query.status || 'all');
    const params = []; const where = ['1=1'];
    if (status !== 'all') { params.push(status); where.push(`status=$${params.length}`); }
    if (term) { params.push(`%${term}%`); where.push(`(site_name ILIKE $${params.length} OR COALESCE(circuit_id,'') ILIKE $${params.length} OR COALESCE(client_name,'') ILIKE $${params.length})`); }
    const result = await pool.query(`SELECT * FROM project_signoff_forms WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/signoff/link-options', requireProjectSignoffAccess, async (_req, res) => {
  try {
    const [requests, wip] = await Promise.all([
      pool.query(`SELECT id, site_name, customer_name, circuit_id FROM project_requests ORDER BY updated_at DESC LIMIT 250`),
      pool.query(`SELECT id, site_name, customer_name FROM project_wip_entries WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 250`),
    ]);
    res.json({
      service_requests: requests.rows.map((r) => ({ id: r.id, label: `Service Request #${r.id} · ${r.site_name || r.customer_name || 'Unnamed site'}`, reference: r.circuit_id || `SR-${String(r.id).padStart(3, '0')}` })),
      wip_entries: wip.rows.map((r) => ({ id: r.id, label: `WIP #${r.id} · ${r.site_name || r.customer_name || 'Unnamed customer'}`, reference: `WIP-${String(r.id).padStart(3, '0')}` })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/signoff', requireProjectSignoffAccess, async (req, res) => {
  try {
    const user = req.projectUser; if (!isProjectSupervisor(user) && !isSystemAdmin(user)) return res.status(403).json({ error: 'Only a Project Unit Supervisor or System Admin can create sign-off forms' });
    const data = safeSignoffPayload(req.body, user); if (!data.site_name) return res.status(400).json({ error: 'Site name is required' });
    const fields = Object.keys(data); const values = Object.values(data);
    const created = await pool.query(`INSERT INTO project_signoff_forms (${fields.join(',')},created_by,created_by_name) VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')},$${fields.length + 1},$${fields.length + 2}) RETURNING *`, [...values, user.id, signoffDisplayName(user)]);
    const id = created.rows[0].id; const reference_no = signoffReference(id);
    const final = await pool.query('UPDATE project_signoff_forms SET reference_no=$1 WHERE id=$2 RETURNING *', [reference_no, id]);
    await logUserAction(user, { actionType: 'submit', recordType: 'signoff_form', recordId: id, recordRef: reference_no, description: `${signoffDisplayName(user)} created a sign-off form for ${data.site_name}` });
    res.status(201).json(final.rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/signoff/:id', requireProjectSignoffAccess, async (req, res) => {
  try {
    const user = req.projectUser; const existing = await pool.query('SELECT * FROM project_signoff_forms WHERE id=$1', [req.params.id]);
    if (!existing.rowCount) return res.status(404).json({ error: 'Sign-off form not found' }); const form = existing.rows[0];
    if ((!isProjectSupervisor(user) && !isSystemAdmin(user)) || (!isSystemAdmin(user) && Number(form.created_by) !== Number(user.id)) || !['draft','rejected'].includes(form.status)) return res.status(403).json({ error: 'Only the creator can edit a draft or rejected form' });
    const data = safeSignoffPayload(req.body, user); if (data.site_name === '') return res.status(400).json({ error: 'Site name is required' });
    const fields = Object.keys(data); const result = await pool.query(`UPDATE project_signoff_forms SET ${fields.map((f, i) => `${f}=$${i + 1}`).join(',')}, status='draft', rejection_reason=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$${fields.length + 1} RETURNING *`, [...fields.map((f) => data[f]), req.params.id]);
    res.json(result.rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/signoff/:id/submit', requireProjectSignoffAccess, async (req, res) => {
  try {
    const user = req.projectUser; const found = await pool.query(`UPDATE project_signoff_forms SET status='pending', submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1 ${isSystemAdmin(user) ? '' : 'AND created_by=$2'} AND status IN ('draft','rejected') RETURNING *`, isSystemAdmin(user) ? [req.params.id] : [req.params.id, user.id]);
    if (!found.rowCount) return res.status(400).json({ error: 'Only your draft or rejected form can be submitted' }); const form = found.rows[0];
    const linkUrl = `/project-unit/signoff/${form.id}`; await notifyProjectManagers('Sign-off form pending approval', `A new sign-off form is pending your approval — ${form.site_name}`, user.id, linkUrl);
    await logUserAction(user, { actionType: 'submit', recordType: 'signoff_form', recordId: form.id, recordRef: form.reference_no, description: `${signoffDisplayName(user)} submitted sign-off form for ${form.site_name} for manager approval` });
    recordTimingEvent({ workflowType: 'signoff_form', recordId: form.id, eventType: 'submitted', stageName: 'pending_approval', triggeredByUserId: user.id }).catch(() => {});
    res.json(form);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/signoff/:id/approve', requireProjectSignoffAccess, async (req, res) => {
  try {
    const user = req.projectUser; if (!isProjectManager(user)) return res.status(403).json({ error: 'Project Unit Manager approval required' });
    const signature = String(req.body?.manager_signature || '').trim(); if (!signature) return res.status(400).json({ error: 'Manager signature is required' });
    const found = await pool.query(`UPDATE project_signoff_forms SET status='approved', manager_signature=$1, manager_name=$2, manager_date=CURRENT_DATE, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$3 AND status='pending' RETURNING *`, [signature, signoffDisplayName(user), req.params.id]);
    if (!found.rowCount) return res.status(400).json({ error: 'Only pending forms can be approved' }); const form = found.rows[0];
    await createNotification('Sign-off form approved', `Your sign-off form for ${form.site_name} has been approved`, user.id, { targetUserId: form.created_by, linkUrl: `/project-unit/signoff/${form.id}`, notificationType: 'project_signoff' });
    await logUserAction(user, { actionType: 'approve', recordType: 'signoff_form', recordId: form.id, recordRef: form.reference_no, description: `${signoffDisplayName(user)} approved the sign-off form for ${form.site_name}` });
    recordTimingEvent({ workflowType: 'signoff_form', recordId: form.id, eventType: 'completed', stageName: 'pending_approval', triggeredByUserId: user.id, attributeToUserId: user.id }).catch(() => {});
    res.json(form);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/signoff/:id/reject', requireProjectSignoffAccess, async (req, res) => {
  try {
    const user = req.projectUser; if (!isProjectManager(user)) return res.status(403).json({ error: 'Project Unit Manager approval required' }); const reason = String(req.body?.reason || '').trim(); if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
    const found = await pool.query(`UPDATE project_signoff_forms SET status='rejected', rejection_reason=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND status='pending' RETURNING *`, [reason, req.params.id]);
    if (!found.rowCount) return res.status(400).json({ error: 'Only pending forms can be rejected' }); const form = found.rows[0];
    await createNotification('Sign-off form rejected', `Your sign-off form for ${form.site_name} was rejected — ${reason}`, user.id, { targetUserId: form.created_by, linkUrl: `/project-unit/signoff/${form.id}`, notificationType: 'project_signoff' });
    await logUserAction(user, { actionType: 'reject', recordType: 'signoff_form', recordId: form.id, recordRef: form.reference_no, description: `${signoffDisplayName(user)} rejected the sign-off form for ${form.site_name}` });
    recordTimingEvent({ workflowType: 'signoff_form', recordId: form.id, eventType: 'rejected', stageName: 'pending_approval', triggeredByUserId: user.id, attributeToUserId: user.id }).catch(() => {});
    res.json(form);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Init tables on first request (idempotent)
let tablesReady = false;
let tablesInitPromise = null;
router.use(async (_req, _res, next) => {
  if (tablesReady) return next();
  if (!tablesInitPromise) {
    tablesInitPromise = initProjectRequestTables()
      .then(() => {
        tablesReady = true;
      })
      .catch((e) => {
        console.error('[project-request] init tables:', e);
      })
      .finally(() => {
        tablesInitPromise = null;
      });
  }

  try {
    await tablesInitPromise;
  } catch (_e) {
    // Swallow initialization errors; the app keeps running and retries when needed.
  }
  next();
});

// Design Unit configuration and requests. This scope is intentionally unavailable to other units.
router.get('/design/materials', requireDesignAccess, async (_req, res) => {
  try { res.json(await getDesignMaterials()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/design/materials', requireDesignAccess, async (req, res) => {
  try { res.status(201).json(await saveDesignMaterial(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/design/materials/:id', requireDesignAccess, async (req, res) => {
  try { res.json(await saveDesignMaterial(req.body, parseInt(req.params.id, 10))); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/design/materials/:id', requireDesignAccess, async (req, res) => {
  try { await deleteDesignMaterial(parseInt(req.params.id, 10)); res.status(204).end(); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/design/requests', requireDesignAccess, async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const created = await createDesignRequest(req.body, user);
    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'design_request',
      recordId: created.id,
    });
    recordTimingEvent({ workflowType: 'design_request', recordId: created.id, eventType: 'created', stageName: 'design', toUnitSlug: 'design', triggeredByUserId: req.user.id }).catch(() => {});
    notifySrStage('project', { requestId: created.id, actingUserId: req.user.id, refLabel: `SR-${String(created.id).padStart(3, '0')}` });
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/design/requests/:id/submit', requireDesignAccess, async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const id = parseInt(req.params.id, 10);
    const submitted = await submitDesignRequest(id, req.body, user);
    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'design_request',
      recordId: submitted?.id || id,
    });
    recordTimingEvent({
      workflowType: 'design_request', recordId: submitted?.id || id,
      eventType: 'submitted', stageName: 'sales', toUnitSlug: 'sales', triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage('sales', { requestId: id, actingUserId: req.user.id, refLabel: `SR-${String(id).padStart(3, '0')}` });
    res.json(submitted);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/design/requests', requireDesignAccess, async (_req, res) => {
  try { res.json(await listDesignRequests()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/sales/requests', requireSalesAccess, async (_req, res) => {
  try { res.json(await listDesignRequests()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sales/requests', requireSalesAccess, async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const created = await createSalesRequest(req.body, user);
    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'sales_request',
      recordId: created.id,
    });
    recordTimingEvent({ workflowType: 'sales_request', recordId: created.id, eventType: 'created', stageName: 'design', toUnitSlug: 'design', triggeredByUserId: req.user.id }).catch(() => {});
    notifySrStage('design', { requestId: created.id, actingUserId: req.user.id, refLabel: `SR-${String(created.id).padStart(3, '0')}` });
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/sales/requests/:id/forward', requireSalesAccess, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const forwarded = await forwardWorkflowRequest(id, 'sales', 'project');
    recordTimingEvent({ workflowType: 'sales_request', recordId: id, eventType: 'started', stageName: 'project', toUnitSlug: 'project', triggeredByUserId: req.user.id }).catch(() => {});
    notifySrStage('project', { requestId: id, actingUserId: req.user.id, refLabel: `SR-${String(id).padStart(3, '0')}` });
    res.json(forwarded);
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// "Confirm & Forward to Project" — Sales's review of Design's completed survey
// (current_stage='sales'). See confirmDesignRequest() in backend/db/project.js.
router.post('/sales/requests/:id/confirm', requireSalesAccess, async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const id = parseInt(req.params.id, 10);
    const confirmed = await confirmDesignRequest(id, user);
    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'sales_request',
      recordId: id,
      description: `You confirmed the design for SR-${String(id).padStart(3, '0')} — ready for Project Unit`,
    });
    recordTimingEvent({
      workflowType: 'sales_request', recordId: id,
      eventType: 'completed', triggeredByUserId: req.user.id,
    }).catch(() => {});
    recordTimingEvent({
      workflowType: 'service_request', recordId: id,
      eventType: 'design_confirmed', stageName: 'project', toUnitSlug: 'project', triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage('project', { requestId: id, actingUserId: req.user.id, refLabel: `SR-${String(id).padStart(3, '0')}` });
    res.json(confirmed);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Sales rejects Design's survey and bounces it back — comment required.
router.post('/sales/requests/:id/reject', requireSalesAccess, async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const id = parseInt(req.params.id, 10);
    const rejected = await rejectSalesReview(id, req.body?.comment, user);
    await logUserAction(req.user, {
      actionType: 'note',
      recordType: 'sales_request',
      recordId: id,
      description: `You sent SR-${String(id).padStart(3, '0')} back to Design`,
    });
    notifySrStage('design', { requestId: id, actingUserId: req.user.id, refLabel: `SR-${String(id).padStart(3, '0')}` });
    res.json(rejected);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// â”€â”€ Units (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/units', async (req, res) => {
  try {
    const units = await getProjectUnits(isSuperAdmin(req.user));
    res.json(units);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/units', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await createProjectUnit(req.body);
    res.status(201).json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/units/:id', requireSuperAdmin, async (req, res) => {
  try {
    const unit = await updateProjectUnit(parseInt(req.params.id, 10), req.body);
    res.json(unit);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ My accessible units (for sidebar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/my-units', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const all = await getProjectUnits();
    const slugs = new Set(user.units || []);
    const isAdmin = isSuperAdmin(user) || isExecutive(user);
    const order = ['project', 'ts', 'ip', 'noc'];

    const sidebarUnits = order
      .map((slug) => all.find((u) => u.slug === slug))
      .filter(Boolean)
      .filter((u) => isAdmin || slugs.has(u.slug));

    const projectAccess = isAdmin || hasProjectUnitAccess(user);

    res.json({
      units: sidebarUnits,
      canCreate: projectAccess,
      pipelineUnits: sidebarUnits.filter((u) => ['ts', 'ip', 'noc'].includes(u.unit_stage)),
      projectUnits: sidebarUnits.filter((u) => u.unit_stage === 'project'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/dashboard/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slugs = user.units || [];
    const slug = canonicalizeUnitSlug(req.params.unitSlug);
    if (!isSuperAdmin(user) && !isExecutive(user) && !slugs.includes(slug) && !(slug === 'project' && slugs.includes('sales'))) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }
    const stats = await getProjectRequestDashboardStats(
      slug,
      user.id,
      slugs,
      isSuperAdmin(user) || isExecutive(user)
    );
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Requests list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/requests/:unitSlug', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const slug = canonicalizeUnitSlug(req.params.unitSlug);
    const unit = await getProjectUnitBySlug(slug);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    if (unit.unit_stage === 'project') {
      if (
        !isSuperAdmin(user) &&
        !isExecutive(user) &&
        !user.units.includes('project') &&
        !user.units.includes('sales') &&
        !user.units.some((s) => s.startsWith('project'))
      ) {
        const projUnits = (await getProjectUnits()).filter((u) => u.unit_stage === 'project');
        if (!projUnits.some((u) => user.units.includes(u.slug)) && !user.units.includes('sales')) {
          return res.status(403).json({ error: 'Not assigned to a project unit' });
        }
      }
    } else if (!isSuperAdmin(user) && !isExecutive(user) && !user.units.includes(slug)) {
      return res.status(403).json({ error: 'Not assigned to this unit' });
    }

    const list = await listProjectRequests({
      unitSlug: slug,
      userId: user.id,
      userUnits: user.units,
      isSuperAdmin: isSuperAdmin(user) || isExecutive(user),
      status: req.query.status,
      search: req.query.search,
      sort: req.query.sort,
      order: req.query.order,
      view: req.query.view === 'history' ? 'history' : 'active',
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Create request (project unit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function createRequestForStage(req, res, routeToStage) {
  try {
    const user = await loadFullUser(req);
    const all = await getProjectUnits();
    const hasProject = hasProjectUnitAccess(user) ||
      all.some((u) => u.unit_stage === 'project' && user.units.includes(u.slug));

    if (!hasProject) return res.status(403).json({ error: 'Only project unit members can create requests' });

    const created = await createProjectRequest({ ...req.body, route_to_stage: routeToStage }, user);

    try {
      const io = getRealtimeIo();
      const recordChannelId = await ensureProjectRequestThread(created, io);
      const actorName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
      await postProjectRequestSystemMessage({
        projectRequestId: created.id,
        siteName: created.site_name || created.customer_name,
        actorName,
        io,
        recordChannelId,
      });
    } catch (e) {
      console.warn('[chat] service request thread failed:', e.message);
    }

    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'service_request',
      recordId: created.id,
    });

    recordTimingEvent({
      workflowType: 'service_request', recordId: created.id, eventType: 'created',
      stageName: routeToStage === 'ip' ? 'ip_review' : 'ts_review', toUnitSlug: routeToStage,
      triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.status(201).json(created);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

router.post('/requests/to/:routeToStage', async (req, res) => {
  const routeToStage = req.params.routeToStage === 'ip' ? 'ip' : 'ts';
  return createRequestForStage(req, res, routeToStage);
});

router.post('/requests', async (req, res) => {
  const routeToStage = req.body?.route_to_stage === 'ip' ? 'ip' : 'ts';
  return createRequestForStage(req, res, routeToStage);
});

// â”€â”€ Single request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// â”€â”€ Remarks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/requests/:id/remarks', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProjectRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { comment_text, stage } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ error: 'Comment required' });
    const { isProjectRequestLocked } = await import('../db/project.js');
    if (isProjectRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed â€” no further comments allowed' });
    }
    const remark = await addProjectRequestRemark(request.id, { comment_text, stage: stage || 'general' }, user);
    await logUserAction(req.user, {
      actionType: 'note',
      recordType: 'service_request',
      recordId: request.id,
    });
    res.status(201).json(remark);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ Attachments (not NOC) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.post('/requests/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const request = await getProjectRequestById(parseInt(req.params.id, 10));
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (!canViewRequestV2(request, user, user.units)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { isProjectRequestLocked } = await import('../db/project.js');
    if (isProjectRequestLocked(request)) {
      return res.status(400).json({ error: 'Request is completed â€” no further uploads allowed' });
    }

    const nocOnly =
      user.units.includes('noc') &&
      !user.units.includes('ts') &&
      !user.units.includes('ip') &&
      !user.units.includes('project') &&
      !isSuperAdmin(user);
    if (nocOnly) return res.status(403).json({ error: 'NOC cannot upload attachments' });

    const file = {
      path: `/uploads/project-request/${req.file.filename}`,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
    };
    const att = await addProjectRequestAttachment(
      request.id,
      file,
      req.body.stage || 'general',
      user
    );
    await logUserAction(req.user, {
      actionType: 'upload',
      recordType: 'service_request',
      recordId: request.id,
    });
    res.status(201).json(att);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// TX actions

router.post('/requests/:id/ts/accept', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ts')) {
      return res.status(403).json({ error: 'TX access required' });
    }
    const updated = await tsAcceptRequest(parseInt(req.params.id, 10), user, req.body?.route_to_stage, req.body?.notes);
    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    const tsTarget = req.body?.route_to_stage === 'project' ? 'project' : 'ip';
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'approved', stageName: tsTarget === 'project' ? 'noc_review' : 'ip_review', toUnitSlug: tsTarget,
      triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage(tsTarget, { requestId: updated?.id || parseInt(req.params.id, 10), actingUserId: req.user.id, refLabel: `SR-${String(updated?.id || req.params.id).padStart(3, '0')}` });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/ts/reject', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ts')) {
      return res.status(403).json({ error: 'TX access required' });
    }
    const updated = await tsRejectRequest(parseInt(req.params.id, 10), user);
    await logUserAction(req.user, {
      actionType: 'reject',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'rejected', stageName: 'ts_review', triggeredByUserId: req.user.id,
    }).catch(() => {});
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ IP actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.put('/requests/:id/ip', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ip')) {
      return res.status(403).json({ error: 'IP access required' });
    }
    const updated = await ipUpdateRequest(parseInt(req.params.id, 10), req.body, user);
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/ip/forward', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('ip')) {
      return res.status(403).json({ error: 'IP access required' });
    }
    const updated = await ipForwardRequest(parseInt(req.params.id, 10), req.body, user);
    await logUserAction(req.user, {
      actionType: 'status_change',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
      statusText: 'forwarded',
    });
    const ipTarget = req.body?.route_to_stage === 'ts' ? 'ts' : 'project';
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'started', stageName: ipTarget === 'ts' ? 'ts_review' : 'noc_review', toUnitSlug: ipTarget,
      triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage(ipTarget === 'ts' ? 'ts' : 'noc', { requestId: updated?.id || parseInt(req.params.id, 10), actingUserId: req.user.id, refLabel: `SR-${String(updated?.id || req.params.id).padStart(3, '0')}` });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// â”€â”€ NOC approve / complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Short alias â€” easier to proxy and backward-compatible */
router.post('/noc-approve/:id', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10), req.body?.notes);
    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'approved', stageName: 'noc_review', toUnitSlug: 'project', triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage('project', { requestId: updated?.id || parseInt(req.params.id, 10), actingUserId: req.user.id, refLabel: `SR-${String(updated?.id || req.params.id).padStart(3, '0')}` });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/noc/approve', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10), req.body?.notes);
    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'approved', stageName: 'noc_review', toUnitSlug: 'project', triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage('project', { requestId: updated?.id || parseInt(req.params.id, 10), actingUserId: req.user.id, refLabel: `SR-${String(updated?.id || req.params.id).padStart(3, '0')}` });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Legacy alias */
router.post('/requests/:id/noc/complete', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    if (!isSuperAdmin(user) && !user.units.includes('noc')) {
      return res.status(403).json({ error: 'NOC access required' });
    }
    const updated = await nocApproveRequest(parseInt(req.params.id, 10), req.body?.notes);
    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'approved', stageName: 'noc_review', toUnitSlug: 'project', triggeredByUserId: req.user.id,
    }).catch(() => {});
    notifySrStage('project', { requestId: updated?.id || parseInt(req.params.id, 10), actingUserId: req.user.id, refLabel: `SR-${String(updated?.id || req.params.id).padStart(3, '0')}` });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/project/complete', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const hasProject =
      isSuperAdmin(user) ||
      user.units.includes('project') ||
      (await getProjectUnits()).some(
        (u) => u.unit_stage === 'project' && user.units.includes(u.slug)
      );
    if (!hasProject) {
      return res.status(403).json({ error: 'Project Unit access required' });
    }
    const updated = await projectCompleteRequest(parseInt(req.params.id, 10), user);
    await logUserAction(req.user, {
      actionType: 'complete',
      recordType: 'service_request',
      recordId: updated?.id || parseInt(req.params.id, 10),
    });
    recordTimingEvent({
      workflowType: 'service_request', recordId: updated?.id || parseInt(req.params.id, 10),
      eventType: 'completed', stageName: 'project', triggeredByUserId: req.user.id,
    }).catch(() => {});
    if (updated?.created_by_user_id) {
      notifyMany([updated.created_by_user_id], 'Service Request Active', `SR-${String(updated.id).padStart(3, '0')} is now active.`, req.user.id, {
        linkUrl: recordViewPath('service_request', updated.id), notificationType: 'service_request_active',
      }).catch(() => {});
    }
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/requests/:id/project/forward', async (req, res) => {
  try {
    const user = await loadFullUser(req);
    const hasProject = hasProjectUnitAccess(user) || user.units.includes('project');
    if (!isSuperAdmin(user) && !hasProject) return res.status(403).json({ error: 'Project Unit access required' });
    const target = ['ts', 'ip', 'noc'].includes(req.body?.route_to_stage) ? req.body.route_to_stage : '';
    const id = parseInt(req.params.id, 10);
    const forwarded = await forwardWorkflowRequest(id, 'project', target, req.body?.fields);
    if (target) {
      recordTimingEvent({
        workflowType: 'service_request', recordId: id, eventType: 'started',
        stageName: target === 'ts' ? 'ts_review' : target === 'ip' ? 'ip_review' : 'noc_review',
        toUnitSlug: target, triggeredByUserId: req.user.id,
      }).catch(() => {});
      notifySrStage(target, { requestId: id, actingUserId: req.user.id, refLabel: `SR-${String(id).padStart(3, '0')}` });
    }
    res.json(forwarded);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
