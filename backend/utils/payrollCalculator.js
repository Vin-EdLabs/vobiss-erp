/** Ghana PAYE + SSNIT payroll engine. All payroll math goes through these functions. */

export const DEFAULT_TAX_BANDS = [
  { from: 0, to: 490, rate: 0 },
  { from: 490, to: 600, rate: 5 },
  { from: 600, to: 730, rate: 10 },
  { from: 730, to: 3730, rate: 17.5 },
  { from: 3730, to: 20125, rate: 25 },
  { from: 20125, to: null, rate: 35 },
];

/** Editable GRA-style annual relief defaults (HR can change in settings). */
export const DEFAULT_TAX_RELIEFS = [
  { key: 'marriage', name: 'Marriage Relief', annual_amount: 1200 },
  { key: 'child_education', name: 'Child Education Relief', annual_amount: 600 },
  { key: 'disability', name: 'Disability Relief', annual_amount: 1800 },
  { key: 'old_age', name: 'Old Age Relief (60+)', annual_amount: 1500 },
  { key: 'dependent', name: 'Dependent Relief', annual_amount: 600 },
];

export const DEFAULT_PAYROLL_SETTINGS = {
  ssnit_employee_rate: 5.5,
  ssnit_employer_rate: 13.0,
  tax_bands: DEFAULT_TAX_BANDS,
  allowance_types: [],
  deduction_types: [],
  tax_relief_defaults: DEFAULT_TAX_RELIEFS,
};

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizeTaxBands(bands) {
  const list = Array.isArray(bands) && bands.length ? bands : DEFAULT_TAX_BANDS;
  return [...list]
    .map((b) => ({
      from: Math.max(0, Number(b.from) || 0),
      to: b.to == null || b.to === '' ? null : Number(b.to),
      rate: Number(b.rate) || 0,
    }))
    .sort((a, b) => a.from - b.from);
}

export function normalizeTaxReliefDefaults(list) {
  const source = Array.isArray(list) && list.length ? list : DEFAULT_TAX_RELIEFS;
  return source.map((r) => ({
    key: r.key || String(r.name || '')
      .toLowerCase()
      .replace(/\s+/g, '_'),
    name: r.name || 'Relief',
    annual_amount: roundMoney(r.annual_amount ?? r.annual ?? 0),
  }));
}

export function calculateSSNIT(basicSalary, settings = DEFAULT_PAYROLL_SETTINGS) {
  const basic = Math.max(0, roundMoney(basicSalary));
  const empRate = Number(settings.ssnit_employee_rate ?? DEFAULT_PAYROLL_SETTINGS.ssnit_employee_rate) / 100;
  const erRate = Number(settings.ssnit_employer_rate ?? DEFAULT_PAYROLL_SETTINGS.ssnit_employer_rate) / 100;
  const employeeSSNIT = roundMoney(basic * empRate);
  const employerSSNIT = roundMoney(basic * erRate);
  return {
    employeeSSNIT,
    employerSSNIT,
    totalSSNIT: roundMoney(employeeSSNIT + employerSSNIT),
  };
}

export function calculatePAYE(taxableIncome, taxBands = DEFAULT_TAX_BANDS) {
  let remaining = Math.max(0, roundMoney(taxableIncome));
  let tax = 0;
  for (const band of normalizeTaxBands(taxBands)) {
    if (remaining <= 0) break;
    const bandSize = band.to == null || !Number.isFinite(band.to) ? remaining : Math.max(0, band.to - band.from);
    if (bandSize <= 0) continue;
    const taxableInBand = Math.min(remaining, bandSize);
    tax += taxableInBand * (band.rate / 100);
    remaining -= taxableInBand;
  }
  return roundMoney(Math.max(0, tax));
}

function allowanceAmount(basic, allowance) {
  const value = Number(allowance?.value) || 0;
  const type = String(allowance?.type || allowance?.allowance_type || 'fixed').toLowerCase();
  if (type === 'percentage' || type === '%') return roundMoney(basic * (value / 100));
  return roundMoney(value);
}

function deductionAmount(deduction, { basic, gross, netBeforeExtra }) {
  const value = Number(deduction?.value) || 0;
  const type = String(deduction?.deduction_type || deduction?.type || 'fixed').toLowerCase();
  if (type === 'percentage_basic' || type === 'percent_basic' || type === 'percentage_of_basic') {
    return roundMoney(basic * (value / 100));
  }
  if (type === 'percentage_gross' || type === 'percent_gross' || type === 'percentage_of_gross') {
    return roundMoney(gross * (value / 100));
  }
  // Legacy: plain "percentage" = % of net before extra deductions
  if (type === 'percentage' || type === '%') {
    return roundMoney(netBeforeExtra * (value / 100));
  }
  return roundMoney(value);
}

/**
 * @param {object} employee
 * @param {array} allowances
 * @param {object} settings
 * @param {{ reliefs?: array, deductions?: array, advances?: array }} [options]
 */
export function calculateNetPay(employee = {}, allowances = [], settings = DEFAULT_PAYROLL_SETTINGS, options = {}) {
  const basic = roundMoney(employee.basic_salary ?? employee.basicSalary ?? 0);
  const list = Array.isArray(allowances) ? [...allowances] : [];
  const lump = roundMoney(employee.allowances || 0);
  if (lump > 0 && !list.some((a) => String(a.allowance_name || a.name || '').toLowerCase() === 'allowances')) {
    list.unshift({ allowance_name: 'Allowances', type: 'fixed', value: lump, taxable: true });
  }

  let totalAllowances = 0;
  let taxableAllowances = 0;
  const breakdown = [];
  for (const a of list) {
    const amount = allowanceAmount(basic, a);
    if (amount === 0) continue;
    totalAllowances = roundMoney(totalAllowances + amount);
    const taxable = a.taxable !== false && a.taxable !== 'false' && a.taxable !== 0;
    if (taxable) taxableAllowances = roundMoney(taxableAllowances + amount);
    breakdown.push({
      name: a.allowance_name || a.name || 'Allowance',
      type: String(a.type || a.allowance_type || 'fixed'),
      amount,
      taxable,
    });
  }

  const gross = roundMoney(basic + totalAllowances);
  const { employeeSSNIT, employerSSNIT } = calculateSSNIT(basic, settings);

  const reliefs = Array.isArray(options.reliefs) ? options.reliefs : [];
  const reliefBreakdown = [];
  let monthlyReliefs = 0;
  for (const r of reliefs) {
    if (r.is_active === false) continue;
    const monthly = roundMoney(
      r.monthly_amount != null ? r.monthly_amount : Number(r.annual_amount || 0) / 12
    );
    if (monthly <= 0) continue;
    monthlyReliefs = roundMoney(monthlyReliefs + monthly);
    reliefBreakdown.push({
      id: r.id,
      name: r.relief_name || r.name || 'Tax Relief',
      annual_amount: roundMoney(r.annual_amount || monthly * 12),
      monthly_amount: monthly,
    });
  }

  const taxableIncome = roundMoney(
    Math.max(0, basic + taxableAllowances - employeeSSNIT - monthlyReliefs)
  );
  const paye = calculatePAYE(taxableIncome, settings.tax_bands || DEFAULT_TAX_BANDS);
  const netBeforeExtra = roundMoney(gross - employeeSSNIT - paye);

  const ctx = { basic, gross, netBeforeExtra };
  const deductions = Array.isArray(options.deductions) ? options.deductions : [];
  const deductionBreakdown = [];
  const loanUpdates = [];
  let extraDeductions = 0;

  for (const d of deductions) {
    if (d.is_active === false) continue;
    // Skip loan-flagged rows when dedicated advances are used; still support legacy is_loan
    let amount = deductionAmount(d, ctx);

    if (d.is_loan) {
      const remaining = roundMoney(d.remaining_balance);
      if (remaining <= 0) continue;
      amount = roundMoney(Math.min(amount, remaining));
      if (amount <= 0) continue;
      const nextBalance = roundMoney(Math.max(0, remaining - amount));
      loanUpdates.push({
        id: d.id,
        amount_deducted: amount,
        remaining_balance: nextBalance,
        auto_stop: d.auto_stop !== false,
        deactivate: d.auto_stop !== false && nextBalance <= 0,
        source: 'deduction',
      });
    }

    if (amount <= 0) continue;
    extraDeductions = roundMoney(extraDeductions + amount);
    deductionBreakdown.push({
      id: d.id,
      name: d.deduction_name || d.name || 'Deduction',
      type: String(d.deduction_type || d.type || 'fixed'),
      amount,
      is_loan: !!d.is_loan,
    });
  }

  const advances = Array.isArray(options.advances) ? options.advances : [];
  const advanceUpdates = [];
  for (const adv of advances) {
    if (String(adv.status || 'active').toLowerCase() !== 'active') continue;
    const remaining = roundMoney(adv.remaining_balance);
    if (remaining <= 0) continue;
    let amount = roundMoney(Math.min(Number(adv.monthly_deduction) || 0, remaining));
    if (amount <= 0) continue;
    const nextBalance = roundMoney(Math.max(0, remaining - amount));
    const paidSoFar = roundMoney(Number(adv.paid_so_far || 0) + amount);
    advanceUpdates.push({
      id: adv.id,
      amount_deducted: amount,
      remaining_balance: nextBalance,
      paid_so_far: paidSoFar,
      auto_stop: adv.auto_stop !== false,
      settle: adv.auto_stop !== false && nextBalance <= 0,
    });
    extraDeductions = roundMoney(extraDeductions + amount);
    deductionBreakdown.push({
      id: adv.id,
      name: 'Salary Advance Repayment',
      type: 'fixed',
      amount,
      is_loan: true,
      is_advance: true,
    });
  }

  const netPay = roundMoney(Math.max(0, netBeforeExtra - extraDeductions));

  return {
    basic_salary: basic,
    allowances: totalAllowances,
    allowance_breakdown: breakdown,
    gross_pay: gross,
    ssnit_employee: employeeSSNIT,
    ssnit_employer: employerSSNIT,
    reliefs_total: monthlyReliefs,
    relief_breakdown: reliefBreakdown,
    taxable_income: taxableIncome,
    paye,
    other_deductions: extraDeductions,
    deduction_breakdown: deductionBreakdown,
    loan_updates: loanUpdates,
    advance_updates: advanceUpdates,
    net_pay: netPay,
    deductions_total: roundMoney(employeeSSNIT + paye + extraDeductions),
  };
}
