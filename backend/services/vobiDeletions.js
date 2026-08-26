/**
 * Query recent delete / destructive actions across audit + soft-deleted rows.
 */
import pool from '../db.js';

async function safe(sql, params = []) {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (e) {
    console.warn('[vobi-deletes]', e.message);
    return [];
  }
}

export async function getRecentDeletions({ hours = 720, limit = 25 } = {}) {
  const lookback = Math.min(Math.max(Number(hours) || 720, 1), 24 * 365);

  const [auditDeletes, deletedItems, deletedUsers, deletedCategories] = await Promise.all([
    safe(
      `SELECT al.id, al.action, al.timestamp, al.details,
              TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, 'System')) AS user_name,
              u.username
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
        WHERE al.timestamp >= NOW() - ($1::text || ' hours')::interval
          AND (
            LOWER(al.action) LIKE '%delete%'
            OR LOWER(al.action) LIKE '%remove%'
            OR LOWER(al.action) LIKE 'chat_delete%'
          )
        ORDER BY al.timestamp DESC
        LIMIT $2`,
      [String(lookback), limit]
    ),
    safe(
      `SELECT i.id, i.name AS item_name, i.quantity, i.deleted_at,
              (
                SELECT TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username))
                  FROM audit_logs al
                  LEFT JOIN users u ON u.id = al.user_id
                 WHERE al.action = 'delete_item'
                   AND (al.details->>'item_id') = i.id::text
                 ORDER BY al.timestamp DESC
                 LIMIT 1
              ) AS deleted_by
         FROM items i
        WHERE i.deleted_at IS NOT NULL
          AND i.deleted_at >= NOW() - ($1::text || ' hours')::interval
        ORDER BY i.deleted_at DESC
        LIMIT $2`,
      [String(lookback), limit]
    ),
    safe(
      `SELECT id, username, first_name, last_name, role, main_role, deleted_at
         FROM users
        WHERE deleted_at IS NOT NULL
          AND deleted_at >= NOW() - ($1::text || ' hours')::interval
        ORDER BY deleted_at DESC
        LIMIT $2`,
      [String(lookback), Math.min(limit, 15)]
    ),
    safe(
      `SELECT id, name, deleted_at
         FROM categories
        WHERE deleted_at IS NOT NULL
          AND deleted_at >= NOW() - ($1::text || ' hours')::interval
        ORDER BY deleted_at DESC
        LIMIT $2`,
      [String(lookback), Math.min(limit, 15)]
    ).catch(() => []),
  ]);

  const events = [];

  for (const row of auditDeletes) {
    const d = row.details && typeof row.details === 'object' ? row.details : {};
    events.push({
      kind: 'audit',
      action: row.action,
      timestamp: row.timestamp,
      user_name: row.user_name,
      username: row.username,
      target:
        d.module === 'chat'
          ? 'a chat message'
          : d.item_name ||
            d.category_name ||
            d.username ||
            d.customer_name ||
            d.name ||
            d.ticket_id ||
            (d.item_id ? `item #${d.item_id}` : null) ||
            (d.message_id ? 'a chat message' : null) ||
            'record',
      details: d,
      link: '/audit-logs',
    });
  }

  for (const row of deletedItems) {
    events.push({
      kind: 'soft_delete_item',
      action: 'delete_item',
      timestamp: row.deleted_at,
      user_name: row.deleted_by || 'Unknown (no matching audit row)',
      target: row.item_name,
      details: { item_id: row.id, quantity_at_delete: row.quantity },
      link: '/inventory',
    });
  }

  for (const row of deletedUsers) {
    events.push({
      kind: 'soft_delete_user',
      action: 'delete_user',
      timestamp: row.deleted_at,
      user_name: 'Admin action',
      target: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      details: { user_id: row.id, username: row.username, role: row.main_role || row.role },
      link: '/users',
    });
  }

  for (const row of deletedCategories || []) {
    events.push({
      kind: 'soft_delete_category',
      action: 'delete_category',
      timestamp: row.deleted_at,
      user_name: 'Unknown',
      target: row.name,
      details: { category_id: row.id },
      link: '/categories',
    });
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    ok: true,
    lookback_hours: lookback,
    count: events.length,
    deletions: events.slice(0, limit),
    summary:
      events.length === 0
        ? `No deletions found in the last ${lookback} hours across audit logs, inventory, users, or categories.`
        : `Found ${events.length} deletion-related event(s).`,
  };
}
