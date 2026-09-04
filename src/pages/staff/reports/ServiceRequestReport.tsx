import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, FileText, Layers, Search, TrendingUp } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

function statusClass(status: string) {
  if (status === 'completed' || status === 'noc_approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (status === 'integrated' || status === 'ongoing') return 'bg-blue-50 text-blue-700 ring-blue-200';
  return 'bg-amber-50 text-amber-700 ring-amber-200';
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
    ).map(([key, count]) => ({ key, name: STATUS_LABELS[key] || key, count }));

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

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-cyan-50/60 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[var(--shadow-md)]">
          <div className="bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-800 p-6 text-white">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-100">Report System</p>
            <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-bold">Service Request Report</h1>
                <p className="mt-2 max-w-3xl text-sm text-cyan-50">
                  The 360° Service Request Flow, mapped end to end — search any SR across Sales, Design,
                  Project, TX, IP, and NOC, then open its full lifecycle report.
                </p>
              </div>
              <Button onClick={() => void load()} variant="secondary" className="bg-white text-slate-900 hover:bg-cyan-50">
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Total', value: stats.total, icon: FileText, tone: 'text-slate-700 bg-slate-100' },
              { label: 'Active', value: stats.active, icon: Clock, tone: 'text-blue-700 bg-blue-100' },
              { label: 'Completed', value: stats.completed, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-100' },
              { label: 'Rejected', value: stats.rejected, icon: AlertCircle, tone: 'text-rose-700 bg-rose-100' },
              { label: 'MRC + NRC', value: money(stats.revenue), icon: TrendingUp, tone: 'text-indigo-700 bg-indigo-100' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2 ${item.tone}`}>
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-5 border-b border-slate-100 p-5 lg:grid-cols-3">
            <ChartCard title="Status Distribution" subtitle="Open, completed, and rejected work">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={chartData.byStatus}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={3}
                  >
                    {chartData.byStatus.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || '#64748b'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 flex flex-wrap gap-2">
                {chartData.byStatus.map((entry) => (
                  <span key={entry.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {entry.name}: {entry.count}
                  </span>
                ))}
              </div>
            </ChartCard>

            <ChartCard title="Requests By Stage" subtitle="Volume across every stage of the flow">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData.byUnit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="unit" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="requests" radius={[8, 8, 0, 0]} fill="#0891b2" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Request Flow" subtitle="Created vs completed trend">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData.flow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="#2563eb" strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="completed" stroke="#059669" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="grid gap-3 border-b border-slate-100 p-5 lg:grid-cols-[1fr_180px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search customer, site, region, circuit, requester..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {REPORT_UNITS.map((u) => (
                  <SelectItem key={u.slug} value={u.slug}>{u.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearch(''); setStatus('all'); setUnit('all'); }}>
              Clear
            </Button>
          </div>

          {error ? (
            <div className="p-8 text-center text-sm text-rose-600">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3">Customer / Site</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading service requests...</td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">No service requests match your filters.</td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr key={`${row.report_unit}-${row.id}`} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-slate-900">#{row.id}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{row.customer_name || '-'}</p>
                          <p className="text-xs text-slate-500">{row.site_name || row.location || '-'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700">
                            <Layers className="h-3 w-3" />
                            {row.report_unit_label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusClass(row.status)}`}>
                            {STATUS_LABELS[row.status] || row.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.service_type || row.bandwidth || '-'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {money(Number(row.mrc || 0) + Number(row.nrc || 0))}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(row.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link
                              to={`/project-request/${row.id}`}
                              className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                              Open
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
          )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-md)]">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
