import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Eastern', 'Central', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Other'];

export const emptySiteForm = {
  site_name: '',
  site_address: '',
  region: 'Greater Accra',
  bandwidth: '',
  service_type: 'Fibre',
  ip_address: '',
  connection_status: 'Pending',
  customer_id: '',
};

type SiteRow = {
  id: number;
  site_code: string;
  site_name: string;
  site_address?: string | null;
  region?: string | null;
  bandwidth?: string | null;
  service_type?: string | null;
  ip_address?: string | null;
  connection_status?: string;
  client_name?: string | null;
  client_code?: string | null;
  customer_id?: number | null;
  ticket_count?: number;
};

function connectionBadge(status?: string) {
  const s = (status || 'Pending').toLowerCase();
  if (s === 'live') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'pending' || s === 'active') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s === 'down') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

const SitesPage: React.FC = () => {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [clients, setClients] = useState<{ id: number; company_name: string; customer_code: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [assignmentFilter, setAssignmentFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptySiteForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const resetForm = () => {
    setOpen(false);
    setEditingId(null);
    setForm(emptySiteForm);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, clientsRes] = await Promise.all([
        cxApi.getAllSites({ search: search.trim() || undefined }),
        cxApi.getClients({ limit: 200 }),
      ]);
      setSites(Array.isArray(sitesRes?.data) ? sitesRes.data : []);
      const clientRows = Array.isArray(clientsRes?.data) ? clientsRes.data : [];
      setClients(clientRows.map((c: any) => ({
        id: c.id,
        company_name: c.company_name || c.customer_name,
        customer_code: c.customer_code,
      })));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = sites.filter((s) => {
    if (statusFilter !== 'All' && (s.connection_status || 'Pending') !== statusFilter) return false;
    if (assignmentFilter === 'Unassigned' && s.customer_id) return false;
    if (assignmentFilter === 'Assigned' && !s.customer_id) return false;
    return true;
  });

  const startEdit = (site: SiteRow) => {
    setEditingId(site.id);
    setOpen(true);
    setForm({
      site_name: site.site_name || '',
      site_address: site.site_address || '',
      region: site.region || 'Other',
      bandwidth: site.bandwidth || '',
      service_type: site.service_type || 'Fibre',
      ip_address: site.ip_address || '',
      connection_status: site.connection_status || 'Pending',
      customer_id: site.customer_id ? String(site.customer_id) : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.site_name.trim()) {
      toast.error('Site name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        site_name: form.site_name.trim(),
        site_address: form.site_address.trim() || undefined,
        region: form.region,
        bandwidth: form.bandwidth.trim() || undefined,
        service_type: form.service_type,
        ip_address: form.ip_address.trim() || undefined,
        connection_status: form.connection_status,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
      };
      if (editingId) {
        await cxApi.updateSite(editingId, payload);
        toast.success('Site updated');
      } else {
        await cxApi.createSite(payload);
        toast.success('Site created');
      }
      resetForm();
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save site');
    } finally {
      setSaving(false);
    }
  };

  const unassignedCount = sites.filter((s) => !s.customer_id).length;

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Sites</h1>
            <p className="mt-1 text-[var(--text-muted)]">
              Manage all network sites. Link them to clients when creating or editing a client.
            </p>
          </div>
          <Button
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
            onClick={() => {
              if (open && !editingId) resetForm();
              else {
                setEditingId(null);
                setForm(emptySiteForm);
                setOpen((v) => !v);
              }
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {open && !editingId ? 'Close' : 'Add Site'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Total Sites', value: sites.length },
            { label: 'Unassigned', value: unassignedCount },
            { label: 'Assigned', value: sites.length - unassignedCount },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-md)]"
              style={{ borderLeftWidth: 3, borderLeftColor: 'var(--primary)' }}
            >
              <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p>
            </div>
          ))}
        </div>

        {open && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              {editingId ? 'Edit site' : 'Add site'}
            </h2>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Site Name *</Label>
                  <Input
                    value={form.site_name}
                    onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))}
                    placeholder="e.g. ECG-BOGOSO"
                    required
                  />
                </div>
                <div>
                  <Label>Link to Client (optional)</Label>
                  <Select
                    value={form.customer_id || 'none'}
                    onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.company_name} ({c.customer_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Site Address</Label>
                  <Input
                    value={form.site_address}
                    onChange={(e) => setForm((f) => ({ ...f, site_address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Region</Label>
                  <Select value={form.region} onValueChange={(v) => setForm((f) => ({ ...f, region: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bandwidth</Label>
                  <Input
                    value={form.bandwidth}
                    onChange={(e) => setForm((f) => ({ ...f, bandwidth: e.target.value }))}
                    placeholder="e.g. 100Mbps"
                  />
                </div>
                <div>
                  <Label>Service Type</Label>
                  <Select value={form.service_type} onValueChange={(v) => setForm((f) => ({ ...f, service_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Fibre">Fibre</SelectItem>
                      <SelectItem value="Wireless">Wireless</SelectItem>
                      <SelectItem value="Hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>IP Address</Label>
                  <Input
                    value={form.ip_address}
                    onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Connection Status</Label>
                  <Select
                    value={form.connection_status}
                    onValueChange={(v) => setForm((f) => ({ ...f, connection_status: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Pending', 'Active', 'Live', 'Suspended', 'Down'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit" disabled={saving} className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]">
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save site'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Search sites, codes, or clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={assignmentFilter} onValueChange={setAssignmentFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All sites</SelectItem>
              <SelectItem value="Unassigned">Unassigned</SelectItem>
              <SelectItem value="Assigned">Assigned</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All statuses</SelectItem>
              {['Pending', 'Active', 'Live', 'Suspended', 'Down'].map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--surface-secondary)]">
                <tr>
                  {['Code', 'Site Name', 'Region', 'Client', 'Status', 'Tickets', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">Loading sites…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">No sites found.</td></tr>
                ) : (
                  filtered.map((site) => (
                    <tr key={site.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                          {site.site_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{site.site_name}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{site.region || '—'}</td>
                      <td className="px-4 py-3">
                        {site.customer_id ? (
                          <Link
                            to={`/staff/cx/clients/${site.customer_id}`}
                            className="font-medium text-[var(--primary)] hover:underline"
                          >
                            {site.client_name || site.client_code}
                          </Link>
                        ) : (
                          <span className="text-[var(--text-muted)]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={connectionBadge(site.connection_status)}>
                          {site.connection_status || 'Pending'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{site.ticket_count ?? 0}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" variant="outline" onClick={() => startEdit(site)}>Edit</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SitesPage;
