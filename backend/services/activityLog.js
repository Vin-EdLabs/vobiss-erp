import pool from '../db.js';
import { formatPersonName } from '../utils/displayName.js';

/** Known record types. Unknown types still work via humanize + generic path. */
const RECORD_CATALOG = {
  transport_request: { label: 'Transport Request', prefix: 'TR', path: '/transport-requests/:id' },
  fuel_request: { label: 'Fuel Request', prefix: 'FUEL', path: '/transport/fuel-requests/:id' },
  vehicle_request: { label: 'Rental Request', prefix: 'RV', path: '/transport/vehicle-rental-requests/:id' },
  material_request: { label: 'Material Request', prefix: 'MR', path: '/request-forms/:id' },
  cash_request: { label: 'Cash Request', prefix: 'CR', path: '/cash-details/:id' },
  item_return: { label: 'Item Return', prefix: 'IR', path: '/item-returns/:id' },
  service_request: { label: 'Service Request', prefix: 'SR', path: '/project-request/project/:id' },
  project_request: { label: 'Service Request', prefix: 'SR', path: '/project-request/project/:id' },
  design_request: { label: 'Design Request', prefix: 'DR', path: '/project-request/design/:id' },
  sales_request: { label: 'Sales Request', prefix: 'SA', path: '/project-request/sales/:id' },
  signoff_form: { label: 'Sign-Off Form', prefix: 'SOF', path: '/project-unit/signoff/:id' },
  incident_note: { label: 'Incident Note', prefix: 'INC', path: '/noc/incident-notes/:id' },
  noc_shift_schedule: { label: 'NOC Shift Schedule', prefix: 'SHF', path: '/noc/shift-schedule' },
  workflow_time_config: { label: 'Workflow Time Config', prefix: 'WTC', path: '/settings/workflow-time-config' },
  ticket: { label: 'Ticket', prefix: 'TKT', path: '/staff/cx/tickets/:id' },
};

const ACTION_CATEGORY = {
  submit: 'requests',
  approve: 'approvals',
  reject: 'approvals',
  upload: 'uploads',
  upload_invoice: 'uploads',
  note: 'notes',
  incident_created: 'notes',
  incident_updated: 'notes',
  incident_status: 'notes',
  incident_published: 'notes',
  ticket_viewed: 'other',
  ticket_commented: 'notes',
  ticket_status: 'other',
  ticket_assigned: 'other',
  ticket_closed: 'other',
  issue_cash: 'other',
  complete: 'other',
  verify_receipt: 'other',
  status_change: 'other',
};

const TYPE_FILTER_ACTIONS = {
  requests: ['submit'],
  approvals: ['approve', 'reject'],
  uploads: ['upload', 'upload_invoice'],
  notes: ['note'],
};

let tableReady = false;

function humanizeType(recordType) {
  return String(recordType || 'record')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Record';
}

function padRef(prefix, id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return String(id);
  return `${prefix}-${String(Math.trunc(n)).padStart(3, '0')}`;
}

export function getRecordMeta(recordType) {
  const key = String(recordType || '').trim();
  if (RECORD_CATALOG[key]) return { type: key, ...RECORD_CATALOG[key] };
  const slug = key.replace(/_/g, '-');
  return {
    type: key || 'record',
    label: humanizeType(key),
    prefix: (key.match(/[a-zA-Z]+/g) || ['REC']).map((p) => p[0]).join('').toUpperCase().slice(0, 4) || 'REC',
    path: `/${slug || 'records'}/:id`,
  };
}

export function recordViewPath(recordType, recordId) {
  const meta = getRecordMeta(recordType);
  return String(meta.path || '/:id').replace(':id', String(recordId));
}

export function formatRecordLabel(recordType, recordId, recordRef) {
  const meta = getRecordMeta(recordType);
  const ref = String(recordRef || '').replace(/^#/, '').trim() || padRef(meta.prefix, recordId);
  return `${meta.label} #${ref}`;
}

function actionDescription(actorName, actionType, recordLabel, extra = {}) {
  const name = actorName || 'Someone';
  switch (actionType) {
    case 'submit':
      return `${name} submitted ${recordLabel}`;
    case 'approve':
      return `${name} approved ${recordLabel}`;
    case 'reject':
      return `${name} rejected ${recordLabel}`;
    case 'upload_invoice':
      return `${name} uploaded an invoice on ${recordLabel}`;
    case 'upload': {
      const noun = extra.fileKind || 'file';
      return `${name} uploaded a ${noun} on ${recordLabel}`;
    }
    case 'issue_cash':
      return `${name} issued cash for ${recordLabel}`;
    case 'complete':
      return `${name} completed ${recordLabel}`;
    case 'verify_receipt':
      return `${name} verified the receipt on ${recordLabel}`;
    case 'note':
      return `${name} added a note on ${recordLabel}`;
    case 'status_change':
      return `${name} ${extra.statusText || 'updated'} ${recordLabel}`;
    default:
      return `${name} ${String(actionType || 'updated').replace(/_/g, ' ')} ${recordLabel}`;
  }
}

export async function ensureActivityLogsTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action_type VARCHAR(80) NOT NULL,
      description TEXT NOT NULL,
      record_type VARCHAR(80) NOT NULL,
      record_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_user_created_idx ON activity_logs (user_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_action_type_idx ON activity_logs (action_type)`);
  tableReady = true;
}

/**
 * Fire-and-safe personal activity log. Never throws to callers.
 */
export async function logUserAction(user, opts = {}) {
  try {
    const userId = Number(user?.id || opts.userId);
    if (!Number.isInteger(userId) || userId <= 0) return;
    const actionType = String(opts.actionType || '').trim();
    const recordType = String(opts.recordType || '').trim();
    const recordId = opts.recordId != null ? Number(opts.recordId) : null;
    if (!actionType || !recordType) return;

    await ensureActivityLogsTable();
    const actorName = formatPersonName(user, user?.username || 'Someone');
    const recordLabel = formatRecordLabel(recordType, recordId, opts.recordRef);
    const description = opts.description || actionDescription(actorName, actionType, recordLabel, opts);

    await pool.query(
      `INSERT INTO activity_logs (user_id, action_type, description, record_type, record_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, description, recordType, Number.isInteger(recordId) ? recordId : null]
    );
  } catch (error) {
    console.error('[activity_logs] failed to write:', error.message);
  }
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getActivityForUser(userId, query = {}) {
  await ensureActivityLogsTable();
  const params = [userId];
  const where = ['user_id = $1'];

  const type = String(query.type || 'all').toLowerCase();
  if (type && type !== 'all' && TYPE_FILTER_ACTIONS[type]) {
    params.push(TYPE_FILTER_ACTIONS[type]);
    where.push(`action_type = ANY($${params.length}::text[])`);
  }

  const range = String(query.range || '').toLowerCase();
  const now = new Date();
  if (range === 'today') {
    params.push(startOfDay(now).toISOString());
    where.push(`created_at >= $${params.length}`);
  } else if (range === 'week') {
    const start = startOfDay(now);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    params.push(start.toISOString());
    where.push(`created_at >= $${params.length}`);
  } else if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    params.push(start.toISOString());
    where.push(`created_at >= $${params.length}`);
  } else if (range === 'custom') {
    if (query.from) {
      params.push(startOfDay(query.from).toISOString());
      where.push(`created_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(endOfDay(query.to).toISOString());
      where.push(`created_at <= $${params.length}`);
    }
  }

  const search = String(query.search || '').trim();
  if (search) {
    params.push(`%${search}%`);
    where.push(`(
      description ILIKE $${params.length}
      OR record_type ILIKE $${params.length}
      OR COALESCE(record_id::text, '') ILIKE $${params.length}
    )`);
  }

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 200, 1), 500);
  params.push(limit);

  const result = await pool.query(
    `SELECT id, user_id, action_type, description, record_type, record_id, created_at
     FROM activity_logs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((row) => serializeActivity(row, query.actorName));
}

export function serializeActivity(row, actorName) {
  const name = String(actorName || '').trim();
  let youDescription = row.description || '';
  if (name && youDescription.startsWith(name)) {
    youDescription = `You${youDescription.slice(name.length)}`;
  } else {
    youDescription = youDescription.replace(
      /^.+?\s+(submitted|approved|rejected|uploaded|issued|completed|verified|added|updated|confirmed)/i,
      'You $1'
    );
  }
  return {
    id: row.id,
    action_type: row.action_type,
    category: ACTION_CATEGORY[row.action_type] || 'other',
    description: row.description,
    you_description: youDescription,
    record_type: row.record_type,
    record_id: row.record_id,
    record_label: getRecordMeta(row.record_type).label,
    view_path: row.record_id != null ? recordViewPath(row.record_type, row.record_id) : null,
    created_at: row.created_at,
  };
}
