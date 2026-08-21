import React from 'react';
import { formatGhs } from '@/lib/taxCalculations';
import { parseJsonArray, sumOtherDeductions } from '@/lib/payrollDisplay';

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function empCode(id: number | string) {
  return `EMP-${String(id).padStart(3, '0')}`;
}

function labelForDeduction(d: any) {
  const name = d.name || d.deduction_name || 'Deduction';
  if (d.is_advance || (d.is_loan && /advance|loan/i.test(name))) {
    return name.includes('Advance') || name.includes('Loan') ? name : `Salary Advance Repayment — ${name}`;
  }
  if (d.is_loan) return `${name} (loan repayment)`;
  return name;
}

/** Shared corporate payslip layout (screen + print). Matches Puppeteer HTML template. */
export function PayslipView({ slip }: { slip: any }) {
  const breakdown = parseJsonArray(slip.allowance_breakdown);
  const reliefs = parseJsonArray(slip.relief_breakdown);
  const extraDeds = parseJsonArray(slip.deduction_breakdown);
  const otherTotal = sumOtherDeductions(slip);
  const deductionsTotal =
    Number(slip.ssnit_employee || 0) + Number(slip.paye || 0) + otherTotal;
  const period = monthLabel(Number(slip.month), Number(slip.year));
  const paymentDate = slip.paid_at ? new Date(slip.paid_at).toLocaleDateString('en-GB') : '—';

  return (
    <div
      id="payslip"
      className="mx-auto max-w-[720px] space-y-0 bg-[var(--surface)] p-6 text-[var(--text-primary)] print:max-w-none print:p-0"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold tracking-tight text-[var(--primary)]">VOBISS SOLUTIONS LIMITED</p>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Accra, Ghana</p>
          <p className="text-[12px] text-[var(--text-muted)]">Tel: +233 (0) 30 000 0000 · hr@vobissgh.com</p>
        </div>
        <p className="text-xl font-extrabold tracking-[0.08em] text-[var(--primary)]">PAYSLIP</p>
      </div>

      <div className="my-4 h-0.5 bg-[var(--primary)] opacity-80" />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Employee</p>
          <InfoRow label="Full Name" value={slip.full_name} />
          <InfoRow label="Employee ID" value={empCode(slip.employee_id)} />
          <InfoRow label="Job Title" value={slip.position || '—'} />
          <InfoRow label="Department" value={slip.department || '—'} />
        </div>
        <div className="space-y-1.5 text-sm">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Payment Details</p>
          <InfoRow label="Pay Period" value={period} />
          <InfoRow label="Payment Date" value={paymentDate} />
          <InfoRow label="SSNIT Number" value={slip.ssnit_number || '—'} />
          <InfoRow label="Bank Name" value={slip.bank_name || '—'} />
          <InfoRow label="Bank Account" value={slip.bank_account || '—'} />
        </div>
      </div>

      <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-widest text-[var(--primary)]">Earnings</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount (GHS)</th>
          </tr>
        </thead>
        <tbody>
          <MoneyRow label="Basic Salary" amount={slip.basic_salary} />
          {breakdown.length > 0
            ? breakdown.map((a: any, i: number) => (
                <MoneyRow key={i} label={a.name || 'Allowance'} amount={a.amount} />
              ))
            : Number(slip.allowances) > 0 && <MoneyRow label="Allowances" amount={slip.allowances} />}
          <MoneyRow label="GROSS TOTAL" amount={slip.gross ?? slip.gross_pay} total />
        </tbody>
      </table>

      <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-widest text-[var(--primary)]">Deductions</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)] text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount (GHS)</th>
          </tr>
        </thead>
        <tbody>
          <MoneyRow label="SSNIT (Employee) — 5.5% of basic" amount={slip.ssnit_employee} />
          {reliefs.map((r: any, i: number) => (
            <MoneyRow
              key={`r-${i}`}
              label={`Tax Relief applied: ${r.name || 'Relief'} (reduces PAYE)`}
              amount={r.monthly_amount}
              muted
            />
          ))}
          <MoneyRow label="PAYE (Income Tax — after reliefs)" amount={slip.paye} />
          {extraDeds.map((d: any, i: number) => (
            <MoneyRow key={`d-${i}`} label={labelForDeduction(d)} amount={d.amount} />
          ))}
          <MoneyRow label="TOTAL DEDUCTIONS" amount={deductionsTotal} total />
        </tbody>
      </table>

      <div className="mt-6 flex items-center justify-between rounded-[var(--radius)] border-2 border-[var(--primary)] bg-[var(--surface-secondary)] px-4 py-4">
        <span className="text-sm font-bold tracking-wide text-[var(--primary)]">NET PAY</span>
        <span className="text-2xl font-extrabold tracking-tight">{formatGhs(slip.net_pay)}</span>
      </div>

      <div className="mt-6 border-t border-[var(--border)] pt-4 text-center text-[11px] text-[var(--text-muted)]">
        <p>This payslip is computer generated and requires no signature.</p>
        <p className="mt-1 font-medium text-[var(--text-secondary)]">
          VOBISS SOLUTIONS LIMITED · Generated {new Date().toLocaleDateString('en-GB')}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[var(--border)] py-1">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

function MoneyRow({
  label,
  amount,
  total,
  muted,
}: {
  label: string;
  amount: any;
  total?: boolean;
  muted?: boolean;
}) {
  return (
    <tr
      className={
        total
          ? 'border-t-2 border-[var(--primary)] bg-[var(--surface-secondary)] font-bold'
          : muted
            ? 'border-b border-[var(--border)] text-[var(--text-muted)]'
            : 'border-b border-[var(--border)]'
      }
    >
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">{formatGhs(amount)}</td>
    </tr>
  );
}

export default PayslipView;
