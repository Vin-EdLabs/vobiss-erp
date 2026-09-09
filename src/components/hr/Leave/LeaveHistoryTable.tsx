import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import type { LeaveHistoryEntry, LeaveStage } from '@/api/leave';

const PAGE_SIZE = 8;

const STAGE_LABEL: Record<LeaveStage, string> = {
  reliever: 'Reliever', supervisor: 'Supervisor', manager: 'Manager', cto: 'CTO', hr: 'HR',
};
const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted', confirmed: 'Confirmed', approved: 'Approved',
  declined: 'Declined', acknowledged: 'Acknowledged', cancelled: 'Cancelled',
};

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatWait(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  if (hrs < 24) return `${hrs}h ${minutes % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function actionTone(action: string): 'success' | 'danger' | 'info' {
  if (action === 'declined' || action === 'cancelled') return 'danger';
  if (action === 'submitted') return 'info';
  return 'success';
}

export function LeaveHistoryTable({ history }: { history: LeaveHistoryEntry[] }) {
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => [...history].sort((a, b) => new Date(b.acted_at).getTime() - new Date(a.acted_at).getTime()), [history]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages - 1);
  const rows = sorted.slice(clamped * PAGE_SIZE, clamped * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="overflow-x-auto rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <table className="vobiss-table w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
            <th className="px-3 py-2">Stage</th>
            <th className="px-3 py-2">Actor</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Waited</th>
            <th className="px-3 py-2">Signature / Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                No history yet.
              </td>
            </tr>
          ) : (
            rows.map((h) => (
              <tr key={h.id} className="border-b border-[var(--border)]">
                <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{STAGE_LABEL[h.stage] || h.stage}</td>
                <td className="px-3 py-2">{h.actor_name || '—'}</td>
                <td className="px-3 py-2">
                  <StatusPill tone={actionTone(h.action)}>{ACTION_LABEL[h.action] || h.action}</StatusPill>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(h.acted_at)}</td>
                <td className="px-3 py-2">{formatWait(h.waiting_duration_minutes)}</td>
                <td className="px-3 py-2 max-w-[240px] truncate" title={h.reason || ''}>
                  {h.action === 'declined' ? (
                    h.reason || '—'
                  ) : h.reason ? (
                    <span className="font-mono italic text-[var(--text-secondary)]">"{h.reason}"</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {sorted.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span>
            {clamped * PAGE_SIZE + 1}–{Math.min(clamped * PAGE_SIZE + PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={clamped === 0} onClick={() => setPage(clamped - 1)}>
              Prev
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={clamped >= totalPages - 1} onClick={() => setPage(clamped + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
