import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText, DollarSign } from 'lucide-react';
import { API_URL } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ShareButton';
import { buildPreviewTable } from '@/lib/shareRecord';
import { ReferenceLinkCard } from '@/components/transport/ReferenceLinkCard';
import { formatActedAt } from '../../lib/approvalQueue';
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
import { shareTokenHeaders } from '@/lib/shareSession';
import { LinkedReferencesSection } from '@/components/references/LinkedReferencesSection';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
import { formatOwnReference } from '@/lib/referenceRegistry';

interface VehicleLineItem {
  id: string;
  description: string;
  qty_days: number;
  unit_price: number;
  total: number;
}

interface AttachmentItem {
  id: string;
  name: string;
  type: string;
  url?: string;
  mimeType?: string;
}

interface VehicleRentalRequest {
  id: number;
  ref_no?: string;
  transport_request_id?: number | null;
  requester_name?: string;
  department?: string;
  purpose?: string;
  deliver_to?: string;
  phone?: string;
  special_instructions?: string;
  order_no?: string;
  invoice_terms?: string;
  received_by?: string;
  line_items: VehicleLineItem[];
  attachments: AttachmentItem[];
  status: string;
  current_stage?: string;
  grand_total?: number;
  created_at?: string;
  updated_at?: string;
  selected_approver_ids?: number[];
  selected_approvers?: { id: number; name: string }[];
  approval_trail?: { approver_id: number; approver_name: string; decision: string; reason?: string | null; created_at?: string | null }[];
  approvals?: any[];
  approvals_count?: number;
  approvals_required?: number;
  approval_parties?: { id?: number; name: string; status: string; actedAt?: string | null }[];
  my_decision?: string | null;
  my_acted_at?: string | null;
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
}

const formatMoney = (value: number | undefined) => {
  if (!value) return 'GHC 0.00';
  return `GHC ${Number(value).toFixed(2)}`;
};

export default function VehicleRentalRequestDetailPage() {
  const { isSharedView, routeParams } = useSharedView();
  const { id: routeId } = useParams();
  const id = isSharedView ? routeParams?.id : routeId;
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [request, setRequest] = useState<VehicleRentalRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/transport/vehicle-requests/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}`, ...shareTokenHeaders('GET') },
      });

      if (!response.ok) {
        throw new Error('Failed to load request detail');
      }

      const data = await response.json();
      setRequest(data);
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
    return <div className="p-8 text-center text-sm text-slate-500">Loading vehicle rental request details...</div>;
  }

  if (!request) {
    return (
      <div className="mx-auto max-w-4xl p-6 text-center">
        <p className="text-slate-500">Request not found.</p>
        <Button onClick={() => navigate('/transport/rental-vehicle-requests')} variant="outline" className="mt-4">
          Back to List
        </Button>
      </div>
    );
  }

  const calculateGrandTotal = () => (request.line_items || []).reduce((sum, item) => sum + (item.total || 0), 0);
  const trail = request.approval_trail || [];
  const required = request.approvals_required || trail.length || request.selected_approvers?.length || 0;
  const approvedCount = request.approvals_count || trail.filter((a) => a.decision === 'approved').length;

  return (
    <RequestDetailLayout
      title="Vehicle Rental Request"
      reference={formatOwnReference('vehicle_request', request.id)}
      status={request.status}
      submittedBy={request.requester_name}
      submittedAt={request.created_at}
      headerActions={
        isSharedView ? null : (
        <ShareButton
          recordType="vehicle_request"
          recordId={request.id}
          pagePath={window.location.pathname}
          pageTitle={`Vehicle Rental Request ${formatOwnReference('vehicle_request', request.id)}`}
          recordPreview={{
            title: `Vehicle Rental Request ${formatOwnReference('vehicle_request', request.id)}`,
            reference: formatOwnReference('vehicle_request', request.id),
            status: request.status,
            requester: request.requester_name,
            department: request.department,
            purpose: request.purpose,
            deliver_to: request.deliver_to,
            total: request.grand_total != null ? formatMoney(request.grand_total) : undefined,
            submitted: request.created_at,
            tables: [
              buildPreviewTable(
                'Line Items',
                request.line_items?.map((li) => ({ description: li.description, qty_days: li.qty_days, unit_price: li.unit_price, total: li.total })),
                [
                  { key: 'description', label: 'Description' },
                  { key: 'qty_days', label: 'Qty/Days' },
                  { key: 'unit_price', label: 'Unit Price' },
                  { key: 'total', label: 'Total' },
                ]
              ),
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
      listPath="/transport/rental-vehicle-requests"
      pills={[
        { label: 'Type', value: 'Vehicle rental' },
        { label: 'Department', value: request.department },
        { label: 'Unit', value: request.deliver_to },
        { label: 'Reference', value: request.reference_number },
      ]}
      stats={[
        { icon: detailIcons.User, label: 'Requester', value: <PersonName value={request.requester_name} /> },
        { icon: detailIcons.Building2, label: 'Department', value: request.department || '—' },
        { icon: detailIcons.Calendar, label: 'Date submitted', value: request.created_at ? new Date(request.created_at).toLocaleDateString() : '—' },
        { icon: detailIcons.Link2, label: 'Reference', value: request.reference_number || (request.transport_request_id ? `#${request.transport_request_id}` : 'None') },
      ]}
    >
      {(request.my_decision || (request.approval_parties && request.approval_parties.length > 0)) && (
        <DetailSection title="Approval progress" icon={detailIcons.Calendar}>
          <ApprovalProgress item={request} currentUserId={Number(user?.id)} />
          {String(request.my_decision || '').toLowerCase() === 'approved' && (
            <p className="mt-1 text-sm text-emerald-700">You approved this on {formatActedAt(request.my_acted_at)}</p>
          )}
          <ApprovalPartyList
            parties={
              request.approval_parties ||
              request.approval_trail?.map((item) => ({
                id: item.approver_id,
                name: item.approver_name,
                status: item.decision,
                actedAt: item.created_at,
              }))
            }
          />
        </DetailSection>
      )}

      <DetailSection title="Request details" icon={FileText}>
        <div className="grid gap-5 sm:grid-cols-2">
          <DetailField label="Requester" value={<PersonName value={request.requester_name} />} />
          <DetailField label="Department" value={request.department} />
          <DetailField label="Purpose" value={request.purpose} />
          <DetailField label="Deliver to" value={request.deliver_to} />
          <DetailField label="Phone" value={request.phone} />
          <DetailField label="Order no." value={request.order_no} />
          <DetailField label="Invoice terms" value={request.invoice_terms} />
          <DetailField label="Received by" value={request.received_by} />
          <div className="sm:col-span-2">
            <DetailField label="Special instructions" value={request.special_instructions || '—'} />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Reference link" icon={detailIcons.Link2}>
        {request.transport_request_id && (
          <p className="mb-3 text-sm">
            Linked transport request:{' '}
            <Link to={`/transport-requests/${request.transport_request_id}`} className="font-semibold text-[var(--primary)] underline">
              #{request.transport_request_id}
            </Link>
          </p>
        )}
        <ReferenceLinkCard reference={request} />
      </DetailSection>

      {!isSharedView && <LinkedReferencesSection recordType="vehicle_request" recordId={request.id} />}

      {!isSharedView && <WorkflowTimeline workflowType="vehicle_request" recordId={request.id} />}

      <DetailSection title="Cost table" icon={DollarSign}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="text-[var(--text-muted)]">
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2 text-right">Qty / Days</th>
                <th className="px-2 py-2 text-right">Unit price</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(request.line_items || []).map((item, index) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-2 py-2">{index + 1}</td>
                  <td className="px-2 py-2 font-semibold">{item.description || '—'}</td>
                  <td className="px-2 py-2 text-right">{item.qty_days || 0}</td>
                  <td className="px-2 py-2 text-right">{formatMoney(item.unit_price)}</td>
                  <td className="px-2 py-2 text-right font-semibold">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-right">
          <p className="text-xs uppercase text-amber-800">Grand total</p>
          <p className="text-2xl font-bold text-amber-900">{formatMoney(calculateGrandTotal())}</p>
        </div>
      </DetailSection>

      <DetailSection title="Attachments" icon={detailIcons.Paperclip}>
        <AttachmentGrid files={request.attachments || []} />
      </DetailSection>

      <DetailSection title="Approval trail" icon={detailIcons.Calendar}>
        <ApprovalTimeline
          progressLabel={required ? `${approvedCount} of ${required} approvers have approved` : undefined}
          steps={
            trail.length
              ? trail.map((approval) => ({
                  id: approval.approver_id,
                  name: approval.approver_name,
                  action: approval.decision,
                  at: approval.created_at,
                  note: approval.reason,
                }))
              : (request.selected_approvers || []).map((approver) => ({
                  id: approver.id,
                  name: approver.name,
                  action: 'pending',
                }))
          }
        />
      </DetailSection>
    </RequestDetailLayout>
  );
}
