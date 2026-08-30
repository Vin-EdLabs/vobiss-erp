import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, HandCoins, Plus, ShieldCheck } from 'lucide-react';
import { API_URL } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';

interface RentalVehicleRequestSummary {
  id: number;
  transport_request_id: number;
  requester_name?: string | null;
  purpose?: string | null;
  status: string;
  current_stage?: string | null;
  created_at?: string;
  updated_at?: string;
  reference_type?: string | null;
  reference_id?: number | null;
  reference_number?: string | null;
  reference_title?: string | null;
  reference_status?: string | null;
}

const statusStyles: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800',
  pending: 'bg-amber-100 text-amber-800',
  pending_manager: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  sent_to_finance: 'bg-sky-100 text-sky-800',
  pending_finance: 'bg-sky-100 text-sky-800',
  cash_issued: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
};

export default function RentalVehicleRequestsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<RentalVehicleRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const vehicleResponse = await fetch(`${API_URL}/transport/vehicle-requests`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });

      const raw = await vehicleResponse.text();
      let payload: any = null;

      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch {
          payload = null;
        }
      }

      if (!vehicleResponse.ok) {
        throw new Error(payload?.error || 'Unable to load rental vehicle requests.');
      }

      if (!payload && raw) {
        throw new Error('The API returned an unexpected HTML response. Check the backend connection and try again.');
      }

      setItems(Array.isArray(payload) ? payload : []);
    } catch (error: any) {
      console.error(error);
      toast({ title: 'Unable to load entries', description: error.message || 'Please try again.', variant: 'destructive' });
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading rental vehicle requests…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-amber-100 p-3 text-amber-700 shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Transport</p>
            <h1 className="text-3xl font-bold text-slate-900">Rental Vehicle Requests</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/transport/new-rental-vehicle-request')}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" /> New Rental Request
          </button>
          <Link to="/transport-supervisor-dashboard" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ArrowRight className="h-4 w-4 rotate-180" /> Dashboard
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-sm font-semibold text-slate-700">Rental vehicle requests</span>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm">
            <HandCoins className="h-3.5 w-3.5" /> {items.length} entries
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">There are no rental vehicle requests yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Request</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Purpose</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-semibold text-slate-900">#{item.id}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{item.requester_name || '—'}</td>
                    <td className="px-6 py-4"><ReferenceBadge reference={item} /></td>
                    <td className="px-6 py-4 text-sm text-slate-700 max-w-md truncate">{item.purpose || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[item.status] || 'bg-slate-100 text-slate-700'}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link to={`/transport-requests/${item.transport_request_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                        <FileText className="h-4 w-4" /> View request
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
