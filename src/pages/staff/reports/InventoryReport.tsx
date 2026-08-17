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
  AlertCircle,
  ArrowDownCircle,
  ArrowLeft,
  ArrowUpCircle,
  Download,
  Package,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  loadInventoryReportData,
  formatReportDateTime,
  getTransactionDetailLink,
  type CombinedTransaction,
  type DateFilterMode,
  type InventoryReportResult,
} from '@/lib/inventoryReportData';

type TxTab = 'all' | 'out' | 'in';

function sourceBadge(source: string) {
  if (source === 'direct') return 'bg-blue-100 text-blue-800';
  if (source === 'request') return 'bg-violet-100 text-violet-800';
  return 'bg-emerald-100 text-emerald-800';
}

function sourceLabel(source: string) {
  if (source === 'direct') return 'Direct';
  if (source === 'request') return 'Request';
  return 'Return';
}

export default function InventoryReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InventoryReportResult | null>(null);
  const [dateMode, setDateMode] = useState<DateFilterMode>('all');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [txTab, setTxTab] = useState<TxTab>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadInventoryReportData({
        mode: dateMode,
        startDate,
        endDate,
      });
      setData(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load inventory report';
      setError(msg);
      setData(null);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [dateMode, startDate, endDate, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!data) return null;
    const out = data.filteredIssuances.reduce((s, t) => s + (t.quantity || 0), 0);
    const inn = data.filteredReturns.reduce((s, t) => s + (t.quantity || 0), 0);
    const direct = data.filteredIssuances
      .filter((t) => t.source === 'direct')
      .reduce((s, t) => s + (t.quantity || 0), 0);
    const request = data.filteredIssuances
      .filter((t) => t.source === 'request')
      .reduce((s, t) => s + (t.quantity || 0), 0);
    return {
      total_out: out,
      total_in: inn,
      net: inn - out,
      transactions: data.allTransactions.length,
      current_stock: data.currentTotal,
      direct,
      request,
    };
  }, [data]);

  const tableRows = useMemo(() => {
    if (!data) return [];
    let rows: CombinedTransaction[] = data.allTransactions;
    if (txTab === 'out') rows = data.filteredIssuances;
    if (txTab === 'in') rows = data.filteredReturns;

    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.item_name?.toLowerCase().includes(q) ||
        t.category_name?.toLowerCase().includes(q) ||
        t.person_name?.toLowerCase().includes(q) ||
        t.requester?.toLowerCase().includes(q) ||
        sourceLabel(t.source).toLowerCase().includes(q)
    );
  }, [data, txTab, search]);

  const exportCsv = () => {
    if (!tableRows.length) return;
    const headers = [
      'Type',
      'Date',
      'Time',
      'Item',
      'Category',
      'Qty',
      'Stock after',
      'Source',
      'Person',
      'Requester',
      'Approver',
    ];
    const lines = tableRows.map((t) => {
      const { fullDate, time } = formatReportDateTime(t.date_time);
      return [
        t.transaction_type === 'out' ? 'OUT' : 'IN',
        fullDate,
        time,
        `"${(t.item_name || '').replace(/"/g, '""')}"`,
        `"${(t.category_name || '').replace(/"/g, '""')}"`,
        t.quantity,
        t.current_stock ?? '',
        sourceLabel(t.source),
        `"${(t.person_name || '').replace(/"/g, '""')}"`,
        `"${(t.requester || '').replace(/"/g, '""')}"`,
        `"${(t.approver || '').replace(/"/g, '""')}"`,
      ].join(',');
    });
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-report-${dateMode === 'all' ? 'all-time' : `${startDate}-to-${endDate}`}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const charts = data?.charts;

  return (
    <div className="inv-theme min-h-full bg-[var(--content-bg)]">
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
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">
              Report System · Inventory
            </p>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Inventory Report</h1>
            <p className="mt-1 max-w-2xl text-[var(--text-secondary)]">
              Items issued (out), returns (in), stock movement, and visual analytics — view all time or
              filter by date range.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!tableRows.length}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-body)] shadow-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-body)] shadow-sm hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Period</label>
            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-0.5">
              <button
                type="button"
                onClick={() => setDateMode('all')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  dateMode === 'all' ? 'bg-emerald-600 text-white shadow' : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'
                }`}
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  dateMode === 'range'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)]'
                }`}
              >
                Date range
              </button>
            </div>
          </div>
          {dateMode === 'range' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Apply
          </button>
        </div>

        {summary && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Items out (issued)"
              value={summary.total_out}
              icon={<ArrowDownCircle className="h-5 w-5" />}
              sub={`Direct ${summary.direct} · Requests ${summary.request}`}
              accentIndex={0}
            />
            <StatCard
              label="Items in (returns)"
              value={summary.total_in}
              icon={<ArrowUpCircle className="h-5 w-5" />}
              sub="Stock returned to inventory"
              accentIndex={1}
            />
            <StatCard
              label="Net change"
              value={`${summary.net >= 0 ? '+' : ''}${summary.net}`}
              icon={<Package className="h-5 w-5" />}
              sub={dateMode === 'all' ? 'All recorded transactions' : 'Selected period'}
              accentIndex={2}
            />
            <StatCard
              label="Current stock (units)"
              value={summary.current_stock}
              icon={<Package className="h-5 w-5" />}
              sub={`${summary.transactions} transactions in view`}
              accentIndex={3}
            />
          </div>
        )}

        {charts && !loading && (
          <div className="mb-8 grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {charts.flow_split.length > 0 && (
              <ChartCard title="Out vs in (quantity)">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={charts.flow_split}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {charts.flow_split.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.by_source_out.length > 0 && (
              <ChartCard title="Issued by source">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={charts.by_source_out}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {charts.by_source_out.map((e) => (
                        <Cell key={e.name} fill={e.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.volume_by_period.length > 0 && (
              <ChartCard title={dateMode === 'all' ? 'Movement by month' : 'Movement by day'} className="lg:col-span-2">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={charts.volume_by_period}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="items_out" name="Out" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="items_in" name="In" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.top_items_out.length > 0 && (
              <ChartCard title="Top items issued">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={charts.top_items_out} layout="vertical" margin={{ left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Qty" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.top_items_in.length > 0 && (
              <ChartCard title="Top items returned">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={charts.top_items_in} layout="vertical" margin={{ left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} name="Qty" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {charts.top_categories_out.length > 0 && (
              <ChartCard title="Issued by category">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={charts.top_categories_out} dataKey="value" nameKey="name" outerRadius={80} label>
                      {charts.top_categories_out.map((_, i) => (
                        <Cell key={i} fill={['#6366f1', '#8b5cf6', '#3b82f6', '#14b8a6', '#f59e0b', '#64748b'][i % 6]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-sm">
            {(['all', 'out', 'in'] as TxTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTxTab(tab)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition ${
                  txTab === tab ? 'bg-emerald-600 text-white shadow' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {tab === 'all' ? 'All' : tab === 'out' ? 'Items out' : 'Items in'}
                {data && (
                  <span className="ml-1.5 opacity-80">
                    (
                    {tab === 'all'
                      ? data.allTransactions.length
                      : tab === 'out'
                        ? data.filteredIssuances.length
                        : data.filteredReturns.length}
                    )
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              placeholder="Search item, category, person…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-10 pr-3 text-sm shadow-sm"
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-[var(--surface-secondary)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 w-16">Type</th>
                <th className="px-4 py-3">Date & time</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Stock after</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3 hidden lg:table-cell">Requester</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[var(--text-muted)]">
                    Loading inventory report…
                  </td>
                </tr>
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-[var(--text-muted)]">
                    No transactions found for this view.
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => {
                  const { fullDate, time } = formatReportDateTime(row.date_time);
                  const isOut = row.transaction_type === 'out';
                  const detailLink = getTransactionDetailLink(row);
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-[var(--border)] transition hover:bg-[var(--surface-hover)]/60"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isOut ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isOut ? 'Out' : 'In'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-[var(--text-primary)]">{fullDate}</div>
                        <div className="text-xs text-[var(--text-muted)]">{time}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                        {detailLink ? (
                          <Link
                            to={detailLink.to}
                            state={detailLink.state}
                            className="text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            {row.item_name}
                          </Link>
                        ) : (
                          row.item_name
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{row.category_name || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">
                        {row.quantity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--text-secondary)]">
                        {row.current_stock ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadge(row.source)}`}
                        >
                          {sourceLabel(row.source)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">{row.person_name}</td>
                      <td className="hidden px-4 py-3 text-[var(--text-secondary)] lg:table-cell">
                        {row.requester || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {detailLink ? (
                          <Link
                            to={detailLink.to}
                            state={detailLink.state}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            View
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">—</span>
                        )}
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
  sub,
  icon,
  accentIndex = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  valueClass?: string;
  accentIndex?: number;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 py-[18px]"
      style={{ borderLeftWidth: 3, borderLeftColor: ['var(--accent-green)', 'var(--accent-purple)', 'var(--accent-amber)', 'var(--accent-blue)', 'var(--accent-red)'][accentIndex % 5] }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
        {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      </div>
      <p className="mt-2.5 text-2xl font-bold leading-none text-[var(--text-primary)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
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
    <div className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 ${className} shadow-[var(--shadow-md)]`}>
      <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {children}
    </div>
  );
}
