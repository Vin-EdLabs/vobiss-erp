import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, LayoutDashboard, Gift, MinusCircle, PlayCircle, FileText, Settings2 } from 'lucide-react';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { parseJsonArray, sumOtherDeductions, loanDeductionAmount } from '@/lib/payrollDisplay';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, YearSelect } from './components';
import { PayslipView } from '@/components/hr/PayslipView';
import { PayrollAllowancesTab } from './PayrollAllowancesTab';
import { PayrollDeductionsTab } from './PayrollDeductionsTab';
import { cn } from '@/lib/utils';
import { API_URL } from '@/lib/api';

const DEFAULT_BANDS = [
  { from: 0, to: 490, rate: 0 },
  { from: 490, to: 600, rate: 5 },
  { from: 600, to: 730, rate: 10 },
  { from: 730, to: 3730, rate: 17.5 },
  { from: 3730, to: 20125, rate: 25 },
  { from: 20125, to: null, rate: 35 },
];

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function Stepper({ status }: { status?: string | null }) {
  const steps = ['Generate', 'Review', 'Approve', 'Mark Paid'];
  const current = !status ? 0 : status === 'Draft' ? 1 : status === 'Approved' ? 2 : 3;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current || (status === 'Paid' && i <= 3);
        const active = i === current && status !== 'Paid';
        return (
          <React.Fragment key={label}>
            <div className={cn('flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold', done || active ? 'border-[var(--primary)] bg-[var(--accent-green-light)] text-[var(--success-text)]' : 'border-[var(--border)] text-[var(--text-muted)]')}>
              {done && <Check className="h-3 w-3" />}
              {label}
            </div>
            {i < steps.length - 1 && <span className="text-[var(--text-muted)]">→</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

async function downloadPayslipPdf(employeeId: number | string, month: number, year: number, name?: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/hr/payroll/employee/${employeeId}/slip/${month}/${year}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payslip-${String(name || employeeId).replace(/\s+/g, '-').toLowerCase()}-${month}-${year}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export { PayslipView };

const HrPayroll = () => {
  const qc = useQueryClient();
  const now = new Date();
  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [slip, setSlip] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [excluded, setExcluded] = useState<Record<number, boolean>>({});
  const [extras, setExtras] = useState<Record<number, { name: string; value: string; taxable: boolean }>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [allowModalOpen, setAllowModalOpen] = useState(false);
  const [allowEditIndex, setAllowEditIndex] = useState<number | null>(null);
  const [allowDraft, setAllowDraft] = useState({
    name: '',
    type: 'fixed',
    value: '',
    taxable: true,
    description: '',
  });
  const [dedModalOpen, setDedModalOpen] = useState(false);
  const [dedEditIndex, setDedEditIndex] = useState<number | null>(null);
  const [dedDraft, setDedDraft] = useState({
    name: '',
    type: 'fixed',
    value: '',
    description: '',
  });

  const period = monthLabel(month, year);
  const monthQ = useQuery({ queryKey: ['hr', 'payroll', month, year], queryFn: () => hrApi.payroll(month, year), ...HR_QUERY });
  const previewQ = useQuery({
    queryKey: ['hr', 'payroll-preview', month, year, excluded, extras],
    queryFn: () => hrApi.previewPayroll(month, year, {
      employee_overrides: Object.entries(excluded).map(([id, off]) => ({
        employee_id: Number(id),
        included: !off,
        additional_allowances: extras[Number(id)]?.name
          ? [{ allowance_name: extras[Number(id)].name, type: 'fixed', value: Number(extras[Number(id)].value || 0), taxable: extras[Number(id)].taxable }]
          : [],
      })),
    }),
    enabled: tab === 'generate',
  });
  const settingsQ = useQuery({
    queryKey: ['hr', 'payroll-settings'],
    queryFn: hrApi.payrollSettings,
    ...HR_QUERY,
  });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const savedSettingsRef = useRef<string>('');

  const payroll = monthQ.data?.payroll;
  const items = monthQ.data?.items || [];
  const totals = items.reduce((acc: any, r: any) => {
    acc.gross += Number(r.gross || 0);
    const other = sumOtherDeductions(r);
    acc.other += other;
    acc.loans += loanDeductionAmount(r);
    acc.deductions += Number(r.ssnit_employee || 0) + Number(r.paye || 0) + other;
    acc.net += Number(r.net_pay || 0);
    return acc;
  }, { gross: 0, deductions: 0, other: 0, loans: 0, net: 0 });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['hr'] });

  const generateMut = useMutation({
    mutationFn: () => hrApi.generatePayroll(month, year, {
      employee_overrides: Object.entries(excluded).map(([id, off]) => ({
        employee_id: Number(id),
        included: !off,
        additional_allowances: extras[Number(id)]?.name
          ? [{ allowance_name: extras[Number(id)].name, type: 'fixed', value: Number(extras[Number(id)].value || 0), taxable: extras[Number(id)].taxable }]
          : [],
      })),
    }),
    onSuccess: () => {
      toast.success('Payroll generated');
      invalidate();
      setConfirmOpen(false);
      setTab('overview');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const approveMut = useMutation({
    mutationFn: () => hrApi.approvePayroll(payroll.id),
    onSuccess: () => { toast.success('Payroll approved'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const paidMut = useMutation({
    mutationFn: () => hrApi.markPayrollPaid(payroll.id),
    onSuccess: () => { toast.success('Marked as paid'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSettingsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => hrApi.savePayrollSettings(body),
    onSuccess: (data) => {
      toast.success('Settings saved');
      setSettingsForm(data);
      savedSettingsRef.current = JSON.stringify(settingsSnapshot(data));
      setSettingsDirty(false);
      qc.invalidateQueries({ queryKey: ['hr', 'payroll-settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function settingsSnapshot(s: any) {
    if (!s) return '';
    return {
      ssnit_employee_rate: s.ssnit_employee_rate,
      ssnit_employer_rate: s.ssnit_employer_rate,
      tax_bands: s.tax_bands,
      tax_relief_defaults: s.tax_relief_defaults,
      allowance_types: s.allowance_types,
      deduction_types: s.deduction_types,
    };
  }

  const persistSettings = async (next: any, opts?: { silent?: boolean }) => {
    setSettingsForm(next);
    try {
      const data = await hrApi.savePayrollSettings(next);
      setSettingsForm(data);
      savedSettingsRef.current = JSON.stringify(settingsSnapshot(data));
      setSettingsDirty(false);
      await qc.invalidateQueries({ queryKey: ['hr', 'payroll-settings'] });
      if (!opts?.silent) toast.success('Saved');
      return data;
    } catch (e: any) {
      toast.error(e.message || 'Failed to save settings');
      throw e;
    }
  };

  useEffect(() => {
    if (!settingsQ.data) return;
    if (!settingsForm) {
      setSettingsForm(settingsQ.data);
      savedSettingsRef.current = JSON.stringify(settingsSnapshot(settingsQ.data));
      setSettingsDirty(false);
    }
  }, [settingsQ.data, settingsForm]);

  useEffect(() => {
    if (!settingsForm || !savedSettingsRef.current) return;
    const dirty = JSON.stringify(settingsSnapshot(settingsForm)) !== savedSettingsRef.current;
    setSettingsDirty(dirty);
  }, [settingsForm]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!settingsDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [settingsDirty]);

  const changeTab = (next: string) => {
    if (tab === 'settings' && next !== 'settings' && settingsDirty) {
      const leave = window.confirm('You have unsaved payroll settings. Leave without saving?');
      if (!leave) return;
    }
    setTab(next);
  };

  const monthSelect = (
    <div className="flex gap-2">
      <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
      </select>
      <YearSelect value={year} onChange={setYear} />
    </div>
  );

  const openSlip = async (employeeId: number) => {
    try {
      setSlip(await hrApi.payslip(employeeId, month, year));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const previewItems = previewQ.data?.items || [];
  const includedPreview = previewItems.filter((r: any) => r.included);
  const slips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r: any) => !q || String(r.full_name).toLowerCase().includes(q));
  }, [items, search]);

  const settings = settingsForm || settingsQ.data;
  const bands = settings?.tax_bands || DEFAULT_BANDS;
  const allowanceTypes = settings?.allowance_types || [];
  const deductionTypes = settings?.deduction_types || [];
  const taxReliefDefaults = settings?.tax_relief_defaults || [];

  const openAllowModal = (index: number | null = null) => {
    if (index != null && allowanceTypes[index]) {
      const a = allowanceTypes[index];
      setAllowEditIndex(index);
      setAllowDraft({
        name: a.name || '',
        type: a.type || 'fixed',
        value: String(a.value ?? ''),
        taxable: a.taxable !== false,
        description: a.description || '',
      });
    } else {
      setAllowEditIndex(null);
      setAllowDraft({ name: '', type: 'fixed', value: '', taxable: true, description: '' });
    }
    setAllowModalOpen(true);
  };

  const saveAllowDraft = async () => {
    if (!allowDraft.name.trim()) {
      toast.error('Allowance name is required');
      return;
    }
    const row = {
      name: allowDraft.name.trim(),
      type: allowDraft.type,
      value: Number(allowDraft.value || 0),
      taxable: allowDraft.taxable,
      description: allowDraft.description || '',
    };
    const next = [...allowanceTypes];
    if (allowEditIndex != null) next[allowEditIndex] = row;
    else next.push(row);
    try {
      await persistSettings({ ...settings, allowance_types: next });
      setAllowModalOpen(false);
    } catch {
      /* toast already shown */
    }
  };

  const openDedModal = (index: number | null = null) => {
    if (index != null && deductionTypes[index]) {
      const d = deductionTypes[index];
      setDedEditIndex(index);
      setDedDraft({
        name: d.name || '',
        type: d.type || 'fixed',
        value: String(d.value ?? ''),
        description: d.description || '',
      });
    } else {
      setDedEditIndex(null);
      setDedDraft({ name: '', type: 'fixed', value: '', description: '' });
    }
    setDedModalOpen(true);
  };

  const saveDedDraft = async () => {
    if (!dedDraft.name.trim()) {
      toast.error('Deduction name is required');
      return;
    }
    const row = {
      name: dedDraft.name.trim(),
      type: dedDraft.type,
      value: Number(dedDraft.value || 0),
      description: dedDraft.description || '',
    };
    const next = [...deductionTypes];
    if (dedEditIndex != null) next[dedEditIndex] = row;
    else next.push(row);
    try {
      await persistSettings({ ...settings, deduction_types: next });
      setDedModalOpen(false);
    } catch {
      /* toast already shown */
    }
  };

  const dedAppliesTo = (type: string) => {
    if (type === 'percentage_basic' || type === 'percentage') return 'Basic Salary';
    if (type === 'percentage_gross') return 'Gross Pay';
    return 'Fixed amount';
  };

  const payrollTabs = [
    { value: 'overview', label: 'Overview', hint: 'Status & totals', icon: LayoutDashboard },
    { value: 'generate', label: 'Generate', hint: 'Run this month', icon: PlayCircle },
    { value: 'payslips', label: 'Payslips', hint: 'View & download', icon: FileText },
    { value: 'allowances', label: 'Allowances', hint: 'Assign to staff', icon: Gift },
    { value: 'deductions', label: 'Deductions', hint: 'Assign to staff', icon: MinusCircle },
    { value: 'settings', label: 'Settings', hint: 'Rates & catalogues', icon: Settings2, dirty: settingsDirty },
  ] as const;

  return (
    <div>
      <HrPageHeader title="Payroll" description="Generate, review, approve, and pay Ghana PAYE + SSNIT payroll." actions={monthSelect} />
      <Tabs value={tab} onValueChange={changeTab}>
        <div className="mb-1 overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-full w-max justify-start gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-md)] sm:w-full sm:flex-wrap">
            {payrollTabs.map((t) => {
              const Icon = t.icon;
              return (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    'group relative h-auto flex-none flex-col items-start gap-0.5 rounded-[var(--radius)] px-3.5 py-2.5 text-left sm:flex-1',
                    'border border-transparent text-[var(--text-secondary)] shadow-none',
                    'hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
                    'data-[state=active]:border-[var(--primary)]/25 data-[state=active]:bg-[var(--primary)] data-[state=active]:text-white data-[state=active]:shadow-sm'
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                    <Icon className="h-3.5 w-3.5 opacity-80" />
                    {t.label}
                    {'dirty' in t && t.dirty ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 group-data-[state=active]:bg-white" title="Unsaved settings" />
                    ) : null}
                  </span>
                  <span className="hidden text-[10px] font-normal opacity-70 sm:block group-data-[state=active]:opacity-90">
                    {t.hint}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <Stepper status={payroll?.status} />
            {!payroll && (
              <div className="mt-4">
                <p className="text-sm font-semibold">Payroll for {period} has not been generated yet</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Active employees will be included using current SSNIT and PAYE settings.</p>
                <Button className="mt-4" onClick={() => setTab('generate')}>Generate Payroll</Button>
              </div>
            )}
            {payroll?.status === 'Draft' && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Gross</p><p className="text-xl font-bold">{formatGhs(totals.gross)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">SSNIT + PAYE</p><p className="text-xl font-bold">{formatGhs(totals.deductions - totals.other)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Other / Loans</p><p className="text-xl font-bold">{formatGhs(totals.other)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Net</p><p className="text-xl font-bold">{formatGhs(totals.net)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Employees</p><p className="text-xl font-bold">{items.length}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>Review and Approve</Button>
                  <Button variant="outline" onClick={() => setTab('generate')}>Regenerate</Button>
                </div>
              </div>
            )}
            {payroll?.status === 'Approved' && (
              <div className="mt-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Gross</p><p className="text-xl font-bold">{formatGhs(totals.gross)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">SSNIT + PAYE</p><p className="text-xl font-bold">{formatGhs(totals.deductions - totals.other)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Other / Loans</p><p className="text-xl font-bold">{formatGhs(totals.other)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Net</p><p className="text-xl font-bold">{formatGhs(totals.net)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Employees</p><p className="text-xl font-bold">{items.length}</p></div>
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">Approved by {payroll.approved_by_name || 'HR'} · {payroll.approved_at ? new Date(payroll.approved_at).toLocaleString() : ''}</p>
                <Button className="mt-4" onClick={() => paidMut.mutate()} disabled={paidMut.isPending}>Mark as Paid</Button>
              </div>
            )}
            {payroll?.status === 'Paid' && (
              <div className="mt-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent-green-light)] p-4">
                <StatusBadge status="Paid" />
                <p className="mt-2 text-sm">Paid {payroll.paid_at ? new Date(payroll.paid_at).toLocaleString() : ''}</p>
                <p className="mt-1 text-xl font-bold">{formatGhs(totals.net)} net · {items.length} employees</p>
              </div>
            )}
          </div>

          {monthQ.isLoading && !monthQ.data ? <TableSkeleton /> : items.length === 0 ? (
            <EmptyState title="No payroll rows" description="Generate payroll to see employee calculations." />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Basic</th>
                    <th className="px-3 py-3">Allowances</th>
                    <th className="px-3 py-3">Gross</th>
                    <th className="px-3 py-3">SSNIT Emp</th>
                    <th className="px-3 py-3">PAYE</th>
                    <th className="px-3 py-3">Other / Loans</th>
                    <th className="px-3 py-3">Net Pay</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row: any) => {
                    const other = sumOtherDeductions(row);
                    const deds = parseJsonArray(row.deduction_breakdown);
                    return (
                      <tr key={row.id} className="border-b">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={row.full_name} src={row.photo_url} size="sm" />
                            <div>
                              <div>{row.full_name}</div>
                              {deds.length > 0 && (
                                <div className="text-[11px] text-[var(--text-muted)]">
                                  {deds
                                    .map((d: any) => `${d.name || 'Deduction'} ${formatGhs(d.amount)}`)
                                    .join(' · ')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">{formatGhs(row.basic_salary)}</td>
                        <td className="px-3 py-3">{formatGhs(row.allowances)}</td>
                        <td className="px-3 py-3">{formatGhs(row.gross)}</td>
                        <td className="px-3 py-3 text-[var(--info-text)]">{formatGhs(row.ssnit_employee)}</td>
                        <td className="px-3 py-3 text-[var(--warning-text)]">{formatGhs(row.paye)}</td>
                        <td className="px-3 py-3 font-medium">{other > 0 ? formatGhs(other) : '—'}</td>
                        <td className="px-3 py-3 font-semibold text-[var(--success-text)]">{formatGhs(row.net_pay)}</td>
                        <td className="px-3 py-3">
                          <Button size="sm" variant="outline" onClick={() => openSlip(row.employee_id)}>
                            View Payslip
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-[var(--surface-secondary)] font-bold">
                    <td className="px-3 py-3">Totals</td>
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3">{formatGhs(totals.gross)}</td>
                    <td className="px-3 py-3" colSpan={2} />
                    <td className="px-3 py-3">{formatGhs(totals.other)}</td>
                    <td className="px-3 py-3">{formatGhs(totals.net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="allowances" className="mt-4">
          <PayrollAllowancesTab />
        </TabsContent>

        <TabsContent value="deductions" className="mt-4">
          <PayrollDeductionsTab />
        </TabsContent>

        <TabsContent value="generate" className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Step 1 — Employee Review</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Toggle who to include. Expand a row to add a one-off allowance or bonus for this run.</p>
            {previewQ.isLoading && !previewQ.data ? <TableSkeleton /> : (
              <div className="mt-3 overflow-x-auto">
                <table className="payroll-preview-table vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Include</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Basic</th>
                      <th className="px-3 py-2">Allowances</th>
                      <th className="px-3 py-2">Est. Gross</th>
                      <th className="px-3 py-2">Other / Loans</th>
                      <th className="px-3 py-2">Est. Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((r: any) => {
                      const other = Number(r.other_deductions || 0);
                      const deds = Array.isArray(r.deduction_breakdown) ? r.deduction_breakdown : [];
                      return (
                      <React.Fragment key={r.employee_id}>
                        <tr className="border-b">
                          <td className="px-3 py-2"><Switch checked={!excluded[r.employee_id]} onCheckedChange={(on) => setExcluded((p) => ({ ...p, [r.employee_id]: !on }))} /></td>
                          <td className="px-3 py-2">
                            <button type="button" className="font-medium" onClick={() => setExpanded(expanded === r.employee_id ? null : r.employee_id)}>{r.full_name}</button>
                          </td>
                          <td className="px-3 py-2">{r.department || '—'}</td>
                          <td className="px-3 py-2">{formatGhs(r.basic_salary)}</td>
                          <td className="px-3 py-2">{formatGhs(r.allowances)}</td>
                          <td className="px-3 py-2">{formatGhs(r.gross_pay)}</td>
                          <td className="px-3 py-2">{other > 0 ? formatGhs(other) : '—'}</td>
                          <td className="px-3 py-2 font-semibold">{formatGhs(r.net_pay)}</td>
                        </tr>
                        {expanded === r.employee_id && (
                          <tr className="border-b bg-[var(--surface-secondary)]">
                            <td colSpan={8} className="px-3 py-3">
                              <p className="text-xs font-semibold">One-off allowance for this run</p>
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <input className={inputClass} placeholder="Name (e.g. Bonus)" value={extras[r.employee_id]?.name || ''} onChange={(e) => setExtras((p) => ({ ...p, [r.employee_id]: { name: e.target.value, value: p[r.employee_id]?.value || '0', taxable: p[r.employee_id]?.taxable ?? true } }))} />
                                <input className={inputClass} type="number" placeholder="Amount" value={extras[r.employee_id]?.value || ''} onChange={(e) => setExtras((p) => ({ ...p, [r.employee_id]: { name: p[r.employee_id]?.name || '', value: e.target.value, taxable: p[r.employee_id]?.taxable ?? true } }))} />
                                <label className="flex items-center gap-2 text-sm"><Switch checked={extras[r.employee_id]?.taxable ?? true} onCheckedChange={(on) => setExtras((p) => ({ ...p, [r.employee_id]: { name: p[r.employee_id]?.name || '', value: p[r.employee_id]?.value || '0', taxable: on } }))} /> Taxable</label>
                              </div>
                              {(r.configured_allowances || []).length > 0 && (
                                <p className="mt-2 text-xs text-[var(--text-muted)]">Configured allowances: {r.configured_allowances.map((a: any) => `${a.allowance_name} ${formatGhs(a.value)}`).join(' · ')}</p>
                              )}
                              {deds.length > 0 && (
                                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                                  Deductions / loans this run:{' '}
                                  {deds.map((d: any) => `${d.name || 'Deduction'} ${formatGhs(d.amount)}`).join(' · ')}
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Step 2 — Calculation Preview</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {includedPreview.length} employees · Gross {formatGhs(previewQ.data?.totals?.gross)} · Other/Loans{' '}
              {formatGhs(previewQ.data?.totals?.other_deductions)} · Net {formatGhs(previewQ.data?.totals?.net)}
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Step 3 — Generate</h2>
            <Button className="mt-3" onClick={() => setConfirmOpen(true)} disabled={!includedPreview.length}>Generate Payroll</Button>
          </div>
        </TabsContent>

        <TabsContent value="payslips" className="mt-4 space-y-4">
          <input className={`${inputClass} max-w-sm`} placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {slips.length === 0 ? <EmptyState title="No payslips for this month" /> : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-3">Employee</th><th className="px-3 py-3">Month</th><th className="px-3 py-3">Net Pay</th><th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {slips.map((r: any) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-3 py-3">{r.full_name}</td>
                      <td className="px-3 py-3">{period}</td>
                      <td className="px-3 py-3 font-semibold">{formatGhs(r.net_pay)}</td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" onClick={() => openSlip(r.employee_id)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          {!settings ? <TableSkeleton /> : (
            <>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                <h2 className="text-sm font-semibold">SSNIT Configuration</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Employee Contribution Rate (%)">
                    <input className={inputClass} type="number" step="0.1" value={settings.ssnit_employee_rate} onChange={(e) => setSettingsForm({ ...settings, ssnit_employee_rate: Number(e.target.value) })} />
                  </Field>
                  <Field label="Employer Contribution Rate (%)">
                    <input className={inputClass} type="number" step="0.1" value={settings.ssnit_employer_rate} onChange={(e) => setSettingsForm({ ...settings, ssnit_employer_rate: Number(e.target.value) })} />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">Standard rates: Employee 5.5%, Employer 13%. Total 18.5% of basic salary. Remit to SSNIT monthly.</p>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Ghana PAYE Tax Bands</h2>
                  <Button variant="outline" size="sm" onClick={() => setSettingsForm({ ...settings, tax_bands: DEFAULT_BANDS })}>Reset to Ghana Defaults</Button>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="vobiss-table w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                        <th className="px-3 py-2">Band</th><th className="px-3 py-2">From (GHS)</th><th className="px-3 py-2">To (GHS)</th><th className="px-3 py-2">Rate %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bands.map((b: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2"><input className={inputClass} type="number" value={b.from} onChange={(e) => {
                            const next = [...bands]; next[i] = { ...b, from: Number(e.target.value) }; setSettingsForm({ ...settings, tax_bands: next });
                          }} /></td>
                          <td className="px-3 py-2"><input className={inputClass} type="number" value={b.to ?? ''} placeholder="Unlimited" onChange={(e) => {
                            const next = [...bands]; next[i] = { ...b, to: e.target.value === '' ? null : Number(e.target.value) }; setSettingsForm({ ...settings, tax_bands: next });
                          }} /></td>
                          <td className="px-3 py-2"><input className={inputClass} type="number" step="0.5" value={b.rate} onChange={(e) => {
                            const next = [...bands]; next[i] = { ...b, rate: Number(e.target.value) }; setSettingsForm({ ...settings, tax_bands: next });
                          }} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button className="mt-3" variant="outline" size="sm" onClick={() => setSettingsForm({ ...settings, tax_bands: [...bands, { from: bands[bands.length - 1]?.to || 0, to: null, rate: 0 }] })}>Add Band</Button>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Allowances Catalogue</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Saved automatically when you add or edit. Then assign on the Allowances tab.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openAllowModal(null)}>
                    Add Allowance
                  </Button>
                </div>
                <table className="mt-3 vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Allowance Name</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Default Value</th>
                      <th className="px-3 py-2">Taxable</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allowanceTypes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-[var(--text-muted)]">
                          No allowance types yet. Add Housing, Transport, Medical, etc.
                        </td>
                      </tr>
                    ) : (
                      allowanceTypes.map((a: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">
                            <div className="font-medium">{a.name || '—'}</div>
                            {a.description ? (
                              <div className="text-xs text-[var(--text-muted)]">{a.description}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 capitalize">{a.type === 'percentage' ? 'Percentage of Basic' : 'Fixed Amount'}</td>
                          <td className="px-3 py-2">
                            {a.type === 'percentage' ? `${a.value}%` : formatGhs(a.value)}
                          </td>
                          <td className="px-3 py-2">{a.taxable !== false ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Button size="sm" variant="outline" className="mr-1" onClick={() => openAllowModal(i)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const next = allowanceTypes.filter((_: any, j: number) => j !== i);
                                await persistSettings({ ...settings, allowance_types: next });
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Deductions Catalogue</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Saved automatically when you add or edit. Then assign on the Deductions tab.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openDedModal(null)}>
                    Add Deduction
                  </Button>
                </div>
                <table className="mt-3 vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Deduction Name</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Default Value</th>
                      <th className="px-3 py-2">Applies To</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionTypes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-[var(--text-muted)]">
                          No deduction types yet.
                        </td>
                      </tr>
                    ) : (
                      deductionTypes.map((d: any, i: number) => (
                        <tr key={i} className="border-b">
                          <td className="px-3 py-2">
                            <div className="font-medium">{d.name || '—'}</div>
                            {d.description ? (
                              <div className="text-xs text-[var(--text-muted)]">{d.description}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            {d.type === 'percentage_basic' || d.type === 'percentage'
                              ? '% of Basic'
                              : d.type === 'percentage_gross'
                                ? '% of Gross'
                                : 'Fixed Amount'}
                          </td>
                          <td className="px-3 py-2">
                            {String(d.type || '').includes('percentage') ? `${d.value}%` : formatGhs(d.value)}
                          </td>
                          <td className="px-3 py-2">{dedAppliesTo(d.type)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Button size="sm" variant="outline" className="mr-1" onClick={() => openDedModal(i)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const next = deductionTypes.filter((_: any, j: number) => j !== i);
                                await persistSettings({ ...settings, deduction_types: next });
                              }}
                            >
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                <h2 className="text-sm font-semibold">Tax Relief Defaults (GRA)</h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Annual amounts auto-filled when assigning reliefs on an employee profile. Editable by HR.
                </p>
                <table className="mt-3 vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Relief Name</th>
                      <th className="px-3 py-2">Annual Amount (GHS)</th>
                      <th className="px-3 py-2">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxReliefDefaults.map((r: any, i: number) => (
                      <tr key={r.key || i} className="border-b">
                        <td className="px-3 py-2">
                          <input
                            className={inputClass}
                            value={r.name || ''}
                            onChange={(e) => {
                              const next = [...taxReliefDefaults];
                              next[i] = { ...r, name: e.target.value };
                              setSettingsForm({ ...settings, tax_relief_defaults: next });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass}
                            type="number"
                            value={r.annual_amount ?? ''}
                            onChange={(e) => {
                              const next = [...taxReliefDefaults];
                              next[i] = { ...r, annual_amount: Number(e.target.value) };
                              setSettingsForm({ ...settings, tax_relief_defaults: next });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          {formatGhs(Number(r.annual_amount || 0) / 12)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => saveSettingsMut.mutate(settingsForm)}
                  disabled={saveSettingsMut.isPending || !settingsDirty}
                >
                  {saveSettingsMut.isPending ? 'Saving…' : settingsDirty ? 'Save Settings' : 'All changes saved'}
                </Button>
                {settingsDirty && (
                  <span className="text-xs text-[var(--warning-text)]">Unsaved changes to SSNIT, tax bands, or reliefs</span>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={allowModalOpen} onOpenChange={setAllowModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{allowEditIndex != null ? 'Edit Allowance Type' : 'Add Allowance Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Allowance Name</label>
              <input
                className={inputClass}
                placeholder="e.g. Housing Allowance"
                value={allowDraft.name}
                onChange={(e) => setAllowDraft({ ...allowDraft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Type</label>
                <select
                  className={inputClass}
                  value={allowDraft.type}
                  onChange={(e) => setAllowDraft({ ...allowDraft, type: e.target.value })}
                >
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage of Basic</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                  Default Value {allowDraft.type === 'percentage' ? '(%)' : '(GHS)'}
                </label>
                <input
                  className={inputClass}
                  type="number"
                  value={allowDraft.value}
                  onChange={(e) => setAllowDraft({ ...allowDraft, value: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded border border-[var(--border)] px-3 py-2">
              <div>
                <p className="text-sm font-medium">Taxable</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Yes → included in taxable income (PAYE). No → gross only.
                </p>
              </div>
              <Switch
                checked={allowDraft.taxable}
                onCheckedChange={(on) => setAllowDraft({ ...allowDraft, taxable: on })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Description (optional)</label>
              <input
                className={inputClass}
                value={allowDraft.description}
                onChange={(e) => setAllowDraft({ ...allowDraft, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllowModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveAllowDraft}>Save (auto-saves)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dedModalOpen} onOpenChange={setDedModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dedEditIndex != null ? 'Edit Deduction Type' : 'Add Deduction Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Deduction Name</label>
              <input
                className={inputClass}
                placeholder="e.g. Union Dues"
                value={dedDraft.name}
                onChange={(e) => setDedDraft({ ...dedDraft, name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Type</label>
                <select
                  className={inputClass}
                  value={dedDraft.type}
                  onChange={(e) => setDedDraft({ ...dedDraft, type: e.target.value })}
                >
                  <option value="fixed">Fixed Amount (GHS)</option>
                  <option value="percentage_basic">Percentage of Basic (%)</option>
                  <option value="percentage_gross">Percentage of Gross (%)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Default Value</label>
                <input
                  className={inputClass}
                  type="number"
                  value={dedDraft.value}
                  onChange={(e) => setDedDraft({ ...dedDraft, value: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Description (optional)</label>
              <input
                className={inputClass}
                value={dedDraft.description}
                onChange={(e) => setDedDraft({ ...dedDraft, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDedModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDedDraft}>Save (auto-saves)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate payroll for {period}?</DialogTitle></DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">{includedPreview.length} employees · Gross {formatGhs(previewQ.data?.totals?.gross)} · Net {formatGhs(previewQ.data?.totals?.net)}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>{generateMut.isPending ? 'Generating…' : 'Confirm'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!slip} onOpenChange={() => setSlip(null)}>
        <DialogContent className="max-w-2xl print:max-w-none print:border-0 print:shadow-none">
          {slip && <PayslipView slip={slip} />}
          <DialogFooter className="print:hidden">
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await downloadPayslipPdf(slip.employee_id, slip.month, slip.year, slip.full_name);
                } catch (e: any) {
                  toast.error(e.message || 'PDF download failed');
                }
              }}
            >
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrPayroll;
