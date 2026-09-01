import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ClipboardList, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { getUserRoles } from '@/config/roles';
import {
  getCircuitRequest, generateCircuitFromRequest, returnCircuitRequest, rejectCircuitRequest,
} from '@/api/ipUnit';
import { CIRCUIT_REQUEST_STATUS_LABELS, CIRCUIT_REQUEST_STAGE_ORDER, circuitRequestStatusTone } from '@/components/ipUnit/shared';

export default function CircuitRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);

  const query = useQuery({ queryKey: ['ip-unit', 'request', id], queryFn: () => getCircuitRequest(id!), enabled: !!id });
  const request = query.data;

  // "IP Manager"/"IP Supervisor" is often stored as free-text position rather than a role
  // slug on real accounts (same as Sidebar.tsx's isIpUser check) — this is just UX (buttons
  // shown/hidden); the server enforces the real permission check regardless.
  const position = String(user?.position || '').trim().toLowerCase();
  const canManage =
    getUserRoles(user).some((r) => ['ip_manager', 'ip_supervisor', 'director', 'cto', 'superadmin', 'admin'].includes(r)) ||
    position === 'ip manager' || position === 'ip supervisor';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ip-unit', 'request', id] });
    queryClient.invalidateQueries({ queryKey: ['ip-unit', 'requests'] });
    queryClient.invalidateQueries({ queryKey: ['ip-unit', 'dashboard'] });
  };

  const doGenerate = async () => {
    try {
      setActing(true);
      const updated = await generateCircuitFromRequest(id!);
      toast({ title: 'Circuit generated and added to inventory' });
      invalidate();
      if (updated.generated_circuit_id) navigate(`/ip-unit/circuits/${updated.generated_circuit_id}`);
    } catch (e) {
      toast({ title: 'Could not generate circuit', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const doReturn = async () => {
    try {
      setActing(true);
      await returnCircuitRequest(id!, notes || undefined);
      toast({ title: 'Returned to requester' });
      setNotes('');
      invalidate();
    } catch (e) {
      toast({ title: 'Could not return this request', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  const doReject = async () => {
    try {
      setActing(true);
      await rejectCircuitRequest(id!, notes || undefined);
      toast({ title: 'Request rejected' });
      setNotes('');
      invalidate();
    } catch (e) {
      toast({ title: 'Could not reject this request', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setActing(false);
    }
  };

  if (query.isLoading) {
    return <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>;
  }
  if (!request) {
    return <div className="mx-auto max-w-4xl p-6"><p className="text-sm text-[var(--text-muted)]">Circuit request not found.</p></div>;
  }

  const stageIdx = CIRCUIT_REQUEST_STAGE_ORDER.indexOf(request.status);
  const isOpen = !['returned_to_requester', 'rejected'].includes(request.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/ip-unit/requests')} className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back to Circuit Requests
      </button>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)]"><ClipboardList className="h-6 w-6" /> Circuit Request #{request.id}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              For {request.requested_by_user_name || request.requested_by_name || 'a staff member'}{request.requested_by_department ? ` (${request.requested_by_department})` : ''} · logged by {request.logged_by_name || 'IP Unit'}
            </p>
          </div>
          <StatusPill tone={circuitRequestStatusTone(request.status)}>{CIRCUIT_REQUEST_STATUS_LABELS[request.status]}</StatusPill>
        </div>

        {request.status !== 'rejected' && (
          <div className="mt-5 flex items-center gap-1">
            {CIRCUIT_REQUEST_STAGE_ORDER.map((stage, i) => (
              <div key={stage} className="flex flex-1 items-center gap-1">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i <= stageIdx ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                  {i <= stageIdx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                {i < CIRCUIT_REQUEST_STAGE_ORDER.length - 1 && <div className={`h-0.5 flex-1 ${i < stageIdx ? 'bg-[var(--primary)]' : 'bg-[var(--border)]'}`} />}
              </div>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <span>Submitted</span><span>Generated</span><span>Added to Inventory</span><span>Returned</span>
        </div>
      </div>

      <div className="grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] sm:grid-cols-2">
        <Field label="Client" value={request.client_name || '—'} />
        <Field label="Site" value={request.site_name || '—'} />
        <Field label="Service Type" value={request.service_type} />
        <Field label="POP" value={request.pop_name || '—'} />
        <Field label="Capacity" value={request.capacity || '—'} />
        <Field label="VLAN" value={request.vlan || '—'} />
        {request.purpose && <div className="sm:col-span-2"><Field label="Reason" value={request.purpose} /></div>}
        {request.review_notes && <div className="sm:col-span-2"><Field label="Review Notes" value={request.review_notes} /></div>}
      </div>

      {request.turnaround && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Turnaround</h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Total elapsed: {request.turnaround.totalElapsedMinutes != null ? `${Math.round(request.turnaround.totalElapsedMinutes / 60)}h ${request.turnaround.totalElapsedMinutes % 60}m` : '—'}
            {request.turnaround.slaStatus ? ` · SLA: ${String(request.turnaround.slaStatus).replace('_', ' ')}` : ''}
          </p>
        </div>
      )}

      {canManage && isOpen && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">IP Manager Actions</h2>
          <Textarea className="mb-3" rows={2} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {request.status === 'submitted' && (
              <Button type="button" onClick={doGenerate} disabled={acting}><Send className="mr-1.5 h-4 w-4" /> Generate Circuit</Button>
            )}
            {request.status === 'added_to_inventory' && (
              <Button type="button" onClick={doReturn} disabled={acting}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Return to Requester</Button>
            )}
            {request.status === 'submitted' && (
              <Button type="button" variant="outline" className="text-[var(--danger-text)]" onClick={doReject} disabled={acting}><XCircle className="mr-1.5 h-4 w-4" /> Reject</Button>
            )}
          </div>
        </div>
      )}

      {request.generated_circuit_id && (
        <Button type="button" variant="outline" onClick={() => navigate(`/ip-unit/circuits/${request.generated_circuit_id}`)}>View Generated Circuit</Button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
