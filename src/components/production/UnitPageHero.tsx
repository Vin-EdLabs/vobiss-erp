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
    <div className="relative overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-slate-900/10">
      <div className={`absolute inset-0 bg-gradient-to-br ${theme.heroGradient}`} />
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/20 ${theme.iconBg} backdrop-blur-sm`}
            >
              <Icon className="h-7 w-7 text-white" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                Vobiss · Service Requests
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {title || theme.label}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
                {subtitle || theme.subtitle}
              </p>
              {badge && (
                <span className="mt-3 inline-flex rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  {badge}
                </span>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
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
          className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5"
        >
          <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.accentBar} opacity-80`} />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{s.label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-3xl">{s.value}</p>
          {s.hint && <p className={`mt-1 text-xs font-medium ${theme.accentText}`}>{s.hint}</p>}
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
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme?.accentBg || 'bg-indigo-50'}`}
            >
              <Icon className={`h-4 w-4 ${theme?.accentText || 'text-indigo-600'}`} />
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
