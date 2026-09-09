import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RotateCcw, Search, MapPin } from 'lucide-react';
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
import { GHANA_REGIONS, SERVICE_TYPES } from '@/lib/lookups';

export const emptySiteForm = {
  site_name: '',
  site_address: '',
  location: '',
  region: 'Greater Accra',
  bandwidth: '',
  service_type: SERVICE_TYPES[0],
  ip_address: '',
  connection_status: 'Pending',
  customer_id: '',
  gps_coordinates: '',
};

type SiteRow = {
  id: number;
  site_code: string;
  site_name: string;
  site_address?: string | null;
  location?: string | null;
  region?: string | null;
  bandwidth?: string | null;
  service_type?: string | null;
  ip_address?: string | null;
  connection_status?: string;
  client_name?: string | null;
  client_code?: string | null;
  customer_id?: number | null;
  ticket_count?: number;
  gps_coordinates?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const PAGE_SIZE = 50;

function connectionBadge(status?: string) {
  const s = (status || 'Pending').toLowerCase();
  if (s === 'live') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'pending' || s === 'active') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s === 'down') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

const SitesPage: React.FC = () => {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState({ total: 0, unassigned: 0, assigned: 0 });
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

  // Reset to page 1 whenever a filter changes so pagination never gets stuck past the new,
  // narrower result set.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, assignmentFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, statsRes, clientsRes] = await Promise.all([
        cxApi.getAllSites({
          search: search.trim() || undefined,
          connection_status: statusFilter !== 'All' ? statusFilter : undefined,
          assignment: assignmentFilter === 'Assigned' ? 'assigned' : assignmentFilter === 'Unassigned' ? 'unassigned' : undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
        cxApi.getSitesStats(),
        cxApi.getClients({ limit: 200 }),
      ]);
      setSites(Array.isArray(sitesRes?.data) ? sitesRes.data : []);
      setTotal(sitesRes?.total || 0);
      if (statsRes?.data) setStats(statsRes.data);
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
  }, [search, statusFilter, assignmentFilter, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = sites;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const startEdit = (site: SiteRow) => {
    setEditingId(site.id);
    setOpen(true);
    setForm({
      site_name: site.site_name || '',
      site_address: site.site_address || '',
      location: site.location || '',
      region: site.region || GHANA_REGIONS[0],
      bandwidth: site.bandwidth || '',
      service_type: site.service_type || SERVICE_TYPES[0],
      ip_address: site.ip_address || '',
      connection_status: site.connection_status || 'Pending',
      customer_id: site.customer_id ? String(site.customer_id) : '',
      gps_coordinates: site.gps_coordinates || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.site_name.trim()) {
      toast.error('Site name is required');
      return;
    }
    if (!form.customer_id) {
      toast.error('Select the client this site belongs to');
      return;
    }
    if (!form.gps_coordinates.trim()) {
      toast.error('Site coordinates are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        site_name: form.site_name.trim(),
        site_address: form.site_address.trim() || undefined,
        location: form.location.trim() || undefined,
        region: form.region,
        bandwidth: form.bandwidth.trim() || undefined,
        service_type: form.service_type,
        ip_address: form.ip_address.trim() || undefined,
        connection_status: form.connection_status,
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        gps_coordinates: form.gps_coordinates.trim() || undefined,
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

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Sites</h1>
            <p className="mt-1 text-[var(--text-muted)]">
              Manage all network sites. Every site must be linked to a client with its GPS coordinates.
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
            { label: 'Total Sites', value: stats.total },
            { label: 'Unassigned', value: stats.unassigned },
            { label: 'Assigned', value: stats.assigned },
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
                  <Label>Client *</Label>
                  <Select
                    value={form.customer_id || undefined}
                    onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select the client this site belongs to…" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.company_name} ({c.customer_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Every site must belong to a client. Add the client first if it doesn't exist yet.
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Site Address</Label>
                  <Input
                    value={form.site_address}
                    onChange={(e) => setForm((f) => ({ ...f, site_address: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Location / Town</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Bogoso"
                  />
                </div>
                <div>
                  <Label>Region</Label>
                  <Select value={form.region} onValueChange={(v) => setForm((f) => ({ ...f, region: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GHANA_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                      {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                <div className="md:col-span-2">
                  <Label>GPS Coordinates *</Label>
                  <Input
                    value={form.gps_coordinates}
                    onChange={(e) => setForm((f) => ({ ...f, gps_coordinates: e.target.value }))}
                    placeholder="Paste from Google Maps — e.g. 5.6037, -0.1870, a maps link, or DMS"
                    required
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Paste whatever you have — decimal coordinates, a Google Maps link, or degrees/minutes/seconds. We'll recognize it automatically.
                  </p>
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
                  {['Code', 'Site Name', 'Location', 'Region', 'Client', 'Status', 'Tickets', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">Loading sites…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">No sites found.</td></tr>
                ) : (
                  filtered.map((site) => (
                    <tr
                      key={site.id}
                      className="cursor-pointer hover:bg-[var(--surface-hover)]"
                      onClick={() => startEdit(site)}
                    >
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                          {site.site_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--primary)] hover:underline">{site.site_name}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        <div className="flex items-center gap-1.5">
                          <span>{site.location || '—'}</span>
                          {site.latitude != null && site.longitude != null && (
                            <a
                              href={`https://www.google.com/maps?q=${site.latitude},${site.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              title="View on map"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[var(--primary)] hover:opacity-70"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{site.region || '—'}</td>
                      <td className="px-4 py-3">
                        {site.customer_id ? (
                          <Link
                            to={`/staff/cx/clients/${site.customer_id}`}
                            onClick={(e) => e.stopPropagation()}
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
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); startEdit(site); }}>Edit</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
              <p className="text-xs text-[var(--text-muted)]">
                Page {page} of {totalPages} · {total.toLocaleString()} sites
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SitesPage;
