import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Clock3, FileText, MapPin, Plus, Search, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { createTransportRequest, getTransportRequests, getUserDirectory, getRequestApproverIds, getWorkflowConfig, cxApi, type TransportRequest } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReferenceBadge } from '@/components/transport/ReferenceBadge';
import { PersonName } from '@/components/PersonName';
import { ReferenceLinkPicker } from '@/components/references/ReferenceLinkPicker';
import { formatOwnReference, type ReferenceSummary } from '@/lib/referenceRegistry';
import { CopyRefButton } from '@/components/CopyRefButton';
import { Link, useLocation } from 'react-router-dom';
import { searchTickets, type TicketSearchResult } from '@/api/overtime';

const statusBadge: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border border-rose-200',
};

export default function TransportRequestForm() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<TransportRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [engineers, setEngineers] = useState<Array<{ id: number; first_name?: string; last_name?: string; username?: string }>>([]);
  const [approvers, setApprovers] = useState<Array<{ id: number; fullName: string; username?: string }>>([]);
  const [selectedApproverIds, setSelectedApproverIds] = useState<number[]>([]);
  const [form, setForm] = useState({
    location: '',
    engineer_id: '',
    purpose: '',
  });

  // Ticket Search (first) — Client and Site auto-fill from it. If no matching ticket, search
  // and select a Site directly; its Client fills in automatically. Never free text.
  const [ticketQuery, setTicketQuery] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketResults, setTicketResults] = useState<TicketSearchResult[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketSearchResult | null>(null);
  const [siteQuery, setSiteQuery] = useState('');
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteResults, setSiteResults] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);

  const resolvedSiteId: number | null = selectedTicket?.site_id ?? selectedSite?.id ?? null;
  const resolvedSiteName: string = selectedTicket?.site_name || selectedSite?.site_name || '';
  const resolvedClientName: string = selectedTicket ? selectedTicket.customer_name : (selectedSite?.client_name || '');
  const resolvedRegion: string | null = selectedTicket?.region || selectedSite?.region || null;
  const resolvedAddress: string | null = selectedTicket?.site_address || selectedSite?.site_address || null;

  useEffect(() => {
    if (!ticketQuery.trim() || selectedTicket) { setTicketResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchTickets(ticketQuery).then((r) => { if (!cancelled) setTicketResults(r); }).catch(() => { if (!cancelled) setTicketResults([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [ticketQuery, selectedTicket]);

  useEffect(() => {
    if (!siteQuery.trim() || selectedSite || selectedTicket) { setSiteResults([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      cxApi.searchSites(siteQuery)
        .then((res: any) => { if (!cancelled) setSiteResults(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []); })
        .catch(() => { if (!cancelled) setSiteResults([]); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [siteQuery, selectedSite, selectedTicket]);

  const selectTicket = (t: TicketSearchResult) => {
    setSelectedTicket(t);
    setTicketQuery(t.ticket_id);
    setTicketOpen(false);
    setSelectedSite(null);
    setSiteQuery('');
    if (!form.location.trim() && t.site_address) setForm((f) => ({ ...f, location: t.site_address as string }));
  };

  const clearTicket = () => {
    setSelectedTicket(null);
    setTicketQuery('');
  };

  const selectSite = (s: any) => {
    setSelectedSite(s);
    setSiteQuery(s.site_name);
    setSiteOpen(false);
    if (!form.location.trim() && s.site_address) setForm((f) => ({ ...f, location: s.site_address }));
  };

  const clearSite = () => {
    setSelectedSite(null);
    setSiteQuery('');
  };

  const [requireReference, setRequireReference] = useState(false);
  const location = useLocation();
  const fieldWorkLinks = (location.state as { fieldWorkLinks?: ReferenceSummary[] } | null)?.fieldWorkLinks;
  const [linkedReferences, setLinkedReferences] = useState<ReferenceSummary[]>(fieldWorkLinks || []);

  useEffect(() => {
    if (fieldWorkLinks?.length) setIsFormOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRequests = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesTab = request.status === activeTab;
      const matchesSearch = !term || [request.requester_name, request.site_name, request.location, request.client_name, request.purpose].some((value) => (value || '').toLowerCase().includes(term));
      return matchesTab && matchesSearch;
    });
  }, [requests, searchTerm, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [requestList, userList, realm, workflow] = await Promise.all([
        getTransportRequests(),
        getUserDirectory(),
        getRequestApproverIds(),
        getWorkflowConfig(),
      ]);
      const visibleEngineers = userList.filter((person) => Number(person.id) !== Number(user?.id));
      setRequests(requestList.filter((item) => Number(item.requester_id) === Number(user?.id) || !item.requester_id));
      setEngineers(visibleEngineers as any[]);
      const effectiveApproverIds = [...new Set([...(realm.transport_approver_ids || []), ...(workflow.transport?.approver_ids || [])])].map(Number).filter(Boolean);
      const effectiveSupervisorIds = [...new Set([...(realm.transport_supervisor_ids || []), ...(workflow.transport?.supervisor_id ? [workflow.transport.supervisor_id] : [])])].map(Number).filter(Boolean);
      setRequireReference(Boolean(workflow.transport?.require_reference_link));
      const hasTransportApprovers = effectiveApproverIds.length > 0;
      const hasTransportSupervisor = effectiveSupervisorIds.length > 0;
      if (!hasTransportApprovers || !hasTransportSupervisor) {
        toast({
          title: 'Transport approval list missing',
          description: 'Set transport approvers and a transport supervisor in Realm before submitting a request.',
          variant: 'destructive',
        });
      }

      // getUsers() already provides the people needed here. The former per-user
      // request targeted GET /api/users/:id, which is not an available endpoint.
      const peopleById = new Map(userList.map((person) => [Number(person.id), person]));
      const validApprovers = effectiveApproverIds.flatMap((id) => {
        const person = peopleById.get(id);
        if (!person) return [];
        return [{
          id,
          fullName: `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.username || 'User',
          username: person.username,
        }];
      });
      setApprovers(validApprovers);
      setSelectedApproverIds(validApprovers.map((approver) => approver.id));
    } catch (error) {
      console.error(error);
      toast({ title: 'Unable to load transport requests', description: 'Please try again later.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!resolvedSiteId) {
      toast({ title: 'Site required', description: 'Search and select an existing ticket or site before submitting.', variant: 'destructive' });
      return;
    }
    if (!form.location.trim()) {
      toast({ title: 'Missing fields', description: 'Location is required.', variant: 'destructive' });
      return;
    }
    if (!selectedApproverIds.length) {
      toast({ title: 'Approval required', description: 'Select at least one transport approver before submitting the request.', variant: 'destructive' });
      return;
    }
    if (requireReference && linkedReferences.length === 0) {
      toast({ title: 'Reference required', description: 'Link this request to an existing record.', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      await createTransportRequest({
        location: form.location,
        ticket_id: selectedTicket?.id ?? null,
        site_id: selectedTicket ? null : (selectedSite?.id ?? null),
        engineer_id: form.engineer_id ? Number(form.engineer_id) : null,
        purpose: form.purpose || null,
        selected_approver_ids: selectedApproverIds,
        linked_references: linkedReferences.map((ref) => ({ type: ref.type, id: ref.id })),
      });
      setForm({ location: '', engineer_id: '', purpose: '' });
      clearTicket();
      clearSite();
      setLinkedReferences([]);
      setIsFormOpen(false);
      await loadData();
      toast({ title: 'Request submitted successfully' });
    } catch (error: any) {
      toast({ title: 'Request not sent', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="shrink-0 rounded-xl bg-amber-100 p-3 text-amber-700">
            <Truck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Transport Request</h1>
            <p className="text-sm text-slate-500">Submit and track your site transport requests.</p>
          </div>
        </div>

        <Button onClick={() => setIsFormOpen((prev) => !prev)} className="w-full bg-amber-600 hover:bg-amber-700 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          {isFormOpen ? 'Close Form' : 'New Transport Request'}
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by requester, site, client, location, or notes..."
            className="w-full pl-9"
          />
        </div>
      </div>

      {isFormOpen && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">Create transport request</div>
          <form onSubmit={submit} className="p-5 md:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Requester Name</span>
                <input value={user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'User' : ''} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-700" />
              </label>

              {/* Ticket Search — first. Client and Site auto-fill from it. Never free text. */}
              <div className="relative space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Ticket Search</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={ticketQuery}
                    onChange={(e) => { setTicketQuery(e.target.value); if (selectedTicket) clearTicket(); setTicketOpen(true); }}
                    onFocus={() => setTicketOpen(true)}
                    onBlur={() => setTimeout(() => setTicketOpen(false), 150)}
                    placeholder="Search by ticket number, title, or client…"
                    autoComplete="off"
                    className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs font-normal text-slate-400">Search an existing ticket — Client and Site auto-fill from it.</p>
                {ticketOpen && !selectedTicket && ticketResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                    {ticketResults.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onMouseDown={() => selectTicket(t)}
                      >
                        <span className="font-semibold">{t.ticket_id}</span> — {t.title}
                        <span className="ml-1 text-xs text-slate-400">
                          {t.customer_name}{t.site_name ? ` • ${t.site_name}` : ' • no site assigned'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!selectedTicket && (
                <div className="relative space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                  <span>Site Search</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={siteQuery}
                      onChange={(e) => { setSiteQuery(e.target.value); if (selectedSite) clearSite(); setSiteOpen(true); }}
                      onFocus={() => setSiteOpen(true)}
                      onBlur={() => setTimeout(() => setSiteOpen(false), 150)}
                      placeholder="No matching ticket? Search sites directly…"
                      autoComplete="off"
                      className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs font-normal text-slate-400">No matching ticket linked — search and select a Site directly. Its Client fills in automatically.</p>
                  {siteOpen && !selectedSite && siteResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                      {siteResults.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={() => selectSite(s)}
                        >
                          <span className="font-semibold">{s.site_name}</span> • {s.client_name || 'No client'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {resolvedSiteId && (
                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Client</p>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-600" /> {resolvedClientName || '—'}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Site</p>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-800">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-600" /> {resolvedSiteName || '—'}
                      </span>
                    </div>
                  </div>
                  {(resolvedAddress || resolvedRegion) && (
                    <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
                      {[resolvedAddress, resolvedRegion].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-amber-700 hover:underline"
                    onClick={() => { clearTicket(); clearSite(); }}
                  >
                    {selectedTicket ? 'Change ticket' : 'Change site'}
                  </button>
                </div>
              )}

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Location</span>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Accra, Tema, or site address" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none" />
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Engineer</span>
                <select value={form.engineer_id} onChange={(e) => setForm({ ...form, engineer_id: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none">
                  <option value="">Select engineer</option>
                  {engineers.map((person) => (
                    <option key={person.id} value={String(person.id)}>
                      {[person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || 'User'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Date & Time</span>
                <input value={new Date().toLocaleString()} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-slate-700" />
              </label>

              <div className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Transport Approvers</span>
                {approvers.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    No transport approvers are configured yet. Add them in Realm first.
                  </div>
                ) : (
                  <div className="grid gap-2 md:grid-cols-2">
                    {approvers.map((approver) => {
                      const checked = selectedApproverIds.includes(approver.id);
                      return (
                        <label key={approver.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <span>{approver.fullName}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setSelectedApproverIds((prev) => checked ? prev.filter((id) => id !== approver.id) : [...prev, approver.id])}
                            className="h-4 w-4 accent-amber-600"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
                <span>Purpose / Notes</span>
                <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} rows={4} placeholder="Describe the reason for the transport requirement." className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-amber-500 focus:outline-none" />
              </label>

              <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <ReferenceLinkPicker
                  value={linkedReferences}
                  onChange={setLinkedReferences}
                  required={requireReference}
                  hint="Link this request to related tickets, requests, or other records."
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || loading} className="bg-amber-600 hover:bg-amber-700">
                {saving ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'pending' | 'approved' | 'rejected')} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">Pending ({requests.filter((request) => request.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({requests.filter((request) => request.status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({requests.filter((request) => request.status === 'rejected').length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {filteredRequests.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">No transport requests found in this status.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="min-w-full divide-y divide-slate-200 text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Request</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Requester</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Site</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Client</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Reference</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Created</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Status</th>
                        <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredRequests.map((request) => (
                        <tr key={request.id} className="group hover:bg-slate-50">
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <span className="inline-flex items-center gap-1">
                              {formatOwnReference('transport_request', request.id)}
                              <span className="opacity-0 transition group-hover:opacity-100">
                                <CopyRefButton value={formatOwnReference('transport_request', request.id)} size="sm" />
                              </span>
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700"><PersonName value={request.requester_name} /></td>
                          <td className="px-6 py-4 text-sm text-slate-700">{request.site_name}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{request.client_name}</td>
                          <td className="px-6 py-4"><ReferenceBadge reference={request} /></td>
                          <td className="px-6 py-4 text-sm text-slate-700">{new Date(request.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge[request.status] || statusBadge.pending}`}>
                              {request.status === 'pending' ? <Clock3 className="h-3.5 w-3.5" /> : request.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                              {request.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <Link to={`/transport-requests/${request.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500">
                              <FileText className="h-4 w-4" /> View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-slate-200 sm:hidden">
                  {filteredRequests.map((request) => (
                    <Link
                      key={request.id}
                      to={`/transport-requests/${request.id}`}
                      className="block p-4 active:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{formatOwnReference('transport_request', request.id)}</p>
                          <p className="truncate text-sm text-slate-700"><PersonName value={request.requester_name} /></p>
                          <p className="truncate text-sm text-slate-500">{request.site_name} · {request.client_name}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge[request.status] || statusBadge.pending}`}>
                          {request.status === 'pending' ? <Clock3 className="h-3.5 w-3.5" /> : request.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {request.status}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(request.created_at).toLocaleDateString()}</span>
                        <ReferenceBadge reference={request} />
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
}
