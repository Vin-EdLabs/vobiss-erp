import React from 'react';
import { cn } from '@/lib/utils';

export function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatLongDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function GreetingBanner({
  name,
  dateLabel,
  pills,
  actions,
  className,
}: {
  name: string;
  dateLabel?: string;
  pills?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'mb-4 overflow-hidden rounded-r-[var(--radius-lg)] rounded-l-none border border-[var(--border)] bg-[var(--surface)] px-4 py-4 shadow-[var(--shadow-md)] sm:mb-6 sm:px-7 sm:py-6',
        className
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: 'var(--primary)' }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
            {timeOfDayGreeting()}, {name}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{dateLabel || formatLongDate()}</p>
          {pills && <div className="mt-3 flex flex-wrap items-center gap-2">{pills}</div>}
        </div>
        {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
      </div>
    </section>
  );
}

export function OutlinePill({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-[3px] text-[11px] text-[var(--text-secondary)]">
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}
