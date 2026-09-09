import React from 'react';
import { HeartPulse, Stethoscope } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { formatGhs } from '@/lib/taxCalculations';
import type { InsuranceCategory } from '@/api/insurance';

function toneColor(pct: number) {
  if (pct >= 90) return 'var(--accent-red)';
  if (pct >= 75) return 'var(--accent-amber)';
  if (pct >= 50) return 'var(--accent-amber)';
  return 'var(--accent-green)';
}

function LimitBar({
  label,
  icon: Icon,
  used,
  limit,
  remaining,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  used: number;
  limit: number;
  remaining: number;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = toneColor(pct);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-[var(--text-secondary)]">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="font-semibold text-[var(--text-primary)]">
          {formatGhs(used)} <span className="font-normal text-[var(--text-muted)]">/ {formatGhs(limit)}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        {remaining >= 0 ? `${formatGhs(remaining)} remaining` : `${formatGhs(Math.abs(remaining))} over limit`}
      </p>
    </div>
  );
}

export function CategoryCard({ category }: { category: InsuranceCategory }) {
  return (
    <div className="vobiss-card rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{category.name}</h4>
        {category.isOverride && (
          <StatusPill tone="role" className="shrink-0">
            Custom Limit
          </StatusPill>
        )}
      </div>
      <div className="space-y-3">
        <LimitBar
          label="Outpatient"
          icon={Stethoscope}
          used={category.outpatient.used}
          limit={category.outpatient.limit}
          remaining={category.outpatient.remaining}
        />
        <LimitBar
          label="Inpatient"
          icon={HeartPulse}
          used={category.inpatient.used}
          limit={category.inpatient.limit}
          remaining={category.inpatient.remaining}
        />
      </div>
      {category.overrideReason && (
        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[11px] italic text-[var(--text-muted)]">
          {category.overrideReason}
        </p>
      )}
    </div>
  );
}
