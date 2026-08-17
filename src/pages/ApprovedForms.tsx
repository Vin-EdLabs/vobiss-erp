import React, { useState, useEffect, useRef } from 'react';
import { Search, XCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { getRequests, getRequestDetails, finalizeRequest } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface Request {
  id: number;
  created_by: string;
  team_leader_name: string;
  team_leader_phone: string;
  project_name: string;
  isp_name: string;
  location: string;
  deployment_type: 'Deployment' | 'Maintenance';
  release_by: string | null;
  received_by: string | null;
  status: 'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  item_count: number;
  reject_reason?: string | null;
  type: 'material_request' | 'item_return' | 'cash_request';
}

interface RequestDetails extends Request {
  items: {
    id: number;
    request_id: number;
    item_id: number;
    quantity_requested: number | null;
    quantity_received: number | null;
    quantity_returned: number | null;
    item_name: string;
    current_stock: number;
    serial_number?: string | null;
  }[];
  approvals: {
    id: number;
    request_id: number;
    approver_name: string;
    signature: string;
    approved_at: string;
  }[];
  rejections?: {
    id: number;
    request_id: number;
    rejector_name: string;
    reason: string;
    created_at: string;
  }[];
}

const ApprovedForms: React.FC = () => {
  const { user } = useAuth();
  const role = user?.main_role || user?.role || '';
  const canFinalize = role === 'superadmin' || role === 'issuer';
  // Roles that primarily *finalize* requests can see all. Everyone else (requesters, approvers, etc.) sees only their own.
  const seesAllRequests = ['superadmin', 'issuer', 'stock_admin', 'director', 'finance'].includes(role);
  const userFullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '';
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Request[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'approved' | 'completed' | 'rejected'>('approved');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setIsInteracting(isFormOpen);
  }, [isFormOpen]);

  useEffect(() => {
    const loadRequests = async () => {
      if (isInteracting) return;

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

    loadRequests();
    intervalRef.current = setInterval(loadRequests, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isInteracting]);

  useEffect(() => {
    filterRequests();
  }, [allRequests, searchTerm, activeTab]);

  const filterRequests = () => {
    // For issuers/admins keep the existing material-only view (their finalize queue).
    // For everyone else (requesters, approvers, finance, etc.) show all types of their own requests.
    let filtered: Request[] = seesAllRequests
      ? allRequests.filter(r => r.type !== 'cash_request')
      : allRequests.filter(r => r.created_by === userFullName);

    if (activeTab === 'approved') {
      filtered = filtered.filter(r =>
        r.status === 'supervisor_approved' || r.status === 'finance_approved'
      );
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(r => r.status === 'completed');
    } else {
      filtered = filtered.filter(r => r.status === 'rejected');
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(request =>
        request.team_leader_name?.toLowerCase().includes(term) ||
        request.team_leader_phone?.toLowerCase().includes(term) ||
        request.project_name?.toLowerCase().includes(term) ||
        request.created_by?.toLowerCase().includes(term)
      );
    }

    setFilteredRequests(filtered);
  };

  const handleFinalize = async (data: { 
    items: { 
      itemId: number; 
      quantityReceived: number; 
      quantityReturned: number; 
      serial_number?: string | null 
    }[]; 
    releasedBy: string;
    waybill?: {
      carNumber: string;
      driversName: string;
      driversContact: string;
      address: string;
      projectDescription: string;
    };
  }) => {
    if (!selectedRequest) return;

    if (!canFinalize) {
      toast({
        title: "Access Denied",
        description: "Super Admin or Issuer access required",
        variant: "destructive"
      });
      return;
    }

    try {
      await finalizeRequest(selectedRequest.id, data);
      setIsFormOpen(false);
      setSelectedRequest(null);
      setIsInteracting(false);
      toast({
        title: "Success",
        description: selectedRequest.type === 'item_return' 
          ? "Item return finalized and stock updated" 
          : "Material request finalized successfully",
        variant: "default"
      });
      const updatedRequests = await getRequests();
      setAllRequests(updatedRequests);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to finalize",
        variant: "destructive"
      });
    }
  };

  const openFinalizeForm = async (requestId: number) => {
    if (!canFinalize) {
      toast({ title: "Access Denied", description: "Only Issuer or Admin can finalize", variant: "destructive" });
      return;
    }
    try {
      const details = await getRequestDetails(requestId);
      setSelectedRequest(details);
      setIsFormOpen(true);
      setIsInteracting(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load details", variant: "destructive" });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'supervisor_approved': return <CheckCircle className="h-4 w-4" />;
      case 'finance_approved': return <CheckCircle className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'rejected': return <XCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'supervisor_approved': return 'bg-blue-100 text-blue-800';
      case 'finance_approved': return 'bg-emerald-100 text-emerald-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-[var(--surface-secondary)] text-[var(--text-primary)]';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'supervisor_approved': return 'Approved – Awaiting Finalization';
      case 'finance_approved': return 'Finance Approved – Awaiting Collection';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  // Tab counts are computed against the same scope as the visible list.
  const scopedRequests = seesAllRequests
    ? allRequests.filter(r => r.type !== 'cash_request')
    : allRequests.filter(r => r.created_by === userFullName);
  const tabCounts = {
    approved: scopedRequests.filter(r => r.status === 'supervisor_approved' || r.status === 'finance_approved').length,
    completed: scopedRequests.filter(r => r.status === 'completed').length,
    rejected: scopedRequests.filter(r => r.status === 'rejected').length,
  };

  if (loading) {
    return <div className="text-center py-20">Loading material requests...</div>;
  }

  return (
    <div className="inv-theme space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
          {canFinalize ? 'Issue Item' : 'Approved Forms'}
        </h1>
        <p className="text-[var(--text-secondary)] mt-2">
          {canFinalize
            ? 'Issuer dashboard — manage and finalize approved material requests only'
            : 'Track your requests that have been approved and are awaiting finalization or collection'}
        </p>
      </div>

      <div className="bg-[var(--surface)] rounded-xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] mb-6">
        <div className="flex items-center">
          <Search className="h-5 w-5 text-[var(--text-muted)] mr-3" />
          <Input
            placeholder="Search by team leader, project, creator..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid grid-cols-3 w-full mb-6">
          <TabsTrigger value="approved">
            {canFinalize ? `Ready to Finalize (${tabCounts.approved})` : `Approved (${tabCounts.approved})`}
          </TabsTrigger>
          <TabsTrigger value="completed">Completed ({tabCounts.completed})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({tabCounts.rejected})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="bg-[var(--surface)] rounded-xl shadow border overflow-hidden shadow-[var(--shadow-md)]">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)]">
                {activeTab === 'approved'
                  ? (canFinalize
                      ? 'No approved material requests ready for finalization'
                      : 'No approved requests yet — once your supervisors approve, your requests will appear here.')
                  : activeTab === 'completed'
                    ? 'No completed requests yet.'
                    : 'No rejected requests.'}
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-[var(--surface-secondary)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">ID</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Project</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Team Leader</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Created By</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Type</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Items</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text-muted)]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="px-6 py-4">
                        <Link to={`/request-forms/${request.id}`} className="text-blue-600 hover:underline">
                          #{request.id}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm">{request.project_name || '—'}</td>
                      <td className="px-6 py-4 text-sm">{request.team_leader_name || '—'}</td>
                      <td className="px-6 py-4 text-sm">{request.created_by}</td>
                      <td className="px-6 py-4 text-sm capitalize">{request.deployment_type}</td>
                      <td className="px-6 py-4 text-sm">{request.item_count}</td>
                      <td className="px-6 py-4 text-sm">{new Date(request.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${statusColor(request.status)}`}>
                          {statusIcon(request.status)}
                          {statusLabel(request.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Link to={`/request-forms/${request.id}`} className="text-indigo-600 hover:underline text-sm">
                            View
                          </Link>
                          {request.status === 'supervisor_approved' && canFinalize && (
                            <Button size="sm" className="bg-green-600 text-white" onClick={() => openFinalizeForm(request.id)}>
                              Finalize
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Finalize Form */}
      {isFormOpen && selectedRequest && (
        <div className="bg-[var(--surface)] rounded-2xl shadow-[var(--shadow-md)] border border-[var(--border)] p-8 mb-6">
          <div className="text-center mb-6">
            <img src="/vobiss-logo.png" alt="Vobiss Logo" className="mx-auto h-12 w-auto mb-4" />
            <FinalizeForm
              request={selectedRequest}
              onSave={handleFinalize}
              onCancel={() => {
                setIsFormOpen(false);
                setSelectedRequest(null);
                setIsInteracting(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface FinalizeFormProps {
  request: RequestDetails;
  onSave: (data: { 
    items: { 
      itemId: number; 
      quantityReceived: number; 
      quantityReturned: number; 
      serial_number?: string | null 
    }[]; 
    releasedBy: string;
    waybill?: {
      carNumber: string;
      driversName: string;
      driversContact: string;
      address: string;
      projectDescription: string;
    };
  }) => void;
  onCancel: () => void;
}

const FinalizeForm: React.FC<FinalizeFormProps> = ({ request, onSave, onCancel }) => {
  const { user } = useAuth();
  const isReturn = request.type === 'item_return';

  // For item returns, we use quantityReceived as "Quantity Returned"
  const [items, setItems] = useState(request.items.map((item) => ({
    itemId: item.item_id,
    quantityReceived: isReturn ? (item.quantity_requested || 0) : (item.quantity_received || item.quantity_requested || 0),
    quantityReturned: item.quantity_returned || 0,
    serial_number: item.serial_number || '',
  })));

  const [releasedBy, setReleasedBy] = useState('');
  useEffect(() => {
    if (user) {
      const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      setReleasedBy(name || user.username || 'Unknown User');
    }
  }, [user]);

  const [formType, setFormType] = useState<'finalize' | 'waybill'>('finalize');
  const [carNumber, setCarNumber] = useState('');
  const [driversName, setDriversName] = useState('');
  const [driversContact, setDriversContact] = useState('');
  const [address, setAddress] = useState(request.location || '');
  const [projectDescription, setProjectDescription] = useState(request.project_name || '');
  const [errors, setErrors] = useState<{ [key: number]: string }>({});
  const [submitError, setSubmitError] = useState('');

  const validate = () => {
    const newErrors: { [key: number]: string } = {};
    let hasErrors = false;

    request.items.forEach((item, index) => {
      const received = items[index]?.quantityReceived || 0;
      if (!isReturn && received > (item.current_stock || 0)) {
        newErrors[index] = `Received quantity cannot exceed available stock (${item.current_stock || 0}).`;
        hasErrors = true;
      }
      if (received < 0) {
        newErrors[index] = 'Quantity cannot be negative.';
        hasErrors = true;
      }
    });

    if (formType === 'waybill') {
      if (!carNumber.trim() || !driversName.trim() || !driversContact.trim() || !address.trim() || !projectDescription.trim()) {
        setSubmitError('All waybill fields are required.');
        hasErrors = true;
      }
    }

    setErrors(newErrors);
    return !hasErrors;
  };

  const handleItemChange = (
    index: number, 
    field: 'quantityReceived' | 'quantityReturned' | 'serial_number', 
    value: number | string
  ) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[index];
      return newErrors;
    });
    setSubmitError('');
  };

  const handleSubmit = () => {
    setSubmitError('');

    let finalReleasedBy = releasedBy.trim() || 'System Issuer';

    const isValid = validate();
    if (!isValid) {
      setSubmitError('Please fix the errors before submitting.');
      return;
    }

    const data = {
      items: items.map(item => ({
        itemId: item.itemId,
        quantityReceived: item.quantityReceived,  // Used for both issue and return
        quantityReturned: item.quantityReturned,
        serial_number: item.serial_number?.trim() || null
      })),
      releasedBy: finalReleasedBy
    };

    if (formType === 'waybill') {
      data.waybill = {
        carNumber: carNumber.trim(),
        driversName: driversName.trim(),
        driversContact: driversContact.trim(),
        address: address.trim(),
        projectDescription: projectDescription.trim()
      };
    }

    onSave(data);
  };

  return (
    <div className="space-y-6 w-full">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          {isReturn ? 'FINALIZE ITEM RETURN' : (formType === 'waybill' ? 'WAYBILL' : 'FINALIZE REQUEST')}
        </h2>
        <p className="text-[var(--text-secondary)] mt-1">
          {isReturn ? 'Confirm returned quantities — stock will be updated' : 'Review and confirm quantities received and returned'}
        </p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-[var(--text-body)]">Form Type</label>
        <Select value={formType} onValueChange={(value: 'finalize' | 'waybill') => setFormType(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select form type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="finalize">Finalize Request</SelectItem>
            <SelectItem value="waybill">Waybill</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center space-x-2">
          <AlertCircle className="h-4 w-4" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Project Name</label>
          <Input value={request.project_name} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">ISP Name</label>
          <Input value={request.isp_name || 'N/A'} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Created By</label>
          <Input value={request.created_by} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Team Leader</label>
          <Input value={request.team_leader_name} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Phone</label>
          <Input value={request.team_leader_phone} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Location</label>
          <Input value={request.location} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Project Type</label>
          <Input value={request.deployment_type} disabled className="bg-[var(--surface-secondary)]" />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Released By *</label>
          <div className="px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
            <span className="font-semibold text-green-800">
              {releasedBy || 'Loading...'}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Automatically set to current logged-in user</p>
        </div>
      </div>

      {formType === 'waybill' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">Waybill Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--text-body)]">Car Number *</label>
              <Input value={carNumber} onChange={(e) => setCarNumber(e.target.value)} placeholder="Enter car number" />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--text-body)]">Drivers Name *</label>
              <Input value={driversName} onChange={(e) => setDriversName(e.target.value)} placeholder="Enter drivers name" />
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-[var(--text-body)]">Drivers Contact *</label>
              <Input value={driversContact} onChange={(e) => setDriversContact(e.target.value)} placeholder="Enter drivers contact" />
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="block text-sm font-semibold text-[var(--text-body)]">Address *</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" />
            </div>
            <div className="md:col-span-2 space-y-3">
              <label className="block text-sm font-semibold text-[var(--text-body)]">Project Description *</label>
              <Input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="Enter project description" />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-2 flex items-center">
          Initial Approvals
          {request.approvals.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{request.approvals.length}</span>
          )}
        </h3>
        <div className="bg-[var(--surface-secondary)] p-4 rounded-lg space-y-3 max-h-48 overflow-y-auto">
          {request.approvals.length > 0 ? (
            request.approvals.map((approval) => (
              <div key={approval.id} className="text-sm border-l-4 border-blue-300 pl-3 bg-[var(--surface)] rounded-lg p-3 shadow-[var(--shadow-md)]">
                <p className="font-semibold text-[var(--text-primary)]">{approval.approver_name}</p>
                <p className="text-[var(--text-muted)] text-xs">{new Date(approval.approved_at).toLocaleString()}</p>
                <p className="text-[var(--text-muted)] text-xs italic mt-1">Signature: {approval.signature}</p>
              </div>
            ))
          ) : (
            <p className="text-[var(--text-muted)] italic text-center py-4">No initial approvals recorded</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-2">Items (Update Quantities & Serial)</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          {isReturn 
            ? "Enter the actual quantity returned. Stock will be updated accordingly." 
            : "Update received quantities and add serial numbers if needed."}
        </p>
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {request.items.map((item, index) => {
            const received = items[index]?.quantityReceived || 0;
            const itemError = errors[index];
            const isOverStock = !isReturn && received > (item.current_stock || 0);
            return (
              <div key={item.id} className={`p-4 rounded-lg border shadow-[var(--shadow-md)] transition-all ${
                itemError ? 'border-red-300 bg-red-50' : 'border-[var(--border)] bg-[var(--surface)]'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-[var(--text-primary)] text-base">{item.item_name}</span>
                  <span className="text-sm text-[var(--text-muted)] bg-[var(--surface-secondary)] px-2 py-1 rounded">
                    Requested: {item.quantity_requested}
                  </span>
                </div>
                {!isReturn && (
                  <div className="mb-3 text-sm text-[var(--text-secondary)] bg-[var(--surface-secondary)] p-3 rounded-lg">
                    <strong>Available Stock (from DB):</strong> 
                    <span className="font-mono bg-[var(--surface)] px-2 py-1 rounded text-green-800 ml-1">{item.current_stock || 0}</span>
                    {isOverStock && (
                      <div className="mt-1 flex items-center text-red-600 text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Exceeds available stock
                      </div>
                    )}
                  </div>
                )}
                {itemError && (
                  <div className="mb-3 text-red-600 text-xs flex items-center">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {itemError}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--text-body)]">
                      {isReturn ? 'Quantity Returned' : 'Quantity Received'}
                    </label>
                    <Input
                      type="number"
                      value={received}
                      onChange={(e) => handleItemChange(index, 'quantityReceived', parseInt(e.target.value) || 0)}
                      min="0"
                      className={`w-full ${isOverStock ? 'border-red-300 bg-red-50' : 'border-[var(--border-strong)]'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--text-body)]">Serial Number (Optional)</label>
                    <Input
                      type="text"
                      value={items[index]?.serial_number || ''}
                      onChange={(e) => handleItemChange(index, 'serial_number', e.target.value)}
                      placeholder="e.g., ABC123, MAC:XX:XX"
                      className="w-full border-[var(--border-strong)]"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--border)]">
        <Button variant="outline" onClick={onCancel} className="border-[var(--border-strong)] hover:bg-[var(--surface-hover)] rounded-lg shadow-sm px-6">
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={!releasedBy.trim()}
          className="bg-gray-800 text-white hover:bg-gray-900 rounded-lg shadow-sm px-6 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Finalize {isReturn ? 'Return' : 'Request'}
        </Button>
      </div>
    </div>
  );
};

export default ApprovedForms;