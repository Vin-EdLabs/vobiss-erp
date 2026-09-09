import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass } from '@/pages/hr/components';
import { leaveApi, leaveSelfApi, LEAVE_QUERY, type LeaveRequest } from '@/api/leave';
import { LeaveFullDetails } from './LeaveFullDetails';
import { LeaveSignatureDialog } from './LeaveSignatureDialog';
import { LeaveStatusTracker, STAGE_LABEL } from './LeaveStatusTracker';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Renders a leave request inline — full status tracker + full submitted form, no popup.
 *  Used two ways: on the self-service "Leave Request" page for whoever's turn it is to act
 *  (reliever/supervisor/manager/CTO/HR), and on HR's "Leave Management → Applications" page for
 *  every self-service request HR needs to see, with Approve/Decline only enabled once it's
 *  actually HR's turn (`canAct`). */
export function LeaveApprovalCard({
  request,
  onResolved,
  scope = 'self',
  canAct = true,
  defaultExpanded,
  headerText,
  hideHeader = false,
}: {
  request: LeaveRequest;
  onResolved: () => void;
  /** 'self' fetches detail as the acting user (owner/actor only); 'hr' fetches via the HR
   *  admin endpoint so any request can be viewed regardless of whose turn it is. */
  scope?: 'self' | 'hr';
  /** Whether to show the Approve/Decline controls at all. */
  canAct?: boolean;
  defaultExpanded?: boolean;
  headerText?: string;
  /** Skips the summary line + its own expand/collapse toggle — for embedding inside a table row
   *  that already shows the summary and controls expansion itself (an accordion "drop-down"). */
  hideHeader?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const showBody = hideHeader || expanded;

  const detailQ = useQuery({
    queryKey: ['leave', 'detail', scope, request.id],
    queryFn: () => (scope === 'hr' ? leaveApi.requestDetail(request.id) : leaveSelfApi.requestDetail(request.id)),
    ...LEAVE_QUERY,
  });
  const detail = detailQ.data || request;

  const isReliever = request.current_stage === 'reliever';
  const confirmAction = isReliever ? 'confirm' : 'approve';

  const respond = async (action: 'confirm' | 'approve' | 'decline', extra: { reason?: string; signature?: string }) => {
    setBusy(true);
    try {
      await leaveSelfApi.respond(request.id, action, extra.reason, extra.signature);
      toast.success(action === 'decline' ? 'Leave request declined' : isReliever ? 'Confirmed' : 'Approved');
      setDeclineOpen(false);
      setSignOpen(false);
      onResolved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to respond');
    } finally {
      setBusy(false);
    }
  };

  const defaultHeader = canAct
    ? isReliever
      ? `${detail.employee_name || 'A staff member'} has selected you as their reliever`
      : `${detail.employee_name || 'A staff member'}'s leave request needs your approval`
    : `${detail.employee_name || 'A staff member'}'s ${detail.leave_type} leave request — currently at ${
        detail.current_stage && STAGE_LABEL[detail.current_stage as keyof typeof STAGE_LABEL]
          ? STAGE_LABEL[detail.current_stage as keyof typeof STAGE_LABEL]
          : detail.current_stage || detail.status
      }`;

  return (
    <div
      className={
        hideHeader
          ? ''
          : `rounded-[var(--card-radius)] border p-4 ${
              canAct ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-light)]' : 'border-[var(--border)] bg-[var(--surface)]'
            }`
      }
    >
      {!hideHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{headerText || defaultHeader}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {detail.leave_type} · {formatDate(detail.start_date)} – {formatDate(detail.end_date)} ({detail.days} day{detail.days === 1 ? '' : 's'})
            </p>
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--primary)]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Hide full request' : 'View full request'}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {showBody && (
        <div className={hideHeader ? 'space-y-4' : 'mt-4 space-y-4'}>
          <LeaveStatusTracker request={detail} />
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <LeaveFullDetails request={detail} />
          </div>
        </div>
      )}

      {canAct && (
        <div className="mt-4 flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            className="border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]"
            onClick={() => {
              setDeclineReason('');
              setDeclineOpen(true);
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Decline
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setSignOpen(true)}>
            <Check className="mr-1 h-4 w-4" />
            {isReliever ? 'Confirm' : 'Approve'}
          </Button>
        </div>
      )}

      <LeaveSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title={isReliever ? 'Confirm as Reliever' : 'Approve Leave Request'}
        description={`Sign to ${isReliever ? 'confirm you accept reliever responsibility for' : 'approve'} ${detail.employee_name || 'this staff member'}'s ${detail.leave_type} leave request.`}
        confirmLabel={isReliever ? 'Confirm & Sign' : 'Approve & Sign'}
        pending={busy}
        onConfirm={(signature) => respond(confirmAction, { signature })}
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this leave request</DialogTitle>
          </DialogHeader>
          <Field label="Reason" required hint="The staff member and everyone who already acted on this request will see this reason.">
            <textarea
              className={`${inputClass} h-auto min-h-[88px] py-2`}
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Explain why you're declining this request…"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || declineReason.trim().length < 3}
              className="bg-[var(--accent-red)] text-white hover:opacity-90"
              onClick={() => respond('decline', { reason: declineReason.trim() })}
            >
              {busy ? 'Declining…' : 'Decline Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
