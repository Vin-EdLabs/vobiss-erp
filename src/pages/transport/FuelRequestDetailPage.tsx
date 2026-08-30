import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Upload, FileText, ShieldCheck, DollarSign, Fuel } from 'lucide-react';
import {
  getFuelRequestDetail,
  approveFuelRequest,
  rejectFuelRequest,
  issueFuelCash,
  uploadFuelReceipt,
  completeFuelRequest,
  getTransportSettings,
  type FuelRequest,
} from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ShareButton';
import { buildPreviewTable } from '@/lib/shareRecord';
import { ReferenceLinkCard } from '@/components/transport/ReferenceLinkCard';
import { formatActedAt, pendingPartyNames } from '../../lib/approvalQueue';
import { ApprovalPartyList, ApprovalProgress } from '../../components/approvals/ApprovalProgress';
import { PersonName } from '@/components/PersonName';
import {
  ApprovalTimeline,
  AttachmentGrid,
  DetailField,
  DetailSection,
  RequestDetailLayout,
  detailIcons,
} from '@/components/request-detail/RequestDetailLayout';
import { useSharedView } from '@/context/SharedViewContext';
import { LinkedReferencesSection } from '@/components/references/LinkedReferencesSection';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';

export default function FuelRequestDetailPage() {
  const { isSharedView, routeParams } = useSharedView();
  const { id: routeId } = useParams();
  const id = isSharedView ? routeParams?.id : routeId;
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [request, setRequest] = useState<FuelRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const [transportConfig, setTransportConfig] = useState<any>({});
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [data, settings] = await Promise.all([
        getFuelRequestDetail(id),
        getTransportSettings().catch(() => ({} as any)),
      ]);
      setRequest(data);
      setTransportConfig(settings || {});
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error', description: err.message || 'Failed to load request detail.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading fuel request details...</div>;
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <p className="text-slate-500">Fuel request not found.</p>
        <Button onClick={() => navigate('/transport/fuel-requests')} variant="outline" className="mt-4">
          Back to List
        </Button>
      </div>
    );
  }

  const userId = Number(user?.id);
  const userRole = String(user?.role || user?.main_role || '').toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(userRole);

  const isFuelApprover =
    isAdmin ||
    (transportConfig.fuel_request_approver_ids || [])
      .concat(transportConfig.approver_ids || [])
      .map(Number)
      .includes(userId);

  const isSupervisor = isAdmin || Number(transportConfig.supervisor_id) === userId;

  const isFinanceUser =
    isAdmin ||
    userRole === 'finance' ||
    (transportConfig.finance_user_ids || []).map(Number).includes(userId);

  const isRequester = Number(request.requester_id) === userId || isAdmin;

  const alreadyActioned = String(request.my_decision || '').toLowerCase() === 'approved' || String(request.my_decision || '').toLowerCase() === 'rejected';
  const canApproveFirstLevel = request.current_stage === 'approver' && isFuelApprover && !alreadyActioned;
  const canApproveSupervisor = request.current_stage === 'supervisor' && isSupervisor && !alreadyActioned;
  const canIssueCash = request.current_stage === 'finance_cash' && isFinanceUser;
  const canUploadReceipt = (request.status === 'Awaiting Receipt' || request.current_stage === 'awaiting_receipt') && isRequester;
  const canCompleteRequest = (request.current_stage === 'finance_completed' || (request.current_stage === 'awaiting_receipt' && !!request.receipt_url)) && isFinanceUser;

  const handleApprove = async () => {
    if (!id) return;
    try {
      setActionBusy(true);
      await approveFuelRequest(id);
      toast({ title: 'Approved', description: 'Action recorded successfully.', variant: 'default' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Approval Failed', description: err.message || 'Failed to approve.', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    try {
      setActionBusy(true);
      await rejectFuelRequest(id, { reason: rejectionReason });
      toast({ title: 'Rejected', description: 'Fuel request rejected.', variant: 'default' });
      setShowRejectModal(false);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Rejection Failed', description: err.message || 'Failed to reject.', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleIssueCash = async () => {
    if (!id) return;
    try {
      setActionBusy(true);
      await issueFuelCash(id);
      toast({ title: 'Cash Issued', description: 'Status updated to Awaiting Receipt.', variant: 'default' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Action Failed', description: err.message || 'Failed to issue cash.', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleReceiptUpload = async () => {
    if (!id || !selectedFile) return;
    try {
      setUploadingReceipt(true);
      await uploadFuelReceipt(id, selectedFile);
      toast({ title: 'Receipt Uploaded', description: 'Receipt submitted for Finance verification.', variant: 'default' });
      setSelectedFile(null);
      await loadData();
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message || 'Failed to upload receipt.', variant: 'destructive' });
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleComplete = async () => {
    if (!id) return;
    try {
      setActionBusy(true);
      await completeFuelRequest(id);
      toast({ title: 'Completed', description: 'Fuel request verified and closed.', variant: 'default' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Completion Failed', description: err.message || 'Failed to complete request.', variant: 'destructive' });
    } finally {
      setActionBusy(false);
    }
  };

  const approvedCount = request.approvals_count || (request.approvals || []).filter((a: any) => String(a.decision).toLowerCase().includes('approv')).length;
  const required = request.approvals_required || request.approval_parties?.length || 0;

  return (
    <RequestDetailLayout
      title="Fuel Request"
      reference={request.ref_no}
      status={request.status}
      submittedBy={request.requester_name}
      submittedAt={request.created_at}
      headerActions={
        isSharedView ? null : (
        <ShareButton
          recordType="fuel_request"
          recordId={request.id}
          pagePath={window.location.pathname}
          pageTitle={`Fuel Request ${request.ref_no || `#${request.id}`}`}
          recordPreview={{
            title: `Fuel Request ${request.ref_no || `#${request.id}`}`,
            reference: request.ref_no || `#${request.id}`,
            status: request.status,
            requester: request.requester_name,
            department: request.department,
            vehicle: request.vehicle_plate,
            fuel_type: request.fuel_type,
            purpose: request.purpose,
            submitted: request.created_at,
            tables: [
              buildPreviewTable(
                'Approvals',
                request.approval_parties?.map((p: any) => ({ approver: p.name, status: p.status, acted_at: p.actedAt ? new Date(p.actedAt).toLocaleString() : '—' })),
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
      listPath="/transport/fuel-requests"
      pills={[
        { label: 'Type', value: 'Fuel' },
        { label: 'Department', value: request.department },
        { label: 'Vehicle', value: request.vehicle_plate },
        { label: 'Reference', value: request.reference_number || request.project_ticket_ref },
      ]}
      stats={[
        { icon: detailIcons.User, label: 'Requester', value: <PersonName value={request.requester_name} /> },
        { icon: detailIcons.Building2, label: 'Department', value: request.department || '—' },
        { icon: detailIcons.Calendar, label: 'Date submitted', value: new Date(request.created_at).toLocaleDateString() },
        { icon: detailIcons.Link2, label: 'Reference', value: request.reference_number || request.project_ticket_ref || 'None' },
      ]}
      financeActions={
        !isSharedView && isFinanceUser && (canIssueCash || canCompleteRequest) ? (
          <DetailSection title="Finance actions" icon={DollarSign}>
            <div className="flex flex-wrap gap-2">
              {canIssueCash && (
                <Button disabled={actionBusy} onClick={handleIssueCash} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                  <DollarSign className="h-4 w-4" /> Mark as Cash Issued
                </Button>
              )}
              {canCompleteRequest && (
                <Button disabled={actionBusy} onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Mark as Completed
                </Button>
              )}
            </div>
          </DetailSection>
        ) : null
      }
    >
      <DetailSection title="Request details" icon={Fuel}>
        <div className="grid gap-5 sm:grid-cols-2">
          <DetailField label="Vehicle plate" value={request.vehicle_plate} />
          <DetailField label="Fuel type" value={request.fuel_type} />
          <DetailField label="Quantity" value={`${request.quantity_litres} litres`} />
          <DetailField label="Price per litre" value={request.price_per_litre ? `GHC ${Number(request.price_per_litre).toFixed(2)}` : 'Manual entry'} />
          <DetailField label="Estimated amount" value={`GHC ${Number(request.estimated_amount).toFixed(2)}`} />
          <DetailField label="Purpose" value={request.purpose || '—'} />
        </div>
      </DetailSection>

      <DetailSection title="Cost table" icon={FileText}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-muted)]">
              <th className="pb-2">Item</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Rate</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 font-semibold">{request.fuel_type}</td>
              <td className="py-2 text-right">{request.quantity_litres}</td>
              <td className="py-2 text-right">{request.price_per_litre ? `GHC ${Number(request.price_per_litre).toFixed(2)}` : '—'}</td>
              <td className="py-2 text-right font-semibold">GHC {Number(request.estimated_amount).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-right">
          <p className="text-xs uppercase text-amber-800">Grand total</p>
          <p className="text-2xl font-bold text-amber-900">GHC {Number(request.estimated_amount).toFixed(2)}</p>
        </div>
      </DetailSection>

      <DetailSection title="Reference link" icon={detailIcons.Link2}>
        <ReferenceLinkCard reference={request} />
      </DetailSection>

      {!isSharedView && <LinkedReferencesSection recordType="fuel_request" recordId={request.id} />}

      {!isSharedView && <WorkflowTimeline workflowType="fuel_request" recordId={request.id} />}

      {request.receipt_url && (
        <DetailSection title="Attachments" icon={detailIcons.Paperclip}>
          <AttachmentGrid
            files={[{ name: request.receipt_filename || 'fuel-receipt', url: request.receipt_url }]}
          />
        </DetailSection>
      )}

      {canUploadReceipt && !isSharedView && (
        <DetailSection title="Upload receipt" icon={Upload}>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-600 file:text-white"
            />
            {selectedFile && (
              <Button disabled={uploadingReceipt} onClick={handleReceiptUpload} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                {uploadingReceipt ? 'Uploading...' : 'Submit Receipt'}
              </Button>
            )}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Approval trail" icon={detailIcons.Calendar}>
        <ApprovalProgress item={request} currentUserId={userId} />
        {String(request.my_decision).toLowerCase() === 'approved' && request.my_acted_at && (
          <p className="mb-2 text-sm text-emerald-700">You approved this on {formatActedAt(request.my_acted_at)}</p>
        )}
        {pendingPartyNames(request.approval_parties).length > 0 && request.current_stage !== 'completed' && (
          <p className="mb-2 text-sm text-slate-600">Waiting for {pendingPartyNames(request.approval_parties).join(', ')} to approve</p>
        )}
        <ApprovalPartyList parties={request.approval_parties} />
        <div className="mt-4">
          <ApprovalTimeline
            progressLabel={required ? `${approvedCount} of ${required} approvers have approved` : undefined}
            steps={(request.approvals || []).map((app: any) => ({
              id: app.id,
              name: app.approver_name,
              action: app.decision,
              at: app.created_at,
              note: app.reason,
            }))}
          />
        </div>
        {(canApproveFirstLevel || canApproveSupervisor) && !isSharedView && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={actionBusy} onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              {canApproveSupervisor ? <ShieldCheck className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {canApproveSupervisor ? 'Supervisor Approve' : 'Approve'}
            </Button>
            <Button disabled={actionBusy} onClick={() => setShowRejectModal(true)} variant="destructive" className="gap-2">
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          </div>
        )}
      </DetailSection>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Reject Fuel Request</h3>
            <textarea
              rows={3}
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-rose-500"
            />
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => setShowRejectModal(false)} variant="outline" size="sm">Cancel</Button>
              <Button disabled={actionBusy || !rejectionReason.trim()} onClick={handleReject} variant="destructive" size="sm">
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </RequestDetailLayout>
  );
}
