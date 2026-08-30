import { useNavigate } from 'react-router-dom';
import { Zap, Hourglass, AlertTriangle } from 'lucide-react';
import type { NotableEntry, BreachEntry } from '@/api/assessment';
import { formatMinutes, formatWorkflowType } from './shared';

function NotableRow({ entry, tone }: { entry: NotableEntry; tone: 'fast' | 'slow' }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(entry.link)}
      className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-secondary)]"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-[var(--text-primary)]">{entry.reference}</span>
        <span className="block truncate text-xs text-[var(--text-muted)]">{formatWorkflowType(entry.workflowType)} · {formatWorkflowType(entry.stage)}</span>
      </span>
      <span className={`shrink-0 font-bold ${tone === 'fast' ? 'text-[var(--success-text)]' : 'text-[var(--warning-text)]'}`}>
        {formatMinutes(entry.durationMinutes)}
      </span>
    </button>
  );
}

function BreachRow({ entry }: { entry: BreachEntry }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(entry.link)}
      className="flex w-full flex-col rounded-lg border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] px-3 py-2 text-left text-sm transition hover:brightness-95"
    >
      <span className="truncate font-semibold text-[var(--danger-text)]">{entry.reference} — {formatWorkflowType(entry.stage)}</span>
      <span className="text-xs text-[var(--danger-text)]">
        {formatMinutes(entry.actualMinutes)} actual{entry.expectedMinutes != null ? ` vs ${formatMinutes(entry.expectedMinutes)} expected` : ''} · +{formatMinutes(entry.exceededBy)} over
      </span>
    </button>
  );
}

export function NotableList({ fastest, slowest, breaches }: { fastest: NotableEntry[]; slowest: NotableEntry[]; breaches: BreachEntry[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Zap className="h-4 w-4 text-[var(--success-text)]" /> Fastest</h2>
        {fastest.length === 0 ? <p className="py-4 text-center text-sm text-[var(--text-muted)]">Nothing yet.</p> : (
          <div className="space-y-2">{fastest.map((e, i) => <NotableRow key={i} entry={e} tone="fast" />)}</div>
        )}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Hourglass className="h-4 w-4 text-[var(--warning-text)]" /> Slowest</h2>
        {slowest.length === 0 ? <p className="py-4 text-center text-sm text-[var(--text-muted)]">Nothing yet.</p> : (
          <div className="space-y-2">{slowest.map((e, i) => <NotableRow key={i} entry={e} tone="slow" />)}</div>
        )}
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><AlertTriangle className="h-4 w-4 text-[var(--danger-text)]" /> Critical Breaches</h2>
        {breaches.length === 0 ? <p className="py-4 text-center text-sm text-[var(--text-muted)]">No SLA breaches — nice work.</p> : (
          <div className="space-y-2">{breaches.slice(0, 8).map((e, i) => <BreachRow key={i} entry={e} />)}</div>
        )}
      </div>
    </div>
  );
}
