import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Cable, Clock, Download, History, Link2, Paperclip, Search, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { fileIconFor, formatFileSize } from '@/components/archive/shared';
import { CIRCUIT_STATUS_LABELS, circuitStatusTone } from '@/components/ipUnit/shared';
import { LinkedReferencesSection } from '@/components/references/LinkedReferencesSection';
import { searchReferencesFreeText, linkReference } from '@/api/references';
import { GHANA_REGIONS, SERVICE_TYPES } from '@/lib/lookups';
import type { ReferenceSummary } from '@/lib/referenceRegistry';
import {
  getCircuit, updateCircuit, listCircuitAttachments, uploadCircuitAttachment,
  deleteCircuitAttachment, downloadCircuitAttachment, type CircuitStatus,
} from '@/api/ipUnit';

export default function CircuitProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [refreshLinks, setRefreshLinks] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const query = useQuery({ queryKey: ['ip-unit', 'circuit', id], queryFn: () => getCircuit(id!), enabled: !!id });
  const attachmentsQuery = useQuery({ queryKey: ['ip-unit', 'circuit', id, 'attachments'], queryFn: () => listCircuitAttachments(id!), enabled: !!id });

  const circuit = query.data;

  const [form, setForm] = useState({ service_type: '', capacity: '', vlan: '', region: '', notes: '', status: 'active' as CircuitStatus });
  useEffect(() => {
    if (circuit) setForm({ service_type: circuit.service_type || '', capacity: circuit.capacity || '', vlan: circuit.vlan || '', region: circuit.region || '', notes: circuit.notes || '', status: circuit.status });
  }, [circuit?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ip-unit', 'circuit', id] });
    queryClient.invalidateQueries({ queryKey: ['ip-unit', 'circuits'] });
  };

  const saveEdit = async () => {
    if (!circuit) return;
    try {
      await updateCircuit(circuit.id, form);
      toast({ title: 'Circuit updated' });
      setEditing(false);
      invalidate();
    } catch (e) {
      toast({ title: 'Could not update circuit', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const doUpload = async (files: FileList | null) => {
    if (!files?.length || !circuit) return;
    try {
      setUploading(true);
      await uploadCircuitAttachment(circuit.id, files[0]);
      toast({ title: 'File uploaded' });
      queryClient.invalidateQueries({ queryKey: ['ip-unit', 'circuit', id, 'attachments'] });
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (attachmentId: number) => {
    try {
      await deleteCircuitAttachment(attachmentId);
      toast({ title: 'Attachment deleted' });
      queryClient.invalidateQueries({ queryKey: ['ip-unit', 'circuit', id, 'attachments'] });
    } catch (e) {
      toast({ title: 'Could not delete attachment', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (query.isLoading) {
    return <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>;
  }
  if (!circuit) {
    return <div className="mx-auto max-w-5xl p-6"><p className="text-sm text-[var(--text-muted)]">Circuit not found.</p></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/ip-unit/circuits')} className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back to Inventory
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <div>
          <div className="flex items-center gap-2">
            <Cable className="h-6 w-6 text-[var(--primary)]" />
            <h1 className="font-mono text-2xl font-bold text-[var(--text-primary)]">{circuit.circuit_id}</h1>
            <StatusPill tone={circuitStatusTone(circuit.status)}>{CIRCUIT_STATUS_LABELS[circuit.status]}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {circuit.client_name || 'No client'} • {circuit.pop_name || circuit.site_name || 'No POP'}
          </p>
        </div>
        <Button type="button" onClick={() => setEditing((v) => !v)}>{editing ? 'Cancel' : 'Update'}</Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">Details</h2>
        {editing ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Service Type</label>
                <Select value={form.service_type} onValueChange={(v) => setForm((f) => ({ ...f, service_type: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{SERVICE_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Capacity</label>
                <Input value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">VLAN</label>
                <Input value={form.vlan} onChange={(e) => setForm((f) => ({ ...f, vlan: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Region</label>
                <Select value={form.region} onValueChange={(v) => setForm((f) => ({ ...f, region: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{GHANA_REGIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as CircuitStatus }))}>
                <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(CIRCUIT_STATUS_LABELS) as CircuitStatus[]).map((s) => <SelectItem key={s} value={s}>{CIRCUIT_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Notes</label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="button" onClick={saveEdit}>Save Changes</Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Service" value={circuit.service_type} />
            <Field label="Capacity" value={circuit.capacity || '—'} />
            <Field label="VLAN" value={circuit.vlan || '—'} />
            <Field label="Region" value={circuit.region || '—'} />
            <Field label="Client" value={circuit.client_name || '—'} />
            <Field label="Site" value={circuit.site_name || '—'} />
            {circuit.notes && <div className="sm:col-span-2"><Field label="Notes" value={circuit.notes} /></div>}
          </dl>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Paperclip className="h-4 w-4" /> Attachments</h2>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { doUpload(e.target.files); e.target.value = ''; }} />
          <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> {uploading ? 'Uploading…' : 'Upload BOQ / KMZ / Config'}
          </Button>
        </div>
        {!attachmentsQuery.data?.length ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No attachments yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {attachmentsQuery.data.map((a) => {
              const Icon = fileIconFor(a.file_name.split('.').pop());
              return (
                <div key={a.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2.5">
                  <Icon className="h-6 w-6 shrink-0 text-[var(--primary)]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={a.file_name}>{a.file_name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{a.uploader_name} · {new Date(a.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadCircuitAttachment(a.id, a.file_name)}><Download className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[var(--danger-text)]" onClick={() => removeAttachment(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LinkServiceRequest circuitId={circuit.id} onLinked={() => setRefreshLinks((v) => v + 1)} />
      <div key={refreshLinks}><LinkedReferencesSection recordType="ip_circuit" recordId={circuit.id} /></div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><History className="h-4 w-4" /> Activity Timeline</h2>
        {!circuit.history.length ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">No changes recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {circuit.history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-[var(--text-primary)]">{h.field_name}</p>
                  {h.old_value || h.new_value ? (
                    <p className="text-[var(--text-secondary)]">{h.old_value ? <>from <span className="font-medium">{h.old_value}</span> </> : null}to <span className="font-medium">{h.new_value || '—'}</span></p>
                  ) : null}
                  <p className="text-xs text-[var(--text-muted)]">{h.changed_by_name || 'System'} · {new Date(h.changed_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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

/** Search-and-link a Service Request (or any other record) to this circuit — calls the
 * generic reference-link API directly since this circuit already exists (unlike
 * ReferenceLinkPicker, which is built for a pre-submit create form). */
function LinkServiceRequest({ circuitId, onLinked }: { circuitId: number; onLinked: () => void }) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReferenceSummary[]>([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const timer = window.setTimeout(() => {
      searchReferencesFreeText(q).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const link = async (ref: ReferenceSummary) => {
    try {
      setLinking(true);
      await linkReference('ip_circuit', circuitId, ref.type, ref.id);
      toast({ title: `Linked to ${ref.title}` });
      setQuery('');
      setResults([]);
      onLinked();
    } catch (e) {
      toast({ title: 'Could not link record', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Link2 className="h-4 w-4" /> Link a Service Request</h2>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input className="pl-9" placeholder="Search Service Requests, Tickets…" value={query} onChange={(e) => setQuery(e.target.value)} disabled={linking} />
        {query && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" onClick={() => setQuery('')}><X className="h-4 w-4" /></button>}
      </div>
      {results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map((r) => (
            <button key={`${r.type}-${r.id}`} type="button" onClick={() => link(r)} className="block w-full rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]">
              <span className="font-mono text-xs font-semibold text-[var(--primary)]">{r.referenceNumber}</span> — {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
