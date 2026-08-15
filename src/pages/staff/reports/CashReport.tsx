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
  ChevronDown,
  ChevronRight,
  DollarSign,
  RefreshCw,
  Search,
  AlertCircle,
  Download,
} from 'lucide-react';
import { cxApi } from '@/api';

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type CashRow = {
  id: number;
  created_by: string;
  purpose?: string | null;
  department?: string | null;
  project_name?: string | null;
  reason?: string | null;
  special_instructions?: string | null;
  status: string;
  total_amount: number;
  created_at: string;
  received_at?: string | null;
  line_items: LineItem[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GHS' }).format(n || 0);
}

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    supervisor_approved: 'bg-purple-100 text-purple-800',
    finance_approved: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return map[status] || 'bg-slate-100 text-slate-700';
}

export default function CashReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    total_requests: number;
    total_amount: number;
    completed_count: number;
    pending_count: number;
  } | null>(null);
  const [charts, setCharts] = useState<{
    by_status: { name: string; value: number; color?: string }[];
    amount_by_status: { name: string; value: number; color?: string }[];
    volume_by_month: { month: string; count: number; amount: number }[];
  } | null>(null);
  const [requests, setRequests] = useState<CashRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cxApi.getCashReport({
        date_from: dateFrom || undefined,
        date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
        status: statusFilter || undefined,
      });
      setSummary(res.summary);
      setCharts(res.charts || null);
      setRequests(
        (res.requests || []).map((r: Record<string, unknown>) => ({
          ...r,
          total_amount: Number(r.total_amount) || 0,
          line_items: Array.isArray(r.line_items) ? r.line_items : [],
        })) as CashRow[]
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cash report');
      setRequests([]);
      setSummary(null);
      setCharts(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        String(r.id).includes(q) ||
        r.created_by?.toLowerCase().includes(q) ||
        r.purpose?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q) ||
        r.project_name?.toLowerCase().includes(q) ||
        r.line_items?.some((li) => li.description?.toLowerCase().includes(q))
    );
  }, [requests, search]);

  const exportCsv = () => {
    const headers = [
      'ID',
      'Requester',
      'Status',
      'Total',
      'Purpose',
      'Department',
      'Created',
      'Line items',
    ];
    const lines = filtered.map((r) =>
      [
        r.id,
        `"${(r.created_by || '').replace(/"/g, '""')}"`,
        r.status,
        r.total_amount,
        `"${(r.purpose || '').replace(/"/g, '""')}"`,
        `"${(r.department || '').replace(/"/g, '""')}"`,
        r.created_at,
        `"${(r.line_items || [])
          .map((li) => `${li.description} (${li.quantity}x${li.unit_price})`)
          .join('; ')
          .replace(/"/g, '""')}"`,
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-4 sm:p-6">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">
              Report System · Finance
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Cash Report</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              All cash advance requests with totals, descriptions, and expense line items.
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
              <p className="font-medium">Could not load cash report</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
            <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="supervisor_approved">Supervisor approved</option>
              <option value="finance_approved">Finance approved</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Apply filters
          </button>
        </div>

        {summary && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total requests" value={summary.total_requests} accentIndex={0} />
            <StatCard label="Total amount" value={formatMoney(summary.total_amount)} isText accentIndex={1} />
            <StatCard label="Completed" value={summary.completed_count} accentIndex={2} />
            <StatCard label="In progress" value={summary.pending_count} accentIndex={3} />
          </div>
        )}

        {charts && !loading && (
          <div className="mb-8 grid gap-5 lg:grid-cols-3">
            <ChartCard title="Requests by status">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={charts.by_status} dataKey="value" nameKey="name" outerRadius={80} label>
                    {charts.by_status.map((e) => (
                      <Cell key={e.name} fill={e.color || '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Amount by status">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.amount_by_status}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {charts.amount_by_status.map((e) => (
                      <Cell key={e.name} fill={e.color || '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            {charts.volume_by_month.length > 0 && (
              <ChartCard title="Cash volume by month">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={charts.volume_by_month}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" />
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
            placeholder="Search requester, purpose, description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm"
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3">Request</th>
                <th className="px-3 py-3">Requester</th>
                <th className="px-3 py-3">Purpose</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Total</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    Loading cash report…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    No cash requests found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const open = expanded.has(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((prev) => {
                                const n = new Set(prev);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                return n;
                              })
                            }
                            className="rounded p-1 text-slate-400 hover:bg-slate-100"
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-900">#{r.id}</td>
                        <td className="px-3 py-3">{r.created_by}</td>
                        <td className="max-w-[200px] truncate px-3 py-3 text-slate-700">
                          {r.purpose || r.reason || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadge(r.status)}`}
                          >
                            {r.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">
                          {formatMoney(r.total_amount)}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">{formatDt(r.created_at)}</td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            to={`/cash-details/${r.id}`}
                            state={{
                              returnTo: '/staff/reports/cash',
                              returnLabel: 'Back to Cash Report',
                            }}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-amber-50/40">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="text-sm text-slate-700 space-y-2">
                                {r.department && (
                                  <p>
                                    <span className="font-medium">Department:</span> {r.department}
                                  </p>
                                )}
                                {r.project_name && (
                                  <p>
                                    <span className="font-medium">Project:</span> {r.project_name}
                                  </p>
                                )}
                                {r.special_instructions && (
                                  <p>
                                    <span className="font-medium">Instructions:</span>{' '}
                                    {r.special_instructions}
                                  </p>
                                )}
                                {r.received_at && (
                                  <p>
                                    <span className="font-medium">Received:</span>{' '}
                                    {formatDt(r.received_at)}
                                  </p>
                                )}
                              </div>
                              <div>
                                <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                                  Expense line items
                                </h4>
                                {(r.line_items || []).length === 0 ? (
                                  <p className="text-sm text-slate-500">No line items recorded.</p>
                                ) : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-left text-slate-500">
                                        <th className="py-1">Description</th>
                                        <th className="py-1">Qty</th>
                                        <th className="py-1">Unit</th>
                                        <th className="py-1 text-right">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.line_items.map((li, i) => (
                                        <tr key={i} className="border-t border-slate-100">
                                          <td className="py-2 pr-2">{li.description}</td>
                                          <td className="py-2">{li.quantity}</td>
                                          <td className="py-2">{formatMoney(Number(li.unit_price))}</td>
                                          <td className="py-2 text-right font-medium">
                                            {formatMoney(
                                              Number(li.line_total) ||
                                                Number(li.quantity) * Number(li.unit_price)
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}
