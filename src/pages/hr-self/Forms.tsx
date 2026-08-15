import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Landmark, ArrowRightLeft, MessageSquareWarning, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { hrSelfApi, SELF_FORM_TYPES, HR_SELF_QUERY } from '@/api/hrSelf';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, AttachmentLink, TruncatedReason, RequestDetailDialog } from '@/pages/hr/components';

const ICONS = [FileText, BadgeCheck, Landmark, ArrowRightLeft, MessageSquareWarning];

const HrSelfForms = () => {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, ...HR_SELF_QUERY });
  const reqQ = useQuery({ queryKey: ['hr-self', 'forms'], queryFn: hrSelfApi.formRequests, enabled: !!meQ.data, ...HR_SELF_QUERY });
  const [openType, setOpenType] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const createMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('form_type', openType || '');
      fd.append('reason', reason);
      if (openType === 'Salary Advance Request') {
        fd.append('details', JSON.stringify({ amount: Number(amount) }));
      }
      if (attachment) fd.append('attachment', attachment);
      return hrSelfApi.createFormRequest(fd);
    },
    onSuccess: () => {
      toast.success('Request submitted');
      qc.invalidateQueries({ queryKey: ['hr-self'] });
      setOpenType(null);
      setReason('');
      setAmount('');
      setAttachment(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (meQ.isLoading) return <TableSkeleton />;
  if (!meQ.data) {
    return <EmptyState title="Your HR profile hasn't been set up yet" description="Contact HR to get started." />;
  }

  return (
    <div>
      <HrPageHeader title="My Forms" description="Request letters and HR forms." />

      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Request a Form</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {SELF_FORM_TYPES.map((item, i) => {
          const Icon = ICONS[i] || FileText;
          return (
            <div key={item.type} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 text-[var(--text-secondary)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.type}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{item.description}</p>
                  <Button size="sm" className="mt-3" onClick={() => setOpenType(item.type)}>Request</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-[var(--text-primary)]">My Form Requests</h2>
      {reqQ.isLoading && !reqQ.data ? <TableSkeleton /> : (reqQ.data || []).length === 0 ? (
        <EmptyState title="No form requests yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-[var(--surface)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                <th className="px-4 py-3">Form Type</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attachment</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(reqQ.data || []).map((r: any) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b hover:bg-[var(--surface-hover)]"
                  onClick={() => setDetail(r)}
                >
                  <td className="px-4 py-3">{r.form_type}</td>
                  <td className="px-4 py-3"><TruncatedReason text={r.reason} onOpen={() => setDetail(r)} /></td>
                  <td className="px-4 py-3">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3" title={r.status === 'rejected' ? r.rejection_reason || '' : undefined}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3"><AttachmentLink url={r.attachment_url} name={r.attachment_name} /></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'approved' && r.generated_file_url && (
                      <AttachmentLink url={r.generated_file_url} name={`${r.form_type || 'letter'}.pdf`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RequestDetailDialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.form_type || 'Form request details'}
        status={detail?.status}
        rejectionReason={detail?.rejection_reason}
        reason={detail?.reason}
        attachmentUrl={detail?.attachment_url}
        attachmentName={detail?.attachment_name}
        fields={[
          { label: 'Form type', value: detail?.form_type },
          ...(detail?.form_type === 'Salary Advance Request' && detail?.details?.amount != null
            ? [{ label: 'Amount', value: formatGhs(detail.details.amount) }]
            : []),
          { label: 'Submitted', value: detail?.created_at ? new Date(detail.created_at).toLocaleString() : '—' },
        ]}
        actions={
          detail?.status === 'approved' && detail?.generated_file_url ? (
            <AttachmentLink url={detail.generated_file_url} name={`${detail.form_type || 'letter'}.pdf`} />
          ) : null
        }
      />

      <Dialog open={!!openType} onOpenChange={() => { setOpenType(null); setAttachment(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{openType}</DialogTitle></DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <Field label="Reason / details">
              <textarea className={`${inputClass} h-auto min-h-[120px] py-2`} rows={5} required value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {openType === 'Salary Advance Request' && (
              <Field label="Amount requested (GHS)">
                <input className={inputClass} type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            <Field label="Attachment (optional)">
              <input
                className={inputClass}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">Image or document, optional. Max 25MB.</p>
            </Field>
            <Button type="submit" className="w-full" disabled={createMut.isPending}>Submit</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrSelfForms;
