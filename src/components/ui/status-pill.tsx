import React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'role';

const TONE: Record<Tone, { wrap: string; dot: string }> = {
  success: {
    wrap: 'bg-[var(--accent-green-light)] text-[var(--success-text)]',
    dot: 'bg-[var(--accent-green)]',
  },
  warning: {
    wrap: 'bg-[var(--accent-amber-light)] text-[var(--warning-text)]',
    dot: 'bg-[var(--accent-amber)]',
  },
  danger: {
    wrap: 'bg-[var(--accent-red-light)] text-[var(--danger-text)]',
    dot: 'bg-[var(--accent-red)]',
  },
  info: {
    wrap: 'bg-[var(--accent-blue-light)] text-[var(--info-text)]',
    dot: 'bg-[var(--accent-blue)]',
  },
  role: {
    wrap: 'bg-[var(--accent-purple-light)] text-[var(--purple-text)]',
    dot: '',
  },
};

const SUCCESS = /^(active|success|approved|online|paid|present|resolved|completed|closed|done)$/i;
const WARNING = /^(warning|pending|due|late|half-day|in_progress|in-progress|processing)$/i;
const DANGER = /^(danger|rejected|overdue|inactive|absent|urgent|failed|suspended)$/i;
const ROLE = /^(superadmin|hr|admin|director|cto|noc|cx)$/i;

export function toneFromStatus(status?: string | null): Tone {
  const s = String(status || '').trim();
  if (SUCCESS.test(s)) return 'success';
  if (WARNING.test(s)) return 'warning';
  if (DANGER.test(s)) return 'danger';
  if (ROLE.test(s)) return 'role';
  return 'info';
}

export function StatusPill({
  children,
  status,
  tone,
  className,
}: {
  children?: React.ReactNode;
  status?: string | null;
  tone?: Tone;
  className?: string;
}) {
  const resolved = tone || toneFromStatus(status);
  const styles = TONE[resolved];
  const label = children ?? status ?? '—';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold capitalize',
        resolved === 'role' && 'uppercase tracking-wider text-[10px]',
        styles.wrap,
        className
      )}
    >
      {resolved !== 'role' && <span className={cn('h-2 w-2 rounded-full', styles.dot)} />}
      {label}
    </span>
  );
}
