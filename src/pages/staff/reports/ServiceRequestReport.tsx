import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Layers, RefreshCw, Search } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { listProjectRequests, listSalesRequests, listDesignRequests, type ProjectRequest } from '@/api/project';
import { ServiceRequestReportButton } from '@/components/production/ServiceRequestReportPanel';

/** The 360° Service Request Flow's real stages, keyed off current_stage (not "which endpoint
 *  returned the row") — accurate regardless of overlap between the sales/design/unit list APIs. */
const STAGE_UNITS: Record<string, { slug: string; label: string }> = {
  sales: { slug: 'sales', label: 'Sales' },
  design: { slug: 'design', label: 'Design' },
  project: { slug: 'project', label: 'Project' },
  ts: { slug: 'ts', label: 'TX' },
  ip: { slug: 'ip', label: 'IP' },
  noc: { slug: 'noc', label: 'NOC' },
  done: { slug: 'done', label: 'Active' },
  rejected: { slug: 'rejected', label: 'Rejected' },
};
const REPORT_UNITS = Object.values(STAGE_UNITS);

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  ongoing: 'Ongoing',
  integrated: 'Integrated',
  noc_approved: 'Ready for Sign-Off',
  submitted_to_sales: 'Submitted to Sales',
  completed: 'Completed',
  rejected: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  ongoing: '#2563eb',
  integrated: '#06b6d4',
  noc_approved: '#10b981',
  submitted_to_sales: '#8b5cf6',
  completed: '#059669',
  rejected: '#e11d48',
};

type ReportRow = ProjectRequest & {
  report_unit: string;
  report_unit_label: string;
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(value?: number | null) {
  const n = Number(value || 0);
  return `GHS ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-800',
    noc_approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    integrated: 'bg-blue-100 text-blue-800',
    ongoing: 'bg-blue-100 text-blue-800',
    pending: 'bg-amber-100 text-amber-800',
    submitted_to_sales: 'bg-purple-100 text-purple-800',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

export default function ServiceRequestReport() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [unit, setUnit] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Every SR-touching source, merged and de-duplicated by id — Project Unit's list already
      // sees system-wide, but ts/ip/noc/sales/design are queried too so nothing is missed for an
      // account scoped to just one unit. report_unit/report_unit_label come from the row's own
      // current_stage (not "which endpoint returned it"), so overlap never produces a wrong label.
      const results = await Promise.allSettled([
        listProjectRequests('project'),
        listProjectRequests('ts'),
        listProjectRequests('ip'),
        listProjectRequests('noc'),
        listSalesRequests(),
        listDesignRequests(),
      ]);

      const merged = new Map<number, ProjectRequest>();
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        for (const request of result.value) merged.set(request.id, request);
      }

      const next: ReportRow[] = Array.from(merged.values()).map((request) => {
        const stage = STAGE_UNITS[request.current_stage] || { slug: request.current_stage, label: request.current_stage };
        return { ...request, report_unit: stage.slug, report_unit_label: stage.label };
      });
      next.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service request report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = status === 'all' || row.status === status;
      const matchesUnit = unit === 'all' || row.report_unit === unit;
      const haystack = [
        row.customer_name,
        row.site_name,
        row.location,
        row.region,
        row.service_type,
        row.circuit_id,
        row.created_by_name,
        row.report_unit_label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchesStatus && matchesUnit && (!q || haystack.includes(q));
    });
  }, [rows, search, status, unit]);

  const stats = useMemo(() => {
    const completed = filteredRows.filter((row) => row.status === 'completed' || row.status === 'noc_approved').length;
    const active = filteredRows.filter((row) => ['pending', 'ongoing', 'integrated'].includes(row.status)).length;
    const rejected = filteredRows.filter((row) => row.status === 'rejected').length;
    const revenue = filteredRows.reduce((sum, row) => sum + Number(row.mrc || 0) + Number(row.nrc || 0), 0);
    return { total: filteredRows.length, active, completed, rejected, revenue };
  }, [filteredRows]);

  const chartData = useMemo(() => {
    const byStatus = Object.entries(
      filteredRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([key, count]) => ({ key, name: STATUS_LABELS[key] || key, value: count, color: STATUS_COLORS[key] }));

    const byUnit = REPORT_UNITS.map((u) => ({
      unit: u.label,
      requests: filteredRows.filter((row) => row.report_unit === u.slug).length,
      value: filteredRows
        .filter((row) => row.report_unit === u.slug)
        .reduce((sum, row) => sum + Number(row.mrc || 0) + Number(row.nrc || 0), 0),
    }));

    const flow = [...filteredRows]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .reduce<Record<string, { period: string; requests: number; completed: number }>>((acc, row) => {
        const d = new Date(row.created_at);
        const period = Number.isNaN(d.getTime())
          ? 'Unknown'
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        if (!acc[period]) acc[period] = { period, requests: 0, completed: 0 };
        acc[period].requests += 1;
        if (row.status === 'completed' || row.status === 'noc_approved') acc[period].completed += 1;
        return acc;
      }, {});

    return {
      byStatus,
      byUnit,
      flow: Object.values(flow).slice(-14),
    };
  }, [filteredRows]);

  const exportCsv = () => {
    const headers = ['ID', 'Customer', 'Site', 'Stage', 'Status', 'Service', 'Value', 'Created'];
    const lines = filteredRows.map((row) =>
      [
        row.id,
        `"${(row.customer_name || '').replace(/"/g, '""')}"`,
        `"${(row.site_name || row.location || '').replace(/"/g, '""')}"`,
        row.report_unit_label,
        row.status,
        `"${(row.service_type || row.bandwidth || '').replace(/"/g, '""')}"`,
        Number(row.mrc || 0) + Number(row.nrc || 0),
        row.created_at,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `service-request-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-cyan-50/30 p-4 sm:p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              to="/staff/reports"
              className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Report System
            </Link>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600">
              Report System · Service Delivery
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Service Request Report</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              The 360° Service Request Flow, mapped end to end — search any SR across Sales, Design,
              Project, TX, IP, and NOC, then open its full lifecycle report.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Stage</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All stages</option>
              {REPORT_UNITS.map((u) => (
                <option key={u.slug} value={u.slug}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatus('all'); setUnit('all'); }}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
          >
            Clear filters
          </button>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total requests" value={stats.total} accentIndex={0} />
          <StatCard label="Active" value={stats.active} accentIndex={3} />
          <StatCard label="Completed" value={stats.completed} accentIndex={1} />
          <StatCard label="Rejected" value={stats.rejected} accentIndex={4} />
          <StatCard label="MRC + NRC value" value={money(stats.revenue)} isText accentIndex={2} />
        </div>

        {!loading && (
          <div className="mb-8 grid gap-5 lg:grid-cols-3">
            <ChartCard title="Status distribution">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={chartData.byStatus} dataKey="value" nameKey="name" outerRadius={80} label>
                    {chartData.byStatus.map((entry) => (
                      <Cell key={entry.key} fill={entry.color || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Requests by stage">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.byUnit}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="unit" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="requests" radius={[4, 4, 0, 0]} fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {chartData.flow.length > 0 && (
              <ChartCard title="Request flow">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData.flow}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="requests" name="Created" stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#059669" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        )}

        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search customer, site, region, circuit, requester..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-md)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Request</th>
                <th className="px-3 py-3">Customer / Site</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Service</th>
                <th className="px-3 py-3 text-right">Value</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">Loading service requests…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">No service requests match your filters.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={`${row.report_unit}-${row.id}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-3 font-medium text-slate-900">#{row.id}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">{row.customer_name || '-'}</p>
                      <p className="text-xs text-slate-500">{row.site_name || row.location || '-'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700">
                        <Layers className="h-3 w-3" />
                        {row.report_unit_label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(row.status)}`}>
                        {STATUS_LABELS[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.service_type || row.bandwidth || '-'}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {money(Number(row.mrc || 0) + Number(row.nrc || 0))}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{formatDate(row.created_at)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/project-request/${row.id}`}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          View
                        </Link>
                        <ServiceRequestReportButton requestId={row.id} variant="ghost" size="sm" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  isText,
  accentIndex = 0,
}: {
  label: string;
  value: string | number;
  isText?: boolean;
  accentIndex?: number;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px]"
      style={{ borderLeftWidth: 3, borderLeftColor: ['var(--accent-green)', 'var(--accent-purple)', 'var(--accent-amber)', 'var(--accent-blue)', 'var(--accent-red)'][accentIndex % 5] }}
    >
      <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2.5 font-bold leading-none text-[var(--text-primary)] ${isText ? 'text-xl' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}
