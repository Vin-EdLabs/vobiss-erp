import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { countWeekdays, hrSelfApi, SELF_LEAVE_TYPES, HR_SELF_QUERY } from '@/api/hrSelf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, AttachmentLink, TruncatedReason, RequestDetailDialog } from '@/pages/hr/components';

const HrSelfLeave = () => {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, ...HR_SELF_QUERY });
  const balQ = useQuery({ queryKey: ['hr-self', 'leave-bal'], queryFn: hrSelfApi.leaveBalances, enabled: !!meQ.data, ...HR_SELF_QUERY });
  const reqQ = useQuery({ queryKey: ['hr-self', 'leave-req'], queryFn: hrSelfApi.leaveRequests, enabled: !!meQ.data, ...HR_SELF_QUERY });
  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const days = countWeekdays(form.start_date, form.end_date);
  const balances = balQ.data || [];
  const selectedBal = balances.find((b: any) => b.leave_type === form.leave_type);
  const remaining = selectedBal ? Math.max(Number(selectedBal.total_days) - Number(selectedBal.used_days), 0) : 0;
  const insufficient = form.leave_type !== 'Unpaid' && days > 0 && days > remaining;
  const reasonRequired = ['Sick', 'Emergency', 'Unpaid'].includes(form.leave_type);

  const createMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('leave_type', form.leave_type);
      fd.append('start_date', form.start_date);
      fd.append('end_date', form.end_date);
      fd.append('reason', form.reason);
      if (attachment) fd.append('attachment', attachment);
      return hrSelfApi.createLeaveRequest(fd);
    },
    onSuccess: () => {
      toast.success('Leave request submitted');
      qc.invalidateQueries({ queryKey: ['hr-self'] });
      setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
      setAttachment(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => hrSelfApi.cancelLeaveRequest(id),
    onSuccess: () => {
      toast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['hr-self'] });
      setCancelId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const history = reqQ.data || [];

  if (meQ.isLoading) return <TableSkeleton />;
  if (!meQ.data) {
    return <EmptyState title="Your HR profile hasn't been set up yet" description="Contact HR to get started." />;
  }

  return (
    <div>
      <HrPageHeader title="Leave Request" description="Apply for leave and track your requests." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Apply for Leave</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (insufficient) return toast.error(`Insufficient balance. You have ${remaining} day(s) remaining.`);
                createMut.mutate();
              }}
            >
              <Field label="Leave Type">
                <select className={inputClass} value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
                  {SELF_LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date"><input className={inputClass} type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
                <Field label="End Date"><input className={inputClass} type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></Field>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">{days} working day(s) (weekends excluded)</p>
              {insufficient && <p className="text-xs text-[var(--text-secondary)]">Insufficient balance — {remaining} day(s) remaining.</p>}
              <Field label={reasonRequired ? 'Reason (required)' : 'Reason (optional)'}>
                <textarea className={`${inputClass} h-auto min-h-[120px] py-2`} rows={5} required={reasonRequired} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
              <Field label="Attachment (optional)">
                <input
                  className={inputClass}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">Image or document, optional. Max 25MB.</p>
              </Field>
              <Button type="submit" className="w-full" disabled={createMut.isPending || insufficient}>Submit request</Button>
            </form>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Leave balances</h2>
            <div className="mt-3 space-y-3">
              {balances.map((b: any) => {
                const used = Number(b.used_days || 0);
                const total = Number(b.total_days || 0);
                const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
                return (
                  <div key={b.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--text-primary)]">{b.leave_type}</span>
                      <span className="text-[var(--text-secondary)]">{used} of {total} days used</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">My Leave History</h2>
          {reqQ.isLoading && !reqQ.data ? <TableSkeleton rows={4} /> : history.length === 0 ? (
            <EmptyState title="No leave requests yet" />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">From</th>
                    <th className="px-3 py-2">To</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Attachment</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r: any) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b hover:bg-[var(--surface-hover)]"
                      onClick={() => setDetail(r)}
                    >
                      <td className="px-3 py-2">{r.leave_type}</td>
                      <td className="px-3 py-2">{String(r.start_date).slice(0, 10)}</td>
                      <td className="px-3 py-2">{String(r.end_date).slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.days}</td>
                      <td className="px-3 py-2"><TruncatedReason text={r.reason} onOpen={() => setDetail(r)} /></td>
                      <td className="px-3 py-2" title={r.status === 'rejected' ? r.rejection_reason || '' : undefined}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2"><AttachmentLink url={r.attachment_url} name={r.attachment_name} /></td>
                      <td className="px-3 py-2">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {r.status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => setCancelId(r.id)}>Cancel</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
          { label: 'Leave type', value: detail?.leave_type },
          { label: 'Days', value: detail?.days },
          { label: 'From', value: detail?.start_date ? String(detail.start_date).slice(0, 10) : '—' },
          { label: 'To', value: detail?.end_date ? String(detail.end_date).slice(0, 10) : '—' },
          { label: 'Submitted', value: detail?.created_at ? new Date(detail.created_at).toLocaleString() : '—' },
        ]}
        actions={
          detail?.status === 'pending' ? (
            <Button size="sm" variant="outline" onClick={() => { setCancelId(detail.id); setDetail(null); }}>Cancel request</Button>
          ) : null
        }
      />

      <Dialog open={cancelId != null} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel leave request?</DialogTitle></DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">This pending request will be withdrawn.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelId(null)}>Keep</Button>
            <Button variant="destructive" disabled={cancelMut.isPending} onClick={() => cancelId && cancelMut.mutate(cancelId)}>Cancel request</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrSelfLeave;
