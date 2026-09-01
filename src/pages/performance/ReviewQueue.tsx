import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Search, History, type LucideIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { listQueue, listHrAccessible, listMyActivity, type PerformanceReport, type RecentActivityItem } from '@/api/performanceReports';

const ACTION_LABEL: Record<string, string> = { forward: 'Scored & forwarded', send_back: 'Sent back for revision', finalize: 'Finalized', submit: 'Submitted', score: 'Scored' };

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'finalized') return 'success';
  if (status === 'needs_revision') return 'danger';
  if (status === 'draft') return 'info';
  return 'warning';
}
function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

/** Most recent score entered on this report, with its reviewer's note — so a reviewer can see
 *  what the prior stage said without opening the full report. */
function latestScoreNote(r: PerformanceReport): { label: string; score: number; note: string | null } | null {
  if (r.cto_score != null) return { label: 'CTO', score: r.cto_score, note: r.cto_comments };
  if (r.manager_score != null) return { label: 'Manager', score: r.manager_score, note: r.manager_comments };
  if (r.supervisor_score != null) return { label: 'Supervisor', score: r.supervisor_score, note: r.supervisor_comments };
  return null;
}

export function ReviewQueue({
  title, subtitle, icon: Icon, source, emptyLabel,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  source: 'queue' | 'hr';
  emptyLabel: string;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PerformanceReport[]>([]);
  const [recent, setRecent] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      if (source === 'hr') {
        setRows(await listHrAccessible());
      } else {
        const [queue, activity] = await Promise.all([listQueue(), listMyActivity().catch(() => [])]);
        setRows(queue);
        setRecent(activity);
      }
    } catch (e) { toast({ title: 'Could not load reports', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [source]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q) || r.employee_name.toLowerCase().includes(q) || (r.unit || '').toLowerCase().includes(q));
  }, [rows, search]);

  const pending = rows.filter((r) => !['finalized'].includes(r.status)).length;
  const needsRevision = rows.filter((r) => r.status === 'needs_revision').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance &amp; Reports</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Icon className="h-7 w-7" /> {title}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total" value={rows.length} icon={Icon} accentIndex={3} />
        <StatCard label="Awaiting Action" value={pending} icon={Inbox} accentIndex={2} />
        <StatCard label="Needs Revision" value={needsRevision} icon={Search} accentIndex={4} />
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input className="pl-9" placeholder="Search employee, title, unit…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : filtered.length === 0 ? (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-14 text-center">
            <Icon className="h-8 w-8 text-[var(--text-muted)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{rows.length === 0 ? "You're all caught up" : 'Nothing matches your search.'}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{rows.length === 0 ? emptyLabel : 'Try a different name, title, or unit.'}</p>
            </div>
          </div>

          {source === 'queue' && rows.length === 0 && recent.length > 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><History className="h-4 w-4" /> Recently Reviewed by You</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Your Action</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((r) => (
                      <TableRow key={r.report_id} className="cursor-pointer" onClick={() => navigate(`/performance-reports/report/${r.report_id}`)}>
                        <TableCell className="font-medium">{r.employee_name}</TableCell>
                        <TableCell>{r.title}</TableCell>
                        <TableCell>{(r.unit || '—').toUpperCase()}</TableCell>
                        <TableCell>{ACTION_LABEL[r.action] || r.action}{r.score != null ? ` · ${r.score}` : ''}</TableCell>
                        <TableCell className="text-[var(--text-muted)]">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell><StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Latest Score</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const latest = latestScoreNote(r);
                  const scoreLabel = r.final_score != null ? 'Final' : latest?.label;
                  const scoreValue = r.final_score != null ? r.final_score : latest?.score;
                  const noteText = r.final_score != null ? null : latest?.note;
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/performance-reports/report/${r.id}`)}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell>{r.title}</TableCell>
                      <TableCell>{(r.unit || '—').toUpperCase()}</TableCell>
                      <TableCell className="text-[var(--text-muted)]">{r.period?.name || `Period #${r.period_id}`}</TableCell>
                      <TableCell>
                        {scoreValue != null ? (
                          <div className="leading-tight">
                            <span className="font-semibold text-[var(--text-primary)]">{scoreValue}</span>
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{scoreLabel}</span>
                            {noteText && <p className="mt-0.5 max-w-xs truncate text-xs italic text-[var(--text-muted)]" title={noteText}>"{noteText}"</p>}
                          </div>
                        ) : '—'}
                      </TableCell>
                      <TableCell><StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamReportsPage() {
  return <ReviewQueue title="Team Reports" subtitle="Employee reports waiting on your review." icon={Inbox} source="queue" emptyLabel="No reports waiting on your review right now." />;
}
export function UnitReviewsPage() {
  return <ReviewQueue title="Unit Reviews" subtitle="Supervisor and staff reports from your unit awaiting your review." icon={Inbox} source="queue" emptyLabel="No reports waiting on your review right now." />;
}
export function ExecutiveReviewPage() {
  return <ReviewQueue title="Executive Review" subtitle="Reports awaiting your final review across every unit." icon={Inbox} source="queue" emptyLabel="No reports awaiting executive review right now." />;
}
export function HrAccessPage() {
  return <ReviewQueue title="HR Access" subtitle="Every report that has reached CTO review or been finalized, across all units." icon={Inbox} source="hr" emptyLabel="No reports have reached CTO review yet." />;
}
