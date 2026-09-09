import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, FileText, Building2 } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  searchEmployeesForPerformance,
  getEmployeePerformance,
  type EmployeeSearchResult,
  type PerformanceReport,
} from '@/api/performanceReports';

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'finalized') return 'success';
  if (status === 'needs_revision') return 'danger';
  if (status === 'draft') return 'info';
  return 'warning';
}
function statusLabel(status: string) {
  return status.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export default function EmployeeSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmployeeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<EmployeeSearchResult | null>(null);
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    if (!query.trim() || selected) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchEmployeesForPerformance(query)
        .then((r) => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, selected]);

  const selectEmployee = (emp: EmployeeSearchResult) => {
    setSelected(emp);
    setQuery(emp.name);
    setResults([]);
    setLoadingReports(true);
    getEmployeePerformance(emp.id)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoadingReports(false));
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    setReports([]);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance &amp; Reports</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
          <Users className="h-7 w-7" /> Employee Performance
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Search for anyone in the system to see their full performance report history.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (selected) { setSelected(null); setReports([]); } }}
          placeholder="Search by name or username…"
          autoComplete="off"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-10 pr-3 text-sm shadow-sm"
        />
        {!selected && (query.trim().length > 0) && (
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
            {searching ? (
              <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-[var(--text-muted)]">No matching staff found.</p>
            ) : (
              results.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-secondary)]"
                  onMouseDown={() => selectEmployee(emp)}
                >
                  <span className="font-medium text-[var(--text-primary)]">{emp.name}</span>
                  {(emp.position || emp.unit) && (
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {[emp.position, emp.unit].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selected && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">{selected.name}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {[selected.position, selected.unit].filter(Boolean).join(' · ') || selected.username}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-[var(--primary)] hover:underline"
            >
              Search someone else
            </button>
          </div>

          {loadingReports ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-16 text-center">
              <FileText className="h-8 w-8 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">{selected.name} has no performance reports yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/performance-reports/report/${r.id}`)}>
                        <TableCell className="font-medium">{r.title}</TableCell>
                        <TableCell className="text-[var(--text-muted)]">{r.period?.name || `Period #${r.period_id}`}</TableCell>
                        <TableCell className="text-[var(--text-muted)]">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="font-semibold">{r.final_score != null ? r.final_score : '—'}</TableCell>
                        <TableCell><StatusPill tone={statusTone(r.status)}>{statusLabel(r.status)}</StatusPill></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
