import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pool from '../db.js';
import { authenticateToken, requireHR } from '../middleware/auth.js';
import { attachTenant } from '../middleware/tenant.js';
import { isSystemAdminAccount } from '../roles.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import {
  LEAVE_TYPES,
  DEFAULT_LEAVE_BALANCES,
  DOCUMENT_CATEGORIES,
  ATTENDANCE_STATUSES,
  PAYROLL_STATUSES,
  ensureLeaveBalances,
  logHrActivity,
} from '../db/hr.js';
import { sendHrWelcomeEmail } from '../emailService.js';
import {
  provisionEmployeeUser,
  syncEmployeeUserStatus,
  suspendEmployeeAccount,
  unsuspendEmployeeAccount,
  notifyUser,
  generateHrLetterPdf,
  LETTER_FORM_TYPES,
  deductLeaveDays,
  isoDateOnly,
  syncPendingEmployeesFromUsers,
} from '../utils/hrShared.js';
import {
  leaveEmployeeIdsOn,
  leaveDatesByEmployee,
  overlayLeaveStatus,
  withLeaveAttendanceRows,
  markLeaveAttendance,
  hasClockedIn,
  hasClockedOut,
  workingDaysInMonth,
} from '../utils/hrGps.js';
import {
  getPayrollSettings,
  savePayrollSettings,
  allowancesForEmployee,
  allowancesByEmployeeIds,
  reliefsByEmployeeIds,
  deductionsByEmployeeIds,
  advancesByEmployeeIds,
  mergeAllowances,
  totalsFromCalcs,
  roundTotals,
  mapAdvance,
} from '../utils/hrPayrollEngine.js';
import { calculateNetPay, roundMoney, DEFAULT_TAX_BANDS } from '../utils/payrollCalculator.js';
import { renderPayslipPdf } from '../utils/payslipPdf.js';
import { peopleSnapshot, attendanceHealth, leaveOverview, payrollIntelligence } from '../utils/hrInsights.js';
import {
  monthlySummaryReport,
  attendanceReport,
  payrollReport,
  leaveReport,
  directoryReport,
} from '../utils/hrReports.js';
import {
  auditFromReq,
  auditSystem,
  fmtGhs,
  actionLabel,
} from '../utils/payrollAudit.js';
import { buildSimpleLetterPdf } from '../utils/simplePdf.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fromName = path.extname(file.originalname || '').toLowerCase();
    const fromMime = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    }[file.mimetype] || '';
    cb(null, `hr-${unique}${fromName || fromMime}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const blocked = ['.exe', '.bat', '.cmd', '.msi', '.dll', '.sh', '.ps1', '.com', '.js'];
    if (blocked.includes(ext)) return cb(new Error('This file type is not allowed'));
    cb(null, true);
  },
});

router.use(authenticateToken);
router.use(requireHR);
router.use(attachTenant);
router.use(invalidateOnMutation);

const actorId = (req) => req.user?.id || null;

async function employeeBrief(employeeId) {
  if (employeeId == null) return null;
  try {
    const r = await pool.query(
      `SELECT id, full_name, department, position FROM hr_employees WHERE id = $1`,
      [employeeId]
    );
    return r.rows[0] || null;
  } catch {
    return null;
  }
}

function payrollAuditFilters(query = {}) {
  const clauses = [];
  const params = [];
  const search = String(query.search || '').trim();
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    clauses.push(`(
      LOWER(COALESCE(a.performed_by_name,'')) LIKE $${params.length}
      OR LOWER(COALESCE(a.action_type,'')) LIKE $${params.length}
      OR LOWER(COALESCE(a.description,'')) LIKE $${params.length}
      OR LOWER(COALESCE(e.full_name,'')) LIKE $${params.length}
      OR LOWER(COALESCE(a.category,'')) LIKE $${params.length}
    )`);
  }
  const category = String(query.category || '').trim().toLowerCase();
  if (category && category !== 'all' && category !== 'all actions') {
    params.push(category);
    clauses.push(`LOWER(a.category) = $${params.length}`);
  }
  if (query.performed_by === 'system' || query.performed_by === '0') {
    clauses.push(`a.performed_by IS NULL`);
  } else if (query.performed_by) {
    params.push(Number(query.performed_by));
    clauses.push(`a.performed_by = $${params.length}`);
  }
  if (query.from) {
    params.push(String(query.from));
    clauses.push(`a.created_at >= $${params.length}::timestamptz`);
  }
  if (query.to) {
    params.push(String(query.to));
    // inclusive end-of-day if date-only
    const toVal = String(query.to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(toVal)) {
      clauses.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    } else {
      clauses.push(`a.created_at <= $${params.length}::timestamptz`);
    }
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function formatGhanaTimestamp(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Accra',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(iso || '');
  }
}

function normalizeBandsForCompare(bands) {
  return (Array.isArray(bands) ? bands : []).map((b) => ({
    from: Number(b.from) || 0,
    to: b.to == null || b.to === '' ? null : Number(b.to),
    rate: Number(b.rate) || 0,
  }));
}

function catalogueKey(item) {
  return String(item?.id || item?.name || item?.deduction_name || item?.allowance_name || '').toLowerCase();
}

async function auditCatalogueDiffs(req, beforeList, afterList, kind) {
  const beforeMap = new Map((beforeList || []).map((i) => [catalogueKey(i), i]));
  const afterMap = new Map((afterList || []).map((i) => [catalogueKey(i), i]));
  const category = kind === 'allowance' ? 'allowance' : 'deduction';

  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) {
      await auditFromReq(req, {
        action_type: kind === 'allowance' ? 'allowance_catalogue_created' : 'deduction_added',
        category,
        after_snapshot: after,
        description:
          kind === 'allowance'
            ? `Allowance catalogue item created — ${after.name || after.allowance_name} (${after.type || 'fixed'}, ${fmtGhs(after.value ?? after.default_value)})`
            : `Deduction catalogue item created — ${after.name || after.deduction_name}`,
      });
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      await auditFromReq(req, {
        action_type: kind === 'allowance' ? 'allowance_catalogue_edited' : 'deduction_edited',
        category,
        before_snapshot: before,
        after_snapshot: after,
        description:
          kind === 'allowance'
            ? `Allowance catalogue item edited — ${after.name || after.allowance_name}`
            : `Deduction catalogue item edited — ${after.name || after.deduction_name}`,
      });
    }
  }
  for (const [key, before] of beforeMap) {
    if (!afterMap.has(key)) {
      await auditFromReq(req, {
        action_type: kind === 'allowance' ? 'allowance_catalogue_deleted' : 'deduction_removed',
        category,
        before_snapshot: before,
        description:
          kind === 'allowance'
            ? `Allowance catalogue item deleted — ${before.name || before.allowance_name}`
            : `Deduction catalogue item deleted — ${before.name || before.deduction_name}`,
      });
    }
  }
}


async function safeQuery(sql, params = [], fallback = { rows: [], rowCount: 0 }) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return fallback;
    throw err;
  }
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonArrayField(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizePayrollItem(row) {
  if (!row) return row;
  const allowance_breakdown = parseJsonArrayField(row.allowance_breakdown);
  const relief_breakdown = parseJsonArrayField(row.relief_breakdown);
  const deduction_breakdown = parseJsonArrayField(row.deduction_breakdown);
  const otherFromBreakdown = deduction_breakdown.reduce((s, d) => s + Number(d.amount || 0), 0);
  return {
    ...row,
    allowance_breakdown,
    relief_breakdown,
    deduction_breakdown,
    other_deductions: Number(row.other_deductions) > 0 ? Number(row.other_deductions) : otherFromBreakdown,
  };
}

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function countWeekdays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

async function setPayrollStatus(id, status, actor) {
  if (!PAYROLL_STATUSES.includes(status)) {
    throw Object.assign(new Error(`Status must be one of: ${PAYROLL_STATUSES.join(', ')}`), { statusCode: 400 });
  }
  const extras = status === 'Approved' || status === 'Paid' ? [actor] : [null];
  const result = await pool.query(
    `UPDATE hr_payroll SET status = $1,
      approved_by = CASE WHEN $1 IN ('Approved','Paid') THEN COALESCE(approved_by, $2) ELSE approved_by END,
      approved_at = CASE WHEN $1 IN ('Approved','Paid') THEN COALESCE(approved_at, CURRENT_TIMESTAMP) ELSE approved_at END,
      paid_at = CASE WHEN $1 = 'Paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
     WHERE id = $3 RETURNING *`,
    [status, extras[0], id]
  );
  return result.rows[0] || null;
}

function publicFileUrl(filename) {
  if (!filename) return null;
  return `/uploads/${path.basename(filename)}`;
}

const employeeSelect = `
  SELECT e.*,
    m.full_name AS line_manager_name
  FROM hr_employees e
  LEFT JOIN hr_employees m ON m.full_name = e.line_manager
`;

async function getEmployeeOr404(id, res, req) {
  const result = await pool.query('SELECT * FROM hr_employees WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: 'Employee not found' });
    return null;
  }
  const emp = result.rows[0];
  // Company scope: an HR admin only manages their own company's staff — this single helper
  // backs nearly every "act on employee :id" route in this file, so gating it here closes the
  // cross-tenant gap everywhere at once instead of route-by-route.
  if (req && !isSystemAdminAccount(req.user) && (req.user?.company || 'CW') !== emp.company) {
    res.status(404).json({ error: 'Employee not found' });
    return null;
  }
  return emp;
}

/** Same company gate as getEmployeeOr404, for the many sub-resource routes (allowances,
 *  reliefs, deductions, salary advances, leave, form requests, documents...) that reference an
 *  employee by id but don't fetch the full employee row themselves. Returns true when the
 *  caller may act on this employee (true System Admin, or same company); false otherwise —
 *  callers should respond 404 (not 403) to avoid confirming the id exists in another tenant. */
async function employeeBelongsToCallerCompany(employeeId, req) {
  if (!req || isSystemAdminAccount(req.user)) return true;
  if (!employeeId) return false;
  const r = await pool.query('SELECT company FROM hr_employees WHERE id = $1', [employeeId]);
  if (r.rowCount === 0) return false;
  return (req.user?.company || 'CW') === r.rows[0].company;
}

// â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/dashboard/stats', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
    const company = req.company;
    const empClause = company ? 'AND company = $1' : '';
    const empParams = company ? [company] : [];
    const [total, onLeave, newThisMonth, payrollDue, byDept, byType, renewals, pendingLeave, pendingForms, activity, onLeavePeople] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_employees WHERE status = 'active' ${empClause}`, empParams),
      safeQuery(
        `SELECT COUNT(DISTINCT x.employee_id)::int AS n FROM (
           SELECT employee_id FROM hr_leave_applications
           WHERE status = 'Approved' AND start_date <= $1 AND end_date >= $1
           UNION
           SELECT employee_id FROM hr_leave_requests
           WHERE status = 'approved' AND start_date <= $1 AND end_date >= $1
         ) x
         JOIN hr_employees e ON e.id = x.employee_id
         ${company ? 'WHERE e.company = $2' : ''}`,
        company ? [today, company] : [today],
        { rows: [{ n: 0 }], rowCount: 1 }
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM hr_employees
         WHERE EXTRACT(YEAR FROM start_date) = $1 AND EXTRACT(MONTH FROM start_date) = $2 ${company ? 'AND company = $3' : ''}`,
        company ? [year, month, company] : [year, month]
      ),
      pool.query(`SELECT id, status, generated_at, approved_at, paid_at FROM hr_payroll WHERE month = $1 AND year = $2 ${company ? 'AND company = $3' : ''}`, company ? [month, year, company] : [month, year]),
      pool.query(
        `SELECT COALESCE(department, 'Unassigned') AS department, COUNT(*)::int AS count
         FROM hr_employees WHERE status = 'active' ${empClause} GROUP BY department ORDER BY count DESC`,
        empParams
      ),
      pool.query(
        `SELECT employment_type, COUNT(*)::int AS count
         FROM hr_employees WHERE status = 'active' ${empClause} GROUP BY employment_type`,
        empParams
      ),
      pool.query(
        `SELECT id, full_name, department, position, employment_type, contract_end_date, photo_url, status
         FROM hr_employees
         WHERE contract_end_date IS NOT NULL
           AND contract_end_date <= CURRENT_DATE + INTERVAL '60 days'
           AND status = 'active'
           ${empClause}
         ORDER BY contract_end_date ASC`,
        empParams
      ),
      safeQuery(
        `SELECT COUNT(*)::int AS n FROM hr_leave_requests lr JOIN hr_employees e ON e.id = lr.employee_id WHERE lr.status = 'pending' ${company ? 'AND e.company = $1' : ''}`,
        empParams,
        { rows: [{ n: 0 }], rowCount: 1 }
      ),
      safeQuery(
        `SELECT COUNT(*)::int AS n FROM hr_form_requests fr JOIN hr_employees e ON e.id = fr.employee_id WHERE fr.status = 'pending' ${company ? 'AND e.company = $1' : ''}`,
        empParams,
        { rows: [{ n: 0 }], rowCount: 1 }
      ),
      pool.query(
        `SELECT a.*, e.full_name AS employee_name
         FROM hr_activity a
         LEFT JOIN hr_employees e ON e.id = a.employee_id
         ${company ? 'WHERE e.id IS NULL OR e.company = $1' : ''}
         ORDER BY a.created_at DESC
         LIMIT 12`,
        empParams
      ),
      safeQuery(
        `SELECT * FROM (
           SELECT l.id, l.leave_type, l.start_date, l.end_date, e.full_name, e.photo_url
           FROM hr_leave_applications l
           JOIN hr_employees e ON e.id = l.employee_id
           WHERE l.status = 'Approved' AND l.start_date <= $1 AND l.end_date >= $1 ${company ? 'AND e.company = $2' : ''}
           UNION ALL
           SELECT r.id, r.leave_type, r.start_date, r.end_date, e.full_name, e.photo_url
           FROM hr_leave_requests r
           JOIN hr_employees e ON e.id = r.employee_id
           WHERE r.status = 'approved' AND r.start_date <= $1 AND r.end_date >= $1 ${company ? 'AND e.company = $2' : ''}
         ) x`,
        company ? [today, company] : [today],
        { rows: [], rowCount: 0 }
      ),
    ]);

    const payrollRow = payrollDue.rows[0] || null;
    res.json({
      totalEmployees: total.rows[0].n,
      onLeaveToday: onLeave.rows[0]?.n || 0,
      newThisMonth: newThisMonth.rows[0].n,
      payrollDueThisMonth: !payrollRow || payrollRow.status !== 'Paid',
      payrollStatus: payrollRow?.status || 'Not generated',
      payroll: payrollRow,
      pendingLeaveRequests: pendingLeave.rows[0]?.n || 0,
      pendingFormRequests: pendingForms.rows[0]?.n || 0,
      headcountByDepartment: byDept.rows,
      employmentTypeBreakdown: byType.rows,
      upcomingRenewals: renewals.rows,
      activity: activity.rows,
      onLeavePeople: onLeavePeople.rows,
    });
  } catch (err) {
    console.error('HR dashboard stats:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

router.get('/dashboard/activity', async (req, res) => {
  try {
    const company = req.company;
    const result = await pool.query(
      `SELECT a.*, e.full_name AS employee_name
       FROM hr_activity a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       ${company ? 'WHERE e.id IS NULL OR e.company = $1' : ''}
       ORDER BY a.created_at DESC
       LIMIT 25`,
      company ? [company] : []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR activity:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

router.get('/leave-requests', async (req, res) => {
  try {
    const { status, department, from, to } = req.query;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(String(status).toLowerCase());
      clauses.push(`r.status = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`e.department = $${params.length}`);
    }
    if (from) {
      params.push(isoDateOnly(from));
      clauses.push(`r.start_date >= $${params.length}`);
    }
    if (to) {
      params.push(isoDateOnly(to));
      clauses.push(`r.end_date <= $${params.length}`);
    }
    clauses.push(`r.current_stage IS NULL`);
    const where = `WHERE ${clauses.join(' AND ')}`;
    const result = await safeQuery(
      `SELECT r.*, e.full_name, e.department, e.photo_url, e.position
       FROM hr_leave_requests r
       LEFT JOIN hr_employees e ON e.id = r.employee_id
       ${where}
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR leave-requests:', err);
    res.json([]);
  }
});

// â”€â”€ Employees â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/employees', async (req, res) => {
  try {
    await syncPendingEmployeesFromUsers();
    const { department, employment_type, status, q } = req.query;
    const clauses = [`COALESCE(hr_review_status, 'accepted') = 'accepted'`];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`company = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`department = $${params.length}`);
    }
    if (employment_type) {
      params.push(employment_type);
      clauses.push(`employment_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q).toLowerCase()}%`);
      clauses.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(COALESCE(email,'')) LIKE $${params.length} OR LOWER(COALESCE(position,'')) LIKE $${params.length})`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const result = await pool.query(
      `SELECT * FROM hr_employees ${where} ORDER BY full_name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR list employees:', err);
    res.status(500).json({ error: 'Failed to load employees' });
  }
});

router.get('/employees/pending', async (req, res) => {
  try {
    await syncPendingEmployeesFromUsers();
    const companyClause = req.company ? 'AND e.company = $1' : '';
    const companyParams = req.company ? [req.company] : [];
    const result = await pool.query(
      `SELECT e.*, u.username, u.role AS system_role, u.unit
         FROM hr_employees e
         LEFT JOIN users u ON u.id = e.user_id
        WHERE COALESCE(e.hr_review_status, '') = 'pending' ${companyClause}
        ORDER BY e.created_at DESC, e.full_name ASC`,
      companyParams
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR pending employees:', err);
    res.status(500).json({ error: 'Failed to load pending staff' });
  }
});

router.post('/employees/:id/accept', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    if (String(emp.hr_review_status || '') !== 'pending') {
      return res.status(400).json({ error: 'This person is not waiting for HR review' });
    }
    const result = await pool.query(
      `UPDATE hr_employees
          SET hr_review_status = 'accepted', status = 'active'
        WHERE id = $1
        RETURNING *`,
      [emp.id]
    );
    const updated = result.rows[0];
    await ensureLeaveBalances(pool, updated.id);
    await logHrActivity(pool, {
      kind: 'employee_accepted',
      message: `HR accepted ${updated.full_name} as an employee`,
      employeeId: updated.id,
    });
    res.json(updated);
  } catch (err) {
    console.error('HR accept employee:', err);
    res.status(500).json({ error: 'Failed to accept staff' });
  }
});

router.post('/employees/:id/ignore', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    if (String(emp.hr_review_status || '') !== 'pending') {
      return res.status(400).json({ error: 'This person is not waiting for HR review' });
    }
    const result = await pool.query(
      `UPDATE hr_employees
          SET hr_review_status = 'ignored', status = 'ignored'
        WHERE id = $1
        RETURNING *`,
      [emp.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('HR ignore employee:', err);
    res.status(500).json({ error: 'Failed to ignore staff' });
  }
});

router.post('/employees', upload.single('photo'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.full_name?.trim()) return res.status(400).json({ error: 'Full name is required' });
    if (!String(b.start_date || '').trim()) return res.status(400).json({ error: 'Start date is required' });
    const gender = String(b.gender || '').trim().toLowerCase();
    if (gender !== 'male' && gender !== 'female') {
      return res.status(400).json({ error: 'Please select Male or Female' });
    }
    const startDate = b.start_date;
    const endDate = b.contract_end_date || null;
    if (startDate && endDate && String(endDate) < String(startDate)) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    // No unique constraint backs this table, so a double-click or a request retried by the
    // browser silently created two identical rows for the same person (same email, same
    // linked user_id, timestamps a fraction of a second apart) — block that here instead.
    const dedupeEmail = String(b.email || '').trim().toLowerCase();
    if (b.user_id || dedupeEmail) {
      const existing = await pool.query(
        `SELECT id, full_name FROM hr_employees
         WHERE ($1::int IS NOT NULL AND user_id = $1::int)
            OR ($2::text <> '' AND LOWER(email) = $2::text)
         LIMIT 1`,
        [b.user_id || null, dedupeEmail]
      );
      if (existing.rowCount > 0) {
        return res.status(409).json({ error: `An employee record already exists for this person (${existing.rows[0].full_name}).` });
      }
    }

    const photoUrl = req.file ? publicFileUrl(req.file.filename) : b.photo_url || null;
    const result = await pool.query(
      `INSERT INTO hr_employees (
        user_id, full_name, email, phone, gender, photo_url, department, position, location, employment_type,
        start_date, contract_end_date, basic_salary, allowances, emergency_contact_name,
        emergency_contact_phone, line_manager, status, hr_review_status, company
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'accepted',$19)
      RETURNING *`,
      [
        b.user_id || null,
        b.full_name.trim(),
        b.email || null,
        b.phone || null,
        gender || null,
        photoUrl,
        b.department || null,
        b.position?.trim() || 'Staff',
        b.location || null,
        b.employment_type || 'full-time',
        startDate,
        endDate,
        toNum(b.basic_salary),
        toNum(b.allowances),
        b.emergency_contact_name || null,
        b.emergency_contact_phone || null,
        b.line_manager || null,
        b.status || 'active',
        req.user.company || 'CW',
      ]
    );
    let emp = result.rows[0];
    await ensureLeaveBalances(pool, emp.id);
    await logHrActivity(pool, {
      kind: 'employee_added',
      message: `New employee added: ${emp.full_name}`,
      employeeId: emp.id,
    });

    const systemRole = b.system_role;
    let account = null;
    if (systemRole) {
      try {
        account = await provisionEmployeeUser(emp, systemRole, actorId(req), req.ip);
        const refreshed = await pool.query('SELECT * FROM hr_employees WHERE id = $1', [emp.id]);
        emp = refreshed.rows[0];
        if (account.created && account.plainPassword && emp.email) {
          const mail = await sendHrWelcomeEmail(emp.email, emp.full_name, account.plainPassword);
          account.emailed = mail.ok === true;
          if (!mail.ok) account.emailWarning = mail.error;
        }
      } catch (acctErr) {
        console.error('HR provision user:', acctErr);
        account = { error: acctErr.message || 'Failed to create system user' };
      }
    }

    if (account) delete account.plainPassword;
    res.status(201).json({ ...emp, account });
  } catch (err) {
    console.error('HR create employee:', err);
    res.status(500).json({ error: err.message || 'Failed to create employee' });
  }
});

router.get('/employees/:id/leave', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const year = toNum(req.query.year, new Date().getFullYear());
    const [history, requests, balances] = await Promise.all([
      pool.query(
        `SELECT l.*, u.username AS recorded_by_name
         FROM hr_leave_applications l
         LEFT JOIN users u ON u.id = l.recorded_by
         WHERE l.employee_id = $1 ORDER BY l.start_date DESC`,
        [emp.id]
      ),
      safeQuery(
        `SELECT * FROM hr_leave_requests WHERE employee_id = $1 ORDER BY created_at DESC`,
        [emp.id]
      ),
      pool.query(`SELECT * FROM hr_leave_balances WHERE employee_id = $1 AND year = $2`, [emp.id, year]),
    ]);
    const combined = [
      ...history.rows.map((r) => ({ ...r, source: 'hr' })),
      ...requests.rows.map((r) => ({ ...r, source: 'self', recorded_by_name: 'Self-service' })),
    ].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    res.json({ history: combined, balances: balances.rows, requests: requests.rows });
  } catch (err) {
    console.error('HR employee leave:', err);
    res.status(500).json({ error: 'Failed to load leave' });
  }
});

router.get('/employees/:id/payroll', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       WHERE i.employee_id = $1
       ORDER BY p.year DESC, p.month DESC`,
      [emp.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR employee payroll:', err);
    res.status(500).json({ error: 'Failed to load payroll' });
  }
});

router.get('/employees/:id/attendance', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const result = await pool.query(
      `SELECT * FROM hr_attendance
       WHERE employee_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3
       ORDER BY date ASC`,
      [emp.id, year, month]
    );
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const leaveMap = await leaveDatesByEmployee(start, end);
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    res.json(withLeaveAttendanceRows(result.rows, leaveSet));
  } catch (err) {
    console.error('HR employee attendance:', err);
    res.status(500).json({ error: 'Failed to load attendance' });
  }
});

router.get('/employees/:id/documents', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const result = await pool.query(
      `SELECT d.*, u.username AS uploaded_by_name
       FROM hr_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.employee_id = $1 ORDER BY d.created_at DESC`,
      [emp.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR employee documents:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

router.get('/employee-allowances/:employeeId', async (req, res) => {
  try {
    if (!(await employeeBelongsToCallerCompany(req.params.employeeId, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(await allowancesForEmployee(req.params.employeeId));
  } catch (err) {
    console.error('HR employee allowances:', err);
    res.status(500).json({ error: 'Failed to load allowances' });
  }
});

router.post('/employee-allowances', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.allowance_name) {
      return res.status(400).json({ error: 'employee and allowance name are required' });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const result = await pool.query(
      `INSERT INTO hr_employee_allowances (employee_id, allowance_name, allowance_type, value, taxable, effective_from, effective_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        b.employee_id,
        b.allowance_name,
        b.allowance_type || b.type || 'fixed',
        toNum(b.value),
        b.taxable !== false,
        b.effective_from || null,
        b.effective_to || null,
      ]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    await auditFromReq(req, {
      action_type: 'allowance_added',
      category: 'allowance',
      employee_id: row.employee_id,
      after_snapshot: row,
      description: `${row.allowance_name} added for ${emp?.full_name || 'employee'} — ${fmtGhs(row.value)}${row.allowance_type === 'percent' ? '%' : '/month'} (${row.taxable ? 'Taxable' : 'Non-taxable'})`,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('HR create allowance:', err);
    res.status(500).json({ error: 'Failed to save allowance' });
  }
});

router.put('/employee-allowances/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const existing = await pool.query(`SELECT * FROM hr_employee_allowances WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Allowance not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Allowance not found' });
    }
    const before = existing.rows[0];
    const result = await pool.query(
      `UPDATE hr_employee_allowances SET
         allowance_name = COALESCE($1, allowance_name),
         allowance_type = COALESCE($2, allowance_type),
         value = COALESCE($3, value),
         taxable = COALESCE($4, taxable),
         effective_from = COALESCE($5, effective_from),
         effective_to = COALESCE($6, effective_to)
       WHERE id = $7 RETURNING *`,
      [b.allowance_name, b.allowance_type || b.type, b.value != null ? toNum(b.value) : null, b.taxable, b.effective_from, b.effective_to, req.params.id]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    await auditFromReq(req, {
      action_type: 'allowance_edited',
      category: 'allowance',
      employee_id: row.employee_id,
      before_snapshot: before,
      after_snapshot: row,
      description: `${row.allowance_name} edited for ${emp?.full_name || 'employee'} — ${fmtGhs(before.value)} → ${fmtGhs(row.value)}`,
    });
    res.json(row);
  } catch (err) {
    console.error('HR update allowance:', err);
    res.status(500).json({ error: 'Failed to update allowance' });
  }
});

router.delete('/employee-allowances/:id', async (req, res) => {
  try {
    const existing = await pool.query(`SELECT * FROM hr_employee_allowances WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Allowance not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Allowance not found' });
    }
    const before = existing.rows[0];
    await pool.query(`DELETE FROM hr_employee_allowances WHERE id = $1`, [req.params.id]);
    const emp = await employeeBrief(before.employee_id);
    await auditFromReq(req, {
      action_type: 'allowance_removed',
      category: 'allowance',
      employee_id: before.employee_id,
      before_snapshot: before,
      description: `${before.allowance_name} removed from ${emp?.full_name || 'employee'}`,
    });
    res.status(204).end();
  } catch (err) {
    console.error('HR delete allowance:', err);
    res.status(500).json({ error: 'Failed to delete allowance' });
  }
});

router.get('/employee-reliefs/:employeeId', async (req, res) => {
  try {
    if (!(await employeeBelongsToCallerCompany(req.params.employeeId, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const result = await pool.query(
      `SELECT * FROM hr_employee_reliefs WHERE employee_id = $1 ORDER BY id`,
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR employee reliefs:', err);
    res.status(500).json({ error: 'Failed to load reliefs' });
  }
});

router.post('/employee-reliefs', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.relief_name) {
      return res.status(400).json({ error: 'employee and relief name are required' });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const annual = toNum(b.annual_amount);
    const monthly = b.monthly_amount != null ? toNum(b.monthly_amount) : roundMoney(annual / 12);
    const result = await pool.query(
      `INSERT INTO hr_employee_reliefs
         (employee_id, relief_name, annual_amount, monthly_amount, is_active, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.employee_id, b.relief_name, annual, monthly, b.is_active !== false, b.notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('HR create relief:', err);
    res.status(500).json({ error: 'Failed to save relief' });
  }
});

router.put('/employee-reliefs/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const existing = await pool.query(`SELECT * FROM hr_employee_reliefs WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Relief not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Relief not found' });
    }
    const cur = existing.rows[0];
    const annual = b.annual_amount != null ? toNum(b.annual_amount) : Number(cur.annual_amount);
    const monthly = b.monthly_amount != null ? toNum(b.monthly_amount) : roundMoney(annual / 12);
    const result = await pool.query(
      `UPDATE hr_employee_reliefs SET
         relief_name = COALESCE($1, relief_name),
         annual_amount = $2,
         monthly_amount = $3,
         is_active = COALESCE($4, is_active),
         notes = COALESCE($5, notes),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [b.relief_name, annual, monthly, b.is_active, b.notes, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('HR update relief:', err);
    res.status(500).json({ error: 'Failed to update relief' });
  }
});

router.delete('/employee-reliefs/:id', async (req, res) => {
  try {
    const existing = await pool.query(`SELECT employee_id FROM hr_employee_reliefs WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Relief not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Relief not found' });
    }
    const result = await pool.query(`DELETE FROM hr_employee_reliefs WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Relief not found' });
    res.status(204).end();
  } catch (err) {
    console.error('HR delete relief:', err);
    res.status(500).json({ error: 'Failed to delete relief' });
  }
});

router.get('/employee-deductions/:employeeId', async (req, res) => {
  try {
    if (!(await employeeBelongsToCallerCompany(req.params.employeeId, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const result = await pool.query(
      `SELECT * FROM hr_employee_deductions WHERE employee_id = $1 ORDER BY id`,
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR employee deductions:', err);
    res.status(500).json({ error: 'Failed to load deductions' });
  }
});

router.post('/employee-deductions', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.deduction_name) {
      return res.status(400).json({ error: 'employee and deduction name are required' });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const isLoan = !!b.is_loan;
    const totalLoan = isLoan ? toNum(b.total_loan_amount) : null;
    const remaining = isLoan
      ? b.remaining_balance != null
        ? toNum(b.remaining_balance)
        : totalLoan
      : null;
    const result = await pool.query(
      `INSERT INTO hr_employee_deductions
         (employee_id, deduction_name, deduction_type, value, is_loan, total_loan_amount,
          remaining_balance, auto_stop, is_active, effective_from, effective_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        b.employee_id,
        b.deduction_name,
        b.deduction_type || b.type || 'fixed',
        toNum(b.value),
        isLoan,
        totalLoan,
        remaining,
        b.auto_stop !== false,
        b.is_active !== false,
        b.effective_from || null,
        b.effective_to || null,
      ]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    if (isLoan) {
      await auditFromReq(req, {
        action_type: 'loan_created',
        category: 'loan',
        employee_id: row.employee_id,
        after_snapshot: row,
        description: `Loan created for ${emp?.full_name || 'employee'} — amount ${fmtGhs(totalLoan)}, monthly deduction ${fmtGhs(row.value)}`,
      });
    } else {
      await auditFromReq(req, {
        action_type: 'deduction_added',
        category: 'deduction',
        employee_id: row.employee_id,
        after_snapshot: row,
        description: `${row.deduction_name} added for ${emp?.full_name || 'employee'} — ${fmtGhs(row.value)} (${row.deduction_type})`,
      });
    }
    res.status(201).json(row);
  } catch (err) {
    console.error('HR create deduction:', err);
    res.status(500).json({ error: 'Failed to save deduction' });
  }
});

router.put('/employee-deductions/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const existing = await pool.query(`SELECT * FROM hr_employee_deductions WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Deduction not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Deduction not found' });
    }
    const cur = existing.rows[0];
    const result = await pool.query(
      `UPDATE hr_employee_deductions SET
         deduction_name = COALESCE($1, deduction_name),
         deduction_type = COALESCE($2, deduction_type),
         value = COALESCE($3, value),
         is_loan = COALESCE($4, is_loan),
         total_loan_amount = COALESCE($5, total_loan_amount),
         remaining_balance = COALESCE($6, remaining_balance),
         auto_stop = COALESCE($7, auto_stop),
         is_active = COALESCE($8, is_active),
         effective_from = COALESCE($9, effective_from),
         effective_to = COALESCE($10, effective_to),
         updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [
        b.deduction_name,
        b.deduction_type || b.type,
        b.value != null ? toNum(b.value) : null,
        b.is_loan,
        b.total_loan_amount != null ? toNum(b.total_loan_amount) : null,
        b.remaining_balance != null ? toNum(b.remaining_balance) : null,
        b.auto_stop,
        b.is_active,
        b.effective_from,
        b.effective_to,
        req.params.id,
      ]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    const wasActive = cur.is_active !== false;
    const nowActive = row.is_active !== false;
    if (wasActive !== nowActive) {
      await auditFromReq(req, {
        action_type: nowActive ? 'deduction_activated' : 'deduction_deactivated',
        category: 'deduction',
        employee_id: row.employee_id,
        before_snapshot: cur,
        after_snapshot: row,
        description: `${row.deduction_name} ${nowActive ? 'activated' : 'deactivated'} for ${emp?.full_name || 'employee'}`,
      });
    } else {
      await auditFromReq(req, {
        action_type: 'deduction_edited',
        category: row.is_loan ? 'loan' : 'deduction',
        employee_id: row.employee_id,
        before_snapshot: cur,
        after_snapshot: row,
        description: `${row.deduction_name} edited for ${emp?.full_name || 'employee'} — ${fmtGhs(cur.value)} → ${fmtGhs(row.value)}`,
      });
    }
    res.json(row);
  } catch (err) {
    console.error('HR update deduction:', err);
    res.status(500).json({ error: 'Failed to update deduction' });
  }
});

router.delete('/employee-deductions/:id', async (req, res) => {
  try {
    const existing = await pool.query(`SELECT * FROM hr_employee_deductions WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Deduction not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Deduction not found' });
    }
    const before = existing.rows[0];
    await pool.query(`DELETE FROM hr_employee_deductions WHERE id = $1`, [req.params.id]);
    const emp = await employeeBrief(before.employee_id);
    await auditFromReq(req, {
      action_type: 'deduction_removed',
      category: before.is_loan ? 'loan' : 'deduction',
      employee_id: before.employee_id,
      before_snapshot: before,
      description: `${before.deduction_name} removed from ${emp?.full_name || 'employee'}`,
    });
    res.status(204).end();
  } catch (err) {
    console.error('HR delete deduction:', err);
    res.status(500).json({ error: 'Failed to delete deduction' });
  }
});

// ── Salary Advances / Staff Loans ────────────────────────────────────────────

router.get('/salary-advances/summary', async (req, res) => {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const company = req.company;
    const [counts, recovered] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE a.status = 'active')::int AS active_loans,
          COALESCE(SUM(a.remaining_balance) FILTER (WHERE a.status = 'active'), 0)::float AS outstanding,
          COUNT(*) FILTER (WHERE a.status = 'settled')::int AS fully_repaid
        FROM hr_salary_advances a
        JOIN hr_employees e ON e.id = a.employee_id
        ${company ? 'WHERE e.company = $1' : ''}
      `, company ? [company] : []),
      pool.query(
        `SELECT COALESCE(SUM(r.amount_deducted), 0)::float AS recovered
         FROM hr_salary_advance_repayments r
         JOIN hr_salary_advances a ON a.id = r.advance_id
         JOIN hr_employees e ON e.id = a.employee_id
         WHERE r.month = $1 AND r.year = $2 ${company ? 'AND e.company = $3' : ''}`,
        company ? [month, year, company] : [month, year]
      ),
    ]);
    const c = counts.rows[0] || {};
    res.json({
      active_loans: c.active_loans || 0,
      outstanding_balance: Number(c.outstanding || 0),
      recovered_this_month: Number(recovered.rows[0]?.recovered || 0),
      fully_repaid: c.fully_repaid || 0,
    });
  } catch (err) {
    console.error('HR advances summary:', err);
    res.status(500).json({ error: 'Failed to load advances summary' });
  }
});

router.get('/salary-advances', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : null;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`a.status = $${params.length}`);
    }
    if (employeeId) {
      params.push(employeeId);
      clauses.push(`a.employee_id = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT a.*, e.full_name, e.department, e.photo_url, e.basic_salary
       FROM hr_salary_advances a
       JOIN hr_employees e ON e.id = a.employee_id
       ${where}
       ORDER BY
         CASE a.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
         a.created_at DESC`,
      params
    );
    res.json(result.rows.map((r) => ({ ...mapAdvance(r), full_name: r.full_name, department: r.department, photo_url: r.photo_url })));
  } catch (err) {
    console.error('HR list advances:', err);
    res.status(500).json({ error: 'Failed to load salary advances' });
  }
});

router.get('/salary-advances/:id', async (req, res) => {
  try {
    const adv = await pool.query(
      `SELECT a.*, e.full_name, e.department, e.position, e.photo_url, e.basic_salary, e.email, e.company
       FROM hr_salary_advances a
       JOIN hr_employees e ON e.id = a.employee_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (adv.rowCount === 0) return res.status(404).json({ error: 'Advance not found' });
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== adv.rows[0].company) {
      return res.status(404).json({ error: 'Advance not found' });
    }
    const repayments = await pool.query(
      `SELECT r.*, p.status AS payroll_status
       FROM hr_salary_advance_repayments r
       LEFT JOIN hr_payroll p ON p.id = r.payroll_id
       WHERE r.advance_id = $1
       ORDER BY r.year DESC, r.month DESC, r.id DESC`,
      [req.params.id]
    );
    const row = adv.rows[0];
    res.json({
      ...mapAdvance(row),
      full_name: row.full_name,
      department: row.department,
      position: row.position,
      photo_url: row.photo_url,
      basic_salary: row.basic_salary,
      email: row.email,
      repayments: repayments.rows,
    });
  } catch (err) {
    console.error('HR advance detail:', err);
    res.status(500).json({ error: 'Failed to load advance' });
  }
});

router.post('/salary-advances', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.loan_amount || !b.monthly_deduction) {
      return res.status(400).json({ error: 'employee, loan amount, and monthly deduction are required' });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const loanAmount = toNum(b.loan_amount);
    const monthly = toNum(b.monthly_deduction);
    const now = new Date();
    const startMonth = toNum(b.start_month, now.getMonth() + 1);
    const startYear = toNum(b.start_year, now.getFullYear());
    if (loanAmount <= 0 || monthly <= 0) {
      return res.status(400).json({ error: 'Loan amount and monthly deduction must be greater than zero' });
    }
    const result = await pool.query(
      `INSERT INTO hr_salary_advances
         (employee_id, loan_amount, monthly_deduction, remaining_balance, paid_so_far,
          start_month, start_year, notes, auto_stop, status, created_by)
       VALUES ($1,$2,$3,$2,0,$4,$5,$6,$7,'active',$8) RETURNING *`,
      [
        b.employee_id,
        loanAmount,
        monthly,
        startMonth,
        startYear,
        b.notes || null,
        b.auto_stop !== false,
        actorId(req),
      ]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    await auditFromReq(req, {
      action_type: 'loan_created',
      category: 'loan',
      employee_id: row.employee_id,
      after_snapshot: row,
      description: `Loan created for ${emp?.full_name || 'employee'} — amount ${fmtGhs(loanAmount)}, monthly deduction ${fmtGhs(monthly)}`,
      payroll_month: startMonth,
      payroll_year: startYear,
    });
    res.status(201).json(mapAdvance(row));
  } catch (err) {
    console.error('HR create advance:', err);
    res.status(500).json({ error: 'Failed to create salary advance' });
  }
});

router.patch('/salary-advances/:id/status', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'paused', 'settled'].includes(status)) {
      return res.status(400).json({ error: 'status must be active, paused, or settled' });
    }
    const existing = await pool.query(`SELECT * FROM hr_salary_advances WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Advance not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Advance not found' });
    }
    const before = existing.rows[0];
    const result = await pool.query(
      `UPDATE hr_salary_advances SET
         status = $1,
         remaining_balance = CASE WHEN $1 = 'settled' THEN 0 ELSE remaining_balance END,
         updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    const row = result.rows[0];
    const emp = await employeeBrief(row.employee_id);
    let action_type = 'loan_resumed';
    let description = `Loan resumed for ${emp?.full_name || 'employee'} — remaining ${fmtGhs(row.remaining_balance)}`;
    if (status === 'paused') {
      action_type = 'loan_paused';
      description = `Loan paused for ${emp?.full_name || 'employee'} — remaining balance at pause ${fmtGhs(before.remaining_balance)}`;
    } else if (status === 'settled') {
      action_type = 'loan_settled_manually';
      description = `Loan marked settled for ${emp?.full_name || 'employee'} — remaining at settlement ${fmtGhs(before.remaining_balance)}`;
    }
    await auditFromReq(req, {
      action_type,
      category: 'loan',
      employee_id: row.employee_id,
      before_snapshot: before,
      after_snapshot: row,
      description,
      payroll_month: row.start_month,
      payroll_year: row.start_year,
    });
    res.json(mapAdvance(row));
  } catch (err) {
    console.error('HR advance status:', err);
    res.status(500).json({ error: 'Failed to update advance status' });
  }
});

router.get('/employees/:id', async (req, res) => {
  try {
    const [result, docs] = await Promise.all([
      pool.query(
        `SELECT e.*,
                u.status AS user_status,
                u.username AS user_username,
                u.role AS user_role,
                u.main_role AS user_main_role,
                u.deleted_at AS user_deleted_at
         FROM hr_employees e
         LEFT JOIN users u ON u.id = e.user_id
         WHERE e.id = $1`,
        [req.params.id]
      ),
      pool.query(`SELECT category, document_name FROM hr_documents WHERE employee_id = $1`, [req.params.id]),
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    const emp = result.rows[0];
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== emp.company) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const blob = docs.rows.map((d) => `${d.category} ${d.document_name}`).join(' ');
    res.json({
      ...emp,
      system_role: emp.user_main_role || emp.user_role || '',
      document_flags: {
        national_id: /id|national/i.test(blob),
        contract: /contract/i.test(blob),
        passport_photo: !!emp.photo_url,
        emergency_contact: !!(emp.emergency_contact_name && emp.emergency_contact_phone),
      },
    });
  } catch (err) {
    console.error('HR get employee:', err);
    res.status(500).json({ error: 'Failed to load employee' });
  }
});

router.put('/employees/:id', upload.single('photo'), async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const b = req.body || {};
    if (b.start_date !== undefined && !String(b.start_date || '').trim()) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    const genderRaw = b.gender === undefined ? emp.gender : String(b.gender || '').trim().toLowerCase();
    if (genderRaw && genderRaw !== 'male' && genderRaw !== 'female') {
      return res.status(400).json({ error: 'Gender must be Male or Female' });
    }
    const startDate = b.start_date ?? emp.start_date;
    const endDate = b.contract_end_date === undefined ? emp.contract_end_date : b.contract_end_date || null;
    if (startDate && endDate && String(endDate).slice(0, 10) < String(startDate).slice(0, 10)) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }
    const photoUrl = req.file ? publicFileUrl(req.file.filename) : b.photo_url ?? emp.photo_url;
    const result = await pool.query(
      `UPDATE hr_employees SET
        user_id = COALESCE($1, user_id),
        full_name = COALESCE($2, full_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        gender = $5,
        photo_url = $6,
        department = COALESCE($7, department),
        position = COALESCE($8, position),
        location = COALESCE($9, location),
        employment_type = COALESCE($10, employment_type),
        start_date = COALESCE($11, start_date),
        contract_end_date = $12,
        basic_salary = COALESCE($13, basic_salary),
        allowances = COALESCE($14, allowances),
        emergency_contact_name = COALESCE($15, emergency_contact_name),
        emergency_contact_phone = COALESCE($16, emergency_contact_phone),
        line_manager = COALESCE($17, line_manager),
        status = COALESCE($18, status)
       WHERE id = $19 RETURNING *`,
      [
        b.user_id ?? emp.user_id,
        b.full_name?.trim() || emp.full_name,
        b.email ?? emp.email,
        b.phone ?? emp.phone,
        genderRaw || null,
        photoUrl,
        b.department ?? emp.department,
        b.position?.trim() || emp.position || 'Staff',
        b.location ?? emp.location,
        b.employment_type ?? emp.employment_type,
        b.start_date ?? emp.start_date,
        endDate,
        b.basic_salary != null ? toNum(b.basic_salary) : emp.basic_salary,
        b.allowances != null ? toNum(b.allowances) : emp.allowances,
        b.emergency_contact_name ?? emp.emergency_contact_name,
        b.emergency_contact_phone ?? emp.emergency_contact_phone,
        b.line_manager ?? emp.line_manager,
        String(emp.status).toLowerCase() === 'suspended' && String(b.status || '').toLowerCase() === 'active'
          ? emp.status
          : (b.status ?? emp.status),
        emp.id,
      ]
    );
    const updated = result.rows[0];
    const oldSalary = Number(emp.basic_salary || 0);
    const newSalary = Number(updated.basic_salary || 0);
    if (b.basic_salary != null && Math.abs(oldSalary - newSalary) > 0.0001) {
      const pct = oldSalary > 0 ? ((newSalary - oldSalary) / oldSalary) * 100 : null;
      const isIncrement = newSalary > oldSalary && pct != null && pct >= 0.01;
      await auditFromReq(req, {
        action_type: isIncrement ? 'salary_increment_applied' : 'salary_changed',
        category: 'salary',
        employee_id: updated.id,
        before_snapshot: { basic_salary: oldSalary, employee: emp },
        after_snapshot: { basic_salary: newSalary, employee: updated },
        description: isIncrement
          ? `Salary increment for ${updated.full_name} — ${fmtGhs(oldSalary)} → ${fmtGhs(newSalary)} (${pct.toFixed(2)}%)`
          : `Basic salary changed for ${updated.full_name} — ${fmtGhs(oldSalary)} → ${fmtGhs(newSalary)}`,
      });
    }
    if (b.system_role) {
      try {
        await provisionEmployeeUser(updated, b.system_role, actorId(req), req.ip);
      } catch (acctErr) {
        console.error('HR update provision user:', acctErr);
      }
    }
    await syncEmployeeUserStatus(updated);
    res.json(updated);
  } catch (err) {
    console.error('HR update employee:', err);
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    await pool.query(`UPDATE hr_employees SET status = 'inactive' WHERE id = $1`, [emp.id]);
    await syncEmployeeUserStatus({ ...emp, status: 'inactive' });
    res.json({ message: 'Employee deactivated', id: emp.id });
  } catch (err) {
    console.error('HR delete employee:', err);
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
});

router.post('/employees/:id/suspend', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ error: 'A suspend reason is required' });
    if (String(emp.status).toLowerCase() === 'suspended') {
      return res.status(400).json({ error: 'Employee is already suspended' });
    }
    await suspendEmployeeAccount(emp, reason);
    await logHrActivity(pool, {
      kind: 'employee_suspended',
      message: `${emp.full_name} was suspended`,
      employeeId: emp.id,
      meta: { reason },
    });
    const updated = await pool.query('SELECT * FROM hr_employees WHERE id = $1', [emp.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('HR suspend employee:', err);
    res.status(500).json({ error: 'Failed to suspend employee' });
  }
});

router.post('/employees/:id/unsuspend', async (req, res) => {
  try {
    const emp = await getEmployeeOr404(req.params.id, res, req);
    if (!emp) return;
    const reason = String(req.body?.reason || '').trim();
    if (reason.length < 3) return res.status(400).json({ error: 'An unsuspend reason is required' });
    if (String(emp.status).toLowerCase() !== 'suspended') {
      return res.status(400).json({ error: 'Employee is not suspended' });
    }
    await unsuspendEmployeeAccount(emp, reason);
    await logHrActivity(pool, {
      kind: 'employee_unsuspended',
      message: `${emp.full_name} was restored`,
      employeeId: emp.id,
      meta: { reason },
    });
    const updated = await pool.query('SELECT * FROM hr_employees WHERE id = $1', [emp.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('HR unsuspend employee:', err);
    res.status(500).json({ error: 'Failed to unsuspend employee' });
  }
});

// â”€â”€ Leave â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/leave/balances', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const company = req.company;
    const result = await pool.query(
      `SELECT e.id AS employee_id, e.full_name, e.department, e.photo_url, e.status,
              b.leave_type, b.year, b.total_days, b.used_days,
              GREATEST(b.total_days - b.used_days, 0) AS remaining_days
       FROM hr_employees e
       JOIN hr_leave_balances b ON b.employee_id = e.id AND b.year = $1
       WHERE e.status = 'active' ${company ? 'AND e.company = $2' : ''}
       ORDER BY e.full_name, b.leave_type`,
      company ? [year, company] : [year]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR leave balances:', err);
    res.status(500).json({ error: 'Failed to load leave balances' });
  }
});

router.get('/leave/calendar', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
    const company = req.company;
    const result = await safeQuery(
      `SELECT * FROM (
         SELECT l.id, l.employee_id, l.leave_type, l.start_date, l.end_date, l.days, l.status,
                e.full_name, e.department, e.photo_url
         FROM hr_leave_applications l
         JOIN hr_employees e ON e.id = l.employee_id
         WHERE l.status = 'Approved' AND l.start_date <= $2 AND l.end_date >= $1 ${company ? 'AND e.company = $3' : ''}
         UNION ALL
         SELECT r.id, r.employee_id, r.leave_type, r.start_date, r.end_date, r.days, r.status,
                e.full_name, e.department, e.photo_url
         FROM hr_leave_requests r
         JOIN hr_employees e ON e.id = r.employee_id
         WHERE r.status = 'approved' AND r.start_date <= $2 AND r.end_date >= $1 ${company ? 'AND e.company = $3' : ''}
       ) x
       ORDER BY start_date`,
      company ? [start, endDate, company] : [start, endDate]
    );
    res.json({ year, month, leaves: result.rows });
  } catch (err) {
    console.error('HR leave calendar:', err);
    res.status(500).json({ error: 'Failed to load leave calendar' });
  }
});

router.get('/leave', async (req, res) => {
  try {
    const { employee_id, leave_type, status, from, to } = req.query;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      clauses.push(`l.employee_id = $${params.length}`);
    }
    if (leave_type) {
      params.push(leave_type);
      clauses.push(`l.leave_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      clauses.push(`l.status = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`l.end_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`l.start_date <= $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT l.*, e.full_name, e.department, e.photo_url, u.username AS recorded_by_name
       FROM hr_leave_applications l
       JOIN hr_employees e ON e.id = l.employee_id
       LEFT JOIN users u ON u.id = l.recorded_by
       ${where}
       ORDER BY l.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR leave list:', err);
    res.status(500).json({ error: 'Failed to load leave applications' });
  }
});

router.post('/leave', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.leave_type || !b.start_date || !b.end_date) {
      return res.status(400).json({ error: 'employee, leave type, start and end dates are required' });
    }
    if (!LEAVE_TYPES.includes(b.leave_type)) {
      return res.status(400).json({ error: `Invalid leave type. Use: ${LEAVE_TYPES.join(', ')}` });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const days = b.days != null ? toNum(b.days) : countWeekdays(b.start_date, b.end_date);
    const status = b.status || 'Pending';
    const result = await pool.query(
      `INSERT INTO hr_leave_applications (employee_id, leave_type, start_date, end_date, days, status, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.employee_id, b.leave_type, b.start_date, b.end_date, days, status, b.notes || null, actorId(req)]
    );
    const year = new Date(b.start_date).getFullYear();
    await ensureLeaveBalances(pool, b.employee_id, year);
    if (status === 'Approved') {
      await pool.query(
        `UPDATE hr_leave_balances SET used_days = used_days + $1
         WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
        [days, b.employee_id, b.leave_type, year]
      );
      await markLeaveAttendance(b.employee_id, b.start_date, b.end_date);
    }
    await logHrActivity(pool, {
      kind: 'leave_recorded',
      message: `Leave request recorded (${b.leave_type}, ${status})`,
      employeeId: Number(b.employee_id),
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('HR create leave:', err);
    res.status(500).json({ error: 'Failed to record leave' });
  }
});

router.put('/leave/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM hr_leave_applications WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Leave record not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Leave record not found' });
    }
    const prev = existing.rows[0];
    const b = req.body || {};
    const start = b.start_date || prev.start_date;
    const end = b.end_date || prev.end_date;
    const days = b.days != null ? toNum(b.days) : countWeekdays(start, end);
    const status = b.status || prev.status;
    const leaveType = b.leave_type || prev.leave_type;
    const year = new Date(start).getFullYear();

    if (prev.status === 'Approved' && status !== 'Approved') {
      await pool.query(
        `UPDATE hr_leave_balances SET used_days = GREATEST(used_days - $1, 0)
         WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
        [prev.days, prev.employee_id, prev.leave_type, new Date(prev.start_date).getFullYear()]
      );
    }
    if (prev.status !== 'Approved' && status === 'Approved') {
      await ensureLeaveBalances(pool, prev.employee_id, year);
      await pool.query(
        `UPDATE hr_leave_balances SET used_days = used_days + $1
         WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
        [days, prev.employee_id, leaveType, year]
      );
      await markLeaveAttendance(prev.employee_id, start, end);
    }

    const result = await pool.query(
      `UPDATE hr_leave_applications SET
        leave_type = $1, start_date = $2, end_date = $3, days = $4, status = $5, notes = COALESCE($6, notes)
       WHERE id = $7 RETURNING *`,
      [leaveType, start, end, days, status, b.notes, prev.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('HR update leave:', err);
    res.status(500).json({ error: 'Failed to update leave' });
  }
});

// â”€â”€ Payroll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const generatePayroll = async (req, res) => {
  try {
    const now = new Date();
    const month = toNum(req.body?.month, now.getMonth() + 1);
    const year = toNum(req.body?.year, now.getFullYear());
    if (month < 1 || month > 12) return res.status(400).json({ error: 'Invalid month' });
    const overrides = Array.isArray(req.body?.employee_overrides) ? req.body.employee_overrides : [];
    const overrideMap = new Map(overrides.map((o) => [Number(o.employee_id), o]));
    const asOf = `${year}-${String(month).padStart(2, '0')}-01`;
    const settings = await getPayrollSettings();
    // Payroll runs are per-company — without this, PTEL's HR generating payroll for a month
    // would find/reuse C&W's payroll row for the same month/year and mix both companies'
    // employees into one run. Real gap found and closed while wiring HR company filtering.
    const runCompany = req.user.company || 'CW';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(`SELECT id FROM hr_payroll WHERE month = $1 AND year = $2 AND company = $3`, [month, year, runCompany]);
      let payrollId;
      const wasRegenerate = existing.rowCount > 0;
      if (existing.rowCount > 0) {
        payrollId = existing.rows[0].id;
        // Reverse prior advance repayments for this payroll run
        const prevRepay = await client.query(
          `SELECT * FROM hr_salary_advance_repayments WHERE payroll_id = $1`,
          [payrollId]
        );
        for (const r of prevRepay.rows) {
          await client.query(
            `UPDATE hr_salary_advances SET
               remaining_balance = remaining_balance + $1,
               paid_so_far = GREATEST(0, paid_so_far - $1),
               status = CASE WHEN status = 'settled' THEN 'active' ELSE status END,
               updated_at = NOW()
             WHERE id = $2`,
            [Number(r.amount_deducted), r.advance_id]
          );
        }
        await client.query(`DELETE FROM hr_salary_advance_repayments WHERE payroll_id = $1`, [payrollId]);

        const prevItems = await client.query(
          `SELECT deduction_breakdown FROM hr_payroll_items WHERE payroll_id = $1`,
          [payrollId]
        );
        for (const item of prevItems.rows) {
          const breakdown =
            typeof item.deduction_breakdown === 'string'
              ? JSON.parse(item.deduction_breakdown || '[]')
              : Array.isArray(item.deduction_breakdown)
                ? item.deduction_breakdown
                : [];
          for (const d of breakdown) {
            if (!d?.is_loan || d.is_advance || !d.id || !Number(d.amount)) continue;
            await client.query(
              `UPDATE hr_employee_deductions SET
                 remaining_balance = COALESCE(remaining_balance, 0) + $1,
                 is_active = TRUE,
                 updated_at = NOW()
               WHERE id = $2`,
              [Number(d.amount), d.id]
            );
          }
        }
        await client.query(`DELETE FROM hr_payroll_items WHERE payroll_id = $1`, [payrollId]);
        await client.query(
          `UPDATE hr_payroll SET status = 'Draft', generated_by = $1, generated_at = CURRENT_TIMESTAMP,
            approved_by = NULL, approved_at = NULL, paid_at = NULL WHERE id = $2`,
          [actorId(req), payrollId]
        );
      } else {
        const created = await client.query(
          `INSERT INTO hr_payroll (month, year, status, generated_by, company) VALUES ($1,$2,'Draft',$3,$4) RETURNING id`,
          [month, year, actorId(req), runCompany]
        );
        payrollId = created.rows[0].id;
      }

      const employees = await client.query(`SELECT * FROM hr_employees WHERE status = 'active' AND company = $1`, [runCompany]);
      const empIds = employees.rows.map((e) => e.id);
      const [allowMap, reliefMap, deductionMap, advanceMap] = await Promise.all([
        allowancesByEmployeeIds(empIds, asOf),
        reliefsByEmployeeIds(empIds),
        deductionsByEmployeeIds(empIds, asOf),
        advancesByEmployeeIds(empIds, month, year),
      ]);
      const items = [];
      for (const emp of employees.rows) {
        const ov = overrideMap.get(Number(emp.id));
        if (ov && ov.included === false) continue;
        const extra = Array.isArray(ov?.additional_allowances) ? ov.additional_allowances : [];
        const calc = calculateNetPay(
          emp,
          mergeAllowances(allowMap.get(Number(emp.id)) || [], extra),
          settings,
          {
            reliefs: reliefMap.get(Number(emp.id)) || [],
            deductions: deductionMap.get(Number(emp.id)) || [],
            advances: advanceMap.get(Number(emp.id)) || [],
          }
        );
        const inserted = await client.query(
          `INSERT INTO hr_payroll_items (
            payroll_id, employee_id, basic_salary, allowances, gross,
            ssnit_employer, ssnit_employee, taxable_income, paye, net_pay,
            allowance_breakdown, reliefs_total, other_deductions, relief_breakdown, deduction_breakdown
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15::jsonb) RETURNING *`,
          [
            payrollId,
            emp.id,
            calc.basic_salary,
            calc.allowances,
            calc.gross_pay,
            calc.ssnit_employer,
            calc.ssnit_employee,
            calc.taxable_income,
            calc.paye,
            calc.net_pay,
            JSON.stringify(calc.allowance_breakdown || []),
            calc.reliefs_total || 0,
            calc.other_deductions || 0,
            JSON.stringify(calc.relief_breakdown || []),
            JSON.stringify(calc.deduction_breakdown || []),
          ]
        );
        for (const loan of calc.loan_updates || []) {
          await client.query(
            `UPDATE hr_employee_deductions SET
               remaining_balance = $1,
               is_active = CASE WHEN $2 THEN FALSE ELSE is_active END,
               updated_at = NOW()
             WHERE id = $3`,
            [loan.remaining_balance, !!loan.deactivate, loan.id]
          );
          await auditSystem({
            action_type: loan.deactivate ? 'loan_auto_completed' : 'loan_repayment_recorded',
            category: 'loan',
            employee_id: emp.id,
            after_snapshot: {
              deduction_id: loan.id,
              amount_deducted: loan.amount_deducted ?? loan.amount,
              remaining_balance: loan.remaining_balance,
              deactivate: !!loan.deactivate,
            },
            description: loan.deactivate
              ? `Loan auto-completed for ${emp.full_name} — final amount deducted ${fmtGhs(loan.amount_deducted ?? loan.amount)}`
              : `Loan repayment deducted — ${fmtGhs(loan.amount_deducted ?? loan.amount)}, Remaining: ${fmtGhs(loan.remaining_balance)}`,
            payroll_month: month,
            payroll_year: year,
          });
        }
        for (const adv of calc.advance_updates || []) {
          await client.query(
            `UPDATE hr_salary_advances SET
               remaining_balance = $1,
               paid_so_far = $2,
               status = CASE WHEN $3 THEN 'settled' ELSE status END,
               updated_at = NOW()
             WHERE id = $4`,
            [adv.remaining_balance, adv.paid_so_far, !!adv.settle, adv.id]
          );
          await client.query(
            `INSERT INTO hr_salary_advance_repayments
               (advance_id, payroll_id, month, year, amount_deducted, remaining_after)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [adv.id, payrollId, month, year, adv.amount_deducted, adv.remaining_balance]
          );
          await auditSystem({
            action_type: adv.settle ? 'loan_auto_completed' : 'loan_repayment_recorded',
            category: 'loan',
            employee_id: emp.id,
            after_snapshot: {
              advance_id: adv.id,
              amount_deducted: adv.amount_deducted,
              remaining_balance: adv.remaining_balance,
              paid_so_far: adv.paid_so_far,
              settle: !!adv.settle,
            },
            description: adv.settle
              ? `Loan auto-completed for ${emp.full_name} — final amount deducted ${fmtGhs(adv.amount_deducted)}`
              : `Loan repayment deducted — ${fmtGhs(adv.amount_deducted)}, Remaining: ${fmtGhs(adv.remaining_balance)}`,
            payroll_month: month,
            payroll_year: year,
          });
        }
        items.push({ ...inserted.rows[0], full_name: emp.full_name, department: emp.department, position: emp.position });
      }
      await client.query('COMMIT');
      await logHrActivity(pool, {
        kind: 'payslip_generated',
        message: `Payroll generated for ${month}/${year}`,
      });
      const payroll = await pool.query('SELECT * FROM hr_payroll WHERE id = $1', [payrollId]);
      const totalNet = items.reduce((s, i) => s + Number(i.net_pay || 0), 0);
      await auditFromReq(req, {
        action_type: wasRegenerate ? 'payroll_regenerated' : 'payroll_generated',
        category: 'payroll',
        after_snapshot: {
          payroll: payroll.rows[0],
          employee_count: items.length,
          total_net: totalNet,
          overrides_count: overrides.length,
        },
        description: wasRegenerate
          ? `Payroll regenerated for ${month}/${year} — ${items.length} employees, total net ${fmtGhs(totalNet)}`
          : `Payroll generated for ${month}/${year} — ${items.length} employees, total net ${fmtGhs(totalNet)}`,
        payroll_month: month,
        payroll_year: year,
      });
      res.json({ payroll: payroll.rows[0], items });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('HR generate payroll:', err);
    res.status(500).json({ error: 'Failed to generate payroll' });
  }
};

router.post('/payroll/generate', generatePayroll);
router.post('/payroll', generatePayroll);

router.get('/payroll/settings', async (_req, res) => {
  try {
    res.json(await getPayrollSettings());
  } catch (err) {
    console.error('HR payroll settings:', err);
    res.status(500).json({ error: 'Failed to load payroll settings' });
  }
});

router.put('/payroll/settings', async (req, res) => {
  try {
    const before = await getPayrollSettings();
    const body = req.body || {};
    const saved = await savePayrollSettings(body, actorId(req));

    if (Number(before.ssnit_employee_rate) !== Number(saved.ssnit_employee_rate)) {
      await auditFromReq(req, {
        action_type: 'ssnit_employee_rate_changed',
        category: 'settings',
        before_snapshot: before,
        after_snapshot: saved,
        description: `SSNIT employee rate changed from ${before.ssnit_employee_rate}% to ${saved.ssnit_employee_rate}%`,
      });
    }
    if (Number(before.ssnit_employer_rate) !== Number(saved.ssnit_employer_rate)) {
      await auditFromReq(req, {
        action_type: 'ssnit_employer_rate_changed',
        category: 'settings',
        before_snapshot: before,
        after_snapshot: saved,
        description: `SSNIT employer rate changed from ${before.ssnit_employer_rate}% to ${saved.ssnit_employer_rate}%`,
      });
    }

    const bandsBefore = JSON.stringify(before.tax_bands || []);
    const bandsAfter = JSON.stringify(saved.tax_bands || []);
    if (bandsBefore !== bandsAfter) {
      const resetToDefault =
        JSON.stringify(normalizeBandsForCompare(DEFAULT_TAX_BANDS)) ===
        JSON.stringify(normalizeBandsForCompare(saved.tax_bands));
      await auditFromReq(req, {
        action_type: resetToDefault ? 'paye_bands_reset' : 'paye_bands_updated',
        category: 'settings',
        before_snapshot: { tax_bands: before.tax_bands },
        after_snapshot: { tax_bands: saved.tax_bands },
        description: resetToDefault
          ? 'PAYE bands reset to Ghana defaults'
          : `PAYE bands updated — ${(saved.tax_bands || []).length} bands configured`,
      });
    }

    await auditCatalogueDiffs(req, before.allowance_types || [], saved.allowance_types || [], 'allowance');
    await auditCatalogueDiffs(req, before.deduction_types || [], saved.deduction_types || [], 'deduction');

    res.json(saved);
  } catch (err) {
    console.error('HR save payroll settings:', err);
    res.status(500).json({ error: 'Failed to save payroll settings' });
  }
});

router.post('/payroll/preview', async (req, res) => {
  try {
    const now = new Date();
    const month = toNum(req.body?.month ?? req.query.month, now.getMonth() + 1);
    const year = toNum(req.body?.year ?? req.query.year, now.getFullYear());
    const overrides = Array.isArray(req.body?.employee_overrides) ? req.body.employee_overrides : [];
    const overrideMap = new Map(overrides.map((o) => [Number(o.employee_id), o]));
    const asOf = `${year}-${String(month).padStart(2, '0')}-01`;
    const settings = await getPayrollSettings();
    const employees = await pool.query(
      `SELECT id, full_name, department, position, photo_url, basic_salary, allowances, status
       FROM hr_employees WHERE status = 'active' ORDER BY full_name`
    );
    const allowMap = await allowancesByEmployeeIds(employees.rows.map((e) => e.id), asOf);
    const reliefMap = await reliefsByEmployeeIds(employees.rows.map((e) => e.id));
    const deductionMap = await deductionsByEmployeeIds(employees.rows.map((e) => e.id), asOf);
    const advanceMap = await advancesByEmployeeIds(employees.rows.map((e) => e.id), month, year);
    const items = employees.rows.map((emp) => {
      const ov = overrideMap.get(Number(emp.id));
      const included = !(ov && ov.included === false);
      const extra = Array.isArray(ov?.additional_allowances) ? ov.additional_allowances : [];
      const configured = allowMap.get(Number(emp.id)) || [];
      const calc = calculateNetPay(emp, mergeAllowances(configured, extra), settings, {
        reliefs: reliefMap.get(Number(emp.id)) || [],
        deductions: deductionMap.get(Number(emp.id)) || [],
        advances: advanceMap.get(Number(emp.id)) || [],
      });
      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        department: emp.department,
        position: emp.position,
        photo_url: emp.photo_url,
        included,
        configured_allowances: configured,
        ...calc,
      };
    });
    const includedItems = items.filter((i) => i.included);
    res.json({
      month,
      year,
      settings,
      items,
      totals: roundTotals(totalsFromCalcs(includedItems)),
      employee_count: includedItems.length,
    });
  } catch (err) {
    console.error('HR payroll preview:', err);
    res.status(500).json({ error: 'Failed to preview payroll' });
  }
});

router.get('/payroll/employee/:employeeId/slip/:month/:year', async (req, res) => {
  try {
    const { employeeId, month, year } = req.params;
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at, p.paid_at,
              e.full_name, e.email, e.department, e.position, e.photo_url, e.employment_type,
              e.ssnit_number, e.bank_name, e.bank_account
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE i.employee_id = $1 AND p.month = $2 AND p.year = $3`,
      [employeeId, month, year]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Payslip not found' });
    const slip = normalizePayrollItem(result.rows[0]);
    await auditFromReq(req, {
      action_type: 'payslip_viewed',
      category: 'payslip',
      employee_id: Number(employeeId),
      after_snapshot: { employee_id: Number(employeeId), month: Number(month), year: Number(year), net_pay: slip.net_pay },
      description: `Payslip viewed for ${slip.full_name} — ${month}/${year}`,
      payroll_month: Number(month),
      payroll_year: Number(year),
    });
    res.json(slip);
  } catch (err) {
    console.error('HR payslip:', err);
    res.status(500).json({ error: 'Failed to load payslip' });
  }
});

router.get('/payroll/employee/:employeeId/slip/:month/:year/pdf', async (req, res) => {
  try {
    const { employeeId, month, year } = req.params;
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at, p.paid_at,
              e.full_name, e.email, e.department, e.position, e.photo_url, e.employment_type,
              e.ssnit_number, e.bank_name, e.bank_account
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE i.employee_id = $1 AND p.month = $2 AND p.year = $3`,
      [employeeId, month, year]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Payslip not found' });
    const slip = normalizePayrollItem(result.rows[0]);
    await auditFromReq(req, {
      action_type: 'payslip_downloaded',
      category: 'payslip',
      employee_id: Number(employeeId),
      after_snapshot: { employee_id: Number(employeeId), month: Number(month), year: Number(year), format: 'pdf' },
      description: `Payslip downloaded for ${slip.full_name} — ${month}/${year}`,
      payroll_month: Number(month),
      payroll_year: Number(year),
    });
    const pdf = await renderPayslipPdf(slip);
    const filename = `payslip-${String(slip.full_name || employeeId).replace(/[^\w.-]+/g, '_')}-${month}-${year}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    console.error('HR payslip PDF:', err);
    res.status(500).json({ error: 'Failed to generate payslip PDF' });
  }
});

router.get('/payroll/:id/items', async (req, res) => {
  try {
    const payroll = await pool.query('SELECT * FROM hr_payroll WHERE id = $1', [req.params.id]);
    if (payroll.rowCount === 0) return res.status(404).json({ error: 'Payroll not found' });
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== payroll.rows[0].company) {
      return res.status(404).json({ error: 'Payroll not found' });
    }
    const items = await pool.query(
      `SELECT i.*, e.full_name, e.department, e.position, e.photo_url, e.status AS employee_status
       FROM hr_payroll_items i
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE i.payroll_id = $1
       ORDER BY e.full_name`,
      [req.params.id]
    );
    res.json({ payroll: payroll.rows[0], items: items.rows.map(normalizePayrollItem) });
  } catch (err) {
    console.error('HR payroll items:', err);
    res.status(500).json({ error: 'Failed to load payroll items' });
  }
});

router.get('/payroll', async (req, res) => {
  try {
    const month = req.query.month ? toNum(req.query.month) : null;
    const year = req.query.year ? toNum(req.query.year) : null;
    const companyClause = req.company ? 'AND p.company = $3' : '';
    if (month && year) {
      const params = req.company ? [month, year, req.company] : [month, year];
      const payroll = await pool.query(
        `SELECT p.*,
                TRIM(CONCAT(COALESCE(gb.first_name,''), ' ', COALESCE(gb.last_name,''))) AS generated_by_name,
                TRIM(CONCAT(COALESCE(ab.first_name,''), ' ', COALESCE(ab.last_name,''))) AS approved_by_name
         FROM hr_payroll p
         LEFT JOIN users gb ON gb.id = p.generated_by
         LEFT JOIN users ab ON ab.id = p.approved_by
         WHERE p.month = $1 AND p.year = $2 ${companyClause}`,
        params
      );
      if (payroll.rowCount === 0) return res.json({ payroll: null, items: [] });
      const items = await pool.query(
        `SELECT i.*, e.full_name, e.department, e.position, e.photo_url
         FROM hr_payroll_items i
         JOIN hr_employees e ON e.id = i.employee_id
         WHERE i.payroll_id = $1 ORDER BY e.full_name`,
        [payroll.rows[0].id]
      );
      return res.json({ payroll: payroll.rows[0], items: items.rows.map(normalizePayrollItem) });
    }
    const historyCompanyClause = req.company ? 'WHERE p.company = $1' : '';
    const historyParams = req.company ? [req.company] : [];
    const history = await pool.query(
      `SELECT p.*, COUNT(i.id)::int AS item_count, COALESCE(SUM(i.net_pay),0)::numeric AS total_net
       FROM hr_payroll p
       LEFT JOIN hr_payroll_items i ON i.payroll_id = p.id
       ${historyCompanyClause}
       GROUP BY p.id
       ORDER BY p.year DESC, p.month DESC`,
      historyParams
    );
    res.json(history.rows);
  } catch (err) {
    console.error('HR payroll list:', err);
    res.status(500).json({ error: 'Failed to load payroll' });
  }
});

router.put('/payroll/:id', async (req, res) => {
  try {
    const beforeQ = await pool.query(`SELECT * FROM hr_payroll WHERE id = $1`, [req.params.id]);
    if (beforeQ.rowCount === 0) return res.status(404).json({ error: 'Payroll not found' });
    const before = beforeQ.rows[0];
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== before.company) {
      return res.status(404).json({ error: 'Payroll not found' });
    }
    const newStatus = String(req.body?.status || '');
    const row = await setPayrollStatus(req.params.id, newStatus, actorId(req));
    if (!row) return res.status(404).json({ error: 'Payroll not found' });
    const reason = req.body?.reason || req.body?.notes || null;
    let action_type = 'payroll_status_reversed';
    let description = `Payroll status changed from ${before.status} to ${row.status}${reason ? ` — ${reason}` : ''} (${row.month}/${row.year})`;
    if (newStatus === 'Approved') {
      action_type = 'payroll_approved';
      const totals = await pool.query(
        `SELECT COALESCE(SUM(net_pay),0)::float AS total_net FROM hr_payroll_items WHERE payroll_id = $1`,
        [row.id]
      );
      description = `Payroll approved for ${row.month}/${row.year} — total net ${fmtGhs(totals.rows[0]?.total_net || 0)}`;
    } else if (newStatus === 'Paid') {
      action_type = 'payroll_marked_paid';
      description = `Payroll marked as paid for ${row.month}/${row.year}`;
    }
    await auditFromReq(req, {
      action_type,
      category: 'payroll',
      before_snapshot: before,
      after_snapshot: { ...row, reason },
      description,
      payroll_month: row.month,
      payroll_year: row.year,
    });
    res.json(row);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update payroll' });
  }
});

router.patch('/payroll/:id/approve', async (req, res) => {
  try {
    const beforeQ = await pool.query(`SELECT * FROM hr_payroll WHERE id = $1`, [req.params.id]);
    if (beforeQ.rowCount === 0) return res.status(404).json({ error: 'Payroll not found' });
    const before = beforeQ.rows[0];
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== before.company) {
      return res.status(404).json({ error: 'Payroll not found' });
    }
    const row = await setPayrollStatus(req.params.id, 'Approved', actorId(req));
    if (!row) return res.status(404).json({ error: 'Payroll not found' });
    const totals = await pool.query(
      `SELECT COALESCE(SUM(net_pay),0)::float AS total_net, COUNT(*)::int AS n FROM hr_payroll_items WHERE payroll_id = $1`,
      [row.id]
    );
    const totalNet = Number(totals.rows[0]?.total_net || 0);
    await auditFromReq(req, {
      action_type: 'payroll_approved',
      category: 'payroll',
      before_snapshot: before,
      after_snapshot: { ...row, total_net: totalNet, employee_count: totals.rows[0]?.n },
      description: `Payroll approved for ${row.month}/${row.year} — total net ${fmtGhs(totalNet)}`,
      payroll_month: row.month,
      payroll_year: row.year,
    });
    res.json(row);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to approve payroll' });
  }
});

router.patch('/payroll/:id/mark-paid', async (req, res) => {
  try {
    const beforeQ = await pool.query(`SELECT * FROM hr_payroll WHERE id = $1`, [req.params.id]);
    if (beforeQ.rowCount === 0) return res.status(404).json({ error: 'Payroll not found' });
    const before = beforeQ.rows[0];
    if (!isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== before.company) {
      return res.status(404).json({ error: 'Payroll not found' });
    }
    const row = await setPayrollStatus(req.params.id, 'Paid', actorId(req));
    if (!row) return res.status(404).json({ error: 'Payroll not found' });
    await auditFromReq(req, {
      action_type: 'payroll_marked_paid',
      category: 'payroll',
      before_snapshot: before,
      after_snapshot: row,
      description: `Payroll marked as paid for ${row.month}/${row.year}`,
      payroll_month: row.month,
      payroll_year: row.year,
    });
    res.json(row);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || 'Failed to mark payroll paid' });
  }
});

// ── Payroll Audit (HR admin only, read-only) ─────────────────────────────────

function mapAuditRow(row) {
  return {
    id: row.id,
    action_type: row.action_type,
    action_label: actionLabel(row.action_type),
    category: row.category,
    employee_id: row.employee_id,
    employee_name: row.employee_name || null,
    employee_department: row.employee_department || null,
    performed_by: row.performed_by,
    performed_by_name: row.performed_by_name || (row.performed_by == null ? 'System' : null),
    performed_by_role: row.performed_by_role || null,
    ip_address: row.ip_address,
    before_snapshot: row.before_snapshot,
    after_snapshot: row.after_snapshot,
    description: row.description,
    payroll_month: row.payroll_month,
    payroll_year: row.payroll_year,
    created_at: row.created_at,
    created_at_ghana: formatGhanaTimestamp(row.created_at),
  };
}

router.get('/payroll/audit/performers', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT
         a.performed_by AS id,
         COALESCE(NULLIF(TRIM(a.performed_by_name), ''), 'System') AS name
       FROM hr_payroll_audit a
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR audit performers:', err);
    res.status(500).json({ error: 'Failed to load performers' });
  }
});

router.get('/payroll/audit/summary', async (req, res) => {
  try {
    const { where, params } = payrollAuditFilters(req.query);
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total_actions,
         COUNT(*) FILTER (WHERE LOWER(a.category) = 'payroll')::int AS payroll_runs,
         COUNT(*) FILTER (WHERE LOWER(a.category) = 'salary')::int AS salary_changes,
         COUNT(*) FILTER (WHERE LOWER(a.category) = 'settings')::int AS settings_changes
       FROM hr_payroll_audit a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       ${where}`,
      params
    );
    res.json(result.rows[0] || { total_actions: 0, payroll_runs: 0, salary_changes: 0, settings_changes: 0 });
  } catch (err) {
    console.error('HR audit summary:', err);
    res.status(500).json({ error: 'Failed to load audit summary' });
  }
});

router.get('/payroll/audit/export', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const { where, params } = payrollAuditFilters(req.query);
    const result = await pool.query(
      `SELECT a.*, e.full_name AS employee_name, e.department AS employee_department
       FROM hr_payroll_audit a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       ${where}
       ORDER BY a.created_at DESC, a.id DESC`,
      params
    );
    const rows = result.rows.map(mapAuditRow);

    if (format === 'pdf') {
      const paragraphs = rows.slice(0, 80).map(
        (r) =>
          `${r.created_at_ghana} | ${r.action_label} | ${r.category} | ${r.employee_name || '-'} | ${r.performed_by_name || 'System'} | ${r.description}`
      );
      if (rows.length > 80) paragraphs.push(`… and ${rows.length - 80} more rows (export CSV for full list).`);
      const pdf = buildSimpleLetterPdf({
        title: 'Payroll Audit Trail',
        paragraphs: paragraphs.length ? paragraphs : ['No audit records for the selected filters.'],
        footerLines: [`Exported ${formatGhanaTimestamp(new Date().toISOString())} (Ghana time)`, `${rows.length} record(s)`],
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="payroll-audit.pdf"');
      return res.send(pdf);
    }

    const header = ['Timestamp (Ghana)', 'Action', 'Category', 'Employee Affected', 'Employee ID', 'Performed By', 'Details', 'Payroll Month', 'Payroll Year', 'IP'];
    const escapeCsv = (v) => {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.created_at_ghana,
          r.action_label,
          r.category,
          r.employee_name || '',
          r.employee_id || '',
          r.performed_by_name || 'System',
          r.description,
          r.payroll_month || '',
          r.payroll_year || '',
          r.ip_address || '',
        ]
          .map(escapeCsv)
          .join(',')
      );
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payroll-audit.csv"');
    res.send(csv);
  } catch (err) {
    console.error('HR audit export:', err);
    res.status(500).json({ error: 'Failed to export audit log' });
  }
});

router.get('/payroll/audit/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*,
              e.full_name AS employee_name,
              e.department AS employee_department,
              COALESCE(u.role, u.main_role, u.position) AS performed_by_role
       FROM hr_payroll_audit a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       LEFT JOIN users u ON u.id = a.performed_by
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Audit record not found' });
    res.json(mapAuditRow(result.rows[0]));
  } catch (err) {
    console.error('HR audit detail:', err);
    res.status(500).json({ error: 'Failed to load audit detail' });
  }
});

router.get('/payroll/audit', async (req, res) => {
  try {
    const page = Math.max(1, toNum(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toNum(req.query.limit, 50)));
    const offset = (page - 1) * limit;
    const { where, params } = payrollAuditFilters(req.query);
    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM hr_payroll_audit a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       ${where}`,
      params
    );
    const total = countQ.rows[0]?.n || 0;
    const listParams = [...params, limit, offset];
    const result = await pool.query(
      `SELECT a.*,
              e.full_name AS employee_name,
              e.department AS employee_department,
              COALESCE(u.role, u.main_role, u.position) AS performed_by_role
       FROM hr_payroll_audit a
       LEFT JOIN hr_employees e ON e.id = a.employee_id
       LEFT JOIN users u ON u.id = a.performed_by
       ${where}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );
    res.json({
      page,
      limit,
      offset,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      rows: result.rows.map(mapAuditRow),
    });
  } catch (err) {
    console.error('HR audit list:', err);
    res.status(500).json({ error: 'Failed to load payroll audit' });
  }
});

// â”€â”€ Attendance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/attendance/summary', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const workingDays = workingDaysInMonth(year, month);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const employees = await pool.query(
      `SELECT id, full_name, department, position, photo_url, status FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''} ORDER BY full_name`,
      req.company ? [req.company] : []
    );
    const [records, leaveMap] = await Promise.all([
      pool.query(
        `SELECT employee_id, status, overtime_hours, date, clock_in, clock_in_time
         FROM hr_attendance
         WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2`,
        [year, month]
      ),
      leaveDatesByEmployee(start, end),
    ]);
    const byEmp = new Map();
    const counted = new Map();
    for (const row of records.rows) {
      const eid = Number(row.employee_id);
      if (!byEmp.has(eid)) {
        byEmp.set(eid, { present: 0, absent: 0, late: 0, half: 0, overtime: 0, leave: 0 });
        counted.set(eid, new Set());
      }
      const bucket = byEmp.get(eid);
      const seen = counted.get(eid);
      const d = isoDateOnly(row.date);
      if (d) seen.add(d);
      const onLeave = d && leaveMap.get(eid)?.has(d);
      const status = String(row.status || '');
      const worked = hasClockedIn(row) || ['Present', 'Late', 'Half-day'].includes(status);
      if (worked && status === 'Late') {
        bucket.late += 1;
        bucket.present += 1;
      } else if (worked && status === 'Half-day') {
        bucket.half += 1;
        bucket.present += 0.5;
      } else if (worked) {
        bucket.present += 1;
      } else if (onLeave || status === 'Leave' || /leave/i.test(status)) {
        bucket.leave += 1;
      } else if (status === 'Absent') {
        bucket.absent += 1;
      }
      bucket.overtime += Number(row.overtime_hours || 0);
    }
    const summary = employees.rows.map((emp) => {
      const eid = Number(emp.id);
      const stats = byEmp.get(eid) || { present: 0, absent: 0, late: 0, half: 0, overtime: 0, leave: 0 };
      const seen = counted.get(eid) || new Set();
      for (const d of leaveMap.get(eid) || []) {
        if (seen.has(d)) continue;
        const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        stats.leave += 1;
        seen.add(d);
      }
      const expected = Math.max(workingDays - stats.leave, 0);
      const pct = expected > 0 ? Math.round((stats.present / expected) * 1000) / 10 : stats.leave > 0 ? 100 : 0;
      return {
        employee_id: emp.id,
        full_name: emp.full_name,
        department: emp.department,
        position: emp.position,
        photo_url: emp.photo_url,
        working_days: workingDays,
        present: stats.present,
        absent: stats.absent,
        late: stats.late,
        leave: stats.leave,
        overtime_hours: stats.overtime,
        attendance_pct: pct,
      };
    });
    res.json({ year, month, workingDays, summary });
  } catch (err) {
    console.error('HR attendance summary:', err);
    res.status(500).json({ error: 'Failed to load attendance summary' });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const { employee_id, from, to, month, year } = req.query;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      clauses.push(`a.employee_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      clauses.push(`a.date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      clauses.push(`a.date <= $${params.length}`);
    }
    if (month && year) {
      params.push(toNum(year), toNum(month));
      clauses.push(`EXTRACT(YEAR FROM a.date) = $${params.length - 1} AND EXTRACT(MONTH FROM a.date) = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT a.*, e.full_name, e.department, e.photo_url, u.username AS recorded_by_name
       FROM hr_attendance a
       JOIN hr_employees e ON e.id = a.employee_id
       LEFT JOIN users u ON u.id = a.recorded_by
       ${where}
       ORDER BY a.date DESC, e.full_name`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR attendance list:', err);
    res.status(500).json({ error: 'Failed to load attendance' });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.date || !b.status) {
      return res.status(400).json({ error: 'employee, date, and status are required' });
    }
    if (!ATTENDANCE_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}` });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const result = await pool.query(
      `INSERT INTO hr_attendance (employee_id, date, status, clock_in, clock_out, overtime_hours, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (employee_id, date) DO UPDATE SET
         status = EXCLUDED.status,
         clock_in = EXCLUDED.clock_in,
         clock_out = EXCLUDED.clock_out,
         overtime_hours = EXCLUDED.overtime_hours,
         notes = EXCLUDED.notes,
         recorded_by = EXCLUDED.recorded_by
       RETURNING *`,
      [
        b.employee_id,
        isoDate(b.date),
        b.status,
        b.clock_in || null,
        b.clock_out || null,
        toNum(b.overtime_hours),
        b.notes || null,
        actorId(req),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('HR log attendance:', err);
    res.status(500).json({ error: 'Failed to log attendance' });
  }
});

router.put('/attendance/:id', async (req, res) => {
  try {
    const b = req.body || {};
    const existing = await pool.query('SELECT employee_id FROM hr_attendance WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Attendance record not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    const result = await pool.query(
      `UPDATE hr_attendance SET
        status = COALESCE($1, status),
        clock_in = COALESCE($2, clock_in),
        clock_out = COALESCE($3, clock_out),
        overtime_hours = COALESCE($4, overtime_hours),
        notes = COALESCE($5, notes)
       WHERE id = $6 RETURNING *`,
      [b.status, b.clock_in, b.clock_out, b.overtime_hours != null ? toNum(b.overtime_hours) : null, b.notes, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Attendance record not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('HR update attendance:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// â”€â”€ Employee leave / form request approvals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.put('/leave-requests/:id', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    const existing = await pool.query(`SELECT * FROM hr_leave_requests WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Leave request not found' });
    const row = existing.rows[0];
    if (row.current_stage) {
      return res.status(409).json({ error: 'This request uses the new multi-stage approval flow — respond from the Requests tab.' });
    }
    if (row.status !== 'pending') return res.status(400).json({ error: 'Request has already been reviewed' });

    const rejectionReason = String(req.body?.rejection_reason || '').trim() || null;
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({ error: 'A rejection reason is required' });
    }

    if (status === 'approved' && row.employee_id) {
      const startIso = isoDateOnly(row.start_date);
      const endIso = isoDateOnly(row.end_date);
      const year = startIso ? Number(startIso.slice(0, 4)) : new Date().getFullYear();
      await deductLeaveDays(row.employee_id, row.leave_type, row.days, year);
      await pool.query(
        `INSERT INTO hr_leave_applications (
           employee_id, leave_type, start_date, end_date, days, status, notes, recorded_by
         ) VALUES ($1,$2,$3,$4,$5,'Approved',$6,$7)`,
        [row.employee_id, row.leave_type, startIso, endIso, row.days, row.reason || null, actorId(req)]
      );
      await markLeaveAttendance(row.employee_id, startIso, endIso);
    }

    const updated = await pool.query(
      `UPDATE hr_leave_requests SET
         status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [status, rejectionReason, actorId(req), row.id]
    );

    const emp = row.employee_id
      ? (await pool.query('SELECT full_name FROM hr_employees WHERE id = $1', [row.employee_id])).rows[0]
      : null;
    const from = String(row.start_date).slice(0, 10);
    const to = String(row.end_date).slice(0, 10);
    const range = `${from.slice(5)}â€“${to.slice(5)}`;
    if (row.user_id) {
      if (status === 'approved') {
        await notifyUser(
          row.user_id,
          'Leave approved',
          `Your ${row.leave_type} Leave request (${range}) has been approved`,
          '/hr-self/leave'
        );
      } else {
        await notifyUser(
          row.user_id,
          'Leave rejected',
          `Your ${row.leave_type} Leave request was rejected: ${rejectionReason}`,
          '/hr-self/leave'
        );
      }
    }
    await logHrActivity(pool, {
      kind: status === 'approved' ? 'leave_approved' : 'leave_rejected',
      message: `${row.leave_type} leave ${status} for ${emp?.full_name || 'employee'}`,
      employeeId: row.employee_id,
    });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('HR review leave-request:', err);
    res.status(500).json({ error: 'Failed to review leave request' });
  }
});

router.get('/form-requests', async (req, res) => {
  try {
    const { status, department } = req.query;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (status && status !== 'all') {
      params.push(String(status).toLowerCase());
      clauses.push(`r.status = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(`e.department = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await safeQuery(
      `SELECT r.*, e.full_name, e.department, e.photo_url, e.position, e.start_date
       FROM hr_form_requests r
       LEFT JOIN hr_employees e ON e.id = r.employee_id
       ${where}
       ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR form-requests:', err);
    res.status(500).json({ error: 'Failed to load form requests' });
  }
});

router.put('/form-requests/:id', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    const existing = await pool.query(`SELECT * FROM hr_form_requests WHERE id = $1`, [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Form request not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Form request not found' });
    }
    const row = existing.rows[0];
    if (row.status !== 'pending') return res.status(400).json({ error: 'Request has already been reviewed' });

    const rejectionReason = String(req.body?.rejection_reason || '').trim() || null;
    if (status === 'rejected' && !rejectionReason) {
      return res.status(400).json({ error: 'A rejection reason is required' });
    }

    let fileUrl = row.generated_file_url;
    if (status === 'approved' && LETTER_FORM_TYPES.includes(row.form_type) && row.employee_id) {
      try {
        const emp = (await pool.query('SELECT * FROM hr_employees WHERE id = $1', [row.employee_id])).rows[0];
        if (emp) fileUrl = await generateHrLetterPdf(row, emp);
      } catch (pdfErr) {
        console.error('HR letter PDF:', pdfErr);
      }
    }

    const updated = await pool.query(
      `UPDATE hr_form_requests SET
         status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP,
         generated_file_url = COALESCE($4, generated_file_url)
       WHERE id = $5 RETURNING *`,
      [status, rejectionReason, actorId(req), fileUrl, row.id]
    );

    if (row.user_id) {
      if (status === 'approved') {
        const ready = LETTER_FORM_TYPES.includes(row.form_type) ? ' and is ready to download' : '';
        await notifyUser(
          row.user_id,
          'Form request approved',
          `Your ${row.form_type} request has been approved${ready}`,
          '/hr-self/forms'
        );
      } else {
        await notifyUser(
          row.user_id,
          'Form request rejected',
          `Your ${row.form_type} request was rejected: ${rejectionReason}`,
          '/hr-self/forms'
        );
      }
    }
    await logHrActivity(pool, {
      kind: status === 'approved' ? 'form_approved' : 'form_rejected',
      message: `${row.form_type} ${status}`,
      employeeId: row.employee_id,
    });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('HR review form-request:', err);
    res.status(500).json({ error: 'Failed to review form request' });
  }
});

// â”€â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/documents', async (req, res) => {
  try {
    const { employee_id, category } = req.query;
    const clauses = [];
    const params = [];
    if (req.company) {
      params.push(req.company);
      clauses.push(`e.company = $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      clauses.push(`d.employee_id = $${params.length}`);
    }
    if (category) {
      params.push(category);
      clauses.push(`d.category = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT d.*, e.full_name, e.department, u.username AS uploaded_by_name
       FROM hr_documents d
       JOIN hr_employees e ON e.id = d.employee_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR documents:', err);
    res.status(500).json({ error: 'Failed to load documents' });
  }
});

router.post('/documents', upload.single('file'), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.employee_id || !b.document_name) {
      return res.status(400).json({ error: 'employee and document name are required' });
    }
    if (!(await employeeBelongsToCallerCompany(b.employee_id, req))) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const category = DOCUMENT_CATEGORIES.includes(b.category) ? b.category : 'Other';
    const fileUrl = req.file ? publicFileUrl(req.file.filename) : b.file_url || null;
    const result = await pool.query(
      `INSERT INTO hr_documents (employee_id, document_name, category, file_url, notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.employee_id, b.document_name, category, fileUrl, b.notes || null, actorId(req)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('HR upload document:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM hr_documents WHERE id = $1', [req.params.id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Document not found' });
    if (!(await employeeBelongsToCallerCompany(existing.rows[0].employee_id, req))) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const doc = existing.rows[0];
    if (doc.file_url) {
      const filePath = path.join(uploadsDir, path.basename(doc.file_url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await pool.query('DELETE FROM hr_documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('HR delete document:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// â”€â”€ GPS attendance, settings, analytics, reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/settings', async (req, res) => {
  try {
    const { getHrSettings } = await import('../utils/hrGps.js');
    const settings = await getHrSettings(req.company || 'CW');
    res.json(settings || {});
  } catch (err) {
    console.error('HR settings:', err);
    res.status(500).json({ error: 'Failed to load HR settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const b = req.body || {};
    const company = req.company || 'CW';
    const existing = await pool.query(`SELECT id FROM hr_settings WHERE company = $1 ORDER BY id ASC LIMIT 1`, [company]);
    const fields = {
      office_latitude: b.office_latitude === '' || b.office_latitude == null ? null : Number(b.office_latitude),
      office_longitude: b.office_longitude === '' || b.office_longitude == null ? null : Number(b.office_longitude),
      office_radius_meters: Math.max(10, Math.min(500, toNum(b.office_radius_meters, 100))),
      office_name: String(b.office_name || 'Vobiss Office').slice(0, 255),
      expected_clock_in: b.expected_clock_in || '08:00:00',
      expected_clock_out: b.expected_clock_out || '17:00:00',
    };
    let row;
    if (existing.rowCount === 0) {
      row = (
        await pool.query(
          `INSERT INTO hr_settings (office_latitude, office_longitude, office_radius_meters, office_name, expected_clock_in, expected_clock_out, updated_by, updated_at, company)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8) RETURNING *`,
          [fields.office_latitude, fields.office_longitude, fields.office_radius_meters, fields.office_name, fields.expected_clock_in, fields.expected_clock_out, actorId(req), company]
        )
      ).rows[0];
    } else {
      row = (
        await pool.query(
          `UPDATE hr_settings SET
            office_latitude = $1, office_longitude = $2, office_radius_meters = $3,
            office_name = $4, expected_clock_in = $5, expected_clock_out = $6,
            updated_by = $7, updated_at = NOW()
           WHERE id = $8 RETURNING *`,
          [fields.office_latitude, fields.office_longitude, fields.office_radius_meters, fields.office_name, fields.expected_clock_in, fields.expected_clock_out, actorId(req), existing.rows[0].id]
        )
      ).rows[0];
    }
    res.json(row);
  } catch (err) {
    console.error('HR update settings:', err);
    res.status(500).json({ error: 'Failed to save HR settings' });
  }
});

router.get('/attendance/live', async (req, res) => {
  try {
    const { ghanaToday } = await import('../utils/hrShared.js');
    const today = ghanaToday();
    const [employees, records] = await Promise.all([
      pool.query(
        `SELECT id, full_name, department, position, photo_url, status FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''} ORDER BY full_name`,
        req.company ? [req.company] : []
      ),
      pool.query(`SELECT * FROM hr_attendance WHERE date = $1`, [today]),
    ]);
    const byEmp = new Map(records.rows.map((r) => [Number(r.employee_id), r]));
    const onLeave = await leaveEmployeeIdsOn(today);
    const inOffice = [];
    const notIn = [];
    for (const emp of employees.rows) {
      const rec = byEmp.get(Number(emp.id));
      const clockedIn = hasClockedIn(rec);
      const clockedOut = hasClockedOut(rec);
      if (clockedIn && !clockedOut) {
        inOffice.push({
          ...emp,
          clock_in_time: rec.clock_in_time || rec.clock_in,
          is_late: rec.is_late || String(rec.status).toLowerCase() === 'late',
          late_minutes: rec.late_minutes || 0,
          clock_in_distance_meters: rec.clock_in_distance_meters,
        });
      } else {
        let status = 'Not clocked in';
        if (onLeave.has(Number(emp.id))) status = 'On Leave';
        else if (clockedOut) status = 'Clocked out';
        notIn.push({ ...emp, status, clock_out_time: rec?.clock_out_time || rec?.clock_out || null });
      }
    }
    res.json({ in_office: inOffice, not_in: notIn, date: today });
  } catch (err) {
    console.error('HR attendance live:', err);
    res.status(500).json({ error: 'Failed to load live attendance' });
  }
});

router.get('/attendance/today-summary', async (req, res) => {
  try {
    const { ghanaToday } = await import('../utils/hrShared.js');
    const today = ghanaToday();
    const company = req.company;
    const [empRes, empIdsRes, recRes] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_employees WHERE status = 'active' ${company ? 'AND company = $1' : ''}`, company ? [company] : []),
      pool.query(`SELECT id FROM hr_employees WHERE status = 'active' ${company ? 'AND company = $1' : ''}`, company ? [company] : []),
      pool.query(`SELECT * FROM hr_attendance WHERE date = $1`, [today]),
    ]);
    const total = empRes.rows[0].n;
    const companyEmpIds = new Set(empIdsRes.rows.map((r) => Number(r.id)));
    const scopedRecords = company ? recRes.rows.filter((r) => companyEmpIds.has(Number(r.employee_id))) : recRes.rows;
    const clockedIn = scopedRecords.filter((r) => r.clock_in_time || r.clock_in).length;
    const late = scopedRecords.filter((r) => r.is_late || String(r.status).toLowerCase() === 'late').length;
    const onLeaveIds = await leaveEmployeeIdsOn(today);
    const onLeave = company ? [...onLeaveIds].filter((id) => companyEmpIds.has(Number(id))).length : onLeaveIds.size;
    res.json({
      total_employees: total,
      clocked_in_count: clockedIn,
      not_clocked_in_count: Math.max(0, total - clockedIn - onLeave),
      late_count: late,
      on_leave_count: onLeave,
    });
  } catch (err) {
    console.error('HR attendance today-summary:', err);
    res.status(500).json({ error: 'Failed to load attendance summary' });
  }
});

router.get('/attendance/heatmap', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;
    const [employees, records, leaveByEmp] = await Promise.all([
      pool.query(
        `SELECT id, full_name, department, photo_url FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''} ORDER BY full_name`,
        req.company ? [req.company] : []
      ),
      pool.query(
        `SELECT * FROM hr_attendance WHERE date >= $1 AND date <= $2`,
        [start, end]
      ),
      leaveDatesByEmployee(start, end),
    ]);
    const recByEmp = new Map();
    for (const rec of records.rows) {
      const eid = Number(rec.employee_id);
      if (!recByEmp.has(eid)) recByEmp.set(eid, {});
      const key = isoDateOnly(rec.date);
      if (!key) continue;
      recByEmp.get(eid)[key] = overlayLeaveStatus(rec, leaveByEmp.get(eid) || new Set());
    }
    res.json({
      year,
      month,
      days: endDate,
      employees: employees.rows.map((emp) => ({
        id: emp.id,
        full_name: emp.full_name,
        department: emp.department,
        photo_url: emp.photo_url,
        days: recByEmp.get(Number(emp.id)) || {},
        leave_dates: [...(leaveByEmp.get(Number(emp.id)) || [])],
      })),
    });
  } catch (err) {
    console.error('HR attendance heatmap:', err);
    res.status(500).json({ error: 'Failed to load heatmap' });
  }
});

router.get('/analytics/headcount-trend', async (req, res) => {
  try {
    const company = req.company;
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const end = new Date(year, month, 0).toLocaleDateString('en-CA');
      const count = await pool.query(
        `SELECT COUNT(*)::int AS n FROM hr_employees
         WHERE status = 'active' AND (start_date IS NULL OR start_date <= $1) ${company ? 'AND company = $2' : ''}`,
        company ? [end, company] : [end]
      );
      months.push({
        year,
        month,
        label: d.toLocaleString('en', { month: 'short' }),
        count: count.rows[0].n,
      });
    }
    const first = months[0]?.count || 0;
    const last = months[months.length - 1]?.count || 0;
    const growth = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
    res.json({ months, growth_pct: growth });
  } catch (err) {
    console.error('HR headcount trend:', err);
    res.status(500).json({ error: 'Failed to load headcount trend' });
  }
});

router.get('/analytics/by-department', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''} GROUP BY 1 ORDER BY count DESC`,
      req.company ? [req.company] : []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR by-department:', err);
    res.status(500).json({ error: 'Failed to load department breakdown' });
  }
});

router.get('/analytics/employment-types', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(employment_type, 'unspecified') AS employment_type, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''} GROUP BY 1`,
      req.company ? [req.company] : []
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR employment-types:', err);
    res.status(500).json({ error: 'Failed to load employment types' });
  }
});

router.get('/analytics/salary-distribution', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         CASE
           WHEN COALESCE(basic_salary,0) + COALESCE(allowances,0) < 2000 THEN 'Below GHS 2,000'
           WHEN COALESCE(basic_salary,0) + COALESCE(allowances,0) < 4000 THEN 'GHS 2,000-4,000'
           WHEN COALESCE(basic_salary,0) + COALESCE(allowances,0) < 6000 THEN 'GHS 4,000-6,000'
           WHEN COALESCE(basic_salary,0) + COALESCE(allowances,0) < 8000 THEN 'GHS 6,000-8,000'
           ELSE 'Above GHS 8,000'
         END AS band,
         COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' ${req.company ? 'AND company = $1' : ''}
       GROUP BY 1`,
      req.company ? [req.company] : []
    );
    const order = ['Below GHS 2,000', 'GHS 2,000-4,000', 'GHS 4,000-6,000', 'GHS 6,000-8,000', 'Above GHS 8,000'];
    const map = new Map(result.rows.map((r) => [r.band, r.count]));
    res.json(order.map((band) => ({ band, count: map.get(band) || 0 })));
  } catch (err) {
    console.error('HR salary-distribution:', err);
    res.status(500).json({ error: 'Failed to load salary distribution' });
  }
});

router.get('/analytics/attendance-trend', async (req, res) => {
  try {
    const { workingDaysInMonth } = await import('../utils/hrGps.js');
    const n = Math.min(12, Math.max(1, toNum(req.query.months, 6)));
    const company = req.company;
    const now = new Date();
    const months = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const working = workingDaysInMonth(year, month);
      const [emp, present] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS n FROM hr_employees WHERE status = 'active' ${company ? 'AND company = $1' : ''}`, company ? [company] : []),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM hr_attendance a
           JOIN hr_employees e ON e.id = a.employee_id
           WHERE EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
             AND LOWER(a.status) IN ('present','late','half-day') ${company ? 'AND e.company = $3' : ''}`,
          company ? [year, month, company] : [year, month]
        ),
      ]);
      const possible = emp.rows[0].n * working;
      const rate = possible > 0 ? Math.round((present.rows[0].n / possible) * 1000) / 10 : 0;
      months.push({ year, month, label: d.toLocaleString('en', { month: 'short' }), attendance_rate: rate });
    }
    res.json({ months, target: 95 });
  } catch (err) {
    console.error('HR attendance-trend:', err);
    res.status(500).json({ error: 'Failed to load attendance trend' });
  }
});

router.get('/analytics/attendance-by-department', async (req, res) => {
  try {
    const { workingDaysInMonth } = await import('../utils/hrGps.js');
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const working = workingDaysInMonth(year, month);
    const result = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(e.department), ''), 'Unassigned') AS department,
              COUNT(DISTINCT e.id)::int AS employees,
              COUNT(a.id) FILTER (WHERE LOWER(a.status) IN ('present','late','half-day'))::int AS present_days
       FROM hr_employees e
       LEFT JOIN hr_attendance a ON a.employee_id = e.id
         AND EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
       WHERE e.status = 'active' ${req.company ? 'AND e.company = $3' : ''}
       GROUP BY 1 ORDER BY 1`,
      req.company ? [year, month, req.company] : [year, month]
    );
    res.json(
      result.rows.map((r) => {
        const possible = r.employees * working;
        return {
          department: r.department,
          attendance_rate: possible > 0 ? Math.round((r.present_days / possible) * 1000) / 10 : 0,
        };
      })
    );
  } catch (err) {
    console.error('HR attendance-by-department:', err);
    res.status(500).json({ error: 'Failed to load department attendance' });
  }
});

router.get('/analytics/late-by-weekday', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const result = await pool.query(
      `SELECT EXTRACT(DOW FROM a.date)::int AS dow, COUNT(*)::int AS count
       FROM hr_attendance a
       JOIN hr_employees e ON e.id = a.employee_id
       WHERE EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
         AND (a.is_late = true OR LOWER(a.status) = 'late') ${req.company ? 'AND e.company = $3' : ''}
       GROUP BY 1`,
      req.company ? [year, month, req.company] : [year, month]
    );
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const map = new Map(result.rows.map((r) => [Number(r.dow), r.count]));
    res.json(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label) => ({
      day: label,
      count: map.get(labels.indexOf(label)) || 0,
    })));
  } catch (err) {
    console.error('HR late-by-weekday:', err);
    res.status(500).json({ error: 'Failed to load late arrivals' });
  }
});

router.get('/analytics/leave-by-type', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const company = req.company;
    const result = await pool.query(
      `SELECT leave_type, SUM(days)::int AS days FROM (
         SELECT l.leave_type, l.days FROM hr_leave_applications l
         JOIN hr_employees e ON e.id = l.employee_id
         WHERE l.status = 'Approved' AND EXTRACT(YEAR FROM l.start_date) = $1 ${company ? 'AND e.company = $2' : ''}
         UNION ALL
         SELECT r.leave_type, r.days FROM hr_leave_requests r
         JOIN hr_employees e ON e.id = r.employee_id
         WHERE r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $1 ${company ? 'AND e.company = $2' : ''}
       ) x GROUP BY leave_type ORDER BY days DESC`,
      company ? [year, company] : [year]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('HR leave-by-type:', err);
    res.status(500).json({ error: 'Failed to load leave by type' });
  }
});

router.get('/analytics/leave-trend', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const company = req.company;
    const result = await pool.query(
      `SELECT EXTRACT(MONTH FROM start_date)::int AS month, SUM(days)::int AS days FROM (
         SELECT l.start_date, l.days FROM hr_leave_applications l
         JOIN hr_employees e ON e.id = l.employee_id
         WHERE l.status = 'Approved' AND EXTRACT(YEAR FROM l.start_date) = $1 ${company ? 'AND e.company = $2' : ''}
         UNION ALL
         SELECT r.start_date, r.days FROM hr_leave_requests r
         JOIN hr_employees e ON e.id = r.employee_id
         WHERE r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $1 ${company ? 'AND e.company = $2' : ''}
       ) x GROUP BY 1`,
      company ? [year, company] : [year]
    );
    const map = new Map(result.rows.map((r) => [Number(r.month), r.days]));
    res.json(
      Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
        days: map.get(i + 1) || 0,
      }))
    );
  } catch (err) {
    console.error('HR leave-trend:', err);
    res.status(500).json({ error: 'Failed to load leave trend' });
  }
});

router.get('/analytics/payroll-trend', async (req, res) => {
  try {
    const n = Math.min(12, Math.max(1, toNum(req.query.months, 12)));
    const company = req.company;
    const result = await pool.query(
      `SELECT p.year, p.month, COALESCE(SUM(i.gross),0)::numeric AS gross, COALESCE(SUM(i.net_pay),0)::numeric AS net
       FROM hr_payroll p
       JOIN hr_payroll_items i ON i.payroll_id = p.id
       WHERE LOWER(p.status) = 'paid' ${company ? 'AND p.company = $2' : ''}
       GROUP BY p.year, p.month
       ORDER BY p.year DESC, p.month DESC
       LIMIT $1`,
      company ? [n, company] : [n]
    );
    const rows = [...result.rows].reverse().map((r) => ({
      year: r.year,
      month: r.month,
      label: new Date(r.year, r.month - 1, 1).toLocaleString('en', { month: 'short' }),
      gross: Number(r.gross || 0),
      net: Number(r.net || 0),
    }));
    const yearSpend = rows.reduce((s, r) => s + r.gross, 0);
    res.json({ months: rows, year_spend: yearSpend });
  } catch (err) {
    console.error('HR payroll-trend:', err);
    res.status(500).json({ error: 'Failed to load payroll trend' });
  }
});

router.get('/analytics/payroll-by-department', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const result = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(e.department), ''), 'Unassigned') AS department,
              COALESCE(SUM(i.gross),0)::numeric AS gross
       FROM hr_payroll p
       JOIN hr_payroll_items i ON i.payroll_id = p.id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE p.year = $1 AND p.month = $2 ${req.company ? 'AND p.company = $3' : ''}
       GROUP BY 1 ORDER BY gross DESC`,
      req.company ? [year, month, req.company] : [year, month]
    );
    res.json(result.rows.map((r) => ({ department: r.department, gross: Number(r.gross || 0) })));
  } catch (err) {
    console.error('HR payroll-by-department:', err);
    res.status(500).json({ error: 'Failed to load payroll by department' });
  }
});

router.get('/analytics/people-snapshot', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    res.json(await peopleSnapshot(year, month, req.company));
  } catch (err) {
    console.error('HR people snapshot:', err);
    res.status(500).json({ error: 'Failed to load people snapshot' });
  }
});

router.get('/analytics/attendance-health', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    res.json(await attendanceHealth(year, month, req.company));
  } catch (err) {
    console.error('HR attendance health:', err);
    res.status(500).json({ error: 'Failed to load attendance health' });
  }
});

router.get('/analytics/leave-overview', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    res.json(await leaveOverview(year, req.company));
  } catch (err) {
    console.error('HR leave overview:', err);
    res.status(500).json({ error: 'Failed to load leave overview' });
  }
});

router.get('/analytics/payroll-intelligence', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    res.json(await payrollIntelligence(year, month, req.company));
  } catch (err) {
    console.error('HR payroll intelligence:', err);
    res.status(500).json({ error: 'Failed to load payroll intelligence' });
  }
});

router.get('/analytics/dashboard-extras', async (req, res) => {
  try {
    const { workingDaysInMonth } = await import('../utils/hrGps.js');
    const company = req.company;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prev = new Date(year, month - 2, 1);
    const working = workingDaysInMonth(year, month);
    const [emp, present, payrollThis, payrollLast, spark] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM hr_employees WHERE status = 'active' ${company ? 'AND company = $1' : ''}`, company ? [company] : []),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM hr_attendance a
         JOIN hr_employees e ON e.id = a.employee_id
         WHERE EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
           AND LOWER(a.status) IN ('present','late','half-day') ${company ? 'AND e.company = $3' : ''}`,
        company ? [year, month, company] : [year, month]
      ),
      pool.query(
        `SELECT COALESCE(SUM(i.gross),0)::numeric AS gross
         FROM hr_payroll p JOIN hr_payroll_items i ON i.payroll_id = p.id
         WHERE p.year = $1 AND p.month = $2 ${company ? 'AND p.company = $3' : ''}`,
        company ? [year, month, company] : [year, month]
      ),
      pool.query(
        `SELECT COALESCE(SUM(i.gross),0)::numeric AS gross
         FROM hr_payroll p JOIN hr_payroll_items i ON i.payroll_id = p.id
         WHERE p.year = $1 AND p.month = $2 ${company ? 'AND p.company = $3' : ''}`,
        company ? [prev.getFullYear(), prev.getMonth() + 1, company] : [prev.getFullYear(), prev.getMonth() + 1]
      ),
      pool.query(
        `SELECT to_char(date_trunc('month', COALESCE(start_date, created_at)), 'YYYY-MM') AS ym, COUNT(*)::int AS n
         FROM hr_employees WHERE status = 'active' ${company ? 'AND company = $1' : ''}
         GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
        company ? [company] : []
      ),
    ]);
    const possible = emp.rows[0].n * working;
    const attendanceRate = possible > 0 ? Math.round((present.rows[0].n / possible) * 1000) / 10 : 0;
    const thisGross = Number(payrollThis.rows[0].gross || 0);
    const lastGross = Number(payrollLast.rows[0].gross || 0);
    const payrollDelta = lastGross > 0 ? Math.round(((thisGross - lastGross) / lastGross) * 1000) / 10 : 0;
    res.json({
      attendance_rate: attendanceRate,
      payroll_gross: thisGross,
      payroll_delta_pct: payrollDelta,
      sparkline: [...spark.rows].reverse(),
    });
  } catch (err) {
    console.error('HR dashboard extras:', err);
    res.status(500).json({ error: 'Failed to load dashboard extras' });
  }
});

router.get('/reports/monthly-summary', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const data = await monthlySummaryReport(year, month, req.company);
    res.json({
      ...data,
      total_leave_days: data.leave.by_type.reduce((s, r) => s + Number(r.days || 0), 0),
      attendance_rate: data.attendance.attendance_rate,
      payroll_total: data.payroll.gross,
      payroll_net_total: data.payroll.net,
    });
  } catch (err) {
    console.error('HR monthly-summary report:', err);
    res.status(500).json({ error: 'Failed to load monthly summary' });
  }
});

router.get('/reports/attendance', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    const department = String(req.query.department || '').trim();
    const employeeId = req.query.employee_id ? Number(req.query.employee_id) : null;
    res.json(await attendanceReport(year, month, department, employeeId, req.company));
  } catch (err) {
    console.error('HR attendance report:', err);
    res.status(500).json({ error: 'Failed to load attendance report' });
  }
});

router.get('/reports/payroll', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const month = toNum(req.query.month, new Date().getMonth() + 1);
    res.json(await payrollReport(year, month, req.company));
  } catch (err) {
    console.error('HR payroll report:', err);
    res.status(500).json({ error: 'Failed to load payroll report' });
  }
});

router.get('/reports/leave', async (req, res) => {
  try {
    const year = toNum(req.query.year, new Date().getFullYear());
    const leaveType = String(req.query.leave_type || '').trim();
    const department = String(req.query.department || '').trim();
    res.json(await leaveReport(year, leaveType, department, req.company));
  } catch (err) {
    console.error('HR leave report:', err);
    res.status(500).json({ error: 'Failed to load leave report' });
  }
});

router.get('/reports/employee-directory', async (req, res) => {
  try {
    const department = String(req.query.department || '').trim();
    const employmentType = String(req.query.employment_type || '').trim();
    const status = String(req.query.status || '').trim() || 'active';
    res.json(await directoryReport(department, employmentType, status, req.company));
  } catch (err) {
    console.error('HR employee-directory:', err);
    res.status(500).json({ error: 'Failed to load directory' });
  }
});

export default router;
