import pool from '../db.js';
import { getCached, setCached } from './vobiCache.js';
import {
  getRoleAccess,
  canSeePayroll,
  MODULE_LINKS,
  ticketRecordLink,
  serviceRequestLink,
} from './vobiRoles.js';
import { isSystemAdminAccount } from '../roles.js';

const OPEN_TICKET = `status NOT IN ('RESOLVED', 'CLOSED')`;
const CASH_PENDING_FINANCE = `status IN ('pending', 'supervisor_approved')`;
const USER_NAME = `TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), u.username, 'Unknown'))`;
const TICKET_QUEUE = `
  CASE
    WHEN LOWER(TRIM(COALESCE(t.escalation_stage, ''))) ~ '^ip([-_].*)?$' THEN 'ip'
    WHEN LOWER(COALESCE(t.escalation_stage, '')) IN ('tx', 'ts') THEN 'tx'
    WHEN LOWER(COALESCE(t.escalation_stage, '')) LIKE '%noc%' THEN 'noc'
    WHEN t.created_by_type = 'customer'
      OR LOWER(COALESCE(t.escalation_stage, '')) IN ('cx', 'relationship_officer') THEN 'cx'
    ELSE COALESCE(LOWER(t.escalation_stage), 'unassigned')
  END
`;

async function safeQuery(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.warn('[vobi-data]', error.message);
    return [];
  }
}

async function safeCount(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return parseInt(result.rows[0]?.count ?? result.rows[0]?.n ?? 0, 10) || 0;
  } catch (error) {
    console.warn('[vobi-data]', error.message);
    return 0;
  }
}

function ghs(value) {
  const n = parseFloat(value ?? 0);
  return `GHS ${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`;
}

function firstVal(rows, key = 'total') {
  if (!Array.isArray(rows) || !rows[0]) return 0;
  return rows[0][key] ?? rows[0].count ?? 0;
}

function withTicketLinks(rows = []) {
  return rows.map((row) => ({
    ...row,
    link: ticketRecordLink(row.queue, row.ticket_id || row.id),
  }));
}

async function resolveUserContext(userId, role, position) {
  const uid = Number.parseInt(String(userId), 10) || 0;
  const rows = await safeQuery(
    `SELECT first_name, last_name, role, main_role, position, units, unit, username
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [uid]
  );
  const u = rows[0] || {};
  const first = String(u.first_name || '').trim();
  const last = String(u.last_name || '').trim();
  const fullName = [first, last].filter(Boolean).join(' ') || u.username || 'Colleague';
  return {
    userId: uid,
    role: role || u.main_role || u.role || 'user',
    position: position ?? u.position ?? null,
    units: u.units,
    unit: u.unit,
    username: u.username || null,
    first_name: first || fullName.split(' ')[0] || 'there',
    last_name: last || null,
    full_name: fullName,
    preferred_name: first || fullName.split(' ')[0] || 'there',
    is_system_admin: isSystemAdminAccount({
      username: u.username,
      full_name: fullName,
      first_name: first,
      last_name: last,
      role: u.role,
      main_role: u.main_role,
    }),
  };
}

async function fetchGlobalData() {
  const cached = getCached('global');
  if (cached) return cached;

  const data = {};

  const [
    items,
    lowStock,
    outOfStock,
    pendingMatReqs,
    approvedMatReqs,
    matReqDetails,
    pendingReturns,
    lowStockItems,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM items WHERE deleted_at IS NULL`),
    safeCount(`SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND quantity > 0 AND quantity <= COALESCE(low_stock_threshold, 5)`),
    safeCount(`SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND quantity = 0`),
    safeCount(`SELECT COUNT(*) FROM requests WHERE deleted_at IS NULL AND type = 'material_request' AND status = 'pending'`),
    safeCount(`SELECT COUNT(*) FROM requests WHERE deleted_at IS NULL AND type = 'material_request' AND status IN ('supervisor_approved', 'finance_approved', 'completed')`),
    safeQuery(`
      SELECT r.id,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), r.created_by, 'Unknown') AS requested_by,
             r.reason, r.status, r.created_at, r.department, r.project_name,
             (
               SELECT string_agg(i.name || ' x' || ri.quantity_requested, ', ')
                 FROM request_items ri
                 JOIN items i ON i.id = ri.item_id
                WHERE ri.request_id = r.id
             ) AS items
        FROM requests r
        LEFT JOIN users u ON r.created_by_id = u.id
       WHERE r.deleted_at IS NULL AND r.type = 'material_request' AND r.status = 'pending'
       ORDER BY r.created_at DESC
       LIMIT 10
    `),
    safeCount(`SELECT COUNT(*) FROM requests WHERE deleted_at IS NULL AND type = 'item_return' AND status = 'pending'`),
    safeQuery(`
      SELECT i.name, i.quantity, COALESCE(i.low_stock_threshold, 5) AS reorder_level, c.name AS category
        FROM items i
        LEFT JOIN categories c ON c.id = i.category_id
       WHERE i.deleted_at IS NULL AND i.quantity <= COALESCE(i.low_stock_threshold, 5)
       ORDER BY i.quantity ASC
       LIMIT 10
    `),
  ]);

  data.inventory = {
    total_items: items,
    low_stock_count: lowStock,
    out_of_stock_count: outOfStock,
    low_stock_items: lowStockItems.map((row) => ({
      ...row,
      link: MODULE_LINKS.inventory.low_stock,
    })),
    pending_material_requests: pendingMatReqs,
    approved_material_requests: approvedMatReqs,
    pending_material_request_details: matReqDetails.map((row) => ({
      ...row,
      link: `/request-forms/${row.id}`,
    })),
    pending_returns: pendingReturns,
    links: MODULE_LINKS.inventory,
  };

  const [pendingCash, pendingFinance, cashDetails, monthCashTotal, monthCashApproved] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM requests WHERE deleted_at IS NULL AND type = 'cash_request' AND status = 'pending'`),
    safeCount(`SELECT COUNT(*) FROM requests WHERE deleted_at IS NULL AND type = 'cash_request' AND ${CASH_PENDING_FINANCE}`),
    safeQuery(`
      SELECT r.id,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), r.created_by, 'Unknown') AS requested_by,
             r.total_amount AS amount, r.purpose, r.status, r.created_at, r.department
        FROM requests r
        LEFT JOIN users u ON r.created_by_id = u.id
       WHERE r.deleted_at IS NULL AND r.type = 'cash_request' AND r.status IN ('pending', 'supervisor_approved')
       ORDER BY r.created_at DESC
       LIMIT 10
    `),
    safeQuery(`SELECT COALESCE(SUM(COALESCE(total_amount, 0)), 0) AS total FROM requests WHERE deleted_at IS NULL AND type = 'cash_request' AND created_at >= date_trunc('month', NOW())`),
    safeQuery(`SELECT COALESCE(SUM(COALESCE(total_amount, 0)), 0) AS total FROM requests WHERE deleted_at IS NULL AND type = 'cash_request' AND status IN ('supervisor_approved', 'finance_approved', 'completed') AND created_at >= date_trunc('month', NOW())`),
  ]);

  data.finance = {
    pending_cash_requests: pendingCash,
    pending_finance_approvals: pendingFinance,
    pending_cash_details: cashDetails.map((row) => ({
      ...row,
      amount: ghs(row.amount),
      link: row.status === 'supervisor_approved' ? MODULE_LINKS.finance.finance_approvals : MODULE_LINKS.finance.cash_approvals,
    })),
    total_requested_this_month: ghs(firstVal(monthCashTotal)),
    total_approved_this_month: ghs(firstVal(monthCashApproved)),
    links: MODULE_LINKS.finance,
  };

  const ticketDetails = withTicketLinks(await safeQuery(`
    SELECT t.id, t.ticket_id, t.title, t.priority, t.status, t.created_at, t.updated_at,
           t.escalation_stage, t.escalation_due_at,
           (${TICKET_QUEUE}) AS queue,
           (t.escalation_due_at IS NOT NULL AND t.escalation_due_at < NOW()) AS escalated,
           ${USER_NAME} AS assigned_to_name,
           c.customer_name
      FROM tickets t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
     WHERE t.${OPEN_TICKET}
     ORDER BY
       CASE LOWER(COALESCE(t.priority, ''))
         WHEN 'urgent' THEN 1 WHEN 'critical' THEN 1
         WHEN 'high' THEN 2 WHEN 'medium' THEN 3
         ELSE 4 END ASC,
       t.created_at ASC
     LIMIT 20
  `));

  const ticketCounts = await safeQuery(`
    SELECT (${TICKET_QUEUE}) AS queue, t.status, t.priority,
           COUNT(*)::int AS count,
           SUM(CASE WHEN t.escalation_due_at IS NOT NULL AND t.escalation_due_at < NOW() THEN 1 ELSE 0 END)::int AS escalated
      FROM tickets t
     WHERE t.${OPEN_TICKET}
     GROUP BY 1, t.status, t.priority
  `);

  data.tickets = {
    open_details: ticketDetails,
    counts_by_type: ticketCounts,
    urgent_count: ticketDetails.filter((t) => ['urgent', 'high', 'critical'].includes(String(t.priority || '').toLowerCase())).length,
    escalated_count: ticketDetails.filter((t) => t.escalated).length,
    links: {
      cx: MODULE_LINKS.tickets_cx,
      noc: MODULE_LINKS.tickets_noc,
      ip: MODULE_LINKS.tickets_ip,
      tx: MODULE_LINKS.tickets_tx,
    },
  };

  // Clients + sites (CX registry)
  const [clientCount, siteCount, recentClients, recentSites] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL`),
    safeCount(`SELECT COUNT(*) FROM customer_sites`),
    safeQuery(`
      SELECT c.id, c.customer_name AS company_name, c.customer_code, c.status, c.contact_person,
             (SELECT COUNT(*)::int FROM customer_sites s WHERE s.customer_id = c.id) AS site_count
        FROM customers c
       WHERE c.deleted_at IS NULL
       ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
       LIMIT 12
    `),
    safeQuery(`
      SELECT s.id, s.site_code, s.site_name, s.region, s.connection_status,
             c.customer_name AS client_name, c.customer_code
        FROM customer_sites s
        LEFT JOIN customers c ON c.id = s.customer_id
       ORDER BY s.updated_at DESC NULLS LAST, s.id DESC
       LIMIT 12
    `),
  ]);

  data.clients = {
    total: clientCount,
    recent: recentClients.map((row) => ({
      ...row,
      link: `/staff/cx/clients/${row.id}`,
    })),
    links: { list: '/staff/cx/clients', sites: '/staff/cx/sites', admin: '/admin/clients' },
  };

  data.sites = {
    total: siteCount,
    recent: recentSites.map((row) => ({
      ...row,
      link: '/staff/cx/sites',
    })),
    links: { list: '/staff/cx/sites' },
  };

  const serviceRequests = await safeQuery(`
    SELECT pr.id, pr.customer_name, pr.site_name, pr.status, pr.current_stage,
           pr.project_unit_name, pr.created_at, pr.created_by_name,
           COALESCE(pr.project_unit_name, pr.current_stage, 'project') AS unit
      FROM project_requests pr
     WHERE pr.status NOT IN ('completed', 'rejected')
     ORDER BY pr.created_at DESC
     LIMIT 15
  `);

  data.service_requests = {
    active: serviceRequests.map((row) => ({
      ...row,
      title: `${row.customer_name} — ${row.site_name}`,
      link: serviceRequestLink(row.current_stage || row.unit, row.id),
    })),
    pending_count: serviceRequests.filter((r) => r.status === 'pending').length,
    in_progress_count: serviceRequests.filter((r) => ['ongoing', 'integrated'].includes(r.status)).length,
    links: MODULE_LINKS.service_requests,
  };

  const [totalAssets, maintenance, dueSoon] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM assets WHERE deleted_at IS NULL AND status NOT IN ('retired', 'lost')`),
    safeQuery(`
      SELECT a.id, a.name, a.tag, a.status, ac.name AS category, l.name AS location
        FROM assets a
        LEFT JOIN asset_categories ac ON ac.id = a.category_id
        LEFT JOIN asset_locations l ON l.id = a.location_id
       WHERE a.deleted_at IS NULL AND a.status IN ('in_repair', 'damaged')
       LIMIT 10
    `),
    safeQuery(`
      SELECT a.name, a.tag, am.start_date AS next_maintenance_date, am.type, am.status, ac.name AS category
        FROM asset_maintenance am
        JOIN assets a ON am.asset_id = a.id
        LEFT JOIN asset_categories ac ON ac.id = a.category_id
       WHERE am.deleted_at IS NULL
         AND am.status IN ('pending', 'in_progress')
         AND am.start_date <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY am.start_date ASC
       LIMIT 10
    `),
  ]);

  data.assets = {
    total_active: totalAssets,
    under_maintenance: maintenance.map((row) => ({ ...row, link: MODULE_LINKS.assets.maintenance })),
    due_for_maintenance_soon: dueSoon.map((row) => ({ ...row, link: MODULE_LINKS.assets.maintenance })),
    links: MODULE_LINKS.assets,
  };

  const fieldToday = await safeQuery(`
    SELECT fa.id, fa.project_name AS title, fa.status, fa.town AS location,
           fa.engineer AS engineer_name, fa.created_at
      FROM field_operations fa
     WHERE fa.created_at::date = CURRENT_DATE
     ORDER BY fa.created_at DESC
  `);

  data.field = {
    today: fieldToday.map((row) => ({ ...row, link: MODULE_LINKS.field.all })),
    today_count: fieldToday.length,
    active_engineers: [...new Set(fieldToday.map((f) => f.engineer_name).filter(Boolean))],
    links: MODULE_LINKS.field,
  };

  const [
    totalEmp,
    empByDept,
    newHires,
    expiringContracts,
    pendingLeave,
    leaveDetails,
    onLeaveToday,
    pendingForms,
    formDetails,
    payrollStatus,
    attendanceToday,
    lateToday,
    absentToday,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM hr_employees WHERE status = 'active'`),
    safeQuery(`SELECT COALESCE(department, 'Unassigned') AS department, COUNT(*)::int AS count FROM hr_employees WHERE status = 'active' GROUP BY 1 ORDER BY count DESC`),
    safeQuery(`
      SELECT full_name, position, department, start_date
        FROM hr_employees
       WHERE DATE_TRUNC('month', start_date) = DATE_TRUNC('month', NOW())
         AND status = 'active'
    `),
    safeQuery(`
      SELECT full_name, position, department, contract_end_date,
             (contract_end_date - CURRENT_DATE) AS days_remaining
        FROM hr_employees
       WHERE contract_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
         AND status = 'active'
       ORDER BY contract_end_date ASC
    `),
    safeCount(`SELECT COUNT(*) FROM hr_leave_requests WHERE LOWER(status) = 'pending'`),
    safeQuery(`
      SELECT COALESCE(e.full_name, TRIM(u.first_name || ' ' || u.last_name)) AS full_name,
             e.department, e.position, r.leave_type, r.start_date, r.end_date,
             r.days, r.reason, r.created_at, r.id
        FROM hr_leave_requests r
        LEFT JOIN hr_employees e ON r.employee_id = e.id
        LEFT JOIN users u ON r.user_id = u.id
       WHERE LOWER(r.status) = 'pending'
       ORDER BY r.created_at DESC
    `),
    safeQuery(`
      SELECT COALESCE(e.full_name, TRIM(u.first_name || ' ' || u.last_name)) AS full_name,
             e.department, r.leave_type, r.end_date
        FROM hr_leave_requests r
        LEFT JOIN hr_employees e ON r.employee_id = e.id
        LEFT JOIN users u ON r.user_id = u.id
       WHERE LOWER(r.status) = 'approved'
         AND CURRENT_DATE BETWEEN r.start_date AND r.end_date
    `),
    safeCount(`SELECT COUNT(*) FROM hr_form_requests WHERE LOWER(status) = 'pending'`),
    safeQuery(`
      SELECT COALESCE(e.full_name, e2.full_name, TRIM(u.first_name || ' ' || u.last_name)) AS full_name,
             COALESCE(e.department, e2.department) AS department,
             COALESCE(e.position, e2.position) AS position,
             r.form_type, r.reason, r.created_at, r.id
        FROM hr_form_requests r
        LEFT JOIN hr_employees e ON e.id = r.employee_id
        LEFT JOIN hr_employees e2 ON e2.user_id = r.user_id AND r.employee_id IS NULL
        LEFT JOIN users u ON r.user_id = u.id
       WHERE LOWER(r.status) = 'pending'
       ORDER BY r.created_at DESC
    `),
    safeQuery(`
      SELECT p.status, p.generated_at AS created_at,
             COALESCE(SUM(pi.gross), 0) AS gross,
             COALESCE(SUM(pi.net_pay), 0) AS net,
             COUNT(pi.id)::int AS employee_count
        FROM hr_payroll p
        LEFT JOIN hr_payroll_items pi ON pi.payroll_id = p.id
       WHERE p.month = EXTRACT(MONTH FROM NOW())::int
         AND p.year = EXTRACT(YEAR FROM NOW())::int
       GROUP BY p.status, p.generated_at
       LIMIT 1
    `),
    safeQuery(`
      SELECT e.full_name, e.department,
             COALESCE(a.clock_in_time::text, a.clock_in::text) AS clock_in_time,
             COALESCE(a.is_late, a.status = 'Late') AS is_late,
             COALESCE(a.late_minutes, 0) AS late_minutes
        FROM hr_attendance a
        JOIN hr_employees e ON a.employee_id = e.id
       WHERE a.date = CURRENT_DATE
       ORDER BY a.clock_in ASC NULLS LAST
    `),
    safeCount(`SELECT COUNT(*) FROM hr_attendance WHERE date = CURRENT_DATE AND (is_late = true OR status = 'Late')`),
    safeQuery(`
      SELECT e.full_name, e.department
        FROM hr_employees e
       WHERE e.status = 'active'
         AND e.id NOT IN (SELECT employee_id FROM hr_attendance WHERE date = CURRENT_DATE AND employee_id IS NOT NULL)
         AND e.id NOT IN (
           SELECT employee_id FROM hr_leave_requests
            WHERE LOWER(status) = 'approved'
              AND CURRENT_DATE BETWEEN start_date AND end_date
              AND employee_id IS NOT NULL
         )
    `),
  ]);

  data.hr = {
    total_employees: totalEmp,
    by_department: empByDept,
    new_hires_this_month: newHires,
    expiring_contracts: expiringContracts.map((row) => ({
      ...row,
      link: MODULE_LINKS.hr.employees,
    })),
    attendance: {
      clocked_in_today: attendanceToday,
      clocked_in_count: attendanceToday.length,
      late_count: lateToday,
      absent_today: absentToday,
      absent_count: absentToday.length,
      link: MODULE_LINKS.hr.attendance,
    },
    leave: {
      pending_count: pendingLeave,
      pending_details: leaveDetails.map((row) => ({ ...row, link: MODULE_LINKS.hr.leave })),
      on_leave_today: onLeaveToday,
      link: MODULE_LINKS.hr.leave,
    },
    payroll: {
      this_month: payrollStatus[0] || { status: 'not_generated' },
      gross: ghs(payrollStatus[0]?.gross),
      net: ghs(payrollStatus[0]?.net),
      link: MODULE_LINKS.hr.payroll,
    },
    form_requests: {
      pending_count: pendingForms,
      pending_details: formDetails.map((row) => ({ ...row, link: MODULE_LINKS.hr.form_requests })),
      link: MODULE_LINKS.hr.form_requests,
    },
    links: MODULE_LINKS.hr,
  };

  const recentChannelMessages = await safeQuery(`
    SELECT m.id, m.body AS content, m.created_at,
           TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''), s.username, 'Unknown')) AS sender_name,
           ch.name AS channel_name, ch.id AS channel_id, ch.channel_type
      FROM chat_messages m
      JOIN chat_channels ch ON ch.id = m.channel_id
      LEFT JOIN users s ON s.id = m.sender_id
     WHERE m.created_at >= NOW() - INTERVAL '24 hours'
       AND COALESCE(ch.channel_type, '') <> 'vobi'
       AND COALESCE(m.message_type, 'user') <> 'vobi'
     ORDER BY m.created_at DESC
     LIMIT 30
  `);

  data.chat = {
    recent_messages: recentChannelMessages.map((row) => ({
      ...row,
      link: row.channel_id ? `/chat?channel=${row.channel_id}` : MODULE_LINKS.chat.general,
    })),
    active_channels: [...new Set(recentChannelMessages.map((m) => m.channel_name).filter(Boolean))],
    links: MODULE_LINKS.chat,
  };

  const [totalUsers, activeUsers, recentAudit] = await Promise.all([
    safeCount(`SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND COALESCE(status, 'active') = 'active'`),
    safeCount(`SELECT COUNT(DISTINCT user_id) FROM audit_logs WHERE LOWER(action) LIKE '%login%' AND timestamp >= NOW() - INTERVAL '24 hours'`),
    safeQuery(`
      SELECT al.id, al.action, al.timestamp AS created_at, al.details,
             TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), u.username, 'System')) AS user_name,
             u.username
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
       ORDER BY al.timestamp DESC
       LIMIT 25
    `),
  ]);

  data.system = {
    total_users: totalUsers,
    active_last_24h: activeUsers,
    recent_audit: recentAudit.map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      user_name: row.user_name,
      username: row.username,
      details: row.details || {},
      link: MODULE_LINKS.audit,
      // Human-readable hint for inventory updates
      summary:
        row.action === 'update_item' && row.details
          ? [
              row.details.item_name || row.details.new_name || `item #${row.details.item_id}`,
              row.details.old_quantity !== undefined
                ? `qty ${row.details.old_quantity} → ${row.details.new_quantity}`
                : null,
              row.details.reason ? `reason: ${row.details.reason}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null,
    })),
    links: { users: MODULE_LINKS.users, audit: MODULE_LINKS.audit },
  };

  data.generated_at = new Date().toISOString();
  setCached('global', data);
  return data;
}

async function fetchUserData(userId) {
  const uid = Number.parseInt(String(userId), 10) || 0;
  const cacheKey = `user_${uid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [
    myTickets,
    myApprovals,
    myMatRequests,
    myCashRequests,
    myServiceRequests,
    myUnreadMessages,
    myMentions,
    myAttendanceToday,
    myLeaveBalance,
    myPendingLeave,
  ] = await Promise.all([
    safeQuery(`
      SELECT t.id, t.ticket_id, t.title, t.priority, t.status, t.created_at, t.updated_at,
             (${TICKET_QUEUE}) AS queue,
             (t.escalation_due_at IS NOT NULL AND t.escalation_due_at < NOW()) AS escalated
        FROM tickets t
       WHERE t.assigned_to = $1 AND t.${OPEN_TICKET}
       ORDER BY
         CASE LOWER(COALESCE(t.priority, ''))
           WHEN 'urgent' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
         t.created_at DESC
    `, [uid]),
    safeQuery(`
      SELECT r.id, r.type,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), r.created_by, 'Unknown') AS requested_by,
             r.reason, r.purpose, r.total_amount, r.created_at, r.status
        FROM requests r
        JOIN request_approvers ra ON ra.request_id = r.id
        LEFT JOIN users u ON r.created_by_id = u.id
       WHERE ra.approver_id = $1 AND r.deleted_at IS NULL AND r.status = 'pending'
       ORDER BY r.created_at DESC
    `, [uid]),
    safeQuery(`
      SELECT r.id, r.status, r.created_at, r.reason, r.project_name,
             (
               SELECT string_agg(i.name || ' x' || ri.quantity_requested, ', ')
                 FROM request_items ri JOIN items i ON i.id = ri.item_id
                WHERE ri.request_id = r.id
             ) AS items
        FROM requests r
       WHERE r.deleted_at IS NULL AND r.created_by_id = $1 AND r.type = 'material_request' AND r.status = 'pending'
    `, [uid]),
    safeQuery(`
      SELECT id, total_amount AS amount, purpose, status, created_at
        FROM requests
       WHERE deleted_at IS NULL AND created_by_id = $1 AND type = 'cash_request' AND status IN ('pending', 'supervisor_approved')
    `, [uid]),
    safeQuery(`
      SELECT pr.id, pr.customer_name, pr.site_name, pr.status, pr.current_stage, pr.created_at
        FROM project_requests pr
       WHERE pr.created_by_user_id = $1 AND pr.status NOT IN ('completed', 'rejected')
    `, [uid]),
    safeQuery(`
      SELECT m.body AS content, m.created_at,
             TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''), s.username, 'Unknown')) AS sender_name,
             ch.name AS channel_name, ch.id AS channel_id
        FROM chat_messages m
        JOIN channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
        JOIN chat_channels ch ON ch.id = m.channel_id
        LEFT JOIN users s ON s.id = m.sender_id
       WHERE m.sender_id IS DISTINCT FROM $1
         AND COALESCE(ch.channel_type, '') <> 'vobi'
         AND m.created_at > COALESCE(cm.last_read_at, '1970-01-01'::timestamp)
       ORDER BY m.created_at DESC
       LIMIT 20
    `, [uid]),
    safeQuery(`
      SELECT m.body AS content, m.created_at,
             TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''), s.username, 'Unknown')) AS sender_name,
             ch.name AS channel_name, ch.id AS channel_id
        FROM message_mentions mm
        JOIN chat_messages m ON m.id = mm.message_id
        JOIN chat_channels ch ON ch.id = m.channel_id
        LEFT JOIN users s ON s.id = m.sender_id
       WHERE mm.user_id = $1
         AND m.created_at >= NOW() - INTERVAL '7 days'
         AND m.sender_id IS DISTINCT FROM $1
       ORDER BY m.created_at DESC
       LIMIT 10
    `, [uid]),
    safeQuery(`
      SELECT a.date,
             COALESCE(a.clock_in_time::text, a.clock_in::text) AS clock_in_time,
             COALESCE(a.clock_out_time::text, a.clock_out::text) AS clock_out_time,
             COALESCE(a.is_late, a.status = 'Late') AS is_late,
             COALESCE(a.late_minutes, 0) AS late_minutes,
             a.status
        FROM hr_attendance a
        JOIN hr_employees e ON a.employee_id = e.id
       WHERE e.user_id = $1 AND a.date = CURRENT_DATE
    `, [uid]),
    safeQuery(`
      SELECT lb.leave_type, lb.total_days, lb.used_days,
             (lb.total_days - lb.used_days) AS remaining
        FROM hr_leave_balances lb
        JOIN hr_employees e ON lb.employee_id = e.id
       WHERE e.user_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())::int
    `, [uid]),
    safeQuery(`
      SELECT r.leave_type, r.start_date, r.end_date, r.days, r.status, r.created_at
        FROM hr_leave_requests r
        LEFT JOIN hr_employees e ON r.employee_id = e.id
       WHERE LOWER(r.status) = 'pending'
         AND (e.user_id = $1 OR r.user_id = $1)
    `, [uid]),
  ]);

  const data = {
    my_tickets: {
      open: withTicketLinks(myTickets),
      count: myTickets.length,
      urgent: withTicketLinks(myTickets.filter((t) => ['urgent', 'high', 'critical'].includes(String(t.priority || '').toLowerCase()))),
      links: MODULE_LINKS.tickets_cx,
    },
    my_approvals: {
      pending_material: myApprovals
        .filter((r) => r.type !== 'cash_request')
        .map((row) => ({ ...row, link: MODULE_LINKS.finance.material_approvals })),
      pending_cash: myApprovals
        .filter((r) => r.type === 'cash_request')
        .map((row) => ({ ...row, amount: ghs(row.total_amount), link: MODULE_LINKS.finance.cash_approvals })),
      count: myApprovals.length,
      links: MODULE_LINKS.finance,
    },
    my_requests: {
      pending_material: myMatRequests.map((row) => ({ ...row, link: `/request-forms/${row.id}` })),
      pending_cash: myCashRequests.map((row) => ({ ...row, amount: ghs(row.amount), link: MODULE_LINKS.finance.cash_request })),
      pending_service: myServiceRequests.map((row) => ({
        ...row,
        title: `${row.customer_name} — ${row.site_name}`,
        link: serviceRequestLink(row.current_stage, row.id),
      })),
    },
    my_chat: {
      unread_messages: myUnreadMessages.map((row) => ({
        ...row,
        link: row.channel_id ? `/chat?channel=${row.channel_id}` : MODULE_LINKS.chat.general,
      })),
      unread_count: myUnreadMessages.length,
      mentions: myMentions.map((row) => ({
        ...row,
        link: row.channel_id ? `/chat?channel=${row.channel_id}` : MODULE_LINKS.chat.general,
      })),
      mention_count: myMentions.length,
      links: MODULE_LINKS.chat,
    },
    my_hr: {
      attendance_today: myAttendanceToday[0] || null,
      leave_balances: myLeaveBalance,
      pending_leave_requests: myPendingLeave.map((row) => ({ ...row, link: MODULE_LINKS.hr_self.leave })),
      links: MODULE_LINKS.hr_self,
    },
    workspace: MODULE_LINKS.workspace,
  };

  setCached(cacheKey, data);
  return data;
}

function stripPayroll(hr) {
  if (!hr) return hr;
  return {
    ...hr,
    payroll: {
      this_month: { status: hr.payroll?.this_month?.status || 'restricted' },
      note: 'Payroll figures are restricted for this role',
      link: hr.payroll?.link,
    },
  };
}

function accessOptsFromCtx(ctx = {}) {
  return {
    units: ctx.units,
    unit: ctx.unit,
    username: ctx.username,
    full_name: ctx.full_name,
    first_name: ctx.first_name,
    last_name: ctx.last_name,
    role: ctx.role,
    main_role: ctx.role,
    isSystemAdmin: Boolean(ctx.is_system_admin),
  };
}

function filterDataByRole(globalData, role, position, ctx = {}) {
  const access = getRoleAccess(role, position, accessOptsFromCtx(ctx));
  const allowPayroll = canSeePayroll(access);

  if (access.sees_everything) {
    return {
      ...globalData,
      hr: allowPayroll ? globalData.hr : stripPayroll(globalData.hr),
    };
  }

  const filtered = { generated_at: globalData.generated_at };
  const modules = new Set(access.modules || []);

  if (modules.has('inventory')) filtered.inventory = globalData.inventory;
  if (modules.has('finance') || modules.has('cash_requests')) filtered.finance = globalData.finance;

  if (modules.has('tickets')) {
    filtered.tickets = globalData.tickets;
    filtered.clients = globalData.clients;
    filtered.sites = globalData.sites;
  } else {
    if (modules.has('tickets_cx')) {
      filtered.tickets_cx = {
        open: globalData.tickets?.open_details?.filter((t) => t.queue === 'cx') || [],
        links: MODULE_LINKS.tickets_cx,
      };
      filtered.clients = globalData.clients;
      filtered.sites = globalData.sites;
    }
    if (modules.has('tickets_noc')) {
      filtered.tickets_noc = {
        open: globalData.tickets?.open_details?.filter((t) => t.queue === 'noc') || [],
        links: MODULE_LINKS.tickets_noc,
      };
    }
    if (modules.has('tickets_ip')) {
      filtered.tickets_ip = {
        open: globalData.tickets?.open_details?.filter((t) => t.queue === 'ip') || [],
        links: MODULE_LINKS.tickets_ip,
      };
    }
    if (modules.has('tickets_tx')) {
      filtered.tickets_tx = {
        open: globalData.tickets?.open_details?.filter((t) => t.queue === 'tx') || [],
        links: MODULE_LINKS.tickets_tx,
      };
    }
  }

  if (modules.has('clients') || modules.has('service_requests')) {
    filtered.clients = filtered.clients || globalData.clients;
    filtered.sites = filtered.sites || globalData.sites;
  }

  if (modules.has('service_requests')) filtered.service_requests = globalData.service_requests;
  if (modules.has('hr') || access.hr_full_access) {
    filtered.hr = allowPayroll ? globalData.hr : stripPayroll(globalData.hr);
  }
  if (modules.has('assets')) filtered.assets = globalData.assets;
  if (modules.has('field')) filtered.field = globalData.field;
  if (modules.has('chat')) filtered.chat = globalData.chat;
  if (modules.has('users')) filtered.system = globalData.system;
  if (modules.has('audit')) {
    filtered.audit = globalData.system?.recent_audit;
    if (!filtered.system) filtered.system = { recent_audit: globalData.system?.recent_audit, links: globalData.system?.links };
    else filtered.system = { ...filtered.system, recent_audit: globalData.system?.recent_audit };
  }
  if (modules.has('inventory') && globalData.system?.recent_audit) {
    const invActions = new Set(['update_item', 'create_item', 'delete_item', 'issue_item', 'create_category', 'update_category', 'delete_category']);
    filtered.recent_inventory_changes = globalData.system.recent_audit.filter((a) => invActions.has(String(a.action || '').toLowerCase()));
  }

  if (access.scoped_to_units) {
    filtered.access_note =
      'Vobi access for this admin is limited to their assigned unit/department. System-wide data is not available.';
  }

  return filtered;
}

export async function getVobiSystemData(userId, role, position) {
  const ctx = await resolveUserContext(userId, role, position);
  const access = getRoleAccess(ctx.role, ctx.position, accessOptsFromCtx(ctx));

  const [globalData, userData] = await Promise.all([
    fetchGlobalData(),
    fetchUserData(ctx.userId),
  ]);

  const roleFilteredData = filterDataByRole(globalData, ctx.role, ctx.position, ctx);

  return {
    generated_at: globalData.generated_at,
    role_context: {
      role: ctx.role,
      position: ctx.position,
      first_name: ctx.first_name,
      last_name: ctx.last_name,
      full_name: ctx.full_name,
      preferred_name: ctx.preferred_name,
      units: access.units || [],
      access_key: access.key,
      is_system_admin: Boolean(ctx.is_system_admin),
      sees_everything: Boolean(access.sees_everything),
      scoped_to_units: Boolean(access.scoped_to_units),
      can_see_payroll: canSeePayroll(access),
      modules: access.modules,
      description: access.description,
      access_note: access.scoped_to_units
        ? 'This admin is limited to assigned units/departments — not company-wide Vobi access.'
        : null,
    },
    system: roleFilteredData,
    my_work: userData,
  };
}

/** Fast path for greetings / small talk — no global ERP snapshot. */
export async function getVobiLightSystemData(userId, role, position) {
  const ctx = await resolveUserContext(userId, role, position);
  const access = getRoleAccess(ctx.role, ctx.position, accessOptsFromCtx(ctx));
  return {
    generated_at: new Date().toISOString(),
    light_mode: true,
    role_context: {
      role: ctx.role,
      position: ctx.position,
      first_name: ctx.first_name,
      last_name: ctx.last_name,
      full_name: ctx.full_name,
      preferred_name: ctx.preferred_name,
      units: access.units || [],
      access_key: access.key,
      is_system_admin: Boolean(ctx.is_system_admin),
      sees_everything: Boolean(access.sees_everything),
      scoped_to_units: Boolean(access.scoped_to_units),
      can_see_payroll: canSeePayroll(access),
      modules: access.modules,
      description: access.description,
      access_note: access.scoped_to_units
        ? 'This admin is limited to assigned units/departments — not company-wide Vobi access.'
        : null,
    },
    system: { note: 'Light mode — full ERP snapshot not loaded for this short message.' },
    my_work: null,
  };
}
