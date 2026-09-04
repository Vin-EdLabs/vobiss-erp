import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileSignature, FileText } from 'lucide-react';
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
  listSignoffForms,
  type ProjectRequest,
  type SignoffForm,
} from '@/api/project';
import { useAuth } from '@/context/AuthContext';
import { isDirectorOrCto, resolvePrimaryRole } from '@/config/roles';

// Every stage already ran once NOC has added the circuit to monitoring — completing this
// request now happens by filling and approving its Sign-Off Form (see POST /signoff/:id/approve
// auto-completing the linked service request), not a direct "mark complete" shortcut.
function needsSignOff(r: ProjectRequest) {
  return r.status === 'noc_approved' && r.current_stage !== 'done';
}
const SIGNOFF_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending: 'Pending Approval', approved: 'Approved', rejected: 'Rejected',
};

export default function ProjectUnitHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isExecutive = isDirectorOrCto(resolvePrimaryRole(user?.main_role || user?.role));
  const [stats, setStats] = useState({ pending: 0, inProgress: 0, completed: 0, rejected: 0 });
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [signoffByRequest, setSignoffByRequest] = useState<Record<number, SignoffForm>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [dash, list, forms] = await Promise.all([
        getProjectRequestDashboard('project'),
        listProjectRequests('project', {
          status: statusFilter === 'all' ? undefined : statusFilter,
          search: search || undefined,
        }),
        listSignoffForms({ linked_record_type: 'service_request' }),
      ]);
      setStats({
        pending: dash.pending,
        inProgress: dash.inProgress,
        completed: dash.completed,
        rejected: dash.rejected,
      });
      setRequests(list);
      // Newest form per linked request — a rejected-then-recreated form should show its latest state.
      const byRequest: Record<number, SignoffForm> = {};
      for (const f of forms) {
        if (f.linked_record_id == null) continue;
        const existing = byRequest[f.linked_record_id];
        if (!existing || new Date(f.created_at) > new Date(existing.created_at)) byRequest[f.linked_record_id] = f;
      }
      setSignoffByRequest(byRequest);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const startSignOff = (r: ProjectRequest, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate('/project-unit/signoff/new', {
      state: {
        signoffPrefill: {
          site_name: r.site_name || r.customer_name || '',
          circuit_id: r.circuit_id || '',
          linked_record_type: 'service_request',
          linked_record_id: r.id,
          linked_record_ref: `SR-${String(r.id).padStart(3, '0')}`,
        },
      },
    });
  };

  const goToSignOff = (form: SignoffForm, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigate(`/project-unit/signoff/${form.id}`);
  };

  const awaitingCount = requests.filter(needsSignOff).length;

  return (
    <ProductionPageShell unitSlug="project">
      <div className="space-y-6">
        <UnitPageHero
          unitSlug="project"
          badge={
            !isExecutive && awaitingCount > 0 ? `${awaitingCount} ready to sign off` : undefined
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
                  <SelectItem value="noc_approved">Ready for sign-off</SelectItem>
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
                : 'No service requests yet. New requests start with Sales.'
            }
            highlightRow={isExecutive ? undefined : needsSignOff}
            renderExtraActions={
              isExecutive
                ? undefined
                : (r) => {
                    if (!needsSignOff(r)) return null;
                    const form = signoffByRequest[r.id];
                    if (!form) {
                      return (
                        <Button type="button" size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={(e) => startSignOff(r, e)}>
                          <FileSignature className="mr-1 h-3.5 w-3.5" />Sign Off
                        </Button>
                      );
                    }
                    return (
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={(e) => goToSignOff(form, e)}>
                        <FileSignature className="mr-1 h-3.5 w-3.5" />
                        {['draft', 'rejected'].includes(form.status) ? 'Continue' : 'View'} · {SIGNOFF_STATUS_LABEL[form.status] || form.status}
                      </Button>
                    );
                  }
            }
          />
        </PremiumPanel>
      </div>
    </ProductionPageShell>
  );
}
