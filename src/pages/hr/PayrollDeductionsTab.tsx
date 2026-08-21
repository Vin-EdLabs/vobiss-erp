import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { EmptyState, TableSkeleton, inputClass } from './components';

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function deductionTypeLabel(type: string) {
  const t = String(type || 'fixed').toLowerCase();
  if (t === 'percentage_basic' || t === 'percent_basic' || t === 'percentage') return '% of Basic';
  if (t === 'percentage_gross' || t === 'percent_gross') return '% of Gross';
  return 'Fixed (GHS)';
}

export function estimateMonthlyDeduction(
  type: string,
  value: number,
  basic: number,
  allowanceTotal = 0
) {
  const t = String(type || 'fixed').toLowerCase();
  const v = Number(value) || 0;
  const gross = Number(basic) + Number(allowanceTotal);
  if (t === 'percentage_basic' || t === 'percent_basic' || t === 'percentage') {
    return Math.round(basic * (v / 100) * 100) / 100;
  }
  if (t === 'percentage_gross' || t === 'percent_gross') {
    return Math.round(gross * (v / 100) * 100) / 100;
  }
  return Math.round(v * 100) / 100;
}

const emptyDed = {
  catalogue: '',
  custom: false,
  deduction_name: '',
  deduction_type: 'fixed',
  value: '',
  is_active: true,
  effective_from: firstOfMonth(),
  effective_to: '',
};

/** Assign permanent (non-loan) deductions from Payroll. */
export function PayrollDeductionsTab() {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyDed);

  const employeesQ = useQuery({
    queryKey: ['hr', 'employees'],
    queryFn: () => hrApi.employees(),
    ...HR_QUERY,
  });
  const settingsQ = useQuery({
    queryKey: ['hr', 'payroll-settings'],
    queryFn: () => hrApi.payrollSettings(),
    ...HR_QUERY,
  });
  const dedQ = useQuery({
    queryKey: ['hr', 'emp-ded', employeeId],
    queryFn: () => hrApi.employeeDeductions(employeeId),
    enabled: !!employeeId,
    ...HR_QUERY,
  });
  const allowQ = useQuery({
    queryKey: ['hr', 'emp-allow', employeeId],
    queryFn: () => hrApi.employeeAllowances(employeeId),
    enabled: !!employeeId,
    ...HR_QUERY,
  });

  const employees = useMemo(() => {
    const list = Array.isArray(employeesQ.data) ? employeesQ.data : [];
    return list.filter((e: any) => String(e.status || 'active').toLowerCase() === 'active');
  }, [employeesQ.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e: any) =>
        String(e.full_name || '')
          .toLowerCase()
          .includes(q) ||
        String(e.department || '')
          .toLowerCase()
          .includes(q)
    );
  }, [employees, search]);

  const catalogue = useMemo(
    () => (Array.isArray(settingsQ.data?.deduction_types) ? settingsQ.data.deduction_types : []),
    [settingsQ.data]
  );

  const selected = employees.find((e: any) => String(e.id) === String(employeeId));
  const allowanceTotal = (allowQ.data || []).reduce((s: number, a: any) => {
    if (a.type === 'percentage') return s + (Number(selected?.basic_salary || 0) * Number(a.value || 0)) / 100;
    return s + Number(a.value || 0);
  }, 0);
  const monthlyPreview = estimateMonthlyDeduction(
    form.deduction_type,
    Number(form.value || 0),
    Number(selected?.basic_salary || 0),
    allowanceTotal
  );

  const rows = (dedQ.data || []).filter((d: any) => !d.is_loan);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hr', 'emp-ded'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-preview'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-audit'] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        employee_id: Number(employeeId),
        deduction_name: form.deduction_name,
        deduction_type: form.deduction_type,
        value: Number(form.value || 0),
        is_loan: false,
        is_active: form.is_active,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      };
      if (editId) return hrApi.updateEmployeeDeduction(editId, body);
      return hrApi.createEmployeeDeduction(body);
    },
    onSuccess: () => {
      toast.success(editId ? 'Deduction updated' : 'Deduction assigned');
      invalidate();
      setOpen(false);
      setForm({ ...emptyDed, effective_from: firstOfMonth() });
      setEditId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => hrApi.deleteEmployeeDeduction(id),
    onSuccess: () => {
      toast.success('Deduction removed');
      invalidate();
    },
  });

  const applyCatalogue = (name: string) => {
    const item = catalogue.find((c: any) => c.name === name);
    if (!item) return;
    setForm((f) => ({
      ...f,
      catalogue: name,
      custom: false,
      deduction_name: item.name || '',
      deduction_type: item.type || 'fixed',
      value: String(item.value ?? ''),
    }));
  };

  if (employeesQ.isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <h2 className="text-sm font-semibold">Assign Deductions to Employees</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Catalogue types come from Settings. Loans / salary advances are managed under Salary Advances.
        </p>
        {catalogue.length === 0 && (
          <p className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm">
            No deduction templates yet. Add them under <strong>Settings → Deductions Catalogue</strong>, then Save.
          </p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={inputClass} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select employee…</option>
            {filtered.map((e: any) => (
              <option key={e.id} value={String(e.id)}>
                {e.full_name}
                {e.department ? ` — ${e.department}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!employeeId ? (
        <EmptyState title="Select an employee" description="Choose someone to view and assign deductions." />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{selected?.full_name}</h3>
              <p className="text-xs text-[var(--text-muted)]">Basic {formatGhs(selected?.basic_salary)}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditId(null);
                setForm({ ...emptyDed, effective_from: firstOfMonth() });
                setOpen(true);
              }}
            >
              Add Deduction
            </Button>
          </div>
          {dedQ.isLoading ? (
            <TableSkeleton />
          ) : (
            <table className="vobiss-table mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Deduction Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Monthly Amount</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-[var(--text-muted)]">
                      No deductions assigned.
                    </td>
                  </tr>
                ) : (
                  rows.map((d: any) => (
                    <tr key={d.id} className="border-b">
                      <td className="px-3 py-2">{d.deduction_name}</td>
                      <td className="px-3 py-2">{deductionTypeLabel(d.deduction_type)}</td>
                      <td className="px-3 py-2">
                        {String(d.deduction_type).includes('percentage') || d.deduction_type === 'percentage'
                          ? `${d.value}%`
                          : formatGhs(d.value)}
                      </td>
                      <td className="px-3 py-2">
                        {formatGhs(
                          estimateMonthlyDeduction(
                            d.deduction_type,
                            Number(d.value),
                            Number(selected?.basic_salary || 0),
                            allowanceTotal
                          )
                        )}
                      </td>
                      <td className="px-3 py-2">{d.is_active ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          onClick={() => {
                            setEditId(d.id);
                            setForm({
                              catalogue: '',
                              custom: true,
                              deduction_name: d.deduction_name || '',
                              deduction_type: d.deduction_type || 'fixed',
                              value: String(d.value ?? ''),
                              is_active: d.is_active !== false,
                              effective_from: d.effective_from
                                ? String(d.effective_from).slice(0, 10)
                                : firstOfMonth(),
                              effective_to: d.effective_to ? String(d.effective_to).slice(0, 10) : '',
                            });
                            setOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => delMut.mutate(d.id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Deduction' : `Add Deduction — ${selected?.full_name || ''}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editId && (
              <select
                className={inputClass}
                value={form.custom ? '__custom__' : form.catalogue}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setForm({ ...emptyDed, custom: true, effective_from: firstOfMonth() });
                  } else if (e.target.value) {
                    applyCatalogue(e.target.value);
                  } else {
                    setForm({ ...emptyDed, effective_from: firstOfMonth() });
                  }
                }}
              >
                <option value="">Select from catalogue…</option>
                {catalogue.map((c: any) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">Add Custom</option>
              </select>
            )}
            <input
              className={inputClass}
              placeholder="Deduction name"
              value={form.deduction_name}
              onChange={(e) => setForm({ ...form, deduction_name: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className={inputClass}
                value={form.deduction_type}
                onChange={(e) => setForm({ ...form, deduction_type: e.target.value })}
              >
                <option value="fixed">Fixed Amount (GHS)</option>
                <option value="percentage_basic">Percentage of Basic (%)</option>
                <option value="percentage_gross">Percentage of Gross (%)</option>
              </select>
              <input
                className={inputClass}
                type="number"
                placeholder="Value"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                type="date"
                value={form.effective_from}
                onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              />
              <input
                className={inputClass}
                type="date"
                value={form.effective_to}
                onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Active</span>
              <Switch checked={form.is_active} onCheckedChange={(on) => setForm({ ...form, is_active: on })} />
            </div>
            {form.deduction_name && (
              <p className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm">
                Estimated monthly deduction:{' '}
                <strong>{formatGhs(monthlyPreview)} per month</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.deduction_name || saveMut.isPending}>
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
