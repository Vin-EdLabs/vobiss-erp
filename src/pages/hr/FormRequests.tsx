import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrApi, HR_QUERY } from '@/api/hr';
import { formatGhs } from '@/lib/taxCalculations';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass } from './components';
import { DocumentPreview } from './DocumentPreview';

const HrFormRequests = () => {
  const qc = useQueryClient();
  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const [filters, setFilters] = useState({ status: '', department: '' });
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const listQ = useQuery({
    queryKey: ['hr', 'form-requests'],
    queryFn: () => hrApi.formRequests(),
    ...HR_QUERY,
  });
  const rows = useMemo(() => {
    let list = listQ.data || [];
    if (filters.status) list = list.filter((r: any) => String(r.status).toLowerCase() === filters.status);
    if (filters.department) list = list.filter((r: any) => r.department === filters.department);
    return list;
  }, [listQ.data, filters]);

  const reviewMut = useMutation({
    mutationFn: ({ id, status, rejection_reason }: { id: number; status: string; rejection_reason?: string }) =>
      hrApi.reviewFormRequest(id, { status, rejection_reason }),
    onSuccess: () => {
      toast.success('Request updated');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setRejectId(null);
      setRejectReason('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const departments = useMemo(
    () => [...new Set((employeesQ.data || []).map((e: any) => e.department).filter(Boolean))],
    [employeesQ.data]
  );

  return (
    <div>
      <HrPageHeader title="Form Requests" description="Review employee letters, advances, transfers, and grievances." />
      <div className="mb-4 grid gap-3 rounded-xl border bg-[var(--surface)] p-3 md:grid-cols-2">
        <select className={inputClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className={inputClass} value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
          <option value="">All departments</option>
          {departments.map((d: string) => <option key={d}>{d}</option>)}
        </select>
      </div>

      {listQ.isLoading && !listQ.data ? <TableSkeleton /> : rows.length === 0 ? (
        <EmptyState title="No form requests" />
      ) : (
        <div className="rounded-xl border bg-[var(--surface)]">
          <Accordion type="single" collapsible className="w-full">
            {rows.map((r: any) => (
              <AccordionItem key={r.id} value={String(r.id)} className="px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="grid w-full grid-cols-1 gap-1 pr-4 text-left sm:grid-cols-5 sm:items-center">
                    <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      <Avatar name={r.full_name} src={r.photo_url} size="sm" />
                      {r.full_name || '—'}
                    </span>
                    <span className="text-sm text-[var(--text-secondary)]">{r.form_type}</span>
                    <span className="text-xs text-[var(--text-muted)]">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</span>
                    <span><StatusBadge status={r.status} /></span>
                    <span className="text-xs text-[var(--text-secondary)]">{r.attachment_url || r.generated_file_url ? 'Has document' : 'No document'}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-3" onClick={(e) => e.stopPropagation()}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Reason / details</p>
                        <div className="whitespace-pre-wrap break-words rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm text-[var(--text-primary)]">
                          {r.reason || '—'}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {r.form_type === 'Salary Advance Request' && r.details?.amount != null && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Amount</p>
                            <p className="mt-1 text-sm text-[var(--text-primary)]">{formatGhs(r.details.amount)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Department</p>
                          <p className="mt-1 text-sm text-[var(--text-primary)]">{r.department || '—'}</p>
                        </div>
                      </div>
                    </div>
                    {r.rejection_reason && (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">Rejection reason</p>
                        <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{r.rejection_reason}</p>
                      </div>
                    )}
                    {r.attachment_url && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Attachment</p>
                        <DocumentPreview fileUrl={r.attachment_url} documentName={r.attachment_name} />
                      </div>
                    )}
                    {r.generated_file_url && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Generated letter</p>
                        <DocumentPreview fileUrl={r.generated_file_url} documentName={`${r.form_type || 'letter'}.pdf`} />
                      </div>
                    )}
                    {r.status === 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => reviewMut.mutate({ id: r.id, status: 'approved' })}>Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => setRejectId(r.id)}>Reject</Button>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      <Dialog open={rejectId != null} onOpenChange={() => setRejectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject form request</DialogTitle></DialogHeader>
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

export default HrFormRequests;
