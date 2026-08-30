export function parseIdList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseIdList(parsed);
    } catch {
      return value
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
  }
  return [];
}

export function latestApprovalByUser(rows = []) {
  const latest = new Map();
  for (const row of rows) {
    const id = Number(row.approver_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    latest.set(id, row);
  }
  return latest;
}

export function buildApprovalParties(requiredIds, profilesById, approvalRows) {
  const latest = latestApprovalByUser(approvalRows);
  return requiredIds.map((id) => {
    const rec = latest.get(Number(id));
    const decision = String(rec?.decision || 'pending').toLowerCase();
    return {
      id: Number(id),
      name: profilesById.get(Number(id)) || rec?.approver_name || `User #${id}`,
      status: decision === 'approved' || decision === 'rejected' ? decision : 'pending',
      actedAt: rec?.created_at || null,
    };
  });
}

export function myApprovalState(approvalRows, userId) {
  const mine = (approvalRows || []).filter((row) => Number(row.approver_id) === Number(userId));
  const latest = mine.at(-1);
  return {
    my_decision: latest?.decision || null,
    my_acted_at: latest?.created_at || null,
  };
}

export async function loadUserNames(pool, ids) {
  const unique = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!unique.length) return map;
  const users = await pool.query(
    `SELECT id, first_name, last_name, username FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
    [unique]
  );
  for (const row of users.rows) {
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username || `User #${row.id}`;
    map.set(Number(row.id), name);
  }
  return map;
}
