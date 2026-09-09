import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, HrPageHeader, StatusBadge, TableSkeleton } from '@/pages/hr/components';
import { leaveSelfApi, LEAVE_QUERY, downloadLeavePdf } from '@/api/leave';
import { LeaveRequestForm } from '@/components/hr/Leave/LeaveRequestForm';
import { LeaveApprovalCard } from '@/components/hr/Leave/LeaveApprovalCard';
import { LeaveStatusTracker } from '@/components/hr/Leave/LeaveStatusTracker';
import { LeaveHistoryTable } from '@/components/hr/Leave/LeaveHistoryTable';
import { LeaveFullDetails } from '@/components/hr/Leave/LeaveFullDetails';
import { toast } from 'sonner';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ACTION_LABEL: Record<string, string> = {
  confirmed: 'You confirmed (reliever)', approved: 'You approved', declined: 'You declined', acknowledged: 'You acknowledged',
};

/** Fetches and renders one request's full inline detail — same design used everywhere else in
 *  Leave, embedded (no popup) inside this row's accordion. Read-only here: these are requests
 *  the viewer submitted or already acted on, not ones awaiting their action. */
function LeaveHistoryExpandedDetail({ id }: { id: number }) {
  const detailQ = useQuery({
    queryKey: ['leave', 'detail', 'self', id],
    queryFn: () => leaveSelfApi.requestDetail(id),
    ...LEAVE_QUERY,
  });
  const downloadPdf = async () => {
    try {
      await downloadLeavePdf(id, 'self');
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download PDF');
    }
  };
  if (detailQ.isLoading || !detailQ.data) {
    return <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--surface-secondary)]" />;
  }
  return (
    <div className="space-y-4">
      <LeaveStatusTracker request={detailQ.data} />
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <LeaveFullDetails request={detailQ.data} />
      </div>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">History</h4>
        <LeaveHistoryTable history={detailQ.data.history || []} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadPdf}>
          <Download className="mr-1 h-4 w-4" /> Download PDF
        </Button>
      </div>
    </div>
  );
}

const HrSelfLeave = () => {
  const qc = useQueryClient();
  const { id: targetIdParam } = useParams();
  const targetId = targetIdParam ? Number(targetIdParam) : null;
  const [myExpanded, setMyExpanded] = useState<number | null>(targetId);
  const [actedExpanded, setActedExpanded] = useState<number | null>(targetId);

  const pendingQ = useQuery({ queryKey: ['leave', 'pending-on-me'], queryFn: leaveSelfApi.pendingOnMe, ...LEAVE_QUERY });
  const myRequestsQ = useQuery({ queryKey: ['leave', 'my-requests'], queryFn: leaveSelfApi.myRequests, ...LEAVE_QUERY });
  const actedQ = useQuery({ queryKey: ['leave', 'acted-by-me'], queryFn: leaveSelfApi.actedByMe, ...LEAVE_QUERY });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['leave'] });
  };

  // Leave notifications arrive over the same live socket channel every other HR feature uses —
  // when one lands, refresh this page's queries instantly instead of waiting for a manual reload.
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent)?.detail?.url as string | undefined;
      if (!url || url.startsWith('/hr-self/leave')) refreshAll();
    };
    window.addEventListener('staff:notifications-changed', handler);
    return () => window.removeEventListener('staff:notifications-changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = pendingQ.data?.requests || [];
  const myRequests = myRequestsQ.data?.requests || [];
  const acted = actedQ.data?.requests || [];

  // A notification like "Leave Request Needs Your Action" deep-links to /hr-self/leave/:id —
  // once the relevant list has loaded, scroll straight to that request instead of leaving the
  // visitor to hunt for it on a page full of other requests.
  useEffect(() => {
    if (!targetId) return;
    if (!pendingQ.data && !myRequestsQ.data && !actedQ.data) return;
    const el = document.getElementById(`leave-request-${targetId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [targetId, pendingQ.data, myRequestsQ.data, actedQ.data]);

  return (
    <div className="space-y-5">
      <HrPageHeader title="Leave Request" description="Apply for leave and track every stage of your request." />

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} id={`leave-request-${r.id}`}>
              <LeaveApprovalCard request={r} onResolved={refreshAll} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <LeaveRequestForm onSubmitted={refreshAll} />

        <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">My Leave History</h2>
          {myRequestsQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : myRequests.length === 0 ? (
            <EmptyState title="No leave requests yet" description="Submit one using the form to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((r) => {
                    const isOpen = myExpanded === r.id;
                    const toggle = () => setMyExpanded((v) => (v === r.id ? null : r.id));
                    return [
                      <tr key={r.id} id={`leave-request-${r.id}`} className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-secondary)]" onClick={toggle}>
                        <td className="px-3 py-2">{r.leave_type}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
                        <td className="px-3 py-2">{r.days}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 text-center">
                          {isOpen ? <ChevronUp className="h-4 w-4 text-[var(--primary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--primary)]" />}
                        </td>
                      </tr>,
                      isOpen && (
                        <tr key={`${r.id}-detail`} className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                          <td colSpan={5} className="px-3 py-4">
                            <LeaveHistoryExpandedDetail id={r.id} />
                          </td>
                        </tr>
                      ),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Requests I've Acted On</h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Every leave request where you were the reliever, supervisor, manager, CTO or HR approver — always here, even after it moves on.
        </p>
        {actedQ.isLoading ? (
          <TableSkeleton rows={3} />
        ) : acted.length === 0 ? (
          <EmptyState title="No actions yet" description="Requests you confirm, approve, or decline will be listed here permanently." />
        ) : (
          <div className="overflow-x-auto">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Dates</th>
                  <th className="px-3 py-2">Your Action</th>
                  <th className="px-3 py-2">Overall Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {acted.map((r) => {
                  const isOpen = actedExpanded === r.id;
                  const toggle = () => setActedExpanded((v) => (v === r.id ? null : r.id));
                  return [
                    <tr key={r.id} id={`leave-request-${r.id}`} className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-secondary)]" onClick={toggle}>
                      <td className="px-3 py-2">{r.employee_name || '—'}</td>
                      <td className="px-3 py-2">{r.leave_type}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.start_date)} – {formatDate(r.end_date)}</td>
                      <td className="px-3 py-2">{r.my_action ? ACTION_LABEL[r.my_action] || r.my_action : '—'}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-center">
                        {isOpen ? <ChevronUp className="h-4 w-4 text-[var(--primary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--primary)]" />}
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`${r.id}-detail`} className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                        <td colSpan={6} className="px-3 py-4">
                          <LeaveHistoryExpandedDetail id={r.id} />
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HrSelfLeave;
