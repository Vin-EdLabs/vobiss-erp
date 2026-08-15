import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, EmptyState, Field, ReasonActionDialog, StatusBadge, TableSkeleton, inputClass, YearSelect } from './components';
import { AttendanceMonthGrid, attendanceSummary, expandApprovedLeaveDates } from './AttendanceMonthGrid';
import { DocumentPreview } from './DocumentPreview';
import { EmployeeForm, emptyEmployeeForm, type EmployeeFormValues } from './EmployeeForm';
import { EmploymentRecord } from './EmploymentRecord';

const HrEmployeeProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EmployeeFormValues>(emptyEmployeeForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [docForm, setDocForm] = useState({ document_name: '', category: 'Contract', notes: '' });
  const [docFile, setDocFile] = useState<File | null>(null);
  const [slip, setSlip] = useState<any>(null);
  const [allowForm, setAllowForm] = useState({ allowance_name: '', allowance_type: 'fixed', value: '', taxable: true });
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [unsuspendOpen, setUnsuspendOpen] = useState(false);
  const now = new Date();
  const [attMonth, setAttMonth] = useState(now.getMonth() + 1);
  const [attYear, setAttYear] = useState(now.getFullYear());

  const [tab, setTab] = useState('overview');
  const empQ = useQuery({ queryKey: ['hr', 'employee', id], queryFn: () => hrApi.employee(id!), enabled: !!id, ...HR_QUERY });
  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const leaveQ = useQuery({ queryKey: ['hr', 'emp-leave', id], queryFn: () => hrApi.employeeLeave(id!), enabled: !!id && tab === 'leave', ...HR_QUERY });
  const payQ = useQuery({ queryKey: ['hr', 'emp-pay', id], queryFn: () => hrApi.employeePayroll(id!), enabled: !!id && tab === 'payroll', ...HR_QUERY });
  const allowQ = useQuery({ queryKey: ['hr', 'emp-allow', id], queryFn: () => hrApi.employeeAllowances(id!), enabled: !!id && tab === 'payroll', ...HR_QUERY });
  const attQ = useQuery({
    queryKey: ['hr', 'emp-att', id, attMonth, attYear],
    queryFn: () => hrApi.employeeAttendance(id!, attMonth, attYear),
    enabled: !!id && tab === 'attendance',
    ...HR_QUERY,
  });
  const docsQ = useQuery({ queryKey: ['hr', 'emp-docs', id], queryFn: () => hrApi.employeeDocuments(id!), enabled: !!id, ...HR_QUERY });

  const emp = empQ.data;
  const saveMut = useMutation({
    mutationFn: (fd: FormData) => hrApi.updateEmployee(id!, fd),
    onSuccess: () => {
      toast.success('Profile updated');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setEditOpen(false);
      setPhoto(null);
      document.querySelector('.staff-main-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const suspendMut = useMutation({
    mutationFn: (reason: string) => hrApi.suspendEmployee(id!, reason),
    onSuccess: () => {
      toast.success('Employee suspended');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setSuspendOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unsuspendMut = useMutation({
    mutationFn: (reason: string) => hrApi.unsuspendEmployee(id!, reason),
    onSuccess: () => {
      toast.success('Employee restored');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setUnsuspendOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reactivateMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('status', 'active');
      return hrApi.updateEmployee(id!, fd);
    },
    onSuccess: () => {
      toast.success('Employee reactivated');
      qc.invalidateQueries({ queryKey: ['hr'] });
    },
  });
  const uploadMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('employee_id', String(id));
      Object.entries(docForm).forEach(([k, v]) => fd.append(k, v));
      if (docFile) fd.append('file', docFile);
      return hrApi.uploadDocument(fd);
    },
    onSuccess: () => {
      toast.success('Document uploaded');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setDocOpen(false);
      setDocFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addAllowMut = useMutation({
    mutationFn: () =>
      hrApi.createEmployeeAllowance({
        employee_id: Number(id),
        allowance_name: allowForm.allowance_name,
        allowance_type: allowForm.allowance_type,
        value: Number(allowForm.value || 0),
        taxable: allowForm.taxable,
      }),
    onSuccess: () => {
      toast.success('Allowance added');
      qc.invalidateQueries({ queryKey: ['hr', 'emp-allow', id] });
      setAllowForm({ allowance_name: '', allowance_type: 'fixed', value: '', taxable: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delAllowMut = useMutation({
    mutationFn: (allowId: number) => hrApi.deleteEmployeeAllowance(allowId),
    onSuccess: () => {
      toast.success('Allowance removed');
      qc.invalidateQueries({ queryKey: ['hr', 'emp-allow', id] });
    },
  });

  if (empQ.isLoading && !empQ.data) return <TableSkeleton />;
  if (!emp) return <EmptyState title="Employee not found" action={<Button onClick={() => navigate('/hr/employees')}>Back</Button>} />;

  const openEdit = () => {
    setForm({
      ...emptyEmployeeForm,
      full_name: emp.full_name || '',
      email: emp.email || '',
      phone: emp.phone || '',
      department: emp.department || '',
      position: emp.position || '',
      location: emp.location || '',
      employment_type: emp.employment_type || 'full-time',
      start_date: emp.start_date ? String(emp.start_date).slice(0, 10) : '',
      contract_end_date: emp.contract_end_date ? String(emp.contract_end_date).slice(0, 10) : '',
      basic_salary: String(emp.basic_salary || ''),
      allowances: String(emp.allowances || ''),
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      line_manager: emp.line_manager || '',
      status: emp.status || 'active',
      system_role: emp.system_role || '',
    });
    setPhoto(null);
    setEditOpen(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'status') return;
      fd.append(k, v);
    });
    if (photo) fd.append('photo', photo);
    saveMut.mutate(fd);
  };

  const docs = docsQ.data || [];
  const flags = emp.document_flags || {};
  const hasId = flags.national_id ?? docs.some((d: any) => /id|national/i.test(`${d.category} ${d.document_name}`));
  const hasContract = flags.contract ?? docs.some((d: any) => /contract/i.test(`${d.category} ${d.document_name}`));
  const hasPhoto = flags.passport_photo ?? !!emp.photo_url;
  const hasEmergency = flags.emergency_contact ?? !!(emp.emergency_contact_name && emp.emergency_contact_phone);
  const accountStatus = !emp.user_id
    ? 'No Account'
    : emp.user_status === 'inactive' || emp.status === 'inactive'
      ? 'Inactive'
      : emp.user_status === 'suspended' || emp.status === 'suspended'
        ? 'Suspended'
        : 'Active';
  const attRecords = attQ.data || [];
  const attLeaveDates = expandApprovedLeaveDates(leaveQ.data?.history || [], attYear, attMonth);
  const attSum = attendanceSummary(attRecords, attLeaveDates);
  const payslips = payQ.data || [];

  const CheckRow = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-[var(--primary)]" /> : <X className="h-4 w-4 text-[var(--text-muted)]" />}
      <span className="text-[var(--text-primary)]">{label}</span>
      <span className="text-[var(--text-muted)]">{ok ? '✓' : '✗'}</span>
    </div>
  );

  return (
    <div>
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={emp.full_name} src={emp.photo_url} size="lg" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{emp.full_name}</h1>
              <p className="text-sm text-slate-500">
                {emp.position} · {emp.department}{emp.location ? ` · ${emp.location}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={emp.status} />
                <StatusBadge status={accountStatus} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/hr/employees')}>Close</Button>
            <Button variant="outline" className="employment-print-hide" onClick={() => { setTab('overview'); window.setTimeout(() => window.print(), 80); }}>Print</Button>
            <Button variant="outline" onClick={() => (editOpen ? (setEditOpen(false), setPhoto(null)) : openEdit())}>
              {editOpen ? 'Cancel edit' : 'Edit'}
            </Button>
            {emp.status === 'suspended' ? (
              <Button onClick={() => setUnsuspendOpen(true)}>Unsuspend</Button>
            ) : emp.status === 'inactive' ? (
              <Button onClick={() => reactivateMut.mutate()}>Reactivate</Button>
            ) : (
              <Button variant="destructive" onClick={() => setSuspendOpen(true)}>Suspend</Button>
            )}
          </div>
        </div>
      </div>

      {editOpen ? (
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
          <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Edit employee</h2>
          <EmployeeForm
            mode="edit"
            form={form}
            setForm={setForm}
            photo={photo}
            setPhoto={setPhoto}
            submitting={saveMut.isPending}
            managerNames={(employeesQ.data || []).map((e: any) => e.full_name).filter((n: string) => n && n !== emp.full_name)}
            onCancel={() => { setEditOpen(false); setPhoto(null); }}
            onSubmit={save}
          />
        </div>
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          {emp.status === 'suspended' && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--accent-red-light)] p-4 employment-print-hide">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger-text)]">Suspended</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{emp.suspension_reason || 'No reason recorded.'}</p>
              {emp.suspended_at && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">Since {new Date(emp.suspended_at).toLocaleString()}</p>
              )}
            </div>
          )}
          {emp.status === 'active' && emp.unsuspend_reason && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--accent-green-light)] p-4 employment-print-hide">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success-text)]">Restored</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]">{emp.unsuspend_reason}</p>
              {emp.unsuspended_at && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">On {new Date(emp.unsuspended_at).toLocaleString()}</p>
              )}
            </div>
          )}
          <EmploymentRecord
            employee={emp}
            documents={docs}
            heading="Employment Record"
          />
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card employment-print-hide">
            <p className="mb-3 text-sm font-semibold">Document status</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <CheckRow ok={hasId} label="National ID" />
              <CheckRow ok={hasContract} label="Contract" />
              <CheckRow ok={hasPhoto} label="Passport Photo" />
              <CheckRow ok={hasEmergency} label="Emergency Contact" />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="leave">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {(leaveQ.data?.balances || []).map((b: any) => {
              const used = Number(b.used_days || 0);
              const total = Number(b.total_days || 0);
              const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-500">{b.leave_type}</p>
                  <p className="mt-1 text-lg font-semibold">{Math.max(total - used, 0)} remaining</p>
                  <p className="mb-2 text-xs text-slate-400">{used} used of {total}</p>
                  <Progress value={pct} />
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(leaveQ.data?.history || []).map((l: any) => (
                  <tr key={`${l.source}-${l.id}`} className="border-b">
                    <td className="px-4 py-3">{l.leave_type}</td>
                    <td className="px-4 py-3">{String(l.start_date).slice(0, 10)}</td>
                    <td className="px-4 py-3">{String(l.end_date).slice(0, 10)}</td>
                    <td className="px-4 py-3">{l.days}</td>
                    <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="payroll">
          <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-semibold">Allowances</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">These are included automatically when payroll is generated.</p>
            <table className="vobiss-table mt-3 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Value</th><th className="px-3 py-2">Taxable</th><th />
                </tr>
              </thead>
              <tbody>
                {(allowQ.data || []).map((a: any) => (
                  <tr key={a.id} className="border-b">
                    <td className="px-3 py-2">{a.allowance_name}</td>
                    <td className="px-3 py-2 capitalize">{a.type}</td>
                    <td className="px-3 py-2">{a.type === 'percentage' ? `${a.value}%` : formatGhs(a.value)}</td>
                    <td className="px-3 py-2">{a.taxable ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => delAllowMut.mutate(a.id)}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <input className={inputClass} placeholder="Allowance name" value={allowForm.allowance_name} onChange={(e) => setAllowForm({ ...allowForm, allowance_name: e.target.value })} />
              <select className={inputClass} value={allowForm.allowance_type} onChange={(e) => setAllowForm({ ...allowForm, allowance_type: e.target.value })}>
                <option value="fixed">Fixed</option>
                <option value="percentage">%</option>
              </select>
              <input className={inputClass} type="number" placeholder="Value" value={allowForm.value} onChange={(e) => setAllowForm({ ...allowForm, value: e.target.value })} />
              <Button onClick={() => addAllowMut.mutate()} disabled={!allowForm.allowance_name || addAllowMut.isPending}>Add</Button>
            </div>
          </div>
          {payslips.length === 0 ? (
            <EmptyState
              title="No payslips yet"
              description="Generate payroll for this month to create payslips."
              action={<Button onClick={() => navigate('/hr/payroll')}>Generate Payroll</Button>}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white">
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
                      <td className="px-4 py-3">{p.month}/{p.year}</td>
                      <td className="px-4 py-3">{formatGhs(p.gross)}</td>
                      <td className="px-4 py-3">{formatGhs(p.paye)}</td>
                      <td className="px-4 py-3 font-semibold">{formatGhs(p.net_pay)}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.payroll_status} /></td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" onClick={async () => {
                          try {
                            setSlip(await hrApi.payslip(p.employee_id, p.month, p.year));
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}>Download</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
        <TabsContent value="attendance">
          <div className="mb-4 flex flex-wrap gap-2">
            <select className={`${inputClass} w-36`} value={attMonth} onChange={(e) => setAttMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
            <YearSelect value={attYear} onChange={setAttYear} />
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Present {attSum.present} | Absent {attSum.absent} | Late {attSum.late} | Leave {attSum.leave}
          </p>
          {attQ.isLoading && !attQ.data ? <TableSkeleton /> : <AttendanceMonthGrid year={attYear} month={attMonth} records={attRecords} leaveDates={attLeaveDates} />}
        </TabsContent>
        <TabsContent value="documents">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setDocOpen(true)}>Upload new document</Button>
          </div>
          {docs.length === 0 ? (
            <EmptyState title="No documents" action={<Button onClick={() => setDocOpen(true)}>Upload document</Button>} />
          ) : (
            <div className="rounded-xl border bg-white">
              <Accordion type="single" collapsible>
                {docs.map((d: any) => (
                  <AccordionItem key={d.id} value={String(d.id)} className="px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex w-full flex-wrap items-center gap-3 pr-3 text-left">
                        <span className="text-sm font-medium">{d.document_name}</span>
                        <span className="text-xs text-slate-500">{d.category}</span>
                        <span className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pb-2">
                        <DocumentPreview fileUrl={d.file_url} documentName={d.document_name} />
                        <Button size="sm" variant="outline" onClick={() => delDocMut.mutate(d.id)}>Delete</Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </TabsContent>
      </Tabs>
      )}

      <ReasonActionDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title="Suspend employee"
        description={`${emp.full_name} will still be able to sign in, but they will only see this suspension notice and a log out button.`}
        confirmLabel="Suspend"
        pending={suspendMut.isPending}
        onConfirm={(reason) => suspendMut.mutate(reason)}
      />
      <ReasonActionDialog
        open={unsuspendOpen}
        onOpenChange={setUnsuspendOpen}
        title="Restore employee"
        description={`${emp.full_name} will get dashboard access again and will see this restore reason after they sign in.`}
        confirmLabel="Unsuspend"
        pending={unsuspendMut.isPending}
        onConfirm={(reason) => unsuspendMut.mutate(reason)}
      />

      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); uploadMut.mutate(); }}>
            <Field label="Name"><input className={inputClass} required value={docForm.document_name} onChange={(e) => setDocForm({ ...docForm, document_name: e.target.value })} /></Field>
            <Field label="Category">
              <select className={inputClass} value={docForm.category} onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}>
                {['Contract', 'ID', 'Certificate', 'Offer Letter', 'Warning Letter', 'Other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="File"><input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} /></Field>
            <Button type="submit" className="w-full" disabled={uploadMut.isPending}>Upload</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!slip} onOpenChange={() => setSlip(null)}>
        <DialogContent className="max-w-lg print:shadow-none">
          {slip && (
            <div className="space-y-3">
              <DialogHeader><DialogTitle>Payslip — {slip.month}/{slip.year}</DialogTitle></DialogHeader>
              <p className="text-sm">{slip.full_name}</p>
              <p className="text-sm">Net {formatGhs(slip.net_pay)}</p>
              <Button onClick={() => window.print()}>Print / Download</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrEmployeeProfile;
