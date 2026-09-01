import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Network, Search, Plus, Cable, CheckCircle2, Ban } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { listCircuits, type IpCircuitListRow, type CircuitStatus } from '@/api/ipUnit';
import { CIRCUIT_STATUS_LABELS, circuitStatusTone } from '@/components/ipUnit/shared';

type FilterKey = 'all' | CircuitStatus;

export default function CircuitInventory() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const query = useQuery({ queryKey: ['ip-unit', 'circuits'], queryFn: () => listCircuits(), refetchInterval: 60000, retry: false });

  const all = query.data?.circuits || [];
  const activeCount = all.filter((r) => r.status === 'active').length;
  const availableCount = all.filter((r) => r.status === 'available').length;
  const decommissionedCount = all.filter((r) => r.status === 'decommissioned').length;

  const rows = useMemo(() => {
    let list = all;
    if (filter !== 'all') list = list.filter((r) => r.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.circuit_id.toLowerCase().includes(q) ||
        (r.client_name || '').toLowerCase().includes(q) ||
        (r.site_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [all, filter, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">IP Unit</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Cable className="h-7 w-7" /> Circuit Inventory</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">The source of truth for every circuit ID allocated across the network.</p>
        </div>
        <Button type="button" onClick={() => navigate('/ip-unit/circuits/new')}><Plus className="mr-1.5 h-4 w-4" /> Add Circuit</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Circuits" value={all.length} icon={Network} accentIndex={3} />
        <StatCard label="Active" value={activeCount} icon={CheckCircle2} accentIndex={0} />
        <StatCard label="Available IDs" value={availableCount} icon={Cable} accentIndex={1} />
        <StatCard label="Decommissioned" value={decommissionedCount} icon={Ban} accentIndex={4} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'active', 'available', 'inactive', 'decommissioned'] as FilterKey[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === f ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
            >
              {f === 'all' ? 'All' : CIRCUIT_STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input className="pl-9" placeholder="Circuit ID, Client, Site…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        <p className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">{activeCount.toLocaleString()} Active</p>
        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Cable className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">{all.length === 0 ? 'No circuits in the inventory yet.' : 'No circuits match this view.'}</p>
            {all.length === 0 && (
              <Button type="button" variant="outline" onClick={() => navigate('/ip-unit/circuits/new')}><Plus className="mr-1.5 h-4 w-4" /> Add your first circuit</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Circuit</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => <CircuitRow key={r.id} row={r} onClick={() => navigate(`/ip-unit/circuits/${r.id}`)} />)}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function CircuitRow({ row, onClick }: { row: IpCircuitListRow; onClick: () => void }) {
  return (
    <TableRow className="cursor-pointer hover:bg-[var(--surface-secondary)]" onClick={onClick}>
      <TableCell className="font-mono text-xs font-semibold">{row.circuit_id}</TableCell>
      <TableCell>{row.client_name || '—'}</TableCell>
      <TableCell>{row.site_name || '—'}</TableCell>
      <TableCell>{row.service_type}</TableCell>
      <TableCell><StatusPill tone={circuitStatusTone(row.status)}>{CIRCUIT_STATUS_LABELS[row.status]}</StatusPill></TableCell>
    </TableRow>
  );
}
