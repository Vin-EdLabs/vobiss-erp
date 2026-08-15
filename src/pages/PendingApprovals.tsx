// src/pages/approvals/PendingApprovals.tsx (or wherever it's located)
import React, { useState, useEffect } from 'react';
import { Search, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, Package } from 'lucide-react';
import { getRequests, approveRequest, rejectRequest } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

interface Request {
  id: number;
  created_by: string;
  team_leader_name: string | null;
  team_leader_phone: string | null;
  project_name: string | null;
  isp_name: string | null;
  location: string | null;
  deployment_type: string | null;
  type: 'material_request' | 'item_return' | 'cash_request';
  status: 'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  item_count: number;
  reject_reason?: string | null;

  // Cash fields
  department?: string | null;
  purpose?: string | null;
  total_amount?: number | string | null;

  // Approval data
  assigned_approver_name?: string | null;
  supervisor_approved_by?: string | null;
  supervisor_approved_at?: string | null;
  finance_approved_by?: string | null;
  finance_approved_at?: string | null;
  requires_director_approval?: boolean;
  _approvedByMe?: boolean;
  _assignedToMe?: boolean;
}

type ApprovalMode = 'all' | 'material' | 'cash';

interface PendingApprovalsProps {
  mode?: ApprovalMode;
}

const PendingApprovals: React.FC<PendingApprovalsProps> = ({ mode = 'all' }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Request[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'director' | 'approved' | 'released' | 'completed' | 'rejected'>('pending');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const isMaterialMode = mode === 'material';
  const isCashMode = mode === 'cash';
  const pageTitle = isCashMode ? 'Cash Approvals' : isMaterialMode ? 'Material Approvals' : 'Approval Dashboard';
  const pageDescription = isCashMode
    ? 'Review assigned cash requests before finance release'
    : isMaterialMode
      ? 'Review assigned material requests and item returns'
      : 'Review and manage all pending requests';

  useEffect(() => {
    const openTab = (location.state as { openTab?: string })?.openTab;
    if (openTab === 'director' && ['director', 'superadmin'].includes(user?.main_role || user?.role || '')) {
      setActiveTab('director');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, user?.main_role, user?.role, navigate, location.pathname]);

  useEffect(() => {
    loadRequests();
    const h = () => loadRequests();
    window.addEventListener('staff:requests-changed', h as EventListener);
    return () => window.removeEventListener('staff:requests-changed', h as EventListener);
  }, []);

  useEffect(() => {
    filterRequests();
  }, [allRequests, searchTerm, activeTab, user]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests();
      setAllRequests(data);
    } catch (error) {
      console.error('Error loading requests:', error);
      toast({
        title: "Error",
        description: "Failed to load requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    let filtered = [...allRequests];
    if (isMaterialMode) {
      filtered = filtered.filter(r => r.type === 'material_request' || r.type === 'item_return');
    } else if (isCashMode) {
      filtered = filtered.filter(r => r.type === 'cash_request');
    }

    if (user?.role === 'requester') {
      const userFullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
      const username = (user.username || '').toLowerCase();
      filtered = filtered.filter(request =>
        request.created_by?.toLowerCase().includes(userFullName) ||
        request.created_by?.toLowerCase().includes(username)
      );
    }

    if (activeTab === 'director') {
      filtered = filtered.filter(
        r => r.type === 'cash_request' && r.status === 'pending' && r.requires_director_approval
      );
    } else if (activeTab === 'approved') {
      filtered = filtered.filter(r =>
        r.status === 'supervisor_approved' || r.status === 'finance_approved'
      );
    } else if (activeTab === 'released') {
      filtered = filtered.filter(r => r.status === 'finance_approved');
    } else {
      // Default: filter by status tab
      filtered = filtered.filter(r => r.status === activeTab);
    }

    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(request =>
        request.created_by?.toLowerCase().includes(lowerSearch) ||
        request.project_name?.toLowerCase().includes(lowerSearch) ||
        request.purpose?.toLowerCase().includes(lowerSearch) ||
        request.department?.toLowerCase().includes(lowerSearch)
      );
    }

    setFilteredRequests(filtered);
  };

  const handleApprove = async (approverData: { approverName: string; signature: string }) => {
    if (!selectedRequestId) return;

    try {
      const request = allRequests.find(r => r.id === selectedRequestId);
      if (!request) throw new Error('Request not found');

      let stage: 'approver' | 'finance' | 'director' = 'approver';

      if (request.type === 'cash_request') {
        if (request.status === 'pending') {
          if (request.requires_director_approval && (user?.main_role === 'director' || user?.role === 'director' || user?.main_role === 'superadmin' || user?.role === 'superadmin')) {
            stage = 'director';
          } else {
            stage = 'approver';
          }
        } else if (request.status === 'supervisor_approved') {
          stage = 'finance';
        } else {
          throw new Error('Cash request not in approvable state');
        }
      } else {
        stage = 'approver';
      }

      await approveRequest(selectedRequestId, { ...approverData, stage });

      // Mark this request as approved by the current user in local state
      setAllRequests(prev =>
        prev.map(r =>
          r.id === selectedRequestId ? { ...r, _approvedByMe: true } : r
        )
      );

      let message = '';
      if (request.type === 'cash_request') {
        if (stage === 'director') {
          message = 'Cash request approved by Director — waiting for Finance to release funds';
        } else if (stage === 'approver') {
          message = 'Cash request approved by Approver — waiting for Finance release';
        } else {
          message = 'Cash request released by Finance — ready for collection';
        }
      } else {
        message = 'Material request approved — ready for issuance';
      }

      toast({
        title: "Success",
        description: message,
        variant: "default"
      });

      setIsModalOpen(false);
      loadRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve",
        variant: "destructive"
      });
    }
  };

  const handleReject = async (reason: string) => {
    if (!selectedRequestId || !reason.trim()) {
      toast({ title: "Error", description: "Reason required", variant: "destructive" });
      return;
    }
    try {
      const rejectorName = user?.first_name && user?.last_name 
        ? `${user.first_name} ${user.last_name}` 
        : user?.username || 'Unknown';
      await rejectRequest(selectedRequestId, { reason, rejectorName });
      setIsRejectModalOpen(false);
      toast({ title: "Success", description: "Request rejected", variant: "default" });
      loadRequests();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'supervisor_approved': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'finance_approved': return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'supervisor_approved': return 'bg-blue-100 text-blue-800';
      case 'finance_approved': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const statusLabel = (status: string, type: string) => {
    if (status === 'supervisor_approved') {
      return type === 'cash_request' ? 'Approved – Waiting for Finance Release' : 'Approved – Ready to Issue';
    }
    if (status === 'finance_approved') return 'Funds Released';
    switch (status) {
      case 'pending': return 'Pending Approval';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const isCashRequest = (request: Request) => request.type === 'cash_request';

  const formatAmount = (amount: any) => {
    const num = Number(amount) || 0;
    return num.toFixed(2);
  };

  const getDetailsLink = (request: Request) => {
    return isCashRequest(request) ? `/cash-details/${request.id}` : `/request-forms/${request.id}`;
  };

  const canApproveRequest = (request: Request) => {
    const role = String(user?.main_role || user?.role || '').toLowerCase();
    const position = String(user?.position || '').trim().toLowerCase();
    const isMgr =
      position.includes('manager') ||
      position.includes('supervisor') ||
      position === 'director';
    const supervisorApproverRoles = ['approver', 'director', 'superadmin', 'admin', 'project', 'noc_manager', 'noc_supervisor', 'ip_manager', 'ip_supervisor', 'ts_manager', 'ts_supervisor', 'finance_manager'];
    if (isMaterialMode && request.type === 'cash_request') return false;
    if (isCashMode && request.type !== 'cash_request') return false;
    if (request.status === 'supervisor_approved') {
      // Finance release stays on the dedicated Finance Approvals page.
      return false;
    }
    if (request.status !== 'pending') return false;
    if (request._approvedByMe) return false;
    if (request.type === 'cash_request' && request.requires_director_approval) {
      return role === 'director' || role === 'superadmin';
    }
    if (!['director', 'superadmin'].includes(role) && !request._assignedToMe) return false;
    return supervisorApproverRoles.includes(role) || isMgr;
  };

  const getApproveButtonText = (request: Request) => {
    if (request.type === 'cash_request') {
      if (request.status === 'pending') {
        if (request.requires_director_approval && (user?.main_role === 'director' || user?.role === 'director' || user?.main_role === 'superadmin' || user?.role === 'superadmin')) {
          return 'Approve as Director';
        }
        return 'Approve Request';
      }
      if (request.status === 'supervisor_approved') return 'Release Funds';
    }
    return 'Approve Request';
  };

  const scopedRequests = allRequests.filter((r) => {
    if (isMaterialMode) return r.type === 'material_request' || r.type === 'item_return';
    if (isCashMode) return r.type === 'cash_request';
    return true;
  });
  const countByStatus = (status: string) => scopedRequests.filter(r => r.status === status).length;
  const directorQueueCount = scopedRequests.filter(
    r => r.type === 'cash_request' && r.status === 'pending' && r.requires_director_approval
  ).length;
  const approvedCount = scopedRequests.filter(r => r.status === 'supervisor_approved' || r.status === 'finance_approved').length;

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading requests...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-600 mt-1">{pageDescription}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          <div className="relative flex-1">
            <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by creator, project, purpose, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className={`grid w-full ${isMaterialMode ? 'grid-cols-4' : 'grid-cols-5'}`}>
          <TabsTrigger value="pending">Pending ({countByStatus('pending')})</TabsTrigger>
          {!isMaterialMode && ['director', 'superadmin'].includes(user?.main_role || user?.role || '') && (
            <TabsTrigger value="director">Director Approval ({directorQueueCount})</TabsTrigger>
          )}
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          {!isMaterialMode && <TabsTrigger value="released">Released ({countByStatus('finance_approved')})</TabsTrigger>}
          <TabsTrigger value="completed">Completed ({countByStatus('completed')})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({countByStatus('rejected')})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount / Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={getDetailsLink(request)} className="text-blue-600 hover:underline font-medium">
                          {request.id}
                        </Link>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                          isCashRequest(request) ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isCashRequest(request) ? <DollarSign className="h-4 w-4 mr-1" /> : <Package className="h-4 w-4 mr-1" />}
                          {isCashRequest(request) ? 'Cash' : 'Material'}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {isCashRequest(request) ? (
                          <div className="text-lg font-bold text-green-700">
                            GHS {formatAmount(request.total_amount)}
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{request.item_count} items</div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{request.created_by}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(request.created_at).toLocaleDateString()}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(request.status)}`}>
                          {statusIcon(request.status)}
                          {statusLabel(request.status, request.type)}
                          {request.type === 'cash_request' && request.requires_director_approval && (
                            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                              Director required
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <Link
                            to={getDetailsLink(request)}
                            className="text-blue-600 hover:text-blue-500 text-sm font-medium"
                          >
                            View Details
                          </Link>

                          {canApproveRequest(request) && (
                            <Button
                              onClick={() => {
                                setSelectedRequestId(request.id);
                                setIsModalOpen(true);
                              }}
                              size="sm"
                              className="bg-green-600 text-white hover:bg-green-700 rounded-lg"
                            >
                              {getApproveButtonText(request)}
                            </Button>
                          )}

                          {request.status === 'pending' && !request._approvedByMe && (
                            <Button
                              onClick={() => {
                                setSelectedRequestId(request.id);
                                setIsRejectModalOpen(true);
                              }}
                              variant="destructive"
                              size="sm"
                              className="rounded-lg"
                            >
                              Reject
                            </Button>
                          )}
                          {request._approvedByMe && request.status === 'pending' && (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              Approved by you
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-600">No requests in this status</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Approval Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Approve Request">
        <ApprovalForm onSave={handleApprove} onCancel={() => setIsModalOpen(false)} />
      </Modal>

      {/* Reject Modal */}
      <Modal isOpen={isRejectModalOpen} onClose={() => setIsRejectModalOpen(false)} title="Reject Request">
        <RejectForm onSave={handleReject} onCancel={() => setIsRejectModalOpen(false)} />
      </Modal>
    </div>
  );
};

// Approval Form — Name is now READ-ONLY
interface ApprovalFormProps {
  onSave: (data: { approverName: string; signature: string }) => void;
  onCancel: () => void;
}

const ApprovalForm: React.FC<ApprovalFormProps> = ({ onSave, onCancel }) => {
  const { user } = useAuth();
  const [signature, setSignature] = useState('');
  const { toast } = useToast();

  const approverName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}` 
    : user?.username || 'Unknown User';

  const handleSubmit = () => {
    if (!signature.trim()) {
      toast({ title: "Error", description: "Please add notes/signature", variant: "destructive" });
      return;
    }
    onSave({ approverName, signature: signature.trim() });
  };

  return (
    <div className="space-y-6 p-4 max-w-md mx-auto">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Your Name *</label>
        <p className="text-xs text-gray-500 mb-2">Automatically filled from your profile</p>
        <Input
          value={approverName}
          disabled
          className="w-full bg-gray-100 cursor-not-allowed"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Notes / Digital Signature *</label>
        <Textarea
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="e.g., Approved for release"
          className="w-full h-32"
          rows={4}
        />
      </div>
      <div className="flex justify-end space-x-3 pt-6 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700">
          Confirm Approval
        </Button>
      </div>
    </div>
  );
};

// Reject Form — unchanged
interface RejectFormProps {
  onSave: (reason: string) => void;
  onCancel: () => void;
}

const RejectForm: React.FC<RejectFormProps> = ({ onSave, onCancel }) => {
  const [reason, setReason] = useState('');
  const { toast } = useToast();

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast({ title: "Error", description: "Reason required", variant: "destructive" });
      return;
    }
    onSave(reason.trim());
  };

  return (
    <div className="space-y-6 p-4 max-w-md mx-auto">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Rejection Reason *</label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Please explain why this request is rejected"
          className="w-full h-40"
          rows={6}
        />
      </div>
      <div className="flex justify-end space-x-3 pt-6 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit} variant="destructive">
          Reject Request
        </Button>
      </div>
    </div>
  );
};

export default PendingApprovals;