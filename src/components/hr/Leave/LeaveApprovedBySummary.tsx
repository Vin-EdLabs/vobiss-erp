import React from 'react';
import { Check } from 'lucide-react';
import type { LeaveHistoryEntry, LeaveStage } from '@/api/leave';

const STAGE_LABEL: Record<LeaveStage, string> = {
  reliever: 'Reliever', supervisor: 'Supervisor', manager: 'Manager', cto: 'CTO', hr: 'HR',
};

function initials(name?: string | null) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** A clean, glanceable "who has signed off so far" strip — separate from the raw audit table,
 *  so approvers don't have to dig through history rows to see who already approved. */
export function LeaveApprovedBySummary({ history }: { history: LeaveHistoryEntry[] }) {
  const completed = history.filter((h) => h.action === 'confirmed' || h.action === 'approved');
  if (completed.length === 0) {
    return (
      <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-3 text-center text-sm text-[var(--text-muted)]">
        Nobody has signed off yet — this is the first step.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {completed.map((h) => (
        <div key={h.id} className="flex items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-green-light)] text-sm font-semibold text-[var(--success-text)]">
            {initials(h.actor_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{h.actor_name || 'Unknown'}</p>
            <p className="text-xs text-[var(--text-muted)]">{STAGE_LABEL[h.stage] || h.stage} · {formatDateTime(h.acted_at)}</p>
          </div>
          <Check className="h-4 w-4 shrink-0 text-[var(--accent-green)]" />
        </div>
      ))}
    </div>
  );
}
