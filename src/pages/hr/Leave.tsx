import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, AttachmentLink, TruncatedReason, RequestDetailDialog, YearSelect } from './components';

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Unpaid'];

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
}

function leaveMatchKey(row: any) {
  return [row.employee_id, row.leave_type, String(row.start_date || '').slice(0, 10), String(row.end_date || '').slice(0, 10)].join('|');
}

function leaveRank(row: any) {
  const status = String(row.status || '').toLowerCase();
  const start = String(row.start_date || '').slice(0, 10);
  const end = String(row.end_date || '').slice(0, 10);
  const today = todayIso();
  if (status === 'pending') return 0;
  if (status === 'approved' && start && end && start <= today && end >= today) return 1;
  if (status === 'approved' && start > today) return 2;
  return 3;
}

function weekdayCount(start: string, end: string) {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  let n = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return n;
}

const HrLeave = () => {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filters, setFilters] = useState({ employee_id: '', leave_type: '', status: '' });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employee_id: '',
    leave_type: 'Annual',
    start_date: '',
    end_date: '',
    notes: '',
    status: 'Approved',
  });
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detail, setDetail] = useState<any | null>(null);

  const [leaveTab, setLeaveTab] = useState('applications');
  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const leaveQ = useQuery({
    queryKey: ['hr', 'leave'],
    queryFn: () => hrApi.leave(),
    ...HR_QUERY,
  });
  const balQ = useQuery({
    queryKey: ['hr', 'leave-bal', year],
    queryFn: () => hrApi.leaveBalances(year),
    enabled: leaveTab === 'balances',
    ...HR_QUERY,
  });
  const calQ = useQuery({
    queryKey: ['hr', 'leave-cal', month, year],
    queryFn: () => hrApi.leaveCalendar(month, year),
    enabled: leaveTab === 'calendar',
    ...HR_QUERY,
  });
  const reqQ = useQuery({
    queryKey: ['hr', 'leave-requests'],
    queryFn: () => hrApi.leaveRequests(),
    ...HR_QUERY,
  });
  const pendingCount = (reqQ.data || []).filter((r: any) => String(r.status).toLowerCase() === 'pending').length;
  const allRows = useMemo(() => {
    const requests = (reqQ.data || []).map((r: any) => ({
      ...r,
      source: 'request',
      reason: r.reason,
      status: String(r.status || '').toLowerCase(),
    }));
    const approvedKeys = new Set(
      requests
        .filter((r: any) => r.status === 'approved')
        .map(leaveMatchKey)
    );
    const records = (leaveQ.data || [])
      .filter((r: any) => !approvedKeys.has(leaveMatchKey(r)))
      .map((r: any) => ({
        ...r,
        source: 'record',
        reason: r.notes,
        status: String(r.status || '').toLowerCase(),
      }));
    let list = [...requests, ...records];
    if (filters.employee_id) list = list.filter((r: any) => String(r.employee_id) === String(filters.employee_id));
    if (filters.leave_type) list = list.filter((r: any) => r.leave_type === filters.leave_type);
    if (filters.status) list = list.filter((r: any) => String(r.status).toLowerCase() === filters.status);
    list.sort((a: any, b: any) => {
      const rank = leaveRank(a) - leaveRank(b);
      if (rank) return rank;
      return String(b.created_at || b.start_date || '').localeCompare(String(a.created_at || a.start_date || ''));
    });
    return list;
  }, [reqQ.data, leaveQ.data, filters]);

  const createMut = useMutation({
    mutationFn: () => hrApi.createLeave({ ...form, employee_id: Number(form.employee_id), days: weekdayCount(form.start_date, form.end_date) }),
    onSuccess: () => {
      toast.success('Leave recorded');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reviewMut = useMutation({
    mutationFn: ({ id, status, rejection_reason }: { id: number; status: string; rejection_reason?: string }) =>
      hrApi.reviewLeaveRequest(id, { status, rejection_reason }),
    onSuccess: () => {
      toast.success('Request updated');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setRejectId(null);
      setRejectReason('');
      setDetail(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => hrApi.updateLeave(id, { status }),
    onSuccess: () => {
      toast.success('Leave updated');
      qc.invalidateQueries({ queryKey: ['hr'] });
    },
  });

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const leavesOnDay = (day: number) => {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return (calQ.data?.leaves || []).filter((l: any) => String(l.start_date).slice(0, 10) <= iso && String(l.end_date).slice(0, 10) >= iso);
  };

  const balanceRows = useMemo(() => {
    const map = new Map<number, any>();
    for (const row of balQ.data || []) {
      if (!map.has(row.employee_id)) {
        map.set(row.employee_id, { employee_id: row.employee_id, full_name: row.full_name, department: row.department, types: {} });
      }
      map.get(row.employee_id).types[row.leave_type] = row;
    }
    return [...map.values()];
  }, [balQ.data]);

  return (
    <div>
      <HrPageHeader
        title="Leave Management"
        description="Record leave, track balances, and see who is out."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Leave Record</Button>}
      />

      <Tabs value={leaveTab} onValueChange={setLeaveTab}>
        <TabsList>
          <TabsTrigger value="applications">Applications{pendingCount > 0 ? ` (${pendingCount})` : ''}</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="applications">
          <div className="mb-4 grid gap-3 rounded-xl border bg-white p-3 shadow-card md:grid-cols-3">
            <select className={inputClass} value={filters.employee_id} onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}>
              <option value="">All employees</option>
              {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <select className={inputClass} value={filters.leave_type} onChange={(e) => setFilters({ ...filters, leave_type: e.target.value })}>
              <option value="">All types</option>
              {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          {(reqQ.isLoading || leaveQ.isLoading) && !reqQ.data && !leaveQ.data ? <TableSkeleton /> : allRows.length === 0 ? (
            <EmptyState title="No leave records" action={<Button onClick={() => setOpen(true)}>Add Leave Record</Button>} />
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white shadow-card">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Attachment</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r: any) => (
                    <tr
                      key={`${r.source}-${r.id}`}
                      className="cursor-pointer border-b hover:bg-[var(--surface-hover)]"
                      onClick={() => setDetail(r)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2"><Avatar name={r.full_name} src={r.photo_url} size="sm" /><span>{r.full_name}</span></div>
                      </td>
                      <td className="px-4 py-3">{r.leave_type}</td>
                      <td className="px-4 py-3">{String(r.start_date).slice(0, 10)}</td>
                      <td className="px-4 py-3">{String(r.end_date).slice(0, 10)}</td>
                      <td className="px-4 py-3">{r.days}</td>
                      <td className="px-4 py-3"><TruncatedReason text={r.reason} onOpen={() => setDetail(r)} /></td>
                      <td className="px-4 py-3"><AttachmentLink url={r.attachment_url} name={r.attachment_name} /></td>
                      <td className="px-4 py-3">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3" title={r.rejection_reason || ''}><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {r.status === 'pending' && r.source === 'request' && (
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => reviewMut.mutate({ id: r.id, status: 'approved' })}>Approve</Button>
                            <Button size="sm" variant="destructive" onClick={() => setRejectId(r.id)}>Reject</Button>
                          </div>
                        )}
                        {r.status === 'pending' && r.source === 'record' && (
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => statusMut.mutate({ id: r.id, status: 'Approved' })}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: r.id, status: 'Rejected' })}>Reject</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="balances">
          <div className="overflow-x-auto rounded-xl border bg-white shadow-card">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Employee</th>
                  {LEAVE_TYPES.map((t) => <th key={t} className="px-4 py-3">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {balanceRows.map((row) => (
                  <tr key={row.employee_id} className="border-b">
                    <td className="px-4 py-3 font-medium">{row.full_name}</td>
                    {LEAVE_TYPES.map((t) => {
                      const b = row.types[t];
                      return (
                        <td key={t} className="px-4 py-3 text-slate-600">
                          {b ? `${Math.max(b.total_days - b.used_days, 0)} / ${b.total_days}` : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="mb-4 flex gap-2">
            <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
            <YearSelect value={year} onChange={setYear} />
          </div>
          <div className="grid grid-cols-7 gap-2 rounded-xl border bg-white p-4 shadow-card">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500">{d}</div>
            ))}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const people = leavesOnDay(day);
              const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              return (
                <button key={day} type="button" onClick={() => setDayDetail(iso)} className="min-h-[84px] rounded-lg border border-slate-100 p-2 text-left hover:border-sky-200 hover:bg-sky-50/50">
                  <div className="text-xs font-semibold">{day}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {people.slice(0, 3).map((p: any) => (
                      <span key={p.id} className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-800">{p.full_name.split(' ')[0]}</span>
                    ))}
                    {people.length > 3 && <span className="text-[10px] text-slate-500">+{people.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
          {dayDetail && (
            <div className="mt-4 rounded-xl border bg-white p-4">
              <p className="text-sm font-semibold">On leave {dayDetail}</p>
              <div className="mt-2 space-y-2">
                {leavesOnDay(Number(dayDetail.slice(-2))).length === 0 && <p className="text-sm text-slate-500">Nobody on leave.</p>}
                {leavesOnDay(Number(dayDetail.slice(-2))).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={p.full_name} src={p.photo_url} size="sm" />
                    <span>{p.full_name}</span>
                    <StatusBadge status={p.leave_type} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add leave record</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
            <Field label="Employee">
              <select className={inputClass} required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select…</option>
                {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </Field>
            <Field label="Leave type">
              <select className={inputClass} value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                {LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start"><input className={inputClass} type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
              <Field label="End"><input className={inputClass} type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
            </div>
            <p className="text-xs text-slate-500">{weekdayCount(form.start_date, form.end_date)} working day(s)</p>
            <Field label="Notes"><textarea className={`${inputClass} h-auto min-h-[96px] py-2`} rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Approved</option>
                <option>Pending</option>
                <option>Rejected</option>
              </select>
            </Field>
            <Button type="submit" className="w-full" disabled={createMut.isPending}>Save record</Button>
          </form>
        </DialogContent>
      </Dialog>

      <RequestDetailDialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Leave request details"
        status={detail?.status}
        rejectionReason={detail?.rejection_reason}
        reason={detail?.reason}
        attachmentUrl={detail?.attachment_url}
        attachmentName={detail?.attachment_name}
        fields={[
          { label: 'Employee', value: detail?.full_name },
          { label: 'Department', value: detail?.department },
          { label: 'Leave type', value: detail?.leave_type },
          { label: 'Days', value: detail?.days },
          { label: 'From', value: detail?.start_date ? String(detail.start_date).slice(0, 10) : '—' },
          { label: 'To', value: detail?.end_date ? String(detail.end_date).slice(0, 10) : '—' },
          { label: 'Submitted', value: detail?.created_at ? new Date(detail.created_at).toLocaleString() : '—' },
        ]}
        actions={
          detail?.status === 'pending' && detail?.source === 'request' ? (
            <>
              <Button size="sm" onClick={() => reviewMut.mutate({ id: detail.id, status: 'approved' })} disabled={reviewMut.isPending}>Approve</Button>
              <Button size="sm" variant="destructive" onClick={() => { setRejectId(detail.id); setDetail(null); }}>Reject</Button>
            </>
          ) : detail?.status === 'pending' && detail?.source === 'record' ? (
            <>
              <Button size="sm" onClick={() => statusMut.mutate({ id: detail.id, status: 'Approved' })} disabled={statusMut.isPending}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: detail.id, status: 'Rejected' })} disabled={statusMut.isPending}>Reject</Button>
            </>
          ) : null
        }
      />

      <Dialog open={rejectId != null} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject leave request</DialogTitle></DialogHeader>
          <Field label="Rejection reason">
            <textarea className={`${inputClass} h-auto min-h-[96px] py-2`} rows={4} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </Field>
          <Button
            variant="destructive"
            disabled={!rejectReason.trim() || reviewMut.isPending}
            onClick={() => rejectId && reviewMut.mutate({ id: rejectId, status: 'rejected', rejection_reason: rejectReason })}
          >
            Reject
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrLeave;
