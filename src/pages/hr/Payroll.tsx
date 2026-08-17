import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, YearSelect } from './components';
import { cn } from '@/lib/utils';

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

export function PayslipView({ slip }: { slip: any }) {
  const breakdown = Array.isArray(slip.allowance_breakdown) ? slip.allowance_breakdown : [];
  return (
    <div id="payslip" className="mx-auto max-w-[640px] space-y-4 bg-[var(--surface)] p-6 print:max-w-none print:p-0">
      <div>
        <p className="text-base font-bold">VOBISS SOLUTIONS LIMITED</p>
        <p className="text-[13px] text-[var(--text-muted)]">Human Resources Department</p>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <p className="text-lg font-bold">PAYSLIP — {monthLabel(Number(slip.month), Number(slip.year))}</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <p>Employee: <span className="font-medium">{slip.full_name}</span></p>
        <p>Employee ID: <span className="font-medium">EMP-{String(slip.employee_id).padStart(3, '0')}</span></p>
        <p>Position: <span className="font-medium">{slip.position || '—'}</span></p>
        <p>Department: <span className="font-medium">{slip.department || '—'}</span></p>
        <p>Period: <span className="font-medium">{monthLabel(Number(slip.month), Number(slip.year))}</span></p>
        <p>Payment Date: <span className="font-medium">{slip.paid_at ? new Date(slip.paid_at).toLocaleDateString() : '—'}</span></p>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <div className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="font-semibold">EARNINGS</p>
          <p className="mt-2 flex justify-between"><span>Basic Salary</span>{formatGhs(slip.basic_salary)}</p>
          {breakdown.length > 0 ? breakdown.map((a: any, i: number) => (
            <p key={i} className="flex justify-between"><span>{a.name}</span>{formatGhs(a.amount)}</p>
          )) : (
            <p className="flex justify-between"><span>Allowances</span>{formatGhs(slip.allowances)}</p>
          )}
          <div className="mt-2 h-px bg-[var(--border)]" />
          <p className="mt-2 flex justify-between font-semibold"><span>Gross Pay</span>{formatGhs(slip.gross)}</p>
        </div>
        <div>
          <p className="font-semibold">DEDUCTIONS</p>
          <p className="mt-2 flex justify-between"><span>SSNIT</span>{formatGhs(slip.ssnit_employee)}</p>
          <p className="flex justify-between"><span>PAYE</span>{formatGhs(slip.paye)}</p>
          <div className="mt-2 h-px bg-[var(--border)]" />
          <p className="mt-2 flex justify-between font-semibold"><span>Total</span>{formatGhs(Number(slip.ssnit_employee || 0) + Number(slip.paye || 0))}</p>
        </div>
      </div>
      <div className="h-px bg-[var(--border)]" />
      <p className="text-xl font-bold">NET PAY: {formatGhs(slip.net_pay)}</p>
      <div className="h-px bg-[var(--border)]" />
      <p className="text-xs text-[var(--text-muted)]">SSNIT No: {slip.ssnit_number || '—'}</p>
      <p className="text-xs text-[var(--text-muted)]">This payslip is computer generated</p>
    </div>
  );
}

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
    enabled: tab === 'settings',
    ...HR_QUERY,
  });

  const payroll = monthQ.data?.payroll;
  const items = monthQ.data?.items || [];
  const totals = items.reduce((acc: any, r: any) => {
    acc.gross += Number(r.gross || 0);
    acc.deductions += Number(r.ssnit_employee || 0) + Number(r.paye || 0);
    acc.net += Number(r.net_pay || 0);
    return acc;
  }, { gross: 0, deductions: 0, net: 0 });

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
    mutationFn: () => hrApi.savePayrollSettings(settingsForm),
    onSuccess: () => { toast.success('Payroll settings saved'); qc.invalidateQueries({ queryKey: ['hr', 'payroll-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (settingsQ.data && !settingsForm) setSettingsForm(settingsQ.data);
  }, [settingsQ.data, settingsForm]);

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

  return (
    <div>
      <HrPageHeader title="Payroll" description="Generate, review, approve, and pay Ghana PAYE + SSNIT payroll." actions={monthSelect} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="generate">Generate Payroll</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

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
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Gross</p><p className="text-xl font-bold">{formatGhs(totals.gross)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Deductions</p><p className="text-xl font-bold">{formatGhs(totals.deductions)}</p></div>
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
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Gross</p><p className="text-xl font-bold">{formatGhs(totals.gross)}</p></div>
                  <div><p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Total Deductions</p><p className="text-xl font-bold">{formatGhs(totals.deductions)}</p></div>
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
                    <th className="px-3 py-3">Employee</th><th className="px-3 py-3">Basic</th><th className="px-3 py-3">Allowances</th>
                    <th className="px-3 py-3">Gross</th><th className="px-3 py-3">SSNIT Emp</th><th className="px-3 py-3">SSNIT Er</th>
                    <th className="px-3 py-3">Taxable</th><th className="px-3 py-3">PAYE</th><th className="px-3 py-3">Net Pay</th><th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row: any) => (
                    <tr key={row.id} className="border-b">
                      <td className="px-3 py-3"><div className="flex items-center gap-2"><Avatar name={row.full_name} src={row.photo_url} size="sm" />{row.full_name}</div></td>
                      <td className="px-3 py-3">{formatGhs(row.basic_salary)}</td>
                      <td className="px-3 py-3">{formatGhs(row.allowances)}</td>
                      <td className="px-3 py-3">{formatGhs(row.gross)}</td>
                      <td className="px-3 py-3 text-[var(--info-text)]">{formatGhs(row.ssnit_employee)}</td>
                      <td className="px-3 py-3 text-[var(--info-text)]">{formatGhs(row.ssnit_employer)}</td>
                      <td className="px-3 py-3">{formatGhs(row.taxable_income)}</td>
                      <td className="px-3 py-3 text-[var(--warning-text)]">{formatGhs(row.paye)}</td>
                      <td className="px-3 py-3 font-semibold text-[var(--success-text)]">{formatGhs(row.net_pay)}</td>
                      <td className="px-3 py-3"><Button size="sm" variant="outline" onClick={() => openSlip(row.employee_id)}>View Payslip</Button></td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--surface-secondary)] font-bold">
                    <td className="px-3 py-3">Totals</td>
                    <td className="px-3 py-3" /><td className="px-3 py-3" />
                    <td className="px-3 py-3">{formatGhs(totals.gross)}</td>
                    <td className="px-3 py-3" colSpan={4} />
                    <td className="px-3 py-3">{formatGhs(totals.net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="generate" className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Step 1 — Employee Review</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Toggle who to include. Expand a row to add a one-off allowance or bonus for this run.</p>
            {previewQ.isLoading && !previewQ.data ? <TableSkeleton /> : (
              <div className="mt-3 overflow-x-auto">
                <table className="vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Include</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Department</th>
                      <th className="px-3 py-2">Basic</th><th className="px-3 py-2">Allowances</th><th className="px-3 py-2">Est. Gross</th><th className="px-3 py-2">Est. Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((r: any) => (
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
                          <td className="px-3 py-2 font-semibold">{formatGhs(r.net_pay)}</td>
                        </tr>
                        {expanded === r.employee_id && (
                          <tr className="border-b bg-[var(--surface-secondary)]">
                            <td colSpan={7} className="px-3 py-3">
                              <p className="text-xs font-semibold">One-off allowance for this run</p>
                              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                                <input className={inputClass} placeholder="Name (e.g. Bonus)" value={extras[r.employee_id]?.name || ''} onChange={(e) => setExtras((p) => ({ ...p, [r.employee_id]: { name: e.target.value, value: p[r.employee_id]?.value || '0', taxable: p[r.employee_id]?.taxable ?? true } }))} />
                                <input className={inputClass} type="number" placeholder="Amount" value={extras[r.employee_id]?.value || ''} onChange={(e) => setExtras((p) => ({ ...p, [r.employee_id]: { name: p[r.employee_id]?.name || '', value: e.target.value, taxable: p[r.employee_id]?.taxable ?? true } }))} />
                                <label className="flex items-center gap-2 text-sm"><Switch checked={extras[r.employee_id]?.taxable ?? true} onCheckedChange={(on) => setExtras((p) => ({ ...p, [r.employee_id]: { name: p[r.employee_id]?.name || '', value: p[r.employee_id]?.value || '0', taxable: on } }))} /> Taxable</label>
                              </div>
                              {(r.configured_allowances || []).length > 0 && (
                                <p className="mt-2 text-xs text-[var(--text-muted)]">Configured: {r.configured_allowances.map((a: any) => `${a.allowance_name} ${formatGhs(a.value)}`).join(' · ')}</p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Step 2 — Calculation Preview</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{includedPreview.length} employees · Gross {formatGhs(previewQ.data?.totals?.gross)} · Net {formatGhs(previewQ.data?.totals?.net)}</p>
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
                <h2 className="text-sm font-semibold">Allowance Types</h2>
                <table className="mt-3 vobiss-table w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                      <th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Default Value</th><th className="px-3 py-2">Taxable</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {allowanceTypes.map((a: any, i: number) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2"><input className={inputClass} value={a.name || ''} onChange={(e) => {
                          const next = [...allowanceTypes]; next[i] = { ...a, name: e.target.value }; setSettingsForm({ ...settings, allowance_types: next });
                        }} /></td>
                        <td className="px-3 py-2">
                          <select className={inputClass} value={a.type || 'fixed'} onChange={(e) => {
                            const next = [...allowanceTypes]; next[i] = { ...a, type: e.target.value }; setSettingsForm({ ...settings, allowance_types: next });
                          }}>
                            <option value="fixed">Fixed</option>
                            <option value="percentage">%</option>
                          </select>
                        </td>
                        <td className="px-3 py-2"><input className={inputClass} type="number" value={a.value ?? ''} onChange={(e) => {
                          const next = [...allowanceTypes]; next[i] = { ...a, value: Number(e.target.value) }; setSettingsForm({ ...settings, allowance_types: next });
                        }} /></td>
                        <td className="px-3 py-2"><Switch checked={a.taxable !== false} onCheckedChange={(on) => {
                          const next = [...allowanceTypes]; next[i] = { ...a, taxable: on }; setSettingsForm({ ...settings, allowance_types: next });
                        }} /></td>
                        <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => setSettingsForm({ ...settings, allowance_types: allowanceTypes.filter((_: any, j: number) => j !== i) })}>Delete</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button className="mt-3" variant="outline" size="sm" onClick={() => setSettingsForm({ ...settings, allowance_types: [...allowanceTypes, { name: '', type: 'fixed', value: 0, taxable: true }] })}>Add Allowance Type</Button>
              </div>
              <Button onClick={() => saveSettingsMut.mutate()} disabled={saveSettingsMut.isPending}>Save Settings</Button>
            </>
          )}
        </TabsContent>
      </Tabs>

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
            <Button variant="outline" onClick={() => window.print()}>Download PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrPayroll;
