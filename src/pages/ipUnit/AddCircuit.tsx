import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Cable } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SearchPickerField } from '@/components/ipUnit/SearchPickerField';
import {
  createCircuit, previewNextCircuitId, searchIpClients, searchIpSites, searchIpPops,
} from '@/api/ipUnit';
import type { LookupRow } from '@/api/ipUnit';
import { SERVICE_TYPES } from '@/lib/lookups';

export default function AddCircuit() {
  const navigate = useNavigate();
  const { toast } = useToast();

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
  const [notes, setNotes] = useState('');
  const [circuitId, setCircuitId] = useState('');
  const [circuitIdTouched, setCircuitIdTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Live Circuit ID Preview — recomputed whenever service type changes, but never overwrites
  // an ID the user has already started editing by hand (still fully editable per spec).
  useEffect(() => {
    previewNextCircuitId(serviceType)
      .then((r) => { if (!circuitIdTouched) setCircuitId(r.circuit_id); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceType]);

  const submit = async () => {
    if (!clientId) return toast({ title: 'Select a client', variant: 'destructive' });
    if (!siteId) return toast({ title: 'Select a site', variant: 'destructive' });
    if (!circuitId.trim()) return toast({ title: 'Circuit ID is required', variant: 'destructive' });
    try {
      setSubmitting(true);
      const circuit = await createCircuit({
        circuit_id: circuitId.trim(), client_id: clientId, site_id: siteId,
        pop_id: popId, pop_name: popId ? popQuery : undefined, region: region || undefined,
        service_type: serviceType, capacity: capacity || undefined, vlan: vlan || undefined, notes: notes || undefined,
      });
      toast({ title: `Circuit ${circuit.circuit_id} added` });
      navigate(`/ip-unit/circuits/${circuit.id}`);
    } catch (e) {
      toast({ title: 'Could not add circuit', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/ip-unit/circuits')} className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft className="h-4 w-4" /> Back to Inventory
      </button>

      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">IP Unit</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Cable className="h-7 w-7" /> Add Circuit</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Allocate a new circuit directly into the inventory.</p>
      </div>

      <div className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--accent-blue-light)] p-4">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--info-text)]">Circuit ID Preview</label>
          <Input
            className="font-mono text-lg font-bold"
            value={circuitId}
            onChange={(e) => { setCircuitId(e.target.value.toUpperCase()); setCircuitIdTouched(true); }}
            placeholder="VOB-DIA-000001"
          />
          <p className="mt-1 text-xs text-[var(--info-text)]">Auto-generated from Service Type — edit it if you need a specific ID.</p>
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
            onSelect={(s: LookupRow) => {
              setSiteId(s.id); setSiteQuery(s.site_name || '');
              if (s.region) setRegion(s.region);
              if (s.customer_id && !clientId) { setClientId(s.customer_id); }
            }}
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
          <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Notes (optional)</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything worth recording about this allocation" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate('/ip-unit/circuits')}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting}>{submitting ? 'Saving…' : 'Save Circuit'}</Button>
        </div>
      </div>
    </div>
  );
}
