import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wrench, MapPin, Building2, Clock, UserPlus, UserMinus, Star, Send, Paperclip,
  CheckCircle2, ShieldCheck, Users, Package, Truck, Fuel, Car, ExternalLink, Download,
} from 'lucide-react';
import { fileIconFor } from '@/components/archive/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { userHasAnyRole } from '@/config/roles';
import {
  getFieldWorkBySource, getFieldWork, updateFieldWorkStatus, addFieldWorkEngineers, removeFieldWorkEngineer,
  postFieldWorkUpdate, confirmFieldWork, type FieldWorkDetail, type EngineerStatus,
} from '@/api/fieldWork';
import { AssignEngineersForm } from './AssignEngineersForm';
import { FIELD_WORK_STATUS_LABELS, ENGINEER_STATUS_LABELS, fieldWorkStatusTone, timeElapsedSince } from './shared';

const SUPERVISOR_ROLES = ['ts_supervisor', 'ts_manager', 'field_engineer_admin', 'director', 'cto'];
const NOC_ROLES = ['noc_supervisor', 'noc_manager', 'director', 'cto'];

const LINKED_TYPE_ICON: Record<string, any> = { material_request: Package, transport_request: Truck, fuel_request: Fuel, vehicle_request: Car };
const LINKED_TYPE_LABEL: Record<string, string> = { material_request: 'Material Request', transport_request: 'Transport Request', fuel_request: 'Fuel Request', vehicle_request: 'Vehicle Request' };
const LINKED_TYPE_PATH: Record<string, (id: number) => string> = {
  material_request: (id) => `/request-forms/${id}`,
  transport_request: (id) => `/transport-requests/${id}`,
  fuel_request: (id) => `/transport/fuel-requests/${id}`,
  vehicle_request: (id) => `/transport/vehicle-rental-requests/${id}`,
};

export function FieldWorkPanel({
  sourceType, sourceId, fieldWorkId, sourceTitle, sourceSiteName, sourceClientName, embedded = false,
}: {
  sourceType?: 'ticket' | 'service_request';
  sourceId?: number;
  fieldWorkId?: number;
  sourceTitle?: string;
  sourceSiteName?: string;
  sourceClientName?: string;
  embedded?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FieldWorkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [addingEngineer, setAddingEngineer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupervisor = userHasAnyRole(user, SUPERVISOR_ROLES);
  const isNoc = userHasAnyRole(user, NOC_ROLES);
  const isEngineer = !!detail?.engineers.some((e) => e.user_id === user?.id);

  const load = async () => {
    try {
      setLoading(true);
      const data = fieldWorkId ? await getFieldWork(fieldWorkId) : await getFieldWorkBySource(sourceType!, sourceId!);
      setDetail(data);
    } catch (e) {
      // 403/404 just mean nothing to show for this viewer
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fieldWorkId, sourceType, sourceId]);

  if (loading) return <Skeleton className="h-40 w-full rounded-2xl" />;

  if (!detail) {
    if (!sourceType || !sourceId || !(isSupervisor || isNoc)) return null;
    return (
      <div className="overflow-hidden rounded-2xl border border-dashed border-[var(--border-strong)] bg-gradient-to-b from-[var(--surface-secondary)] to-[var(--surface)] p-8 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-blue-light)]">
          <Wrench className="h-6 w-6 text-[var(--primary)]" />
        </span>
        <p className="mb-1 text-base font-bold text-[var(--text-primary)]">No field engineers assigned yet</p>
        <p className="mx-auto mb-4 max-w-sm text-sm text-[var(--text-secondary)]">
          {sourceSiteName || sourceClientName
            ? `Send someone out to ${[sourceSiteName, sourceClientName].filter(Boolean).join(' for ')} and track their progress right here.`
            : 'Assign engineers to this job and track their progress right here.'}
        </p>
        {isSupervisor && <Button type="button" onClick={() => setAssignOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Assign Field Engineers</Button>}
        <AssignEngineersForm
          open={assignOpen} onClose={() => setAssignOpen(false)} sourceType={sourceType} sourceId={sourceId}
          defaultTitle={sourceTitle} defaultSiteName={sourceSiteName} defaultClientName={sourceClientName}
          onCreated={load}
        />
      </div>
    );
  }

  const fieldWorkLinks = [
    { type: 'field_work', id: detail.id, label: `FW-${String(detail.id).padStart(3, '0')}`, title: detail.title, status: detail.status, referenceNumber: `FW-${String(detail.id).padStart(3, '0')}`, pagePath: null },
    { type: detail.source_type === 'ticket' ? 'ticket' : 'service_request', id: detail.source_id, label: detail.sourceReference, title: detail.sourceReference, status: null, referenceNumber: detail.sourceReference, pagePath: null },
  ];

  const goRequest = (path: string) => navigate(path, { state: { fieldWorkLinks } });

  const setMyStatus = async (status: EngineerStatus) => {
    try {
      await updateFieldWorkStatus(detail.id, status);
      toast({ title: `Status updated to ${ENGINEER_STATUS_LABELS[status]}` });
      load();
    } catch (e) { toast({ title: 'Could not update status', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const submitUpdate = async () => {
    if (!updateText.trim() && updateFiles.length === 0) return;
    try {
      setPosting(true);
      await postFieldWorkUpdate(detail.id, { update_type: 'progress', content: updateText.trim() || undefined, files: updateFiles });
      setUpdateText(''); setUpdateFiles([]);
      toast({ title: 'Update posted' });
      load();
    } catch (e) {
      toast({ title: 'Could not post update', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally { setPosting(false); }
  };

  const removeEngineerAction = async (userId: number) => {
    try { await removeFieldWorkEngineer(detail.id, userId); toast({ title: 'Engineer removed' }); load(); }
    catch (e) { toast({ title: 'Could not remove engineer', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const setLead = async (userId: number) => {
    try { await addFieldWorkEngineers(detail.id, [], userId); toast({ title: 'Lead engineer updated' }); load(); }
    catch (e) { toast({ title: 'Could not change lead', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const nocConfirm = async (outcome: 'confirm' | 'reject', notes?: string) => {
    try { await confirmFieldWork(detail.id, { confirmation_type: 'noc', outcome, notes }); toast({ title: outcome === 'confirm' ? 'Field work confirmed' : 'Sent back to engineers' }); load(); }
    catch (e) { toast({ title: 'Could not record NOC confirmation', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const clientConfirm = async (clientName: string, notes: string) => {
    try { await confirmFieldWork(detail.id, { confirmation_type: 'client', client_name: clientName, notes }); toast({ title: 'Client confirmation recorded — field work closed' }); load(); }
    catch (e) { toast({ title: 'Could not record client confirmation', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--border)] bg-gradient-to-r from-[var(--accent-blue-light)] via-[var(--surface)] to-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] shadow-[var(--shadow-sm)]">
              <Wrench className="h-5 w-5 text-white" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Field Engineering</h2>
                {!embedded && detail.sourceLink && (
                  <button
                    type="button"
                    onClick={() => goRequest(detail.sourceLink)}
                    className="text-xs text-[var(--primary)] underline-offset-2 hover:underline"
                  >
                    — {detail.sourceReference}
                  </button>
                )}
                {!embedded && !detail.sourceLink && <span className="text-xs text-[var(--text-muted)]">— {detail.sourceReference}</span>}
              </div>
              <p className="mt-0.5 text-lg font-bold text-[var(--text-primary)]">{detail.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                {detail.site_name && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {detail.site_name}</span>}
                {detail.client_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {detail.client_name}</span>}
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeElapsedSince(detail.created_at)} elapsed</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={fieldWorkStatusTone(detail.status)}>{FIELD_WORK_STATUS_LABELS[detail.status]}</StatusPill>
            {isSupervisor && <Button type="button" size="sm" variant="outline" onClick={() => setAddingEngineer(true)}><UserPlus className="mr-1 h-3.5 w-3.5" /> Add Engineer</Button>}
          </div>
        </div>
      </div>

      <div className="p-5">
      <Progress value={detail.status === 'closed' ? 100 : detail.status === 'completed' || detail.status === 'noc_confirmed' ? 85 : detail.engineers.length ? Math.round((detail.engineers.filter((e) => e.status === 'completed').length / detail.engineers.length) * 60) : 5} className="mb-4 h-1.5" />

      <div className="mb-4 flex flex-wrap gap-2">
        {detail.engineers.map((e) => (
          <div key={e.id} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] py-1 pl-1.5 pr-1.5 text-xs">
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white">
              {e.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'}
              {e.is_lead && (
                <Star className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--surface)] text-[var(--accent-amber)]" fill="currentColor" />
              )}
            </span>
            <span className="font-medium text-[var(--text-primary)]">{e.full_name}</span>
            <StatusPill tone="info" className="!py-0 !px-1.5 !text-[10px]">{ENGINEER_STATUS_LABELS[e.status]}</StatusPill>
            {isSupervisor && (
              <div className="flex items-center gap-1">
                {!e.is_lead && <button type="button" title="Make lead" onClick={() => setLead(e.user_id)} className="text-[var(--text-muted)] hover:text-[var(--accent-amber)]"><Star className="h-3 w-3" /></button>}
                <button type="button" title="Remove" onClick={() => removeEngineerAction(e.user_id)} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><UserMinus className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isEngineer && !isSupervisor && !['completed', 'noc_confirmed', 'client_confirmed', 'closed'].includes(detail.status) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">My status:</span>
          <Select value={detail.engineers.find((e) => e.user_id === user?.id)?.status} onValueChange={(v) => setMyStatus(v as EngineerStatus)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['assigned', 'travelling', 'on_site', 'completed'] as EngineerStatus[]).map((s) => <SelectItem key={s} value={s}>{ENGINEER_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => goRequest('/request-forms')}><Package className="mr-1 h-3.5 w-3.5" /> Materials</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => goRequest('/transport-request')}><Truck className="mr-1 h-3.5 w-3.5" /> Transport</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => goRequest('/transport/fuel-requests/new')}><Fuel className="mr-1 h-3.5 w-3.5" /> Fuel</Button>
          </div>
        </div>
      )}

      {(isEngineer || isSupervisor) && (
        <div className="mb-4 rounded-xl border border-[var(--border)] p-3">
          <Textarea value={updateText} onChange={(e) => setUpdateText(e.target.value)} placeholder="Post a progress update or note…" rows={2} />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setUpdateFiles(Array.from(e.target.files || []))} />
              <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}><Paperclip className="mr-1 h-3.5 w-3.5" /> {updateFiles.length ? `${updateFiles.length} file(s)` : 'Attach'}</Button>
            </div>
            <Button type="button" size="sm" onClick={submitUpdate} disabled={posting}><Send className="mr-1 h-3.5 w-3.5" /> {posting ? 'Posting…' : 'Post Update'}</Button>
          </div>
        </div>
      )}

      {detail.updates.length > 0 && (
        <div className="mb-4 space-y-2">
          {detail.updates.map((u) => (
            <div key={u.id} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--text-primary)]">{u.full_name || 'System'}</span>
                <span className="text-xs text-[var(--text-muted)]">{new Date(u.created_at).toLocaleString()}</span>
              </div>
              {u.content && <p className="mt-0.5 text-[var(--text-secondary)]">{u.content}</p>}
              {u.progress_percentage != null && <p className="mt-0.5 text-xs text-[var(--text-muted)]">Progress: {u.progress_percentage}%</p>}
              {u.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {u.attachments.map((a, i) => <AttachmentThumb key={i} attachment={a} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {detail.linkedRequests.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Linked Requests</h3>
          <div className="space-y-1.5">
            {detail.linkedRequests.map((r, i) => {
              const Icon = LINKED_TYPE_ICON[r.linked_record_type] || Package;
              return (
                <button key={i} type="button" onClick={() => navigate(LINKED_TYPE_PATH[r.linked_record_type]?.(r.linked_record_id) || '#')}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-secondary)]">
                  <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" /> {LINKED_TYPE_LABEL[r.linked_record_type]} — {r.linked_title}</span>
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">{r.linked_status} <ExternalLink className="h-3 w-3" /></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isEngineer && !isSupervisor && detail.status !== 'completed' && !['noc_confirmed', 'client_confirmed', 'closed'].includes(detail.status) && (
        <Button type="button" className="mb-4 w-full" onClick={() => setMyStatus('completed')}><CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark My Work Complete</Button>
      )}

      {isNoc && detail.status === 'completed' && (
        <NocConfirmBlock onConfirm={(notes) => nocConfirm('confirm', notes)} onReject={(notes) => nocConfirm('reject', notes)} />
      )}

      {isSupervisor && detail.status === 'noc_confirmed' && (
        <ClientConfirmBlock defaultClientName={detail.client_name || ''} onConfirm={clientConfirm} />
      )}

      {detail.confirmations.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-3">
          {detail.confirmations.map((c) => (
            <p key={c.id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--success-text)]" />
              {c.confirmation_type === 'noc' && `Confirmed by NOC (${c.confirmed_by_name}) on ${new Date(c.confirmed_at).toLocaleDateString()}`}
              {c.confirmation_type === 'noc_rejected' && `Sent back by NOC (${c.confirmed_by_name}) on ${new Date(c.confirmed_at).toLocaleDateString()}${c.notes ? `: ${c.notes}` : ''}`}
              {c.confirmation_type === 'client' && `Confirmed by client ${c.client_name} on ${new Date(c.confirmed_at).toLocaleDateString()}`}
            </p>
          ))}
        </div>
      )}
      </div>

      <AssignEngineersForm
        open={addingEngineer} onClose={() => setAddingEngineer(false)} sourceType={detail.source_type} sourceId={detail.source_id}
        onCreated={load}
      />
    </div>
  );
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

function AttachmentThumb({ attachment }: { attachment: { path: string; name: string; mime_type?: string } }) {
  const ext = (attachment.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(ext) || !!attachment.mime_type?.startsWith('image/');

  if (isImage) {
    return (
      <a href={attachment.path} target="_blank" rel="noreferrer" title={attachment.name}
        className="group relative block h-24 w-24 overflow-hidden rounded-lg border border-[var(--border)]">
        <img src={attachment.path} alt={attachment.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">{attachment.name}</span>
      </a>
    );
  }

  const Icon = fileIconFor(ext);
  return (
    <a href={attachment.path} target="_blank" rel="noreferrer" title={attachment.name}
      className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-2 text-center transition hover:border-[var(--primary)]">
      <Icon className="h-7 w-7 text-[var(--primary)]" />
      <span className="line-clamp-2 w-full break-words text-[10px] leading-tight text-[var(--text-secondary)]">{attachment.name}</span>
    </a>
  );
}

function NocConfirmBlock({ onConfirm, onReject }: { onConfirm: (notes?: string) => void; onReject: (notes?: string) => void }) {
  const [notes, setNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="mb-4 rounded-xl border border-[var(--accent-blue-light)] bg-[var(--accent-blue-light)] p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--info-text)]"><ShieldCheck className="h-4 w-4" /> Awaiting NOC Confirmation</p>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note" rows={2} className="bg-white" />
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting((v) => !v)}>{rejecting ? 'Cancel' : 'Send Back'}</Button>
        {rejecting ? (
          <Button type="button" size="sm" variant="destructive" disabled={!notes.trim()} onClick={() => onReject(notes)}>Confirm Send Back</Button>
        ) : (
          <Button type="button" size="sm" onClick={() => onConfirm(notes || undefined)}>Confirm</Button>
        )}
      </div>
    </div>
  );
}

function ClientConfirmBlock({ defaultClientName, onConfirm }: { defaultClientName: string; onConfirm: (clientName: string, notes: string) => void }) {
  const [clientName, setClientName] = useState(defaultClientName);
  const [notes, setNotes] = useState('');
  return (
    <div className="mb-4 rounded-xl border border-[var(--accent-green-light)] bg-[var(--accent-green-light)] p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--success-text)]"><Users className="h-4 w-4" /> Record Client Confirmation</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Confirmed by (client name)" className="bg-white" />
        <Input value={new Date().toLocaleDateString()} disabled className="bg-white" />
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="mt-2 bg-white" />
      <div className="mt-2 flex justify-end">
        <Button type="button" size="sm" disabled={!clientName.trim()} onClick={() => onConfirm(clientName.trim(), notes)}>Confirm &amp; Close</Button>
      </div>
    </div>
  );
}
