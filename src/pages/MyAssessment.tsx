import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ClipboardCheck, Download, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { userHasAnyRole } from '@/config/roles';
import { getMyAssessment, getStaffAssessment, exportMyAssessment, exportStaffAssessment } from '@/api/assessment';
import { ScoreHero } from '@/components/assessment/ScoreHero';
import { VsUnitPanel } from '@/components/assessment/VsUnitPanel';
import { ByWorkflowTable } from '@/components/assessment/ByWorkflowTable';
import { UnitRankingTable } from '@/components/assessment/UnitRankingTable';
import { NotableList } from '@/components/assessment/NotableList';
import { TrendChart } from '@/components/assessment/TrendChart';
import { formatMinutes, formatWorkflowType } from '@/components/assessment/shared';
import { Clock, ListChecks, ShieldCheck, AlertTriangle, Timer, ListTodo } from 'lucide-react';

type PeriodKey = 'this_week' | 'this_month' | 'last_month' | 'custom';

const ASSESSMENT_MANAGER_ROLES = ['noc_manager', 'ts_manager', 'ip_manager', 'finance_manager', 'noc_supervisor', 'ts_supervisor', 'ip_supervisor', 'approver', 'director', 'cto'];

function periodRange(key: PeriodKey, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  if (key === 'this_week') return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 1 }).toISOString() };
  if (key === 'last_month') {
    const prev = subMonths(now, 1);
    return { from: startOfMonth(prev).toISOString(), to: endOfMonth(prev).toISOString() };
  }
  if (key === 'custom' && customFrom && customTo) return { from: new Date(customFrom).toISOString(), to: new Date(`${customTo}T23:59:59`).toISOString() };
  return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() };
}

export default function MyAssessment() {
  const { userId: userIdParam } = useParams<{ userId?: string }>();
  const { user, isAdminSuper } = useAuth();
  const { toast } = useToast();
  const canViewOthers = isAdminSuper || userHasAnyRole(user, ASSESSMENT_MANAGER_ROLES);
  const [periodKey, setPeriodKey] = useState<PeriodKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const viewingOther = !!userIdParam && Number(userIdParam) !== user?.id;
  const targetUserId = userIdParam ? Number(userIdParam) : null;
  const { from, to } = useMemo(() => periodRange(periodKey, customFrom, customTo), [periodKey, customFrom, customTo]);

  const query = useQuery({
    queryKey: ['assessment', targetUserId ?? 'me', from, to],
    queryFn: () => (targetUserId ? getStaffAssessment(targetUserId, { dateFrom: from, dateTo: to }) : getMyAssessment({ dateFrom: from, dateTo: to })),
  });

  const data = query.data;

  const handleExport = async () => {
    try {
      setExporting(true);
      if (targetUserId) await exportStaffAssessment(targetUserId, { dateFrom: from, dateTo: to });
      else await exportMyAssessment({ dateFrom: from, dateTo: to });
    } catch (e) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Performance</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
            <ClipboardCheck className="h-7 w-7" /> {viewingOther ? `${data?.user.name || 'Staff'}'s Assessment` : 'My Assessment'}
          </h1>
          {data && (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {data.user.name} · {data.user.unit ? formatWorkflowType(data.user.unit) : 'No unit'} · {data.user.role ? formatWorkflowType(data.user.role) : '—'}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This week</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="last_month">Last month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {periodKey === 'custom' && (
            <>
              <Input type="date" className="w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input type="date" className="w-36" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button type="button" size="sm" onClick={handleExport} disabled={exporting || !data}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Download Excel'}
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-[28px]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] p-6 text-sm text-[var(--danger-text)]">
          {query.error instanceof Error ? query.error.message : 'Could not load this assessment.'}
        </div>
      ) : data ? (
        <>
          <ScoreHero score={data.score} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Segments Completed" value={data.score.segmentsCompleted} icon={ListChecks} accentIndex={0} />
            <StatCard label="Records Handled" value={data.score.recordsHandled} icon={ListTodo} accentIndex={1} />
            <StatCard label="Avg Time" value={formatMinutes(data.score.avgMinutes)} icon={Clock} accentIndex={3} />
            <StatCard label="Median Time" value={formatMinutes(data.score.medianMinutes)} icon={Timer} accentIndex={3} />
            <StatCard label="SLA Compliance" value={data.score.compliancePct != null ? `${data.score.compliancePct}%` : '—'} icon={ShieldCheck} accentIndex={0} />
            <StatCard label="Critical Breaches" value={data.score.criticalBreaches} icon={AlertTriangle} accentIndex={4} />
          </div>

          <VsUnitPanel score={data.score} vsUnit={data.vsUnit} />

          <ByWorkflowTable rows={data.byWorkflow} excludedTypes={data.notes.excludedFromPersonalScore} />

          <TrendChart trend={data.trend} />

          <NotableList fastest={data.fastest} slowest={data.slowest} breaches={data.breaches} />

          {data.unitPerformance && (
            <UnitRankingTable unitSlug={data.unitPerformance.unitSlug} summary={data.unitPerformance.summary} ranking={data.unitPerformance.ranking} canNavigate={canViewOthers} />
          )}

          <p className="text-center text-xs text-[var(--text-muted)]">
            {data.notes.fairnessBlurb} This is evidence for performance conversations — not an automatic final HR grade.
          </p>
        </>
      ) : null}
    </div>
  );
}
