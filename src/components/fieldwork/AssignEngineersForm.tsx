import { useEffect, useState } from 'react';
import { Search, Star, X, Ticket, Network } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { API_URL } from '@/lib/api';
import { getUsers, cxApi } from '@/api';
import { getProjectRequest } from '@/api/project';
import { createFieldWork } from '@/api/fieldWork';
import { searchReferencesFreeText } from '@/api/references';
import type { ReferenceSummary } from '@/lib/referenceRegistry';

type UserRow = { id: number; first_name?: string; last_name?: string; username?: string; unit?: string | null };
type SiteRow = { id: number; site_name: string; site_address: string | null; region: string | null; customer_id: number | null };
type ClientRow = { id: number; name: string; customer_code: string };

const WORK_TYPES = ['Installation', 'Repair', 'Maintenance', 'Survey', 'Fiber Splicing', 'Equipment Swap', 'Investigation', 'Other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

async function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AssignEngineersForm({
  open, onClose, sourceType, sourceId, defaultTitle, defaultSiteName, defaultClientName, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  sourceType?: 'ticket' | 'service_request';
  sourceId?: number;
  defaultTitle?: string;
  defaultSiteName?: string;
  defaultClientName?: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const needsSourcePicker = !sourceType || !sourceId;
  const [pickedSource, setPickedSource] = useState<ReferenceSummary | null>(null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [sourceResults, setSourceResults] = useState<ReferenceSummary[]>([]);
  const [sourceSearching, setSourceSearching] = useState(false);
  const resolvedSourceType = sourceType || (pickedSource?.type as 'ticket' | 'service_request' | undefined);
  const resolvedSourceId = sourceId || pickedSource?.id;

  useEffect(() => {
    if (!needsSourcePicker) return;
    const q = sourceQuery.trim();
    if (!q) { setSourceResults([]); return; }
    setSourceSearching(true);
    const timer = window.setTimeout(() => {
      searchReferencesFreeText(q)
        .then((results) => setSourceResults(results.filter((r) => r.type === 'ticket' || r.type === 'service_request')))
        .catch(() => setSourceResults([]))
        .finally(() => setSourceSearching(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sourceQuery, needsSourcePicker]);

  const [title, setTitle] = useState(defaultTitle || '');
  const [workType, setWorkType] = useState(WORK_TYPES[0]);
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [siteQuery, setSiteQuery] = useState(defaultSiteName || '');
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [clientQuery, setClientQuery] = useState(defaultClientName || '');
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [engineerQuery, setEngineerQuery] = useState('');
  const [selectedEngineers, setSelectedEngineers] = useState<UserRow[]>([]);
  const [leadEngineerId, setLeadEngineerId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) getUsers().then((u) => setAllUsers(u as unknown as UserRow[])).catch(() => {}); }, [open]);
  useEffect(() => { setTitle(defaultTitle || ''); setSiteQuery(defaultSiteName || ''); setClientQuery(defaultClientName || ''); }, [defaultTitle, defaultSiteName, defaultClientName, open]);
  useEffect(() => { if (!open) { setPickedSource(null); setSourceQuery(''); setSourceResults([]); } }, [open]);
  const [prefilling, setPrefilling] = useState(false);
  useEffect(() => {
    if (!pickedSource) return;
    setTitle((t) => t || pickedSource.title);
    // Reference search results don't carry site/client — fetch the real record once picked so
    // the site and client fields aren't left for the supervisor to hunt down and retype by hand.
    let cancelled = false;
    setPrefilling(true);
    const load = async () => {
      try {
        if (pickedSource.type === 'ticket') {
          const raw: any = await cxApi.getTicketDetails(pickedSource.referenceNumber);
          const t = raw?.data?.ticket || raw?.ticket || raw?.data || raw;
          if (cancelled) return;
          if (t?.site?.site_name || t?.site_name) { setSiteQuery(t.site?.site_name || t.site_name); setSiteId(t.site?.id || t.site_id || null); }
          if (t?.customer_name) { setClientQuery(t.customer_name); setClientId(t.customer_id || null); }
        } else if (pickedSource.type === 'service_request') {
          const sr: any = await getProjectRequest(pickedSource.id);
          if (cancelled) return;
          if (sr?.site_name) { setSiteQuery(sr.site_name); setSiteId(sr.site_id || null); }
          if (sr?.customer_name) { setClientQuery(sr.customer_name); setClientId(sr.customer_id || null); }
        }
      } catch {
        // best-effort prefill — supervisor can still fill site/client in by hand
      } finally {
        if (!cancelled) setPrefilling(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [pickedSource]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/field-work/sites?q=${encodeURIComponent(siteQuery)}`, { headers });
      if (res.ok) setSites(await res.json());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [siteQuery]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const headers = await authHeaders();
      const res = await fetch(`${API_URL}/field-work/clients?q=${encodeURIComponent(clientQuery)}`, { headers });
      if (res.ok) setClients(await res.json());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clientQuery]);

  const filteredEngineers = allUsers.filter((u) => {
    const name = `${u.first_name || ''} ${u.last_name || ''} ${u.username || ''}`.toLowerCase();
    return name.includes(engineerQuery.toLowerCase()) && !selectedEngineers.some((s) => s.id === u.id);
  }).slice(0, 8);

  const addEngineer = (u: UserRow) => {
    setSelectedEngineers((p) => [...p, u]);
    if (!leadEngineerId) setLeadEngineerId(u.id);
    setEngineerQuery('');
  };
  const removeEngineer = (id: number) => {
    setSelectedEngineers((p) => p.filter((u) => u.id !== id));
    if (leadEngineerId === id) setLeadEngineerId(null);
  };

  const submit = async () => {
    if (!resolvedSourceType || !resolvedSourceId) return toast({ title: 'Choose a ticket or service request first', variant: 'destructive' });
    if (!title.trim()) return toast({ title: 'Title is required', variant: 'destructive' });
    if (!selectedEngineers.length) return toast({ title: 'Assign at least one engineer', variant: 'destructive' });
    try {
      setSubmitting(true);
      await createFieldWork({
        source_type: resolvedSourceType, source_id: resolvedSourceId,
        site_id: siteId, client_id: clientId, site_name: siteQuery,
        title: title.trim(), work_type: workType, priority, notes,
        engineer_ids: selectedEngineers.map((e) => e.id), lead_engineer_id: leadEngineerId || selectedEngineers[0].id,
      });
      toast({ title: 'Field engineers assigned' });
      onCreated();
      onClose();
    } catch (e) {
      toast({ title: 'Could not assign field work', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (needsSourcePicker && !pickedSource) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Assign Field Engineers</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">Search for the Ticket or Service Request this field work belongs to.</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input className="pl-9" autoFocus value={sourceQuery} onChange={(e) => setSourceQuery(e.target.value)} placeholder="Search by reference, title, customer, site…" />
            </div>
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {sourceSearching && <p className="py-6 text-center text-sm text-[var(--text-muted)]">Searching…</p>}
              {!sourceSearching && sourceQuery.trim() && sourceResults.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">No matching ticket or service request found.</p>
              )}
              {sourceResults.map((r) => {
                const Icon = r.type === 'ticket' ? Ticket : Network;
                return (
                  <button key={`${r.type}-${r.id}`} type="button" onClick={() => setPickedSource(r)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface-secondary)]">
                    <Icon className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{r.referenceNumber} — {r.title}</p>
                      <p className="text-xs text-[var(--text-muted)]">{r.type === 'ticket' ? 'Ticket' : 'Service Request'}{r.status ? ` · ${r.status}` : ''}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Assign Field Engineers</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {pickedSource && (
            <div className="rounded-lg border border-[var(--accent-blue-light)] bg-[var(--accent-blue-light)] px-3 py-2 text-sm text-[var(--info-text)]">
              Linked to <b>{pickedSource.referenceNumber}</b> — {pickedSource.title}
              {prefilling && <span className="ml-2 text-xs italic opacity-75">filling in site &amp; client…</span>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brief description of the work" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Site</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input className="pl-9" value={siteQuery} onChange={(e) => { setSiteQuery(e.target.value); setSiteId(null); }} placeholder="Search sites…" />
              </div>
              {siteQuery && !siteId && sites.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                  {sites.map((s) => (
                    <button key={s.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                      onClick={() => { setSiteId(s.id); setSiteQuery(s.site_name); if (s.customer_id) setClientId(s.customer_id); }}>
                      {s.site_name} <span className="text-xs text-[var(--text-muted)]">{s.region ? `— ${s.region}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Client</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input className="pl-9" value={clientQuery} onChange={(e) => { setClientQuery(e.target.value); setClientId(null); }} placeholder="Search clients…" />
              </div>
              {clientQuery && !clientId && clients.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                  {clients.map((c) => (
                    <button key={c.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
                      onClick={() => { setClientId(c.id); setClientQuery(c.name); }}>
                      {c.name} <span className="text-xs text-[var(--text-muted)]">{c.customer_code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Work Type</label>
              <Select value={workType} onValueChange={setWorkType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{WORK_TYPES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the engineers should know before heading out" rows={3} />
          </div>

          <div className="relative">
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Assign Engineers</label>
            <Input value={engineerQuery} onChange={(e) => setEngineerQuery(e.target.value)} placeholder="Search staff by name…" />
            {engineerQuery && filteredEngineers.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                {filteredEngineers.map((u) => (
                  <button key={u.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]" onClick={() => addEngineer(u)}>
                    {`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username} <span className="text-xs text-[var(--text-muted)]">{u.unit ? `— ${u.unit}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedEngineers.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {selectedEngineers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm">
                    <span>{`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" title="Designate lead engineer" onClick={() => setLeadEngineerId(u.id)}
                        className={leadEngineerId === u.id ? 'text-[var(--accent-amber)]' : 'text-[var(--text-muted)] hover:text-[var(--accent-amber)]'}>
                        <Star className="h-4 w-4" fill={leadEngineerId === u.id ? 'currentColor' : 'none'} />
                      </button>
                      <button type="button" onClick={() => removeEngineer(u.id)} className="text-[var(--text-muted)] hover:text-[var(--danger-text)]"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-[var(--text-muted)]">Click the star to set the lead engineer.</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={submitting}>{submitting ? 'Assigning…' : 'Submit'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
