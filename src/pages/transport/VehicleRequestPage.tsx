import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, Plus, Trash2, Upload, Download, Eye, Check, X } from 'lucide-react';
import { createVehicleRequestForm, getTransportRequest, getUsers, uploadTransportFiles, type TransportRequestDetail, type VehicleLineItem, type AttachmentItem } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';

const emptyRow = (): VehicleLineItem => ({
  id: crypto.randomUUID(),
  description: '',
  qty_days: '',
  unit_price: '',
  total: 0,
});

const formatMoney = (value: number) => `GHC ${Number(value || 0).toFixed(2)}`;

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(name);

export default function VehicleRequestPage() {
  const { transportRequestId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [transportRequest, setTransportRequest] = useState<TransportRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lineItems, setLineItems] = useState<VehicleLineItem[]>([emptyRow()]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [form, setForm] = useState({
    phone: '',
    special_instructions: '',
    order_no: '',
    invoice_terms: '',
    received_by: '',
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const request = await getTransportRequest(String(transportRequestId));
        if (!active) return;
        setTransportRequest(request);
      } catch (err) {
        console.error(err);
        if (!active) return;
        toast({ title: 'Transport request not found', description: 'The linked request could not be loaded.', variant: 'destructive' });
      } finally {
        if (active) setLoading(false);
      }
    };
    if (transportRequestId && transportRequestId !== 'null' && transportRequestId !== 'undefined') { void load(); }
    return () => {
      active = false;
    };
  }, [transportRequestId, toast]);

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
    if (!transportRequestId || !transportRequest) return;
    try {
      setSaving(true);
      await createVehicleRequestForm({
        transport_request_id: Number(transportRequestId),
        phone: form.phone,
        special_instructions: form.special_instructions,
        order_no: form.order_no,
        invoice_terms: form.invoice_terms,
        received_by: form.received_by,
        line_items: lineItems.map((row) => ({
          ...row,
          qty_days: Number(row.qty_days || 0),
          unit_price: Number(row.unit_price || 0),
          total: Number(row.total || 0),
        })),
        attachments,
      });
      toast({ title: 'Vehicle request submitted', description: 'It has moved to manager approval.', variant: 'default' });
      navigate('/transport/rental-vehicle-requests', { state: { submitted: true } });
    } catch (error: any) {
      toast({ title: 'Unable to submit', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading transport request…</div>;
  if (!transportRequest) return <div className="p-6 text-sm text-slate-500">Transport request not found.</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">VOBISS</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Rental Vehicle Request</h1>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-sm text-slate-700">
            <div className="font-semibold">Department</div>
            <div>{user?.unit || user?.position || 'Operations'}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs uppercase text-slate-500">Requestor Name</span><p className="mt-1 font-medium text-slate-800">{transportRequest.requester_name}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs uppercase text-slate-500">Date Submitted</span><p className="mt-1 font-medium text-slate-800">{new Date(transportRequest.created_at).toLocaleDateString()}</p></div>
          <div className="rounded-xl bg-slate-50 p-3 md:col-span-2"><span className="text-xs uppercase text-slate-500">Purpose</span><p className="mt-1 whitespace-pre-wrap text-slate-700">{transportRequest.purpose || 'No purpose given.'}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs uppercase text-slate-500">Deliver To</span><p className="mt-1 font-medium text-slate-800">{transportRequest.engineer_name || transportRequest.engineer_id || 'Not provided'}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs uppercase text-slate-500">Department</span><p className="mt-1 font-medium text-slate-800">{user?.unit || 'Operations'}</p></div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Order No.</span>
            <input value={form.order_no} onChange={(e) => setForm({ ...form, order_no: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            <span>Special Instructions</span>
            <textarea value={form.special_instructions} onChange={(e) => setForm({ ...form, special_instructions: e.target.value })} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Invoice Terms</span>
            <input value={form.invoice_terms} onChange={(e) => setForm({ ...form, invoice_terms: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Received By</span>
            <input value={form.received_by} onChange={(e) => setForm({ ...form, received_by: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Vehicle / Cost Table</h2>
          <button type="button" onClick={addRow} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-slate-600">
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
                  <td className="px-2 py-2"><input value={row.description} onChange={(e) => updateRow(row.id, 'description', e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2" placeholder="e.g. vehicle registration" /></td>
                  <td className="px-2 py-2"><input type="number" value={row.qty_days as any} onChange={(e) => updateRow(row.id, 'qty_days', e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-2" /></td>
                  <td className="px-2 py-2"><input type="number" step="0.01" value={row.unit_price as any} onChange={(e) => updateRow(row.id, 'unit_price', e.target.value)} className="w-32 rounded-lg border border-slate-300 px-2 py-2" /></td>
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

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate(`/transport-requests/${transportRequest.id}`)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium text-slate-700">Cancel</button>
        <button type="button" onClick={onSubmit} disabled={saving} className="rounded-lg bg-amber-600 px-4 py-2.5 font-medium text-white hover:bg-amber-700 disabled:opacity-60">
          {saving ? 'Submitting…' : 'Submit Vehicle Request'}
        </button>
      </div>
    </div>
  );
}
