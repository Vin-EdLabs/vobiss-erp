import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, Clock3, XCircle, Truck, Eye, ArrowUpRight, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { approveTransportRequest, getTransportRequests, rejectTransportRequest, type TransportRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { classifyApprovalQueueItem, type ApprovalQueueTab } from '../../lib/approvalQueue';
import { QueueStatusBadge } from '../../components/approvals/ApprovalProgress';

const statusStyles: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function TransportApprovals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ApprovalQueueTab>('pending_mine');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [approveRequest, setApproveRequest] = useState<TransportRequest | null>(null);
  const [signature, setSignature] = useState('');
  const [rejectRequest, setRejectRequest] = useState<TransportRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const approverName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'Unknown User';

  const filteredRequests = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesTab = classifyApprovalQueueItem(request) === activeTab;
      const matchesSearch = !normalized || [
        request.requester_name,
        request.site_name,
        request.location,
        request.client_name,
        request.purpose,
      ].some((value) => (value || '').toLowerCase().includes(normalized));
      return matchesTab && matchesSearch;
    });
  }, [requests, searchTerm, activeTab]);

  const load = async () => {
    try {
      setLoading(true);
      const all = await getTransportRequests();
      const visible = all.filter((request) => {
        if (Number(request.requester_id) === Number(user?.id)) return true;
        const role = String(user?.main_role || user?.role || '').toLowerCase();
        const isAdmin = ['admin', 'superadmin', 'system_admin'].includes(role);
        if (isAdmin) return true;
        if (request.my_decision) return true;
        return (request.selected_approver_ids || []).map(Number).includes(Number(user?.id)) || request.status === 'pending';
      });
      setRequests(visible);
    } catch (error) {
      console.error(error);
      toast({ title: 'Unable to load transport approvals', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id, user?.role, user?.main_role]);

  const handleApprove = async () => {
    if (!approveRequest) return;
    if (!signature.trim()) {
      toast({ title: 'Signature required', description: 'Please add notes or a digital signature before approving.', variant: 'destructive' });
      return;
    }
    try {
      setBusyId(approveRequest.id);
      await approveTransportRequest(approveRequest.id, { reason: signature.trim() });
      toast({ title: 'Request approved', description: `Request #${approveRequest.id} moved forward in workflow.`, variant: 'default' });
      setApproveRequest(null);
      setSignature('');
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
      await rejectTransportRequest(rejectRequest.id, { reason: rejectReason.trim() });
      toast({ title: 'Request rejected', description: `Request #${rejectRequest.id} was rejected.`, variant: 'default' });
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
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Transport Approvals</h1>
          <p className="mt-1 text-sm text-slate-600">Review transport requests, track approval history, and approve or reject the request.</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by requester, site, location, client, or notes..."
            className="w-full pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ApprovalQueueTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending_mine">Pending My Action ({requests.filter((r) => classifyApprovalQueueItem(r) === 'pending_mine').length})</TabsTrigger>
          <TabsTrigger value="waiting_others">Waiting for Others ({requests.filter((r) => classifyApprovalQueueItem(r) === 'waiting_others').length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({requests.filter((r) => classifyApprovalQueueItem(r) === 'completed').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">ID</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Site</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Location</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Created</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No transport requests in this status.</td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">#{request.id}</td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800">{request.requester_name}</div>
                          <div className="text-xs text-slate-500">{request.client_name}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">{request.site_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-700">{request.location}</td>
                        <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                        <td className="px-6 py-4 text-sm text-slate-700">{new Date(request.created_at).toLocaleDateString()}</td>
                        <td className="px-6 py-4">
                          <QueueStatusBadge item={request} tab={activeTab} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Link to={`/transport-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                              <Eye className="h-4 w-4" /> View
                            </Link>
                            {activeTab === 'pending_mine' && (
                              <>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setApproveRequest(request); setSignature(''); }} disabled={busyId === request.id}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => { setRejectRequest(request); setRejectReason(''); }} disabled={busyId === request.id}>
                                  Reject
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
            <div className="mb-4 flex items-center gap-2">
              <PenLine className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-bold text-slate-900">Approve Transport Request</h3>
            </div>
            <p className="mb-3 text-sm text-slate-500">Add your approval notes or digital signature for request #{approveRequest.id}.</p>
            <label className="mb-4 block text-sm font-medium text-slate-700">
              <span>Your Name</span>
              <span className="mt-1 block text-xs font-normal text-slate-500">Automatically filled from your profile.</span>
              <input value={approverName} readOnly className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              <span>Notes / Digital Signature *</span>
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              rows={4}
              placeholder="e.g. Approved for the requested transport service"
              className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-emerald-500"
            />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setApproveRequest(null); setSignature(''); }}>Cancel</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={busyId === approveRequest.id}>Confirm Approval</Button>
            </div>
          </div>
        </div>
      )}

      {rejectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-rose-600" />
              <h3 className="text-lg font-bold text-slate-900">Reject Transport Request</h3>
            </div>
            <p className="mb-3 text-sm text-slate-500">Please provide the reason for rejecting request #{rejectRequest.id}.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Reason for rejection"
              className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-rose-500"
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
