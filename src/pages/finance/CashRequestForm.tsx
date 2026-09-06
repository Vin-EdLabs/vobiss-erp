// src/pages/finance/CashRequestForm.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Search, Clock, CheckCircle, DollarSign, XCircle, Users, FileText } from 'lucide-react';
import { getApprovers, createCashRequest, getRequests, getWorkflowConfig } from '../../api';
import { ReferenceLinkPicker } from '@/components/references/ReferenceLinkPicker';
import type { ReferenceSummary } from '@/lib/referenceRegistry';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { vobiAmbientStore } from '@/stores/vobiAmbientStore';
import { useVobiFormState } from '@/hooks/useVobiFormState';
import { useVobiSection } from '@/hooks/useVobiSection';

interface Approver {
  id: number;
  fullName: string;
  canApproveMaterial?: boolean;
  canApproveCash?: boolean;
}

interface CashRequest {
  id: number;
  created_by: string;
  purpose: string | null;
  department: string | null;
  total_amount: number | string | null;
  status: 'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected';
  created_at: string;
  supervisor_approved_by?: string | null;
  finance_approved_by?: string | null;
}

const CashRequestForm: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
  const [requests, setRequests] = useState<CashRequest[]>([]);
  const [filtered, setFiltered] = useState<CashRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'supervisor_approved' | 'finance_approved' | 'completed' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Auto-filled requestor name (non-editable)
  const requestorName = user?.first_name && user?.last_name 
    ? `${user.first_name} ${user.last_name}` 
    : user?.username || '';

  // Form state
  const [formData, setFormData] = useState({
    createdBy: requestorName,
    department: '',
    purpose: '',
    deliverTo: '',
    deliverPhone: '',
    specialInstructions: '',
    dateNeeded: '', // Stored as YYYY-MM-DD from input
  });

  const [lineItems, setLineItems] = useState([
    { description: '', qty: '', unitPrice: '', total: '0' }
  ]);
  const [linkedReferences, setLinkedReferences] = useState<ReferenceSummary[]>([]);
  const [requireReference, setRequireReference] = useState(false);

  useVobiSection({
    id: 'cash-request-form',
    title: 'Cash Request Form',
    help: 'Submit cash requests with a clear purpose, valid expense items, and finance-capable approvers.',
    priority: 20,
  }, isFormOpen);

  useVobiFormState({
    formKey: 'cash-request',
    requiredFields: [
      { field: 'purpose', label: 'Purpose' },
      { field: 'selectedApproverIds', label: 'Approvers' },
      { field: 'lineItems', label: 'Expense Items' },
    ],
    currentValues: {
      purpose: formData.purpose,
      selectedApproverIds,
      lineItems: lineItems.filter((item) => item.description?.trim() && Number(item.qty) > 0 && Number(item.unitPrice) > 0),
    },
    enabled: isFormOpen,
  });

  useEffect(() => {
    vobiAmbientStore.getState().setFormHint('cash-request');
  }, []);

  // Prevent body scroll when form is open (prevents scrollbar shift)
  useEffect(() => {
    if (isFormOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isFormOpen]);

  useEffect(() => {
    Promise.all([loadApprovers(), loadRequests()]);
  }, [user]);

  useEffect(() => {
    getWorkflowConfig()
      .then((workflow: any) => setRequireReference(Boolean(workflow?.transport?.require_reference_link_cash)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    filterRequests();
  }, [requests, searchTerm, activeTab]);

  const loadApprovers = async () => {
    try {
      const data = await getApprovers();
      const cashApprovers = data.filter((approver: Approver) => approver.canApproveCash && approver.id !== user?.id);
      setApprovers(cashApprovers);
      setSelectedApproverIds(cashApprovers.map(a => a.id));
    } catch (error) {
      toast({ title: "Error", description: "Failed to load approvers", variant: "destructive" });
    }
  };

  const isMyRequest = (request: CashRequest) => {
    if (!user) return false;
    if (Number((request as any).created_by_id) === Number(user.id)) return true;

    const createdBy = (request.created_by || '').trim().toLowerCase();
    const username = (user.username || '').trim().toLowerCase();
    const firstName = (user.first_name || '').trim().toLowerCase();
    const lastName = (user.last_name || '').trim().toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
    const reverseName = `${lastName} ${firstName}`.trim().toLowerCase();

    return createdBy.includes(username) ||
           createdBy.includes(firstName) ||
           createdBy.includes(lastName) ||
           createdBy.includes(fullName) ||
           createdBy.includes(reverseName) ||
           username.includes(createdBy);
  };

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getRequests();
      const cashRequests = data
        .filter((r: any) => r.type === 'cash_request')
        .map((r: any) => ({
          id: r.id,
          created_by: r.created_by,
          purpose: r.purpose,
          department: r.department,
          total_amount: r.total_amount,
          status: r.status,
          created_at: r.created_at,
          supervisor_approved_by: r.supervisor_approved_by,
          finance_approved_by: r.finance_approved_by,
        }))
        .filter(isMyRequest);

      setRequests(cashRequests);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load your requests", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filterRequests = () => {
    let filteredList = requests.filter(r => r.status === activeTab);
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filteredList = filteredList.filter(r =>
        r.created_by?.toLowerCase().includes(term) ||
        r.department?.toLowerCase().includes(term)
      );
    }
    
    setFiltered(filteredList);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', qty: '', unitPrice: '', total: '0' }]);
  };

  const updateLineItem = (index: number, field: string, value: string) => {
    const updated = [...lineItems];
    updated[index][field] = value;
    if (field === 'qty' || field === 'unitPrice') {
      const qty = parseFloat(updated[index].qty) || 0;
      const price = parseFloat(updated[index].unitPrice) || 0;
      updated[index].total = (qty * price).toFixed(2);
    }
    setLineItems(updated);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + parseFloat(item.total || '0'), 0).toFixed(2);
  };

  // Helper: Format date from YYYY-MM-DD to dd/mm/yyyy
  const formatDateForDisplay = (dateString: string): string => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (selectedApproverIds.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Approver is required',
        body: 'This cash request needs at least one finance-capable approver.',
        formKey: 'cash-request',
        fieldErrors: [{
          field: 'selectedApproverIds',
          label: 'Approvers',
          message: 'Select at least one approver before submitting.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    if (requireReference && linkedReferences.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Reference link is required',
        body: 'This cash request needs at least one linked reference before it can be submitted.',
        formKey: 'cash-request',
        fieldErrors: [{
          field: 'linkedReferences',
          label: 'Linked Reference',
          message: 'Link a ticket, project, or other request before submitting.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    if (!formData.purpose.trim()) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Purpose is required',
        body: 'Vobi checked this cash request and found the purpose is missing.',
        formKey: 'cash-request',
        fieldErrors: [{
          field: 'purpose',
          label: 'Purpose',
          message: 'Describe what the cash is for before submitting.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    const validItems = lineItems.filter(item => 
      item.description?.trim() && 
      parseFloat(item.qty) > 0 && 
      parseFloat(item.unitPrice) > 0
    );
    if (validItems.length === 0) {
      vobiAmbientStore.getState().setExactIssue({
        title: 'Expense item is required',
        body: 'This cash request needs at least one complete expense row.',
        formKey: 'cash-request',
        fieldErrors: [{
          field: 'lineItems',
          label: 'Expense Items',
          message: 'Add an expense description, quantity, and unit price.',
        }],
        action: 'Show me',
      });
      setSubmitting(false);
      return;
    }

    const requestData = {
      ...formData,
      totalAmount: parseFloat(calculateTotal()),
      linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
    };

    try {
      await createCashRequest(requestData, selectedApproverIds, lineItems);
      toast({ title: 'Request submitted successfully' });
      setIsFormOpen(false);
      loadRequests();
      setLineItems([{ description: '', qty: '', unitPrice: '', total: '0' }]);
      setLinkedReferences([]);
      setFormData(prev => ({
        ...prev,
        purpose: '',
        deliverTo: '',
        deliverPhone: '',
        department: '',
        dateNeeded: '',
        specialInstructions: ''
      }));
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Submission failed", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected = approvers.length > 0 && selectedApproverIds.length === approvers.length;
  const handleSelectAll = () => {
    setSelectedApproverIds(allSelected ? [] : approvers.map(a => a.id));
  };
  const toggleApprover = (id: number) => {
    setSelectedApproverIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'supervisor_approved': return 'bg-blue-100 text-blue-800';
      case 'finance_approved': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending Approver';
      case 'supervisor_approved': return 'Approved – Waiting for Finance';
      case 'finance_approved': return 'Cash Released';
      case 'completed': return 'Completed';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const formatAmount = (amount: number | string | null | undefined): string => {
    const num = Number(amount) || 0;
    return num.toFixed(2);
  };

  const getCount = (status: string) => requests.filter(r => r.status === status).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your cash requests...</p>
        </div>
      </div>
    );
  }

  const hasAnyRequests = requests.length > 0;

  return (
    <div className="p-4 max-w-7xl mx-auto sm:p-6">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 sm:text-4xl">My Cash Requests</h1>
        <p className="text-gray-600">Submit and track your personal cash requests</p>
      </div>

      <div className="bg-white rounded-xl shadow-[var(--shadow-md)] border border-gray-200 p-4 mb-6 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Search className="h-5 w-5 shrink-0 text-gray-400" />
            <Input
              placeholder="Search by requestor, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-md"
            />
          </div>
          <Button
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="w-full sm:w-auto"
          >
            <Plus className="h-5 w-5 mr-2" />
            {isFormOpen ? 'Close Form' : 'New Cash Request'}
          </Button>
        </div>
      </div>

      {/* Form Section */}
      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-8 mb-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">VOBISS CASH REQUEST</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date Submitted</label>
                <Input value={new Date().toLocaleDateString('en-GB')} disabled className="bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Requestor *</label>
                <Input value={requestorName} disabled className="bg-gray-100" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Department</label>
                <Input value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date Needed *</label>
                <div className="space-y-2">
                  <Input 
                    type="date" 
                    value={formData.dateNeeded} 
                    onChange={e => setFormData({ ...formData, dateNeeded: e.target.value })} 
                    required 
                  />
                  {formData.dateNeeded && (
                    <p className="text-sm text-gray-600">
                      Selected: {formatDateForDisplay(formData.dateNeeded)}
                    </p>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Purpose *</label>
                <textarea
                  data-vobi-field="purpose"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={3}
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Deliver To</label>
                <Input value={formData.deliverTo} onChange={e => setFormData({ ...formData, deliverTo: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                <Input value={formData.deliverPhone} onChange={e => setFormData({ ...formData, deliverPhone: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Special Instructions</label>
                <textarea
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-none"
                  rows={3}
                  value={formData.specialInstructions}
                  onChange={e => setFormData({ ...formData, specialInstructions: e.target.value })}
                  placeholder="Any additional notes or instructions..."
                />
              </div>
            </div>

            {/* Rest of form unchanged */}
            <div className="overflow-x-auto border rounded-xl">
              <span data-vobi-field="lineItems" className="sr-only">Expense Items</span>
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="p-4 text-left w-3/5">Description / Item</th>
                    <th className="p-4 text-left">Qty</th>
                    <th className="p-4 text-left">Unit Price</th>
                    <th className="p-4 text-left">Total</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-4 align-top">
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-none min-h-20"
                          value={item.description}
                          onChange={e => updateLineItem(index, 'description', e.target.value)}
                          placeholder="Enter detailed description..."
                          required
                          rows={3}
                        />
                      </td>
                      <td className="p-4 align-top">
                        <Input type="number" min="1" value={item.qty} onChange={e => updateLineItem(index, 'qty', e.target.value)} className="w-24" required />
                      </td>
                      <td className="p-4 align-top">
                        <Input type="number" step="0.01" value={item.unitPrice} onChange={e => updateLineItem(index, 'unitPrice', e.target.value)} className="w-32" required />
                      </td>
                      <td className="p-4 align-top font-medium text-green-700">
                        {item.total}
                      </td>
                      <td className="p-4 align-top">
                        <Button type="button" variant="destructive" size="sm" onClick={() => removeLineItem(index)} disabled={lineItems.length === 1}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-bold bg-[var(--accent-green-light)] text-[var(--success-text)]">
                    <td colSpan={3} className="p-4 text-right">TOTAL</td>
                    <td className="p-4">GHS {calculateTotal()}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <Button type="button" onClick={addLineItem} size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                <Users className="h-5 w-5 inline mr-2" /> Approvers (First Approval Stage)
              </label>
              <div className="border rounded-xl p-4 bg-gradient-to-b from-blue-50 to-indigo-50">
                <span data-vobi-field="selectedApproverIds" className="sr-only">Approvers</span>
                <div className="flex items-center mb-3">
                  <Checkbox checked={allSelected} onCheckedChange={handleSelectAll} />
                  <span className="ml-2 font-medium">Select All ({approvers.length})</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {approvers.map(approver => (
                    <div key={approver.id} className="flex items-center">
                      <Checkbox checked={selectedApproverIds.includes(approver.id)} onCheckedChange={() => toggleApprover(approver.id)} />
                      <span className="ml-2 text-sm">{approver.fullName}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-6">
              <Button type="submit" disabled={submitting} className="px-8 py-3 font-semibold">
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs and Table - unchanged */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        {/* 5 tabs forced into equal grid columns left each one truncated to a sliver on a
            phone — a horizontally-scrollable strip below sm keeps every label fully readable,
            same equal-width grid as before once there's room for it. */}
        <TabsList className="flex w-full justify-start gap-1 overflow-x-auto mb-6 sm:grid sm:grid-cols-5 sm:justify-center sm:gap-0 sm:overflow-visible">
          <TabsTrigger value="pending" className="shrink-0 sm:shrink">Pending Approver ({getCount('pending')})</TabsTrigger>
          <TabsTrigger value="supervisor_approved" className="shrink-0 sm:shrink">Approved – Waiting Finance ({getCount('supervisor_approved')})</TabsTrigger>
          <TabsTrigger value="finance_approved" className="shrink-0 sm:shrink">Released ({getCount('finance_approved')})</TabsTrigger>
          <TabsTrigger value="completed" className="shrink-0 sm:shrink">Completed ({getCount('completed')})</TabsTrigger>
          <TabsTrigger value="rejected" className="shrink-0 sm:shrink">Rejected ({getCount('rejected')})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-200 shadow-[var(--shadow-md)]">
            {filtered.length === 0 ? (
              <div className="text-center py-16 px-6">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-700 mb-2">
                  {hasAnyRequests 
                    ? `No requests in "${getStatusLabel(activeTab)}" status` 
                    : "You haven't created any cash requests yet"}
                </h3>
                <p className="text-gray-500 max-w-md mx-auto">
                  {hasAnyRequests 
                    ? "Try checking other tabs or use the search above."
                    : "Click the 'New Cash Request' button above to submit your first cash request."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop/tablet table — 8 columns, needs real width */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">ID</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Requestor</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Department</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Amount (GHS)</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Approver</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Finance</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filtered.map((request) => (
                        <tr key={request.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4">
                            <Link to={`/cash-details/${request.id}`} className="text-blue-600 hover:underline font-medium">
                              #{request.id}
                            </Link>
                          </td>
                          <td className="px-6 py-4 font-medium">
                            {request.created_by || '—'}
                          </td>
                          <td className="px-6 py-4">
                            {request.department || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-2xl font-bold text-green-700">
                              GHS {formatAmount(request.total_amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {request.supervisor_approved_by || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            {request.finance_approved_by || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(request.status)}`}>
                              {request.status === 'pending' && <Clock className="h-4 w-4 mr-2" />}
                              {request.status === 'supervisor_approved' && <CheckCircle className="h-4 w-4 mr-2" />}
                              {request.status === 'finance_approved' && <DollarSign className="h-4 w-4 mr-2" />}
                              {request.status === 'completed' && <CheckCircle className="h-4 w-4 mr-2" />}
                              {request.status === 'rejected' && <XCircle className="h-4 w-4 mr-2" />}
                              {getStatusLabel(request.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link to={`/cash-details/${request.id}`} className="text-blue-600 hover:underline text-sm">
                              View Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Phone — one card per request instead of an 8-column table squeezed sideways */}
                <div className="space-y-3 p-4 sm:hidden">
                  {filtered.map((request) => (
                    <Link
                      key={request.id}
                      to={`/cash-details/${request.id}`}
                      className="block rounded-xl border border-gray-200 p-4 active:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-blue-600">#{request.id}</p>
                          <p className="truncate font-semibold text-gray-900">{request.created_by || '—'}</p>
                          <p className="truncate text-sm text-gray-500">{request.department || '—'}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {getStatusLabel(request.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-green-700">GHS {formatAmount(request.total_amount)}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                        {request.supervisor_approved_by && <span>Approver: {request.supervisor_approved_by}</span>}
                        {request.finance_approved_by && <span>Finance: {request.finance_approved_by}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CashRequestForm;