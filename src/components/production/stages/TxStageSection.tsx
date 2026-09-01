import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InfoField } from '@/components/production/production-ui';
import { AttachmentZone } from '@/components/production/AttachmentZone';
import { useToast } from '@/hooks/use-toast';
import { tsAcceptProjectRequest, uploadProjectRequestAttachment, type ProjectRequest } from '@/api/project';

/** Read-only display of TX's own notes — used once this stage is done. */
export function TxReadOnlySummary({ request }: { request: ProjectRequest }) {
  return <InfoField label="TX notes" value={request.ts_notes} />;
}

/** TX's own stage-specific note (mirrors Design/IP already having one), then routes to IP or
 *  back to Project. */
export function TxStageSection({
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
  const [notes, setNotes] = useState(request.ts_notes || '');

  const send = async (routeTo: 'ip' | 'project') => {
    setActionLoading(true);
    try {
      await tsAcceptProjectRequest(request.id, routeTo, notes);
      toast({ title: routeTo === 'ip' ? 'Sent to IP' : 'Sent to Project' });
      await onUpdated();
    } catch (e: unknown) {
      toast({ title: 'Could not send', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!canAct) {
    return (
      <div className="space-y-4">
        <TxReadOnlySummary request={request} />
        <AttachmentZone attachments={(request.attachments || []).filter((a) => a.stage === 'ts')} allowUpload={false} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Transmission notes</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Routing notes, implementation summary…" className="min-h-[120px]" />
      </div>
      <AttachmentZone
        attachments={(request.attachments || []).filter((a) => a.stage === 'ts')}
        allowUpload={canUpload}
        onUpload={async (file) => { await uploadProjectRequestAttachment(request.id, file, 'ts'); await onUpdated(); }}
      />
      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
        <Button className="w-full rounded-xl bg-indigo-600 py-6 text-base font-semibold hover:bg-indigo-700" disabled={actionLoading} onClick={() => void send('ip')}>
          <Send className="mr-2 h-5 w-5" />Send to IP
        </Button>
        <Button variant="outline" className="w-full rounded-xl py-6 text-base font-semibold" disabled={actionLoading} onClick={() => void send('project')}>
          <Send className="mr-2 h-5 w-5" />Send to Project
        </Button>
      </div>
    </div>
  );
}
