/** Ghana PAYE + SSNIT — keep in sync with backend/utils/taxCalculations.js */

export const SSNIT_EMPLOYER_RATE = 0.135;
export const SSNIT_EMPLOYEE_RATE = 0.055;

export const GHANA_PAYE_BANDS = [
  { limit: 490, rate: 0 },
  { limit: 110, rate: 0.05 },
  { limit: 130, rate: 0.1 },
  { limit: 3000, rate: 0.175 },
  { limit: 16395, rate: 0.25 },
  { limit: Infinity, rate: 0.35 },
] as const;

export function roundMoney(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateSsnit(basicSalary: number) {
  const basic = Math.max(0, Number(basicSalary) || 0);
  return {
    employer: roundMoney(basic * SSNIT_EMPLOYER_RATE),
    employee: roundMoney(basic * SSNIT_EMPLOYEE_RATE),
  };
}

export function calculatePaye(taxableIncome: number) {
  let remaining = Math.max(0, Number(taxableIncome) || 0);
  let tax = 0;
  for (const band of GHANA_PAYE_BANDS) {
    const amount = Math.min(remaining, band.limit);
    tax += amount * band.rate;
    remaining -= amount;
    if (remaining <= 0) break;
  }
  return roundMoney(tax);
}

export function calculatePayrollItem(input: { basicSalary?: number; allowances?: number }) {
  const basic = roundMoney(input.basicSalary || 0);
  const allowances = roundMoney(input.allowances || 0);
  const gross = roundMoney(basic + allowances);
  const ssnit = calculateSsnit(basic);
  const taxableIncome = roundMoney(Math.max(0, gross - ssnit.employee));
  const paye = calculatePaye(taxableIncome);
  const netPay = roundMoney(gross - ssnit.employee - paye);
  return {
    basicSalary: basic,
    allowances,
    gross,
    ssnitEmployer: ssnit.employer,
    ssnitEmployee: ssnit.employee,
    taxableIncome,
    paye,
    netPay,
  };
}

export function formatGhs(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    minimumFractionDigits: 2,
  }).format(roundMoney(value));
}

export function formatGhsCompact(value: number | string | null | undefined) {
  const n = roundMoney(value);
  if (Math.abs(n) >= 1000) return `GHS ${(n / 1000).toFixed(1)}K`;
  return formatGhs(n);
}
