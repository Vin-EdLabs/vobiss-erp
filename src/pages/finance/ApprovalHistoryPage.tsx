import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, FileText, Search, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getFuelRequests, getTransportRequests, type FuelRequest, type TransportRequest } from '../../api';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

export default function ApprovalHistoryPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [fuelRequests, setFuelRequests] = useState<FuelRequest[]>([]);
  const [transportRequests, setTransportRequests] = useState<TransportRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [fuel, transport] = await Promise.all([
          getFuelRequests(),
          getTransportRequests(),
        ]);
        setFuelRequests(Array.isArray(fuel) ? fuel : []);
        setTransportRequests(Array.isArray(transport) ? transport : []);
      } catch (error: any) {
        toast({ title: 'Unable to load approval history', description: error.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const rows = useMemo(() => {
    const term = search.toLowerCase().trim();
    const fuelHistory = fuelRequests
      .filter((item) => item.status && /(approved|rejected|cash|completed|receipt)/i.test(String(item.status)))
      .map((item) => ({
        id: `fuel-${item.id}`,
        kind: 'Fuel Request',
        reference: item.ref_no,
        requester: item.requester_name,
        status: item.status,
        created_at: item.created_at,
        link: `/transport/fuel-requests/${item.id}`,
      }));

    const transportHistory = transportRequests
      .filter((item) => item.status && /(approved|rejected)/i.test(String(item.status)))
      .map((item) => ({
        id: `transport-${item.id}`,
        kind: 'Transport Request',
        reference: `TR-${item.id}`,
        requester: item.requester_name,
        status: item.status,
        created_at: item.created_at,
        link: `/transport-requests/${item.id}`,
      }));

    const all = [...fuelHistory, ...transportHistory];
    if (!term) return all;
    return all.filter((row) => [row.kind, row.reference, row.requester, row.status].join(' ').toLowerCase().includes(term));
  }, [fuelRequests, transportRequests, search]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading approval history…</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><FileText className="h-6 w-6" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workflow</p>
            <h1 className="text-3xl font-bold text-slate-900">Approval History</h1>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by type, ref, requester, or status" className="w-full pl-9" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Date</th>
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">No approval history found.</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{row.kind}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.reference}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{row.requester || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${row.status.toLowerCase().includes('rejected') ? 'bg-rose-100 text-rose-800 border border-rose-200' : row.status.toLowerCase().includes('approved') || row.status.toLowerCase().includes('completed') || row.status.toLowerCase().includes('cash') ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                        {row.status.toLowerCase().includes('rejected') ? <XCircle className="h-3.5 w-3.5" /> : row.status.toLowerCase().includes('approved') || row.status.toLowerCase().includes('completed') ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                        {row.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-4">
                      <Link to={row.link} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500"><ArrowUpRight className="h-4 w-4" /> View</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
