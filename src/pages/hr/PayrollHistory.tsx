import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import {
  Avatar,
  EmptyState,
  HrPageHeader,
  StatCard,
  StatusBadge,
  TableSkeleton,
  YearSelect,
} from './components';
import { cn } from '@/lib/utils';

function periodLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function monthName(month: number) {
  return new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' });
}

const HrPayrollHistory = () => {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const historyQ = useQuery({
    queryKey: ['hr', 'payroll-history'],
    queryFn: () => hrApi.payroll(),
    ...HR_QUERY,
  });

  const yearRuns = useMemo(() => {
    const rows = Array.isArray(historyQ.data) ? historyQ.data : [];
    return rows
      .filter((r: any) => Number(r.year) === year)
      .sort((a: any, b: any) => Number(b.month) - Number(a.month));
  }, [historyQ.data, year]);

  const detailQ = useQuery({
    queryKey: ['hr', 'payroll', selectedMonth, year],
    queryFn: () => hrApi.payroll(selectedMonth!, year),
    enabled: selectedMonth != null,
    ...HR_QUERY,
  });

  const items = detailQ.data?.items || [];
  const payroll = detailQ.data?.payroll;
  const detailTotals = useMemo(() => {
    return items.reduce(
      (acc: any, r: any) => {
        acc.gross += Number(r.gross || 0);
        acc.deductions += Number(r.ssnit_employee || 0) + Number(r.paye || 0);
        acc.net += Number(r.net_pay || 0);
        return acc;
      },
      { gross: 0, deductions: 0, net: 0 }
    );
  }, [items]);

  const yearTotals = useMemo(() => {
    return yearRuns.reduce(
      (acc: any, r: any) => {
        acc.periods += 1;
        acc.net += Number(r.total_net || 0);
        acc.employees += Number(r.item_count || 0);
        return acc;
      },
      { periods: 0, net: 0, employees: 0 }
    );
  }, [yearRuns]);

  return (
    <div>
      <HrPageHeader
        title="Payroll History"
        description="Browse every payroll run by year, then open a month to see each employee."
        actions={<YearSelect value={year} onChange={(y) => { setYear(y); setSelectedMonth(null); }} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Periods this year" value={yearTotals.periods} accentIndex={0} />
        <StatCard label="Total net paid (recorded)" value={formatGhs(yearTotals.net)} accentIndex={1} />
        <StatCard label="Employee lines" value={yearTotals.employees} accentIndex={2} />
      </div>

      {historyQ.isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : yearRuns.length === 0 ? (
        <EmptyState
          title={`No payroll history for ${year}`}
          description="Generate payroll months on the Payroll page to build this archive."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--text-primary)]">{year} runs</p>
              <p className="text-xs text-[var(--text-muted)]">Select a month to view individuals</p>
            </div>
            <ul className="max-h-[min(70vh,560px)] overflow-y-auto p-2">
              {yearRuns.map((run: any) => {
                const active = selectedMonth === Number(run.month);
                return (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(Number(run.month))}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[var(--radius)] px-3 py-3 text-left transition',
                        active
                          ? 'bg-[var(--accent-green-light)] ring-1 ring-[var(--primary)]'
                          : 'hover:bg-[var(--surface-hover)]'
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {monthName(Number(run.month))}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {run.item_count || 0} employees · {formatGhs(run.total_net)}
                        </p>
                      </div>
                      <StatusBadge status={run.status} />
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
            {selectedMonth == null ? (
              <div className="flex min-h-[280px] items-center justify-center p-8">
                <EmptyState
                  title="Choose a payroll month"
                  description="Pick a run on the left to see each employee’s pay for that period."
                />
              </div>
            ) : detailQ.isLoading ? (
              <div className="p-4"><TableSkeleton /></div>
            ) : (
              <>
                <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        {periodLabel(selectedMonth, year)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={payroll?.status} />
                        {payroll?.generated_at && (
                          <span className="text-xs text-[var(--text-muted)]">
                            Generated {new Date(payroll.generated_at).toLocaleDateString('en-GB')}
                          </span>
                        )}
                        {payroll?.paid_at && (
                          <span className="text-xs text-[var(--text-muted)]">
                            Paid {new Date(payroll.paid_at).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedMonth(null)}>
                      Close
                    </Button>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Gross</p>
                      <p className="text-base font-bold">{formatGhs(detailTotals.gross)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Deductions</p>
                      <p className="text-base font-bold">{formatGhs(detailTotals.deductions)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Net</p>
                      <p className="text-base font-bold">{formatGhs(detailTotals.net)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Employees</p>
                      <p className="text-base font-bold">{items.length}</p>
                    </div>
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No employees in this run" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="vobiss-table w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                          <th className="px-4 py-3">Employee</th>
                          <th className="px-4 py-3">Department</th>
                          <th className="px-4 py-3">Basic</th>
                          <th className="px-4 py-3">Gross</th>
                          <th className="px-4 py-3">SSNIT</th>
                          <th className="px-4 py-3">PAYE</th>
                          <th className="px-4 py-3">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((r: any) => (
                          <tr key={r.id} className="border-b">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Avatar name={r.full_name} src={r.photo_url} size="sm" />
                                <div>
                                  <p className="font-medium">{r.full_name}</p>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    EMP-{String(r.employee_id).padStart(3, '0')}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">{r.department || '—'}</td>
                            <td className="px-4 py-3">{formatGhs(r.basic_salary)}</td>
                            <td className="px-4 py-3">{formatGhs(r.gross)}</td>
                            <td className="px-4 py-3">{formatGhs(r.ssnit_employee)}</td>
                            <td className="px-4 py-3">{formatGhs(r.paye)}</td>
                            <td className="px-4 py-3 font-semibold text-[var(--success-text)]">
                              {formatGhs(r.net_pay)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HrPayrollHistory;
