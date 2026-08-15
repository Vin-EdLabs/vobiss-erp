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
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  RefreshCw,
  Search,
  Ticket,
  Users,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { cxApi } from '@/api';

type Worker = {
  name: string;
  role?: string;
  actions: number;
  firstAt?: string;
  lastAt?: string;
};

type TicketRow = {
  ticket_id: string;
  title: string;
  category?: string;
  priority: string;
  status: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  project_name: string;
  customer_name: string;
  assignee_name?: string;
  assignee_role?: string;
  creator_name?: string;
  escalation_stage?: string;
  workers: Worker[];
  resolution_formatted?: string | null;
  open_age_formatted?: string | null;
  is_completed: boolean;
  report_bucket?: string;
  last_action?: string;
  last_activity_message?: string;
  last_activity_at?: string;
};

type Charts = {
  pending_vs_completed: { name: string; value: number; color?: string }[];
  by_status: { name: string; value: number; color?: string }[];
  by_priority: { name: string; value: number }[];
  volume_by_month: { month: string; created: number; completed: number }[];
  top_workers: { name: string; actions: number }[];
};

type Bucket = 'all' | 'pending' | 'completed';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  URGENT: '#f97316',
  HIGH: '#f59e0b',
  MEDIUM: '#6366f1',
  NORMAL: '#64748b',
  LOW: '#94a3b8',
};

function normalizeWorkers(raw: unknown): Worker[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [];
  return list.map((w: Record<string, unknown>) => ({
    name: String(w.name || 'Unknown'),
    role: w.role ? String(w.role) : undefined,
    actions: Number(w.actions) || 0,
    firstAt: (w.firstAt || w.first_at) as string | undefined,
    lastAt: (w.lastAt || w.last_at) as string | undefined,
  }));
}

function normalizeTicket(t: Record<string, unknown>): TicketRow {
  const status = String(t.status || '');
  const isCompleted =
    Boolean(t.is_completed) ||
    ['RESOLVED', 'CLOSED'].includes(status.toUpperCase()) ||
    Boolean(t.closed_at);

  return {
    ticket_id: String(t.ticket_id),
    title: String(t.title || ''),
    category: t.category ? String(t.category) : undefined,
    priority: String(t.priority || 'NORMAL'),
    status,
    created_at: String(t.created_at),
    updated_at: String(t.updated_at),
    closed_at: t.closed_at as string | null,
    project_name: String(t.project_name || ''),
    customer_name: String(t.customer_name || ''),
    assignee_name: t.assignee_name ? String(t.assignee_name).trim() : undefined,
    assignee_role: t.assignee_role ? String(t.assignee_role) : undefined,
    creator_name: t.creator_name ? String(t.creator_name).trim() : undefined,
    escalation_stage: t.escalation_stage ? String(t.escalation_stage) : undefined,
    workers: normalizeWorkers(t.workers),
    resolution_formatted: t.resolution_formatted ? String(t.resolution_formatted) : null,
    open_age_formatted: t.open_age_formatted ? String(t.open_age_formatted) : null,
    is_completed: isCompleted,
    report_bucket: t.report_bucket ? String(t.report_bucket) : isCompleted ? 'completed' : 'pending',
    last_action: t.last_action ? String(t.last_action) : undefined,
    last_activity_message: t.last_activity_message ? String(t.last_activity_message) : undefined,
    last_activity_at: t.last_activity_at ? String(t.last_activity_at) : undefined,
  };
}

function statusClass(status: string) {
  switch (status?.toUpperCase()) {
    case 'OPEN':
      return 'bg-blue-100 text-blue-800';
    case 'IN_PROGRESS':
      return 'bg-purple-100 text-purple-800';
    case 'RESOLVED':
      return 'bg-green-100 text-green-800';
    case 'CLOSED':
      return 'bg-slate-200 text-slate-800';
    case 'REOPEN':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function priorityClass(priority: string) {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL':
      return 'text-red-700 font-semibold';
    case 'HIGH':
    case 'URGENT':
      return 'text-orange-700 font-medium';
    case 'MEDIUM':
      return 'text-amber-700';
    default:
      return 'text-slate-600';
  }
}

function formatDt(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatMonthLabel(month: string) {
  const [y, m] = month.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export default function TicketReport() {
  const [bucket, setBucket] = useState<Bucket>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    pending: number;
    completed: number;
    avg_resolution_formatted: string | null;
  } | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [allTickets, setAllTickets] = useState<TicketRow[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cxApi.getTicketReport({
        date_from: dateFrom || undefined,
        date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
      });
      const rows = (res.tickets || []).map((t) => normalizeTicket(t as Record<string, unknown>));
      setAllTickets(rows);
      setSummary(res.summary);
      setCharts(res.charts || buildChartsFromTickets(rows, res.summary));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load ticket report';
      setError(msg);
      setAllTickets([]);
      setSummary(null);
      setCharts(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const bucketTickets = useMemo(() => {
    if (bucket === 'completed') {
      return allTickets.filter((t) => t.is_completed || t.report_bucket === 'completed');
    }
    if (bucket === 'pending') {
      return allTickets.filter((t) => !t.is_completed && t.report_bucket !== 'completed');
    }
    return allTickets;
  }, [allTickets, bucket]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bucketTickets;
    return bucketTickets.filter((t) => {
      const workers = (t.workers || []).map((w) => w.name).join(' ');
      return (
        t.ticket_id.toLowerCase().includes(q) ||
        t.title?.toLowerCase().includes(q) ||
        t.customer_name?.toLowerCase().includes(q) ||
        t.assignee_name?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q) ||
        workers.toLowerCase().includes(q)
      );
    });
  }, [bucketTickets, search]);

  const displaySummary = useMemo(() => {
    if (bucket === 'all' && summary) return summary;
    const pending = bucketTickets.filter((t) => !t.is_completed).length;
    const completed = bucketTickets.filter((t) => t.is_completed).length;
    return {
      total: bucketTickets.length,
      pending,
      completed,
      avg_resolution_formatted: summary?.avg_resolution_formatted ?? null,
    };
  }, [bucket, summary, bucketTickets]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = [
      'Ticket ID',
      'Title',
      'Status',
      'Priority',
      'Customer',
      'Project',
      'Assignee',
      'Created',
      'Closed',
      'Resolution',
      'Workers',
    ];
    const lines = filtered.map((t) =>
      [
        t.ticket_id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        `"${(t.customer_name || '').replace(/"/g, '""')}"`,
        `"${(t.project_name || '').replace(/"/g, '""')}"`,
        t.assignee_name || '',
        t.created_at,
        t.closed_at || '',
        t.is_completed ? t.resolution_formatted || '' : t.open_age_formatted || '',
        (t.workers || []).map((w) => w.name).join('; '),
      ].join(',')
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 sm:p-6">
      <div className="mx-auto max-w-[1440px]">
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
              Report System · Support
            </p>
            <h1 className="text-3xl font-bold text-slate-900">Ticket Report</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Analytics and full ticket history — pending and completed — with staff activity and
              resolution times.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Could not load ticket report</p>
              <p className="mt-1 text-red-700">{error}</p>
              <p className="mt-2 text-xs text-red-600">
                Restart the backend server so the report API is available at{' '}
                <code className="text-xs">/api/reports/tickets</code>.
              </p>
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
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Apply dates
          </button>
        </div>

        {displaySummary && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total tickets" value={displaySummary.total} icon={Ticket} tone="indigo" accentIndex={0} />
            <StatCard label="Pending" value={displaySummary.pending} icon={Clock} tone="amber" accentIndex={1} />
            <StatCard
              label="Completed"
              value={displaySummary.completed}
              icon={CheckCircle2}
              tone="green"
              accentIndex={2}
            />
            <StatCard
              label="Avg. resolution"
              value={displaySummary.avg_resolution_formatted || '—'}
              icon={BarChart3}
              tone="slate"
              isText
              accentIndex={3}
            />
          </div>
        )}

        {charts && !loading && (
          <div className="mb-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Pending vs completed">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={charts.pending_vs_completed}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {charts.pending_vs_completed.map((entry, i) => (
                      <Cell key={entry.name} fill={entry.color || ['#f59e0b', '#22c55e'][i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tickets by status">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.by_status} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {charts.by_status.map((entry) => (
                      <Cell key={entry.name} fill={entry.color || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="By priority">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={charts.by_priority}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {charts.by_priority.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PRIORITY_COLORS[entry.name] || '#6366f1'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {charts.volume_by_month.length > 0 && (
              <ChartCard title="Volume by month" className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={charts.volume_by_month}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonthLabel}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={formatMonthLabel} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="created"
                      name="Created"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="completed"
                      name="Completed"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.top_workers.length > 0 && (
              <ChartCard title="Most active staff">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={charts.top_workers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="actions" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Actions" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(['all', 'pending', 'completed'] as Bucket[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBucket(b)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                  bucket === b
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {b}
                {b !== 'all' && summary && (
                  <span className="ml-1.5 opacity-80">
                    ({b === 'pending' ? summary.pending : summary.completed})
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search ticket, customer, assignee, worker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <p className="text-sm text-slate-500">
            Showing <strong>{filtered.length}</strong> ticket{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/90 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-3" />
                  <th className="px-3 py-3">Ticket</th>
                  <th className="px-3 py-3">Customer / Project</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Assignee</th>
                  <th className="px-3 py-3">Worked by</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Time</th>
                  <th className="px-3 py-3 text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-slate-500">
                      Loading ticket report…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-slate-500">
                      {error
                        ? 'Fix the error above and refresh.'
                        : bucket === 'completed'
                          ? 'No completed tickets in this date range. Completed includes Resolved, Closed, or any ticket with a close date.'
                          : 'No tickets match your filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => {
                    const isOpen = expanded.has(t.ticket_id);
                    const workerNames = (t.workers || [])
                      .slice(0, 3)
                      .map((w) => w.name)
                      .join(', ');
                    const extraWorkers =
                      (t.workers?.length || 0) > 3 ? ` +${(t.workers?.length || 0) - 3}` : '';

                    return (
                      <React.Fragment key={t.ticket_id}>
                        <tr className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggleExpand(t.ticket_id)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-900">{t.ticket_id}</div>
                            <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500">
                              {t.title}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            <div>{t.customer_name}</div>
                            <p className="text-xs text-slate-500">{t.project_name}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(t.status)}`}
                            >
                              {t.status}
                            </span>
                            {t.is_completed && (
                              <span className="ml-1 inline-block rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                                Done
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-3 ${priorityClass(t.priority)}`}>
                            {t.priority}
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {t.assignee_name || (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <Users className="h-3.5 w-3.5 text-indigo-500" />
                              {workerNames || '—'}
                              {extraWorkers}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                            {formatDt(t.created_at)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs">
                            {t.is_completed ? (
                              <span className="font-medium text-green-700">
                                {t.resolution_formatted || '—'}
                              </span>
                            ) : (
                              <span className="text-amber-700">
                                Open {t.open_age_formatted || '—'}
                              </span>
                            )}
                            {t.closed_at && (
                              <p className="text-slate-500">Closed {formatDt(t.closed_at)}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              to={`/staff/cx/tickets/${t.ticket_id}`}
                              state={{
                                returnTo: '/staff/reports/tickets',
                                returnLabel: 'Back to Ticket Report',
                              }}
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-slate-50 bg-slate-50/50">
                            <td colSpan={10} className="px-6 py-4">
                              <div className="grid gap-6 lg:grid-cols-2">
                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                                    Staff who worked on this ticket
                                  </h4>
                                  {(t.workers || []).length === 0 ? (
                                    <p className="text-sm text-slate-500">No timeline activity yet.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {t.workers.map((w, i) => (
                                        <li
                                          key={`${w.name}-${i}`}
                                          className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                                        >
                                          <span className="font-medium text-slate-900">
                                            {w.name}
                                            {w.role && (
                                              <span className="ml-2 text-xs font-normal text-slate-500">
                                                ({w.role})
                                              </span>
                                            )}
                                          </span>
                                          <span className="text-xs text-slate-500">
                                            {w.actions} action{w.actions !== 1 ? 's' : ''}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div className="space-y-2 text-sm text-slate-700">
                                  <p>
                                    <span className="text-xs font-semibold uppercase text-slate-500">
                                      Created by:{' '}
                                    </span>
                                    {t.creator_name || '—'}
                                  </p>
                                  <p>
                                    <span className="text-xs font-semibold uppercase text-slate-500">
                                      Last activity:{' '}
                                    </span>
                                    {t.last_action || '—'}
                                    {t.last_activity_at && ` · ${formatDt(t.last_activity_at)}`}
                                  </p>
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
    </div>
  );
}

function buildChartsFromTickets(
  tickets: TicketRow[],
  summary: { pending: number; completed: number; by_status?: Record<string, number>; by_priority?: Record<string, number> }
): Charts {
  const by_status = Object.entries(summary.by_status || {}).map(([name, value]) => ({
    name,
    value,
  }));
  const by_priority = Object.entries(summary.by_priority || {}).map(([name, value]) => ({
    name: name.toUpperCase(),
    value,
  }));
  const monthMap = new Map<string, { month: string; created: number; completed: number }>();
  for (const t of tickets) {
    const d = new Date(t.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = monthMap.get(key) || { month: key, created: 0, completed: 0 };
    row.created += 1;
    if (t.is_completed) row.completed += 1;
    monthMap.set(key, row);
  }
  const workerCounts = new Map<string, number>();
  for (const t of tickets) {
    for (const w of t.workers) {
      workerCounts.set(w.name, (workerCounts.get(w.name) || 0) + (w.actions || 1));
    }
  }
  return {
    pending_vs_completed: [
      { name: 'Pending', value: summary.pending, color: '#f59e0b' },
      { name: 'Completed', value: summary.completed, color: '#22c55e' },
    ],
    by_status,
    by_priority,
    volume_by_month: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    top_workers: [...workerCounts.entries()]
      .map(([name, actions]) => ({ name, actions }))
      .sort((a, b) => b.actions - a.actions)
      .slice(0, 8),
  };
}

function ChartCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 ${className}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  isText,
  accentIndex = 0,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'indigo' | 'amber' | 'green' | 'slate';
  isText?: boolean;
  accentIndex?: number;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px]"
      style={{ borderLeftWidth: 3, borderLeftColor: ['var(--accent-green)', 'var(--accent-purple)', 'var(--accent-amber)', 'var(--accent-blue)', 'var(--accent-red)'][accentIndex % 5] }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
        <Icon className="h-5 w-5" style={{ color: ['var(--accent-green)', 'var(--accent-purple)', 'var(--accent-amber)', 'var(--accent-blue)', 'var(--accent-red)'][accentIndex % 5] }} />
      </div>
      <p className={`mt-2.5 font-bold leading-none text-[var(--text-primary)] ${isText ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </p>
    </div>
  );
}
