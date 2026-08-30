import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, FileText, FileUp, Filter, MessageSquare, Search, Send, Ticket, XCircle } from 'lucide-react';
import { getMyActivity, type ActivityDateRange, type ActivityFilterType, type PersonalActivity } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/UserAvatar';

const typeOptions: Array<[ActivityFilterType, string]> = [['all', 'All'], ['requests', 'Requests'], ['approvals', 'Approvals'], ['uploads', 'Uploads'], ['notes', 'Notes']];
const rangeOptions: Array<[ActivityDateRange, string]> = [['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom Range']];

function groupLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startToday - startDate) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This Week';
  return 'Older';
}

function activityStyle(action: string) {
  if (action.startsWith('incident_')) return { Icon: FileText, shell: 'bg-indigo-100 text-indigo-700' };
  if (action === 'ticket_commented') return { Icon: MessageSquare, shell: 'bg-violet-100 text-violet-700' };
  if (action === 'ticket_closed') return { Icon: CheckCircle2, shell: 'bg-emerald-100 text-emerald-700' };
  if (action === 'ticket_status' || action === 'ticket_assigned' || action === 'ticket_viewed') return { Icon: Ticket, shell: 'bg-sky-100 text-sky-700' };
  if (action === 'submit') return { Icon: Send, shell: 'bg-emerald-100 text-emerald-700' };
  if (action === 'approve') return { Icon: CheckCircle2, shell: 'bg-blue-100 text-blue-700' };
  if (action === 'reject') return { Icon: XCircle, shell: 'bg-rose-100 text-rose-700' };
  if (action === 'upload' || action === 'upload_invoice') return { Icon: FileUp, shell: 'bg-amber-100 text-amber-700' };
  return { Icon: Clock3, shell: 'bg-slate-100 text-slate-600' };
}

export default function MyActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<PersonalActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ActivityFilterType>('all');
  const [range, setRange] = useState<ActivityDateRange>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setItems(await getMyActivity({ type, range, from, to, search }));
      } catch (error: any) {
        toast({ title: 'Unable to load activity', description: error.message || 'Please try again.', variant: 'destructive' });
      } finally { setLoading(false); }
    }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [type, range, from, to, search]);

  const grouped = useMemo(() => items.reduce<Record<string, PersonalActivity[]>>((groups, item) => {
    const label = groupLabel(item.created_at);
    (groups[label] ||= []).push(item);
    return groups;
  }, {}), [items]);
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.full_name || user?.username || 'User';

  return <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-3xl font-bold text-slate-900">My Activity</h1><p className="mt-1 text-sm text-slate-500">Everything you have done in the system</p></div>
      <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"><UserAvatar src={user?.avatar_url} name={fullName} className="h-10 w-10" /><div><p className="text-sm font-semibold text-slate-800">{fullName}</p><p className="text-xs text-slate-500">Personal activity feed</p></div></div>
    </div>

    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Filter className="h-4 w-4 text-amber-600" />Filter activity</div>
      <div className="flex flex-wrap gap-2">{typeOptions.map(([value, label]) => <button key={value} onClick={() => setType(value)} className={`rounded-lg px-3 py-2 text-sm font-medium transition ${type === value ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>
      <div className="flex flex-col gap-3 md:flex-row"><div className="flex flex-wrap gap-2">{rangeOptions.map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${range === value ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by reference number or keyword..." className="pl-9" /></div></div>
      {range === 'custom' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label><label className="text-sm font-medium text-slate-700">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" /></label></div>}
    </div>

    {loading ? <div className="py-12 text-center text-sm text-slate-500">Loading your activity…</div> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Clock3 className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-4 font-semibold text-slate-700">No activity yet</p><p className="mt-1 text-sm text-slate-500">When you submit or approve requests they will appear here.</p></div> : <div className="space-y-7">{Object.entries(grouped).map(([label, group]) => <section key={label}><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</h2><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{group.map((item) => { const { Icon, shell } = activityStyle(item.action_type); return <div key={item.id} className="flex gap-3 border-b border-slate-100 p-4 last:border-0"><div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${shell}`}><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="font-medium text-slate-800">{item.you_description}</p><p className="mt-1 text-xs text-slate-500">{item.record_label} · {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>{item.view_path && <Link to={item.view_path} className="self-center text-sm font-semibold text-blue-600 hover:text-blue-500">View →</Link>}</div>; })}</div></section>)}</div>}
  </div>;
}
