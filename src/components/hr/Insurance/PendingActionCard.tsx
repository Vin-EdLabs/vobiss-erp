import React, { useState } from 'react';
import { ArrowRight, Check, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass } from '@/pages/hr/components';
import { formatGhs } from '@/lib/taxCalculations';
import { insuranceSelfApi, type InsuranceProfile } from '@/api/insurance';
import { toast } from 'sonner';

type PendingTransfer = InsuranceProfile['pendingForStaff'][number];

export function PendingActionCard({
  transfer,
  onResolved,
  canRespond,
}: {
  transfer: PendingTransfer;
  onResolved: () => void;
  /** Only the staff member the transfer belongs to may act on it — HR viewing this same
   *  banner on the employee's profile sees the details but no Yes/No/Got it buttons. */
  canRespond: boolean;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | 'acknowledge' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const isFlow2 = transfer.flowType === 'hr_override';

  const respond = async (action: 'approve' | 'reject' | 'acknowledge', reason?: string) => {
    setBusy(action);
    try {
      await insuranceSelfApi.respondToTransfer(transfer.id, action, reason);
      toast.success(
        action === 'reject' ? 'Transfer declined' : action === 'approve' ? 'Transfer approved' : 'Acknowledged'
      );
      setRejectOpen(false);
      onResolved();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to respond');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--accent-amber)] bg-[var(--accent-amber-light)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {isFlow2 ? 'HR moved some of your medical balance' : 'HR wants to transfer part of your medical balance'}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <span className="font-medium">{transfer.fromCategoryName}</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span className="font-medium">{transfer.toCategoryName}</span>
            <span className="text-[var(--text-muted)]">
              · {formatGhs(transfer.amount)} ({transfer.transferType})
            </span>
          </p>
          {transfer.reason && <p className="mt-1 text-xs italic text-[var(--text-muted)]">"{transfer.reason}"</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!canRespond ? (
            <span className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
              <Clock className="h-3.5 w-3.5" />
              Waiting on staff
            </span>
          ) : isFlow2 ? (
            <Button size="sm" disabled={!!busy} onClick={() => respond('acknowledge')}>
              <Check className="mr-1 h-4 w-4" />
              {busy === 'acknowledge' ? 'Saving…' : 'Got it'}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                className="border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]"
                onClick={() => {
                  setRejectReason('');
                  setRejectOpen(true);
                }}
              >
                <X className="mr-1 h-4 w-4" />
                No
              </Button>
              <Button size="sm" disabled={!!busy} onClick={() => respond('approve')}>
                <Check className="mr-1 h-4 w-4" />
                {busy === 'approve' ? 'Saving…' : 'Yes'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this transfer</DialogTitle>
          </DialogHeader>
          <Field label="Reason" required hint="HR will see this reason.">
            <textarea
              className={`${inputClass} h-auto min-h-[88px] py-2`}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Let HR know why you're declining this transfer…"
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy === 'reject' || rejectReason.trim().length < 3}
              className="bg-[var(--accent-red)] text-white hover:opacity-90"
              onClick={() => respond('reject', rejectReason.trim())}
            >
              {busy === 'reject' ? 'Declining…' : 'Decline Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
