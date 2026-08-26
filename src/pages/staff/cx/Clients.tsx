import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Copy, MapPin, Plus, RotateCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type ClientRow = {
  id: number;
  customer_code: string;
  company_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  status?: string;
  site_count?: number;
  created_at?: string;
};

type UnassignedSite = {
  id: number;
  site_code: string;
  site_name: string;
  region?: string | null;
};

const emptyClientForm = {
  company_name: '',
  contact_person: '',
  email: '',
  phone: '',
  location: '',
};

const statusBadge = (status?: string) => {
  const s = (status || 'Active').toLowerCase();
  if (s === 'active') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'suspended') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const ClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [unassignedSites, setUnassignedSites] = useState<UnassignedSite[]>([]);
  const [stats, setStats] = useState({ total_clients: 0, active: 0, suspended: 0, total_sites: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [createdInfo, setCreatedInfo] = useState<{ code: string; message: string } | null>(null);
  const [form, setForm] = useState(emptyClientForm);

  const resetForm = () => {
    setOpen(false);
    setForm(emptyClientForm);
    setSelectedSiteIds([]);
    setCreatedInfo(null);
  };

  const loadSites = useCallback(async () => {
    try {
      const res = await cxApi.getAllSites({ unassigned: true });
      setUnassignedSites(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setUnassignedSites([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cxApi.getClients({
        status: status === 'All' ? undefined : status,
        search: search.trim() || undefined,
        limit: 100,
      });
      setClients(Array.isArray(res?.data) ? res.data : []);
      if (res?.stats) setStats(res.stats);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (open) void loadSites();
  }, [open, loadSites]);

  const toggleSite = (siteId: number) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId) ? prev.filter((id) => id !== siteId) : [...prev, siteId]
    );
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.email.trim() || !form.phone.trim() || !form.location.trim()) {
      toast.error('Company name, email, phone, and location are required');
      return;
    }
    setSaving(true);
    try {
      const res = await cxApi.createClient({
        company_name: form.company_name.trim(),
        contact_person: form.contact_person.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        site_ids: selectedSiteIds,
      });
      const client = res?.data || res;
      const code = client?.customer_code || '';
      setCreatedInfo({
        code,
        message: client?.message || `Client created. Customer Code: ${code}. Default password: ${code}`,
      });
      setForm(emptyClientForm);
      setSelectedSiteIds([]);
      toast.success('Client created');
      await load();
      await loadSites();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create client');
    } finally {
      setSaving(false);
    }
  };

  const copyCode = async () => {
    if (!createdInfo?.code) return;
    await navigator.clipboard.writeText(createdInfo.code);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Clients</h1>
            <p className="mt-1 text-[var(--text-muted)]">Manage client organizations and link sites from your site registry.</p>
          </div>
          <Button
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
            onClick={() => {
              if (open) resetForm();
              else {
                setCreatedInfo(null);
                setOpen(true);
              }
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> {open ? 'Close' : 'Add Client'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total Clients', value: stats.total_clients, icon: Users },
            { label: 'Active', value: stats.active, icon: Building2 },
            { label: 'Suspended', value: stats.suspended, icon: Users },
            { label: 'Total Sites', value: stats.total_sites, icon: MapPin },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-md)]"
              style={{ borderLeftWidth: 3, borderLeftColor: 'var(--primary)' }}
            >
              <div className="flex items-start justify-between">
                <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
                <Icon className="h-5 w-5 text-[var(--primary)]" />
              </div>
              <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p>
            </div>
          ))}
        </div>

        {open && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            {createdInfo ? (
              <div className="space-y-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Client created</h2>
                <p className="text-sm text-[var(--text-secondary)]">{createdInfo.message}</p>
                <div className="flex items-center gap-2">
                  <code className="rounded-md bg-[var(--accent-green-light)] px-3 py-2 font-mono text-sm font-bold text-[var(--primary)]">
                    {createdInfo.code}
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyCode()}>
                    <Copy className="mr-1 h-4 w-4" /> Copy
                  </Button>
                </div>
                <Button onClick={resetForm}>Done</Button>
              </div>
            ) : (
              <>
                <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">Add client</h2>
                <form onSubmit={submitCreate} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>Organization / Company Name *</Label>
                      <Input
                        value={form.company_name}
                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label>Contact Person</Label>
                      <Input
                        value={form.contact_person}
                        onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Email Address * (login)</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <Label>Phone Number *</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Location *</Label>
                      <Input
                        value={form.location}
                        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label>Link sites (optional)</Label>
                      <Link to="/staff/cx/sites" className="text-xs font-medium text-[var(--primary)] hover:underline">
                        Manage sites →
                      </Link>
                    </div>
                    {unassignedSites.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-muted)]">
                        No unassigned sites available.{' '}
                        <Link to="/staff/cx/sites" className="font-medium text-[var(--primary)] hover:underline">
                          Add sites first
                        </Link>
                        , then link them here.
                      </p>
                    ) : (
                      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                        {unassignedSites.map((site) => (
                          <label
                            key={site.id}
                            className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-[var(--surface-hover)]"
                          >
                            <Checkbox
                              checked={selectedSiteIds.includes(site.id)}
                              onCheckedChange={() => toggleSite(site.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-[var(--text-primary)]">{site.site_name}</span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {site.site_code}{site.region ? ` · ${site.region}` : ''}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={saving} className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]">
                      {saving ? 'Creating…' : 'Save client'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Search by company name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Suspended">Suspended</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--surface-secondary)]">
                <tr>
                  {['Code', 'Company Name', 'Contact', 'Email', 'Phone', 'Sites', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      Loading clients…
                    </td>
                  </tr>
                ) : clients.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--text-muted)]">
                      No clients found.
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer hover:bg-[var(--surface-hover)]"
                      onClick={() => navigate(`/staff/cx/clients/${c.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                          {c.customer_code}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{c.company_name}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{c.contact_person || '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{c.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="font-semibold text-[var(--primary)] hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/staff/cx/clients/${c.id}`);
                          }}
                        >
                          {c.site_count ?? 0}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={statusBadge(c.status)}>
                          {c.status || 'Active'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/staff/cx/clients/${c.id}`)}>
                            View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => navigate(`/staff/cx/clients/${c.id}?edit=1`)}>
                            Edit
                          </Button>
                        </div>
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

export default ClientsPage;
