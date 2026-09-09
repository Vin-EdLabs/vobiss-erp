import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, EmptyState, StatCard, StatusBadge, TableSkeleton, inputClass } from '@/pages/hr/components';
import { Button } from '@/components/ui/button';
import otApi, { OT_QUERY, downloadOTPdf, type OTRequest } from '@/api/overtime';
import { OTApprovalPanel } from './OTApprovalPanel';
import { OT_STAGE_LABEL } from './OTStatusTracker';

function stageLabel(stage?: string | null) {
  if (!stage) return '—';
  if (stage === 'paid') return 'Paid';
  if (stage === 'declined') return 'Declined';
  return OT_STAGE_LABEL[stage as keyof typeof OT_STAGE_LABEL] || stage;
}

/** HR/Finance/Admin's overview of every overtime request — one unified accordion list, no
 *  popup: click a row and the full beautiful form drops down right there, with Approve/Decline
 *  (or Finance's payment panel) live whenever it's actually that stage's turn. */
export function OTManagementPanel({ targetId }: { targetId?: number | null }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(targetId ?? null);

  const requestsQ = useQuery({
    queryKey: ['overtime', 'all', statusFilter],
    queryFn: () => otApi.allRequests(statusFilter ? { status: statusFilter } : undefined),
    ...OT_QUERY,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['overtime'] });
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent)?.detail?.url as string | undefined;
      if (!url || url.startsWith('/hr/overtime') || url.startsWith('/hr-self/overtime')) refresh();
    };
    window.addEventListener('staff:notifications-changed', handler);
    return () => window.removeEventListener('staff:notifications-changed', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!targetId || !requestsQ.data) return;
    const el = document.getElementById(`ot-row-${targetId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, requestsQ.data]);

  const rows = requestsQ.data?.requests || [];
  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === 'pending').length;
    const totalHoursPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.total_ot_hours || 0), 0);
    const totalPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    return { pending, totalHoursPaid, totalPaid };
  }, [rows]);

  const downloadPdf = async (id: number) => {
    try {
      await downloadOTPdf(id);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to download PDF');
    }
  };

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending Requests" value={stats.pending} accentIndex={2} />
        <StatCard label="Total OT Hours Paid" value={stats.totalHoursPaid.toFixed(1)} accentIndex={0} />
        <StatCard label="Total Paid Out (GHS)" value={stats.totalPaid.toFixed(2)} accentIndex={1} />
      </div>

      <div className="mb-4">
        <select className={`${inputClass} w-48`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="declined">Declined</option>
        </select>
      </div>

      {requestsQ.isLoading ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="No overtime requests" description="Requests submitted by staff will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Sites</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: OTRequest) => {
                const isOpen = expandedId === r.id;
                const toggle = () => setExpandedId((v) => (v === r.id ? null : r.id));
                const canAct = r.status === 'pending' && (r.current_stage === 'hr' || r.current_stage === 'finance');
                return [
                  <tr key={r.id} id={`ot-row-${r.id}`} className="cursor-pointer border-b hover:bg-[var(--surface-hover)]" onClick={toggle}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={r.staff_name} size="sm" /><span>{r.staff_name}</span></div></td>
                    <td className="px-4 py-3 capitalize">{r.ot_category.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">{Number(r.total_ot_hours).toFixed(2)}h</td>
                    <td className="px-4 py-3">{r.site_count ?? '—'}</td>
                    <td className="px-4 py-3">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">{stageLabel(r.current_stage)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(r.id)}><Download className="h-3.5 w-3.5" /></Button>
                        <button type="button" onClick={toggle} className="text-[var(--primary)]">
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${r.id}-detail`} className="border-b bg-[var(--surface-secondary)]">
                      <td colSpan={8} className="px-4 py-4">
                        <OTApprovalPanel request={r} canAct={canAct} hideHeader onResolved={refresh} />
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
  );
}
