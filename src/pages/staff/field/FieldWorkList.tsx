import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wrench, Search, Plus, Ticket, Network, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { getSupervisorFieldWork, type FieldWorkListRow } from '@/api/fieldWork';
import { AssignEngineersForm } from '@/components/fieldwork/AssignEngineersForm';
import { FIELD_WORK_STATUS_LABELS, fieldWorkStatusTone, timeElapsedSince, sourcePath } from '@/components/fieldwork/shared';

type TabKey = 'all' | 'active' | 'completed' | 'pending_confirmation';

const ACTIVE_STATUSES = ['assigned', 'travelling', 'on_site', 'in_progress', 'waiting'];
const PENDING_CONFIRMATION_STATUSES = ['completed', 'noc_confirmed'];
const DONE_STATUSES = ['client_confirmed', 'closed'];

export default function FieldWorkList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const query = useQuery({ queryKey: ['field-work', 'supervisor'], queryFn: getSupervisorFieldWork, refetchInterval: 60000, retry: false });

  const all = query.data || [];
  const activeCount = all.filter((r) => ACTIVE_STATUSES.includes(r.status)).length;
  const pendingCount = all.filter((r) => PENDING_CONFIRMATION_STATUSES.includes(r.status)).length;
  const doneCount = all.filter((r) => DONE_STATUSES.includes(r.status)).length;

  const rows = useMemo(() => {
    let list = all;
    if (tab === 'active') list = list.filter((r) => ACTIVE_STATUSES.includes(r.status));
    else if (tab === 'completed') list = list.filter((r) => DONE_STATUSES.includes(r.status));
    else if (tab === 'pending_confirmation') list = list.filter((r) => PENDING_CONFIRMATION_STATUSES.includes(r.status));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        String(r.id).includes(q) || (r.site_name || '').toLowerCase().includes(q) || (r.client_name || '').toLowerCase().includes(q) || (r.title || '').toLowerCase().includes(q)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, tab, search]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Engineering</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Wrench className="h-7 w-7" /> Field Work</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Every field engineering job raised from a ticket or service request.</p>
        </div>
        <Button type="button" onClick={() => setAssignOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New Field Work</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={all.length} icon={Wrench} accentIndex={3} />
        <StatCard label="Active" value={activeCount} icon={Clock} accentIndex={1} />
        <StatCard label="Pending Confirmation" value={pendingCount} icon={Ticket} accentIndex={2} />
        <StatCard label="Completed" value={doneCount} icon={Network} accentIndex={0} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="pending_confirmation">Pending Confirmation</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input className="pl-9" placeholder="Search reference, site, client…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Wrench className="h-8 w-8 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">{all.length === 0 ? 'No field work has been assigned yet.' : 'No field work matches this view.'}</p>
            {all.length === 0 && (
              <Button type="button" variant="outline" onClick={() => setAssignOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Assign your first field work</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Engineers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time Elapsed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <FieldWorkRow key={r.id} row={r} onClick={() => navigate(`/staff/field/field-work/${r.id}`)} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AssignEngineersForm open={assignOpen} onClose={() => setAssignOpen(false)} onCreated={() => query.refetch()} />
    </div>
  );
}

function FieldWorkRow({ row, onClick }: { row: FieldWorkListRow; onClick: () => void }) {
  const navigate = useNavigate();
  const SourceIcon = row.source_type === 'ticket' ? Ticket : Network;
  return (
    <TableRow className="cursor-pointer hover:bg-[var(--surface-secondary)]" onClick={onClick}>
      <TableCell className="font-mono text-xs font-medium">FW-{String(row.id).padStart(3, '0')}</TableCell>
      <TableCell className="flex items-center gap-1.5">
        <SourceIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(sourcePath(row.source_type, row.source_id)); }}
          className="text-[var(--primary)] underline-offset-2 hover:underline"
        >
          {row.source_type === 'ticket' ? 'Ticket' : 'Service Request'} #{row.source_id}
        </button>
      </TableCell>
      <TableCell>{row.site_name || '—'}</TableCell>
      <TableCell>{row.client_name || '—'}</TableCell>
      <TableCell>{row.engineer_count}</TableCell>
      <TableCell><StatusPill tone={fieldWorkStatusTone(row.status)}>{FIELD_WORK_STATUS_LABELS[row.status]}</StatusPill></TableCell>
      <TableCell>{timeElapsedSince(row.created_at)}</TableCell>
    </TableRow>
  );
}
