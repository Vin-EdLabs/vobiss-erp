import React from 'react';
import { Check, Clock, X } from 'lucide-react';
import { StatusBadge } from '@/pages/hr/components';
import type { OTRequest, OTStage } from '@/api/overtime';

export const OT_STAGE_LABEL: Record<OTStage, string> = {
  supervisor: 'Supervisor', manager: 'Manager', hr: 'HR', finance: 'Finance',
};
const STAGE_STATEMENT: Record<OTStage, string> = {
  supervisor: 'Verifies the work was required and hours match operational records.',
  manager: 'Sanctions this overtime as necessary for departmental operations.',
  hr: 'Authorizes — confirms completeness and procedural compliance.',
  finance: 'Processes payment.',
};
const FLOW: OTStage[] = ['supervisor', 'manager', 'hr', 'finance'];

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Visual, animated progress timeline — Submitted → Supervisor → Manager → HR → Finance —
 *  shown at the top of every OT request so anyone opening it instantly sees where it stands. */
export function OTStatusTracker({ request }: { request: OTRequest }) {
  const history = request.history || [];
  const submittedEntry = history.find((h) => h.action === 'submitted');
  const isDeclined = request.current_stage === 'declined';
  const sinceTime = history.length ? history[history.length - 1].acted_at : request.submitted_at;

  const stageEntry = (stage: OTStage) => history.find((h) => h.stage === stage && h.action !== 'submitted');

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <ol className="space-y-4">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green)] text-white">
            <Check className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Submitted</p>
            <p className="text-xs text-[var(--text-muted)]">{submittedEntry?.actor_name || request.staff_name} · {formatDateTime(submittedEntry?.acted_at || request.submitted_at)}</p>
          </div>
        </li>

        {FLOW.map((stage) => {
          const entry = stageEntry(stage);
          const isCurrent = request.current_stage === stage;
          const isDeclinedHere = isDeclined && request.declined_by_stage === stage;
          const isPaid = stage === 'finance' && request.status === 'paid';

          if (isDeclinedHere) {
            return (
              <li key={stage} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)] text-white">
                  <X className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--accent-red)]">{OT_STAGE_LABEL[stage]} Declined</p>
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

          if (entry || isPaid) {
            return (
              <li key={stage} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green)] text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {OT_STAGE_LABEL[stage]} {stage === 'finance' ? 'Paid' : 'Approved'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{entry?.actor_name || '—'} · {formatDateTime(entry?.acted_at)}</p>
                  {stage === 'finance' && request.amount_paid != null && (
                    <p className="mt-1 text-xs font-semibold text-[var(--accent-green)]">GHS {Number(request.amount_paid).toFixed(2)} via {String(request.payment_method || '').replace('_', ' ')}</p>
                  )}
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
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Waiting — {OT_STAGE_LABEL[stage]}</p>
                  <p className="text-xs text-[var(--text-muted)]">since {formatDateTime(sinceTime)}</p>
                  <p className="mt-0.5 text-[11px] italic text-[var(--text-muted)]">{STAGE_STATEMENT[stage]}</p>
                </div>
              </li>
            );
          }

          return (
            <li key={stage} className="flex items-start gap-3 opacity-45">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]" />
              <p className="text-sm font-medium text-[var(--text-muted)]">{OT_STAGE_LABEL[stage]}</p>
            </li>
          );
        })}
      </ol>
      {isDeclined && <div className="mt-3"><StatusBadge status="declined" /></div>}
    </div>
  );
}
