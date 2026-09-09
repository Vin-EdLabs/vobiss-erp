// Unified Transport Report — combines Transport Requests, Fuel Requests, and Vehicle Rental
// Requests (three separate tables, three separate day-to-day queues) into one director-facing
// view. Mirrors db.reports.cjs's getCashRequestReport shape ({ summary, requests, charts })
// so the frontend report page can reuse the exact same layout/components as Cash Report.
let pool = null;

async function loadPool() {
  if (!pool) {
    const dbModule = await import('./db.js');
    pool = dbModule.pool || dbModule.default?.pool || dbModule.default;
    if (!pool) throw new Error('Database pool not available');
  }
}

function parseLineItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function grandTotal(lineItems) {
  return lineItems.reduce((sum, item) => sum + Number(item?.total || 0), 0);
}

const TYPE_LABEL = {
  transport_request: 'Transport Request',
  fuel_request: 'Fuel Request',
  vehicle_rental: 'Vehicle Rental',
};

async function getTransportReport({ date_from, date_to, status, type } = {}) {
  await loadPool();

  const [transportRows, fuelRows, vehicleRows] = await Promise.all([
    pool.query(
      `SELECT id, requester_name, site_name, client_name, location, status, created_at, updated_at
       FROM transport_requests
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    ),
    pool.query(
      `SELECT id, ref_no, requester_name, vehicle_plate, estimated_amount, status, created_at, updated_at
       FROM fuel_requests
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    ),
    pool.query(
      `SELECT id, requestor_name, purpose, line_items, status, created_at, updated_at
       FROM vehicle_request_forms
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC`
    ),
  ]);

  const rows = [
    ...transportRows.rows.map((r) => ({
      id: r.id,
      type: 'transport_request',
      ref: `TR-${String(r.id).padStart(3, '0')}`,
      requester: r.requester_name,
      context: [r.site_name, r.client_name].filter(Boolean).join(' — ') || r.location || null,
      amount: null,
      status: r.status || 'pending',
      created_at: r.created_at,
      updated_at: r.updated_at,
      href: `/transport-requests/${r.id}`,
    })),
    ...fuelRows.rows.map((r) => ({
      id: r.id,
      type: 'fuel_request',
      ref: r.ref_no || `FR-${String(r.id).padStart(3, '0')}`,
      requester: r.requester_name,
      context: r.vehicle_plate || null,
      amount: Number(r.estimated_amount) || 0,
      status: r.status || 'Pending',
      created_at: r.created_at,
      updated_at: r.updated_at,
      href: `/transport/fuel-requests/${r.id}`,
    })),
    ...vehicleRows.rows.map((r) => ({
      id: r.id,
      type: 'vehicle_rental',
      ref: `RV-${String(r.id).padStart(3, '0')}`,
      requester: r.requestor_name,
      context: r.purpose || null,
      amount: grandTotal(parseLineItems(r.line_items)),
      status: r.status || 'draft',
      created_at: r.created_at,
      updated_at: r.updated_at,
      href: `/transport/vehicle-rental-requests/${r.id}`,
    })),
  ];

  const fromTs = date_from ? new Date(date_from).getTime() : null;
  const toTs = date_to ? new Date(date_to).getTime() : null;
  const statusFilter = status ? String(status).toLowerCase() : null;
  const typeFilter = type && TYPE_LABEL[type] ? type : null;

  const filtered = rows.filter((r) => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && String(r.status).toLowerCase() !== statusFilter) return false;
    const created = new Date(r.created_at).getTime();
    if (fromTs != null && created < fromTs) return false;
    if (toTs != null && created > toTs) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const isCompleted = (s) => ['completed', 'approved', 'cash_issued'].includes(String(s).toLowerCase());
  const isRejected = (s) => String(s).toLowerCase() === 'rejected';

  const summary = {
    total_requests: filtered.length,
    total_amount: filtered.reduce((sum, r) => sum + (r.amount || 0), 0),
    completed_count: filtered.filter((r) => isCompleted(r.status)).length,
    pending_count: filtered.filter((r) => !isCompleted(r.status) && !isRejected(r.status)).length,
    by_type: {
      transport_request: filtered.filter((r) => r.type === 'transport_request').length,
      fuel_request: filtered.filter((r) => r.type === 'fuel_request').length,
      vehicle_rental: filtered.filter((r) => r.type === 'vehicle_rental').length,
    },
  };

  const typeColors = { transport_request: '#6366f1', fuel_request: '#f59e0b', vehicle_rental: '#22c55e' };
  const statusColorFor = (s) => {
    const st = String(s).toLowerCase();
    if (isRejected(st)) return '#ef4444';
    if (isCompleted(st)) return '#22c55e';
    if (st === 'pending') return '#f59e0b';
    return '#3b82f6';
  };

  const byStatusCounts = {};
  filtered.forEach((r) => {
    const key = String(r.status).toLowerCase();
    byStatusCounts[key] = (byStatusCounts[key] || 0) + 1;
  });

  const charts = {
    by_status: Object.entries(byStatusCounts).map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
      color: statusColorFor(name),
    })),
    by_type: Object.entries(summary.by_type).map(([name, value]) => ({
      name: TYPE_LABEL[name],
      value,
      color: typeColors[name],
    })),
    volume_by_month: buildVolumeByMonth(filtered),
  };

  return { summary, requests: filtered, charts };
}

function buildVolumeByMonth(rows) {
  const map = new Map();
  for (const r of rows) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = map.get(key) || { month: key, count: 0, amount: 0 };
    row.count += 1;
    row.amount += r.amount || 0;
    map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 }));
}

module.exports = { getTransportReport };
