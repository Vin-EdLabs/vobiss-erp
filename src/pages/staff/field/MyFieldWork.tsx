import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Wrench, MapPin, Building2, Clock, ArrowRight, CheckCircle2, Sparkles, Sun, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { StatCard } from '@/components/ui/stat-card';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { useAuth } from '@/context/AuthContext';
import { getMyFieldWork, type FieldWorkListRow } from '@/api/fieldWork';
import { FIELD_WORK_STATUS_LABELS, fieldWorkStatusTone, progressForStatus, timeElapsedSince, sourcePath } from '@/components/fieldwork/shared';

const ACTIVE_STATUSES = ['assigned', 'travelling', 'on_site', 'in_progress', 'waiting', 'completed', 'noc_confirmed'];
const TONE_BORDER: Record<string, string> = {
  success: 'var(--accent-green)',
  warning: 'var(--accent-amber)',
  danger: 'var(--accent-red)',
  info: 'var(--accent-blue)',
};

export default function MyFieldWork() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['field-work', 'my-work'], queryFn: getMyFieldWork, refetchInterval: 60000 });

  const active = useMemo(() => (query.data || []).filter((r) => ACTIVE_STATUSES.includes(r.status)), [query.data]);
  const completed = useMemo(() => (query.data || []).filter((r) => !ACTIVE_STATUSES.includes(r.status)), [query.data]);
  const outOnSite = useMemo(() => active.filter((r) => ['travelling', 'on_site'].includes(r.status)).length, [active]);
  const completedThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    return completed.filter((r) => new Date(r.updated_at).getTime() >= weekAgo).length;
  }, [completed]);

  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <GreetingBanner
        name={firstName}
        pills={
          <>
            <OutlinePill icon={Wrench}>{active.length} active job{active.length === 1 ? '' : 's'}</OutlinePill>
            {outOnSite > 0 && <OutlinePill icon={MapPin}>{outOnSite} out on site</OutlinePill>}
            <OutlinePill icon={Sparkles}>{completedThisWeek} completed this week</OutlinePill>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Active" value={active.length} icon={Wrench} accentIndex={3} />
        <StatCard label="Out On Site" value={outOnSite} icon={MapPin} accentIndex={2} />
        <StatCard label="Completed" value={completed.length} icon={CheckCircle2} accentIndex={0} />
        <StatCard label="This Week" value={completedThisWeek} icon={Sun} accentIndex={1} />
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Active Work</h2>
          {active.length > 0 && <span className="rounded-full bg-[var(--accent-blue-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--info-text)]">{active.length}</span>}
        </div>
        {query.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" /></div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-green-light)]">
              <CheckCircle2 className="h-6 w-6 text-[var(--success-text)]" />
            </span>
            <p className="text-sm font-semibold text-[var(--text-primary)]">You're all caught up!</p>
            <p className="text-xs text-[var(--text-muted)]">Nothing active right now — new assignments will show up here.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => <FieldWorkCard key={r.id} row={r} myUserId={user?.id} onOpen={() => navigate(`/staff/field/field-work/${r.id}`)} />)}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-[var(--text-primary)]">Completed</h2>
        {completed.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--text-muted)]">No completed field work yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {completed.map((r) => <FieldWorkCard key={r.id} row={r} myUserId={user?.id} onOpen={() => navigate(`/staff/field/field-work/${r.id}`)} compact />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Primary call-to-action per status — location-verified check-in/complete both live on the
 *  detail page (FieldWorkPanel), so every card action here just routes there, rather than
 *  offering a bare status dropdown that would bypass the GPS confirmation entirely. */
function primaryActionForStatus(status: string): { label: string; icon: typeof Navigation } {
  if (['assigned', 'travelling'].includes(status)) return { label: "Confirm I'm here", icon: Navigation };
  if (['on_site', 'in_progress', 'waiting'].includes(status)) return { label: 'Mark Complete', icon: CheckCircle2 };
  return { label: 'Open Field Work', icon: ArrowRight };
}

function FieldWorkCard({ row, myUserId, onOpen, compact }: {
  row: FieldWorkListRow; myUserId?: number; onOpen: () => void; compact?: boolean;
}) {
  const navigate = useNavigate();
  const tone = fieldWorkStatusTone(row.status);
  const isDone = ['completed', 'noc_confirmed', 'client_confirmed', 'closed'].includes(row.status);
  const action = primaryActionForStatus(row.status);
  return (
    <div
      className="vobiss-card group cursor-pointer rounded-2xl border bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:scale-[0.99]"
      style={{ borderLeftWidth: 3, borderLeftColor: TONE_BORDER[tone] }}
      onClick={onOpen}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(sourcePath(row.source_type, row.source_id)); }}
            className="text-left text-xs font-semibold text-[var(--primary)] hover:underline"
          >
            {row.source_type === 'ticket' ? 'Ticket' : 'Service Request'} #{row.source_id}
          </button>
          <p className="truncate font-bold text-[var(--text-primary)]">{row.title}</p>
        </div>
        <StatusPill tone={tone}>{FIELD_WORK_STATUS_LABELS[row.status]}</StatusPill>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        {row.site_name && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {row.site_name}</span>}
        {row.client_name && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {row.client_name}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {timeElapsedSince(row.created_at)}</span>
      </div>
      {!compact && <Progress value={progressForStatus(row.status)} className="mb-3 h-1.5" />}
      <Button
        type="button"
        size="sm"
        variant={isDone ? 'outline' : 'default'}
        className="w-full"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
      >
        <action.icon className="mr-1.5 h-3.5 w-3.5" /> {action.label}
        {isDone && <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
      </Button>
    </div>
  );
}
