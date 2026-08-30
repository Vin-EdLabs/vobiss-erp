import { Users } from 'lucide-react';
import type { AssessmentScore, VsUnit } from '@/api/assessment';
import { formatMinutes, formatWorkflowType, vsUnitTone } from './shared';

function Row({ label, mine, unit, mineIsBetter, mineFormatted, unitFormatted }: {
  label: string; mine: number | null; unit: number | null; mineIsBetter: boolean | null; mineFormatted: string; unitFormatted: string;
}) {
  return (
    <div className="grid grid-cols-3 items-center gap-3 py-2.5 text-sm">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className={`text-right font-bold ${vsUnitTone(mineIsBetter)}`}>{mineFormatted}</span>
      <span className="text-right text-[var(--text-muted)]">{unitFormatted}</span>
    </div>
  );
}

export function VsUnitPanel({ score, vsUnit }: { score: AssessmentScore; vsUnit: VsUnit | null }) {
  if (!vsUnit) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"><Users className="h-4 w-4" /> You vs Your Unit</h2>
        <p className="py-4 text-sm text-[var(--text-muted)]">No unit is assigned to your account, so there's nothing to compare against yet.</p>
      </div>
    );
  }

  const complianceBetter = score.compliancePct != null && vsUnit.unitCompliancePct != null ? score.compliancePct >= vsUnit.unitCompliancePct : null;
  const speedBetter = score.avgMinutes != null && vsUnit.unitAvgMinutes != null ? score.avgMinutes <= vsUnit.unitAvgMinutes : null;
  const volumeBetter = vsUnit.unitMedianVolume != null ? score.segmentsCompleted >= vsUnit.unitMedianVolume : null;
  const breachesBetter = vsUnit.unitAvgBreaches != null ? score.criticalBreaches <= vsUnit.unitAvgBreaches : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Users className="h-4 w-4" /> You vs {formatWorkflowType(vsUnit.unitSlug)} Unit
        </h2>
        {vsUnit.membersInUnit > 1 ? (
          <span className="text-xs text-[var(--text-muted)]">{vsUnit.membersInUnit} active members</span>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Only active member this period</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-[var(--border)] pb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
        <span></span>
        <span className="text-right">You</span>
        <span className="text-right">Unit Avg</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        <Row label="Compliance" mine={score.compliancePct} unit={vsUnit.unitCompliancePct} mineIsBetter={complianceBetter}
          mineFormatted={score.compliancePct != null ? `${score.compliancePct}%` : '—'} unitFormatted={vsUnit.unitCompliancePct != null ? `${vsUnit.unitCompliancePct}%` : '—'} />
        <Row label="Avg Handling Time" mine={score.avgMinutes} unit={vsUnit.unitAvgMinutes} mineIsBetter={speedBetter}
          mineFormatted={formatMinutes(score.avgMinutes)} unitFormatted={formatMinutes(vsUnit.unitAvgMinutes)} />
        <Row label="Volume Handled" mine={score.segmentsCompleted} unit={vsUnit.unitMedianVolume} mineIsBetter={volumeBetter}
          mineFormatted={String(score.segmentsCompleted)} unitFormatted={vsUnit.unitMedianVolume != null ? `${vsUnit.unitMedianVolume} (median)` : '—'} />
        <Row label="Critical Breaches" mine={score.criticalBreaches} unit={vsUnit.unitAvgBreaches} mineIsBetter={breachesBetter}
          mineFormatted={String(score.criticalBreaches)} unitFormatted={vsUnit.unitAvgBreaches != null ? String(vsUnit.unitAvgBreaches) : '—'} />
      </div>

      {vsUnit.membersInUnit > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
            Rank by compliance: #{vsUnit.rankByCompliance ?? '—'} of {vsUnit.membersInUnit}
          </span>
          <span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)]">
            Rank by volume: #{vsUnit.rankByVolume ?? '—'} of {vsUnit.membersInUnit}
          </span>
        </div>
      )}
    </div>
  );
}
