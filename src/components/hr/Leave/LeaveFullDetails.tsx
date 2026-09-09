import React from 'react';
import { CalendarDays, Mail, MapPin, Paperclip, Phone, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Avatar, AttachmentLink } from '@/pages/hr/components';
import { LeaveApprovedBySummary } from './LeaveApprovedBySummary';
import type { LeaveRequest } from '@/api/leave';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function tenureLabel(startDate?: string | null) {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const months = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 1) return 'Less than a month';
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${rem ? `, ${rem} mo` : ''}`;
}

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

/** The complete submitted form, exactly as the leave person filled it — reused everywhere a
 *  reliever, supervisor, manager, CTO, HR, or the self-service history dialog needs to see the
 *  full request, not just a summary. */
export function LeaveFullDetails({ request }: { request: LeaveRequest }) {
  const isShortFlow = request.leaver_tier === 'cto' || request.leaver_tier === 'hr';
  const tenure = tenureLabel(request.employee_start_date);

  return (
    <div className="space-y-5">
      {/* Employee header card — who this request is about, at a glance */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-secondary)] p-4 sm:flex-row sm:items-start">
        <Avatar name={request.employee_name} src={request.employee_photo_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">{request.employee_name || 'Unknown staff member'}</h3>
            {request.employee_id && (
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                EMP-{String(request.employee_id).padStart(3, '0')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-[var(--primary)]">
            {request.position || 'Position not set'}{request.department ? ` · ${request.department}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
            {request.employee_email && (
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{request.employee_email}</span>
            )}
            {request.employee_phone && (
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{request.employee_phone}</span>
            )}
            {request.employee_location && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{request.employee_location}</span>
            )}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-2 border-t border-[var(--border)] pt-3 sm:border-t-0 sm:border-l sm:pl-4 sm:pt-0">
          <DetailRow label="Employment Type" value={request.employee_employment_type ? request.employee_employment_type.replace(/-/g, ' ') : undefined} />
          <DetailRow label="Tenure" value={tenure} />
          <DetailRow label="Gender" value={request.employee_gender} />
          <DetailRow label="Line Manager" value={request.employee_line_manager} />
        </div>
      </div>

      <div>
        <SectionHeader icon={CalendarDays}>Leave Details</SectionHeader>
        <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-4">
          <DetailRow label="Leave Type" value={request.leave_type} />
          <DetailRow label="Days" value={request.days} />
          <DetailRow label="Start Date" value={formatDate(request.start_date)} />
          <DetailRow label="End Date" value={formatDate(request.end_date)} />
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Reason for Leave</p>
          <p className="mt-1 whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-primary)]">
            {request.reason}
          </p>
        </div>
      </div>

      {!isShortFlow && (
        <div>
          <SectionHeader icon={Users}>Reliever &amp; Approvers</SectionHeader>
          <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2">
            <div className="flex items-center gap-2.5">
              <Avatar name={request.reliever_name} src={request.reliever_photo_url} size="sm" />
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Reliever</p>
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{request.reliever_name || '—'}</p>
                {(request.reliever_position || request.reliever_department) && (
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {[request.reliever_position, request.reliever_department].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>
            <DetailRow label="Contact During Leave" value={request.contact_during_leave} />
            <DetailRow
              label="Supervisor"
              value={request.supervisor_approver_name || (request.resolved_stages?.includes('supervisor') ? 'Any unit supervisor' : 'N/A')}
            />
            <DetailRow
              label="Manager"
              value={request.manager_approver_name || (request.resolved_stages?.includes('manager') ? 'Any unit manager' : 'N/A')}
            />
          </div>
        </div>
      )}

      {!isShortFlow && (
        <div>
          <SectionHeader icon={ShieldCheck}>Handover Confirmation</SectionHeader>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="text-xs italic text-[var(--text-muted)]">
              "I confirm that tasks will be handed over to the reliever/appropriate personnel before proceeding on leave."
            </p>
            <p className="mt-1.5 text-sm font-medium text-[var(--text-primary)]">
              Signed by employee: <span className="font-mono">{request.employee_signature || '—'}</span>
            </p>
          </div>
        </div>
      )}

      {request.attachment_url && (
        <div>
          <SectionHeader icon={Paperclip}>Attachment</SectionHeader>
          <AttachmentLink url={request.attachment_url} name={request.attachment_name} />
        </div>
      )}

      <div>
        <SectionHeader icon={UserRound}>Approved By</SectionHeader>
        <LeaveApprovedBySummary history={request.history || []} />
      </div>
    </div>
  );
}
