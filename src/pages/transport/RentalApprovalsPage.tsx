import React, { useEffect, useMemo, useState } from 'react';
import { Search, CheckCircle2, Clock, XCircle, Truck, Eye, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { API_URL } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isSystemAdminAccount, userHasAnyRole } from '../../config/roles';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { classifyApprovalQueueItem, type ApprovalQueueTab } from '../../lib/approvalQueue';
import { QueueStatusBadge } from '../../components/approvals/ApprovalProgress';

interface VehicleLineItem {
  id: string;
  description: string;
  qty_days: number;
  unit_price: number;
  total: number;
}

interface VehicleRentalRequest {
  id: number;
  ref_no?: string;
  requester_name: string;
  purpose?: string;
  department?: string;
  status: string;
  current_stage?: string;
  created_at?: string;
  updated_at?: string;
  grand_total?: number;
  line_items: VehicleLineItem[];
  selected_approver_ids?: number[];
  transport_request_id?: number | null;
  my_decision?: string | null;
  my_acted_at?: string | null;
  approvals_count?: number;
  approvals_required?: number;
  approval_parties?: { id?: number; name: string; status: string; actedAt?: string | null }[];
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
}

const statusBadge: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800 border border-slate-200',
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  pending_manager: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-sky-100 text-sky-800 border border-sky-200',
  sent_to_finance: 'bg-sky-100 text-sky-800 border border-sky-200',
  pending_finance: 'bg-sky-100 text-sky-800 border border-sky-200',
  cash_issued: 'bg-blue-100 text-blue-800 border border-blue-200',
  completed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

export default function RentalApprovalsPage() {
  const { user, isAdminSuper } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<VehicleRentalRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ApprovalQueueTab>('pending_mine');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [approveRequest, setApproveRequest] = useState<VehicleRentalRequest | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectRequest, setRejectRequest] = useState<VehicleRentalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const isAdmin =
    isAdminSuper ||
    isSystemAdminAccount(user) ||
    userHasAnyRole(user, ['admin', 'superadmin', 'system_admin']);
  const approverName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || 'Unknown User';

  const userApprovalRequests = useMemo(() => {
    if (isAdmin) return requests;
    const userId = Number(user?.id);
    return requests.filter(
      (request) =>
        (request.selected_approver_ids || []).map(Number).includes(userId) || Boolean(request.my_decision)
    );
  }, [isAdmin, requests, user?.id]);

  const filteredRequests = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return userApprovalRequests.filter((request) => {
      const matchesTab = classifyApprovalQueueItem(request) === activeTab;
      const matchesSearch =
        !normalized ||
        [request.ref_no, request.requester_name, request.purpose, request.department, String(request.id)].some((value) =>
          (value || '').toLowerCase().includes(normalized)
        );
      return matchesTab && matchesSearch;
    });
  }, [userApprovalRequests, searchTerm, activeTab]);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/transport/vehicle-requests?queue=approver`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });

      if (!response.ok) throw new Error('Failed to load rental approvals');

      const all = await response.json();
      setRequests(Array.isArray(all) ? all : []);
    } catch (error) {
      console.error(error);
      toast({ title: 'Unable to load rental approvals', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.id, user?.role, user?.main_role]);

  const handleApprove = async () => {
    if (!approveRequest) return;
    if (!approvalNotes.trim()) {
      toast({ title: 'Notes required', description: 'Please add approval notes before approving.', variant: 'destructive' });
      return;
    }
    try {
      setBusyId(approveRequest.id);
      const response = await fetch(`${API_URL}/transport/vehicle-requests/${approveRequest.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ reason: approvalNotes.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to approve');
      }

      const result = await response.json();
      toast({ title: 'Approval recorded', description: result.message || 'Approval saved.', variant: 'default' });
      setApproveRequest(null);
      setApprovalNotes('');
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
      const response = await fetch(`${API_URL}/transport/vehicle-requests/${rejectRequest.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reject');
      }

      toast({ title: 'Rental Request Rejected', description: `Request ${rejectRequest.ref_no} was rejected.`, variant: 'default' });
      setRejectRequest(null);
      setRejectReason('');
      await load();
    } catch (error: any) {
      toast({ title: 'Rejection failed', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const formatGrandTotal = (value?: number) => {
    if (!value) return 'GHC 0.00';
    return `GHC ${Number(value).toFixed(2)}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const pendingCount = userApprovalRequests.filter((r) => classifyApprovalQueueItem(r) === 'pending_mine').length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Vehicle Rental Approvals</h1>
            <p className="text-sm text-slate-500">{isAdmin ? 'Review every rental vehicle request and keep the approval flow moving.' : 'Review, approve, or reject rental vehicle requests assigned to you.'}</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            <Clock className="h-4 w-4" />
            {pendingCount} pending
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Ref No., Requester, Purpose, Department..."
            className="w-full pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ApprovalQueueTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending_mine">
            Pending My Action ({userApprovalRequests.filter((r) => classifyApprovalQueueItem(r) === 'pending_mine').length})
          </TabsTrigger>
          <TabsTrigger value="waiting_others">
            Waiting for Others ({userApprovalRequests.filter((r) => classifyApprovalQueueItem(r) === 'waiting_others').length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({userApprovalRequests.filter((r) => classifyApprovalQueueItem(r) === 'completed').length})
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
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Department</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Purpose</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Grand Total</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">Loading rental approvals...</td>
                    </tr>
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-500">
                        {requests.length === 0
                          ? 'No rental requests found.'
                          : userApprovalRequests.length === 0
                          ? 'No rental requests assigned to you.'
                          : `No ${activeTab} rental requests in your queue.`}
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-amber-700">
                          <Link to={`/transport/vehicle-rental-requests/${request.id}`} className="hover:underline flex items-center gap-1">
                            #{request.id} <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium">{request.requester_name}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{request.department || '—'}</td>
                        <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                        <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate">{request.purpose || '—'}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{formatGrandTotal(request.grand_total)}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{formatDate(request.created_at)}</td>
                        <td className="px-6 py-4">
                          <QueueStatusBadge item={request} tab={activeTab} />
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <Link to={`/transport/vehicle-rental-requests/${request.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 font-medium">
                              <Eye className="h-4 w-4" /> View
                            </Link>
                            {activeTab === 'pending_mine' && (
                              <>
                                <button
                                  onClick={() => setApproveRequest(request)}
                                  disabled={busyId === request.id}
                                  className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-500 font-medium disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Approve
                                </button>
                                <button
                                  onClick={() => setRejectRequest(request)}
                                  disabled={busyId === request.id}
                                  className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-500 font-medium disabled:opacity-50"
                                >
                                  <XCircle className="h-4 w-4" /> Reject
                                </button>
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

      {/* Approve Modal */}
      {approveRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Approve Rental Request</h2>
            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">{approveRequest.requester_name}</p>
              <p className="text-xs text-slate-500">{approveRequest.purpose}</p>
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Your Name</label>
              <p className="mb-2 text-xs text-slate-500">Automatically filled from your profile.</p>
              <input value={approverName} readOnly className="w-full rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700" />
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">Approval Notes *</label>
              <textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="e.g. Approved for rental and signed by you"
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setApproveRequest(null);
                  setApprovalNotes('');
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={busyId === approveRequest.id}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busyId === approveRequest.id ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Reject Rental Request</h2>
            <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">{rejectRequest.requester_name}</p>
              <p className="text-xs text-slate-500">{rejectRequest.purpose}</p>
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Your Name</label>
              <input value={approverName} readOnly className="w-full rounded-lg border border-slate-200 bg-slate-100 p-3 text-sm text-slate-700" />
            </div>
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-slate-700">Rejection Reason *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRejectRequest(null);
                  setRejectReason('');
                }}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busyId === rejectRequest.id}
                className="flex-1 rounded-lg bg-rose-600 px-4 py-2 font-medium text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {busyId === rejectRequest.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
