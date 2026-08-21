/** Professional HTML payslip template for Puppeteer PDF rendering. */

const PRIMARY = '#8b5a2b';
const TEXT = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const SURFACE = '#f9fafb';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'GHS 0.00';
  return `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(month, year) {
  return new Date(year, Number(month) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function empCode(id) {
  return `EMP-${String(id || 0).padStart(3, '0')}`;
}

function row(label, amount, opts = {}) {
  const cls = opts.bold ? 'total-row' : '';
  return `<tr class="${cls}"><td>${esc(label)}</td><td class="amt">${esc(amount)}</td></tr>`;
}

function parseJsonArray(value) {
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

function deductionLabel(d) {
  const name = d.name || d.deduction_name || 'Deduction';
  if (d.is_advance) return name.includes('Advance') || name.includes('Loan') ? name : `Salary Advance Repayment`;
  if (d.is_loan) return `${name} (loan repayment)`;
  return name;
}

/**
 * @param {object} slip — payslip payload from DB join
 * @param {{ companyAddress?: string, companyPhone?: string, companyEmail?: string }} [meta]
 */
export function buildPayslipHtml(slip, meta = {}) {
  const address = meta.companyAddress || 'Accra, Ghana';
  const phone = meta.companyPhone || '+233 (0) 30 000 0000';
  const email = meta.companyEmail || 'hr@vobissgh.com';
  const period = monthLabel(slip.month, slip.year);
  const paymentDate = slip.paid_at
    ? new Date(slip.paid_at).toLocaleDateString('en-GB')
    : '—';
  const generated = new Date().toLocaleString('en-GB');

  const breakdown = parseJsonArray(slip.allowance_breakdown);
  let earningsRows = row('Basic Salary', money(slip.basic_salary));
  if (breakdown.length) {
    for (const a of breakdown) {
      earningsRows += row(a.name || 'Allowance', money(a.amount));
    }
  } else if (Number(slip.allowances) > 0) {
    earningsRows += row('Allowances', money(slip.allowances));
  }
  earningsRows += row('GROSS TOTAL', money(slip.gross ?? slip.gross_pay), { bold: true });

  const reliefs = parseJsonArray(slip.relief_breakdown);
  const extraDeds = parseJsonArray(slip.deduction_breakdown);
  const otherTotal =
    Number(slip.other_deductions) > 0
      ? Number(slip.other_deductions)
      : extraDeds.reduce((s, d) => s + Number(d.amount || 0), 0);
  const deductionsTotal =
    Number(slip.ssnit_employee || 0) + Number(slip.paye || 0) + otherTotal;
  let deductionRows = row('SSNIT (Employee) — 5.5% of basic', money(slip.ssnit_employee));
  for (const r of reliefs) {
    deductionRows += row(`Tax Relief applied: ${r.name || 'Relief'} (reduces PAYE)`, money(r.monthly_amount));
  }
  deductionRows += row('PAYE (Income Tax — after reliefs)', money(slip.paye));
  for (const d of extraDeds) {
    deductionRows += row(deductionLabel(d), money(d.amount));
  }
  deductionRows += row('TOTAL DEDUCTIONS', money(deductionsTotal), { bold: true });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payslip — ${esc(slip.full_name)} — ${esc(period)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      color: ${TEXT};
      font-size: 12px;
      line-height: 1.45;
      padding: 36px 40px;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
    }
    .company-name {
      font-size: 18px;
      font-weight: 700;
      color: ${PRIMARY};
      letter-spacing: 0.02em;
    }
    .company-meta {
      margin-top: 6px;
      color: ${MUTED};
      font-size: 11px;
    }
    .payslip-label {
      font-size: 22px;
      font-weight: 800;
      color: ${PRIMARY};
      letter-spacing: 0.08em;
    }
    .divider {
      height: 2px;
      background: ${PRIMARY};
      margin: 16px 0 20px;
      opacity: 0.85;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px 28px;
      margin-bottom: 22px;
    }
    .info-block h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${MUTED};
      margin-bottom: 8px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 3px 0;
      border-bottom: 1px solid ${BORDER};
    }
    .info-row span:first-child { color: ${MUTED}; }
    .info-row span:last-child { font-weight: 600; text-align: right; }
    .section-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${PRIMARY};
      margin: 18px 0 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid ${BORDER};
    }
    th {
      background: ${SURFACE};
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${MUTED};
    }
    td.amt, th.amt { text-align: right; white-space: nowrap; }
    tr.total-row td {
      background: ${SURFACE};
      font-weight: 700;
      border-top: 2px solid ${PRIMARY};
      border-bottom: none;
    }
    .net-box {
      margin-top: 22px;
      padding: 16px 18px;
      border: 2px solid ${PRIMARY};
      border-radius: 8px;
      background: ${SURFACE};
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .net-box .label {
      font-size: 13px;
      font-weight: 700;
      color: ${PRIMARY};
      letter-spacing: 0.04em;
    }
    .net-box .value {
      font-size: 22px;
      font-weight: 800;
      color: ${TEXT};
    }
    .footer {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid ${BORDER};
      color: ${MUTED};
      font-size: 10px;
      text-align: center;
    }
    .footer strong { color: ${TEXT}; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">VOBISS SOLUTIONS LIMITED</div>
      <div class="company-meta">
        ${esc(address)}<br/>
        Tel: ${esc(phone)} · ${esc(email)}
      </div>
    </div>
    <div class="payslip-label">PAYSLIP</div>
  </div>
  <div class="divider"></div>

  <div class="info-grid">
    <div class="info-block">
      <h3>Employee</h3>
      <div class="info-row"><span>Full Name</span><span>${esc(slip.full_name)}</span></div>
      <div class="info-row"><span>Employee ID</span><span>${esc(empCode(slip.employee_id))}</span></div>
      <div class="info-row"><span>Job Title</span><span>${esc(slip.position || '—')}</span></div>
      <div class="info-row"><span>Department</span><span>${esc(slip.department || '—')}</span></div>
    </div>
    <div class="info-block">
      <h3>Payment Details</h3>
      <div class="info-row"><span>Pay Period</span><span>${esc(period)}</span></div>
      <div class="info-row"><span>Payment Date</span><span>${esc(paymentDate)}</span></div>
      <div class="info-row"><span>SSNIT Number</span><span>${esc(slip.ssnit_number || '—')}</span></div>
      <div class="info-row"><span>Bank Name</span><span>${esc(slip.bank_name || '—')}</span></div>
      <div class="info-row"><span>Bank Account</span><span>${esc(slip.bank_account || '—')}</span></div>
    </div>
  </div>

  <div class="section-title">Earnings</div>
  <table>
    <thead><tr><th>Description</th><th class="amt">Amount (GHS)</th></tr></thead>
    <tbody>${earningsRows}</tbody>
  </table>

  <div class="section-title">Deductions</div>
  <table>
    <thead><tr><th>Description</th><th class="amt">Amount (GHS)</th></tr></thead>
    <tbody>${deductionRows}</tbody>
  </table>

  <div class="net-box">
    <div class="label">NET PAY</div>
    <div class="value">${esc(money(slip.net_pay))}</div>
  </div>

  <div class="footer">
    <p>This payslip is computer generated and requires no signature.</p>
    <p><strong>VOBISS SOLUTIONS LIMITED</strong> · Generated ${esc(generated)}</p>
  </div>
</body>
</html>`;
}

export { money as formatPayslipMoney, monthLabel as payslipMonthLabel, empCode as payslipEmpCode };
