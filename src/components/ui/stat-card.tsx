import React from 'react';
import { cn } from '@/lib/utils';

export const STAT_ACCENTS = [
  { border: 'var(--accent-green)', icon: 'var(--accent-green)' },
  { border: 'var(--accent-purple)', icon: 'var(--accent-purple)' },
  { border: 'var(--accent-amber)', icon: 'var(--accent-amber)' },
  { border: 'var(--accent-blue)', icon: 'var(--accent-blue)' },
  { border: 'var(--accent-red)', icon: 'var(--accent-red)' },
] as const;

export function statAccent(index = 0) {
  return STAT_ACCENTS[index % STAT_ACCENTS.length];
}

const TONE_INDEX: Record<string, number> = {
  default: 0,
  accent: 0,
  success: 0,
  purple: 1,
  warning: 2,
  danger: 4,
};

export function StatCard({
  label,
  title,
  value,
  hint,
  trend,
  description,
  icon: Icon,
  tone = 'default',
  accentIndex,
  className,
}: {
  label?: string;
  title?: string;
  value: React.ReactNode;
  hint?: string;
  trend?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: string;
  accentIndex?: number;
  className?: string;
}) {
  const heading = label || title || '';
  const subtitle = hint || trend || description;
  const index = accentIndex ?? TONE_INDEX[tone] ?? 0;
  const accent = STAT_ACCENTS[index % STAT_ACCENTS.length];

  return (
    <div
      className={cn(
        'vobiss-card rounded-[var(--card-radius)] border bg-[var(--surface)] px-3.5 py-3.5 sm:py-[18px] sm:pl-5 sm:pr-5',
        className
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: accent.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{heading}</p>
        {Icon && <Icon className="h-5 w-5 shrink-0" style={{ color: accent.icon }} />}
      </div>
      <p className="mt-2 text-xl font-bold leading-none tracking-tight text-[var(--text-primary)] sm:mt-2.5 sm:text-2xl">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>}
    </div>
  );
}
