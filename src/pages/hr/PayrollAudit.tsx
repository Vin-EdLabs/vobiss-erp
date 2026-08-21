import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { API_URL } from '@/lib/api';
import { hrApi } from '@/api/hr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, Field, HrPageHeader, StatCard, TableSkeleton, inputClass } from './components';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: '', label: 'All Actions' },
  { value: 'payroll', label: 'Payroll Runs' },
  { value: 'payslip', label: 'Payslips' },
  { value: 'salary', label: 'Salary Changes' },
  { value: 'allowance', label: 'Allowances' },
  { value: 'deduction', label: 'Deductions' },
  { value: 'loan', label: 'Loans' },
  { value: 'settings', label: 'Settings' },
];

const CATEGORY_TONE: Record<string, string> = {
  payroll: 'bg-amber-100 text-amber-900',
  payslip: 'bg-sky-100 text-sky-900',
  salary: 'bg-emerald-100 text-emerald-900',
  allowance: 'bg-violet-100 text-violet-900',
  deduction: 'bg-rose-100 text-rose-900',
  loan: 'bg-orange-100 text-orange-900',
  settings: 'bg-slate-200 text-slate-800',
};

function categoryBadge(cat: string) {
  const label = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : '—';
  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', CATEGORY_TONE[cat] || 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</p>
        <p className="text-sm text-[var(--text-secondary)]">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--surface-2,#f8f5f1)] p-3 text-xs leading-relaxed text-[var(--text-primary)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

const HrPayrollAudit = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: category || undefined,
      performed_by: performedBy || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      limit: 50,
    }),
    [debouncedSearch, category, performedBy, from, to, page]
  );

  const listQ = useQuery({
    queryKey: ['hr', 'payroll-audit', filters],
    queryFn: () => hrApi.payrollAudit(filters),
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const summaryQ = useQuery({
    queryKey: ['hr', 'payroll-audit-summary', filters],
    queryFn: () =>
      hrApi.payrollAuditSummary({
        search: filters.search,
        category: filters.category,
        performed_by: filters.performed_by,
        from: filters.from,
        to: filters.to,
      }),
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const performersQ = useQuery({
    queryKey: ['hr', 'payroll-audit-performers'],
    queryFn: () => hrApi.payrollAuditPerformers(),
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 1,
  });

  const detailQ = useQuery({
    queryKey: ['hr', 'payroll-audit-detail', selectedId],
    queryFn: () => hrApi.payrollAuditDetail(selectedId!),
    enabled: selectedId != null,
    staleTime: 0,
  });

  const rows = listQ.data?.rows || [];
  const total = listQ.data?.total || 0;
  const totalPages = listQ.data?.total_pages || 1;
  const summary = summaryQ.data || {};

  const downloadExport = async (format: 'csv' | 'pdf') => {
    try {
      const qs = new URLSearchParams();
      qs.set('format', format);
      if (filters.search) qs.set('search', filters.search);
      if (filters.category) qs.set('category', filters.category);
      if (filters.performed_by) qs.set('performed_by', filters.performed_by);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/hr/payroll/audit/export?${qs}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pdf' ? 'payroll-audit.pdf' : 'payroll-audit.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format === 'pdf' ? 'PDF' : 'Excel (CSV)'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    }
  };

  return (
    <div>
      <HrPageHeader
        title="Payroll Audit"
        description="Append-only, read-only trail of every payroll action. Records cannot be edited or deleted."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                listQ.refetch();
                summaryQ.refetch();
                performersQ.refetch();
              }}
              disabled={listQ.isFetching}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', listQ.isFetching && 'animate-spin')} />
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => downloadExport('csv')}>Export Excel (CSV)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadExport('pdf')}>Export PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      {listQ.isError ? (
        <EmptyState
          title="Could not load audit log"
          description={(listQ.error as Error)?.message || 'Please try again.'}
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
                <Input
                  className={cn(inputClass, 'pl-8')}
                  placeholder="Employee, action, or performer"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Action Category">
              <select
                className={inputClass}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(1);
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value || 'all'} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Performed By">
              <select
                className={inputClass}
                value={performedBy}
                onChange={(e) => {
                  setPerformedBy(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All users</option>
                <option value="system">System</option>
                {(Array.isArray(performersQ.data) ? performersQ.data : [])
                  .filter((p: any) => p.id != null)
                  .map((p: any) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="From">
              <Input
                type="date"
                className={inputClass}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="To">
              <Input
                type="date"
                className={inputClass}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Actions" value={summary.total_actions ?? 0} />
            <StatCard label="Payroll Runs" value={summary.payroll_runs ?? 0} />
            <StatCard label="Salary Changes" value={summary.salary_changes ?? 0} />
            <StatCard label="Settings Changes" value={summary.settings_changes ?? 0} />
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {listQ.isLoading ? (
              <TableSkeleton rows={8} cols={6} />
            ) : rows.length === 0 ? (
              <EmptyState title="No audit records" description="No payroll actions match these filters yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[var(--border)] bg-[var(--surface-2,#f8f5f1)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Timestamp</th>
                      <th className="px-3 py-2.5 font-medium">Action</th>
                      <th className="px-3 py-2.5 font-medium">Category</th>
                      <th className="px-3 py-2.5 font-medium">Employee Affected</th>
                      <th className="px-3 py-2.5 font-medium">Performed By</th>
                      <th className="px-3 py-2.5 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r: any) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b border-[var(--border)]/70 hover:bg-[var(--surface-2,#f8f5f1)]"
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">
                          {r.created_at_ghana || r.created_at}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-[var(--text-primary)]">{r.action_label}</td>
                        <td className="px-3 py-2.5">{categoryBadge(r.category)}</td>
                        <td className="px-3 py-2.5">
                          {r.employee_name ? (
                            <span>
                              {r.employee_name}
                              {r.employee_id != null && (
                                <span className="text-[var(--text-secondary)]"> · #{r.employee_id}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">{r.performed_by_name || 'System'}</td>
                        <td className="max-w-xs truncate px-3 py-2.5 text-[var(--text-secondary)]" title={r.description}>
                          {r.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-3 py-2 text-sm">
              <span className="text-[var(--text-secondary)]">
                {total} record{total === 1 ? '' : 's'} · page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <Sheet open={selectedId != null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{detailQ.data?.action_label || 'Audit detail'}</SheetTitle>
            <SheetDescription>Read-only record — no edits or deletes are possible.</SheetDescription>
          </SheetHeader>
          {detailQ.isLoading ? (
            <p className="mt-6 text-sm text-[var(--text-secondary)]">Loading…</p>
          ) : detailQ.data ? (
            <div className="mt-6 space-y-4 text-sm">
              <div className="grid gap-2">
                <p>
                  <span className="text-[var(--text-secondary)]">Timestamp: </span>
                  {detailQ.data.created_at_ghana}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Performed by: </span>
                  {detailQ.data.performed_by_name || 'System'}
                  {detailQ.data.performed_by_role ? ` (${detailQ.data.performed_by_role})` : ''}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Employee: </span>
                  {detailQ.data.employee_name
                    ? `${detailQ.data.employee_name} (#${detailQ.data.employee_id})${
                        detailQ.data.employee_department ? ` · ${detailQ.data.employee_department}` : ''
                      }`
                    : '—'}
                </p>
                {(detailQ.data.payroll_month || detailQ.data.payroll_year) && (
                  <p>
                    <span className="text-[var(--text-secondary)]">Payroll period: </span>
                    {detailQ.data.payroll_month}/{detailQ.data.payroll_year}
                  </p>
                )}
                <p>
                  <span className="text-[var(--text-secondary)]">IP address: </span>
                  {detailQ.data.ip_address || '—'}
                </p>
                <p>
                  <span className="text-[var(--text-secondary)]">Summary: </span>
                  {detailQ.data.description}
                </p>
              </div>
              <JsonBlock title="BEFORE" value={detailQ.data.before_snapshot} />
              <JsonBlock title="AFTER" value={detailQ.data.after_snapshot} />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default HrPayrollAudit;
