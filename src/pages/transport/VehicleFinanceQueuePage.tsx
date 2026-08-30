import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clock3, HandCoins, Search } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { API_URL, issueVehicleCash } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { userHasAnyRole } from '../../config/roles';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';

const ACTIONABLE = ['approved', 'sent_to_finance'];
const VISIBLE = ['approved', 'sent_to_finance', 'cash_issued', 'completed'];
const statusStyles: Record<string, string> = {
  approved: 'border border-sky-200 bg-sky-100 text-sky-800',
  sent_to_finance: 'border border-sky-200 bg-sky-100 text-sky-800',
  cash_issued: 'border border-blue-200 bg-blue-100 text-blue-800',
  completed: 'border border-emerald-200 bg-emerald-100 text-emerald-800',
};
const statusLabels: Record<string, string> = { approved: 'Approved', sent_to_finance: 'Ready for cash', cash_issued: 'Cash issued', completed: 'Completed' };

export default function VehicleFinanceQueuePage() {
  const { user, isAdminSuper } = useAuth();
  const { toast } = useToast();
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending_cash' | 'cash_issued' | 'completed'>('pending_cash');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const units = [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])].map((value) => String(value || '').toLowerCase());
        const isFinanceStaff = userHasAnyRole(user, ['finance', 'finance_manager']) || units.includes('finance');
        if (!isAdminSuper && !isFinanceStaff) {
          setForms([]);
          return;
        }
        const response = await fetch(`${API_URL}/transport/vehicle-requests?queue=finance`, { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } });
        const raw = await response.text();
        let payload: any = null;
        if (raw) { try { payload = JSON.parse(raw); } catch { payload = null; } }
        if (!response.ok) throw new Error(payload?.error || 'Unable to load finance queue.');
        if (!payload && raw) throw new Error('The API returned an unexpected response. Check the backend connection and try again.');
        setForms((Array.isArray(payload) ? payload : []).filter((form) => VISIBLE.includes(form.status)));
      } catch (error: any) {
        console.error(error);
        toast({ title: 'Unable to load finance queue', description: error.message || 'Please try again.', variant: 'destructive' });
      } finally { setLoading(false); }
    };
    if (user?.id) void load();
  }, [user?.id]);

  const handleIssueCash = async (id: number) => {
    try {
      setBusyId(id);
      await issueVehicleCash(id, { note: 'Cash issued by finance', issued_at: new Date().toISOString() });
      toast({ title: 'Cash issued', description: 'The supervisor has been notified.', variant: 'default' });
      setForms((prev) => prev.map((form) => form.id === id ? { ...form, status: 'cash_issued', current_stage: 'cash_issued' } : form));
    } catch (error: any) {
      toast({ title: 'Action failed', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const tabRequests = useMemo(() => forms.filter((form) => activeTab === 'pending_cash' ? ACTIONABLE.includes(form.status) : form.status === activeTab), [activeTab, forms]);
  const filteredForms = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return !term ? tabRequests : tabRequests.filter((form) => [String(form.id), form.requester_name, form.purpose, form.department].some((value) => (value || '').toLowerCase().includes(term)));
  }, [searchTerm, tabRequests]);
  const pendingCount = forms.filter((form) => ACTIONABLE.includes(form.status)).length;
  const units = [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])].map((value) => String(value || '').toLowerCase());
  const isFinanceStaff = userHasAnyRole(user, ['finance', 'finance_manager']) || units.includes('finance');
  if (!isAdminSuper && !isFinanceStaff) {
    return <Navigate to="/workspace" replace />;
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-100 p-3 text-amber-700"><HandCoins className="h-6 w-6" /></div><div><h1 className="text-3xl font-bold text-slate-900">Vehicle Cash Issuance</h1><p className="text-sm text-slate-500">Issue cash for approved rental requests and track each finance stage.</p></div></div>
      {pendingCount > 0 && <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700"><Clock3 className="h-4 w-4" />{pendingCount} awaiting cash</div>}
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by request no., requester, purpose, or department..." className="w-full pl-9" /></div></div>
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
      <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="pending_cash">Ready for Cash ({pendingCount})</TabsTrigger><TabsTrigger value="cash_issued">Cash Issued ({forms.filter((form) => form.status === 'cash_issued').length})</TabsTrigger><TabsTrigger value="completed">Completed ({forms.filter((form) => form.status === 'completed').length})</TabsTrigger></TabsList>
      <TabsContent value={activeTab} className="mt-6"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-left"><thead className="bg-slate-50"><tr><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Request</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Department</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Purpose</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th><th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-200 bg-white">{loading ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">Loading vehicle finance queue...</td></tr> : filteredForms.length === 0 ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-500">No vehicle requests found in this queue.</td></tr> : filteredForms.map((form) => <tr key={form.id} className="hover:bg-slate-50"><td className="px-6 py-4 font-semibold text-amber-700"><Link to={`/transport/vehicle-rental-requests/${form.id}`} className="inline-flex items-center gap-1 hover:underline">#{form.id}<ArrowUpRight className="h-3.5 w-3.5 text-slate-400" /></Link></td><td className="px-6 py-4 text-sm font-medium text-slate-700">{form.requester_name || '—'}</td><td className="px-6 py-4 text-sm text-slate-600">{form.department || '—'}</td><td className="px-6 py-4"><ReferenceBadge reference={form} /></td><td className="max-w-xs truncate px-6 py-4 text-sm text-slate-700">{form.purpose || '—'}</td><td className="px-6 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[form.status] || statusStyles.approved}`}><Clock3 className="h-3.5 w-3.5" />{statusLabels[form.status] || form.status}</span></td><td className="px-6 py-4"><div className="flex items-center gap-3"><Link to={`/transport/vehicle-rental-requests/${form.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-500">View</Link>{ACTIONABLE.includes(form.status) && <Button type="button" size="sm" disabled={busyId === form.id} onClick={() => handleIssueCash(form.id)} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{busyId === form.id ? 'Issuing…' : 'Issue cash'}</Button>}</div></td></tr>)}</tbody>
      </table></div></div></TabsContent>
    </Tabs>
  </div>;
}
