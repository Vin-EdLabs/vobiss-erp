import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, Clock3, XCircle, Fuel, Eye, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFuelRequests, approveFuelRequest, rejectFuelRequest, type FuelRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { classifyApprovalQueueItem, type ApprovalQueueTab } from '../../lib/approvalQueue';
import { QueueStatusBadge } from '../../components/approvals/ApprovalProgress';

const statusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

export default function FuelApprovalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ApprovalQueueTab>('pending_mine');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [approveRequest, setApproveRequest] = useState<FuelRequest | null>(null);
  const [approvalSignature, setApprovalSignature] = useState('');
  const [rejectRequest, setRejectRequest] = useState<FuelRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filteredRequests = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesTab = classifyApprovalQueueItem(request) === activeTab;
      const matchesSearch =
        !normalized ||
        [
          request.ref_no,
          request.requester_name,
          request.vehicle_plate,
          request.fuel_type,
          request.project_ticket_ref,
          request.purpose,
        ].some((value) => (value || '').toLowerCase().includes(normalized));

      return matchesTab && matchesSearch;
    });
  }, [requests, searchTerm, activeTab]);

  const load = async () => {
    try {
      setLoading(true);
      const all = await getFuelRequests();
      setRequests(all);
    } catch (error) {
      console.error(error);
      toast({ title: 'Unable to load fuel approvals', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id, user?.role, user?.main_role]);

  const handleApprove = async () => {
    if (!approveRequest) return;
    if (!approvalSignature.trim()) {
      toast({ title: 'Signature required', description: 'Please add notes or a digital signature before approving.', variant: 'destructive' });
      return;
    }
    try {
      setBusyId(approveRequest.id);
      await approveFuelRequest(approveRequest.id, { reason: approvalSignature.trim() });
      toast({ title: 'Fuel Request Approved', description: `Request ${approveRequest.ref_no} moved forward.`, variant: 'default' });
      setApproveRequest(null);
      setApprovalSignature('');
      await load();
    } catch (error: any) {
      toast({ title: 'Approval failed', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectRequest) return;
    if (!rejectReason.trim()) {
      toast({ title: 'Reason required', description: 'Please enter a rejection reason.', variant: 'destructive' });
      return;
    }
    try {
      setBusyId(rejectRequest.id);
      await rejectFuelRequest(rejectRequest.id, { reason: rejectReason.trim() });
      toast({ title: 'Fuel Request Rejected', description: `Request ${rejectRequest.ref_no} was rejected.`, variant: 'default' });
      setRejectRequest(null);
      setRejectReason('');
      await load();
    } catch (error: any) {
      toast({ title: 'Rejection failed', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
            <Fuel className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Fuel Approvals</h1>
            <p className="text-sm text-slate-500">Review, approve, or reject pending fuel requests.</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Ref No., Requester, Vehicle Plate, Project/Ticket..."
            className="w-full pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ApprovalQueueTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending_mine">
            Pending My Action ({requests.filter((r) => classifyApprovalQueueItem(r) === 'pending_mine').length})
          </TabsTrigger>
          <TabsTrigger value="waiting_others">
            Waiting for Others ({requests.filter((r) => classifyApprovalQueueItem(r) === 'waiting_others').length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({requests.filter((r) => classifyApprovalQueueItem(r) === 'completed').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Ref No.</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Vehicle Plate</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Fuel Type / Qty</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Est. Amount</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">Loading fuel approvals...</td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No fuel requests found in this queue.</td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-amber-700">
                          <Link to={`/transport/fuel-requests/${request.id}`} className="hover:underline flex items-center gap-1">
                            {request.ref_no} <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium">
                          {request.requester_name}
                          {request.department && <div className="text-xs text-slate-400">{request.department}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono font-medium text-slate-700">{request.vehicle_plate}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {request.fuel_type} ({request.quantity_litres} L)
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                          GHC {Number(request.estimated_amount).toFixed(2)}
                        </td>
                        <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                        <td className="px-6 py-4">
                          <QueueStatusBadge item={request} tab={activeTab} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Link to={`/transport/fuel-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500 mr-2">
                              <Eye className="h-4 w-4" /> View
                            </Link>
                            {activeTab === 'pending_mine' && (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busyId === request.id}
                                  onClick={() => { setApproveRequest(request); setApprovalSignature(''); }}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={busyId === request.id}
                                  onClick={() => { setRejectRequest(request); setRejectReason(''); }}
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {approveRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Approve Fuel Request</h3>
            <p className="mt-2 text-sm text-slate-500">Add your notes or digital signature for {approveRequest.ref_no}.</p>
            <textarea
              rows={4}
              value={approvalSignature}
              onChange={(e) => setApprovalSignature(e.target.value)}
              placeholder="Approved and signed by approver"
              className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setApproveRequest(null); setApprovalSignature(''); }}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={busyId === approveRequest.id}>Confirm Approval</Button>
            </div>
          </div>
        </div>
      )}

      {rejectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Reject Fuel Request</h3>
            <p className="mt-2 text-sm text-slate-500">Please give the reason for rejecting {rejectRequest.ref_no}.</p>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
              className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-rose-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setRejectRequest(null); setRejectReason(''); }}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={busyId === rejectRequest.id}>Confirm Rejection</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
