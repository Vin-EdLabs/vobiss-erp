// src/pages/finance/FinanceApprovals.tsx
import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { getRequests, approveRequest, rejectRequest } from '../../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { formatPersonName } from '@/lib/displayName';
import { PersonName } from '@/components/PersonName';
import type { ApprovalQueueTab } from '../../lib/approvalQueue';
import { QueueStatusBadge } from '../../components/approvals/ApprovalProgress';

interface CashRequest {
  id: number;
  created_by: string;
  purpose: string | null;
  department: string | null;
  total_amount: number | string | null;
  status: 'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected';
  supervisor_approved_by?: string | null;
  supervisor_approved_at?: string | null;
  finance_approved_by?: string | null;
  finance_approved_at?: string | null;
}

const FinanceApprovals: React.FC = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CashRequest[]>([]);
  const [filtered, setFiltered] = useState<CashRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ApprovalQueueTab>('pending_mine');
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CashRequest | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [financeNotes, setFinanceNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { toast } = useToast();

  const financeOfficerName = formatPersonName(user, 'Finance Officer');

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, searchTerm, activeTab]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests();
      const cashRequests = data
        .filter((r: any) => r.type === 'cash_request')
        .map((r: any) => ({
          ...r,
          status: String(r.status),
        }));
      setRequests(cashRequests);
    } catch (error: any) {
      console.error('Load requests error:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to load requests", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const financeTab = (request: CashRequest): ApprovalQueueTab => {
    if (request.status === 'supervisor_approved') return 'pending_mine';
    if (request.status === 'pending') return 'waiting_others';
    return 'completed';
  };

  const filterRequests = () => {
    let next = requests.filter((r) => financeTab(r) === activeTab);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      next = next.filter((r) => r.created_by?.toLowerCase().includes(term));
    }
    setFiltered(next);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    const requestId = selectedRequest.id;
    setApprovingId(requestId);

    try {
      await approveRequest(requestId, {
        approverName: financeOfficerName,
        signature: financeNotes.trim(),
        stage: 'finance',
      });

      setRequests(prev => 
        prev.map(req => 
          req.id === requestId 
            ? { ...req, status: 'finance_approved' } 
            : req
        )
      );

      toast({
        title: "Success",
        description: `Cash request #${requestId} released.`,
        variant: "default"
      });

      setIsApproveModalOpen(false);
      setFinanceNotes('');
    } catch (error: any) {
      console.error('Approve failed:', error);
      toast({ 
        title: "Approval Failed", 
        description: error.message || "Could not release cash",
        variant: "destructive" 
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim()) {
      toast({ title: "Error", description: "Rejection reason required", variant: "destructive" });
      return;
    }

    try {
      await rejectRequest(selectedRequest.id, {
        rejectorName: financeOfficerName,
        reason: rejectReason.trim()
      });

      setRequests(prev => 
        prev.map(req => 
          req.id === selectedRequest.id 
            ? { ...req, status: 'rejected' } 
            : req
        )
      );

      toast({ title: "Rejected", description: "Request moved to Rejected tab.", variant: "default" });
      setIsRejectModalOpen(false);
      setRejectReason('');
    } catch (error: any) {
      toast({ title: "Rejection Failed", description: error.message, variant: "destructive" });
    }
  };

  const openApproveModal = (request: CashRequest) => {
    setSelectedRequest(request);
    setFinanceNotes('');
    setIsApproveModalOpen(true);
  };

  const openRejectModal = (request: CashRequest) => {
    setSelectedRequest(request);
    setRejectReason('');
    setIsRejectModalOpen(true);
  };

  const formatAmount = (amount: number | string | null | undefined): string => {
    const num = Number(amount) || 0;
    return num.toFixed(2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading cash requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Finance Cash Approvals</h1>
        <p className="text-gray-600">Review and release cash advance requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <Search className="h-5 w-5 text-gray-400" />
          <Input
            placeholder="Search by requestor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ApprovalQueueTab)}>
        <TabsList className="grid grid-cols-3 w-full mb-6">
          <TabsTrigger value="pending_mine">
            Pending My Action ({requests.filter((r) => financeTab(r) === 'pending_mine').length})
          </TabsTrigger>
          <TabsTrigger value="waiting_others">
            Waiting for Others ({requests.filter((r) => financeTab(r) === 'waiting_others').length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({requests.filter((r) => financeTab(r) === 'completed').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200 shadow-[var(--shadow-md)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Requestor</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Amount (GHS)</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-gray-500 text-lg">
                        No cash requests in this status
                      </td>
                    </tr>
                  ) : (
                    filtered.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link to={`/cash-details/${request.id}`} className="text-blue-600 hover:underline font-semibold">
                            #{request.id}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 whitespace-nowrap">
                            <PersonName value={request.created_by} />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <div className="text-xl font-bold text-green-700">
                            GHS {formatAmount(request.total_amount)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <QueueStatusBadge item={request} tab={activeTab} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                            <Link
                              to={`/cash-details/${request.id}`}
                              className="text-blue-600 hover:text-blue-800 font-medium text-sm whitespace-nowrap order-1"
                            >
                              View Details
                            </Link>

                            {activeTab === 'pending_mine' && request.status === 'supervisor_approved' && (
                              <div className="flex gap-2 mt-2 sm:mt-0 order-2">
                                <Button
                                  size="sm"
                                  onClick={() => openApproveModal(request)}
                                  disabled={approvingId === request.id}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-4"
                                >
                                  {approvingId === request.id ? 'Releasing...' : 'Release Cash'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => openRejectModal(request)}
                                  className="text-xs px-4"
                                >
                                  Reject
                                </Button>
                              </div>
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
      <Modal isOpen={isApproveModalOpen} onClose={() => setIsApproveModalOpen(false)} title="Release Cash Advance">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Your Name (Finance Officer)</label>
            <p className="text-xs text-gray-500 mb-2">Automatically filled from your profile</p>
            <Input
              value={financeOfficerName}
              disabled
              className="w-full bg-gray-100 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes / Approval Signature</label>
            <Textarea
              value={financeNotes}
              onChange={(e) => setFinanceNotes(e.target.value)}
              placeholder="e.g., Approved for immediate release"
              rows={4}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleApprove} 
              disabled={approvingId !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              {approvingId ? 'Releasing...' : 'Confirm Release'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} title="Reject Cash Request">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Rejection</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide a clear reason (e.g., insufficient documentation, budget not approved)"
              rows={6}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={!rejectReason.trim()}
            >
              Reject Request
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default FinanceApprovals;