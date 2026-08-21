import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, YearSelect } from './components';

function statusLabel(s: string) {
  if (s === 'active') return 'Active';
  if (s === 'paused') return 'Paused';
  if (s === 'settled') return 'Fully Repaid';
  return s;
}

const HrPayrollAdvances = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const now = new Date();
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [empSearch, setEmpSearch] = useState('');
  const [form, setForm] = useState({
    employee_id: '',
    loan_amount: '',
    monthly_deduction: '',
    start_month: String(now.getMonth() + 1),
    start_year: String(now.getFullYear()),
    notes: '',
    auto_stop: true,
  });

  const summaryQ = useQuery({
    queryKey: ['hr', 'advances-summary'],
    queryFn: () => hrApi.salaryAdvancesSummary(),
    ...HR_QUERY,
  });
  const listQ = useQuery({
    queryKey: ['hr', 'advances'],
    queryFn: () => hrApi.salaryAdvances(),
    ...HR_QUERY,
  });
  const employeesQ = useQuery({
    queryKey: ['hr', 'employees'],
    queryFn: () => hrApi.employees(),
    ...HR_QUERY,
  });
  const detailQ = useQuery({
    queryKey: ['hr', 'advance', detailId],
    queryFn: () => hrApi.salaryAdvance(detailId!),
    enabled: !!detailId,
    ...HR_QUERY,
  });

  const employees = useMemo(() => {
    const list = Array.isArray(employeesQ.data) ? employeesQ.data : [];
    return list.filter((e: any) => String(e.status || 'active').toLowerCase() === 'active');
  }, [employeesQ.data]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e: any) => String(e.full_name || '').toLowerCase().includes(q));
  }, [employees, empSearch]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hr', 'advances'] });
    qc.invalidateQueries({ queryKey: ['hr', 'advances-summary'] });
    qc.invalidateQueries({ queryKey: ['hr', 'advance'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-preview'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-audit'] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      hrApi.createSalaryAdvance({
        employee_id: Number(form.employee_id),
        loan_amount: Number(form.loan_amount),
        monthly_deduction: Number(form.monthly_deduction),
        start_month: Number(form.start_month),
        start_year: Number(form.start_year),
        notes: form.notes || null,
        auto_stop: form.auto_stop,
      }),
    onSuccess: () => {
      toast.success('Salary advance created');
      invalidate();
      setAddOpen(false);
      setForm({
        employee_id: '',
        loan_amount: '',
        monthly_deduction: '',
        start_month: String(now.getMonth() + 1),
        start_year: String(now.getFullYear()),
        notes: '',
        auto_stop: true,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      hrApi.updateSalaryAdvanceStatus(id, status),
    onSuccess: () => {
      toast.success('Loan status updated');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = summaryQ.data || {};
  const loans = listQ.data || [];
  const detail = detailQ.data;

  return (
    <div>
      <HrPageHeader
        title="Salary Advances"
        description="Staff loans and salary advances recovered automatically on each payroll run."
        actions={
          <Button
            onClick={() => {
              setEmpSearch('');
              setAddOpen(true);
            }}
          >
            Add New Loan
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Active Loans', value: summary.active_loans ?? '—' },
          { label: 'Total Outstanding', value: formatGhs(summary.outstanding_balance) },
          { label: 'Recovered This Month', value: formatGhs(summary.recovered_this_month) },
          { label: 'Fully Repaid Loans', value: summary.fully_repaid ?? '—' },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">{c.label}</p>
            <p className="mt-1 text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {listQ.isLoading ? (
        <TableSkeleton />
      ) : loans.length === 0 ? (
        <EmptyState
          title="No salary advances yet"
          description="Create a loan to deduct repayments automatically from payroll."
          action={<Button onClick={() => setAddOpen(true)}>Add New Loan</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Loan Amount</th>
                <th className="px-3 py-3">Monthly Deduction</th>
                <th className="px-3 py-3">Paid So Far</th>
                <th className="px-3 py-3">Remaining</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((row: any) => (
                <tr key={row.id} className="border-b">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.full_name} src={row.photo_url} size="sm" />
                      {row.full_name}
                    </div>
                  </td>
                  <td className="px-3 py-3">{formatGhs(row.loan_amount)}</td>
                  <td className="px-3 py-3">{formatGhs(row.monthly_deduction)}</td>
                  <td className="px-3 py-3">{formatGhs(row.paid_so_far)}</td>
                  <td className="px-3 py-3 font-semibold">{formatGhs(row.remaining_balance)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={statusLabel(row.status)} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Button size="sm" variant="outline" className="mr-1" onClick={() => setDetailId(row.id)}>
                      View
                    </Button>
                    {row.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1"
                        onClick={() => statusMut.mutate({ id: row.id, status: 'paused' })}
                      >
                        Pause
                      </Button>
                    )}
                    {row.status === 'paused' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-1"
                        onClick={() => statusMut.mutate({ id: row.id, status: 'active' })}
                      >
                        Resume
                      </Button>
                    )}
                    {row.status !== 'settled' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMut.mutate({ id: row.id, status: 'settled' })}
                      >
                        Mark Settled
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add New Loan</DialogTitle>
            <DialogDescription className="sr-only">
              Create a salary advance with employee, amount, and monthly repayment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Employee">
              <input
                className={inputClass}
                placeholder="Search employee…"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
              />
              <select
                className={`${inputClass} mt-2`}
                value={form.employee_id}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              >
                <option value="">Select employee…</option>
                {filteredEmps.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Loan Amount (GHS)">
                <input
                  className={inputClass}
                  type="number"
                  value={form.loan_amount}
                  onChange={(e) => setForm({ ...form, loan_amount: e.target.value })}
                />
              </Field>
              <Field label="Monthly Deduction (GHS)">
                <input
                  className={inputClass}
                  type="number"
                  value={form.monthly_deduction}
                  onChange={(e) => setForm({ ...form, monthly_deduction: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start Month">
                <select
                  className={inputClass}
                  value={form.start_month}
                  onChange={(e) => setForm({ ...form, start_month: e.target.value })}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start Year">
                <YearSelect
                  value={Number(form.start_year)}
                  onChange={(y) => setForm({ ...form, start_year: String(y) })}
                />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input
                className={inputClass}
                placeholder="e.g. Emergency loan approved by CTO"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Auto-stop when balance reaches zero</span>
              <Switch checked={form.auto_stop} onCheckedChange={(on) => setForm({ ...form, auto_stop: on })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.employee_id || !form.loan_amount || !form.monthly_deduction || createMut.isPending}
            >
              {createMut.isPending ? 'Saving…' : 'Create Loan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Loan Detail</DialogTitle>
            <DialogDescription className="sr-only">
              View loan balance, status actions, and repayment history.
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            <TableSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar name={detail.full_name} src={detail.photo_url} size="md" />
                <div>
                  <p className="font-semibold">{detail.full_name}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {detail.position || '—'} · {detail.department || '—'}
                  </p>
                </div>
                <div className="ml-auto">
                  <StatusBadge status={statusLabel(detail.status)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Loan Amount</p>
                  <p className="font-semibold">{formatGhs(detail.loan_amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Monthly</p>
                  <p className="font-semibold">{formatGhs(detail.monthly_deduction)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Remaining</p>
                  <p className="font-semibold">{formatGhs(detail.remaining_balance)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">Start</p>
                  <p className="font-semibold">
                    {detail.start_month}/{detail.start_year}
                  </p>
                </div>
              </div>
              {detail.notes && <p className="text-sm text-[var(--text-secondary)]">{detail.notes}</p>}
              <div className="flex flex-wrap gap-2">
                {detail.status === 'active' && (
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: detail.id, status: 'paused' })}>
                    Pause
                  </Button>
                )}
                {detail.status === 'paused' && (
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: detail.id, status: 'active' })}>
                    Resume
                  </Button>
                )}
                {detail.status !== 'settled' && (
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: detail.id, status: 'settled' })}>
                    Mark Settled
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => navigate(`/hr/employees/${detail.employee_id}`)}>
                  Open Employee
                </Button>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Repayment History</h3>
                {(detail.repayments || []).length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No repayments yet — will appear after payroll generate.</p>
                ) : (
                  <table className="vobiss-table w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                        <th className="px-2 py-2">Month</th>
                        <th className="px-2 py-2">Year</th>
                        <th className="px-2 py-2">Amount Deducted</th>
                        <th className="px-2 py-2">Remaining After</th>
                        <th className="px-2 py-2">Payroll Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.repayments.map((r: any) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-2 py-2">{r.month}</td>
                          <td className="px-2 py-2">{r.year}</td>
                          <td className="px-2 py-2">{formatGhs(r.amount_deducted)}</td>
                          <td className="px-2 py-2">{formatGhs(r.remaining_after)}</td>
                          <td className="px-2 py-2">{r.payroll_status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrPayrollAdvances;
