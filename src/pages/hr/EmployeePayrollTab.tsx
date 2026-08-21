import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { EmptyState, StatusBadge, inputClass } from './components';
import { deductionTypeLabel, estimateMonthlyDeduction } from './PayrollDeductionsTab';

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

const emptyRelief = {
  relief_key: '',
  relief_name: '',
  annual_amount: '',
  is_active: true,
  notes: '',
};

const emptyDeduction = {
  catalogue: '',
  custom: false,
  deduction_name: '',
  deduction_type: 'fixed',
  value: '',
  is_active: true,
  effective_from: firstOfMonth(),
  effective_to: '',
};

type Props = {
  employeeId: string;
  employee?: any;
  payslips: any[];
  onOpenSlip: (slip: any) => void;
};

export function EmployeePayrollTab({ employeeId, employee, payslips, onOpenSlip }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const previewMonth = new Date().getMonth() + 1;
  const previewYear = new Date().getFullYear();

  const [allowOpen, setAllowOpen] = useState(false);
  const [allowForm, setAllowForm] = useState(emptyAllow);
  const [editAllowId, setEditAllowId] = useState<number | null>(null);
  const [previewBefore, setPreviewBefore] = useState<any>(null);
  const [previewAfter, setPreviewAfter] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [reliefOpen, setReliefOpen] = useState(false);
  const [reliefForm, setReliefForm] = useState(emptyRelief);
  const [editReliefId, setEditReliefId] = useState<number | null>(null);

  const [dedOpen, setDedOpen] = useState(false);
  const [dedForm, setDedForm] = useState(emptyDeduction);
  const [editDedId, setEditDedId] = useState<number | null>(null);

  const allowQ = useQuery({
    queryKey: ['hr', 'emp-allow', employeeId],
    queryFn: () => hrApi.employeeAllowances(employeeId),
    ...HR_QUERY,
  });
  const reliefQ = useQuery({
    queryKey: ['hr', 'emp-relief', employeeId],
    queryFn: () => hrApi.employeeReliefs(employeeId),
    ...HR_QUERY,
  });
  const dedQ = useQuery({
    queryKey: ['hr', 'emp-ded', employeeId],
    queryFn: () => hrApi.employeeDeductions(employeeId),
    ...HR_QUERY,
  });
  const settingsQ = useQuery({
    queryKey: ['hr', 'payroll-settings'],
    queryFn: () => hrApi.payrollSettings(),
    ...HR_QUERY,
  });
  const loansQ = useQuery({
    queryKey: ['hr', 'advances', 'employee', employeeId],
    queryFn: () => hrApi.salaryAdvances({ employee_id: employeeId }),
    ...HR_QUERY,
  });

  const catalogue = useMemo(
    () => (Array.isArray(settingsQ.data?.allowance_types) ? settingsQ.data.allowance_types : []),
    [settingsQ.data]
  );
  const deductionCatalogue = useMemo(
    () => (Array.isArray(settingsQ.data?.deduction_types) ? settingsQ.data.deduction_types : []),
    [settingsQ.data]
  );
  const reliefDefaults = useMemo(
    () => (Array.isArray(settingsQ.data?.tax_relief_defaults) ? settingsQ.data.tax_relief_defaults : []),
    [settingsQ.data]
  );

  const basicSalary = Number(employee?.basic_salary || 0);
  const allowanceTotalEst = (allowQ.data || []).reduce((s: number, a: any) => {
    if (a.type === 'percentage') return s + (basicSalary * Number(a.value || 0)) / 100;
    return s + Number(a.value || 0);
  }, 0);
  const monthlyDedPreview = estimateMonthlyDeduction(
    dedForm.deduction_type,
    Number(dedForm.value || 0),
    basicSalary,
    allowanceTotalEst
  );

  useEffect(() => {
    if (!allowOpen || !allowForm.allowance_name) {
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
                additional_allowances: editAllowId ? [] : [draft],
              },
            ],
          }),
        ]);
        if (cancelled) return;
        const b = (before.items || []).find((i: any) => Number(i.employee_id) === Number(employeeId));
        const a = (after.items || []).find((i: any) => Number(i.employee_id) === Number(employeeId));
        setPreviewBefore(b || null);
        setPreviewAfter(a || null);
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

  const invalidatePayroll = () => {
    qc.invalidateQueries({ queryKey: ['hr', 'emp-allow', employeeId] });
    qc.invalidateQueries({ queryKey: ['hr', 'emp-relief', employeeId] });
    qc.invalidateQueries({ queryKey: ['hr', 'emp-ded', employeeId] });
    qc.invalidateQueries({ queryKey: ['hr', 'payroll-preview'] });
  };

  const saveAllowMut = useMutation({
    mutationFn: async () => {
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
      toast.success(editAllowId ? 'Allowance updated' : 'Allowance added');
      invalidatePayroll();
      setAllowOpen(false);
      setAllowForm(emptyAllow);
      setEditAllowId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delAllowMut = useMutation({
    mutationFn: (allowId: number) => hrApi.deleteEmployeeAllowance(allowId),
    onSuccess: () => {
      toast.success('Allowance removed');
      invalidatePayroll();
    },
  });

  const saveReliefMut = useMutation({
    mutationFn: async () => {
      const annual = Number(reliefForm.annual_amount || 0);
      const body = {
        employee_id: Number(employeeId),
        relief_name: reliefForm.relief_name,
        annual_amount: annual,
        monthly_amount: Math.round((annual / 12) * 100) / 100,
        is_active: reliefForm.is_active,
        notes: reliefForm.notes || null,
      };
      if (editReliefId) return hrApi.updateEmployeeRelief(editReliefId, body);
      return hrApi.createEmployeeRelief(body);
    },
    onSuccess: () => {
      toast.success(editReliefId ? 'Relief updated' : 'Relief added');
      invalidatePayroll();
      setReliefOpen(false);
      setReliefForm(emptyRelief);
      setEditReliefId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delReliefMut = useMutation({
    mutationFn: (rid: number) => hrApi.deleteEmployeeRelief(rid),
    onSuccess: () => {
      toast.success('Relief removed');
      invalidatePayroll();
    },
  });

  const saveDedMut = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        employee_id: Number(employeeId),
        deduction_name: dedForm.deduction_name,
        deduction_type: dedForm.deduction_type,
        value: Number(dedForm.value || 0),
        is_loan: false,
        is_active: dedForm.is_active,
        effective_from: dedForm.effective_from || null,
        effective_to: dedForm.effective_to || null,
      };
      if (editDedId) return hrApi.updateEmployeeDeduction(editDedId, body);
      return hrApi.createEmployeeDeduction(body);
    },
    onSuccess: () => {
      toast.success(editDedId ? 'Deduction updated' : 'Deduction added');
      invalidatePayroll();
      setDedOpen(false);
      setDedForm({ ...emptyDeduction, effective_from: firstOfMonth() });
      setEditDedId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delDedMut = useMutation({
    mutationFn: (did: number) => hrApi.deleteEmployeeDeduction(did),
    onSuccess: () => {
      toast.success('Deduction removed');
      invalidatePayroll();
    },
  });

  const applyCatalogue = (name: string) => {
    if (!name) {
      setAllowForm((f) => ({ ...f, catalogue: '', custom: true }));
      return;
    }
    const item = catalogue.find((c: any) => c.name === name);
    if (!item) return;
    setAllowForm((f) => ({
      ...f,
      catalogue: name,
      custom: false,
      allowance_name: item.name || '',
      allowance_type: item.type || 'fixed',
      value: String(item.value ?? ''),
      taxable: item.taxable !== false,
    }));
  };

  const applyReliefType = (key: string) => {
    if (key === 'custom') {
      setReliefForm((f) => ({ ...f, relief_key: 'custom', relief_name: '', annual_amount: '' }));
      return;
    }
    const item = reliefDefaults.find((r: any) => r.key === key || r.name === key);
    if (!item) return;
    setReliefForm((f) => ({
      ...f,
      relief_key: item.key || key,
      relief_name: item.name || '',
      annual_amount: String(item.annual_amount ?? ''),
    }));
  };

  const monthlyRelief = Number(reliefForm.annual_amount || 0) / 12;

  return (
    <div className="space-y-4">
      {/* Allowances */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Allowances</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Included automatically when payroll is generated.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditAllowId(null);
              setAllowForm({ ...emptyAllow, effective_from: firstOfMonth() });
              setAllowOpen(true);
            }}
          >
            Add Allowance
          </Button>
        </div>
        <table className="vobiss-table mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
              <th className="px-3 py-2">Allowance Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Taxable</th>
              <th className="px-3 py-2">Effective From</th>
              <th className="px-3 py-2">Effective To</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(allowQ.data || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-[var(--text-muted)]">
                  No allowances assigned.
                </td>
              </tr>
            ) : (
              (allowQ.data || []).map((a: any) => (
                <tr key={a.id} className="border-b">
                  <td className="px-3 py-2">{a.allowance_name}</td>
                  <td className="px-3 py-2 capitalize">{a.type}</td>
                  <td className="px-3 py-2">{a.type === 'percentage' ? `${a.value}%` : formatGhs(a.value)}</td>
                  <td className="px-3 py-2">{a.taxable ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">{a.effective_from ? String(a.effective_from).slice(0, 10) : '—'}</td>
                  <td className="px-3 py-2">{a.effective_to ? String(a.effective_to).slice(0, 10) : 'Permanent'}</td>
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
                          effective_from: a.effective_from ? String(a.effective_from).slice(0, 10) : firstOfMonth(),
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
      </div>

      {/* Tax Reliefs */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Tax Reliefs</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Reduce taxable income before PAYE is calculated.</p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditReliefId(null);
              setReliefForm(emptyRelief);
              setReliefOpen(true);
            }}
          >
            Add Relief
          </Button>
        </div>
        <table className="vobiss-table mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
              <th className="px-3 py-2">Relief Name</th>
              <th className="px-3 py-2">Annual Amount (GHS)</th>
              <th className="px-3 py-2">Monthly Equivalent</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(reliefQ.data || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-[var(--text-muted)]">
                  No tax reliefs assigned.
                </td>
              </tr>
            ) : (
              (reliefQ.data || []).map((r: any) => (
                <tr key={r.id} className="border-b">
                  <td className="px-3 py-2">{r.relief_name}</td>
                  <td className="px-3 py-2">{formatGhs(r.annual_amount)}</td>
                  <td className="px-3 py-2">{formatGhs(r.monthly_amount)}</td>
                  <td className="px-3 py-2">{r.is_active ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-1"
                      onClick={() => {
                        setEditReliefId(r.id);
                        setReliefForm({
                          relief_key: 'custom',
                          relief_name: r.relief_name || '',
                          annual_amount: String(r.annual_amount ?? ''),
                          is_active: r.is_active !== false,
                          notes: r.notes || '',
                        });
                        setReliefOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => delReliefMut.mutate(r.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Deductions */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Deductions</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Extra deductions from net pay after SSNIT and PAYE. Assign from catalogue or custom.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditDedId(null);
              setDedForm({ ...emptyDeduction, effective_from: firstOfMonth() });
              setDedOpen(true);
            }}
          >
            Add Deduction
          </Button>
        </div>
        <table className="vobiss-table mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
              <th className="px-3 py-2">Deduction Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Monthly Amount</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(dedQ.data || []).filter((d: any) => !d.is_loan).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-[var(--text-muted)]">
                  No additional deductions.
                </td>
              </tr>
            ) : (
              (dedQ.data || [])
                .filter((d: any) => !d.is_loan)
                .map((d: any) => (
                  <tr key={d.id} className="border-b">
                    <td className="px-3 py-2">{d.deduction_name}</td>
                    <td className="px-3 py-2">{deductionTypeLabel(d.deduction_type)}</td>
                    <td className="px-3 py-2">
                      {String(d.deduction_type || '').includes('percentage')
                        ? `${d.value}%`
                        : formatGhs(d.value)}
                    </td>
                    <td className="px-3 py-2">
                      {formatGhs(
                        estimateMonthlyDeduction(
                          d.deduction_type,
                          Number(d.value),
                          basicSalary,
                          allowanceTotalEst
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
                          setEditDedId(d.id);
                          setDedForm({
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
                          setDedOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => delDedMut.mutate(d.id)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Salary advances / loans */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Salary Advances / Loans</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Managed in HR → Salary Advances; recovered on payroll generate.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/hr/payroll/advances')}>
            Manage
          </Button>
        </div>
        <table className="vobiss-table mt-3 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
              <th className="px-3 py-2">Loan Amount</th>
              <th className="px-3 py-2">Monthly</th>
              <th className="px-3 py-2">Remaining</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(loansQ.data || []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-[var(--text-muted)]">
                  No loans for this employee.
                </td>
              </tr>
            ) : (
              (loansQ.data || []).map((l: any) => (
                <tr key={l.id} className="border-b">
                  <td className="px-3 py-2">{formatGhs(l.loan_amount)}</td>
                  <td className="px-3 py-2">{formatGhs(l.monthly_deduction)}</td>
                  <td className="px-3 py-2 font-semibold">{formatGhs(l.remaining_balance)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge
                      status={
                        l.status === 'settled' ? 'Fully Repaid' : l.status === 'paused' ? 'Paused' : 'Active'
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payslips */}
      {payslips.length === 0 ? (
        <EmptyState
          title="No payslips yet"
          description="Generate payroll for this month to create payslips."
          action={<Button onClick={() => navigate('/hr/payroll')}>Generate Payroll</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">PAYE</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              {payslips.map((p: any) => (
                <tr key={p.id} className="border-b">
                  <td className="px-4 py-3">
                    {p.month}/{p.year}
                  </td>
                  <td className="px-4 py-3">{formatGhs(p.gross)}</td>
                  <td className="px-4 py-3">{formatGhs(p.paye)}</td>
                  <td className="px-4 py-3 font-semibold">{formatGhs(p.net_pay)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.payroll_status} />
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          onOpenSlip(await hrApi.payslip(p.employee_id, p.month, p.year));
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Allowance modal */}
      <Dialog open={allowOpen} onOpenChange={setAllowOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editAllowId ? 'Edit Allowance' : 'Add Allowance'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editAllowId && (
              <>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Select from catalogue</label>
                <select
                  className={inputClass}
                  value={allowForm.custom ? '__custom__' : allowForm.catalogue}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setAllowForm((f) => ({ ...emptyAllow, custom: true, effective_from: f.effective_from }));
                    } else {
                      applyCatalogue(e.target.value);
                    }
                  }}
                >
                  <option value="">Select from catalogue…</option>
                  {catalogue.map((c: any) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
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
              <Switch checked={allowForm.taxable} onCheckedChange={(on) => setAllowForm({ ...allowForm, taxable: on })} />
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
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Effective To (optional)</label>
                <input
                  className={inputClass}
                  type="date"
                  value={allowForm.effective_to}
                  onChange={(e) => setAllowForm({ ...allowForm, effective_to: e.target.value })}
                />
              </div>
            </div>
            {allowForm.allowance_name && !editAllowId && (
              <div className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase text-[var(--text-muted)]">Live estimate (via payroll preview)</p>
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
                    <li className="font-semibold">New Estimated Net Pay: {formatGhs(previewAfter.net_pay)}</li>
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
              {saveAllowMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relief modal */}
      <Dialog open={reliefOpen} onOpenChange={setReliefOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editReliefId ? 'Edit Tax Relief' : 'Add Tax Relief'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editReliefId && (
              <>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Relief Type</label>
                <select
                  className={inputClass}
                  value={reliefForm.relief_key}
                  onChange={(e) => applyReliefType(e.target.value)}
                >
                  <option value="">Select relief…</option>
                  {reliefDefaults.map((r: any) => (
                    <option key={r.key || r.name} value={r.key || r.name}>
                      {r.name}
                    </option>
                  ))}
                  <option value="custom">Custom Relief</option>
                </select>
              </>
            )}
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Relief Name</label>
            <input
              className={inputClass}
              value={reliefForm.relief_name}
              onChange={(e) => setReliefForm({ ...reliefForm, relief_name: e.target.value })}
            />
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Annual Amount (GHS)</label>
            <input
              className={inputClass}
              type="number"
              value={reliefForm.annual_amount}
              onChange={(e) => setReliefForm({ ...reliefForm, annual_amount: e.target.value })}
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Monthly Amount: <span className="font-semibold">{formatGhs(monthlyRelief)}</span> (Annual ÷ 12)
            </p>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Active</span>
              <Switch
                checked={reliefForm.is_active}
                onCheckedChange={(on) => setReliefForm({ ...reliefForm, is_active: on })}
              />
            </div>
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Notes (optional)</label>
            <input
              className={inputClass}
              value={reliefForm.notes}
              onChange={(e) => setReliefForm({ ...reliefForm, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReliefOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveReliefMut.mutate()}
              disabled={!reliefForm.relief_name || saveReliefMut.isPending}
            >
              {saveReliefMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduction modal */}
      <Dialog open={dedOpen} onOpenChange={setDedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editDedId ? 'Edit Deduction' : 'Add Deduction'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editDedId && (
              <select
                className={inputClass}
                value={dedForm.custom ? '__custom__' : dedForm.catalogue}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setDedForm({ ...emptyDeduction, custom: true, effective_from: firstOfMonth() });
                  } else if (e.target.value) {
                    const item = deductionCatalogue.find((c: any) => c.name === e.target.value);
                    if (item) {
                      setDedForm((f) => ({
                        ...f,
                        catalogue: item.name,
                        custom: false,
                        deduction_name: item.name || '',
                        deduction_type: item.type || 'fixed',
                        value: String(item.value ?? ''),
                      }));
                    }
                  } else {
                    setDedForm({ ...emptyDeduction, effective_from: firstOfMonth() });
                  }
                }}
              >
                <option value="">Select from catalogue…</option>
                {deductionCatalogue.map((c: any) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
                <option value="__custom__">Add Custom</option>
              </select>
            )}
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Deduction Name</label>
            <input
              className={inputClass}
              value={dedForm.deduction_name}
              onChange={(e) => setDedForm({ ...dedForm, deduction_name: e.target.value })}
              placeholder="e.g. Union Dues"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Type</label>
                <select
                  className={inputClass}
                  value={dedForm.deduction_type}
                  onChange={(e) => setDedForm({ ...dedForm, deduction_type: e.target.value })}
                >
                  <option value="fixed">Fixed Amount (GHS)</option>
                  <option value="percentage_basic">Percentage of Basic (%)</option>
                  <option value="percentage_gross">Percentage of Gross (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Value</label>
                <input
                  className={inputClass}
                  type="number"
                  value={dedForm.value}
                  onChange={(e) => setDedForm({ ...dedForm, value: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Effective From</label>
                <input
                  className={inputClass}
                  type="date"
                  value={dedForm.effective_from}
                  onChange={(e) => setDedForm({ ...dedForm, effective_from: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)]">Effective To</label>
                <input
                  className={inputClass}
                  type="date"
                  value={dedForm.effective_to}
                  onChange={(e) => setDedForm({ ...dedForm, effective_to: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <span className="text-sm">Active</span>
              <Switch checked={dedForm.is_active} onCheckedChange={(on) => setDedForm({ ...dedForm, is_active: on })} />
            </div>
            {dedForm.deduction_name && (
              <p className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 text-sm">
                Estimated monthly deduction: <strong>{formatGhs(monthlyDedPreview)} per month</strong>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDedOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveDedMut.mutate()} disabled={!dedForm.deduction_name || saveDedMut.isPending}>
              {saveDedMut.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
