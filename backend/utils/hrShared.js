import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { createUser, createNotification } from '../db.js';
import { emitToUser } from '../realtime/channels.js';
import { ensureLeaveBalances, logHrActivity, LEAVE_TYPES } from '../db/hr.js';
import { defaultUnitsForRole } from '../roles.js';
import { buildSimpleLetterPdf } from './simplePdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const hrUploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(hrUploadsDir)) fs.mkdirSync(hrUploadsDir, { recursive: true });

export const FORM_TYPES = [
  'Reference Letter',
  'Employment Confirmation Letter',
  'Salary Advance Request',
  'Transfer Request',
  'Complaint/Grievance',
];

export const LETTER_FORM_TYPES = ['Reference Letter', 'Employment Confirmation Letter'];

export const SYSTEM_ROLE_OPTIONS = [
  { label: 'NOC Engineer', value: 'noc' },
  { label: 'IP Engineer', value: 'ip' },
  { label: 'TS Engineer', value: 'ts' },
  { label: 'Finance Officer', value: 'finance' },
  { label: 'CX / Support', value: 'cx' },
  { label: 'Project Unit', value: 'project_unit' },
  { label: 'HR', value: 'hr' },
  { label: 'Admin', value: 'admin' },
  { label: 'Director', value: 'director' },
  { label: 'No System Access', value: '' },
];

export function ghanaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Accra' }));
}

export function ghanaToday() {
  return ghanaNow().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

export function ghanaYear() {
  return ghanaNow().getFullYear();
}

export function defaultHrPassword() {
  return `Vobiss@${ghanaYear()}`;
}

export function isoDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

export function countWeekdays(start, end) {
  const s = isoDateOnly(start);
  const e = isoDateOnly(end);
  if (!s || !e) return 0;
  const [sy, sm, sd] = s.split('-').map(Number);
  const [ey, em, ed] = e.split('-').map(Number);
  const from = Date.UTC(sy, sm - 1, sd);
  const to = Date.UTC(ey, em - 1, ed);
  if (to < from) return 0;
  let days = 0;
  for (let t = from; t <= to; t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

export function normalizeLeaveType(value) {
  const raw = String(value || '').trim();
  const key = raw.toLowerCase().replace(/\s+leave$/i, '').trim();
  const map = {
    annual: 'Annual',
    sick: 'Sick',
    emergency: 'Emergency',
    maternity: 'Maternity',
    paternity: 'Paternity',
    unpaid: 'Unpaid',
  };
  if (map[key]) return map[key];
  if (LEAVE_TYPES.includes(raw)) return raw;
  return null;
}

export function mapHrSystemRole(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v || v === 'null' || v === 'none') return null;
  if (v === 'project_unit' || v === 'project') return { role: 'project', unit: 'project' };
  if (v === 'tx' || v === 'ts') return { role: 'field_engineer', unit: 'ts' };
  if (v === 'noc') return { role: 'noc', unit: 'noc' };
  if (v === 'ip') return { role: 'ip', unit: 'ip' };
  if (v === 'cx') return { role: 'cx', unit: 'cx' };
  if (v === 'finance') return { role: 'finance', unit: 'finance' };
  if (v === 'hr') return { role: 'hr', unit: null };
  if (v === 'admin') return { role: 'admin', unit: null };
  if (v === 'director') return { role: 'director', unit: null };
  return null;
}

export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'Staff', last: 'Member' };
  if (parts.length === 1) return { first: parts[0], last: 'Staff' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function publicUploadUrl(filename) {
  if (!filename) return null;
  return `/uploads/${path.basename(filename)}`;
}

export async function notifyUser(userId, title, message, linkUrl = '/workspace') {
  if (!userId) return;
  try {
    const notif = await createNotification(title, message, null, {
      targetUserId: userId,
      linkUrl,
      notificationType: 'hr',
    });
    emitToUser(userId, 'staff:realtime', {
      topic: 'notifications',
      action: 'new',
      id: notif.id,
      title,
      body: message,
      url: linkUrl,
    });
  } catch (err) {
    console.warn('[hr notify]', err.message);
  }
}

export async function notifyHrUsers(title, message, linkUrl = '/hr/leave') {
  const result = await pool.query(
    `SELECT id FROM users
     WHERE deleted_at IS NULL
       AND COALESCE(status, 'active') = 'active'
       AND (
         LOWER(COALESCE(role, '')) = 'hr'
         OR LOWER(COALESCE(main_role, '')) = 'hr'
         OR roles @> '["hr"]'::jsonb
       )`
  );
  for (const row of result.rows) {
    await notifyUser(row.id, title, message, linkUrl);
  }
}

export async function setUserLoginStatus(userId, status) {
  if (!userId) return;
  const next = status === true ? 'active' : status === false ? 'inactive' : String(status || 'active').toLowerCase();
  await pool.query(
    `UPDATE users SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL`,
    [next, userId]
  );
}

export async function syncEmployeeUserStatus(employee) {
  if (!employee?.user_id) return;
  const empStatus = String(employee.status || '').toLowerCase();
  const next = empStatus === 'inactive' || empStatus === 'suspended' ? empStatus : 'active';
  await setUserLoginStatus(employee.user_id, next);
}

export async function suspendEmployeeAccount(employee, reason) {
  const text = String(reason || '').trim();
  await pool.query(
    `UPDATE hr_employees
     SET status = 'suspended', suspension_reason = $1, suspended_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [text, employee.id]
  );
  if (employee.user_id) {
    await pool.query(
      `UPDATE users
       SET status = 'suspended',
           suspension_reason = $1,
           suspended_at = CURRENT_TIMESTAMP,
           unsuspend_ack = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND deleted_at IS NULL`,
      [text, employee.user_id]
    );
  }
}

export async function unsuspendEmployeeAccount(employee, reason) {
  const text = String(reason || '').trim();
  await pool.query(
    `UPDATE hr_employees
     SET status = 'active', unsuspend_reason = $1, unsuspended_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [text, employee.id]
  );
  if (employee.user_id) {
    await pool.query(
      `UPDATE users
       SET status = 'active',
           unsuspend_reason = $1,
           unsuspended_at = CURRENT_TIMESTAMP,
           unsuspend_ack = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND deleted_at IS NULL`,
      [text, employee.user_id]
    );
  }
}

async function applyEmployeeAccess(userId, mapped, emp) {
  const units = [...new Set([
    ...(mapped.unit ? [mapped.unit] : []),
    ...defaultUnitsForRole(mapped.role),
  ])];
  await pool.query(
    `UPDATE users SET
       role = $1,
       main_role = $1,
       roles = jsonb_build_array($2::text),
       units = $3::jsonb,
       unit = COALESCE($4, unit),
       position = COALESCE($5, position),
       phone = COALESCE($6, phone),
       department = COALESCE($7, department),
       status = 'active',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $8 AND deleted_at IS NULL`,
    [
      mapped.role,
      mapped.role,
      JSON.stringify(units),
      mapped.unit,
      emp.position || null,
      emp.phone || null,
      emp.department || null,
      userId,
    ]
  );
  try {
    const { ensureUserChatMembership } = await import('../services/chatInit.js');
    await ensureUserChatMembership(userId, [mapped.role]);
  } catch (err) {
    console.warn('[hr] chat membership for provisioned user failed:', err.message);
  }
}

export async function provisionEmployeeUser(emp, systemRole, actorId, ip) {
  const mapped = mapHrSystemRole(systemRole);
  if (!mapped) return { userId: emp.user_id || null, created: false, linked: false, emailed: false };

  const email = String(emp.email || '').trim().toLowerCase();
  if (!email) {
    throw new Error('Email is required to create a system account');
  }

  const existing = await pool.query(
    `SELECT id, role, main_role FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
    [email]
  );

  let userId;
  let created = false;
  let linked = false;
  let plainPassword = null;

  if (existing.rowCount > 0) {
    userId = existing.rows[0].id;
    linked = true;
    const currentRole = String(existing.rows[0].main_role || existing.rows[0].role || '').toLowerCase();
    if (currentRole === 'superadmin') {
      await pool.query(
        `UPDATE users SET
           phone = COALESCE($1, phone),
           department = COALESCE($2, department),
           status = COALESCE(status, 'active'),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [emp.phone || null, emp.department || null, userId]
      );
    } else {
      await applyEmployeeAccess(userId, mapped, emp);
    }
  } else {
    const { first, last } = splitFullName(emp.full_name);
    plainPassword = defaultHrPassword();
    const units = [...new Set([
      ...(mapped.unit ? [mapped.unit] : []),
      ...defaultUnitsForRole(mapped.role),
    ])];
    const user = await createUser(first, last, email, mapped.role, actorId, ip, {
      password: plainPassword,
      sendEmail: false,
      unit: mapped.unit,
      position: emp.position || null,
      units,
    });
    userId = user.id;
    created = true;
    await applyEmployeeAccess(userId, mapped, emp);
  }

  await pool.query(`UPDATE hr_employees SET user_id = $1 WHERE id = $2`, [userId, emp.id]);
  return { userId, created, linked, emailed: false, plainPassword };
}

export async function remainingLeaveDays(employeeId, leaveType, year) {
  await ensureLeaveBalances(pool, employeeId, year);
  const result = await pool.query(
    `SELECT total_days, used_days FROM hr_leave_balances
     WHERE employee_id = $1 AND leave_type = $2 AND year = $3`,
    [employeeId, leaveType, year]
  );
  const row = result.rows[0];
  if (!row) return 0;
  return Math.max(Number(row.total_days || 0) - Number(row.used_days || 0), 0);
}

export async function deductLeaveDays(employeeId, leaveType, days, year) {
  await ensureLeaveBalances(pool, employeeId, year);
  await pool.query(
    `UPDATE hr_leave_balances SET used_days = used_days + $1
     WHERE employee_id = $2 AND leave_type = $3 AND year = $4`,
    [days, employeeId, leaveType, year]
  );
}

function formatLongDate(iso) {
  const d = isoDateOnly(iso) || ghanaToday();
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export async function generateHrLetterPdf(formRequest, employee) {
  const isReference = formRequest.form_type === 'Reference Letter';
  const title = isReference ? 'Employment Reference Letter' : 'Employment Confirmation Letter';
  const start = isoDateOnly(employee.start_date);
  const tenure = start ? `since ${formatLongDate(start)}` : 'with our organisation';
  const paragraphs = [
    `Date: ${formatLongDate(ghanaToday())}`,
    '',
    'To Whom It May Concern,',
    '',
    isReference
      ? `This letter confirms that ${employee.full_name} is employed with Vobiss Solutions as ${employee.position || 'a staff member'} in the ${employee.department || 'organisation'}. ${employee.full_name.split(' ')[0]} has been a valued member of our team ${tenure}.`
      : `This letter confirms that ${employee.full_name} is currently employed with Vobiss Solutions in the position of ${employee.position || 'Staff'} (${employee.department || 'Vobiss'}), ${tenure}.`,
    '',
    formRequest.reason ? `Purpose: ${formRequest.reason}` : '',
    '',
    'Please contact Human Resources should you require any further information.',
    '',
    'Yours faithfully,',
    '',
    '',
    '________________________________',
    'Human Resources',
    'Vobiss Solutions',
  ].filter((line) => line !== undefined);

  const buf = buildSimpleLetterPdf({ title, paragraphs });
  const filename = `hr-letter-${formRequest.id}-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(hrUploadsDir, filename), buf);
  const url = publicUploadUrl(filename);
  await pool.query(`UPDATE hr_form_requests SET generated_file_url = $1 WHERE id = $2`, [url, formRequest.id]);
  return url;
}

export async function getEmployeeByUserId(userId) {
  const result = await pool.query(`SELECT * FROM hr_employees WHERE user_id = $1 LIMIT 1`, [userId]);
  return result.rows[0] || null;
}

function staffFullName(user) {
  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return name || user?.username || 'Staff';
}

export function isAcceptedHrEmployee(emp) {
  if (!emp) return false;
  const review = String(emp.hr_review_status || 'accepted').toLowerCase();
  const status = String(emp.status || '').toLowerCase();
  return review === 'accepted' && status !== 'ignored' && status !== 'pending';
}

export async function queueUserForHrReview(user) {
  const userId = Number(user?.id);
  if (!userId) return null;
  const role = String(user?.role || user?.main_role || '').toLowerCase();
  if (role === 'customer') return null;

  const existing = await getEmployeeByUserId(userId);
  if (existing) return existing;

  const fullName = staffFullName(user);
  const inserted = await pool.query(
    `INSERT INTO hr_employees (user_id, full_name, email, department, position, employment_type, start_date, status, hr_review_status)
     SELECT $1, $2, $3, $4, $5, 'full-time', CURRENT_DATE, 'pending', 'pending'
     WHERE NOT EXISTS (SELECT 1 FROM hr_employees WHERE user_id = $1)
     RETURNING *`,
    [userId, fullName, user.email || null, user.unit || user.department || null, user.position || 'Staff']
  );
  return inserted.rows[0] || (await getEmployeeByUserId(userId));
}

export async function syncPendingEmployeesFromUsers() {
  await pool.query(
    `INSERT INTO hr_employees (user_id, full_name, email, department, position, employment_type, start_date, status, hr_review_status)
     SELECT
       u.id,
       COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), u.username, 'Staff'),
       u.email,
       COALESCE(u.unit, u.department),
       COALESCE(NULLIF(TRIM(u.position), ''), 'Staff'),
       'full-time',
       CURRENT_DATE,
       'pending',
       'pending'
     FROM users u
     WHERE u.deleted_at IS NULL
       AND LOWER(COALESCE(u.role, u.main_role, '')) <> 'customer'
       AND NOT EXISTS (SELECT 1 FROM hr_employees e WHERE e.user_id = u.id)`
  );
}

export async function ensureEmployeeForUser(user) {
  const userId = Number(user?.id);
  if (!userId) return null;
  const role = String(user?.role || user?.main_role || '').toLowerCase();
  if (role === 'customer') return null;

  const existing = await getEmployeeByUserId(userId);
  if (existing) return isAcceptedHrEmployee(existing) ? existing : null;

  await queueUserForHrReview(user);
  return null;
}

export { logHrActivity };
