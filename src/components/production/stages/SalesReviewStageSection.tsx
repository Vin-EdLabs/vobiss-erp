import React, { useState } from 'react';
import { Check, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { confirmDesignRequest, rejectSalesReview, type ProjectRequest } from '@/api/project';
import { DesignReadOnlySummary } from './DesignStageSection';

/** Sales reviews what Design sent back (current_stage='sales') — confirm assigns the SR's real
 *  SR-XXXX identity and hands it to Project; reject bounces it back to Design with a comment. */
export function SalesReviewStageSection({
  request, canReview, onUpdated,
}: {
  request: ProjectRequest;
  canReview: boolean;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmDesignRequest(request.id);
      toast({ title: 'Confirmed', description: 'SR number assigned — sent to Project Unit' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not confirm', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!comment.trim()) { toast({ title: 'A comment is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await rejectSalesReview(request.id, comment.trim());
      toast({ title: 'Sent back to Design' });
      setComment('');
      setRejecting(false);
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not reject', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <DesignReadOnlySummary request={request} />
      {canReview && (
        <div className="border-t border-[var(--border)] pt-5">
          {!rejecting ? (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-6 py-6 text-base font-semibold hover:bg-emerald-700"
                onClick={() => void confirm()}
              >
                <Check className="mr-2 h-5 w-5" />Confirm &amp; Forward to Project
              </Button>
              <Button variant="outline" disabled={busy} className="rounded-xl px-6 py-6 text-base font-semibold" onClick={() => setRejecting(true)}>
                <X className="mr-2 h-5 w-5" />Reject — send back to Design
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">What needs fixing?</p>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell Design what to correct…" className="min-h-[100px]" />
              <div className="flex gap-3">
                <Button variant="destructive" disabled={busy || !comment.trim()} onClick={() => void reject()}>
                  <Send className="mr-2 h-4 w-4" />Send back to Design
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => { setRejecting(false); setComment(''); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
