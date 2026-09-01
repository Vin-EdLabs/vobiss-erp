import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Inbox, TrendingUp, Clock, ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill } from '@/components/ui/status-pill';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { listMyReports, listQueue, type PerformanceReport } from '@/api/performanceReports';

// Most real accounts carry their job title in `position` ("IP Supervisor", "Director") with
// role/main_role left generic ("admin"/"superadmin"/"user") — must match backend tierOfUser().
function tierOfUser(user: any): 'employee' | 'supervisor' | 'manager' | 'cto' {
  const role = String(user?.main_role || user?.role || '').toLowerCase();
  const position = String(user?.position || '').toLowerCase();
  if (['director', 'cto'].includes(role) || position === 'director' || position === 'cto') return 'cto';
  if (role.endsWith('_manager') || position.includes('manager')) return 'manager';
  if (role.endsWith('_supervisor') || position.includes('supervisor')) return 'supervisor';
  return 'employee';
}
function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'finalized') return 'success';
  if (status === 'needs_revision') return 'danger';
  if (status === 'draft') return 'info';
  return 'warning';
}
function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function PerformanceDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [myReports, setMyReports] = useState<PerformanceReport[]>([]);
  const [queue, setQueue] = useState<PerformanceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const tier = tierOfUser(user);
  const isReviewer = tier !== 'employee';

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [mine, q] = await Promise.all([listMyReports(), isReviewer ? listQueue() : Promise.resolve([])]);
        setMyReports(mine); setQueue(q);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finalizedScores = useMemo(() => myReports.filter((r) => r.final_score != null).map((r) => r.final_score as number), [myReports]);
  const avgScore = finalizedScores.length ? Math.round((finalizedScores.reduce((a, b) => a + b, 0) / finalizedScores.length) * 10) / 10 : null;
  const latestAttendance = useMemo(() => myReports.find((r) => r.attendance_score != null)?.attendance_score ?? null, [myReports]);
  const pendingMine = myReports.filter((r) => ['draft', 'needs_revision'].includes(r.status)).length;
  const recent = [...myReports].slice(0, 5);

  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <GreetingBanner
        name={firstName}
        pills={
          <>
            <OutlinePill icon={FileText}>{myReports.length} report{myReports.length === 1 ? '' : 's'} of mine</OutlinePill>
            {isReviewer && <OutlinePill icon={Inbox}>{queue.length} awaiting my review</OutlinePill>}
            {pendingMine > 0 && <OutlinePill icon={Clock}>{pendingMine} need my action</OutlinePill>}
          </>
        }
        actions={<Button type="button" onClick={() => navigate('/performance-reports/my-reports')}><Plus className="mr-1.5 h-4 w-4" /> New Report</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="My Reports" value={myReports.length} icon={FileText} accentIndex={3} />
        {isReviewer && <StatCard label="Awaiting My Review" value={queue.length} icon={Inbox} accentIndex={2} />}
        <StatCard label="Average Final Score" value={avgScore ?? '—'} icon={TrendingUp} accentIndex={0} />
        <StatCard label="Latest Attendance" value={latestAttendance != null ? `${latestAttendance}%` : '—'} icon={Clock} accentIndex={1} />
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Recent Submissions</h2>
            {!recent.length ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">No reports yet.</p>
            ) : (
              <div className="space-y-2">
                {recent.map((r) => (
                  <button key={r.id} type="button" onClick={() => navigate(`/performance-reports/report/${r.id}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-left text-sm hover:bg-[var(--surface-secondary)]">
                    <span className="truncate font-medium text-[var(--text-primary)]">{r.title}</span>
                    <StatusPill tone={statusTone(r.status)} className="shrink-0">{statusLabel(r.status)}</StatusPill>
                  </button>
                ))}
              </div>
            )}
          </div>

          {isReviewer && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--text-primary)]">Pending Your Review</h2>
                <button type="button" onClick={() => navigate('/performance-reports/queue')} className="flex items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline">
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              {!queue.length ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">Nothing waiting on you right now.</p>
              ) : (
                <div className="space-y-2">
                  {queue.slice(0, 5).map((r) => (
                    <button key={r.id} type="button" onClick={() => navigate(`/performance-reports/report/${r.id}`)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-left text-sm hover:bg-[var(--surface-secondary)]">
                      <span className="truncate font-medium text-[var(--text-primary)]">{r.employee_name} — {r.title}</span>
                      <StatusPill tone={statusTone(r.status)} className="shrink-0">{statusLabel(r.status)}</StatusPill>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
