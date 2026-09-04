import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { listSalesRequests, type ProjectRequest } from '@/api/project';
import { StatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { StatusPill } from '@/components/ui/status-pill';
import { EmptyState } from '@/components/ui/empty-state';
import { Building2, Clock, Loader2, CheckCircle2, CalendarRange, Inbox } from 'lucide-react';

const COMPLETED_STATUSES = new Set(['completed', 'noc_approved']);

function isThisMonth(dateStr?: string) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function PtelSalesDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listSalesRequests();
        if (!cancelled) setRequests(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load requests');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const open = requests.filter((r) => r.current_stage === 'design').length;
  const inProgress = requests.filter(
    (r) => r.current_stage !== 'design' && !COMPLETED_STATUSES.has(r.status) && r.status !== 'rejected'
  ).length;
  const completed = requests.filter((r) => COMPLETED_STATUSES.has(r.status)).length;
  const thisMonth = requests.filter((r) => isThisMonth(r.created_at)).length;

  const recent = [...requests]
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 10);

  const name = user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'there';

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <GreetingBanner
        name={name}
        pills={
          <>
            <OutlinePill icon={Building2}>PTEL Sales</OutlinePill>
            <OutlinePill icon={Inbox}>{requests.length} total requests</OutlinePill>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-[var(--card-radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] px-4 py-3 text-sm text-[var(--danger-text)]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Open Requests" value={loading ? '—' : open} hint="Awaiting design survey" icon={Inbox} accentIndex={3} />
        <StatCard label="In Progress" value={loading ? '—' : inProgress} hint="Moving through the pipeline" icon={Clock} accentIndex={2} />
        <StatCard label="Completed" value={loading ? '—' : completed} hint="Fully delivered" icon={CheckCircle2} accentIndex={0} />
        <StatCard label="Total This Month" value={loading ? '—' : thisMonth} hint="New requests submitted" icon={CalendarRange} accentIndex={1} />
      </div>

      <div className="vobiss-card mt-5 overflow-hidden rounded-[var(--card-radius)] border bg-[var(--surface)] sm:mt-6">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent Sales Requests</h2>
          <Link to="/project-request/sales" className="text-xs font-medium text-[var(--primary)] hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            title="No sales requests yet"
            description="New service requests submitted by PTEL Sales will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 sm:px-5">Customer / Site</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 sm:pr-5">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="font-medium text-[var(--text-primary)]">{r.customer_name || r.site_name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{r.site_name}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{r.location || r.region || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.current_stage === 'design' ? 'pending' : r.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] sm:pr-5">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
