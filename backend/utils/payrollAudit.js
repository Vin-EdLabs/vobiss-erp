import pool from '../db.js';

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'number' && !Number.isFinite(v)) return null;
      return v;
    });
  } catch (err) {
    console.warn('[payrollAudit] snapshot serialize failed:', err.message || err);
    try {
      return JSON.stringify({ _error: 'snapshot_unserializable', preview: String(value).slice(0, 500) });
    } catch {
      return null;
    }
  }
}

function toIntOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Append-only payroll audit logger.
 * Never throws to callers — failures are console-only so business ops continue.
 */
export async function logPayrollAudit({
  action_type,
  category,
  employee_id = null,
  performed_by = null,
  performed_by_name = null,
  ip_address = null,
  before_snapshot = null,
  after_snapshot = null,
  description,
  payroll_month = null,
  payroll_year = null,
} = {}) {
  try {
    if (!action_type || !category || !description) {
      console.warn('[payrollAudit] skipped incomplete log', { action_type, category, description });
      return null;
    }
    const result = await pool.query(
      `INSERT INTO hr_payroll_audit (
         action_type, category, employee_id, performed_by, performed_by_name,
         ip_address, before_snapshot, after_snapshot, description,
         payroll_month, payroll_year
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)
       RETURNING id, created_at`,
      [
        String(action_type),
        String(category),
        toIntOrNull(employee_id),
        toIntOrNull(performed_by),
        performed_by_name || (performed_by == null ? 'System' : null),
        ip_address != null ? String(ip_address).slice(0, 200) : null,
        toJson(before_snapshot),
        toJson(after_snapshot),
        String(description),
        toIntOrNull(payroll_month),
        toIntOrNull(payroll_year),
      ]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('[payrollAudit] failed to write audit log:', err.message || err);
    return null;
  }
}

export function actorDisplayName(user) {
  if (!user) return 'System';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (user.name) return String(user.name);
  if (user.username) return String(user.username);
  if (user.email) return String(user.email);
  return user.id != null ? `User #${user.id}` : 'System';
}

export function clientIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

/** Convenience: fill performer + IP from Express request. */
export async function auditFromReq(req, fields = {}) {
  return logPayrollAudit({
    ...fields,
    performed_by: fields.performed_by !== undefined ? fields.performed_by : req?.user?.id ?? null,
    performed_by_name:
      fields.performed_by_name !== undefined
        ? fields.performed_by_name
        : actorDisplayName(req?.user),
    ip_address: fields.ip_address !== undefined ? fields.ip_address : clientIp(req),
  });
}

export async function auditSystem(fields = {}) {
  return logPayrollAudit({
    ...fields,
    performed_by: null,
    performed_by_name: 'System',
  });
}

export function fmtGhs(n) {
  const v = Number(n);
  const num = Number.isFinite(v) ? v : 0;
  return `GHS ${num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const ACTION_LABELS = {
  payroll_generated: 'Payroll Generated',
  payroll_regenerated: 'Payroll Regenerated',
  payroll_approved: 'Payroll Approved',
  payroll_marked_paid: 'Payroll Marked Paid',
  payroll_status_reversed: 'Payroll Status Reversed',
  payslip_viewed: 'Payslip Viewed',
  payslip_downloaded: 'Payslip Downloaded',
  payslip_viewed_by_employee: 'Payslip Viewed by Employee',
  payslip_downloaded_by_employee: 'Payslip Downloaded by Employee',
  salary_changed: 'Basic Salary Changed',
  salary_increment_applied: 'Salary Increment Applied',
  allowance_added: 'Allowance Added',
  allowance_edited: 'Allowance Edited',
  allowance_removed: 'Allowance Removed',
  allowance_catalogue_created: 'Allowance Catalogue Created',
  allowance_catalogue_edited: 'Allowance Catalogue Edited',
  allowance_catalogue_deleted: 'Allowance Catalogue Deleted',
  deduction_added: 'Deduction Added',
  deduction_edited: 'Deduction Edited',
  deduction_removed: 'Deduction Removed',
  deduction_activated: 'Deduction Activated',
  deduction_deactivated: 'Deduction Deactivated',
  loan_created: 'Loan Created',
  loan_paused: 'Loan Paused',
  loan_resumed: 'Loan Resumed',
  loan_settled_manually: 'Loan Settled Manually',
  loan_auto_completed: 'Loan Auto-Completed',
  loan_repayment_recorded: 'Loan Repayment Recorded',
  ssnit_employee_rate_changed: 'SSNIT Employee Rate Changed',
  ssnit_employer_rate_changed: 'SSNIT Employer Rate Changed',
  paye_bands_updated: 'PAYE Bands Updated',
  paye_bands_reset: 'PAYE Bands Reset to Ghana Defaults',
};

export function actionLabel(type) {
  return ACTION_LABELS[type] || String(type || 'Action').replace(/_/g, ' ');
}
