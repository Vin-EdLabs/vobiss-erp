import React, { useEffect, useState } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { approveTransportRequest, getTransportRequest, getTransportSettings, rejectTransportRequest, type TransportRequestDetail } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ReferenceLinkCard } from '@/components/transport/ReferenceLinkCard';
import { formatActedAt, pendingPartyNames } from '../../lib/approvalQueue';
import { ApprovalPartyList, ApprovalProgress } from '../../components/approvals/ApprovalProgress';
import {
  ApprovalTimeline,
  DetailField,
  DetailSection,
  RequestDetailLayout,
  detailIcons,
} from '@/components/request-detail/RequestDetailLayout';
import { PersonName } from '@/components/PersonName';
import { useNavigate } from 'react-router-dom';
import { ShareButton } from '@/components/ShareButton';
import { buildPreviewTable } from '@/lib/shareRecord';
import { useSharedView } from '@/context/SharedViewContext';
import { CopyRefButton } from '@/components/CopyRefButton';
import { LinkedReferencesSection } from '@/components/references/LinkedReferencesSection';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
import { formatOwnReference } from '@/lib/referenceRegistry';

export default function TransportDetail() {
  const { isSharedView, routeParams } = useSharedView();
  const { id: routeId } = useParams();
  const id = isSharedView ? routeParams?.id : routeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [request, setRequest] = useState<TransportRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isSupervisor, setIsSupervisor] = useState(false);

  const load = async () => {
    if (!id || id === 'null' || id === 'undefined') return;
    try {
      setLoading(true);
      if (isSharedView) {
        setRequest(await getTransportRequest(String(id)));
        return;
      }
      const [item, settings] = await Promise.all([
        getTransportRequest(String(id)),
        getTransportSettings(),
      ]);
      setRequest(item);
      setIsSupervisor(Number(settings.supervisor_id) === Number(user?.id) || user?.role === 'superadmin' || user?.main_role === 'superadmin');
    } catch (error: any) {
      toast({ title: 'Request unavailable', description: error.message || 'Could not load transport request.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const performAction = async (mode: 'approve' | 'reject') => {
    if (!request) return;
    try {
      setBusy(true);
      if (mode === 'approve') {
        await approveTransportRequest(request.id, { reason: 'Approved via detail view.' });
        toast({ title: 'Approved', description: 'Transport request approved.', variant: 'default' });
      } else {
        await rejectTransportRequest(request.id, { reason: 'Rejected via detail view.' });
        toast({ title: 'Rejected', description: 'Transport request rejected.', variant: 'default' });
      }
      await load();
    } catch (error: any) {
      toast({ title: 'Action failed', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading request details…</div>;
  }

  if (!request) {
    return <div className="p-6 text-sm text-slate-500">Request not found.</div>;
  }

  const myDecision = String(request.my_decision || '').toLowerCase();
  const alreadyActioned = myDecision === 'approved' || myDecision === 'rejected';
  const waitingNames = pendingPartyNames(request.approval_parties);
  const canAct = request.status === 'pending' && !alreadyActioned;
  const approvedCount = request.approvals_count || request.approvals.filter((a) => a.decision === 'approved').length;
  const required = request.approvals_required || request.approval_parties?.length || 0;

  return (
    <RequestDetailLayout
      title="Transport Request"
      reference={formatOwnReference('transport_request', request.id)}
      status={request.status}
      submittedBy={request.requester_name}
      submittedAt={request.created_at}
      headerActions={
        isSharedView ? null : (
        <ShareButton
          recordType="transport_request"
          recordId={request.id}
          pagePath={window.location.pathname}
          pageTitle={`Transport Request #${request.id}`}
          recordPreview={{
            title: `Transport Request #${request.id}`,
            reference: request.reference_number || `#${request.id}`,
            status: request.status,
            requester: request.requester_name,
            site: request.site_name,
            client: request.client_name,
            purpose: request.purpose,
            submitted: request.created_at,
            tables: [
              buildPreviewTable(
                'Approvals',
                request.approval_parties?.map((p) => ({ approver: p.name, status: p.status, acted_at: p.actedAt ? new Date(p.actedAt).toLocaleString() : '—' })),
                [
                  { key: 'approver', label: 'Approver' },
                  { key: 'status', label: 'Status' },
                  { key: 'acted_at', label: 'Acted At' },
                ]
              ),
            ].filter(Boolean),
          }}
        />
        )
      }
      listPath="/transport-request"
      pills={[
        { label: 'Type', value: 'Transport' },
        { label: 'Site', value: request.site_name },
        { label: 'Client', value: request.client_name },
        { label: 'Reference', value: request.reference_number },
      ]}
      stats={[
        { icon: detailIcons.User, label: 'Requester', value: <PersonName value={request.requester_name} /> },
        { icon: detailIcons.Building2, label: 'Site', value: request.site_name },
        { icon: detailIcons.Calendar, label: 'Date submitted', value: new Date(request.created_at).toLocaleDateString() },
        { icon: detailIcons.Link2, label: 'Reference', value: request.reference_number || 'None' },
      ]}
    >
      <DetailSection title="Request details" icon={FileText}>
        <div className="grid gap-5 sm:grid-cols-2">
          <DetailField label="Requester" value={<PersonName value={request.requester_name} />} />
          <DetailField label="Client" value={request.client_name} />
          <DetailField label="Site" value={request.site_name} />
          <DetailField label="Location" value={request.location} />
          <DetailField label="Engineer" value={request.engineer_name || '—'} />
          <DetailField label="Purpose / notes" value={request.purpose || 'No purpose provided.'} />
        </div>
      </DetailSection>

      <DetailSection title="Reference link" icon={detailIcons.Link2}>
        <ReferenceLinkCard reference={request} />
      </DetailSection>

      {!isSharedView && <LinkedReferencesSection recordType="transport_request" recordId={request.id} />}

      {!isSharedView && <WorkflowTimeline workflowType="transport_request" recordId={request.id} />}

      <DetailSection title="Approval trail" icon={detailIcons.Calendar}>
        <ApprovalProgress item={request} currentUserId={Number(user?.id)} />
        {myDecision === 'approved' && (
          <p className="mb-3 text-sm text-emerald-700">You approved this on {formatActedAt(request.my_acted_at)}</p>
        )}
        {alreadyActioned && waitingNames.length > 0 && request.status === 'pending' && (
          <p className="mb-3 text-sm text-slate-600">Waiting for {waitingNames.join(', ')} to approve</p>
        )}
        <ApprovalPartyList parties={request.approval_parties} />
        <div className="mt-4">
          <ApprovalTimeline
            progressLabel={required ? `${approvedCount} of ${required} approvers have approved` : undefined}
            steps={
              request.approvals.length
                ? request.approvals.map((entry) => ({
                    id: entry.id,
                    name: entry.approver_name,
                    action: entry.decision,
                    at: entry.created_at,
                    note: entry.reason,
                  }))
                : (request.approval_parties || []).map((party) => ({
                    name: party.name,
                    action: party.status,
                    at: party.actedAt,
                  }))
            }
          />
        </div>
        {canAct && !isSharedView && (
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => performAction('approve')} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
              <Check className="h-4 w-4" /> Approve Request
            </button>
            <button type="button" onClick={() => performAction('reject')} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60">
              <X className="h-4 w-4" /> Reject Request
            </button>
          </div>
        )}
        {!isSharedView && request.status === 'approved' && isSupervisor && (
          <button type="button" onClick={() => navigate(`/transport/vehicle-request/${request.id}`)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
            <FileText className="h-4 w-4" /> Create Rental Vehicle Request
          </button>
        )}
      </DetailSection>
    </RequestDetailLayout>
  );
}
