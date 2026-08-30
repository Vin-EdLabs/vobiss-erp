import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, FileText, HandCoins, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { completeFuelRequest, getFuelRequests, issueFuelCash, type FuelRequest } from '../../api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';

const statusStyle = (status: string) => {
  const value = status.toLowerCase();
  if (value.includes('completed')) return 'border border-emerald-200 bg-emerald-100 text-emerald-800';
  if (value.includes('receipt') || value.includes('cash')) return 'border border-blue-200 bg-blue-100 text-blue-800';
  return 'border border-sky-200 bg-sky-100 text-sky-800';
};

export default function FinanceFuelRequestsPage() {
  const [activeTab, setActiveTab] = useState<'pending_cash' | 'awaiting_receipt'>('pending_cash');
  const [requests, setRequests] = useState<FuelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const loadQueue = async () => {
    try {
      setLoading(true);
      const data = await getFuelRequests({ finance_queue: true, tab: activeTab });
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Unable to load finance queue', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadQueue(); }, [activeTab]);

  const handleIssueCash = async (id: number) => {
    try {
      setBusyId(id);
      await issueFuelCash(id);
      toast({ title: 'Cash issued', description: 'The request is now awaiting receipt submission.', variant: 'default' });
      await loadQueue();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err.message || 'Failed to issue cash.', variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const handleComplete = async (id: number) => {
    try {
      setBusyId(id);
      await completeFuelRequest(id);
      toast({ title: 'Request completed', description: 'The fuel request has been verified and closed.', variant: 'default' });
      await loadQueue();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err.message || 'Failed to complete request.', variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return !term ? requests : requests.filter((request) => [request.ref_no, request.requester_name, request.department, request.vehicle_plate, request.project_ticket_ref, request.purpose].some((value) => (value || '').toLowerCase().includes(term)));
  }, [requests, searchTerm]);

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-3 text-amber-700"><HandCoins className="h-6 w-6" /></div><div><h1 className="text-3xl font-bold text-slate-900">Fuel Cash &amp; Receipts</h1><p className="text-sm text-slate-500">Issue cash for approved fuel requests and verify submitted receipts.</p></div></div>
      <Button variant="outline" onClick={() => void loadQueue()} className="self-start border-slate-200 text-slate-700 hover:bg-slate-50 md:self-auto"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by ref no., requester, vehicle plate, or project/ticket..." className="w-full pl-9" /></div></div>
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="pending_cash">Pending Cash</TabsTrigger><TabsTrigger value="awaiting_receipt">Awaiting Receipt</TabsTrigger></TabsList>
      <TabsContent value={activeTab} className="mt-6"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left"><thead className="bg-slate-50"><tr><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Ref No.</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Vehicle / Fuel</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Est. Amount</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Receipt</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-200 bg-white">{loading ? <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">Loading fuel finance queue...</td></tr> : filteredRequests.length === 0 ? <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-slate-500">No fuel requests found in this queue.</td></tr> : filteredRequests.map((request) => <tr key={request.id} className="hover:bg-slate-50"><td className="px-6 py-4 font-semibold text-amber-700"><Link to={`/transport/fuel-requests/${request.id}`} className="inline-flex items-center gap-1 hover:underline">{request.ref_no}<ArrowUpRight className="h-3.5 w-3.5 text-slate-400" /></Link></td><td className="px-6 py-4 text-sm font-medium text-slate-700">{request.requester_name}{request.department && <div className="text-xs font-normal text-slate-400">{request.department}</div>}</td><td className="px-6 py-4 text-sm text-slate-700"><div className="font-mono font-medium">{request.vehicle_plate}</div><div className="text-xs text-slate-500">{request.fuel_type} · {request.quantity_litres} L</div></td><td className="px-6 py-4 text-sm font-bold text-slate-900">GHC {Number(request.estimated_amount).toFixed(2)}</td><td className="px-6 py-4"><ReferenceBadge reference={request} /></td><td className="px-6 py-4 text-sm">{request.receipt_url ? <a href={request.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-500"><FileText className="h-4 w-4" />View receipt</a> : <span className="text-slate-400">Not uploaded</span>}</td><td className="px-6 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(request.status)}`}><Clock3 className="h-3.5 w-3.5" />{request.status}</span></td><td className="px-6 py-4"><div className="flex items-center gap-3"><Link to={`/transport/fuel-requests/${request.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-500">View</Link>{activeTab === 'pending_cash' && <Button size="sm" disabled={busyId === request.id} onClick={() => handleIssueCash(request.id)} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{busyId === request.id ? 'Issuing…' : 'Issue cash'}</Button>}{activeTab === 'awaiting_receipt' && request.receipt_url && <Button size="sm" disabled={busyId === request.id} onClick={() => handleComplete(request.id)} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{busyId === request.id ? 'Completing…' : 'Complete'}</Button>}</div></td></tr>)}</tbody>
      </table></div></div></TabsContent>
    </Tabs>
  </div>;
}
