import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState, HrPageHeader, StatusBadge, TableSkeleton } from '@/pages/hr/components';
import otApi, { OT_QUERY, downloadOTPdf, type OTRequest } from '@/api/overtime';
import { OTRequestForm } from '@/components/hr/Overtime/OTRequestForm';
import { OTApprovalPanel } from '@/components/hr/Overtime/OTApprovalPanel';
import { OTStatusTracker } from '@/components/hr/Overtime/OTStatusTracker';
import { OTRequestViewer } from '@/components/hr/Overtime/OTRequestViewer';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MyOTHistoryDetail({ id }: { id: number }) {
  const detailQ = useQuery({ queryKey: ['overtime', 'detail', 'self', id], queryFn: () => otApi.requestDetail(id), ...OT_QUERY });
  const downloadPdf = async () => {
    try { await downloadOTPdf(id); toast.success('PDF downloaded'); } catch (e: any) { toast.error(e?.message || 'Failed to download PDF'); }
  };
  if (detailQ.isLoading || !detailQ.data) return <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--surface-secondary)]" />;
  return (
    <div className="space-y-4">
      <OTStatusTracker request={detailQ.data} />
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <OTRequestViewer request={detailQ.data} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadPdf}><Download className="mr-1 h-4 w-4" /> Download PDF</Button>
      </div>
    </div>
  );
}

const HrSelfOvertime = () => {
  const qc = useQueryClient();
  const { id: targetIdParam } = useParams();
  const targetId = targetIdParam ? Number(targetIdParam) : null;
  const [myExpanded, setMyExpanded] = useState<number | null>(targetId);

  const pendingQ = useQuery({ queryKey: ['overtime', 'pending-on-me'], queryFn: otApi.pendingOnMe, ...OT_QUERY });
  const myRequestsQ = useQuery({ queryKey: ['overtime', 'my-requests'], queryFn: otApi.myRequests, ...OT_QUERY });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['overtime'] });
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent)?.detail?.url as string | undefined;
      if (!url || url.startsWith('/hr-self/overtime')) refreshAll();
    };
    window.addEventListener('staff:notifications-changed', handler);
    return () => window.removeEventListener('staff:notifications-changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = pendingQ.data?.requests || [];
  const myRequests = myRequestsQ.data?.requests || [];

  useEffect(() => {
    if (!targetId) return;
    if (!pendingQ.data && !myRequestsQ.data) return;
    const el = document.getElementById(`ot-request-${targetId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [targetId, pendingQ.data, myRequestsQ.data]);

  return (
    <div className="space-y-5">
      <HrPageHeader title="Overtime Request" description="Submit an overtime payment request and track every stage of approval." />

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((r: OTRequest) => (
            <div key={r.id} id={`ot-request-${r.id}`}>
              <OTApprovalPanel request={r} onResolved={refreshAll} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <OTRequestForm onSubmitted={refreshAll} />

        <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">My Overtime History</h2>
          {myRequestsQ.isLoading ? (
            <TableSkeleton rows={4} />
          ) : myRequests.length === 0 ? (
            <EmptyState title="No overtime requests yet" description="Submit one using the form to get started." />
          ) : (
            <div className="overflow-x-auto">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {myRequests.map((r) => {
                    const isOpen = myExpanded === r.id;
                    const toggle = () => setMyExpanded((v) => (v === r.id ? null : r.id));
                    return [
                      <tr key={r.id} id={`ot-request-${r.id}`} className="cursor-pointer border-b border-[var(--border)] hover:bg-[var(--surface-secondary)]" onClick={toggle}>
                        <td className="px-3 py-2 capitalize">{r.ot_category.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2">{Number(r.total_ot_hours).toFixed(2)}h</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.submitted_at)}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 text-center">{isOpen ? <ChevronUp className="h-4 w-4 text-[var(--primary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--primary)]" />}</td>
                      </tr>,
                      isOpen && (
                        <tr key={`${r.id}-detail`} className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
                          <td colSpan={5} className="px-3 py-4"><MyOTHistoryDetail id={r.id} /></td>
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
    </div>
  );
};

export default HrSelfOvertime;
