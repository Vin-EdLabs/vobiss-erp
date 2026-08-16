import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Check, Plus, FileText } from 'lucide-react';
import { ProductionPageShell } from '@/components/production/ProductionPageShell';
import { ProductionRequestsTable } from '@/components/production/ProductionRequestsTable';
import { UnitPageHero, PremiumStatGrid, PremiumPanel } from '@/components/production/UnitPageHero';
import { getUnitTheme } from '@/components/production/unitThemes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getProjectRequestDashboard,
  listProjectRequests,
  projectCompleteProjectRequest,
  type ProjectRequest,
} from '@/api/project';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { isDirectorOrCto, resolvePrimaryRole } from '@/config/roles';

function canProjectMarkComplete(r: ProjectRequest) {
  return (
    (r.status === 'integrated' || r.status === 'noc_approved') &&
    r.current_stage !== 'done' &&
    r.status !== 'completed'
  );
}

export default function ProjectUnitHub() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const isExecutive = isDirectorOrCto(resolvePrimaryRole(user?.main_role || user?.role));
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, completed: 0, rejected: 0 });
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [dash, list] = await Promise.all([
        getProjectRequestDashboard('project'),
        listProjectRequests('project', {
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
        }),
      ]);
      setStats({
        pending: dash.pending,
        inProgress: dash.inProgress,
        completed: dash.completed,
        rejected: dash.rejected,
      });
      setRequests(list);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkComplete = async (r: ProjectRequest, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCompletingId(r.id);
    try {
      await projectCompleteProjectRequest(r.id);
      toast({ title: 'Request completed', description: `${r.customer_name} marked complete` });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not complete',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setCompletingId(null);
    }
  };

  const awaitingCount = requests.filter(canProjectMarkComplete).length;

  return (
    <ProductionPageShell unitSlug="project">
      <div className="space-y-6">
        <UnitPageHero
          unitSlug="project"
          badge={
            !isExecutive && awaitingCount > 0 ? `${awaitingCount} ready to sign off` : undefined
          }
          actions={
            isExecutive ? undefined : (
              <Button
                className={`${getUnitTheme('project').buttonClass} gap-2`}
                onClick={() => navigate('/project-request/create')}
              >
                <Plus className="h-4 w-4" />
                New service request
              </Button>
            )
          }
        />

        <PremiumStatGrid
          unitSlug="project"
          stats={[
            { label: 'Awaiting sign-off', value: stats.pending, hint: 'After IP / NOC' },
            { label: 'In progress', value: stats.inProgress },
            { label: 'Completed', value: stats.completed },
            { label: 'Rejected', value: stats.rejected },
          ]}
        />

        <PremiumPanel
          unitSlug="project"
          title={isExecutive ? 'All service requests' : 'All requests'}
          icon={FileText}
          extra={
            awaitingCount > 0 ? (
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {awaitingCount} ready to complete
              </span>
            ) : null
          }
        >
          <div className="border-b border-[var(--border)] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  className="border-[var(--border-strong)] bg-[var(--surface)] pl-9 text-[var(--text-primary)]"
                  placeholder="Search customer, site, region…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void load()}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full border-[var(--border-strong)] bg-[var(--surface)] sm:w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ongoing">Ongoing</SelectItem>
                  <SelectItem value="integrated">Awaiting sign-off</SelectItem>
                  <SelectItem value="noc_approved">NOC approved</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="border-[var(--border)]" onClick={() => void load()}>
                Apply
              </Button>
            </div>
          </div>

          <ProductionRequestsTable
            requests={requests}
            unitSlug="project"
            loading={loading}
            showStage={isExecutive}
            detailUnitSlug={(r) => r.current_stage || 'project'}
            emptyMessage={
              isExecutive
                ? 'No service requests match your filters.'
                : (
                  <>
                    No service requests yet.{' '}
                    <button
                      type="button"
                      className="font-medium text-[var(--primary)] hover:underline"
                      onClick={() => navigate('/project-request/create')}
                    >
                      Create one
                    </button>
                  </>
                )
            }
            highlightRow={isExecutive ? undefined : canProjectMarkComplete}
            renderExtraActions={
              isExecutive
                ? undefined
                : (r) =>
                    canProjectMarkComplete(r) ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={completingId === r.id}
                        className="h-8 bg-emerald-600 hover:bg-emerald-700"
                        onClick={(e) => void handleMarkComplete(r, e)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        {completingId === r.id ? '…' : 'Complete'}
                      </Button>
                    ) : null
            }
          />
        </PremiumPanel>
      </div>
    </ProductionPageShell>
  );
}
