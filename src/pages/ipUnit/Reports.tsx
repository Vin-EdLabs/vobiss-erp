import { useQuery } from '@tanstack/react-query';
import { BarChart3, Cable } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getIpUnitReportsSummary, type CircuitStatus } from '@/api/ipUnit';
import { CIRCUIT_STATUS_LABELS } from '@/components/ipUnit/shared';

export default function IpUnitReports() {
  const query = useQuery({ queryKey: ['ip-unit', 'reports'], queryFn: () => getIpUnitReportsSummary(), retry: false });
  const data = query.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">IP Unit</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><BarChart3 className="h-7 w-7" /> Reports</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Circuit inventory breakdown{data ? ` — ${data.total.toLocaleString()} circuits total` : ''}.</p>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Cable className="h-4 w-4" /> By Status</h2>
            {!data?.byStatus.length ? <EmptyRow /> : (
              <BarList rows={data.byStatus.map((r) => ({ label: CIRCUIT_STATUS_LABELS[r.status as CircuitStatus] || r.status, total: Number(r.total) }))} />
            )}
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
            <h2 className="mb-4 text-sm font-bold text-[var(--text-primary)]">By Service Type</h2>
            {!data?.byServiceType.length ? <EmptyRow /> : (
              <BarList rows={data.byServiceType.map((r) => ({ label: r.service_type, total: Number(r.total) }))} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyRow() {
  return <p className="py-6 text-center text-sm text-[var(--text-muted)]">No data yet.</p>;
}

function BarList({ rows }: { rows: { label: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs font-medium text-[var(--text-secondary)]">
            <span>{r.label}</span><span>{r.total}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
            <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${(r.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
