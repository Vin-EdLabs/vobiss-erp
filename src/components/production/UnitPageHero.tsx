import React from 'react';
import { getUnitTheme } from './unitThemes';

export function UnitPageHero({
  unitSlug,
  title,
  subtitle,
  badge,
  actions,
}: {
  unitSlug: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  actions?: React.ReactNode;
}) {
  const theme = getUnitTheme(unitSlug);
  const Icon = theme.Icon;

  return (
    <section
      className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-5 shadow-[var(--shadow-md)] sm:px-7 sm:py-6"
      style={{ borderLeftWidth: 4, borderLeftColor: 'var(--primary)' }}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-green-light)]">
            <Icon className="h-6 w-6 text-[var(--primary)]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              Service Requests
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">
              {title || theme.label}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
              {subtitle || theme.subtitle}
            </p>
            {badge && (
              <span className="mt-3 inline-flex rounded-full bg-[var(--accent-green-light)] px-2.5 py-0.5 text-xs font-semibold text-[var(--primary)]">
                {badge}
              </span>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

export function PremiumStatGrid({
  stats,
  unitSlug,
}: {
  unitSlug: string;
  stats: { label: string; value: number; hint?: string }[];
}) {
  const theme = getUnitTheme(unitSlug);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      {stats.map((s) => (
        <article
          key={s.label}
          className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]"
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.accentBar}`} />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{s.label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-3xl">{s.value}</p>
          {s.hint && <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">{s.hint}</p>}
        </article>
      ))}
    </div>
  );
}

export function PremiumPanel({
  children,
  title,
  icon: Icon,
  unitSlug,
  extra,
}: {
  children: React.ReactNode;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  unitSlug?: string;
  extra?: React.ReactNode;
}) {
  const theme = unitSlug ? getUnitTheme(unitSlug) : null;

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme?.accentBg || 'bg-[var(--accent-green-light)]'}`}>
              <Icon className={`h-4 w-4 ${theme?.accentText || 'text-[var(--primary)]'}`} />
            </span>
          )}
          <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}
