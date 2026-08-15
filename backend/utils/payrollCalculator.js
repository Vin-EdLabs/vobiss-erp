/** Ghana PAYE + SSNIT payroll engine. All payroll math goes through these functions. */

export const DEFAULT_TAX_BANDS = [
  { from: 0, to: 490, rate: 0 },
  { from: 490, to: 600, rate: 5 },
  { from: 600, to: 730, rate: 10 },
  { from: 730, to: 3730, rate: 17.5 },
  { from: 3730, to: 20125, rate: 25 },
  { from: 20125, to: null, rate: 35 },
];

export const DEFAULT_PAYROLL_SETTINGS = {
  ssnit_employee_rate: 5.5,
  ssnit_employer_rate: 13.0,
  tax_bands: DEFAULT_TAX_BANDS,
  allowance_types: [],
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

export function calculateNetPay(employee = {}, allowances = [], settings = DEFAULT_PAYROLL_SETTINGS) {
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
  const taxableIncome = roundMoney(Math.max(0, basic + taxableAllowances - employeeSSNIT));
  const paye = calculatePAYE(taxableIncome, settings.tax_bands || DEFAULT_TAX_BANDS);
  const netPay = roundMoney(gross - employeeSSNIT - paye);

  return {
    basic_salary: basic,
    allowances: totalAllowances,
    allowance_breakdown: breakdown,
    gross_pay: gross,
    ssnit_employee: employeeSSNIT,
    ssnit_employer: employerSSNIT,
    taxable_income: taxableIncome,
    paye,
    net_pay: netPay,
    deductions_total: roundMoney(employeeSSNIT + paye),
  };
}
