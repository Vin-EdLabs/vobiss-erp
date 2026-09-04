import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Loader2, Paperclip, Pencil, Plus, Search, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPill } from '@/components/ui/status-pill';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { UnitPageHero, PremiumStatGrid, PremiumPanel } from '@/components/production/UnitPageHero';
import { createSalesRequest, listSalesRequests, updateSalesRequestIdentity, uploadProjectRequestAttachment, type ProjectRequest } from '@/api/project';
import { searchClientsForPicker, searchSitesForPicker } from '@/api/fieldWork';
import { SearchPickerField } from '@/components/ipUnit/SearchPickerField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GHANA_REGIONS, SERVICE_TYPES } from '@/lib/lookups';

const imageFile = (file: File) => file.type.startsWith('image/');

const FEASIBILITY_TYPES = ['New', 'Upgrade', 'Relocation'];
const REQUEST_TYPES = ['Desktop Survey', 'Physical Survey'];

function stageDisplay(currentStage: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'info' } {
  switch (currentStage) {
    case 'design': return { label: 'With Design', tone: 'warning' };
    case 'sales': return { label: 'Ready for Sales', tone: 'info' };
    case 'project': return { label: 'With Project Unit', tone: 'success' };
    case 'ts': return { label: 'With TX', tone: 'success' };
    case 'ip': return { label: 'With IP', tone: 'success' };
    case 'noc': return { label: 'With NOC', tone: 'success' };
    case 'done': return { label: 'Completed', tone: 'success' };
    case 'rejected': return { label: 'Rejected', tone: 'danger' };
    default: return { label: currentStage || 'Unknown', tone: 'info' };
  }
}

const EMPTY_FORM = {
  customer_name: '', customer_id: null as number | null,
  site_name: '', site_id: null as number | null,
  location: '', region: '', isp: '', initial_remarks: '',
  account_manager: '', service_type: '', capacity: '', feasibility_type: '', request_type: '',
  technical_contact_name: '', technical_contact_email: '', technical_contact_phone: '', site_coordinates: '',
};

export default function SalesUnitPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [customerQuery, setCustomerQuery] = useState('');
  const [siteQuery, setSiteQuery] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState<ProjectRequest | null>(null);
  const [editForm, setEditForm] = useState({ customer_name: '', site_name: '' });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setRequests(await listSalesRequests()); }
    catch (e: unknown) { toast({ title: 'Could not load Sales requests', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const visible = requests.filter((r) => [r.customer_name, r.site_name, r.location, r.region, r.isp, r.created_by_name].some((value) => String(value || '').toLowerCase().includes(search.toLowerCase())));

  const completedCount = requests.filter((r) => r.current_stage === 'done' || r.status === 'completed').length;
  const rejectedCount = requests.filter((r) => r.current_stage === 'rejected' || r.status === 'rejected').length;
  const pendingCount = requests.length - completedCount - rejectedCount;
  const withDesignCount = requests.filter((r) => r.current_stage === 'design').length;

  const resetForm = () => { setForm(EMPTY_FORM); setCustomerQuery(''); setSiteQuery(''); setFiles([]); };

  const openEdit = (request: ProjectRequest) => {
    setEditing(request);
    setEditForm({ customer_name: request.customer_name || '', site_name: request.site_name || '' });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.customer_name.trim() || !editForm.site_name.trim()) {
      toast({ title: 'Customer name and site name are both required', variant: 'destructive' });
      return;
    }
    setEditSaving(true);
    try {
      await updateSalesRequestIdentity(editing.id, editForm);
      toast({ title: 'Updated — visible to every unit on this request now' });
      setEditing(null);
      await load();
    } catch (e: unknown) {
      toast({ title: 'Could not update', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setEditSaving(false);
    }
  };

  const submit = async () => {
    if (!form.customer_name.trim()) { toast({ title: 'Customer / client name is required', variant: 'destructive' }); return; }
    if (!form.site_name.trim()) { toast({ title: 'Site name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const created = await createSalesRequest(form);
      for (const file of files) await uploadProjectRequestAttachment(created.id, file, 'sales');
      toast({ title: 'Sent to Design Unit' });
      resetForm();
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      toast({ title: 'Could not send request', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <UnitPageHero
        unitSlug="sales"
        actions={<Button onClick={() => setShowForm((open) => !open)}><Plus className="mr-2 h-4 w-4" />New request for Design</Button>}
      />

      <PremiumStatGrid
        unitSlug="sales"
        stats={[
          { label: 'Total requests', value: requests.length },
          { label: 'With Design', value: withDesignCount, hint: 'Awaiting survey' },
          { label: 'Pending / in progress', value: pendingCount },
          { label: 'Completed', value: completedCount, hint: rejectedCount > 0 ? `${rejectedCount} rejected` : undefined },
        ]}
      />

      {showForm && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
          <h2 className="font-semibold text-[var(--text-primary)]">Send request to Design Unit</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <SearchPickerField
              label="Customer / Client"
              placeholder="Search an existing customer, or just type the name"
              query={customerQuery}
              onQueryChange={(text) => { setCustomerQuery(text); setForm((f) => ({ ...f, customer_name: text, customer_id: null })); }}
              selectedId={form.customer_id}
              fetchResults={searchClientsForPicker}
              onSelect={(item) => { setCustomerQuery(item.name || ''); setForm((f) => ({ ...f, customer_name: item.name || '', customer_id: item.id })); }}
              renderItem={(item) => <span>{item.name}{item.customer_code ? <span className="ml-1.5 text-xs text-[var(--text-muted)]">{item.customer_code}</span> : null}</span>}
            />
            <SearchPickerField
              label="Site"
              placeholder="Search an existing site, or just type the name"
              query={siteQuery}
              onQueryChange={(text) => { setSiteQuery(text); setForm((f) => ({ ...f, site_name: text, site_id: null })); }}
              selectedId={form.site_id}
              fetchResults={searchSitesForPicker}
              onSelect={(item) => { setSiteQuery(item.site_name || ''); setForm((f) => ({ ...f, site_name: item.site_name || '', site_id: item.id, location: item.site_address || f.location, region: item.region || f.region })); }}
              renderItem={(item) => <span>{item.site_name}{item.region ? <span className="ml-1.5 text-xs text-[var(--text-muted)]">{item.region}</span> : null}</span>}
            />
            <label className="text-sm font-medium">Location<Input className="mt-1" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
            <label className="text-sm font-medium">
              Region
              <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{GHANA_REGIONS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium">Site coordinates<Input className="mt-1" placeholder="lat, long" value={form.site_coordinates} onChange={(e) => setForm({ ...form, site_coordinates: e.target.value })} /></label>
            <label className="text-sm font-medium">Account manager<Input className="mt-1" value={form.account_manager} onChange={(e) => setForm({ ...form, account_manager: e.target.value })} /></label>
            <label className="text-sm font-medium">
              Product type
              <Select value={form.service_type} onValueChange={(v) => setForm({ ...form, service_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium">Required capacity<Input className="mt-1" placeholder="e.g. 50mbps" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
            <label className="text-sm font-medium">
              Feasibility type
              <Select value={form.feasibility_type} onValueChange={(v) => setForm({ ...form, feasibility_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{FEASIBILITY_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium">
              Request type
              <Select value={form.request_type} onValueChange={(v) => setForm({ ...form, request_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{REQUEST_TYPES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium">ISP<Input className="mt-1" value={form.isp} onChange={(e) => setForm({ ...form, isp: e.target.value })} /></label>
            <label className="text-sm font-medium">Technical contact<Input className="mt-1" value={form.technical_contact_name} onChange={(e) => setForm({ ...form, technical_contact_name: e.target.value })} /></label>
            <label className="text-sm font-medium">Contact email<Input className="mt-1" type="email" value={form.technical_contact_email} onChange={(e) => setForm({ ...form, technical_contact_email: e.target.value })} /></label>
            <label className="text-sm font-medium">Contact mobile<Input className="mt-1" value={form.technical_contact_phone} onChange={(e) => setForm({ ...form, technical_contact_phone: e.target.value })} /></label>
            <label className="text-sm font-medium md:col-span-2">Request notes<textarea className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.initial_remarks} onChange={(e) => setForm({ ...form, initial_remarks: e.target.value })} /></label>
          </div>

          <div className="mt-5">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)] p-5 text-sm font-medium">
              <Paperclip className="h-5 w-5" />
              Add images and files
              <input className="hidden" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.kmz,.kml" onChange={(e) => setFiles((current) => [...current, ...Array.from(e.target.files || [])])} />
            </label>
            {files.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]">
                    {imageFile(file) ? (
                      <img src={URL.createObjectURL(file)} alt={file.name} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video flex-col items-center justify-center gap-2 px-3 text-center">
                        <FileText className="h-8 w-8 text-[var(--text-muted)]" />
                        <span className="truncate text-xs">{file.name}</span>
                      </div>
                    )}
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-3">
            <Button disabled={saving} onClick={() => void submit()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send to Design
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
          </div>
        </section>
      )}

      <PremiumPanel
        unitSlug="sales"
        title="Every request you've sent"
        icon={FileText}
        extra={
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, site, location, ISP…" />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-[var(--surface-secondary)] text-left text-[var(--text-secondary)]">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Site</th>
                <th className="px-5 py-3">Location / Region</th>
                <th className="px-5 py-3">Currently with</th>
                <th className="px-5 py-3">Survey date</th>
                <th className="px-5 py-3">Submitted by</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--primary)]" /></td></tr>
              ) : visible.map((request) => (
                <tr key={request.id} className="hover:bg-[var(--surface-hover)]">
                  <td className="px-5 py-4 font-medium text-[var(--text-primary)]">
                    <div className="flex items-center gap-1.5">
                      {request.customer_name || '—'}
                      <button type="button" title="Edit customer / site name" onClick={() => openEdit(request)} className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--primary)]">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-4">{request.site_name}</td>
                  <td className="px-5 py-4">{[request.location, request.region].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-4">
                    {(() => { const s = stageDisplay(request.current_stage); return <StatusPill tone={s.tone}>{s.label}</StatusPill>; })()}
                  </td>
                  <td className="px-5 py-4">{request.survey_date ? new Date(request.survey_date).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-4">{request.created_by_name || 'Sales Unit'}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/project-request/${request.id}`)}><Eye className="mr-1 h-4 w-4" />Track &amp; update</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !visible.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-[var(--text-muted)]">No Design submissions are waiting for Sales.</td></tr>}
            </tbody>
          </table>
        </div>
      </PremiumPanel>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit customer / site name</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            Only Sales can rename these — the change updates everywhere this request shows up, for every unit.
          </p>
          <div className="mt-2 space-y-3">
            <label className="text-sm font-medium">Customer name<Input className="mt-1" value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} /></label>
            <label className="text-sm font-medium">Site name<Input className="mt-1" value={editForm.site_name} onChange={(e) => setEditForm({ ...editForm, site_name: e.target.value })} /></label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={editSaving} onClick={() => void saveEdit()}>
              {editSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
