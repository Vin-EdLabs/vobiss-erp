import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Cable, CheckCircle2, Clock3, Network, Plus, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { getIpUnitDashboard } from '@/api/ipUnit';

export default function IpUnitDashboard() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['ip-unit', 'dashboard'], queryFn: getIpUnitDashboard, refetchInterval: 60000, retry: false });
  const stats = query.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">IP Unit</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Network className="h-7 w-7" /> Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Circuit inventory at a glance.</p>
        </div>
        <Button type="button" onClick={() => navigate('/ip-unit/circuits/new')}><Plus className="mr-1.5 h-4 w-4" /> Add Circuit</Button>
      </div>

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Active Circuits" value={stats?.activeCircuits ?? 0} icon={CheckCircle2} accentIndex={0} />
          <StatCard label="Pending Circuit Requests" value={stats?.pendingRequests ?? 0} icon={Clock3} accentIndex={2} />
          <StatCard label="Circuits Added Today" value={stats?.addedToday ?? 0} icon={Cable} accentIndex={3} />
          <StatCard label="Available IDs" value={stats?.availableIds ?? 0} icon={Network} accentIndex={1} />
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Activity className="h-4 w-4" /> Recent IP Activities</h2>
        {query.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : !stats?.recentActivity?.length ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">No activity yet.</p>
        ) : (
          <div className="space-y-1">
            {stats.recentActivity.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 text-sm last:border-0">
                <p className="text-[var(--text-primary)]">{a.description}</p>
                <p className="shrink-0 text-xs text-[var(--text-muted)]">{new Date(a.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
