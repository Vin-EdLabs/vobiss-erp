import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Check, Lock, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StageSectionStatus = 'done' | 'active' | 'upcoming';

const ACCENT_BAR: Record<StageSectionStatus, string> = {
  done: 'from-emerald-500 to-emerald-400',
  active: 'from-indigo-500 to-violet-400',
  upcoming: 'from-[var(--border-strong)] to-[var(--border-strong)]',
};

/**
 * One stage's section in the SR profile's vertical accordion — collapsed to a summary once
 * done, open by default while active, shown as a locked placeholder for stages not reached yet.
 * Wraps the same visual language DetailCard (production-ui.tsx) already uses elsewhere on this
 * page, so it doesn't change DetailCard itself — everything else using DetailCard is unaffected.
 */
export function CollapsibleStageSection({
  title,
  icon: Icon,
  status,
  summary,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  status: StageSectionStatus;
  /** Short one-line summary shown when collapsed (done) or as a placeholder hint (upcoming). */
  summary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(status === 'active');

  // Re-open automatically when this section becomes the active one (e.g. after a refresh moves
  // the stage forward); a "done" section a user manually expanded to review stays as they left it.
  useEffect(() => {
    if (status === 'active') setOpen(true);
  }, [status]);

  if (status === 'upcoming') {
    return (
      <section className="relative overflow-hidden rounded-[var(--card-radius)] border border-dashed border-[var(--border)] bg-[var(--surface-secondary)]/40 p-5 opacity-70 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-muted)]">
          <Lock className="h-4 w-4" />
          {title}
          {summary && <span className="ml-auto text-xs font-normal text-[var(--text-muted)]">{summary}</span>}
        </h2>
      </section>
    );
  }

  return (
    <section className="vobiss-card relative overflow-hidden rounded-[var(--card-radius)] border bg-[var(--surface)] p-5 sm:p-6">
      <div className={cn('absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r', ACCENT_BAR[status])} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-lg font-bold text-[var(--text-primary)]"
      >
        {status === 'done' ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : (
          Icon && <Icon className="h-5 w-5 shrink-0 text-indigo-500" />
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {!open && summary && (
          <span className="hidden truncate text-sm font-normal text-[var(--text-muted)] sm:inline">{summary}</span>
        )}
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-[var(--text-muted)]" /> : <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
