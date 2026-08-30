import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getRecordTurnaround, type SlaStatus, type StageBreakdown } from '@/api/timeEngine';
import { cn } from '@/lib/utils';

function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}

const STAGE_TONE: Record<SlaStatus, string> = {
  on_track: 'bg-[var(--accent-green)]',
  warning: 'bg-[var(--accent-amber)]',
  breached: 'bg-[var(--accent-red)]',
  no_config: 'bg-[var(--border-strong)]',
};

const STAGE_TEXT_TONE: Record<SlaStatus, string> = {
  on_track: 'text-[var(--success-text)]',
  warning: 'text-[var(--warning-text)]',
  breached: 'text-[var(--danger-text)]',
  no_config: 'text-[var(--text-secondary)]',
};

function formatStageName(stageName: string | null): string {
  if (!stageName) return 'Stage';
  return stageName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function StageBlock({ stage, isCurrent, now }: { stage: StageBreakdown; isCurrent: boolean; now: Date }) {
  const liveMinutes = isCurrent ? Math.max(0, Math.round((now.getTime() - new Date(stage.startedAt).getTime()) / 60000)) : stage.minutes;
  return (
    <div className="flex min-w-[160px] flex-1 flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STAGE_TONE[stage.slaStatus], isCurrent && 'animate-pulse')} />
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--text-primary)]">{formatStageName(stage.stageName)}</span>
        {isCurrent && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-green)]">Active</span>}
      </div>
      <p className={cn('text-sm font-semibold', STAGE_TEXT_TONE[stage.slaStatus])}>{formatMinutes(liveMinutes)}</p>
      {stage.expectedMinutes != null && (
        <p className="text-[11px] text-[var(--text-muted)]">Expected {formatMinutes(stage.expectedMinutes)}</p>
      )}
      {(stage.unitSlug || stage.userFullName) && (
        <p className="truncate text-[11px] text-[var(--text-secondary)]">
          {stage.userFullName || stage.unitSlug}
        </p>
      )}
    </div>
  );
}

/**
 * Reusable timing breakdown for one workflow record — a horizontal block-per-stage timeline,
 * color-coded by SLA status, with the current stage (if any) live-ticking. Renders nothing if
 * the viewer isn't authorized to see this record's timing (regular staff not involved) or if
 * no timing data exists yet for it — never breaks the host detail page.
 */
export function WorkflowTimeline({ workflowType, recordId }: { workflowType: string; recordId: number | string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ['time-engine', 'record', workflowType, recordId],
    queryFn: () => getRecordTurnaround(workflowType, recordId),
    refetchInterval: 30000,
    retry: false,
  });

  if (query.isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }
  if (query.isError || !query.data || query.data.notStarted) {
    return null; // no permission, or nothing recorded yet — stay quiet, this is a secondary section
  }

  const { byStage, totalElapsedMinutes, isOpen } = query.data;
  if (!byStage.length) return null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Clock className="h-4 w-4 text-[var(--text-secondary)]" /> Time Breakdown
        </h3>
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Total: {formatMinutes(totalElapsedMinutes)}{isOpen ? ' so far' : ''}
        </span>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {byStage.map((stage, i) => (
          <div key={`${stage.stageName}-${stage.startedAt}`} className="flex items-center gap-2">
            <StageBlock stage={stage} isCurrent={isOpen && i === byStage.length - 1} now={now} />
            {i < byStage.length - 1 && <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />}
          </div>
        ))}
      </div>
    </div>
  );
}
