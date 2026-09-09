import fs from 'fs';
import path from 'path';

/** Professional HTML "C&W Telecom Employee Leave Request Form" template for Puppeteer PDF
 *  rendering — mirrors backend/utils/payslipHtml.js's structure/palette exactly. */

const PRIMARY = '#8b5a2b';
const PRIMARY_DARK = '#6b4520';
const TEXT = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const SURFACE = '#f9fafb';

const logoPath = path.join(process.cwd(), 'vobiss-logo.png');
let logoBase64 = null;
try {
  if (fs.existsSync(logoPath)) {
    logoBase64 = fs.readFileSync(logoPath).toString('base64');
  }
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

const STAGE_LABEL = { reliever: 'Reliever', supervisor: 'Supervisor', manager: 'Manager', cto: 'CTO', hr: 'HR' };
const ACTION_LABEL = {
  submitted: 'Submitted', confirmed: 'Confirmed', approved: 'Approved',
  declined: 'Declined', acknowledged: 'Acknowledged', cancelled: 'Cancelled',
};

function field(label, value) {
  return `<div class="field"><span class="field-label">${esc(label)}</span><span class="field-value">${esc(value ?? '—')}</span></div>`;
}

/**
 * @param {object} request — result of leave.js's getLeaveRequestDetail() (includes `history`)
 */
export function buildLeaveRequestHtml(request) {
  const statusLabel = request.status === 'approved' ? 'APPROVED'
    : request.status === 'declined' ? 'DECLINED'
    : request.status === 'cancelled' ? 'CANCELLED'
    : 'PENDING';
  const statusColor = request.status === 'approved' ? '#15803d'
    : request.status === 'declined' ? '#b91c1c'
    : '#b45309';

  const history = request.history || [];
  const completedApprovals = history.filter((h) => h.action === 'confirmed' || h.action === 'approved');

  const approverChips = completedApprovals
    .map((h) => `
      <div class="approver-chip">
        <span class="approver-avatar">${esc(initials(h.actor_name))}</span>
        <div class="approver-meta">
          <span class="approver-name">${esc(h.actor_name || 'Unknown')}</span>
          <span class="approver-stage">${esc(STAGE_LABEL[h.stage] || h.stage)} · ${esc(formatDateTime(h.acted_at))}</span>
        </div>
        <span class="approver-check">&#10003;</span>
      </div>`)
    .join('');

  const approvalsRows = history
    .map((h) => `
      <tr>
        <td>${esc(STAGE_LABEL[h.stage] || h.stage)}</td>
        <td>${esc(h.actor_name || '—')}</td>
        <td><span class="action-pill action-${esc(h.action)}">${esc(ACTION_LABEL[h.action] || h.action)}</span></td>
        <td>${esc(formatDateTime(h.acted_at))}</td>
        <td>${esc(h.reason || '—')}</td>
      </tr>`)
    .join('');

  const isShortFlow = request.leaver_tier === 'cto' || request.leaver_tier === 'hr';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Leave Request — ${esc(request.employee_name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      color: ${TEXT};
      font-size: 12px;
      line-height: 1.5;
      background: #fff;
    }
    .letterhead {
      background: linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_DARK} 100%);
      padding: 22px 40px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .letterhead-left { display: flex; align-items: center; gap: 16px; }
    .logo-badge {
      width: 56px; height: 56px; border-radius: 14px; background: #fff;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    }
    .logo-badge img { width: 44px; height: 44px; object-fit: contain; }
    .company-name { font-size: 19px; font-weight: 800; color: #fff; letter-spacing: 0.01em; }
    .company-sub { font-size: 11.5px; color: rgba(255,255,255,0.85); margin-top: 2px; }
    .doc-title { font-size: 14px; font-weight: 700; text-align: right; color: #fff; }
    .status-pill {
      display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 999px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em; color: #fff; background: ${statusColor};
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
    .body-pad { padding: 28px 40px 36px; }
    .section { margin-bottom: 20px; }
    .section-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
      color: ${PRIMARY}; border-bottom: 2px solid ${BORDER}; padding-bottom: 5px; margin-bottom: 12px;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 20px; }
    .field { display: flex; flex-direction: column; gap: 3px; }
    .field-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.04em; color: ${MUTED}; }
    .field-value { font-size: 12.5px; font-weight: 600; }
    .reason-box {
      background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 8px; padding: 12px 14px;
      font-size: 12px; white-space: pre-wrap; margin-top: 6px;
    }
    .handover-statement { font-size: 11.5px; font-style: italic; color: ${TEXT}; margin-bottom: 10px; }
    .attachment-note {
      display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: ${TEXT};
      background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 8px; padding: 8px 12px; margin-top: 4px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { text-align: left; background: ${SURFACE}; color: ${MUTED}; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; padding: 7px 8px; border-bottom: 1px solid ${BORDER}; }
    td { padding: 7px 8px; border-bottom: 1px solid ${BORDER}; }
    .action-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9.5px; font-weight: 700; }
    .action-submitted { background: #dbeafe; color: #1e40af; }
    .action-confirmed, .action-approved { background: #dcfce7; color: #15803d; }
    .action-declined, .action-cancelled { background: #fee2e2; color: #b91c1c; }
    .action-acknowledged { background: #f3e8ff; color: #7e22ce; }
    .approver-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .approver-chip {
      display: flex; align-items: center; gap: 10px; border: 1px solid ${BORDER}; border-radius: 8px;
      padding: 8px 10px; background: ${SURFACE};
    }
    .approver-avatar {
      width: 30px; height: 30px; border-radius: 999px; background: #dcfce7; color: #15803d;
      display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0;
    }
    .approver-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .approver-name { font-size: 11.5px; font-weight: 700; }
    .approver-stage { font-size: 9.5px; color: ${MUTED}; }
    .approver-check { color: #15803d; font-weight: 700; }
    .signature-row { display: flex; justify-content: space-between; margin-top: 24px; gap: 24px; }
    .signature-block { flex: 1; }
    .signature-line { border-top: 1px solid ${TEXT}; margin-top: 28px; padding-top: 4px; font-size: 10px; color: ${MUTED}; }
    .footer { margin-top: 28px; font-size: 9.5px; color: ${MUTED}; text-align: center; border-top: 1px solid ${BORDER}; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="letterhead-left">
      <div class="logo-badge">
        ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Vobiss" />` : ''}
      </div>
      <div>
        <div class="company-name">C&amp;W Telecom</div>
        <div class="company-sub">Employee Leave Request Form · powered by Vobiss ERP</div>
      </div>
    </div>
    <div>
      <div class="doc-title">Leave Request #${esc(request.id)}</div>
      <div style="text-align:right;"><span class="status-pill">${esc(statusLabel)}</span></div>
    </div>
  </div>

  <div class="body-pad">
    <div class="section">
      <div class="section-title">Employee Information</div>
      <div class="grid-4">
        ${field('Employee Name', request.employee_name)}
        ${field('Staff ID', `EMP-${String(request.employee_id || 0).padStart(3, '0')}`)}
        ${field('Department', request.department)}
        ${field('Position', request.position)}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Leave Details</div>
      <div class="grid-4">
        ${field('Leave Type', request.leave_type)}
        ${field('Number of Days', request.days)}
        ${field('Start Date', formatDate(request.start_date))}
        ${field('End Date', formatDate(request.end_date))}
      </div>
      <div style="margin-top:12px;">
        <div class="field-label">Reason for Leave</div>
        <div class="reason-box">${esc(request.reason)}</div>
      </div>
      ${request.attachment_name ? `
      <div style="margin-top:10px;">
        <div class="field-label">Attachment</div>
        <div class="attachment-note">&#128206; ${esc(request.attachment_name)}</div>
      </div>` : ''}
    </div>

    ${!isShortFlow ? `
    <div class="section">
      <div class="section-title">Reliever &amp; Approvers</div>
      <div class="grid-4">
        ${field('Reliever', request.reliever_name)}
        ${field('Contact During Leave', request.contact_during_leave)}
        ${field('Supervisor', request.supervisor_approver_name || 'N/A')}
        ${field('Manager', request.manager_approver_name || 'N/A')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Handover Confirmation</div>
      <p class="handover-statement">"I confirm that tasks will be handed over to the reliever/appropriate personnel before proceeding on leave."</p>
      <div class="signature-row">
        <div class="signature-block">
          <div class="signature-line">${esc(request.employee_signature || request.employee_name)} — Employee Signature</div>
        </div>
        <div class="signature-block">
          <div class="signature-line">${esc(formatDate(request.submitted_at))} — Date</div>
        </div>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Approved By</div>
      ${approverChips
        ? `<div class="approver-strip">${approverChips}</div>`
        : `<p style="color:${MUTED}; font-size:11.5px;">Nobody has signed off yet.</p>`}
    </div>

    <div class="section">
      <div class="section-title">Full Approval Trail</div>
      <table>
        <thead><tr><th>Stage</th><th>Actor</th><th>Action</th><th>Date</th><th>Signature / Reason</th></tr></thead>
        <tbody>${approvalsRows || '<tr><td colspan="5" style="color:#9ca3af;">No actions recorded yet.</td></tr>'}</tbody>
      </table>
    </div>

    <div class="footer">Generated ${esc(formatDateTime(new Date()))} · C&amp;W Telecom HR System, powered by Vobiss ERP</div>
  </div>
</body>
</html>`;
}
