import React, { useEffect, useMemo, useState } from 'react';
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

const emptyAllow = {
  catalogue: '',
  custom: false,
  allowance_name: '',
  allowance_type: 'fixed',
  value: '',
  taxable: true,
  effective_from: firstOfMonth(),
  effective_to: '',
};

/** Manage permanent employee allowances from Payroll (not employee profile). */
export function PayrollAllowancesTab() {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [allowOpen, setAllowOpen] = useState(false);
  const [editAllowId, setEditAllowId] = useState<number | null>(null);
  const [allowForm, setAllowForm] = useState(emptyAllow);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    catalogue: '',
    allowance_name: '',
    allowance_type: 'fixed',
    value: '',
    taxable: true,
    effective_from: firstOfMonth(),
    effective_to: '',
    employeeIds: [] as number[],
  });
  const [previewBefore, setPreviewBefore] = useState<any>(null);
  const [previewAfter, setPreviewAfter] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewMonth = new Date().getMonth() + 1;
  const previewYear = new Date().getFullYear();

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
  const allowQ = useQuery({
    queryKey: ['hr', 'emp-allow', employeeId],
    queryFn: () => hrApi.employeeAllowances(employeeId),
    enabled: !!employeeId,
    ...HR_QUERY,
  });

  const employees = useMemo(() => {
    const list = Array.isArray(employeesQ.data) ? employeesQ.data : employeesQ.data?.employees || [];
    return (list as any[]).filter((e) => String(e.status || 'active').toLowerCase() === 'active');
  }, [employeesQ.data]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        String(e.full_name || '')
          .toLowerCase()
          .includes(q) ||
        String(e.department || '')
          .toLowerCase()
          .includes(q)
    );
  }, [employees, search]);

  const catalogue = useMemo(
    () => (Array.isArray(settingsQ.data?.allowance_types) ? settingsQ.data.allowance_types : []),
    [settingsQ.data]
  );

  const selectedEmployee = employees.find((e) => String(e.id) === String(employeeId));

  useEffect(() => {
    if (!allowOpen || !allowForm.allowance_name || !employeeId || editAllowId) {
      setPreviewBefore(null);
      setPreviewAfter(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const draft = {
          allowance_name: allowForm.allowance_name,
          type: allowForm.allowance_type,
          value: Number(allowForm.value || 0),
          taxable: allowForm.taxable,
        };
        const [before, after] = await Promise.all([
          hrApi.previewPayroll(previewMonth, previewYear),
          hrApi.previewPayroll(previewMonth, previewYear, {
            employee_overrides: [
              {
                employee_id: Number(employeeId),
                included: true,
                additional_allowances: [draft],
              },
            ],
          }),
        ]);
        if (cancelled) return;
        setPreviewBefore((before.items || []).find((i: any) => Number(i.employee_id) === Number(employeeId)) || null);
        setPreviewAfter((after.items || []).find((i: any) => Number(i.employee_id) === Number(employeeId)) || null);
      } catch {
        if (!cancelled) {
          setPreviewBefore(null);
          setPreviewAfter(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [allowOpen, allowForm, editAllowId, employeeId, previewMonth, previewYear]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hr', 'emp-allow'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-preview'] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-audit'] });
  };

  const applyCatalogue = (name: string, setter: typeof setAllowForm) => {
    const item = catalogue.find((c: any) => c.name === name);
    if (!item) return;
    setter((f: any) => ({
      ...f,
      catalogue: name,
      custom: false,
      allowance_name: item.name || '',
      allowance_type: item.type || 'fixed',
      value: String(item.value ?? ''),
      taxable: item.taxable !== false,
    }));
  };

  const saveAllowMut = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Select an employee first');
      const body = {
        employee_id: Number(employeeId),
        allowance_name: allowForm.allowance_name,
        allowance_type: allowForm.allowance_type,
        value: Number(allowForm.value || 0),
        taxable: allowForm.taxable,
        effective_from: allowForm.effective_from || null,
        effective_to: allowForm.effective_to || null,
      };
      if (editAllowId) return hrApi.updateEmployeeAllowance(editAllowId, body);
      return hrApi.createEmployeeAllowance(body);
    },
    onSuccess: () => {
      toast.success(editAllowId ? 'Allowance updated' : 'Allowance assigned to employee');
      invalidate();
      setAllowOpen(false);
      setAllowForm({ ...emptyAllow, effective_from: firstOfMonth() });
      setEditAllowId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAllowMut = useMutation({
    mutationFn: (id: number) => hrApi.deleteEmployeeAllowance(id),
    onSuccess: () => {
      toast.success('Allowance removed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMut = useMutation({
    mutationFn: async () => {
      if (!bulkForm.employeeIds.length) throw new Error('Select at least one employee');
      if (!bulkForm.allowance_name.trim()) throw new Error('Allowance name is required');
      const bodyBase = {
        allowance_name: bulkForm.allowance_name,
        allowance_type: bulkForm.allowance_type,
        value: Number(bulkForm.value || 0),
        taxable: bulkForm.taxable,
        effective_from: bulkForm.effective_from || null,
        effective_to: bulkForm.effective_to || null,
      };
      await Promise.all(
        bulkForm.employeeIds.map((id) =>
          hrApi.createEmployeeAllowance({ ...bodyBase, employee_id: id })
        )
      );
    },
    onSuccess: () => {
      toast.success(`Allowance assigned to ${bulkForm.employeeIds.length} employee(s)`);
      invalidate();
      if (employeeId) qc.invalidateQueries({ queryKey: ['hr', 'emp-allow', employeeId] });
      setBulkOpen(false);
      setBulkForm({
        catalogue: '',
        allowance_name: '',
        allowance_type: 'fixed',
        value: '',
        taxable: true,
        effective_from: firstOfMonth(),
        effective_to: '',
        employeeIds: [],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openAdd = () => {
    if (!employeeId) {
      toast.error('Select an employee first');
      return;
    }
    setEditAllowId(null);
    setAllowForm({ ...emptyAllow, effective_from: firstOfMonth() });
    setAllowOpen(true);
  };

  if (employeesQ.isLoading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Assign Allowances to Employees</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Choose an employee, then add from the catalogue (Settings → Allowances) or create a custom allowance.
              These stay on the employee until you remove them or set an end date.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setBulkForm({
                catalogue: '',
                allowance_name: '',
                allowance_type: 'fixed',
                value: '',
                taxable: true,
                effective_from: firstOfMonth(),
                effective_to: '',
                employeeIds: [],
              });
              setBulkOpen(true);
            }}
          >
            Assign to multiple…
          </Button>
        </div>

        {catalogue.length === 0 && (
          <p className="mt-3 rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            No catalogue types yet. Go to <strong>Settings</strong>, add allowance types (Housing, Transport, etc.), and click Save Settings — then they appear in the dropdown here.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Search employees</label>
            <input
              className={inputClass}
              placeholder="Name or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Employee</label>
            <select
              className={inputClass}
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select employee…</option>
              {filteredEmployees.map((e) => (
                <option key={e.id} value={String(e.id)}>
                  {e.full_name}
                  {e.department ? ` — ${e.department}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!employeeId ? (
        <EmptyState
          title="Select an employee"
          description="Use the dropdown above to load and manage that person’s permanent allowances."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{selectedEmployee?.full_name}</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Basic {formatGhs(selectedEmployee?.basic_salary)} · Permanent allowances for payroll
              </p>
            </div>
            <Button size="sm" onClick={openAdd}>
              Add Allowance
            </Button>
          </div>

          {allowQ.isLoading ? (
            <TableSkeleton />
          ) : (
            <table className="vobiss-table mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Allowance Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Taxable</th>
                  <th className="px-3 py-2">Effective From</th>
                  <th className="px-3 py-2">Effective To</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(allowQ.data || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-[var(--text-muted)]">
                      No allowances assigned yet. Click Add Allowance.
                    </td>
                  </tr>
                ) : (
                  (allowQ.data || []).map((a: any) => (
                    <tr key={a.id} className="border-b">
                      <td className="px-3 py-2">{a.allowance_name}</td>
                      <td className="px-3 py-2 capitalize">{a.type}</td>
                      <td className="px-3 py-2">
                        {a.type === 'percentage' ? `${a.value}%` : formatGhs(a.value)}
                      </td>
                      <td className="px-3 py-2">{a.taxable ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">
                        {a.effective_from ? String(a.effective_from).slice(0, 10) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {a.effective_to ? String(a.effective_to).slice(0, 10) : 'Permanent'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-1"
                          onClick={() => {
                            setEditAllowId(a.id);
                            setAllowForm({
                              catalogue: '',
                              custom: true,
                              allowance_name: a.allowance_name || '',
                              allowance_type: a.type || 'fixed',
                              value: String(a.value ?? ''),
                              taxable: a.taxable !== false,
                              effective_from: a.effective_from
                                ? String(a.effective_from).slice(0, 10)
                                : firstOfMonth(),
                              effective_to: a.effective_to ? String(a.effective_to).slice(0, 10) : '',
                            });
                            setAllowOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => delAllowMut.mutate(a.id)}>
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

      {/* Single employee assign / edit */}
      <Dialog open={allowOpen} onOpenChange={setAllowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editAllowId ? 'Edit Allowance' : `Add Allowance — ${selectedEmployee?.full_name || ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editAllowId && (
              <>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">
                  Select from catalogue
                </label>
                <select
                  className={inputClass}
                  value={allowForm.custom ? '__custom__' : allowForm.catalogue}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setAllowForm((f) => ({
                        ...emptyAllow,
                        custom: true,
                        effective_from: f.effective_from || firstOfMonth(),
                      }));
                    } else if (e.target.value) {
                      applyCatalogue(e.target.value, setAllowForm);
                    } else {
                      setAllowForm({ ...emptyAllow, effective_from: firstOfMonth() });
                    }
                  }}
                >
                  <option value="">Select from catalogue…</option>
                  {catalogue.map((c: any) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                      {c.type === 'percentage' ? ` (${c.value}%)` : ` (${formatGhs(c.value)})`}
                    </option>
                  ))}
                  <option value="__custom__">Add Custom Allowance</option>
                </select>
              </>
            )}
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Allowance Name</label>
            <input
              className={inputClass}
              value={allowForm.allowance_name}
              onChange={(e) => setAllowForm({ ...allowForm, allowance_name: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Type</label>
                <select
                  className={inputClass}
                  value={allowForm.allowance_type}
                  onChange={(e) => setAllowForm({ ...allowForm, allowance_type: e.target.value })}
                >
                  <option value="fixed">Fixed Amount (GHS)</option>
                  <option value="percentage">Percentage of Basic (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Value</label>
                <input
                  className={inputClass}
                  type="number"
                  value={allowForm.value}
                  onChange={(e) => setAllowForm({ ...allowForm, value: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Taxable</span>
              <Switch
                checked={allowForm.taxable}
                onCheckedChange={(on) => setAllowForm({ ...allowForm, taxable: on })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Effective From</label>
                <input
                  className={inputClass}
                  type="date"
                  value={allowForm.effective_from}
                  onChange={(e) => setAllowForm({ ...allowForm, effective_from: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">
                  Effective To (optional)
                </label>
                <input
                  className={inputClass}
                  type="date"
                  value={allowForm.effective_to}
                  onChange={(e) => setAllowForm({ ...allowForm, effective_to: e.target.value })}
                />
              </div>
            </div>
            {!editAllowId && allowForm.allowance_name && (
              <div className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  Live estimate
                </p>
                {previewLoading ? (
                  <p className="text-[var(--text-muted)]">Calculating…</p>
                ) : previewBefore && previewAfter ? (
                  <ul className="space-y-1">
                    <li>Current Gross: {formatGhs(previewBefore.gross_pay)}</li>
                    <li>New Gross: {formatGhs(previewAfter.gross_pay)}</li>
                    <li>
                      Estimated PAYE change:{' '}
                      {formatGhs(Number(previewAfter.paye || 0) - Number(previewBefore.paye || 0))}
                    </li>
                    <li className="font-semibold">
                      New Estimated Net: {formatGhs(previewAfter.net_pay)}
                    </li>
                  </ul>
                ) : (
                  <p className="text-[var(--text-muted)]">Preview unavailable</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllowOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveAllowMut.mutate()}
              disabled={!allowForm.allowance_name || saveAllowMut.isPending}
            >
              {saveAllowMut.isPending ? 'Saving…' : 'Save to employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk assign */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Allowance to Multiple Employees</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Catalogue</label>
            <select
              className={inputClass}
              value={bulkForm.catalogue || (bulkForm.allowance_name && !catalogue.some((c: any) => c.name === bulkForm.catalogue) ? '__custom__' : bulkForm.catalogue)}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setBulkForm((f) => ({
                    ...f,
                    catalogue: '__custom__',
                    allowance_name: '',
                    allowance_type: 'fixed',
                    value: '',
                    taxable: true,
                  }));
                } else if (e.target.value) {
                  const item = catalogue.find((c: any) => c.name === e.target.value);
                  if (item) {
                    setBulkForm((f) => ({
                      ...f,
                      catalogue: item.name,
                      allowance_name: item.name || '',
                      allowance_type: item.type || 'fixed',
                      value: String(item.value ?? ''),
                      taxable: item.taxable !== false,
                    }));
                  }
                }
              }}
            >
              <option value="">Select from catalogue…</option>
              {catalogue.map((c: any) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
              <option value="__custom__">Custom</option>
            </select>
            <input
              className={inputClass}
              placeholder="Allowance name"
              value={bulkForm.allowance_name}
              onChange={(e) => setBulkForm({ ...bulkForm, allowance_name: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className={inputClass}
                value={bulkForm.allowance_type}
                onChange={(e) => setBulkForm({ ...bulkForm, allowance_type: e.target.value })}
              >
                <option value="fixed">Fixed (GHS)</option>
                <option value="percentage">% of Basic</option>
              </select>
              <input
                className={inputClass}
                type="number"
                placeholder="Value"
                value={bulkForm.value}
                onChange={(e) => setBulkForm({ ...bulkForm, value: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Taxable</span>
              <Switch
                checked={bulkForm.taxable}
                onCheckedChange={(on) => setBulkForm({ ...bulkForm, taxable: on })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                type="date"
                value={bulkForm.effective_from}
                onChange={(e) => setBulkForm({ ...bulkForm, effective_from: e.target.value })}
              />
              <input
                className={inputClass}
                type="date"
                value={bulkForm.effective_to}
                onChange={(e) => setBulkForm({ ...bulkForm, effective_to: e.target.value })}
                placeholder="End date"
              />
            </div>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              Employees ({bulkForm.employeeIds.length} selected)
            </label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--border)] p-2">
              {employees.map((e) => {
                const checked = bulkForm.employeeIds.includes(Number(e.id));
                return (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(ev) => {
                        const id = Number(e.id);
                        setBulkForm((f) => ({
                          ...f,
                          employeeIds: ev.target.checked
                            ? [...f.employeeIds, id]
                            : f.employeeIds.filter((x) => x !== id),
                        }));
                      }}
                    />
                    {e.full_name}
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => bulkMut.mutate()} disabled={bulkMut.isPending}>
              {bulkMut.isPending ? 'Assigning…' : 'Assign to selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
