import { useState } from 'react';
import { Check, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { approveRequest, rejectRequest } from '@/api';

/**
 * Self-contained Approve/Reject trigger buttons + confirmation dialog for a request detail
 * page. Deliberately a single small component (one local `mode` state, not two booleans read
 * from a JSX block hundreds of lines away) — splitting the state and its Dialog consumer far
 * apart inside a large page file tripped up this project's dev-time component-tagger, which
 * silently renamed the state declaration without updating the Dialog's reference to it.
 */
export function ApproveRejectActions({
  requestId,
  stage,
  kind,
  approveLabel = 'Approve',
  onDone,
}: {
  requestId: number | string;
  stage: 'approver' | 'finance' | 'director';
  kind: string;
  approveLabel?: string;
  onDone: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const actorName = user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : user?.username || '';

  const close = () => {
    setMode(null);
    setNotes('');
  };

  const submit = async () => {
    if (!notes.trim()) {
      toast({
        title: 'Error',
        description: mode === 'approve' ? 'Please add notes or a digital signature before approving.' : 'A rejection reason is required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      setSubmitting(true);
      if (mode === 'approve') {
        await approveRequest(requestId, { approverName: actorName, signature: notes.trim(), stage });
        toast({ title: 'Success', description: `${kind} approved.` });
      } else {
        await rejectRequest(requestId, { reason: notes.trim(), rejectorName: actorName });
        toast({ title: 'Success', description: `${kind} rejected.` });
      }
      close();
      await onDone();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Action failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button onClick={() => setMode('approve')} className="bg-[var(--accent-green)] hover:opacity-90 text-white">
        <Check className="h-4 w-4 mr-2" />
        {approveLabel}
      </Button>
      <Button variant="outline" onClick={() => setMode('reject')} className="border-[var(--danger-text)] text-[var(--danger-text)] hover:bg-[var(--accent-red-light)]">
        <Ban className="h-4 w-4 mr-2" />
        Reject
      </Button>

      <Dialog open={mode !== null} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'approve' ? `Approve ${kind}` : `Reject ${kind}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {mode === 'approve' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Your Name</label>
                <Input value={actorName} disabled className="bg-gray-100" />
                <p className="mt-1 text-xs text-gray-500">Automatically filled from your profile.</p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {mode === 'approve' ? 'Notes / Digital Signature *' : 'Reason *'}
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder={mode === 'approve' ? 'e.g. Approved for issuance' : 'Explain why this request is being rejected'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={submitting}>Cancel</Button>
            <Button type="button" variant={mode === 'reject' ? 'destructive' : 'default'} onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting…' : mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
