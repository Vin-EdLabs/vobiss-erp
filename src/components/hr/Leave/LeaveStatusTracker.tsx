import React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { StatusBadge } from '@/pages/hr/components';
import type { LeaveRequest, LeaveStage } from '@/api/leave';

export const STAGE_LABEL: Record<LeaveStage, string> = {
  reliever: 'Reliever', supervisor: 'Supervisor', manager: 'Manager', cto: 'CTO', hr: 'HR',
};
const STAGE_ACTION_LABEL: Record<LeaveStage, string> = {
  reliever: 'Confirmed', supervisor: 'Approved', manager: 'Approved', cto: 'Approved', hr: 'Approved',
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function LeaveStatusTracker({ request }: { request: LeaveRequest }) {
  // Legacy rows predate the multi-stage flow (current_stage was never set) — render the old
  // flat status instead of a 5-step stepper that has nothing to populate it with.
  if (!request.current_stage) {
    return (
      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="mb-2 text-sm text-[var(--text-muted)]">This request predates the multi-stage approval flow.</p>
        <StatusBadge status={request.status} />
      </div>
    );
  }

  const stages = request.resolved_stages || [];
  const history = request.history || [];
  const submittedEntry = history.find((h) => h.action === 'submitted');
  const isDeclined = request.current_stage === 'declined';
  const sinceTime = history.length ? history[history.length - 1].acted_at : request.submitted_at;

  const stageEntry = (stage: LeaveStage) => history.find((h) => h.stage === stage && h.action !== 'submitted');

  function assignedName(stage: LeaveStage): string | null {
    if (stage === 'reliever') return request.reliever_name || null;
    if (stage === 'supervisor') return request.supervisor_approver_name || null;
    if (stage === 'manager') return request.manager_approver_name || null;
    return null; // cto/hr are queues — any qualifying user can act, no single named person
  }

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green)] text-white">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Submitted</p>
            <p className="text-xs text-[var(--text-muted)]">{submittedEntry?.actor_name || '—'} · {formatDateTime(submittedEntry?.acted_at)}</p>
          </div>
        </li>

        {stages.map((stage) => {
          const entry = stageEntry(stage);
          const isCurrent = request.current_stage === stage;
          const isDeclinedHere = isDeclined && request.declined_by_stage === stage;

          if (isDeclinedHere) {
            return (
              <li key={stage} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)] text-white">
                  <X className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--accent-red)]">{STAGE_LABEL[stage]} Declined</p>
                  <p className="text-xs text-[var(--text-muted)]">{formatDateTime(request.completed_at)}</p>
                  {request.declined_reason && (
                    <p className="mt-1 rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] px-2.5 py-1.5 text-xs text-[var(--danger-text)]">
                      "{request.declined_reason}"
                    </p>
                  )}
                </div>
              </li>
            );
          }

          if (entry) {
            return (
              <li key={stage} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green)] text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {STAGE_LABEL[stage]} {STAGE_ACTION_LABEL[stage]}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{entry.actor_name || '—'} · {formatDateTime(entry.acted_at)}</p>
                </div>
              </li>
            );
          }

          if (isCurrent) {
            return (
              <li key={stage} className="flex items-start gap-3">
                <span className="relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-amber)] text-white">
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent-amber)] opacity-60" />
                  <Clock className="relative h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Waiting — {STAGE_LABEL[stage]}
                    {assignedName(stage) && <span className="font-normal text-[var(--text-secondary)]"> ({assignedName(stage)})</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">since {formatDateTime(sinceTime)}</p>
                </div>
              </li>
            );
          }

          return (
            <li key={stage} className="flex items-start gap-3 opacity-45">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]" />
              <p className="text-sm font-medium text-[var(--text-muted)]">
                {STAGE_LABEL[stage]}
                {assignedName(stage) && <span className="text-[var(--text-muted)]"> ({assignedName(stage)})</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
