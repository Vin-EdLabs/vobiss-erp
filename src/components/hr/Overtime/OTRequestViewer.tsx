import React from 'react';
import { Banknote, Calendar, CheckCircle2, ClipboardList, FileText, MapPin, PenLine, Users } from 'lucide-react';
import { Avatar, AttachmentLink } from '@/pages/hr/components';
import type { OTRequest } from '@/api/overtime';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const CATEGORY_LABEL: Record<string, string> = {
  emergency_fault: 'Emergency Fault', planned_maintenance: 'Planned Maintenance',
  weekend_support: 'Weekend Support', public_holiday_support: 'Public Holiday Support',
};
const RATE_LABEL: Record<string, string> = {
  standard: 'Standard OT', weekend: 'Weekend Rate', public_holiday: 'Public Holiday Rate', special_approval: 'Special Approval Rate',
};
const DOC_TYPE_LABEL: Record<string, string> = {
  attendance_log: 'Attendance Log', call_out_log: 'Call-Out Log', fault_ticket: 'Fault Ticket',
  maintenance_report: 'Maintenance Report', supervisor_approval: 'Supervisor Approval', other: 'Other',
};

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-medium text-[var(--text-primary)]">{value ?? '—'}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
      <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
      {children}
    </h4>
  );
}

/** The complete OT request rendered beautifully — every section of the C&W Telecom Overtime
 *  Payment Request & Authorization Form, exactly as the staff member filled it. Used everywhere
 *  a supervisor, manager, HR, Finance, or the submitter needs to see the full request — never a
 *  summary, never a popup. */
export function OTRequestViewer({ request }: { request: OTRequest }) {
  const tickets = request.tickets || [];
  const documents = request.documents || [];
  const generalDocs = documents.filter((d) => !d.ot_request_ticket_id);
  const sites = [...new Set(tickets.map((t) => (t.site_name ? `${t.site_name} • ${t.client_name || 'No client'}` : null)).filter(Boolean))];
  const clients = [...new Set(tickets.map((t) => t.client_name).filter(Boolean))];
  const dates = tickets.map((t) => t.ot_date).filter(Boolean).sort();
  const refs = tickets.filter((t) => t.ticket_ref).map((t) => ({ type: t.ticket_type, ref: t.ticket_ref }));

  return (
    <div className="space-y-5">
      {/* A. Employee Details */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] p-4 sm:flex-row sm:items-center">
        <Avatar name={request.staff_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">{request.staff_name}</h3>
          <p className="mt-0.5 text-sm font-medium text-[var(--primary)]">{request.job_title || 'Position not set'}{request.department ? ` · ${request.department}` : ''}</p>
          {request.contact_number && <p className="mt-1 text-xs text-[var(--text-muted)]">{request.contact_number}</p>}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--border)] pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
          <DetailRow label="OT Category" value={CATEGORY_LABEL[request.ot_category] || request.ot_category} />
          <DetailRow label="OT Rate" value={RATE_LABEL[request.ot_rate_type] || request.ot_rate_type} />
        </div>
      </div>

      {/* B. Overtime Details */}
      <div>
        <SectionHeader icon={Calendar}>Overtime Details</SectionHeader>
        <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-4">
          <DetailRow label="Normal Shift Hours" value={request.normal_shift_hours} />
          <DetailRow label="Total OT Hours" value={<span className="font-bold text-[var(--primary)]">{Number(request.total_ot_hours).toFixed(2)}h</span>} />
          <DetailRow label="Sites Visited" value={sites.length} />
          <DetailRow label="Date Range" value={dates.length ? `${formatDate(dates[0])} – ${formatDate(dates[dates.length - 1])}` : '—'} />
        </div>
      </div>

      {/* C. Client / Site / Location */}
      <div>
        <SectionHeader icon={MapPin}>Client / Site / Location Details</SectionHeader>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {clients.length === 0 ? '—' : clients.length === 1 ? clients[0] : `Multiple Clients (${clients.length})`}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {sites.length === 0 ? '—' : sites.length === 1 ? sites[0] : `Multiple Sites (${sites.length}) — see ticket details below`}
          </p>
        </div>
      </div>

      {/* D & E. Ticket / Site rows */}
      <div>
        <SectionHeader icon={ClipboardList}>Ticket / Site Rows ({tickets.length})</SectionHeader>
        <div className="space-y-3">
          {tickets.map((t, i) => {
            const ticketDocs = documents.filter((d) => d.ot_request_ticket_id === t.id);
            return (
              <div key={t.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-[var(--primary)]">Ticket {i + 1}</span>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t.ticket_type === 'work_order' ? 'Work Order' : 'Fault Ticket'}{t.ticket_ref ? ` · ${t.ticket_ref}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailRow label="Client" value={t.client_name} />
                  <DetailRow label="Site / Station" value={t.site_name} />
                  <DetailRow label="Region / Area" value={t.region} />
                  <DetailRow label="Day Type" value={t.day_type?.replace('_', ' ')} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailRow label="Digital Address" value={t.digital_address} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <DetailRow label="OT Date" value={formatDate(t.ot_date)} />
                  <DetailRow label="Start Time" value={t.start_time} />
                  <DetailRow label="End Time" value={t.end_time} />
                  <DetailRow label="Hours Worked" value={<span className="font-semibold">{Number(t.hours_worked).toFixed(2)}h</span>} />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Work Summary</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-primary)]">
                    {t.work_summary || '—'}
                  </p>
                </div>
                {ticketDocs.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Supporting Documents</p>
                    <div className="space-y-1.5">
                      {ticketDocs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5">
                          <span className="text-xs font-medium text-[var(--text-secondary)]">{DOC_TYPE_LABEL[d.document_type] || d.document_type}{d.other_label ? ` (${d.other_label})` : ''}</span>
                          <AttachmentLink url={d.file_path} name={d.file_name} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* F. Incident / Maintenance Reference */}
      <div>
        <SectionHeader icon={FileText}>Incident / Maintenance Reference</SectionHeader>
        <div className="flex flex-wrap gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
          {refs.length === 0 ? (
            <span className="text-sm text-[var(--text-muted)]">No references recorded.</span>
          ) : (
            refs.map((r, i) => (
              <span key={i} className="rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
                {r.type === 'work_order' ? 'WO' : 'FT'} {r.ref}
              </span>
            ))
          )}
        </div>
      </div>

      {/* G. Supporting Documents Summary */}
      {generalDocs.length > 0 && (
        <div>
          <SectionHeader icon={FileText}>General Supporting Documents</SectionHeader>
          <div className="space-y-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
            {generalDocs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">{DOC_TYPE_LABEL[d.document_type] || d.document_type}{d.other_label ? ` (${d.other_label})` : ''}</span>
                <AttachmentLink url={d.file_path} name={d.file_name} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* H. Employee Declaration */}
      <div>
        <SectionHeader icon={PenLine}>Employee Declaration</SectionHeader>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-xs italic text-[var(--text-muted)]">
            "I confirm the overtime work stated above was performed by me and the hours claimed are accurate."
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Signed by employee: <span className="font-mono">{request.employee_signature || '—'}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">{formatDate(request.declaration_date)}</p>
          </div>
        </div>
      </div>

      {/* Finance section, once paid */}
      {request.status === 'paid' && (
        <div>
          <SectionHeader icon={Banknote}>Finance — Payment Processed</SectionHeader>
          <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-lg)] border border-[var(--accent-green)] bg-[var(--accent-green-light)] p-4 sm:grid-cols-3">
            <DetailRow label="Amount Paid" value={<span className="text-base font-bold text-[var(--accent-green)]">GHS {Number(request.amount_paid).toFixed(2)}</span>} />
            <DetailRow label="Payment Method" value={String(request.payment_method || '').replace('_', ' ')} />
            <DetailRow label="Processed" value={formatDate(request.completed_at)} />
          </div>
        </div>
      )}

      {request.status === 'declined' && (
        <div>
          <SectionHeader icon={Users}>Declined</SectionHeader>
          <div className="rounded-[var(--radius-lg)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-4">
            <p className="text-sm font-semibold text-[var(--accent-red)]">Declined at {request.declined_by_stage} stage</p>
            <p className="mt-1 text-sm text-[var(--danger-text)]">"{request.declined_reason}"</p>
          </div>
        </div>
      )}
    </div>
  );
}
