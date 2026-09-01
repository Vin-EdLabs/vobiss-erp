import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { SearchPickerField } from '@/components/ipUnit/SearchPickerField';
import { CIRCUIT_REQUEST_STATUS_LABELS, circuitRequestStatusTone } from '@/components/ipUnit/shared';
import { createCircuitRequest, listCircuitRequests, searchIpClients, searchIpSites, searchIpPops, searchIpStaff, type LookupRow } from '@/api/ipUnit';
import { SERVICE_TYPES } from '@/lib/lookups';

export default function CircuitRequests() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ['ip-unit', 'requests'], queryFn: () => listCircuitRequests(), refetchInterval: 60000, retry: false });
  const rows = query.data || [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">IP Unit</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><ClipboardList className="h-7 w-7" /> Circuit Requests</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">New circuit IDs requested by other departments, logged and tracked here.</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Log a Circuit Request</Button>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No circuit requests logged yet.</p>
            <Button type="button" variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Log your first request</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logged</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-[var(--surface-secondary)]" onClick={() => navigate(`/ip-unit/requests/${r.id}`)}>
                    <TableCell>{r.requested_by_user_name || r.requested_by_name || '—'}{r.requested_by_department ? ` (${r.requested_by_department})` : ''}</TableCell>
                    <TableCell>{r.client_name || '—'}</TableCell>
                    <TableCell>{r.service_type}</TableCell>
                    <TableCell><StatusPill tone={circuitRequestStatusTone(r.status)}>{CIRCUIT_REQUEST_STATUS_LABELS[r.status]}</StatusPill></TableCell>
                    <TableCell className="text-xs text-[var(--text-muted)]">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <LogRequestDialog open={open} onClose={() => setOpen(false)} onCreated={() => query.refetch()} />
    </div>
  );
}

function LogRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [requesterMode, setRequesterMode] = useState<'staff' | 'text'>('staff');
  const [staffQuery, setStaffQuery] = useState('');
  const [staffId, setStaffId] = useState<number | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterDept, setRequesterDept] = useState('');

  const [clientQuery, setClientQuery] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteId, setSiteId] = useState<number | null>(null);
  const [popQuery, setPopQuery] = useState('');
  const [popId, setPopId] = useState<number | null>(null);
  const [region, setRegion] = useState('');
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [capacity, setCapacity] = useState('');
  const [vlan, setVlan] = useState('');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRequesterMode('staff'); setStaffQuery(''); setStaffId(null); setRequesterName(''); setRequesterDept('');
    setClientQuery(''); setClientId(null); setSiteQuery(''); setSiteId(null); setPopQuery(''); setPopId(null);
    setRegion(''); setServiceType(SERVICE_TYPES[0]); setCapacity(''); setVlan(''); setPurpose('');
  };

  const submit = async () => {
    if (requesterMode === 'staff' && !staffId) return toast({ title: 'Pick the staff member who is requesting this', variant: 'destructive' });
    if (requesterMode === 'text' && !requesterName.trim()) return toast({ title: "Enter the requester's name", variant: 'destructive' });
    if (!clientId) return toast({ title: 'Select a client', variant: 'destructive' });
    if (!siteId) return toast({ title: 'Select a site', variant: 'destructive' });
    try {
      setSubmitting(true);
      await createCircuitRequest({
        requested_by_user_id: requesterMode === 'staff' ? staffId : undefined,
        requested_by_name: requesterMode === 'text' ? requesterName.trim() : undefined,
        requested_by_department: requesterDept.trim() || undefined,
        client_id: clientId, site_id: siteId, pop_id: popId, pop_name: popId ? popQuery : undefined,
        region: region || undefined, service_type: serviceType, capacity: capacity || undefined, vlan: vlan || undefined,
        purpose: purpose || undefined,
      });
      toast({ title: 'Circuit request logged' });
      queryClient.invalidateQueries({ queryKey: ['ip-unit', 'dashboard'] });
      reset();
      onCreated();
      onClose();
    } catch (e) {
      toast({ title: 'Could not log request', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Log a Circuit Request</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Requested By</label>
            <div className="mb-2 flex gap-1.5">
              <button type="button" onClick={() => setRequesterMode('staff')} className={`rounded-full px-3 py-1 text-xs font-semibold ${requesterMode === 'staff' ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'}`}>Pick staff member</button>
              <button type="button" onClick={() => setRequesterMode('text')} className={`rounded-full px-3 py-1 text-xs font-semibold ${requesterMode === 'text' ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'}`}>Enter name</button>
            </div>
            {requesterMode === 'staff' ? (
              <SearchPickerField
                label="" placeholder="Search staff…" query={staffQuery} selectedId={staffId}
                onQueryChange={(v) => { setStaffQuery(v); setStaffId(null); }}
                fetchResults={searchIpStaff}
                onSelect={(s: LookupRow) => { setStaffId(s.id); setStaffQuery(s.name || ''); }}
                renderItem={(s) => <>{s.name} <span className="text-xs text-[var(--text-muted)]">{s.position || ''}</span></>}
              />
            ) : (
              <Input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Requester's name" />
            )}
            <Input className="mt-2" value={requesterDept} onChange={(e) => setRequesterDept(e.target.value)} placeholder="Department (optional)" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SearchPickerField
              label="Client" placeholder="Search existing customer…" query={clientQuery} selectedId={clientId}
              onQueryChange={(v) => { setClientQuery(v); setClientId(null); }}
              fetchResults={searchIpClients}
              onSelect={(c: LookupRow) => { setClientId(c.id); setClientQuery(c.name || ''); }}
              renderItem={(c) => <>{c.name} <span className="text-xs text-[var(--text-muted)]">{c.customer_code}</span></>}
            />
            <SearchPickerField
              label="Site" placeholder="Search sites…" query={siteQuery} selectedId={siteId}
              onQueryChange={(v) => { setSiteQuery(v); setSiteId(null); }}
              fetchResults={searchIpSites}
              onSelect={(s: LookupRow) => { setSiteId(s.id); setSiteQuery(s.site_name || ''); if (s.region) setRegion(s.region); if (s.customer_id && !clientId) setClientId(s.customer_id); }}
              renderItem={(s) => <>{s.site_name} <span className="text-xs text-[var(--text-muted)]">{s.region ? `— ${s.region}` : ''}</span></>}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Service Type</label>
              <Select value={serviceType} onValueChange={setServiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <SearchPickerField
              label="POP" placeholder="Search POPs…" query={popQuery} selectedId={popId}
              onQueryChange={(v) => { setPopQuery(v); setPopId(null); }}
              fetchResults={searchIpPops}
              onSelect={(p: LookupRow) => { setPopId(p.id); setPopQuery(p.location_name || ''); if (p.region) setRegion(p.region); }}
              renderItem={(p) => <>{p.location_name} <span className="text-xs text-[var(--text-muted)]">{p.region ? `— ${p.region}` : ''}</span></>}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Capacity</label>
              <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 100 Mbps" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">VLAN</label>
              <Input value={vlan} onChange={(e) => setVlan(e.target.value)} placeholder="e.g. 245" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Reason</label>
            <Textarea rows={3} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Why is this circuit needed?" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={submitting}>{submitting ? 'Logging…' : 'Log Request'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
