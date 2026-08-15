import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { Search, Inbox, History, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductionPageShell } from '@/components/production/ProductionPageShell';
import { ProductionRequestsTable } from '@/components/production/ProductionRequestsTable';
import { UnitPageHero, PremiumStatGrid, PremiumPanel } from '@/components/production/UnitPageHero';
import { getUnitTheme } from '@/components/production/unitThemes';
import {
  getProjectRequestDashboard,
  listProjectRequests,
  type ProjectRequest,
  type ProjectUnit,
} from '@/api/project';

const UNIT_SUBTITLES: Record<string, { active: string; history: string }> = {
  ts: {
    active: 'Pending requests — open a row to accept or reject',
    history: 'Requests you have already processed',
  },
  ip: {
    active: 'Ongoing integrations — open a row to submit work',
    history: 'Requests you have forwarded or completed at IP',
  },
  noc: {
    active: 'IP submissions ready for NOC review — open a row for integration details',
    history: 'Requests you have reviewed in your audit trail',
  },
};

function belongsInActiveQueue(request: ProjectRequest, unitSlug: string) {
  if (unitSlug === 'ts') return request.current_stage === 'ts' && request.status === 'pending';
  if (unitSlug === 'ip') return request.current_stage === 'ip' && request.status === 'ongoing';
  if (unitSlug === 'noc') return request.current_stage === 'project' && request.status === 'integrated';
  return true;
}

export default function ProductionHub() {
  const { unitSlug = 'ts' } = useParams<{ unitSlug: string }>();
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const theme = getUnitTheme(unitSlug);
  const [unit, setUnit] = useState<ProjectUnit | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, completed: 0, rejected: 0 });
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    if (!unitSlug || unitSlug === 'project') return;
    try {
      setLoading(true);
      const [dash, list] = await Promise.all([
        getProjectRequestDashboard(unitSlug),
        listProjectRequests(unitSlug, {
          view: tab,
          status: tab === 'active' ? undefined : statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
        }),
      ]);
      setUnit(dash.unit);
      setStats({
        pending: dash.pending,
        inProgress: dash.inProgress,
        completed: dash.completed,
        rejected: dash.rejected,
      });
      setRequests(list);
    } catch (e: unknown) {
      setRequests([]);
      toast({
        title: 'Could not load queue',
        description: e instanceof Error ? e.message : 'Check your unit assignment or try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [unitSlug, tab, search, statusFilter, toast]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = theme.label || unit?.name || unitSlug?.toUpperCase();
  const subtitles = UNIT_SUBTITLES[unitSlug] || {
    active: 'Requests waiting for your action',
    history: 'Processed requests',
  };
  const subtitle = tab === 'active' ? subtitles.active : subtitles.history;
  const visibleRequests =
    tab === 'active'
      ? requests.filter((request) => belongsInActiveQueue(request, unitSlug))
      : requests;

  const emptyActive =
    unitSlug === 'ts'
      ? 'No requests in your inbox.'
      : unitSlug === 'ip'
        ? 'No requests awaiting IP integration.'
        : 'No IP submissions to review yet.';
  const emptyHistory = 'No history yet.';

  const backTo =
    unitSlug === 'noc' ? '/staff/noc/dashboard' : '/dashboard';

  return (
    <ProductionPageShell
      unitSlug={unitSlug}
      backTo={backTo}
      backLabel={unitSlug === 'noc' ? 'Back to NOC Dashboard' : 'Back to Dashboard'}
    >
      <div className="space-y-6">
        <UnitPageHero
          unitSlug={unitSlug}
          title={title}
          subtitle={subtitles.active}
          badge={`${visibleRequests.length} in ${tab === 'active' ? 'queue' : 'history'}`}
        />

        <PremiumStatGrid
          unitSlug={unitSlug}
          stats={[
            { label: 'Inbox', value: stats.pending, hint: 'Awaiting you' },
            { label: 'In progress', value: stats.inProgress },
            { label: 'Completed', value: stats.completed },
            { label: 'Rejected', value: stats.rejected },
          ]}
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'active' | 'history')} className="space-y-5">
          <TabsList className="grid h-12 w-full max-w-lg grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-sm)]">
            <TabsTrigger
              value="active"
              className="gap-2 rounded-lg text-[var(--text-secondary)] data-[state=active]:bg-[var(--primary)] data-[state=active]:text-white"
            >
              <Inbox className="h-4 w-4" />
              Inbox ({stats.pending})
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="gap-2 rounded-lg text-[var(--text-secondary)] data-[state=active]:bg-[var(--primary)] data-[state=active]:text-white"
            >
              <History className="h-4 w-4" />
              History ({stats.completed})
            </TabsTrigger>
          </TabsList>

          <p className="text-sm text-[var(--text-secondary)]">{subtitle}</p>

          <PremiumPanel
            unitSlug={unitSlug}
            title={tab === 'active' ? 'Active queue' : 'History'}
            icon={FileText}
            extra={
              <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-body)]">
                {visibleRequests.length}
              </span>
            }
          >
            <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    className={`border-[var(--border-strong)] bg-[var(--surface)] pl-9 text-[var(--text-primary)] ${theme.ringFocus}`}
                    placeholder="Search customer, site, region…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void load()}
                  />
                </div>
                {tab === 'history' && (
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full border-[var(--border-strong)] bg-[var(--surface)] sm:w-44">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="ongoing">Ongoing</SelectItem>
                      <SelectItem value="integrated">Integrated</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="outline"
                  className={`border-[var(--border)] ${unitSlug === 'noc' ? 'hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-amber-500/15 dark:hover:text-amber-200' : ''}`}
                  onClick={() => void load()}
                >
                  Apply
                </Button>
              </div>
            </div>

            <TabsContent value="active" className="mt-0">
              <ProductionRequestsTable
                requests={visibleRequests}
                unitSlug={unitSlug}
                loading={loading}
                emptyMessage={emptyActive}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <ProductionRequestsTable
                requests={visibleRequests}
                unitSlug={unitSlug}
                loading={loading}
                emptyMessage={emptyHistory}
              />
            </TabsContent>
          </PremiumPanel>
        </Tabs>
      </div>
    </ProductionPageShell>
  );
}
