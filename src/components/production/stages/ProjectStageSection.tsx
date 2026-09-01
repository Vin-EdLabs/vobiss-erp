import React, { useState } from 'react';
import { Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DetailCard, FormField, InfoField, InfoGrid } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { useToast } from '@/hooks/use-toast';
import { projectForwardProjectRequest, projectCompleteProjectRequest, uploadProjectRequestAttachment, type ProjectRequest, type ProjectStageFields } from '@/api/project';

/** Read-only display of whatever Project already filled — used once this stage is done. Shows
 *  Project's own attachments too, same as every other card, and still lets Project add more
 *  (documents stay open regardless of which action-state this section is in). */
export function ProjectReadOnlySummary({
  request, canUpload, onUpdated,
}: {
  request: ProjectRequest;
  canUpload?: boolean;
  onUpdated?: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <InfoGrid>
        <InfoField label="Capacity" value={request.capacity} />
        <InfoField label="Bandwidth" value={request.bandwidth} />
        <InfoField label="CPE" value={request.cpe} />
        <InfoField label="Cable distance" value={request.cable_displacement} />
        <InfoField label="ADSS" value={request.adss} />
        <InfoField label="Drop cable" value={request.drop_cable} />
        <InfoField label="Start date" value={request.start_date} />
        <InfoField label="Completion date" value={request.completion_date} />
        <InfoField label="Confirmation date" value={request.confirmation_date} />
        <InfoField label="MRC" value={request.mrc != null ? String(request.mrc) : undefined} />
        <InfoField label="NRC" value={request.nrc != null ? String(request.nrc) : undefined} />
      </InfoGrid>
      <AttachmentZone
        attachments={(request.attachments || []).filter((a) => a.stage === 'project')}
        allowUpload={!!canUpload}
        onUpload={canUpload && onUpdated ? async (file) => { await uploadProjectRequestAttachment(request.id, file, 'project'); await onUpdated(); } : undefined}
      />
    </div>
  );
}

/** Project fills its technical/commercial fields and routes to TX or IP in one step (fields save
 *  and the stage advances together, same shape IP's own forward already uses). Also carries the
 *  "send to NOC" hop once TX/IP have returned (status='integrated') and the final sign-off after
 *  NOC approves (status='noc_approved') — three distinct action states, one section. */
export function ProjectStageSection({
  request, canRoute, canSendNoc, canComplete, canUpload, actionLoading, setActionLoading, onUpdated,
}: {
  request: ProjectRequest;
  canRoute: boolean;
  canSendNoc: boolean;
  canComplete: boolean;
  canUpload: boolean;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    capacity: request.capacity || '', bandwidth: request.bandwidth || '', cpe: request.cpe || '',
    cable_displacement: request.cable_displacement || '', adss: request.adss || '', drop_cable: request.drop_cable || '',
    start_date: request.start_date || '', completion_date: request.completion_date || '', confirmation_date: request.confirmation_date || '',
    mrc: request.mrc != null ? String(request.mrc) : '', nrc: request.nrc != null ? String(request.nrc) : '',
  });

  const route = async (target: 'ts' | 'ip') => {
    setActionLoading(true);
    try {
      await projectForwardProjectRequest(request.id, target, form as ProjectStageFields);
      toast({ title: `Sent to ${target === 'ts' ? 'TX' : 'IP'}` });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not route', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const sendToNoc = async () => {
    setActionLoading(true);
    try {
      await projectForwardProjectRequest(request.id, 'noc');
      toast({ title: 'Sent to NOC' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not send to NOC', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const complete = async () => {
    setActionLoading(true);
    try {
      await projectCompleteProjectRequest(request.id);
      toast({ title: 'Request completed' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not complete', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (canComplete) {
    return (
      <div className="space-y-5">
        <ProjectReadOnlySummary request={request} canUpload={canUpload} onUpdated={onUpdated} />
        <DetailCard title="Mark as complete" icon={Check}>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">NOC has approved. Review the full package above, then mark this request complete.</p>
          <Button disabled={actionLoading} className="w-full rounded-xl bg-emerald-600 py-6 text-base font-semibold hover:bg-emerald-700" onClick={() => void complete()}>
            <Check className="mr-2 h-5 w-5" />{actionLoading ? 'Completing…' : 'Mark as complete'}
          </Button>
        </DetailCard>
      </div>
    );
  }

  if (canSendNoc) {
    return (
      <div className="space-y-5">
        <ProjectReadOnlySummary request={request} canUpload={canUpload} onUpdated={onUpdated} />
        <DetailCard title="Send to NOC" icon={Send}>
          <p className="mb-4 text-sm text-[var(--text-secondary)]">TX/IP have completed their work. Send the finished package to NOC for review.</p>
          <Button disabled={actionLoading} onClick={() => void sendToNoc()}><Send className="mr-2 h-4 w-4" />Send to NOC</Button>
        </DetailCard>
      </div>
    );
  }

  if (!canRoute) return <ProjectReadOnlySummary request={request} canUpload={canUpload} onUpdated={onUpdated} />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Capacity" value={form.capacity} onChange={(v) => setForm({ ...form, capacity: v })} />
        <FormField label="Bandwidth" value={form.bandwidth} onChange={(v) => setForm({ ...form, bandwidth: v })} />
        <FormField label="CPE" value={form.cpe} onChange={(v) => setForm({ ...form, cpe: v })} />
        <FormField label="Cable distance" value={form.cable_displacement} onChange={(v) => setForm({ ...form, cable_displacement: v })} />
        <FormField label="ADSS" value={form.adss} onChange={(v) => setForm({ ...form, adss: v })} />
        <FormField label="Drop cable" value={form.drop_cable} onChange={(v) => setForm({ ...form, drop_cable: v })} />
        <FormField label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
        <FormField label="Completion date" type="date" value={form.completion_date} onChange={(v) => setForm({ ...form, completion_date: v })} />
        <FormField label="Confirmation date" type="date" value={form.confirmation_date} onChange={(v) => setForm({ ...form, confirmation_date: v })} />
        <FormField label="MRC" type="number" value={form.mrc} onChange={(v) => setForm({ ...form, mrc: v })} />
        <FormField label="NRC" type="number" value={form.nrc} onChange={(v) => setForm({ ...form, nrc: v })} />
      </div>
      <AttachmentZone
        attachments={(request.attachments || []).filter((a) => a.stage === 'project')}
        allowUpload={canUpload}
        onUpload={async (file) => { await uploadProjectRequestAttachment(request.id, file, 'project'); await onUpdated(); }}
      />
      <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
        <Button disabled={actionLoading} onClick={() => void route('ts')}><Send className="mr-2 h-4 w-4" />Send to TX</Button>
        <Button disabled={actionLoading} variant="outline" onClick={() => void route('ip')}><Send className="mr-2 h-4 w-4" />Send to IP</Button>
      </div>
    </div>
  );
}
