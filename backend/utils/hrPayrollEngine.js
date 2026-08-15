import pool from '../db.js';
import {
  DEFAULT_PAYROLL_SETTINGS,
  DEFAULT_TAX_BANDS,
  calculateNetPay,
  normalizeTaxBands,
  roundMoney,
} from './payrollCalculator.js';

export async function getPayrollSettings() {
  const result = await pool.query(`SELECT * FROM hr_payroll_settings ORDER BY id ASC LIMIT 1`);
  const row = result.rows[0];
  if (!row) {
    return { ...DEFAULT_PAYROLL_SETTINGS, id: null };
  }
  return {
    id: row.id,
    ssnit_employee_rate: Number(row.ssnit_employee_rate ?? 5.5),
    ssnit_employer_rate: Number(row.ssnit_employer_rate ?? 13),
    tax_bands: normalizeTaxBands(row.tax_bands || DEFAULT_TAX_BANDS),
    allowance_types: Array.isArray(row.allowance_types) ? row.allowance_types : [],
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

export async function savePayrollSettings(body, actorId) {
  const current = await getPayrollSettings();
  const ssnitEmployee = Number(body.ssnit_employee_rate ?? current.ssnit_employee_rate);
  const ssnitEmployer = Number(body.ssnit_employer_rate ?? current.ssnit_employer_rate);
  const taxBands = normalizeTaxBands(body.tax_bands ?? current.tax_bands);
  const allowanceTypes = Array.isArray(body.allowance_types) ? body.allowance_types : current.allowance_types;
  if (current.id) {
    const result = await pool.query(
      `UPDATE hr_payroll_settings SET
         ssnit_employee_rate = $1,
         ssnit_employer_rate = $2,
         tax_bands = $3::jsonb,
         allowance_types = $4::jsonb,
         updated_by = $5,
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [ssnitEmployee, ssnitEmployer, JSON.stringify(taxBands), JSON.stringify(allowanceTypes), actorId || null, current.id]
    );
    return getPayrollSettingsFromRow(result.rows[0]);
  }
  const created = await pool.query(
    `INSERT INTO hr_payroll_settings (ssnit_employee_rate, ssnit_employer_rate, tax_bands, allowance_types, updated_by)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5) RETURNING *`,
    [ssnitEmployee, ssnitEmployer, JSON.stringify(taxBands), JSON.stringify(allowanceTypes), actorId || null]
  );
  return getPayrollSettingsFromRow(created.rows[0]);
}

function getPayrollSettingsFromRow(row) {
  return {
    id: row.id,
    ssnit_employee_rate: Number(row.ssnit_employee_rate ?? 5.5),
    ssnit_employer_rate: Number(row.ssnit_employer_rate ?? 13),
    tax_bands: normalizeTaxBands(row.tax_bands || DEFAULT_TAX_BANDS),
    allowance_types: Array.isArray(row.allowance_types) ? row.allowance_types : [],
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

export async function allowancesForEmployee(employeeId, asOfDate = null) {
  const params = [employeeId];
  let extra = '';
  if (asOfDate) {
    params.push(asOfDate);
    extra = ` AND (effective_from IS NULL OR effective_from <= $2)
              AND (effective_to IS NULL OR effective_to >= $2)`;
  }
  const result = await pool.query(
    `SELECT * FROM hr_employee_allowances WHERE employee_id = $1 ${extra} ORDER BY id`,
    params
  );
  return result.rows.map((r) => ({
    id: r.id,
    allowance_name: r.allowance_name,
    type: r.allowance_type || 'fixed',
    value: Number(r.value || 0),
    taxable: r.taxable !== false,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
  }));
}

export async function allowancesByEmployeeIds(employeeIds, asOfDate = null) {
  const map = new Map();
  if (!employeeIds.length) return map;
  const params = [employeeIds];
  let extra = '';
  if (asOfDate) {
    params.push(asOfDate);
    extra = ` AND (effective_from IS NULL OR effective_from <= $2)
              AND (effective_to IS NULL OR effective_to >= $2)`;
  }
  const result = await pool.query(
    `SELECT * FROM hr_employee_allowances WHERE employee_id = ANY($1::int[]) ${extra}`,
    params
  );
  for (const r of result.rows) {
    const eid = Number(r.employee_id);
    const list = map.get(eid) || [];
    list.push({
      id: r.id,
      allowance_name: r.allowance_name,
      type: r.allowance_type || 'fixed',
      value: Number(r.value || 0),
      taxable: r.taxable !== false,
    });
    map.set(eid, list);
  }
  return map;
}

export function mergeAllowances(base, extra = []) {
  return [...(base || []), ...(extra || [])];
}

export async function calculateEmployeePayroll(emp, settings, extraAllowances = [], asOfDate = null) {
  const configured = await allowancesForEmployee(emp.id, asOfDate);
  return calculateNetPay(emp, mergeAllowances(configured, extraAllowances), settings);
}

export function totalsFromCalcs(calcs) {
  return calcs.reduce(
    (acc, c) => {
      acc.basic += Number(c.basic_salary || 0);
      acc.allowances += Number(c.allowances || 0);
      acc.gross += Number(c.gross_pay || 0);
      acc.ssnit_employee += Number(c.ssnit_employee || 0);
      acc.ssnit_employer += Number(c.ssnit_employer || 0);
      acc.taxable_income += Number(c.taxable_income || 0);
      acc.paye += Number(c.paye || 0);
      acc.net += Number(c.net_pay || 0);
      return acc;
    },
    { basic: 0, allowances: 0, gross: 0, ssnit_employee: 0, ssnit_employer: 0, taxable_income: 0, paye: 0, net: 0 }
  );
}

export function roundTotals(totals) {
  const out = {};
  for (const [k, v] of Object.entries(totals)) out[k] = roundMoney(v);
  return out;
}
