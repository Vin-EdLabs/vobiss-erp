import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass } from '@/pages/hr/components';
import { LeaveSignatureDialog } from '@/components/hr/Leave/LeaveSignatureDialog';
import otApi, { OT_QUERY, type OTRequest, type OTPaymentMethod } from '@/api/overtime';
import { OTStatusTracker, OT_STAGE_LABEL } from './OTStatusTracker';
import { OTRequestViewer } from './OTRequestViewer';
import { OTFinancePanel } from './OTFinancePanel';

const STAGE_STATEMENT: Record<string, string> = {
  supervisor: 'I confirm the work was required and the hours have been verified against operational records.',
  manager: 'I approve this overtime as necessary for departmental operations and authorize it for HR and Finance processing.',
  hr: 'I confirm that this request has been reviewed for completeness, required approvals, and supporting documentation. The form meets internal procedural requirements and may proceed to Finance.',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** The full OT request — status timeline, complete beautiful form (never a summary), previous
 *  approvals, then this viewer's action panel. Used both on the self-service "waiting on you"
 *  banner and on HR/Finance's oversight page, with actions only enabled once it's actually this
 *  viewer's turn (`canAct`). */
export function OTApprovalPanel({
  request,
  onResolved,
  canAct = true,
  defaultExpanded,
  headerText,
  hideHeader = false,
}: {
  request: OTRequest;
  onResolved: () => void;
  canAct?: boolean;
  defaultExpanded?: boolean;
  headerText?: string;
  hideHeader?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const showBody = hideHeader || expanded;

  const detailQ = useQuery({
    queryKey: ['overtime', 'detail', request.id],
    queryFn: () => otApi.requestDetail(request.id),
    ...OT_QUERY,
  });
  const detail = detailQ.data || request;
  const stage = detail.current_stage;
  const isFinanceStage = stage === 'finance';

  const respond = async (body: Parameters<typeof otApi.respond>[1]) => {
    setBusy(true);
    try {
      await otApi.respond(request.id, body);
      toast.success(body.action === 'decline' ? 'Overtime request declined' : isFinanceStage ? 'Payment confirmed' : 'Approved');
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
    ? `${detail.staff_name}'s overtime request needs your ${isFinanceStage ? 'payment processing' : 'approval'}`
    : `${detail.staff_name}'s overtime request — currently at ${OT_STAGE_LABEL[stage as keyof typeof OT_STAGE_LABEL] || stage}`;

  return (
    <div
      className={
        hideHeader
          ? ''
          : `rounded-[var(--card-radius)] border p-4 ${canAct ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-light)]' : 'border-[var(--border)] bg-[var(--surface)]'}`
      }
    >
      {!hideHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{headerText || defaultHeader}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {Number(detail.total_ot_hours).toFixed(2)}h total · submitted {formatDate(detail.submitted_at)}
            </p>
          </div>
          <button type="button" className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--primary)]" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide full request' : 'View full request'}
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {showBody && (
        <div className={hideHeader ? 'space-y-4' : 'mt-4 space-y-4'}>
          <OTStatusTracker request={detail} />
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <OTRequestViewer request={detail} />
          </div>
        </div>
      )}

      {canAct && !isFinanceStage && (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-3 text-sm italic text-[var(--text-secondary)]">"{STAGE_STATEMENT[stage as string]}"</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} className="border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]" onClick={() => { setDeclineReason(''); setDeclineOpen(true); }}>
              <X className="mr-1 h-4 w-4" /> Decline
            </Button>
            <Button size="sm" disabled={busy} onClick={() => setSignOpen(true)}>
              <Check className="mr-1 h-4 w-4" /> Approve
            </Button>
          </div>
        </div>
      )}

      {canAct && isFinanceStage && (
        <div className="mt-4">
          <OTFinancePanel
            totalHours={Number(detail.total_ot_hours)}
            pending={busy}
            onPay={(amount, method, signature) => respond({ action: 'approve', amountPaid: amount, paymentMethod: method, signature })}
            onDecline={() => { setDeclineReason(''); setDeclineOpen(true); }}
          />
        </div>
      )}

      <LeaveSignatureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Approve Overtime Request"
        description={`Sign to confirm: "${STAGE_STATEMENT[stage as string]}"`}
        confirmLabel="Approve & Sign"
        pending={busy}
        onConfirm={(signature) => respond({ action: 'approve', signature })}
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline this overtime request</DialogTitle></DialogHeader>
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
            <Button type="button" variant="outline" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={busy || declineReason.trim().length < 3}
              className="bg-[var(--accent-red)] text-white hover:opacity-90"
              onClick={() => respond({ action: 'decline', reason: declineReason.trim() })}
            >
              {busy ? 'Declining…' : 'Decline Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
