import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileText, Plus, Trash2, Upload, Download, Eye, X, Search, Check } from 'lucide-react';
import { API_URL, getTransportRequests, uploadTransportFiles, getTransportSettings, getUserDirectory, getWorkflowConfig, type TransportRequest, type VehicleLineItem, type AttachmentItem, type UserDirectoryEntry } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import ReferencePicker from '@/components/transport/ReferencePicker';
import { referencePayload, type LinkedReference } from '@/lib/referenceLink';
import { ReferenceLinkPicker } from '@/components/references/ReferenceLinkPicker';
import type { ReferenceSummary } from '@/lib/referenceRegistry';
import { getTransportRequest } from '../../api';

const emptyRow = (): VehicleLineItem => ({
  id: crypto.randomUUID(),
  description: '',
  qty_days: '',
  unit_price: '',
  total: 0,
});

const formatMoney = (value: number) => `GHC ${Number(value || 0).toFixed(2)}`;

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);

export default function NewRentalVehicleRequestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const fieldWorkLinks = (location.state as { fieldWorkLinks?: ReferenceSummary[] } | null)?.fieldWorkLinks;
  const [saving, setSaving] = useState(false);
  const [lineItems, setLineItems] = useState<VehicleLineItem[]>([emptyRow()]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [availableTransportRequests, setAvailableTransportRequests] = useState<TransportRequest[]>([]);
  const [showTransportDropdown, setShowTransportDropdown] = useState(false);
  const [transportSearchTerm, setTransportSearchTerm] = useState('');
  const [selectedTransport, setSelectedTransport] = useState<TransportRequest | null>(null);
  const [allUsers, setAllUsers] = useState<UserDirectoryEntry[]>([]);
  const [approvers, setApprovers] = useState<UserDirectoryEntry[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<number[]>([]);
  const [linkedReference, setLinkedReference] = useState<LinkedReference | null>(null);
  const [referenceError, setReferenceError] = useState('');
  const [requireReference, setRequireReference] = useState(false);
  const [linkedReferences, setLinkedReferences] = useState<ReferenceSummary[]>(fieldWorkLinks || []);
  const [form, setForm] = useState({
    dept: '',
    requestor: '',
    purpose: '',
    deliver_to: '',
    phone: '',
    special_instructions: '',
    order_no: '',
    invoice_terms: '',
    received_by: '',
  });

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const loadData = async () => {
      try {
        const [requests, settings, users, workflow] = await Promise.all([
          getTransportRequests(),
          getTransportSettings(),
          getUserDirectory(),
          getWorkflowConfig().catch(() => ({ transport: {} } as any)),
        ]);
        setAvailableTransportRequests(Array.isArray(requests) ? requests : []);
        setAllUsers(Array.isArray(users) ? users : []);

        // Load approvers from settings
        const approverIds = (settings?.vehicle_request_approver_ids || settings?.approver_ids || []).map(Number);
        const approverUsers = (Array.isArray(users) ? users : []).filter((u) => approverIds.includes(Number(u.id)));
        setApprovers(approverUsers);
        setRequireReference(Boolean(workflow?.transport?.require_reference_link_vehicle || settings?.require_reference_link_vehicle));
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    if (user?.id) loadData();
  }, [user?.id]);

  const filteredTransportRequests = useMemo(() => {
    if (!transportSearchTerm) return availableTransportRequests;
    const term = transportSearchTerm.toLowerCase();
    return availableTransportRequests.filter(
      (req) =>
        String(req.id).includes(term) ||
        req.requester_name?.toLowerCase().includes(term) ||
        req.site_name?.toLowerCase().includes(term)
    );
  }, [availableTransportRequests, transportSearchTerm]);

  const handleSelectTransport = (transport: TransportRequest) => {
    setSelectedTransport(transport);
    setTransportSearchTerm('');
    setShowTransportDropdown(false);
    setForm((prev) => ({
      ...prev,
      requestor: transport.requester_name || '',
      dept: transport.client_name || '',
      purpose: transport.purpose || '',
      deliver_to: transport.engineer_name || '',
    }));
  };

  const handleReferenceLinked = async (ref: ReferenceSummary) => {
    if (ref.type !== 'transport_request') return;
    try {
      const detail = await getTransportRequest(ref.id);
      setForm((prev) => ({
        ...prev,
        requestor: prev.requestor || detail.requester_name || '',
        dept: prev.dept || detail.client_name || '',
        purpose: prev.purpose || detail.purpose || '',
        deliver_to: prev.deliver_to || detail.engineer_name || '',
      }));
    } catch (error) {
      console.error('Failed to auto-fill from linked transport request:', error);
    }
  };

  const toggleApprover = (approverId: number) => {
    setSelectedApprovers((prev) =>
      prev.includes(approverId) ? prev.filter((id) => id !== approverId) : [...prev, approverId]
    );
  };

  const grandTotal = useMemo(() => lineItems.reduce((sum, item) => sum + Number(item.total || 0), 0), [lineItems]);

  const updateRow = (id: string, field: keyof VehicleLineItem, value: string | number) => {
    setLineItems((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const updated = { ...row, [field]: value } as VehicleLineItem;
      if (field === 'qty_days' || field === 'unit_price') {
        const qty = Number(updated.qty_days || 0);
        const price = Number(updated.unit_price || 0);
        updated.total = qty * price;
      }
      return updated;
    }));
  };

  const addRow = () => setLineItems((prev) => [...prev, emptyRow()]);
  const removeRow = (id: string) => setLineItems((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const uploaded = await uploadTransportFiles(files);
      setAttachments((prev) => [...prev, ...uploaded]);
      toast({ title: 'Files uploaded', description: `${uploaded.length} file(s) ready for submission.`, variant: 'default' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message || 'The file could not be uploaded.', variant: 'destructive' });
    } finally {
      event.target.value = '';
    }
  };

  const onSubmit = async () => {
    if (!form.requestor || !form.dept) {
      toast({ title: 'Validation Error', description: 'Please fill in Requestor and Department fields.', variant: 'destructive' });
      return;
    }

    if (selectedApprovers.length === 0) {
      toast({ title: 'Validation Error', description: 'Please select at least one approver.', variant: 'destructive' });
      return;
    }
    if (requireReference && !linkedReference && linkedReferences.length === 0) {
      setReferenceError('Select a ticket, project, or material request before submitting.');
      toast({ title: 'Reference required', description: 'Link this request to an existing record.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const lineItemsData = lineItems.map((row) => ({
        ...row,
        qty_days: Number(row.qty_days || 0),
        unit_price: Number(row.unit_price || 0),
        total: Number(row.total || 0),
      }));

      const response = await fetch(`${API_URL}/transport/vehicle-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          transport_request_id: selectedTransport?.id || null,
          department: form.dept,
          requestor_name: form.requestor,
          purpose: form.purpose,
          deliver_to: form.deliver_to,
          phone: form.phone,
          special_instructions: form.special_instructions,
          order_no: form.order_no,
          invoice_terms: form.invoice_terms,
          received_by: form.received_by,
          line_items: lineItemsData,
          attachments: attachments,
          status: 'pending',
          selected_approver_ids: selectedApprovers,
          ...referencePayload(linkedReference),
          linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit rental vehicle request');
      }

      toast({ title: 'Vehicle request submitted', description: 'Selected approvers have been notified.', variant: 'default' });
      navigate('/transport/rental-vehicle-requests', { state: { submitted: true } });
    } catch (error: any) {
      toast({ title: 'Unable to submit', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onSaveDraft = async () => {
    if (!form.requestor || !form.dept) {
      toast({ title: 'Validation Error', description: 'Please fill in Requestor and Department fields.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const lineItemsData = lineItems.map((row) => ({
        ...row,
        qty_days: Number(row.qty_days || 0),
        unit_price: Number(row.unit_price || 0),
        total: Number(row.total || 0),
      }));

      const response = await fetch(`${API_URL}/transport/vehicle-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          transport_request_id: selectedTransport?.id || null,
          department: form.dept,
          requestor_name: form.requestor,
          purpose: form.purpose,
          deliver_to: form.deliver_to,
          phone: form.phone,
          special_instructions: form.special_instructions,
          order_no: form.order_no,
          invoice_terms: form.invoice_terms,
          received_by: form.received_by,
          line_items: lineItemsData,
          attachments: attachments,
          status: 'draft',
          selected_approver_ids: selectedApprovers,
          ...referencePayload(linkedReference),
          linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save rental vehicle request');
      }

      toast({ title: 'Draft saved', description: 'Your rental vehicle request has been saved as draft.', variant: 'default' });
      navigate('/transport/rental-vehicle-requests');
    } catch (error: any) {
      toast({ title: 'Unable to save', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Transport</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">New Rental Vehicle Request</h1>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm text-slate-700">
            <div className="font-semibold">Department</div>
            <div>{user?.unit || 'Operations'}</div>
          </div>
        </div>

        {/* Main Form Fields */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Dept *</span>
            <input
              value={form.dept}
              onChange={(e) => setForm({ ...form, dept: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              placeholder="Department"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Requestor *</span>
            <input
              value={form.requestor}
              onChange={(e) => setForm({ ...form, requestor: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              placeholder="Requestor name"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Purpose</span>
            <input
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              placeholder="Purpose"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Deliver to</span>
            <input
              value={form.deliver_to}
              onChange={(e) => setForm({ ...form, deliver_to: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              placeholder="Delivery location"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Phone</span>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
              placeholder="Phone number"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Date Submitted</span>
            <input
              type="date"
              value={today}
              disabled
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-500"
            />
          </label>
        </div>

        <label className="mt-4 space-y-2 text-sm font-medium text-slate-700">
          <span>Special Instructions</span>
          <textarea
            value={form.special_instructions}
            onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
            placeholder="Any special instructions or notes"
          />
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Order No.</span>
            <input
              value={form.order_no}
              onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Invoice Terms</span>
            <input
              value={form.invoice_terms}
              onChange={(e) => setForm({ ...form, invoice_terms: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Received By</span>
            <input
              value={form.received_by}
              onChange={(e) => setForm({ ...form, received_by: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5"
            />
          </label>
        </div>
      </div>

      {/* Link Transport Request Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Link Transport Request (Optional)</h2>
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={selectedTransport ? `#${selectedTransport.id} - ${selectedTransport.requester_name}` : transportSearchTerm}
              onChange={(e) => {
                setTransportSearchTerm(e.target.value);
                setShowTransportDropdown(true);
              }}
              onFocus={() => setShowTransportDropdown(true)}
              placeholder="Search by transport request #, name..."
              className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-2.5"
            />
            {selectedTransport && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTransport(null);
                  setTransportSearchTerm('');
                }}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {showTransportDropdown && !selectedTransport && transportSearchTerm && filteredTransportRequests.length > 0 && (
            <div className="absolute top-full z-10 mt-2 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg">
              {filteredTransportRequests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => handleSelectTransport(req)}
                  className="w-full border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="text-sm font-medium text-slate-900">
                    #{req.id} - {req.requester_name}
                  </div>
                  <div className="text-xs text-slate-500">{req.site_name}</div>
                </button>
              ))}
            </div>
          )}

          {selectedTransport && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm text-emerald-900">
                <span className="font-medium">✓ Selected Transport Request:</span> #{selectedTransport.id} - {selectedTransport.requester_name}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cost Table Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Cost Table</h2>
          <button type="button" onClick={addRow} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-slate-600">
                <th className="px-2 py-2 font-medium">Item No.</th>
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 font-medium">Qty / Days</th>
                <th className="px-2 py-2 font-medium">Unit Price (GHC)</th>
                <th className="px-2 py-2 font-medium">Total GHC</th>
                <th className="px-2 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((row, index) => (
                <tr key={row.id} className="rounded-xl bg-slate-50">
                  <td className="px-2 py-2 text-sm text-slate-600">{index + 1}</td>
                  <td className="px-2 py-2">
                    <input
                      value={row.description}
                      onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-2"
                      placeholder="e.g. vehicle rental"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" value={row.qty_days as any} onChange={(e) => updateRow(row.id, 'qty_days', e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-2" />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" step="0.01" value={row.unit_price as any} onChange={(e) => updateRow(row.id, 'unit_price', e.target.value)} className="w-32 rounded-lg border border-slate-300 px-2 py-2" />
                  </td>
                  <td className="px-2 py-2 font-medium text-slate-800">{formatMoney(Number(row.total || 0))}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => removeRow(row.id)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-rose-700">
                      <Trash2 className="h-4 w-4" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end border-t border-slate-200 pt-4">
          <div className="text-right">
            <p className="text-xs uppercase text-slate-500">Grand Total</p>
            <p className="text-2xl font-bold text-slate-900">{formatMoney(grandTotal)}</p>
          </div>
        </div>
      </div>

      <ReferencePicker
        value={linkedReference}
        onChange={(next) => {
          setLinkedReference(next);
          setReferenceError('');
        }}
        required={requireReference}
        error={referenceError}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <ReferenceLinkPicker
          value={linkedReferences}
          onChange={setLinkedReferences}
          required={requireReference && !linkedReference}
          hint="Linking a Transport Request auto-fills Requestor, Department, Purpose, and Deliver To when those fields are empty. You can also link a Ticket or Service Request."
          onLinked={handleReferenceLinked}
        />
      </div>

      {/* File Upload Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Upload className="h-4 w-4 text-sky-600" /> Upload supporting documents
        </div>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          <input type="file" multiple accept="image/*,.pdf" onChange={handleFiles} className="hidden" />
          Click to upload images or PDFs
        </label>

        {attachments.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {attachments.map((file) => (
              <div key={file.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                {isImage(file.name) ? (
                  <img src={file.url} alt={file.name} className="h-32 w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex items-center gap-3 rounded-lg bg-white p-3">
                    <FileText className="h-8 w-8 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">{file.type}</p>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">
                    <Eye className="h-3.5 w-3.5" /> View
                  </a>
                  <a href={file.url} download={file.name} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700">
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approver Selection Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Select Approvers *</h2>
        {approvers.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No approvers configured. Please contact your administrator to set up vehicle rental request approvers.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {approvers.map((approver) => (
              <button
                key={approver.id}
                type="button"
                onClick={() => toggleApprover(approver.id)}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  selectedApprovers.includes(approver.id)
                    ? 'border-amber-600 bg-amber-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700">
                    {(approver.first_name?.[0] || '') + (approver.last_name?.[0] || '')}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{approver.first_name} {approver.last_name}</p>
                    <p className="text-xs text-slate-500">{approver.position || approver.role}</p>
                  </div>
                  {selectedApprovers.includes(approver.id) && (
                    <Check className="h-5 w-5 text-amber-600" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/transport/rental-vehicle-requests')}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={saving}
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save as Draft'}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-amber-600 px-4 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
