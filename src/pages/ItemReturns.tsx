// ItemReturns.tsx – FULLY COMPLETE & FIXED
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, Clock, CheckCircle, XCircle, User, AlertCircle, ArrowLeftCircle } from 'lucide-react';
import { getRequests, getItems, createRequest, getApprovers } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { userHasAnyRole } from '../config/roles';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';

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
  type: 'material_request' | 'item_return';
  reason?: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  created_at: string;
  updated_at: string;
  item_count: number;
  approver_name?: string;
  approver_names?: string;
}

interface Item {
  id: number;
  name: string;
  quantity: number;
}

interface Approver {
  id: number;
  fullName: string;
  canApproveMaterial?: boolean;
  canApproveCash?: boolean;
}

const ItemReturns: React.FC = () => {
  const { user } = useAuth();
  const [allRequests, setAllRequests] = useState<Request[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<Request[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed' | 'rejected'>('pending');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('item-return');
  }, []);

  useEffect(() => {
    loadRequests();
    loadItems();
    loadApprovers();
  }, []);

  useEffect(() => {
    filterRequests();
  }, [allRequests, searchTerm, activeTab]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests();
      const returnRequests = data.filter((r: any) => {
        if (r.type !== 'item_return') return false;
        const privileged =
          userHasAnyRole(user, ['superadmin', 'director', 'cto']) ||
          String(user?.position || '').trim().toLowerCase() === 'director';
        if (privileged) return true;
        return Number(r.created_by_id) === Number(user?.id);
      });
      setAllRequests(returnRequests);
    } catch (error) {
      console.error('Error loading requests:', error);
      toast({
        title: "Error",
        description: "Failed to load return requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await getItems();
      setItems(data);
    } catch (error) {
      console.error('Error loading items:', error);
      toast({
        title: "Error",
        description: "Failed to load items",
        variant: "destructive"
      });
    }
  };

  const loadApprovers = async () => {
    try {
      const data = await getApprovers();
      const materialApprovers = data.filter((approver: Approver) => approver.canApproveMaterial && approver.id !== user?.id);
      setApprovers(materialApprovers);
      if (materialApprovers.length > 0) {
        setSelectedApproverIds(materialApprovers.map(a => a.id));
      }
    } catch (error) {
      console.error('Error loading approvers:', error);
    }
  };

  const filterRequests = () => {
    let filtered = allRequests.filter(request => request.status === activeTab);
    if (searchTerm.trim()) {
      filtered = filtered.filter(request =>
        (request.team_leader_name && request.team_leader_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.team_leader_phone && request.team_leader_phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.project_name && request.project_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.created_by && request.created_by.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.approver_names && request.approver_names.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (request.reason && request.reason.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    setFilteredRequests(filtered);
  };

  const handleCreateRequest = async (formData: {
    createdBy: string;
    projectName: string;
    location: string;
    reason: string;
    items: { name: string; quantity_requested: number }[];
  }) => {
    try {
      const approverIds = selectedApproverIds.length > 0 ? selectedApproverIds : null;

      await createRequest(
        {
          createdBy: formData.createdBy,
          projectName: formData.projectName,
          location: formData.location,
          reason: formData.reason,
          items: formData.items,
        },
        approverIds,
        'item_return'
      );
      setIsFormOpen(false);
      toast({
        title: "Success",
        description: sendToAll
          ? "Item return request created and sent to all approvers"
          : `Item return request created and sent to ${selectedApproverIds.length} approver(s)`,
        variant: "default"
      });
      loadRequests();
    } catch (error: any) {
      console.error('Error creating request:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create return request",
        variant: "destructive"
      });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-[var(--surface-secondary)] text-[var(--text-primary)]';
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-[var(--text-secondary)]">Loading return requests...</p>
      </div>
    );
  }

  return (
    <div className="inv-theme space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Item Returns</h1>
          <p className="text-[var(--text-secondary)] mt-1">Submit item return requests — sent to all approvers by default</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center shadow-[var(--shadow-sm)]"
          >
            <ArrowLeftCircle className="h-5 w-5 mr-2" />
            {isFormOpen ? 'Close Form' : 'New Return'}
          </Button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] p-8 mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-teal-600"></div>
          <div className="text-center mb-6">
            <img src="/vobiss-logo.png" alt="Vobiss Logo" className="mx-auto h-12 w-auto mb-4" />
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">ITEM RETURN FORM</h2>
          </div>
          <ReturnForm
            onSave={handleCreateRequest}
            onCancel={() => setIsFormOpen(false)}
            items={items}
            approvers={approvers}
            sendToAll={sendToAll}
            setSendToAll={setSendToAll}
            selectedApproverIds={selectedApproverIds}
            setSelectedApproverIds={setSelectedApproverIds}
          />
        </div>
      )}

      <div className="bg-[var(--surface)] rounded-2xl p-6 shadow-sm border border-[var(--border)] mb-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 to-teal-600"></div>
        <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
          <div className="relative flex-1">
            <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder="Search by returner, project, reason or approver..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2"
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-hover)] rounded-xl p-1">
          <TabsTrigger value="pending" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">Pending ({allRequests.filter(r => r.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">Approved ({allRequests.filter(r => r.status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="completed" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">Completed ({allRequests.filter(r => r.status === 'completed').length})</TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-[var(--surface)] data-[state=active]:shadow-sm rounded-lg">Rejected ({allRequests.filter(r => r.status === 'rejected').length})</TabsTrigger>
        </TabsList>
        <TabsContent value={activeTab} className="mt-6">
          <div className="bg-[var(--surface)] rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead className="bg-gradient-to-r from-[var(--surface-secondary)] to-[var(--surface-hover)]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Request ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Project</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Returned By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Reason</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Assigned Approver</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Release By</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Items</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Created At</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-[var(--surface-hover)]/50 transition-all duration-200">
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <Link to={`/item-returns/${request.id}`} className="text-blue-600 hover:underline font-medium transition-colors">
                          {request.id}
                        </Link>
                      </td>
                      <td className="px-6 py-4 border-r border-[var(--border)]">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{request.project_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{request.created_by}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm text-[var(--text-primary)]">{request.location}</div>
                      </td>
                      <td className="px-6 py-4 border-r border-[var(--border)]">
                        <div className="text-sm text-[var(--text-primary)]" title={request.reason}>{request.reason || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm font-medium text-[var(--text-primary)] flex items-center">
                          <User className="h-3 w-3 mr-1 text-[var(--text-muted)]" />
                          {request.approver_names || 'All Approvers'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm text-[var(--text-primary)]">{request.release_by || 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm font-medium text-[var(--text-primary)]">{request.item_count}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <div className="text-sm text-[var(--text-primary)]">{new Date(request.created_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap border-r border-[var(--border)]">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor(request.status)} shadow-sm`}>
                          {statusIcon(request.status)}
                          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link to={`/item-returns/${request.id}`} className="text-blue-600 hover:text-blue-500 font-medium transition-colors">
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredRequests.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--text-secondary)]">No {activeTab} return requests yet</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

interface ReturnFormProps {
  onSave: (formData: {
    createdBy: string;
    projectName: string;
    location: string;
    reason: string;
    items: { name: string; quantity_requested: number }[];
  }) => void;
  onCancel: () => void;
  items: Item[];
  approvers: Approver[];
  sendToAll: boolean;
  setSendToAll: (value: boolean) => void;
  selectedApproverIds: number[];
  setSelectedApproverIds: (ids: number[]) => void;
}

const ReturnForm: React.FC<ReturnFormProps> = ({
  onSave,
  onCancel,
  items,
  approvers,
  sendToAll,
  setSendToAll,
  selectedApproverIds,
  setSelectedApproverIds
}) => {
  const [formData, setFormData] = useState({
    createdBy: '',
    projectName: '',
    location: '',
    reason: '',
  });
  const [selectedItems, setSelectedItems] = useState<{ name: string; requested: string }[]>([{ name: '', requested: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const createdByRef = useRef<HTMLInputElement>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const itemNameRefs = useRef<(HTMLSelectElement | null)[]>([]);
  const itemQtyRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (sendToAll && approvers.length > 0) {
      setSelectedApproverIds(approvers.map(a => a.id));
    }
  }, [sendToAll, approvers, setSelectedApproverIds]);

  const handleKeyDown = (e: React.KeyboardEvent, nextRef: React.RefObject<any> | null) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef?.current?.focus();
    }
  };

  const handleAddItem = () => {
    setSelectedItems([...selectedItems, { name: '', requested: '' }]);
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...selectedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setSelectedItems(newItems);
  };

  const removeItemRow = (index: number) => {
    if (selectedItems.length > 1) {
      setSelectedItems(selectedItems.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!formData.createdBy || !formData.projectName || !formData.location || !formData.reason) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const validItems = selectedItems
      .filter(item => item.name.trim() && parseInt(item.requested) > 0)
      .map(item => ({
        name: item.name.trim(),
        quantity_requested: parseInt(item.requested) || 0
      }));

    if (validItems.length === 0) {
      toast({ title: "Error", description: "Please add at least one item with quantity", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    if (!sendToAll && selectedApproverIds.length === 0) {
      toast({ title: "Error", description: "Please select at least one approver", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    await onSave({ ...formData, items: validItems });

    setFormData({ createdBy: '', projectName: '', location: '', reason: '' });
    setSelectedItems([{ name: '', requested: '' }]);
    setSendToAll(true);
    if (approvers.length > 0) {
      setSelectedApproverIds(approvers.map(a => a.id));
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Returned By *</label>
          <Input
            ref={createdByRef}
            value={formData.createdBy}
            onChange={(e) => setFormData({ ...formData, createdBy: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, projectNameRef)}
            placeholder="Your full name"
            className="border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md"
            disabled={submitting}
          />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Project Name *</label>
          <Input
            ref={projectNameRef}
            value={formData.projectName}
            onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, locationRef)}
            placeholder="Project name"
            className="border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md"
            disabled={submitting}
          />
        </div>
        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)]">Location of Project *</label>
          <Input
            ref={locationRef}
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, reasonRef)}
            placeholder="Project location"
            className="border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md"
            disabled={submitting}
          />
        </div>
        <div className="md:col-span-2 space-y-3">
          <label className="block text-sm font-semibold text-[var(--text-body)] flex items-center">
            <AlertCircle className="h-4 w-4 mr-2 text-[var(--text-muted)]" />
            Return Reason *
          </label>
          <Textarea
            ref={reasonRef}
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            onKeyDown={(e) => handleKeyDown(e, itemNameRefs.current[0] ? { current: itemNameRefs.current[0] } : null)}
            placeholder="Brief reason for returning the items (e.g., project completed early, defective items)"
            className="border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md min-h-[100px]"
            disabled={submitting}
          />
        </div>
      </div>

      {/* APPROVER SELECTION */}
      <div className="bg-[var(--surface-secondary)] p-6 rounded-2xl border border-[var(--border)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Send Request To</h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="radio"
              checked={sendToAll}
              onChange={() => setSendToAll(true)}
              className="mr-3 h-4 w-4 text-green-600"
              disabled={submitting}
            />
            <span className="font-medium text-[var(--text-body)]">All Approvers (Default)</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              checked={!sendToAll}
              onChange={() => setSendToAll(false)}
              className="mr-3 h-4 w-4 text-green-600"
              disabled={submitting}
            />
            <span className="font-medium text-[var(--text-body)]">Specific Approvers</span>
          </label>

          {!sendToAll && (
            <div className="mt-4 pl-7 space-y-2 max-h-48 overflow-y-auto">
              {approvers.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No approvers available</p>
              ) : (
                approvers.map(approver => (
                  <label key={approver.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedApproverIds.includes(approver.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedApproverIds([...selectedApproverIds, approver.id]);
                        } else {
                          setSelectedApproverIds(selectedApproverIds.filter(id => id !== approver.id));
                        }
                      }}
                      className="mr-2 h-4 w-4 text-green-600 rounded"
                      disabled={submitting}
                    />
                    <span className="text-sm text-[var(--text-body)]">{approver.fullName}</span>
                  </label>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm bg-gradient-to-b from-white to-gray-50">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-green-50 to-emerald-50">
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">SRL</th>
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">Name of Material</th>
                <th className="border-r border-[var(--border)] p-4 text-left text-xs font-semibold text-[var(--text-body)]">Qty. to Return</th>
                <th className="p-4 text-left text-xs font-semibold text-[var(--text-body)]">Action</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item, index) => (
                <tr key={index} className="border-t border-[var(--border)] hover:bg-[var(--surface)]/60 transition-all duration-200">
                  <td className="border-r border-[var(--border)] p-4 font-semibold text-sm text-[var(--text-primary)]">{index + 1}</td>
                  <td className="border-r border-[var(--border)] p-4">
                    <Select
                      value={item.name}
                      onValueChange={(value) => handleItemChange(index, 'name', value)}
                      disabled={submitting}
                    >
                      <SelectTrigger
                        ref={(el) => (itemNameRefs.current[index] = el)}
                        className="w-full border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-3 py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                        onKeyDown={(e) => handleKeyDown(e, itemQtyRefs.current[index] ? { current: itemQtyRefs.current[index] } : null)}
                      >
                        <SelectValue placeholder="Select Item" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl shadow-lg border-[var(--border)]">
                        {items.map((itemOption) => (
                          <SelectItem key={itemOption.id} value={itemOption.name} className="px-4 py-2 hover:bg-green-50">
                            {itemOption.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="border-r border-[var(--border)] p-4">
                    <Input
                      ref={(el) => (itemQtyRefs.current[index] = el)}
                      type="number"
                      value={item.requested}
                      onChange={(e) => handleItemChange(index, 'requested', e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, index === selectedItems.length - 1 ? null : itemNameRefs.current[index + 1] ? { current: itemNameRefs.current[index + 1] } : null)}
                      className="text-sm w-20 border border-[var(--border-strong)] focus:ring-2 focus:ring-green-500 focus:border-green-500 rounded-xl px-3 py-2 shadow-sm transition-all duration-200 hover:shadow-md"
                      min="0"
                      disabled={submitting}
                    />
                  </td>
                  <td className="p-4">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItemRow(index)}
                      disabled={submitting || selectedItems.length <= 1}
                      className="text-xs rounded-lg"
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleAddItem}
          className="w-full border-[var(--border-strong)] hover:bg-green-50 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"
          disabled={submitting}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Row
        </Button>
      </div>

      <div className="flex justify-end space-x-3 pt-6 border-t border-[var(--border)]">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          className="border-[var(--border-strong)] hover:bg-[var(--surface-hover)] rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 shadow-lg rounded-xl transition-all duration-200 hover:shadow-xl"
        >
          {submitting ? 'Submitting...' : 'Submit Return Request'}
        </Button>
      </div>
    </form>
  );
};

export default ItemReturns;