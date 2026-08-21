import pool from '../db.js';
import {
  DEFAULT_PAYROLL_SETTINGS,
  DEFAULT_TAX_BANDS,
  DEFAULT_TAX_RELIEFS,
  calculateNetPay,
  normalizeTaxBands,
  normalizeTaxReliefDefaults,
  roundMoney,
} from './payrollCalculator.js';

export async function getPayrollSettings() {
  const result = await pool.query(`SELECT * FROM hr_payroll_settings ORDER BY id ASC LIMIT 1`);
  const row = result.rows[0];
  if (!row) {
    return { ...DEFAULT_PAYROLL_SETTINGS, id: null };
  }
  return getPayrollSettingsFromRow(row);
}

export async function savePayrollSettings(body, actorId) {
  const current = await getPayrollSettings();
  const ssnitEmployee = Number(body.ssnit_employee_rate ?? current.ssnit_employee_rate);
  const ssnitEmployer = Number(body.ssnit_employer_rate ?? current.ssnit_employer_rate);
  const taxBands = normalizeTaxBands(body.tax_bands ?? current.tax_bands);
  const allowanceTypes = Array.isArray(body.allowance_types) ? body.allowance_types : current.allowance_types;
  const deductionTypes = Array.isArray(body.deduction_types) ? body.deduction_types : current.deduction_types || [];
  const taxReliefDefaults = normalizeTaxReliefDefaults(
    body.tax_relief_defaults ?? current.tax_relief_defaults ?? DEFAULT_TAX_RELIEFS
  );
  if (current.id) {
    const result = await pool.query(
      `UPDATE hr_payroll_settings SET
         ssnit_employee_rate = $1,
         ssnit_employer_rate = $2,
         tax_bands = $3::jsonb,
         allowance_types = $4::jsonb,
         tax_relief_defaults = $5::jsonb,
         deduction_types = $6::jsonb,
         updated_by = $7,
         updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [
        ssnitEmployee,
        ssnitEmployer,
        JSON.stringify(taxBands),
        JSON.stringify(allowanceTypes),
        JSON.stringify(taxReliefDefaults),
        JSON.stringify(deductionTypes),
        actorId || null,
        current.id,
      ]
    );
    return getPayrollSettingsFromRow(result.rows[0]);
  }
  const created = await pool.query(
    `INSERT INTO hr_payroll_settings
       (ssnit_employee_rate, ssnit_employer_rate, tax_bands, allowance_types, tax_relief_defaults, deduction_types, updated_by)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7) RETURNING *`,
    [
      ssnitEmployee,
      ssnitEmployer,
      JSON.stringify(taxBands),
      JSON.stringify(allowanceTypes),
      JSON.stringify(taxReliefDefaults),
      JSON.stringify(deductionTypes),
      actorId || null,
    ]
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
    deduction_types: Array.isArray(row.deduction_types) ? row.deduction_types : [],
    tax_relief_defaults: normalizeTaxReliefDefaults(row.tax_relief_defaults || DEFAULT_TAX_RELIEFS),
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

export async function reliefsForEmployee(employeeId) {
  const result = await pool.query(
    `SELECT * FROM hr_employee_reliefs WHERE employee_id = $1 AND is_active = TRUE ORDER BY id`,
    [employeeId]
  );
  return result.rows.map(mapRelief);
}

export async function reliefsByEmployeeIds(employeeIds) {
  const map = new Map();
  if (!employeeIds.length) return map;
  const result = await pool.query(
    `SELECT * FROM hr_employee_reliefs WHERE employee_id = ANY($1::int[]) AND is_active = TRUE`,
    [employeeIds]
  );
  for (const r of result.rows) {
    const eid = Number(r.employee_id);
    const list = map.get(eid) || [];
    list.push(mapRelief(r));
    map.set(eid, list);
  }
  return map;
}

function mapRelief(r) {
  return {
    id: r.id,
    relief_name: r.relief_name,
    annual_amount: Number(r.annual_amount || 0),
    monthly_amount: Number(r.monthly_amount || 0),
    is_active: r.is_active !== false,
    notes: r.notes,
  };
}

export async function deductionsForEmployee(employeeId, asOfDate = null) {
  const params = [employeeId];
  let extra = '';
  if (asOfDate) {
    params.push(asOfDate);
    extra = ` AND (effective_from IS NULL OR effective_from <= $2)
              AND (effective_to IS NULL OR effective_to >= $2)`;
  }
  const result = await pool.query(
    `SELECT * FROM hr_employee_deductions
     WHERE employee_id = $1 AND is_active = TRUE AND COALESCE(is_loan, FALSE) = FALSE ${extra}
     ORDER BY id`,
    params
  );
  return result.rows.map(mapDeduction);
}

export async function deductionsByEmployeeIds(employeeIds, asOfDate = null) {
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
    `SELECT * FROM hr_employee_deductions
     WHERE employee_id = ANY($1::int[]) AND is_active = TRUE AND COALESCE(is_loan, FALSE) = FALSE ${extra}`,
    params
  );
  for (const r of result.rows) {
    const eid = Number(r.employee_id);
    const list = map.get(eid) || [];
    list.push(mapDeduction(r));
    map.set(eid, list);
  }
  return map;
}

function mapDeduction(r) {
  return {
    id: r.id,
    deduction_name: r.deduction_name,
    deduction_type: r.deduction_type || 'fixed',
    value: Number(r.value || 0),
    is_loan: !!r.is_loan,
    total_loan_amount: r.total_loan_amount != null ? Number(r.total_loan_amount) : null,
    remaining_balance: r.remaining_balance != null ? Number(r.remaining_balance) : null,
    auto_stop: r.auto_stop !== false,
    is_active: r.is_active !== false,
    effective_from: r.effective_from,
    effective_to: r.effective_to,
  };
}

export function mapAdvance(r) {
  return {
    id: r.id,
    employee_id: Number(r.employee_id),
    loan_amount: Number(r.loan_amount || 0),
    monthly_deduction: Number(r.monthly_deduction || 0),
    remaining_balance: Number(r.remaining_balance || 0),
    paid_so_far: Number(r.paid_so_far || 0),
    start_month: Number(r.start_month),
    start_year: Number(r.start_year),
    notes: r.notes,
    auto_stop: r.auto_stop !== false,
    status: r.status || 'active',
    deduction_name: 'Salary Advance Repayment',
  };
}

/** Active advances due for a payroll month/year. */
export async function advancesByEmployeeIds(employeeIds, month, year) {
  const map = new Map();
  if (!employeeIds.length) return map;
  const result = await pool.query(
    `SELECT * FROM hr_salary_advances
     WHERE employee_id = ANY($1::int[])
       AND status = 'active'
       AND remaining_balance > 0
       AND (start_year < $2 OR (start_year = $2 AND start_month <= $3))`,
    [employeeIds, year, month]
  );
  for (const r of result.rows) {
    const eid = Number(r.employee_id);
    const list = map.get(eid) || [];
    list.push(mapAdvance(r));
    map.set(eid, list);
  }
  return map;
}

export function mergeAllowances(base, extra = []) {
  return [...(base || []), ...(extra || [])];
}

export async function calculateEmployeePayroll(emp, settings, extraAllowances = [], asOfDate = null, month = null, year = null) {
  const [configured, reliefs, deductions] = await Promise.all([
    allowancesForEmployee(emp.id, asOfDate),
    reliefsForEmployee(emp.id),
    deductionsForEmployee(emp.id, asOfDate),
  ]);
  let advances = [];
  if (month && year) {
    const map = await advancesByEmployeeIds([emp.id], month, year);
    advances = map.get(Number(emp.id)) || [];
  }
  return calculateNetPay(emp, mergeAllowances(configured, extraAllowances), settings, {
    reliefs,
    deductions,
    advances,
  });
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
      acc.other_deductions += Number(c.other_deductions || 0);
      acc.net += Number(c.net_pay || 0);
      return acc;
    },
    {
      basic: 0,
      allowances: 0,
      gross: 0,
      ssnit_employee: 0,
      ssnit_employer: 0,
      taxable_income: 0,
      paye: 0,
      other_deductions: 0,
      net: 0,
    }
  );
}

export function roundTotals(totals) {
  const out = {};
  for (const [k, v] of Object.entries(totals)) out[k] = roundMoney(v);
  return out;
}
