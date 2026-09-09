import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  AlertCircle,
  Download,
  Truck,
  Fuel,
  FileText,
} from 'lucide-react';
import { cxApi } from '@/api';

type TransportRow = {
  id: number;
  type: 'transport_request' | 'fuel_request' | 'vehicle_rental';
  ref: string;
  requester: string | null;
  context: string | null;
  amount: number | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  href: string;
};

const TYPE_META: Record<TransportRow['type'], { label: string; icon: React.ElementType; chip: string }> = {
  transport_request: { label: 'Transport Request', icon: Truck, chip: 'bg-indigo-100 text-indigo-800' },
  fuel_request: { label: 'Fuel Request', icon: Fuel, chip: 'bg-amber-100 text-amber-800' },
  vehicle_rental: { label: 'Vehicle Rental', icon: FileText, chip: 'bg-green-100 text-green-800' },
};

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GHS' }).format(n || 0);
}

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status: string) {
  const st = status.toLowerCase();
  if (['completed', 'approved', 'cash_issued'].includes(st)) return 'bg-green-100 text-green-800';
  if (st === 'rejected') return 'bg-red-100 text-red-800';
  if (st === 'pending') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

export default function TransportReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    total_requests: number;
    total_amount: number;
    completed_count: number;
    pending_count: number;
    by_type: Record<string, number>;
  } | null>(null);
  const [charts, setCharts] = useState<{
    by_status: { name: string; value: number; color?: string }[];
    by_type: { name: string; value: number; color?: string }[];
    volume_by_month: { month: string; count: number; amount: number }[];
  } | null>(null);
  const [rows, setRows] = useState<TransportRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cxApi.getTransportReport({
        date_from: dateFrom || undefined,
        date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
        status: statusFilter || undefined,
        type: (typeFilter || undefined) as TransportRow['type'] | undefined,
      });
      setSummary(res.summary);
      setCharts(res.charts || null);
      setRows((res.requests || []) as TransportRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load transport report');
      setRows([]);
      setSummary(null);
      setCharts(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, statusFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.ref.toLowerCase().includes(q) ||
        r.requester?.toLowerCase().includes(q) ||
        r.context?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const exportCsv = () => {
    const headers = ['Type', 'Ref', 'Requester', 'Context', 'Status', 'Amount', 'Created'];
    const lines = filtered.map((r) =>
      [
        TYPE_META[r.type].label,
        r.ref,
        `"${(r.requester || '').replace(/"/g, '""')}"`,
        `"${(r.context || '').replace(/"/g, '""')}"`,
        r.status,
        r.amount ?? '',
        r.created_at,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transport-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4 sm:p-6">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              Report System · Transport
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Transport Report</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Transport Requests, Fuel Requests, and Vehicle Rental Requests — requested and completed — in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
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
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Could not load transport report</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-md)]">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              <option value="transport_request">Transport Requests</option>
              <option value="fuel_request">Fuel Requests</option>
              <option value="vehicle_rental">Vehicle Rental</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <input
              type="text"
              placeholder="e.g. pending, completed"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply filters
          </button>
        </div>

        {summary && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total requests" value={summary.total_requests} accentIndex={0} />
            <StatCard label="Fuel + rental spend" value={formatMoney(summary.total_amount)} isText accentIndex={1} />
            <StatCard label="Completed" value={summary.completed_count} accentIndex={2} />
            <StatCard label="In progress" value={summary.pending_count} accentIndex={3} />
          </div>
        )}

        {charts && !loading && (
          <div className="mb-8 grid gap-5 lg:grid-cols-3">
            <ChartCard title="Requests by type">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.by_type} dataKey="value" nameKey="name" outerRadius={80} label>
                    {charts.by_type.map((e) => (
                      <Cell key={e.name} fill={e.color || '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Requests by status">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.by_status}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {charts.by_status.map((e) => (
                      <Cell key={e.name} fill={e.color || '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            {charts.volume_by_month.length > 0 && (
              <ChartCard title="Volume by month">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.volume_by_month}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="count" name="Requests" stroke="#6366f1" />
                    <Line yAxisId="right" type="monotone" dataKey="amount" name="Amount" stroke="#f59e0b" />
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
            placeholder="Search ref, requester, site/plate/purpose…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-md)]">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Ref</th>
                <th className="px-3 py-3">Requester</th>
                <th className="px-3 py-3">Context</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Amount</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    Loading transport report…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    No transport activity found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const meta = TYPE_META[r.type];
                  const Icon = meta.icon;
                  return (
                    <tr key={`${r.type}-${r.id}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.chip}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">{r.ref}</td>
                      <td className="px-3 py-3">{r.requester || '—'}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-slate-700">{r.context || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(r.status)}`}>
                          {r.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {r.amount != null ? formatMoney(r.amount) : '—'}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">{formatDt(r.created_at)}</td>
                      <td className="px-3 py-3 text-right">
                        <Link to={r.href} className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
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
