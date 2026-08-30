import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, AlertTriangle, TimerReset, RefreshCw } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill } from '@/components/ui/status-pill';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
import {
  getOverview,
  getLive,
  getSlaBreaches,
  getUnitPerformance,
  getStaffLeaderboard,
  type SlaStatus,
  type LiveSegment,
} from '@/api/timeEngine';

const KNOWN_UNITS = ['noc', 'ip', 'ts', 'project', 'design', 'sales', 'finance', 'procurement', 'cx'];

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}

function formatWorkflowType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SLA_TONE: Record<SlaStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  on_track: 'success',
  warning: 'warning',
  breached: 'danger',
  no_config: 'info',
};

const SLA_LABEL: Record<SlaStatus, string> = {
  on_track: 'On Track',
  warning: 'Warning',
  breached: 'Breached',
  no_config: 'No Config',
};

export default function WorkflowPerformance() {
  const [selectedRecord, setSelectedRecord] = useState<LiveSegment | null>(null);
  const [unitSlug, setUnitSlug] = useState(KNOWN_UNITS[0]);

  const overviewQuery = useQuery({ queryKey: ['time-engine', 'overview'], queryFn: () => getOverview(), refetchInterval: 60000 });
  const liveQuery = useQuery({ queryKey: ['time-engine', 'live'], queryFn: getLive, refetchInterval: 60000 });
  const breachesQuery = useQuery({ queryKey: ['time-engine', 'sla-breaches'], queryFn: () => getSlaBreaches(), refetchInterval: 60000 });
  const unitQuery = useQuery({ queryKey: ['time-engine', 'unit', unitSlug], queryFn: () => getUnitPerformance(unitSlug), refetchInterval: 60000 });
  const staffQuery = useQuery({ queryKey: ['time-engine', 'staff-leaderboard'], queryFn: () => getStaffLeaderboard(), refetchInterval: 60000 });

  const liveRows = useMemo(() => liveQuery.data || [], [liveQuery.data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">System Performance</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
          <Activity className="h-7 w-7" /> Workflow Performance
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Turnaround time and SLA compliance across every workflow.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active Requests" value={overviewQuery.data?.totalActive ?? '—'} icon={Activity} accentIndex={0} />
        <StatCard label="Avg Turnaround Today" value={formatMinutes(overviewQuery.data?.averageTurnaroundMinutesToday ?? null)} icon={Clock} accentIndex={3} />
        <StatCard label="SLA Breaches" value={overviewQuery.data?.slaBreachesActive ?? '—'} icon={AlertTriangle} accentIndex={4} />
        <StatCard label="Overdue" value={overviewQuery.data?.overdueCount ?? '—'} icon={TimerReset} accentIndex={2} />
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Live Active Requests</h2>
          <button type="button" onClick={() => liveQuery.refetch()} className="flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--primary)]">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        {liveQuery.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : liveRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No requests are currently active.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Current Stage</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Time in Stage</TableHead>
                  <TableHead>SLA Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveRows.map((row) => (
                  <TableRow key={row.segmentId} className="cursor-pointer hover:bg-[var(--surface-secondary)]" onClick={() => setSelectedRecord(row)}>
                    <TableCell className="font-medium">{formatWorkflowType(row.workflowType)}</TableCell>
                    <TableCell className="font-mono text-xs">#{row.recordId}</TableCell>
                    <TableCell>{row.stageName ? formatWorkflowType(row.stageName) : '—'}</TableCell>
                    <TableCell>{row.unitSlug || '—'}</TableCell>
                    <TableCell>{row.userFullName || '—'}</TableCell>
                    <TableCell>{formatMinutes(row.elapsedMinutes)}</TableCell>
                    <TableCell>
                      <StatusPill tone={SLA_TONE[row.slaStatus]}>{SLA_LABEL[row.slaStatus]}</StatusPill>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Unit Performance</h2>
            <Select value={unitSlug} onValueChange={setUnitSlug}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KNOWN_UNITS.map((u) => <SelectItem key={u} value={u}>{formatWorkflowType(u)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {unitQuery.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : !unitQuery.data?.stages.length ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">No completed work recorded for this unit yet.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-secondary)]">
                SLA compliance: <span className="font-semibold text-[var(--text-primary)]">{unitQuery.data.slaComplianceRate ?? '—'}%</span>
              </p>
              {unitQuery.data.stages.map((s) => (
                <div key={`${s.workflowType}-${s.stageName}`} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                  <span className="text-[var(--text-primary)]">{formatWorkflowType(s.workflowType)} · {formatWorkflowType(s.stageName)}</span>
                  <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                    {s.count} · avg {formatMinutes(s.avgMinutes)}
                    <StatusPill tone={SLA_TONE[s.slaStatus]}>{SLA_LABEL[s.slaStatus]}</StatusPill>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">SLA Breaches</h2>
          {breachesQuery.isLoading ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : !breachesQuery.data?.length ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">No SLA breaches recorded.</p>
          ) : (
            <div className="space-y-2">
              {breachesQuery.data.slice(0, 8).map((b, i) => (
                <div key={i} className="rounded-lg border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] px-3 py-2 text-sm">
                  <p className="font-semibold text-[var(--danger-text)]">{formatWorkflowType(b.workflowType)} #{b.recordId} — {formatWorkflowType(b.stageName || '')}</p>
                  <p className="text-xs text-[var(--danger-text)]">
                    {formatMinutes(b.actualMinutes)} actual vs {formatMinutes(b.expectedMinutes)} expected
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Staff Performance</h2>
        {staffQuery.isLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : !staffQuery.data?.length ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">No completed work recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Handled</TableHead>
                  <TableHead>Avg Time</TableHead>
                  <TableHead>Fastest</TableHead>
                  <TableHead>Slowest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffQuery.data.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.fullName}</TableCell>
                    <TableCell>{row.unitSlug || '—'}</TableCell>
                    <TableCell>{row.count}</TableCell>
                    <TableCell>{formatMinutes(row.avgMinutes)}</TableCell>
                    <TableCell>{formatMinutes(row.fastestMinutes)}</TableCell>
                    <TableCell>{formatMinutes(row.slowestMinutes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedRecord && `${formatWorkflowType(selectedRecord.workflowType)} #${selectedRecord.recordId}`}</DialogTitle>
          </DialogHeader>
          {selectedRecord && <WorkflowTimeline workflowType={selectedRecord.workflowType} recordId={selectedRecord.recordId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
