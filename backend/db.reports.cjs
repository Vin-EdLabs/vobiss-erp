let pool = null;

async function loadPool() {
  if (!pool) {
    const dbModule = await import('./db.js');
    pool = dbModule.pool || dbModule.default?.pool || dbModule.default;
    if (!pool) throw new Error('Database pool not available');
  }
}

async function getCashRequestReport({ date_from, date_to, status } = {}) {
  await loadPool();

  const values = [];
  let idx = 1;
  let where = `r.type = 'cash_request' AND (r.deleted_at IS NULL)`;

  if (date_from) {
    where += ` AND r.created_at >= $${idx++}`;
    values.push(date_from);
  }
  if (date_to) {
    where += ` AND r.created_at <= $${idx++}`;
    values.push(date_to);
  }
  if (status) {
    where += ` AND r.status = $${idx++}`;
    values.push(status);
  }

  const result = await pool.query(
    `
    SELECT
      r.id,
      r.created_by,
      r.purpose,
      r.department,
      r.project_name,
      r.project_description,
      r.reason,
      r.special_instructions,
      r.location,
      r.status,
      r.total_amount,
      r.created_at,
      r.updated_at,
      r.received_at,
      r.date_needed,
      COALESCE(
        json_agg(
          json_build_object(
            'description', ce.description,
            'quantity', ce.quantity,
            'unit_price', ce.unit_price,
            'line_total', ce.line_total
          ) ORDER BY ce.id
        ) FILTER (WHERE ce.id IS NOT NULL),
        '[]'::json
      ) AS line_items
    FROM requests r
    LEFT JOIN cash_expenses ce ON ce.request_id = r.id
    WHERE ${where}
    GROUP BY r.id
    ORDER BY r.created_at DESC
    `,
    values
  );

  const requests = result.rows.map((row) => {
    const lineItems = Array.isArray(row.line_items)
      ? row.line_items
      : typeof row.line_items === 'string'
        ? JSON.parse(row.line_items)
        : [];
    const lineSum = lineItems.reduce(
      (s, li) =>
        s + (parseFloat(li.line_total) || parseFloat(li.quantity) * parseFloat(li.unit_price) || 0),
      0
    );
    const total = parseFloat(row.total_amount) || lineSum || 0;
    return { ...row, line_items: lineItems, total_amount: total };
  });

  const summary = {
    total_requests: requests.length,
    total_amount: requests.reduce((s, r) => s + (r.total_amount || 0), 0),
    by_status: {},
    completed_count: 0,
    pending_count: 0,
  };

  const statusColors = {
    pending: '#f59e0b',
    supervisor_approved: '#8b5cf6',
    finance_approved: '#3b82f6',
    completed: '#22c55e',
    rejected: '#ef4444',
  };

  requests.forEach((r) => {
    const st = r.status || 'pending';
    summary.by_status[st] = (summary.by_status[st] || 0) + 1;
    if (st === 'completed') summary.completed_count += 1;
    else if (st !== 'rejected') summary.pending_count += 1;
  });

  const charts = {
    by_status: Object.entries(summary.by_status).map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value,
      color: statusColors[name] || '#6366f1',
    })),
    amount_by_status: Object.entries(
      requests.reduce((acc, r) => {
        const st = r.status || 'pending';
        acc[st] = (acc[st] || 0) + (r.total_amount || 0);
        return acc;
      }, {})
    ).map(([name, value]) => ({
      name: name.replace(/_/g, ' '),
      value: Math.round(value * 100) / 100,
      color: statusColors[name] || '#6366f1',
    })),
    volume_by_month: buildCashVolumeByMonth(requests),
  };

  return { summary, requests, charts };
}

function buildCashVolumeByMonth(requests) {
  const map = new Map();
  for (const r of requests) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = map.get(key) || { month: key, count: 0, amount: 0 };
    row.count += 1;
    row.amount += r.total_amount || 0;
    map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
    .map((r) => ({ ...r, amount: Math.round(r.amount * 100) / 100 }));
}

module.exports = { getCashRequestReport };
