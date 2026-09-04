'use client';
import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { getRequestDetails, updateRequest, getItems } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Save, X, Plus, Printer } from 'lucide-react';
import { RecordChatButton } from '@/components/chat/RecordChatButton';
import { ShareButton } from '@/components/ShareButton';
import { ApproveRejectActions } from '@/components/requests/ApproveRejectActions';
import { buildPreviewTable } from '@/lib/shareRecord';
import { PersonName } from '@/components/PersonName';
import { useSharedView } from '@/context/SharedViewContext';
import { WorkflowTimeline } from '@/components/timeline/WorkflowTimeline';
// GLOBAL DATE FORMAT — EXACTLY LIKE PENDING APPROVALS
const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
};
interface RequestItem {
  id: number;
  request_id: number;
  item_id: number;
  quantity_requested: number | null;
  quantity_received: number | null;
  quantity_returned: number | null;
  item_name: string;
  serial_number?: string | null;
}
interface Approval {
  id: number;
  request_id: number;
  approver_name: string;
  signature: string;
  approved_at: string;
}
interface Rejection {
  id: number;
  request_id: number;
  rejector_name: string;
  reason: string;
  created_at: string;
}
interface LinkedCashRequest {
  id: number;
  purpose?: string | null;
  department?: string | null;
  total_amount?: number | string | null;
  status?: string | null;
  created_at?: string | null;
}
interface LinkedMaterialRequest {
  id: number;
  project_name?: string | null;
  location?: string | null;
  status?: string | null;
  created_at?: string | null;
}
interface RequestDetails {
  id: number;
  type?: 'material_request' | 'item_return';
  created_by: string;
  team_leader_name?: string;
  team_leader_phone?: string;
  project_name: string;
  isp_name?: string;
  location: string;
  deployment_type?: 'Deployment' | 'Maintenance';
  release_by: string | null;
  released_at?: string | null;
  received_by: string | null;
  reason?: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  items: RequestItem[];
  approvals: Approval[];
  rejections?: Rejection[];
  car_number?: string | null;
  drivers_name?: string | null;
  drivers_contact?: string | null;
  address?: string | null;
  project_description?: string | null;
  chat_channel_id?: string | null;
  linked_cash_request?: LinkedCashRequest | null;
  linked_material_requests?: LinkedMaterialRequest[];
}
interface EditableItem {
  name: string;
  requested?: number;
  received?: number;
  returned?: number;
  serial_number?: string;
}
const RequestDetails: React.FC = () => {
  const { isSharedView, routeParams } = useSharedView();
  const { id: routeId } = useParams<{ id: string }>();
  const id = isSharedView ? routeParams?.id : routeId;
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { returnTo?: string; returnLabel?: string } | null;
  const { toast } = useToast();
  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<RequestDetails>>({});
  const [allItems, setAllItems] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<EditableItem[]>([]);
  useEffect(() => {
    loadData();
  }, [id]);
  const loadData = async () => {
    try {
      setLoading(true);
      const [requestData, itemsData] = await Promise.all([
        getRequestDetails(id!),
        getItems()
      ]);
     
      setRequest(requestData);
      setEditData(requestData);
      setAllItems(itemsData);
      setSelectedItems(
        requestData.items.map(item => {
          const base = {
            name: item.item_name,
            requested: item.quantity_requested || 0,
            received: item.quantity_received || 0,
            returned: item.quantity_returned || 0,
            serial_number: item.serial_number || ''
          };
          if (requestData.type === 'item_return') {
            base.returned = item.quantity_requested || 0;
          }
          return base;
        })
      );
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load request details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleFieldChange = (field: keyof RequestDetails, value: any) => {
    setEditData({ ...editData, [field]: value });
  };
  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...selectedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedItems(newItems);
  };
  const addItemRow = () => {
    const newItem: EditableItem = request?.type === 'item_return'
      ? { name: '', returned: 0, serial_number: '' }
      : { name: '', requested: 0, received: 0, returned: 0, serial_number: '' };
    setSelectedItems([...selectedItems, newItem]);
  };
  const removeItemRow = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };
  const handleSaveEdit = async () => {
    try {
      const isReturn = request?.type === 'item_return';
      const itemsToSave = selectedItems.map(item => ({
        ...item,
        requested: isReturn ? (item.returned || 0) : (item.requested || 0)
      }));
      await updateRequest(id!, {
        createdBy: editData.created_by,
        ...(isReturn ? { reason: editData.reason } : {
          teamLeaderName: editData.team_leader_name,
          teamLeaderPhone: editData.team_leader_phone,
          projectName: editData.project_name,
          ispName: editData.isp_name,
          location: editData.location,
          deployment: editData.deployment_type,
        }),
        items: itemsToSave
      });
      setEditing(false);
      await loadData();
      toast({
        title: "Success",
        description: "Request updated successfully",
      });
    } catch (error) {
      console.error('Error updating request:', error);
      toast({
        title: "Error",
        description: "Failed to update request",
        variant: "destructive"
      });
    }
  };
  const handleCancelEdit = () => {
    setEditing(false);
    setEditData(request!);
    setSelectedItems(
      request!.items.map(item => {
        const base = {
          name: item.item_name,
          requested: item.quantity_requested || 0,
          received: item.quantity_received || 0,
          returned: item.quantity_returned || 0,
          serial_number: item.serial_number || ''
        };
        if (request!.type === 'item_return') {
          base.returned = item.quantity_requested || 0;
        }
        return base;
      })
    );
  };
  const handlePrint = () => {
    const printContent = document.getElementById('print-content');
    if (printContent) {
      const originalContent = document.body.innerHTML;
      document.body.innerHTML = printContent.innerHTML;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };
  if (loading) {
    return <LoadingState />;
  }
  if (!request) {
    return <NotFoundState />;
  }
  const isReturn = request.type === 'item_return';
  const isEditable = request.status === 'pending';
  const isWaybill = !!request.car_number || !!request.drivers_name || !!request.drivers_contact || !!request.address || !!request.project_description;
  const statusConfig = getStatusConfig(request.status);
  const statusText = request.status.charAt(0).toUpperCase() + request.status.slice(1);
  const formTitle = isWaybill ? 'WAYBILL' : isReturn ? 'ITEM RETURN FORM' : 'REQUEST FORM FOR MATERIALS';
  const requesterLabel = isReturn ? 'Returned by' : 'Requested by';
  return (
    <div className="inv-theme space-y-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => (navState?.returnTo ? navigate(navState.returnTo) : navigate('/request-forms'))}
            className="border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {navState?.returnLabel || 'Back to List'}
          </Button>
          <div className="flex space-x-3">
            {!isSharedView && (
              <ShareButton
                recordType={isReturn ? 'item_return' : 'material_request'}
                recordId={request.id}
                pagePath={window.location.pathname}
                pageTitle={`${isReturn ? 'Item Return' : 'Material Request'} #${request.id}`}
                recordPreview={{
                  title: `${isReturn ? 'Item Return' : 'Material Request'} #${request.id}`,
                  reference: `#${request.id}`,
                  status: statusText,
                  requester: request.created_by,
                  project: request.project_name,
                  location: request.location,
                  deployment_type: request.deployment_type,
                  team_leader: request.team_leader_name,
                  reason: request.reason,
                  submitted: request.created_at,
                  tables: [
                    buildPreviewTable(
                      'Items',
                      request.items?.map((i) => ({
                        item: i.item_name,
                        requested: i.quantity_requested,
                        received: i.quantity_received,
                        returned: i.quantity_returned,
                      })),
                      [
                        { key: 'item', label: 'Item' },
                        { key: 'requested', label: 'Qty Requested' },
                        { key: 'received', label: 'Qty Received' },
                        { key: 'returned', label: 'Qty Returned' },
                      ]
                    ),
                    buildPreviewTable(
                      'Approvals',
                      request.approvals?.map((a) => ({ approver: a.approver_name, approved_at: new Date(a.approved_at).toLocaleString() })),
                      [
                        { key: 'approver', label: 'Approver' },
                        { key: 'approved_at', label: 'Approved At' },
                      ]
                    ),
                  ].filter(Boolean),
                }}
              />
            )}
            {!isSharedView && (
              <RecordChatButton
                recordType={isReturn ? 'item_return' : 'material_request'}
                recordId={request.id}
                chatChannelId={request.chat_channel_id}
              />
            )}
            {!isSharedView && request.status === 'pending' && (
              <ApproveRejectActions
                requestId={request.id}
                stage="approver"
                kind={isReturn ? 'Item Return' : 'Material Request'}
                onDone={loadData}
              />
            )}
            {!isSharedView && (
              <ActionButtons
                isEditable={isEditable}
                editing={editing}
                onEdit={() => setEditing(true)}
                onCancel={handleCancelEdit}
                onSave={handleSaveEdit}
              />
            )}
            {!isSharedView && request.status === 'completed' && (
              <Button
                onClick={handlePrint}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            )}
          </div>
        </div>
        <div className="bg-[var(--surface)] rounded-lg shadow-md border border-[var(--border)] p-8 shadow-[var(--shadow-md)]" id="screen-content">
          <div className="text-center mb-8 pb-8 border-b border-[var(--border)]">
            <img
              src="/vobiss-logo.png"
              alt="VOBISS Logo"
              className="h-16 mx-auto mb-4"
            />
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">{formTitle}</h1>
          </div>
          <div className="flex justify-end mb-8">
            <StatusBadge status={statusText} config={statusConfig} />
          </div>
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-6 border-b border-[var(--border)] pb-2">
              {isReturn ? 'Return Information' : 'Project Information'}
            </h2>
            <div className="bg-[var(--content-bg)] rounded-lg p-6">
              <div className="mb-6 italic text-[var(--text-secondary)] text-center border-b border-[var(--border)] pb-3">
                <p className="text-lg">{requesterLabel}: <span className="font-semibold"><PersonName value={request.created_by} /></span></p>
              </div>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {isReturn ? (
                    <>
                      <DetailField
                        label="Project Name"
                        value={editData.project_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('project_name', val)}
                      />
                      <DetailField
                        label="Location"
                        value={editData.location}
                        editing={true}
                        onChange={(val) => handleFieldChange('location', val)}
                      />
                      <div className="lg:col-span-3">
                        <ReasonField
                          label="Return Reason"
                          value={editData.reason || ''}
                          editing={true}
                          onChange={(val) => handleFieldChange('reason', val)}
                        />
                      </div>
                      <DetailField
                        label="Received By"
                        value={request.received_by || '—'}
                        editing={false}
                      />
                      <DateField
                        label="Created At"
                        value={request.created_at}
                      />
                      <DateField
                        label="Updated At"
                        value={request.updated_at}
                      />
                    </>
                  ) : (
                    <>
                      <DetailField
                        label="Project Name"
                        value={editData.project_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('project_name', val)}
                      />
                      <DetailField
                        label="Team Leader Name"
                        value={editData.team_leader_name}
                        editing={true}
                        onChange={(val) => handleFieldChange('team_leader_name', val)}
                      />
                      <DetailField
                        label="Team Leader Phone"
                        value={editData.team_leader_phone}
                        editing={true}
                        onChange={(val) => handleFieldChange('team_leader_phone', val)}
                      />
                      <DetailField
                        label="ISP Name"
                        value={editData.isp_name || '—'}
                        editing={true}
                        onChange={(val) => handleFieldChange('isp_name', val)}
                      />
                      <DetailField
                        label="Location"
                        value={editData.location}
                        editing={true}
                        onChange={(val) => handleFieldChange('location', val)}
                      />
                      <DeploymentTypeField
                        value={editData.deployment_type}
                        editing={true}
                        onChange={(val) => handleFieldChange('deployment_type', val)}
                      />
                      <DetailField
                        label="Received By"
                        value={request.received_by || '—'}
                        editing={false}
                      />
                      <DateField
                        label="Created At"
                        value={request.created_at}
                      />
                      <DateField
                        label="Updated At"
                        value={request.updated_at}
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                  <table className="min-w-full divide-y divide-[var(--border)]">
                    <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)] bg-[var(--content-bg)]">Project Name</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.project_name || '—'}</td>
                      </tr>
                      {!isReturn && (
                        <>
                          <tr className="bg-[var(--content-bg)]">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Team Leader Name</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.team_leader_name || '—'}</td>
                          </tr>
                          <tr>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)] bg-[var(--content-bg)]">Team Leader Phone</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.team_leader_phone || '—'}</td>
                          </tr>
                          <tr className="bg-[var(--content-bg)]">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">ISP Name</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.isp_name || '—'}</td>
                          </tr>
                        </>
                      )}
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)] bg-[var(--content-bg)]">Location</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.location || '—'}</td>
                      </tr>
                      {isReturn && (
                        <tr className="bg-[var(--content-bg)]">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Return Reason</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.reason || '—'}</td>
                        </tr>
                      )}
                      {!isReturn && (
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)] bg-[var(--content-bg)]">Project Type</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{editData.deployment_type || '—'}</td>
                        </tr>
                      )}
                      <tr className="bg-[var(--content-bg)]">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Received By</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{request.received_by || '—'}</td>
                      </tr>
                      <tr className="bg-[var(--content-bg)]">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Created At</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{formatDateTime(request.created_at)}</td>
                      </tr>
                      <tr className="bg-[var(--content-bg)]">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Updated At</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--text-primary)]">{formatDateTime(request.updated_at)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
          <div className="space-y-8">
            <ItemsTable
              items={editing ? selectedItems : request.items}
              editing={editing}
              allItems={allItems}
              onItemChange={handleItemChange}
              onRemoveRow={removeItemRow}
              onAddRow={addItemRow}
              isEditable={isEditable}
              isReturn={isReturn}
            />
            <HistorySection
              approvals={request.approvals}
              rejections={request.rejections}
              releaseBy={request.release_by}
              linkedCashRequest={request.linked_cash_request}
              linkedMaterialRequests={request.linked_material_requests}
            />
            {isWaybill && (
              <WaybillSection request={request} />
            )}
          </div>
        </div>
      </div>
      {/* PRINT VIEW */}
      <div id="print-content" className="hidden">
        <div className="p-1 max-w-4xl mx-auto bg-white">
          <header className="mb-2 border-b border-gray-500 pb-1 flex items-start justify-between">
            <img
              src="/vobiss-logo.png"
              alt="VOBISS Logo"
              className="h-14"
            />
            <div className="flex-1 text-center mx-1">
              <h1 className="text-xl font-bold uppercase tracking-wide text-gray-900">{formTitle}</h1>
            </div>
            <div className="text-right bg-gray-50 border border-gray-300 rounded px-1 py-0.5">
              <StatusBadgePrint status={statusText} config={statusConfig} />
            </div>
          </header>
          <section className="mb-2">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">
              {isReturn ? 'Return Information' : 'Project Information'}
            </h2>
            <div className="italic text-gray-600 mb-1 text-center border-b border-gray-200 pb-0.5 font-serif">
              <p className="text-sm">{requesterLabel}: <span className="font-medium text-gray-900"><PersonName value={request.created_by} /></span></p>
            </div>
            <div className="overflow-hidden rounded border border-gray-300">
              <table className="w-full text-xs bg-white">
                <tbody>
                  <tr className="border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Project Name</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.project_name || '—'}</td>
                  </tr>
                  {!isReturn && (
                    <>
                      <tr className="bg-gray-50 border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Team Leader Name</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.team_leader_name || '—'}</td>
                      </tr>
                      <tr className="border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Team Leader Phone</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.team_leader_phone || '—'}</td>
                      </tr>
                      <tr className="bg-gray-50 border-b border-gray-300">
                        <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">ISP Name</td>
                        <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.isp_name || '—'}</td>
                      </tr>
                    </>
                  )}
                  <tr className="border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Location</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.location || '—'}</td>
                  </tr>
                  {isReturn && (
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Return Reason</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.reason || '—'}</td>
                    </tr>
                  )}
                  {!isReturn && (
                    <tr className="border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Project Type</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{editData.deployment_type || '—'}</td>
                    </tr>
                  )}
                  <tr className="bg-gray-50 border-b border-gray-300">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Received By</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.received_by || '—'}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Created At</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{formatDateTime(request.created_at)}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Updated At</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{formatDateTime(request.updated_at)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <hr className="my-1 border-gray-300" />
          <section className="mb-2">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">Items</h2>
            <div className="overflow-hidden rounded border border-gray-300">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Item Name</th>
                    {!isReturn ? (
                      <>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Requested</th>
                        <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Received</th>
                      </>
                    ) : null}
                    <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Returned</th>
                    <th className="border border-gray-300 px-3 py-1.5 text-left font-bold text-gray-900 uppercase tracking-wide text-xs">Serial Number</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {request.items.map((item, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 px-3 py-1.5 font-medium text-gray-900 text-xs">{item.item_name}</td>
                      {!isReturn ? (
                        <>
                          <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.quantity_requested || 0}</td>
                          <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.quantity_received || '—'}</td>
                        </>
                      ) : null}
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{isReturn ? (item.quantity_requested || 0) : (item.quantity_returned || '—')}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium text-xs">{item.serial_number || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="mb-4">
            <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">History</h2>
            <div className="border border-gray-300 rounded p-2 bg-gray-50 text-xs">
              {request.release_by && (
                <div className="mb-2 pb-1 border-b border-gray-200">
                  <div className="flex mb-0.5 font-bold text-gray-900"><span className="w-16">Issuer:</span><span className="ml-1">{request.release_by}</span></div>
                  <div className="flex text-gray-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{formatDateTime(request.released_at || request.updated_at)}</span></div>
                </div>
              )}
              {request.approvals.length > 0 && (
                <div className="mb-2 pb-1 border-b border-gray-200">
                  <h3 className="font-bold text-blue-900 mb-1">Approvals</h3>
                  {request.approvals.map((approval, index) => (
                    <div key={approval.id} className={`pb-2 ${index < request.approvals.length - 1 ? 'border-b border-gray-200 mb-2' : ''}`}>
                      <div className="flex mb-0.5 font-bold text-gray-900"><span className="w-16">Approver:</span><span className="ml-1"><PersonName value={approval.approver_name} /></span></div>
                      <div className="flex mb-0.5 text-gray-700"><span className="w-16 font-medium">Signature:</span><span className="ml-1 italic">{approval.signature}</span></div>
                      <div className="flex text-gray-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{formatDateTime(approval.approved_at)}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {request.rejections && request.rejections.length > 0 ? (
                <div>
                  <h3 className="font-bold text-red-900 mb-1">Rejections</h3>
                  {request.rejections.map((rejection, index) => (
                    <div key={rejection.id} className={`pb-2 ${index < request.rejections!.length - 1 ? 'border-b border-gray-200 mb-2' : ''}`}>
                      <div className="flex mb-0.5 font-bold text-red-900"><span className="w-16">Rejector:</span><span className="ml-1">{rejection.rejector_name}</span></div>
                      <div className="flex mb-0.5 text-red-700"><span className="w-16 font-medium">Reason:</span><span className="ml-1 italic">{rejection.reason}</span></div>
                      <div className="flex text-red-700"><span className="w-16">Date:</span><span className="ml-1 font-medium">{formatDateTime(rejection.created_at)}</span></div>
                    </div>
                  ))}
                </div>
              ) : null}
              {(!request.approvals.length && (!request.rejections || request.rejections.length === 0)) && (
                <p className="italic text-gray-500 text-center py-2 font-serif">No history recorded yet</p>
              )}
            </div>
          </section>
          {!isSharedView && (
            <section className="mb-4">
              <WorkflowTimeline workflowType={request.type || 'material_request'} recordId={request.id} />
            </section>
          )}
          {isWaybill && (
            <section className="mb-4">
              <h2 className="text-base font-bold mb-1 border-b border-gray-300 pb-0.5 text-gray-800">Waybill Details</h2>
              <div className="overflow-hidden rounded border border-gray-300">
                <table className="w-full text-xs bg-white">
                  <tbody>
                    <tr className="border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Car Number</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.car_number || '—'}</td>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Driver's Name</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.drivers_name || '—'}</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Driver's Contact</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.drivers_contact || '—'}</td>
                    </tr>
                    <tr className="bg-gray-50 border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 text-gray-900">Address</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.address || '—'}</td>
                    </tr>
                    <tr className="border-b border-gray-300">
                      <td className="font-bold border-r border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-900">Project Description</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-gray-800 font-medium">{request.project_description || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-content, #print-content * {
            visibility: visible;
          }
          #print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          #screen-content {
            display: none !important;
          }
          .toast {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
          #print-content {
            font-family: 'Times New Roman', serif;
            line-height: 1.2;
            font-size: 10pt;
          }
          table {
            page-break-inside: avoid;
          }
          h1, h2 {
            page-break-after: avoid;
          }
        }
      `}</style>
    </div>
  );
};
const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-[var(--primary)] mx-auto mb-4"></div>
      <p className="text-[var(--text-secondary)] font-medium">Loading request details...</p>
    </div>
  </div>
);
const NotFoundState: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <p className="text-[var(--text-secondary)] font-medium">Request not found</p>
  </div>
);
interface ActionButtonsProps {
  isEditable: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}
const ActionButtons: React.FC<ActionButtonsProps> = ({
  isEditable,
  editing,
  onEdit,
  onCancel,
  onSave
}) => {
  if (!isEditable) return null;
  return (
    <div className="flex space-x-3">
      {!editing ? (
        <Button onClick={onEdit} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Edit className="h-4 w-4 mr-2" />
          Edit Details
        </Button>
      ) : (
        <>
          <Button onClick={onCancel} variant="outline" className="border-gray-300 hover:bg-gray-100">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={onSave} className="bg-green-600 hover:bg-green-700 text-white">
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </>
      )}
    </div>
  );
};
interface StatusConfig {
  bg: string;
  text: string;
  border: string;
}
function getStatusConfig(status: string): StatusConfig {
  const configs: Record<string, StatusConfig> = {
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    approved: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    completed: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    rejected: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' }
  };
  return configs[status] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };
}
interface StatusBadgeProps {
  status: string;
  config: StatusConfig;
}
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, config }) => (
  <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium ${config.bg} ${config.text} border ${config.border}`}>
    {status}
  </span>
);
const StatusBadgePrint: React.FC<StatusBadgeProps> = ({ status, config }) => (
  <div className={`px-1 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text} border ${config.border} inline-block uppercase font-bold`}>
    {status}
  </div>
);
interface DetailFieldProps {
  label: string;
  value: any;
  editing?: boolean;
  onChange?: (value: any) => void;
}
const DetailField: React.FC<DetailFieldProps> = ({ label, value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    {editing && onChange ? (
      <Input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
      />
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value || '—'}</p>
    )}
  </div>
);
interface ReasonFieldProps {
  label: string;
  value: string;
  editing?: boolean;
  onChange?: (value: string) => void;
}
const ReasonField: React.FC<ReasonFieldProps> = ({ label, value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    {editing && onChange ? (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 min-h-[80px]"
      />
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value || '—'}</p>
    )}
  </div>
);
interface DeploymentTypeFieldProps {
  value: string | undefined;
  editing: boolean;
  onChange: (value: string) => void;
}
const DeploymentTypeField: React.FC<DeploymentTypeFieldProps> = ({ value, editing, onChange }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">Project Type</label>
    {editing ? (
      <Select value={value || ''} onValueChange={onChange}>
        <SelectTrigger className="mt-1 w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Deployment">Deployment</SelectItem>
          <SelectItem value="Maintenance">Maintenance</SelectItem>
        </SelectContent>
      </Select>
    ) : (
      <p className="mt-1 text-base font-medium text-gray-800">{value || '—'}</p>
    )}
  </div>
);
interface DateFieldProps {
  label: string;
  value: string;
}
const DateField: React.FC<DateFieldProps> = ({ label, value }) => (
  <div>
    <label className="block text-sm font-medium text-gray-600">{label}</label>
    <p className="mt-1 text-sm text-gray-600">{formatDateTime(value)}</p>
  </div>
);
interface ItemsTableProps {
  items: any[];
  editing: boolean;
  allItems: any[];
  onItemChange: (index: number, field: string, value: any) => void;
  onRemoveRow: (index: number) => void;
  onAddRow: () => void;
  isEditable: boolean;
  isReturn: boolean;
}
const ItemsTable: React.FC<ItemsTableProps> = ({
  items,
  editing,
  allItems,
  onItemChange,
  onRemoveRow,
  onAddRow,
  isEditable,
  isReturn
}) => (
  <div>
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-800">Items</h2>
      {isEditable && editing && (
        <Button onClick={onAddRow} variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800">
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Item Name</th>
            {!isReturn ? (
              <>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Requested</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Received</th>
              </>
            ) : null}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Returned</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Serial Number</th>
            {editing && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item: any, index: number) => (
            <ItemRow
              key={index}
              index={index}
              item={item}
              editing={editing}
              allItems={allItems}
              onItemChange={onItemChange}
              onRemoveRow={onRemoveRow}
              isReturn={isReturn}
            />
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
interface ItemRowProps {
  index: number;
  item: any;
  editing: boolean;
  allItems: any[];
  onItemChange: (index: number, field: string, value: any) => void;
  onRemoveRow: (index: number) => void;
  isReturn: boolean;
}
const ItemRow: React.FC<ItemRowProps> = ({
  index,
  item,
  editing,
  allItems,
  onItemChange,
  onRemoveRow,
  isReturn
}) => (
  <tr className="hover:bg-gray-50">
    {editing ? (
      <>
        <td className="px-4 py-3">
          <Select value={item.name} onValueChange={(val) => onItemChange(index, 'name', val)}>
            <SelectTrigger className="w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500">
              <SelectValue placeholder="Select item" />
            </SelectTrigger>
            <SelectContent>
              {allItems.map((i) => (
                <SelectItem key={i.id} value={i.name}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        {!isReturn ? (
          <>
            <td className="px-4 py-3">
              <Input
                type="number"
                value={item.requested}
                onChange={(e) => onItemChange(index, 'requested', parseInt(e.target.value) || 0)}
                className="w-20 rounded-md border-gray-300"
                min="0"
              />
            </td>
            <td className="px-4 py-3">
              <Input
                type="number"
                value={item.received || 0}
                onChange={(e) => onItemChange(index, 'received', parseInt(e.target.value) || 0)}
                className="w-20 rounded-md border-gray-300"
                min="0"
              />
            </td>
          </>
        ) : null}
        <td className="px-4 py-3">
          <Input
            type="number"
            value={item.returned || 0}
            onChange={(e) => onItemChange(index, 'returned', parseInt(e.target.value) || 0)}
            className="w-20 rounded-md border-gray-300"
            min="0"
          />
        </td>
        <td className="px-4 py-3">
          <Input
            type="text"
            value={item.serial_number || ''}
            onChange={(e) => onItemChange(index, 'serial_number', e.target.value)}
            className="w-full rounded-md border-gray-300"
            placeholder="Enter serial number"
          />
        </td>
        <td className="px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onRemoveRow(index)}
            className="text-red-500 hover:bg-red-50"
          >
            <X className="h-4 w-4" />
          </Button>
        </td>
      </>
    ) : (
      <>
        <td className="px-4 py-3 text-sm font-medium text-gray-800">{item.item_name || item.name}</td>
        {!isReturn ? (
          <>
            <td className="px-4 py-3 text-sm text-gray-800">{item.quantity_requested || item.requested || 0}</td>
            <td className="px-4 py-3 text-sm text-gray-800">{item.quantity_received || item.received || '—'}</td>
          </>
        ) : null}
        <td className="px-4 py-3 text-sm text-gray-800">{isReturn ? (item.quantity_requested || item.requested || 0) : (item.quantity_returned || item.returned || '—')}</td>
        <td className="px-4 py-3 text-sm text-gray-800">{item.serial_number || '—'}</td>
      </>
    )}
  </tr>
);
interface HistorySectionProps {
  approvals: any[];
  rejections?: any[];
  releaseBy?: string | null;
  linkedCashRequest?: LinkedCashRequest | null;
  linkedMaterialRequests?: LinkedMaterialRequest[];
}
const HistorySection: React.FC<HistorySectionProps> = ({ approvals, rejections, releaseBy, linkedCashRequest, linkedMaterialRequests = [] }) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-800 mb-4">History</h2>
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-100 p-4">
      {releaseBy && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <p className="text-sm font-medium text-gray-800">Issuer: {releaseBy}</p>
        </div>
      )}
      {linkedCashRequest && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-green-800 mb-2">Linked Cash Request</h3>
          <div className="border-l-4 border-green-500 pl-4 py-2 bg-green-50 rounded">
            <Link to={`/cash-details/${linkedCashRequest.id}`} className="text-sm font-semibold text-green-800 hover:underline">
              Cash Request #{linkedCashRequest.id}
            </Link>
            <p className="text-sm text-gray-700">{linkedCashRequest.purpose || linkedCashRequest.department || 'No purpose added'}</p>
            <p className="text-sm text-gray-600">
              Amount: GHS {Number(linkedCashRequest.total_amount || 0).toFixed(2)} • Status: {(linkedCashRequest.status || 'pending').replace('_', ' ')}
            </p>
            <p className="text-xs text-gray-500">Created: {formatDateTime(linkedCashRequest.created_at)}</p>
          </div>
        </div>
      )}
      {linkedMaterialRequests.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Linked Material Requests</h3>
          {linkedMaterialRequests.map((linked) => (
            <div key={linked.id} className="border-l-4 border-blue-500 pl-4 py-2 mb-3 bg-blue-50 rounded">
              <Link to={`/request-forms/${linked.id}`} className="text-sm font-semibold text-blue-800 hover:underline">
                Material Request #{linked.id}
              </Link>
              <p className="text-sm text-gray-700">{linked.project_name || linked.location || 'No project added'}</p>
              <p className="text-xs text-gray-500">
                Status: {(linked.status || 'pending').replace('_', ' ')} • Created: {formatDateTime(linked.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
      {approvals.length > 0 && (
        <div className="mb-3 pb-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Approvals</h3>
          {approvals.map((approval) => (
            <div key={approval.id} className="border-l-4 border-blue-500 pl-4 py-2 mb-3 bg-blue-50 rounded">
              <p className="text-sm font-medium text-gray-800"><PersonName value={approval.approver_name} /></p>
              <p className="text-sm text-gray-600">Signature: {approval.signature}</p>
              <p className="text-sm text-gray-600">Approved: {formatDateTime(approval.approved_at)}</p>
            </div>
          ))}
        </div>
      )}
      {rejections && rejections.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-800 mb-2">Rejections</h3>
          {rejections.map((rejection) => (
            <div key={rejection.id} className="border-l-4 border-red-500 pl-4 py-2 mb-3 bg-red-50 rounded">
              <p className="text-sm font-medium text-red-800">Rejected by: {rejection.rejector_name}</p>
              <p className="text-sm text-red-600"><strong>Reason:</strong> {rejection.reason}</p>
              <p className="text-sm text-red-600">Rejected: {formatDateTime(rejection.created_at)}</p>
            </div>
          ))}
        </div>
      )}
      {(!releaseBy && !linkedCashRequest && linkedMaterialRequests.length === 0 && !approvals.length && (!rejections || rejections.length === 0)) && (
        <p className="text-gray-600 italic text-center py-4">No history recorded yet</p>
      )}
    </div>
  </div>
);
interface WaybillSectionProps {
  request: RequestDetails;
}
const WaybillSection: React.FC<WaybillSectionProps> = ({ request }) => (
  <div>
    <h2 className="text-lg font-semibold text-gray-800 mb-4">Waybill Details</h2>
    <div className="bg-gray-50 rounded-lg shadow-sm border border-gray-100 p-6">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Car Number</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.car_number || '—'}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Driver's Name</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.drivers_name || '—'}</td>
            </tr>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Driver's Contact</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.drivers_contact || '—'}</td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Address</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.address || '—'}</td>
            </tr>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 bg-gray-50">Project Description</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{request.project_description || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
export default RequestDetails;
