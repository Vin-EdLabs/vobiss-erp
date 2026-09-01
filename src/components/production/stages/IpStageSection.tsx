import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField, InfoField, InfoGrid } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { useToast } from '@/hooks/use-toast';
import { ipForwardProjectRequest, uploadProjectRequestAttachment, type ProjectRequest } from '@/api/project';

/** Read-only display of IP's integration details — used once this stage is done (also reused by
 *  the NOC section, which reviews the same package). */
export function IpReadOnlySummary({ request }: { request: ProjectRequest }) {
  return (
    <InfoGrid>
      <InfoField label="Circuit ID" value={request.circuit_id} />
      <InfoField label="Integration date" value={request.integration_date} />
      <InfoField label="IP address" value={request.ip_address} />
      <InfoField label="MAC address" value={request.mac_address} />
      <InfoField label="Integrated by" value={request.integrated_by} />
    </InfoGrid>
  );
}

/** IP's integration form — extracted as-is from the old single-branch ProductionDetail.tsx. */
export function IpStageSection({
  request, canAct, canUpload, actionLoading, setActionLoading, onUpdated,
}: {
  request: ProjectRequest;
  canAct: boolean;
  canUpload: boolean;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [ipForm, setIpForm] = useState({
    circuit_id: request.circuit_id || '',
    integration_date: request.integration_date?.slice(0, 10) || '',
    ip_address: request.ip_address || '',
    mac_address: request.mac_address || '',
    integrated_by: request.integrated_by || '',
    comment: '',
  });

  const send = async (routeToStage: 'project' | 'ts') => {
    setActionLoading(true);
    try {
      const { comment, ...fields } = ipForm;
      await ipForwardProjectRequest(request.id, { ...fields, comment_text: comment.trim() || undefined, route_to_stage: routeToStage });
      toast({ title: 'Submitted', description: routeToStage === 'project' ? 'Sent to Project Unit for review' : 'Sent back to TX for follow-up' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not send', description: e instanceof Error ? e.message : 'Something went wrong', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!canAct) {
    return (
      <div className="space-y-4">
        <IpReadOnlySummary request={request} />
        <AttachmentZone attachments={(request.attachments || []).filter((a) => a.stage === 'ip')} allowUpload={false} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--text-secondary)]">Fill in integration details below. Comment is optional and is only sent when you submit.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Circuit ID" value={ipForm.circuit_id} onChange={(v) => setIpForm((f) => ({ ...f, circuit_id: v }))} />
        <FormField label="Integration Date" type="date" value={ipForm.integration_date} onChange={(v) => setIpForm((f) => ({ ...f, integration_date: v }))} />
        <FormField label="IP Address" value={ipForm.ip_address} onChange={(v) => setIpForm((f) => ({ ...f, ip_address: v }))} />
        <FormField label="MAC Address" value={ipForm.mac_address} onChange={(v) => setIpForm((f) => ({ ...f, mac_address: v }))} />
        <FormField label="Integrated By" value={ipForm.integrated_by} onChange={(v) => setIpForm((f) => ({ ...f, integrated_by: v }))} className="sm:col-span-2" />
        <FormField label="Comment (optional)" as="textarea" value={ipForm.comment} onChange={(v) => setIpForm((f) => ({ ...f, comment: v }))} placeholder="Optional notes for NOC — not required to send" className="sm:col-span-2" />
      </div>
      <AttachmentZone
        attachments={(request.attachments || []).filter((a) => a.stage === 'ip')}
        allowUpload={canUpload}
        onUpload={async (file) => { await uploadProjectRequestAttachment(request.id, file, 'ip'); await onUpdated(); }}
      />
      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
        <Button type="button" disabled={actionLoading} className="w-full rounded-xl bg-indigo-600 py-6 text-base font-semibold hover:bg-indigo-700" onClick={() => void send('project')}>
          <Send className="mr-2 h-5 w-5" />Submit to Project
        </Button>
        <Button type="button" variant="outline" disabled={actionLoading} className="w-full rounded-xl py-6 text-base font-semibold" onClick={() => void send('ts')}>
          <Send className="mr-2 h-5 w-5" />Submit to TX
        </Button>
      </div>
    </div>
  );
}
