import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Plus, Search, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi, HR_QUERY, type HrEmployee } from '@/api/hr';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, EmptyState, HrPageHeader, ReasonActionDialog, StatusBadge, TableSkeleton, inputClass } from './components';
import { EmployeeForm, emptyEmployeeForm, type EmployeeDocDraft } from './EmployeeForm';

const HrEmployees = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [status, setStatus] = useState('active');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyEmployeeForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [documents, setDocuments] = useState<EmployeeDocDraft[]>([]);
  const [actionEmp, setActionEmp] = useState<HrEmployee | null>(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [unsuspendOpen, setUnsuspendOpen] = useState(false);
  const [sortKey, setSortKey] = useState<keyof HrEmployee>('full_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const listQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const pendingQ = useQuery({ queryKey: ['hr', 'employees-pending'], queryFn: hrApi.pendingEmployees, ...HR_QUERY });
  const resetAddForm = () => {
    setOpen(false);
    setForm(emptyEmployeeForm);
    setPhoto(null);
    setDocuments([]);
  };

  const createMut = useMutation({
    mutationFn: async ({ fd, docs }: { fd: FormData; docs: EmployeeDocDraft[] }) => {
      const emp = await hrApi.createEmployee(fd);
      let failed = 0;
      for (const doc of docs) {
        if (!doc.file) continue;
        try {
          const docFd = new FormData();
          docFd.append('employee_id', String(emp.id));
          docFd.append('document_name', doc.document_name.trim() || doc.file.name.replace(/\.[^.]+$/, '') || 'Document');
          docFd.append('category', doc.category || 'Other');
          docFd.append('file', doc.file);
          await hrApi.uploadDocument(docFd);
        } catch {
          failed += 1;
        }
      }
      return { emp, failed, attached: docs.filter((d) => d.file).length };
    },
    onSuccess: ({ emp, failed, attached }: { emp: any; failed: number; attached: number }) => {
      if (emp?.account?.error) toast.error(`Employee saved, but account was not created: ${emp.account.error}`);
      else if (emp?.account?.emailWarning) toast.success('Employee added. Login created; welcome email could not be sent.');
      else if (emp?.account?.created) toast.success('Employee added and login created in Users with matching permissions.');
      else if (emp?.account?.linked) toast.success('Employee added and linked to an existing user.');
      else toast.success('Employee added');
      if (failed > 0) toast.error(`${failed} document${failed === 1 ? '' : 's'} could not be uploaded`);
      else if (attached > 0) toast.success(`${attached} document${attached === 1 ? '' : 's'} attached`);
      qc.invalidateQueries({ queryKey: ['hr'] });
      resetAddForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const suspendMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => hrApi.suspendEmployee(id, reason),
    onSuccess: () => {
      toast.success('Employee suspended');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setSuspendOpen(false);
      setActionEmp(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const unsuspendMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => hrApi.unsuspendEmployee(id, reason),
    onSuccess: () => {
      toast.success('Employee restored');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setUnsuspendOpen(false);
      setActionEmp(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const acceptMut = useMutation({
    mutationFn: (id: number) => hrApi.acceptEmployee(id),
    onSuccess: (emp: HrEmployee) => {
      toast.success(`${emp.full_name} is now an employee`);
      qc.invalidateQueries({ queryKey: ['hr'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const ignoreMut = useMutation({
    mutationFn: (id: number) => hrApi.ignoreEmployee(id),
    onSuccess: () => {
      toast.success('Removed from the HR queue');
      qc.invalidateQueries({ queryKey: ['hr'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    let list: HrEmployee[] = Array.isArray(listQ.data) ? listQ.data : [];
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter((e) =>
        [e.full_name, e.email, e.position, e.department].some((v) => String(v || '').toLowerCase().includes(query))
      );
    }
    if (department) list = list.filter((e) => e.department === department);
    if (employmentType) list = list.filter((e) => e.employment_type === employmentType);
    if (status) list = list.filter((e) => e.status === status);
    list = [...list].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [listQ.data, q, department, employmentType, status, sortKey, sortDir]);

  const departments = [...new Set((listQ.data || []).map((e: HrEmployee) => e.department).filter(Boolean))] as string[];

  const toggleSort = (key: keyof HrEmployee) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.start_date) {
      toast.error('Start date is required');
      return;
    }
    if (!form.gender) {
      toast.error('Please select Male or Female');
      return;
    }
    if (form.contract_end_date && form.contract_end_date < form.start_date) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (form.system_role && !form.email.trim()) {
      toast.error('Email is required when assigning a system role');
      return;
    }
    const missingFile = documents.some((d) => !d.file);
    if (missingFile) {
      toast.error('Each added document needs a file');
      return;
    }
    const fd = new FormData();
    Object.entries({ ...form, position: form.position.trim() || 'Staff' }).forEach(([k, v]) => fd.append(k, v));
    if (photo) fd.append('photo', photo);
    createMut.mutate({ fd, docs: documents });
  };

  return (
    <div>
      <HrPageHeader
        title="Employees"
        description="Directory of Vobiss staff, contracts, and profiles."
        actions={
          <Button onClick={() => setOpen((v) => !v)}>
            <Plus className="h-4 w-4" /> {open ? 'Close' : 'Add Employee'}
          </Button>
        }
      />

      {open && (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Add employee</h2>
          <EmployeeForm
            mode="add"
            form={form}
            setForm={setForm}
            photo={photo}
            setPhoto={setPhoto}
            documents={documents}
            setDocuments={setDocuments}
            submitting={createMut.isPending}
            managerNames={(listQ.data || []).map((e: HrEmployee) => e.full_name).filter(Boolean)}
            onCancel={resetAddForm}
            onSubmit={submit}
          />
        </div>
      )}

      {(pendingQ.data || []).length > 0 && (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Waiting for HR</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            New users from the Users page appear here. Accept to add them as employees, or ignore to keep them off the employee list.
          </p>
          <div className="mt-4 space-y-3">
            {(pendingQ.data || []).map((e: HrEmployee) => (
              <div key={e.id} className="vobiss-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={e.full_name} src={e.photo_url} />
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)]">{e.full_name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {[e.email, e.position || 'Staff', e.department].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={acceptMut.isPending || ignoreMut.isPending}
                    onClick={() => acceptMut.mutate(e.id)}
                  >
                    <Check className="h-4 w-4" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={acceptMut.isPending || ignoreMut.isPending}
                    onClick={() => ignoreMut.mutate(e.id)}
                  >
                    <X className="h-4 w-4" /> Ignore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 md:flex-row md:items-center shadow-[var(--shadow-md)]">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={`${inputClass} pl-9`} placeholder="Search name, email, role…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputClass} md:w-40`} value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select className={`${inputClass} md:w-40`} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
          <option value="">All types</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
        </select>
        <select className={`${inputClass} md:w-36`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {listQ.isLoading && !listQ.data ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState title="No employees found" description="Adjust filters or add your first employee." action={<Button onClick={() => setOpen(true)}>Add Employee</Button>} />
      ) : (
        <div className="vobiss-table-wrap overflow-x-auto">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                {(['full_name', 'position', 'department', 'start_date', 'employment_type', 'status'] as const).map((key) => (
                  <th key={key} className="cursor-pointer px-4 py-3" onClick={() => toggleSort(key)}>
                    {key.replace(/_/g, ' ')}
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer border-b border-slate-100" onClick={() => navigate(`/hr/employees/${e.id}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.full_name} src={e.photo_url} />
                      <div>
                        <p className="font-medium text-slate-900">{e.full_name}</p>
                        <p className="text-xs text-slate-500">{e.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{e.position || 'Staff'}</td>
                  <td className="px-4 py-3">{e.department || '—'}</td>
                  <td className="px-4 py-3">{e.start_date ? String(e.start_date).slice(0, 10) : '—'}</td>
                  <td className="px-4 py-3 capitalize">{e.employment_type}</td>
                  <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                  <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/hr/employees/${e.id}`)}>View profile</DropdownMenuItem>
                        {e.status === 'suspended' ? (
                          <DropdownMenuItem onClick={() => { setActionEmp(e); setUnsuspendOpen(true); }}>Unsuspend</DropdownMenuItem>
                        ) : e.status !== 'inactive' ? (
                          <DropdownMenuItem onClick={() => { setActionEmp(e); setSuspendOpen(true); }}>Suspend</DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReasonActionDialog
        open={suspendOpen}
        onOpenChange={(open) => { setSuspendOpen(open); if (!open) setActionEmp(null); }}
        title="Suspend employee"
        description={`${actionEmp?.full_name || 'This employee'} will still be able to sign in, but they will only see the suspension notice and a log out button.`}
        confirmLabel="Suspend"
        pending={suspendMut.isPending}
        onConfirm={(reason) => actionEmp && suspendMut.mutate({ id: actionEmp.id, reason })}
      />
      <ReasonActionDialog
        open={unsuspendOpen}
        onOpenChange={(open) => { setUnsuspendOpen(open); if (!open) setActionEmp(null); }}
        title="Restore employee"
        description={`${actionEmp?.full_name || 'This employee'} will get dashboard access again and will see this restore reason after they sign in.`}
        confirmLabel="Unsuspend"
        pending={unsuspendMut.isPending}
        onConfirm={(reason) => actionEmp && unsuspendMut.mutate({ id: actionEmp.id, reason })}
      />
    </div>
  );
};

export default HrEmployees;
