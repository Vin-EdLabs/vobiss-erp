import { useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, Award } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Pie, PieChart, Cell, Legend } from 'recharts';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { PIE_COLORS, rechartsTooltipStyle } from '@/lib/chartDefaults';
import { listHrAccessible, type PerformanceReport } from '@/api/performanceReports';

function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function PerformanceAnalytics() {
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setReports(await listHrAccessible()); } finally { setLoading(false); }
    })();
  }, []);

  const finalized = useMemo(() => reports.filter((r) => r.final_score != null), [reports]);
  const avgFinal = finalized.length ? Math.round((finalized.reduce((s, r) => s + (r.final_score || 0), 0) / finalized.length) * 10) / 10 : null;
  const avgAttendance = useMemo(() => {
    const withAtt = reports.filter((r) => r.attendance_score != null);
    return withAtt.length ? Math.round((withAtt.reduce((s, r) => s + (r.attendance_score || 0), 0) / withAtt.length) * 10) / 10 : null;
  }, [reports]);

  const byUnit = useMemo(() => {
    const map = new Map<string, { unit: string; total: number; count: number }>();
    for (const r of finalized) {
      const unit = (r.unit || 'unassigned').toUpperCase();
      const entry = map.get(unit) || { unit, total: 0, count: 0 };
      entry.total += r.final_score || 0; entry.count += 1;
      map.set(unit, entry);
    }
    return [...map.values()].map((e) => ({ unit: e.unit, avgScore: Math.round((e.total / e.count) * 10) / 10 }));
  }, [finalized]);

  const byStatus = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports) map.set(r.status, (map.get(r.status) || 0) + 1);
    return [...map.entries()].map(([status, value]) => ({ name: statusLabel(status), value }));
  }, [reports]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance &amp; Reports</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><BarChart3 className="h-7 w-7" /> Analytics</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Trends across every report that has reached CTO review or finalization.</p>
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Reports Tracked" value={reports.length} icon={BarChart3} accentIndex={3} />
            <StatCard label="Finalized" value={finalized.length} icon={Award} accentIndex={0} />
            <StatCard label="Avg Final Score" value={avgFinal ?? '—'} icon={TrendingUp} accentIndex={1} />
            <StatCard label="Avg Attendance" value={avgAttendance != null ? `${avgAttendance}%` : '—'} icon={TrendingUp} accentIndex={2} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">Average Final Score by Unit</h2>
              {!byUnit.length ? (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">No finalized reports yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byUnit}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--chart-grid, #F3F4F6)" />
                    <XAxis dataKey="unit" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip contentStyle={rechartsTooltipStyle} />
                    <Bar dataKey="avgScore" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
              <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">Reports by Status</h2>
              {!byStatus.length ? (
                <p className="py-10 text-center text-sm text-[var(--text-muted)]">No reports yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {byStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={rechartsTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
