import fs from 'fs';
import path from 'path';

/** Professional HTML "C&W Telecom Overtime Payment Request & Authorization Form" template
 *  for Puppeteer PDF rendering — mirrors backend/utils/leaveHtml.js's structure/palette. */

const PRIMARY = '#8b5a2b';
const PRIMARY_DARK = '#6b4520';
const TEXT = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const SURFACE = '#f9fafb';

const logoPath = path.join(process.cwd(), 'vobiss-logo.png');
let logoBase64 = null;
try {
  if (fs.existsSync(logoPath)) logoBase64 = fs.readFileSync(logoPath).toString('base64');
} catch {
  logoBase64 = null;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

const STAGE_LABEL = { supervisor: 'Supervisor', manager: 'Manager', hr: 'HR', finance: 'Finance' };
const ACTION_LABEL = { submitted: 'Submitted', approved: 'Approved', declined: 'Declined', paid: 'Paid' };
const CATEGORY_LABEL = {
  emergency_fault: 'Emergency Fault', planned_maintenance: 'Planned Maintenance',
  weekend_support: 'Weekend Support', public_holiday_support: 'Public Holiday Support',
};
const RATE_LABEL = { standard: 'Standard OT', weekend: 'Weekend Rate', public_holiday: 'Public Holiday Rate', special_approval: 'Special Approval Rate' };
const DOC_TYPE_LABEL = {
  attendance_log: 'Attendance Log', call_out_log: 'Call-Out Log', fault_ticket: 'Fault Ticket',
  maintenance_report: 'Maintenance Report', supervisor_approval: 'Supervisor Approval', other: 'Other',
};

function field(label, value) {
  return `<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value ?? '—')}</span></div>`;
}

/** @param {object} request — result of overtime.js's getRequestDetail() (tickets/documents/history included) */
export function buildOTRequestHtml(request) {
  const statusLabel = request.status === 'paid' ? 'PAID' : request.status === 'declined' ? 'DECLINED' : 'PENDING';
  const statusColor = request.status === 'paid' ? '#15803d' : request.status === 'declined' ? '#b91c1c' : '#b45309';

  const tickets = request.tickets || [];
  const documents = request.documents || [];
  const history = request.history || [];
  const completedApprovals = history.filter((h) => h.action === 'approved' || h.action === 'paid');

  const clients = [...new Set(tickets.map((t) => t.client_name).filter(Boolean))];
  const sites = [...new Set(tickets.map((t) => t.site_name).filter(Boolean))];
  const clientSummary = clients.length === 0 ? '—' : clients.length === 1 ? clients[0] : `Multiple Clients (${clients.length})`;
  const siteSummary = sites.length === 0 ? '—' : sites.length === 1 ? sites[0] : `Multiple Sites (${sites.length}) — see ticket details below`;
  const refs = tickets.filter((t) => t.ticket_ref).map((t) => `${t.ticket_type === 'work_order' ? 'WO' : 'FT'} ${t.ticket_ref}`);

  const ticketRows = tickets.map((t, i) => `
    <div class="ticket-card">
      <div class="ticket-card-head">
        <span class="ticket-index">Ticket ${i + 1}</span>
        <span class="ticket-type-pill">${t.ticket_type === 'work_order' ? 'Work Order' : 'Fault Ticket'}${t.ticket_ref ? ` · ${esc(t.ticket_ref)}` : ''}</span>
      </div>
      <div class="grid-4">
        ${field('Client', t.client_name)}
        ${field('Site / Station', t.site_name)}
        ${field('Region / Area', t.region)}
        ${field('Day Type', String(t.day_type || '').replace('_', ' '))}
      </div>
      <div class="grid-4" style="margin-top:8px;">
        ${field('Digital Address', t.digital_address)}
        ${field('OT Date', formatDate(t.ot_date))}
        ${field('Start Time', t.start_time)}
        ${field('End Time', t.end_time)}
      </div>
      <div class="grid-4" style="margin-top:8px;">
        ${field('Hours Worked', `${t.hours_worked}h`)}
      </div>
      <div style="margin-top:8px;">
        <div class="field-label">Work Summary</div>
        <div class="reason-box">${esc(t.work_summary || '—')}</div>
      </div>
    </div>`).join('');

  const docRows = documents.map((d) => `
    <tr>
      <td>${esc(DOC_TYPE_LABEL[d.document_type] || d.document_type)}${d.other_label ? ` (${esc(d.other_label)})` : ''}</td>
      <td>${esc(d.file_name)}</td>
      <td>${d.ot_request_ticket_id ? 'Ticket-specific' : 'General'}</td>
      <td>${esc(formatDateTime(d.uploaded_at))}</td>
    </tr>`).join('');

  const approverChips = completedApprovals.map((h) => `
    <div class="approver-chip">
      <span class="approver-avatar">${esc(initials(h.actor_name))}</span>
      <div class="approver-meta">
        <span class="approver-name">${esc(h.actor_name || 'Unknown')}</span>
        <span class="approver-stage">${esc(STAGE_LABEL[h.stage] || h.stage)} · ${esc(formatDateTime(h.acted_at))}</span>
      </div>
      <span class="approver-check">&#10003;</span>
    </div>`).join('');

  const approvalsRows = history.map((h) => `
    <tr>
      <td>${esc(STAGE_LABEL[h.stage] || h.stage)}</td>
      <td>${esc(h.actor_name || '—')}</td>
      <td><span class="action-pill action-${esc(h.action)}">${esc(ACTION_LABEL[h.action] || h.action)}</span></td>
      <td>${esc(formatDateTime(h.acted_at))}</td>
      <td>${h.action === 'paid' ? `GHS ${esc(h.amount_paid)} · ${esc(String(h.payment_method || '').replace('_', ' '))}` : esc(h.reason || '—')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Overtime Request — ${esc(request.staff_name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; color: ${TEXT}; font-size: 12px; line-height: 1.5; background: #fff; }
    .letterhead { background: linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%); padding: 22px 40px; display: flex; align-items: center; justify-content: space-between; }
    .letterhead-left { display: flex; align-items: center; gap: 16px; }
    .logo-badge { width: 56px; height: 56px; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
    .logo-badge img { width: 44px; height: 44px; object-fit: contain; }
    .company-name { font-size: 19px; font-weight: 800; color: #fff; letter-spacing: 0.01em; }
    .company-sub { font-size: 11.5px; color: rgba(255,255,255,0.85); margin-top: 2px; }
    .doc-title { font-size: 14px; font-weight: 700; text-align: right; color: #fff; }
    .status-pill { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: #fff; background: ${statusColor}; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .body-pad { padding: 28px 40px 36px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${PRIMARY}; border-bottom: 2px solid ${BORDER}; padding-bottom: 5px; margin-bottom: 12px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 20px; }
    .field { display: flex; flex-direction: column; gap: 3px; }
    .field-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: ${MUTED}; }
    .field-value { font-size: 12.5px; font-weight: 600; text-transform: capitalize; }
    .reason-box { background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 8px; padding: 10px 12px; font-size: 11.5px; white-space: pre-wrap; margin-top: 6px; }
    .ticket-card { border: 1px solid ${BORDER}; border-radius: 10px; padding: 14px; margin-bottom: 10px; background: #fff; }
    .ticket-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .ticket-index { font-size: 11px; font-weight: 800; color: ${PRIMARY}; }
    .ticket-type-pill { font-size: 9.5px; font-weight: 700; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 999px; padding: 2px 10px; color: ${TEXT}; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; background: ${SURFACE}; color: ${MUTED}; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; padding: 7px 8px; border-bottom: 1px solid ${BORDER}; }
    td { padding: 7px 8px; border-bottom: 1px solid ${BORDER}; }
    .action-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 700; }
    .action-submitted { background: #dbeafe; color: #1e40af; }
    .action-approved, .action-paid { background: #dcfce7; color: #15803d; }
    .action-declined { background: #fee2e2; color: #b91c1c; }
    .approver-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .approver-chip { display: flex; align-items: center; gap: 10px; border: 1px solid ${BORDER}; border-radius: 8px; padding: 8px 10px; background: ${SURFACE}; }
    .approver-avatar { width: 30px; height: 30px; border-radius: 999px; background: #dcfce7; color: #15803d; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .approver-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .approver-name { font-size: 11.5px; font-weight: 700; }
    .approver-stage { font-size: 9.5px; color: ${MUTED}; }
    .approver-check { color: #15803d; font-weight: 700; }
    .summary-bar { display: flex; gap: 24px; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 8px; padding: 10px 16px; margin-bottom: 12px; }
    .summary-item { display: flex; flex-direction: column; }
    .summary-value { font-size: 15px; font-weight: 800; color: ${PRIMARY}; }
    .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: ${MUTED}; }
    .ref-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .ref-chip { font-size: 10.5px; font-weight: 700; background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 999px; padding: 3px 10px; }
    .signature-row { display: flex; justify-content: space-between; margin-top: 20px; gap: 24px; }
    .signature-block { flex: 1; }
    .signature-line { border-top: 1px solid ${TEXT}; margin-top: 28px; padding-top: 4px; font-size: 10px; color: ${MUTED}; }
    .notes-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 14px; font-size: 10.5px; color: #92400e; }
    .notes-box ul { margin-left: 16px; margin-top: 6px; }
    .footer { margin-top: 28px; font-size: 9.5px; color: ${MUTED}; text-align: center; border-top: 1px solid ${BORDER}; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="letterhead-left">
      <div class="logo-badge">${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Vobiss" />` : ''}</div>
      <div>
        <div class="company-name">C&amp;W Telecom</div>
        <div class="company-sub">Overtime Payment Request &amp; Authorization Form · powered by Vobiss ERP</div>
      </div>
    </div>
    <div>
      <div class="doc-title">OT Request #${esc(request.id)}</div>
      <div style="text-align:right;"><span class="status-pill">${esc(statusLabel)}</span></div>
    </div>
  </div>

  <div class="body-pad">
    <div class="section">
      <div class="section-title">A. Employee Details</div>
      <div class="grid-4">
        ${field('Full Name', request.staff_name)}
        ${field('Department / Unit', request.department)}
        ${field('Job Title / Position', request.job_title)}
        ${field('Contact Number', request.contact_number)}
      </div>
    </div>

    <div class="section">
      <div class="section-title">B. Overtime Details</div>
      <div class="grid-4">
        ${field('OT Category', CATEGORY_LABEL[request.ot_category] || request.ot_category)}
        ${field('Applicable OT Rate', RATE_LABEL[request.ot_rate_type] || request.ot_rate_type)}
        ${field('Normal Shift Hours', request.normal_shift_hours)}
        ${field('Total OT Hours Worked', `${request.total_ot_hours}h`)}
      </div>
    </div>

    <div class="section">
      <div class="section-title">C. Client / Site / Location Details</div>
      <div class="grid-4">${field('Client(s)', clientSummary)}${field('Site(s)', siteSummary)}</div>
    </div>

    <div class="section">
      <div class="section-title">D &amp; E. Ticket / Site Rows</div>
      <div class="summary-bar">
        <div class="summary-item"><span class="summary-value">${esc(request.total_ot_hours)}h</span><span class="summary-label">Total OT Hours</span></div>
        <div class="summary-item"><span class="summary-value">${tickets.length}</span><span class="summary-label">Ticket / Site Rows</span></div>
        <div class="summary-item"><span class="summary-value">${sites.length}</span><span class="summary-label">Sites Visited</span></div>
      </div>
      ${ticketRows || '<p style="color:' + MUTED + '; font-size:11.5px;">No ticket rows recorded.</p>'}
    </div>

    <div class="section">
      <div class="section-title">F. Incident / Maintenance Reference</div>
      <div class="ref-list">${refs.length ? refs.map((r) => `<span class="ref-chip">${esc(r)}</span>`).join('') : `<span style="color:${MUTED}; font-size:11.5px;">No references recorded.</span>`}</div>
    </div>

    <div class="section">
      <div class="section-title">G. Supporting Documents</div>
      <table>
        <thead><tr><th>Type</th><th>File</th><th>Scope</th><th>Uploaded</th></tr></thead>
        <tbody>${docRows || '<tr><td colspan="4" style="color:#9ca3af;">No documents uploaded.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="section">
      <div class="section-title">H. Employee Declaration</div>
      <p style="font-size:11.5px; font-style:italic;">"I confirm the overtime work stated above was performed by me and the hours claimed are accurate."</p>
      <div class="signature-row">
        <div class="signature-block"><div class="signature-line">${esc(request.employee_signature)} — Employee Signature</div></div>
        <div class="signature-block"><div class="signature-line">${esc(formatDate(request.declaration_date))} — Date</div></div>
      </div>
    </div>

    ${request.status === 'paid' ? `
    <div class="section">
      <div class="section-title">Finance — Payment Processed</div>
      <div class="grid-4">
        ${field('Amount Paid', `GHS ${request.amount_paid}`)}
        ${field('Payment Method', String(request.payment_method || '').replace('_', ' '))}
        ${field('Processed', formatDate(request.completed_at))}
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Approval &amp; Authorization</div>
      ${approverChips ? `<div class="approver-strip">${approverChips}</div>` : `<p style="color:${MUTED}; font-size:11.5px;">Nobody has signed off yet.</p>`}
    </div>

    <div class="section">
      <div class="section-title">Full Approval Trail</div>
      <table>
        <thead><tr><th>Stage</th><th>Actor</th><th>Action</th><th>Date</th><th>Signature / Reason / Payment</th></tr></thead>
        <tbody>${approvalsRows || '<tr><td colspan="5" style="color:#9ca3af;">No actions recorded yet.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="notes-box">
      <strong>Important Notes:</strong>
      <ul>
        <li>This form must be fully completed and signed before overtime payment can be processed.</li>
        <li>Emergency Fault claims require a valid fault ticket reference; Planned Maintenance claims require a valid work order reference.</li>
        <li>Overtime rates are subject to internal policy and are not auto-calculated on this form — Finance confirms the amount paid.</li>
        <li>False or inaccurate claims are subject to disciplinary action.</li>
      </ul>
    </div>

    <div class="footer">Generated ${esc(formatDateTime(new Date()))} · C&amp;W Telecom HR System, powered by Vobiss ERP</div>
  </div>
</body>
</html>`;
}
