import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw, ShoppingBag, PenLine, ClipboardCheck, Building2, Cable, Wifi, Radio, MessageSquare } from 'lucide-react';
import { ProductionPageShell } from '@/components/production/ProductionPageShell';
import { DetailCard, InfoField } from '@/components/production/production-ui';
import { RemarksThread } from '@/components/production/RemarksThread';
import { PipelineHistory } from '@/components/production/PipelineHistory';
import { ProjectRequestDetailHeader } from '@/components/production/ProjectRequestDetailHeader';
import { CollapsibleStageSection, type StageSectionStatus } from '@/components/production/CollapsibleStageSection';
import { DesignAssignmentBar } from '@/components/production/DesignAssignmentBar';
import { SalesStageSection } from '@/components/production/stages/SalesStageSection';
import { DesignStageSection } from '@/components/production/stages/DesignStageSection';
import { SalesReviewStageSection } from '@/components/production/stages/SalesReviewStageSection';
import { ProjectStageSection } from '@/components/production/stages/ProjectStageSection';
import { TxStageSection } from '@/components/production/stages/TxStageSection';
import { IpStageSection } from '@/components/production/stages/IpStageSection';
import { NocStageSection } from '@/components/production/stages/NocStageSection';
import { getProjectRequest, addProjectRequestRemark, uploadProjectRequestAttachment, type ProjectRequest } from '@/api/project';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { useSharedView } from '@/context/SharedViewContext';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
import { FieldWorkPanel } from '@/components/fieldwork/FieldWorkPanel';
import { LinkedReferencesSection } from '@/components/references/LinkedReferencesSection';

// current_stage's position for "done / active / upcoming" — design and rejected sit at 1 since
// a reject-to-design loop must re-open Design's section rather than treat it as skipped ahead.
const STAGE_RANK: Record<string, number> = { design: 1, sales: 2, project: 3, ts: 4, ip: 5, noc: 6, done: 7, rejected: 7 };

export default function ProductionDetail({ id: idProp }: { id?: string; unitSlug?: string } = {}) {
  const { isSharedView, routeParams } = useSharedView();
  const { id: routeId } = useParams<{ id: string; unitSlug: string }>();
  const id = idProp ?? (isSharedView ? routeParams?.id : routeId);
  const { toast } = useToast();
  const { user } = useAuth();
  const [request, setRequest] = useState<ProjectRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Combine singular `unit` with the plural `units` array — some real accounts only ever had the
  // singular field set (units array empty/missing), which silently failed every isSales/isDesign/
  // etc check below and hid the Confirm/Reject buttons for genuine Sales/Design staff.
  const units: string[] = [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])]
    .filter(Boolean)
    .map((u: string) => String(u).toLowerCase());
  const isAdmin = user?.role === 'superadmin' || user?.main_role === 'superadmin';
  const isTs = isAdmin || units.includes('ts');
  const isIp = isAdmin || units.includes('ip');
  const isNoc = isAdmin || units.includes('noc');
  const isProject = isAdmin || units.includes('project');
  const isSales = isAdmin || units.includes('sales') || user?.main_role === 'sales' || user?.role === 'sales';
  const isDesign = isAdmin || units.includes('design') || ['design_manager', 'design_supervisor'].includes(String(user?.main_role || user?.role || ''));
  const isCreator = request?.created_by_user_id === user?.id;
  // Real unit membership only — isDesign/isSales/etc above all fold in the isAdmin bypass (any
  // superadmin-role account reads as "every unit"), which made this always resolve to 'design'
  // for admin accounts regardless of which unit they actually belong to or came from. Only fall
  // back to the bypassed flags (then 'project') when the account has no specific unit at all.
  const myPrimaryUnit =
    units.includes('design') || ['design_manager', 'design_supervisor'].includes(String(user?.main_role || user?.role || '')) ? 'design'
      : units.includes('sales') || user?.main_role === 'sales' || user?.role === 'sales' ? 'sales'
      : units.includes('ts') ? 'ts'
      : units.includes('ip') ? 'ip'
      : units.includes('noc') ? 'noc'
      : units.includes('project') ? 'project'
      : isDesign ? 'design' : isSales ? 'sales' : isTs ? 'ts' : isIp ? 'ip' : isNoc ? 'noc' : 'project';

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await getProjectRequest(parseInt(id, 10));
      setRequest(data);
    } catch (e: unknown) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { void load(); }, [load]);
  const refresh = async () => { await load(); };

  const backTo = `/project-request/${myPrimaryUnit}`;
  const backLabel =
    myPrimaryUnit === 'project' ? 'Back to Project Unit'
      : myPrimaryUnit === 'ts' ? 'Back to TX'
      : myPrimaryUnit === 'ip' ? 'Back to IP'
      : myPrimaryUnit === 'noc' ? 'Back to NOC'
      : myPrimaryUnit === 'design' ? 'Back to Design Unit'
      : 'Back to Sales';

  if (loading || !request) {
    return (
      <ProductionPageShell backTo={backTo} backLabel={backLabel}>
        <div className="flex flex-col items-center justify-center py-24">
          <RefreshCw className="mb-4 h-10 w-10 animate-spin text-indigo-600" />
          <p className="text-sm text-[var(--text-secondary)]">Loading request details…</p>
        </div>
      </ProductionPageShell>
    );
  }

  const currentRank = STAGE_RANK[request.current_stage] ?? 3;
  const remarks = request.remarks || [];
  const isLocked = request.status === 'completed' || request.current_stage === 'done';
  // Documents and comments are cross-unit collaboration primitives, available to anyone on the
  // flow at any stage — unlike field edits/approvals, which stay locked to whichever unit
  // currently owns the stage (enforced server-side too). NOC is excluded from attachments only,
  // matching the pre-existing backend rule that NOC works via Tickets for live issues instead.
  const canContribute = !isSharedView && !isLocked && (isDesign || isSales || isProject || isTs || isIp || isNoc || isCreator || isAdmin);
  const canUploadAttachment = !isSharedView && !isLocked && (isDesign || isSales || isProject || isTs || isIp || isCreator || isAdmin);

  // A reject-to-design loop resets current_stage back to 'design' — this signal (any remark
  // ever tagged 'sales', or design_confirmed_at, or having already passed stage rank 2) stays
  // true even mid-loop, so the Sales Review section doesn't regress to a locked placeholder.
  const hasReachedSalesReview = remarks.some((r) => r.stage === 'sales') || !!request.design_confirmed_at || currentRank >= 2;

  const statusFor = (rank: number, alreadyReached?: boolean): StageSectionStatus => {
    if (currentRank === rank) return 'active';
    if (currentRank > rank || alreadyReached) return 'done';
    return 'upcoming';
  };

  // NOC has already added the circuit to monitoring — current_stage flips back to 'project' so
  // Project can act on the Sign-Off Form, but every stage already ran. Without this, Project/TX/
  // IP/NOC would misread that rank-3 flip as "back to step 3" and show themselves as
  // upcoming/active again, looking like the whole flow restarted.
  const awaitingSignOff = request.status === 'noc_approved' && !isLocked;

  const designStatus = statusFor(1);
  const salesReviewStatus = currentRank === 2 ? 'active' : hasReachedSalesReview ? 'done' : 'upcoming';
  const projectStatus = awaitingSignOff ? 'done' : statusFor(3);
  const tsStatus = awaitingSignOff ? 'done' : statusFor(4);
  const ipStatus = awaitingSignOff ? 'done' : statusFor(5);
  const nocStatus = awaitingSignOff ? 'done' : currentRank === 6 ? 'active' : currentRank > 6 ? 'done' : 'upcoming';

  // An unclaimed request isn't editable by anyone until a Design Unit member claims it (self or
  // a named colleague) — see DesignAssignmentBar below. Once claimed, only that person can act.
  const canDesignAct = !isSharedView && isDesign && request.current_stage === 'design' && request.design_assigned_to === user?.id;
  const isDesignManagerOrAdmin = isAdmin || String(user?.main_role || user?.role || '').toLowerCase() === 'design_manager';
  const canSalesReview = !isSharedView && isSales && request.current_stage === 'sales';
  const canProjectRoute = !isSharedView && isProject && request.current_stage === 'project' && request.status === 'pending';
  const canProjectSendNoc = !isSharedView && isProject && request.current_stage === 'project' && request.status === 'integrated';
  const canProjectComplete = !isSharedView && (isProject || isCreator || isAdmin) && request.current_stage === 'project' && request.status === 'noc_approved' && !isLocked;
  const canTsAct = !isSharedView && isTs && request.current_stage === 'ts' && request.status === 'pending';
  const canIpAct = !isSharedView && isIp && request.current_stage === 'ip' && request.status === 'ongoing';
  const canNocApprove = !isSharedView && isNoc && request.current_stage === 'noc' && request.status === 'integrated';

  return (
    <ProductionPageShell backTo={backTo} backLabel={backLabel} header={<ProjectRequestDetailHeader request={request} />}>
      {!isSharedView && (
        <div className="mb-6">
          <WorkflowTimeline workflowType={request.is_design_request ? 'design_request' : 'service_request'} recordId={request.id} />
        </div>
      )}
      {!isSharedView && request.current_stage === 'ts' && (
        <div className="mb-6">
          <FieldWorkPanel
            sourceType="service_request" sourceId={request.id}
            sourceTitle={`${request.customer_name || ''} — ${request.site_name || ''}`.trim()}
            sourceSiteName={request.site_name} sourceClientName={request.customer_name}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <CollapsibleStageSection title="Sales — Feasibility Request" icon={ShoppingBag} status="done" summary={request.customer_name}>
            <SalesStageSection request={request} canUpload={canUploadAttachment} onUpdated={refresh} />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="Design — Survey & Materials" icon={PenLine} status={designStatus} summary={designStatus === 'done' ? request.design_reference || 'Submitted' : undefined}>
            {!isSharedView && request.current_stage === 'design' && (
              <DesignAssignmentBar
                request={request}
                isDesignMember={isDesign}
                currentUserId={user?.id}
                canManage={isDesignManagerOrAdmin}
                onUpdated={refresh}
              />
            )}
            <DesignStageSection request={request} canEdit={canDesignAct} canUpload={canUploadAttachment} onUpdated={refresh} />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="Sales Review" icon={ClipboardCheck} status={salesReviewStatus} summary={salesReviewStatus === 'done' ? (request.design_confirmed_at ? 'Confirmed' : undefined) : undefined}>
            <SalesReviewStageSection request={request} canReview={canSalesReview} onUpdated={refresh} />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="Project Unit" icon={Building2} status={projectStatus} summary={projectStatus === 'done' ? [request.capacity, request.cpe].filter(Boolean).join(' · ') || undefined : undefined}>
            <ProjectStageSection
              request={request}
              canRoute={canProjectRoute}
              canSendNoc={canProjectSendNoc}
              canComplete={canProjectComplete}
              canUpload={canUploadAttachment}
              actionLoading={actionLoading}
              setActionLoading={setActionLoading}
              onUpdated={refresh}
            />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="TX — Transmission" icon={Cable} status={tsStatus} summary={tsStatus === 'done' && request.ts_notes ? request.ts_notes : undefined}>
            <TxStageSection request={request} canAct={canTsAct} canUpload={canUploadAttachment} actionLoading={actionLoading} setActionLoading={setActionLoading} onUpdated={refresh} />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="IP — Integration" icon={Wifi} status={ipStatus} summary={ipStatus === 'done' ? request.circuit_id || undefined : undefined}>
            <IpStageSection request={request} canAct={canIpAct} canUpload={canUploadAttachment} actionLoading={actionLoading} setActionLoading={setActionLoading} onUpdated={refresh} />
          </CollapsibleStageSection>

          <CollapsibleStageSection title="NOC — Monitoring" icon={Radio} status={nocStatus} summary={nocStatus === 'done' && request.noc_notes ? request.noc_notes : undefined}>
            <NocStageSection request={request} canAct={canNocApprove} actionLoading={actionLoading} setActionLoading={setActionLoading} onUpdated={refresh} />
          </CollapsibleStageSection>

          {/* Cross-unit discussion — always available to every unit on the flow, regardless of
              current_stage. Fields/approvals stay locked to whichever unit currently owns the
              stage (enforced server-side too), but visibility and comments never do — this is
              the one thread every department reads from and writes to. */}
          {!isSharedView && (
            <DetailCard title="Cross-Unit Discussion" icon={MessageSquare}>
              <PipelineHistory request={request} remarks={remarks} title="Full history — every unit" />
              {canContribute && (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <RemarksThread
                    remarks={remarks}
                    stage="all"
                    onlyAdd
                    addLabel="Add an update or comment — visible to every unit on this flow"
                    onAdd={async (text) => {
                      await addProjectRequestRemark(request.id, text, myPrimaryUnit);
                      await refresh();
                    }}
                  />
                </div>
              )}
            </DetailCard>
          )}
        </div>

        <aside className="min-w-0 space-y-6">
          <DetailCard title="Request details">
            <div className="space-y-4">
              <InfoField label="Reference" value={request.design_confirmed_at ? `SR-${String(request.id).padStart(3, '0')}` : 'Draft — not yet confirmed'} />
              <InfoField label="Status" value={request.status} />
              <InfoField label="Current stage" value={request.current_stage?.toUpperCase()} />
              <InfoField label="Service type" value={request.service_type} />
              <InfoField label="Created by" value={request.created_by_name} />
              <InfoField label="Submitted" value={formatDate(request.created_at)} />
              <InfoField label="Last updated" value={formatDate(request.updated_at)} />
            </div>
          </DetailCard>
          {!isSharedView && <LinkedReferencesSection recordType="service_request" recordId={request.id} />}
        </aside>
      </div>
    </ProductionPageShell>
  );
}

function formatDate(d?: string | null) {
  return d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}
