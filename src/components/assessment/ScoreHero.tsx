import { ShieldCheck, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AssessmentScore } from '@/api/assessment';
import { scoreTone } from './shared';

function DeltaPill({ value, suffix = 'pts', invert = false }: { value: number | null; suffix?: string; invert?: boolean }) {
  if (value == null || Number.isNaN(value)) return <span className="text-xs text-[var(--text-muted)]">No prior data</span>;
  const rounded = Math.round(value * 10) / 10;
  const isGood = invert ? rounded < 0 : rounded > 0;
  const isFlat = rounded === 0;
  const Icon = isFlat ? Minus : isGood ? TrendingUp : TrendingDown;
  const tone = isFlat ? 'text-[var(--text-muted)]' : isGood ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {rounded > 0 ? '+' : ''}{rounded}{suffix}
    </span>
  );
}

export function ScoreHero({ score }: { score: AssessmentScore }) {
  const tone = scoreTone(score.label);
  const hasScore = score.overall != null;

  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)] sm:p-8`}>
      <div className={`pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl ${tone.dot}`} />
      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full ring-4 ${tone.bg} ${tone.ring} sm:h-28 sm:w-28`}>
            <span className={`text-4xl font-black tracking-tight ${tone.text} sm:text-5xl`}>
              {hasScore ? score.overall : '—'}
            </span>
          </div>
          <div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${tone.bg} ${tone.text}`}>
              {score.label}
            </span>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              Based only on work you actively owned — waiting time and unit-only requests are excluded.
            </p>
            {!hasScore && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Needs at least {score.minSegmentsRequired} completed items this period to show a score ({score.segmentsCompleted} so far).
              </p>
            )}
          </div>
        </div>

        {hasScore && (
          <div className="grid grid-cols-3 gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4 sm:gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Score</p>
              <DeltaPill value={score.vsPrevious.scoreDelta} suffix="" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Compliance</p>
              <DeltaPill value={score.vsPrevious.complianceDeltaPts} suffix="pts" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Avg Time</p>
              <DeltaPill value={score.vsPrevious.avgMinutesDeltaPct} suffix="%" invert />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
