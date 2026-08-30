import { LineChart } from 'lucide-react';
import type { TrendPoint } from '@/api/assessment';

const W = 640;
const H = 160;
const PAD = 24;

function pathFor(values: (number | null)[], max: number): string {
  const points = values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (points.length < 2) return '';
  const stepX = (W - PAD * 2) / Math.max(1, values.length - 1);
  return points
    .map((p, idx) => {
      const x = PAD + p.i * stepX;
      const y = H - PAD - (p.v / max) * (H - PAD * 2);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function TrendChart({ trend }: { trend: TrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><LineChart className="h-4 w-4" /> Trend</h2>
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Not enough weekly history yet to chart a trend.</p>
      </div>
    );
  }

  const compliance = trend.map((t) => t.compliancePct);
  const score = trend.map((t) => t.score);
  const compliancePath = pathFor(compliance, 100);
  const scorePath = pathFor(score, 100);
  const stepX = (W - PAD * 2) / Math.max(1, trend.length - 1);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><LineChart className="h-4 w-4" /> Trend (last {trend.length} weeks)</h2>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-full bg-[var(--accent-blue)]" /> Score</span>
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-full bg-[var(--accent-green)]" /> Compliance %</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {[0, 25, 50, 75, 100].map((g) => (
          <line key={g} x1={PAD} x2={W - PAD} y1={H - PAD - (g / 100) * (H - PAD * 2)} y2={H - PAD - (g / 100) * (H - PAD * 2)} stroke="var(--border)" strokeWidth={1} />
        ))}
        {compliancePath && <path d={compliancePath} fill="none" stroke="var(--accent-green)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
        {scorePath && <path d={scorePath} fill="none" stroke="var(--accent-blue)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {trend.map((t, i) =>
          t.score != null ? (
            <circle key={i} cx={PAD + i * stepX} cy={H - PAD - (t.score / 100) * (H - PAD * 2)} r={3} fill="var(--accent-blue)" />
          ) : null
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{new Date(trend[0].weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span>{new Date(trend[trend.length - 1].weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
}
