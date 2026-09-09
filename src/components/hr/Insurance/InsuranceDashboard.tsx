import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Search, TrendingUp, Users, Wallet } from 'lucide-react';
import { StatCard, EmptyState, Avatar } from '@/pages/hr/components';
import { formatGhs } from '@/lib/taxCalculations';
import { hrApi, HR_QUERY } from '@/api/hr';
import { insuranceApi, INSURANCE_QUERY } from '@/api/insurance';

export function InsuranceDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const overviewQ = useQuery({
    queryKey: ['insurance', 'overview'],
    queryFn: () => insuranceApi.overview(),
    ...INSURANCE_QUERY,
  });
  const pendingQ = useQuery({
    queryKey: ['insurance', 'pending-transfers'],
    queryFn: () => insuranceApi.pendingTransfers(),
    ...INSURANCE_QUERY,
  });
  const searchQ = useQuery({
    queryKey: ['hr', 'employees', 'insurance-search', search],
    queryFn: () => hrApi.employees({ q: search }),
    enabled: search.trim().length > 1,
    ...HR_QUERY,
  });

  const overview = overviewQ.data;
  const pending = pendingQ.data?.transfers || [];
  const results = Array.isArray(searchQ.data) ? searchQ.data : searchQ.data?.employees || [];

  if (overviewQ.isLoading) {
    return <div className="h-64 animate-pulse rounded-[var(--card-radius)] bg-[var(--surface-secondary)]" />;
  }

  if (!overview?.template) {
    return (
      <EmptyState
        title="No policy template yet"
        description="Set up your company-wide policy under the Policy Configuration tab to start tracking medical insurance."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          <Search className="h-4 w-4" />
          Find a staff member's insurance profile
        </label>
        <input
          className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
          placeholder="Search by name, email or position…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim().length > 1 && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)]">
            {results.length === 0 ? (
              <p className="p-3 text-sm text-[var(--text-muted)]">No staff found.</p>
            ) : (
              results.slice(0, 12).map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-[var(--border)] p-2.5 text-left last:border-b-0 hover:bg-[var(--surface-secondary)]"
                  onClick={() => navigate(`/hr/employees/${e.id}?tab=insurance`)}
                >
                  <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{e.full_name}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{e.position || e.department || '—'}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Claims (Period)" value={overview.totalClaims} icon={Wallet} accentIndex={3} />
        <StatCard label="Total Medical Spend" value={formatGhs(overview.totalSpend)} icon={TrendingUp} accentIndex={0} />
        <StatCard label="Pending Transfers" value={overview.pendingTransfers} icon={Users} accentIndex={2} />
        <StatCard
          label="Policy Period"
          value={`${new Date(overview.template.periodStart).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} – ${new Date(overview.template.periodEnd).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`}
          accentIndex={1}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Top Categories Claimed</h3>
          {overview.topCategories.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No claims logged yet this period.</p>
          ) : (
            <ul className="space-y-2.5">
              {overview.topCategories.map((c: any) => (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-primary)]">{c.name}</span>
                  <span className="text-[var(--text-muted)]">
                    {formatGhs(c.total)} <span className="text-xs">({c.count})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 text-[var(--accent-amber)]" />
            Staff With Lowest Remaining Balance
          </h3>
          {overview.lowestBalance.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No staff on the policy yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {overview.lowestBalance.map((s: any) => (
                <li key={s.staffId} className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="truncate text-left text-[var(--primary)] hover:underline"
                    onClick={() => navigate(`/hr/employees/${s.staffId}?tab=insurance`)}
                  >
                    {s.name}
                  </button>
                  <span className={s.remaining < 0 ? 'text-[var(--accent-red)]' : 'text-[var(--text-muted)]'}>
                    {formatGhs(s.remaining)} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Pending Transfer Confirmations</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No transfers awaiting a response.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((t: any) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] p-2.5 text-sm"
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-left text-[var(--primary)] hover:underline"
                  onClick={() => navigate(`/hr/employees/${t.staffId}?tab=insurance`)}
                >
                  {t.staffName}
                </button>
                <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
                  {t.fromCategoryName}
                  <ArrowRight className="h-3.5 w-3.5" />
                  {t.toCategoryName} · {formatGhs(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
