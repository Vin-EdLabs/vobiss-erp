import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InfoField } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { useToast } from '@/hooks/use-toast';
import { nocApproveProjectRequest, type ProjectRequest } from '@/api/project';
import { IpReadOnlySummary } from './IpStageSection';

/** NOC reviews IP's integration package (read-only — fields belong to IP, not NOC) and leaves
 *  its own monitoring note before approving back to Project. */
export function NocStageSection({
  request, canAct, actionLoading, setActionLoading, onUpdated,
}: {
  request: ProjectRequest;
  canAct: boolean;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(request.noc_notes || '');
  const showIpIntegration = !!(request.circuit_id || request.ip_address || request.mac_address || request.integrated_by);

  const approve = async () => {
    setActionLoading(true);
    try {
      await nocApproveProjectRequest(request.id, notes);
      toast({ title: 'Approved by NOC' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not approve', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {showIpIntegration ? (
        <IpReadOnlySummary request={request} />
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          Waiting for IP submission.
        </p>
      )}
      <AttachmentZone attachments={(request.attachments || []).filter((a) => a.stage === 'ip')} allowUpload={false} />

      {canAct ? (
        <div className="space-y-3 border-t border-[var(--border)] pt-5">
          <label className="block text-sm font-medium text-[var(--text-secondary)]">Monitoring notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Monitoring observations…" className="min-h-[100px]" />
          <Button disabled={actionLoading} onClick={() => void approve()}>
            <Check className="mr-2 h-4 w-4" />Approve and return to Project
          </Button>
        </div>
      ) : request.noc_notes ? (
        <InfoField label="NOC notes" value={request.noc_notes} />
      ) : null}
      {/* NOC has no upload widget of its own — matches the pre-existing backend rule that NOC
          works via Tickets for live network issues, not attachments here — but still shows any
          noc-tagged attachments that do exist, same "nothing hidden" rule every other card follows. */}
      {(request.attachments || []).some((a) => a.stage === 'noc') && (
        <AttachmentZone attachments={(request.attachments || []).filter((a) => a.stage === 'noc')} allowUpload={false} />
      )}
    </div>
  );
}
