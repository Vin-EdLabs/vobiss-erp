import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, MapPin, Pencil, Plus, RotateCcw, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/ShareButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GHANA_REGIONS, SERVICE_TYPES } from '@/lib/lookups';

const EMPTY_SITE_EDIT = {
  site_name: '',
  site_address: '',
  location: '',
  region: 'Greater Accra',
  bandwidth: '',
  service_type: SERVICE_TYPES[0],
  ip_address: '',
  connection_status: 'Pending',
};

function connectionClass(status?: string) {
  const s = (status || 'Pending').toLowerCase();
  if (s === 'live') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'pending' || s === 'active') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s === 'down') return 'bg-red-100 text-red-800 border-red-200 animate-pulse';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

const ClientDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [linkSiteId, setLinkSiteId] = useState('');
  const [unassignedSites, setUnassignedSites] = useState<any[]>([]);
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null);
  const [siteForm, setSiteForm] = useState(EMPTY_SITE_EDIT);
  const [customPassword, setCustomPassword] = useState('');
  const [passwordMode, setPasswordMode] = useState<'code' | 'generate' | 'custom'>('code');
  const [resetResult, setResetResult] = useState<{ password: string; pin: string; message: string } | null>(null);
  const [editForm, setEditForm] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    location: '',
    status: 'Active',
  });

  const fillEditFromClient = (data: any) => {
    setEditForm({
      company_name: data.company_name || data.customer_name || '',
      contact_person: data.contact_person || '',
      email: data.email || data.contact_email || '',
      phone: data.phone || data.contact_phone || '',
      location: data.location || '',
      status: data.status || 'Active',
    });
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await cxApi.getClient(id);
      const data = res?.data || res;
      setClient(data);
      fillEditFromClient(data);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load client');
      navigate('/staff/cx/clients');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const loadUnassignedSites = useCallback(async () => {
    try {
      const res = await cxApi.getAllSites({ unassigned: true });
      setUnassignedSites(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setUnassignedSites([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!client) return;
    if (searchParams.get('edit') === '1') setEditOpen(true);
    if (searchParams.get('linkSite') === '1' || searchParams.get('addSite') === '1') {
      setLinkOpen(true);
      void loadUnassignedSites();
    }
  }, [client, searchParams, loadUnassignedSites]);

  useEffect(() => {
    if (linkOpen || editOpen) void loadUnassignedSites();
  }, [linkOpen, editOpen, loadUnassignedSites]);

  const sites = useMemo(() => (Array.isArray(client?.sites) ? client.sites : []), [client]);
  const recentTickets = useMemo(() => (Array.isArray(client?.recent_tickets) ? client.recent_tickets : []), [client]);

  const closeEdit = () => {
    setEditOpen(false);
    setEditingSiteId(null);
    setSiteForm(EMPTY_SITE_EDIT);
    setCustomPassword('');
    setPasswordMode('code');
    setResetResult(null);
    setSearchParams({});
    if (client) fillEditFromClient(client);
  };

  const resetClientFields = () => {
    if (client) fillEditFromClient(client);
    setCustomPassword('');
    setPasswordMode('code');
    setResetResult(null);
    toast.message('Form reset to saved values');
  };

  const saveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!editForm.company_name.trim() || !editForm.email.trim()) {
      toast.error('Company name and email are required');
      return;
    }
    setSaving(true);
    try {
      await cxApi.updateClient(id, editForm);
      toast.success('Client updated');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const startEditSite = (site: any) => {
    setEditingSiteId(site.id);
    setSiteForm({
      site_name: site.site_name || '',
      site_address: site.site_address || '',
      location: site.location || '',
      region: site.region || GHANA_REGIONS[0],
      bandwidth: site.bandwidth || '',
      service_type: site.service_type || SERVICE_TYPES[0],
      ip_address: site.ip_address || '',
      connection_status: site.connection_status || 'Pending',
    });
    if (!editOpen) setEditOpen(true);
  };

  const cancelSiteEdit = () => {
    setEditingSiteId(null);
    setSiteForm(EMPTY_SITE_EDIT);
  };

  const saveSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSiteId || !siteForm.site_name.trim()) {
      toast.error('Site name is required');
      return;
    }
    setSaving(true);
    try {
      await cxApi.updateSite(editingSiteId, siteForm);
      toast.success('Site updated');
      cancelSiteEdit();
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update site');
    } finally {
      setSaving(false);
    }
  };

  const unlinkSite = async (siteId: number, siteName: string) => {
    if (!confirm(`Unlink “${siteName}” from this client? The site stays in the registry.`)) return;
    setSaving(true);
    try {
      await cxApi.updateSite(siteId, { customer_id: null });
      toast.success('Site unlinked');
      if (editingSiteId === siteId) cancelSiteEdit();
      await load();
      await loadUnassignedSites();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to unlink site');
    } finally {
      setSaving(false);
    }
  };

  const linkSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !linkSiteId) {
      toast.error('Select a site to link');
      return;
    }
    setSaving(true);
    try {
      await cxApi.linkClientSites(id, [Number(linkSiteId)]);
      toast.success('Site linked to client');
      setLinkSiteId('');
      setLinkOpen(false);
      setSearchParams({});
      await load();
      await loadUnassignedSites();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link site');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    if (!id) return;
    if (passwordMode === 'custom' && customPassword.trim().length < 6) {
      toast.error('Custom password must be at least 6 characters');
      return;
    }
    setResetting(true);
    try {
      const payload =
        passwordMode === 'generate'
          ? { generate: true }
          : passwordMode === 'custom'
            ? { new_password: customPassword.trim(), reset_to_code: false }
            : { reset_to_code: true };
      const res = await cxApi.resetClientPassword(id, payload);
      setResetResult({
        password: res.password,
        pin: res.pin,
        message: res.message,
      });
      setCustomPassword('');
      toast.success('Password reset');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-[var(--text-muted)]">Loading client…</div>;
  if (!client) return null;

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" className="mb-2 -ml-2" onClick={() => navigate('/staff/cx/clients')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Clients
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{client.company_name || client.customer_name}</h1>
              <span className="rounded-md bg-[var(--accent-green-light)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--primary)]">{client.customer_code}</span>
              <Badge variant="outline" className={(client.status || 'Active') === 'Active' ? 'border-green-200 bg-green-100 text-green-800' : (client.status || '') === 'Suspended' ? 'border-red-200 bg-red-100 text-red-800' : 'border-gray-200 bg-gray-100 text-gray-700'}>
                {client.status || 'Active'}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton
              recordType="cx_client"
              recordId={client.id}
              pagePath={window.location.pathname}
              pageTitle={client.company_name || client.customer_name}
              recordPreview={{
                title: client.company_name || client.customer_name,
                reference: client.customer_code,
                status: client.status || 'Active',
                contact_person: client.contact_person,
                email: client.email,
                phone: client.phone,
                address: client.address,
              }}
            />
            <Button
              className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
              onClick={() => {
                if (editOpen) closeEdit();
                else {
                  fillEditFromClient(client);
                  setEditOpen(true);
                }
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> {editOpen ? 'Close' : 'Edit Client'}
            </Button>
          </div>
        </div>

        {editOpen && (
          <div className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Edit client</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Update details, manage sites, or reset portal login credentials.</p>
            </div>

            <form onSubmit={saveClient} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Company Name *</Label>
                  <Input value={editForm.company_name} onChange={(e) => setEditForm((f) => ({ ...f, company_name: e.target.value }))} required />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={editForm.contact_person} onChange={(e) => setEditForm((f) => ({ ...f, contact_person: e.target.value }))} />
                </div>
                <div>
                  <Label>Email * (portal login)</Label>
                  <Input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={editForm.location} onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Suspended">Suspended</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving} className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]">
                  {saving ? 'Saving…' : 'Save client'}
                </Button>
                <Button type="button" variant="outline" onClick={resetClientFields}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </form>

            <div className="border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Reset portal password</h3>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-secondary)] p-1">
                <button
                  type="button"
                  onClick={() => setPasswordMode('code')}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm ${passwordMode === 'code' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  Use code
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordMode('generate')}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm ${passwordMode === 'generate' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordMode('custom')}
                  className={`rounded-lg px-2 py-2 text-xs font-medium transition sm:text-sm ${passwordMode === 'custom' ? 'bg-[var(--surface)] text-[var(--primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  Custom
                </button>
              </div>
              {passwordMode === 'code' ? (
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  Sets password back to <span className="font-mono font-semibold text-[var(--primary)]">{client.customer_code}</span> and regenerates the 5-digit PIN.
                </p>
              ) : passwordMode === 'generate' ? (
                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                  Creates a new random password. Copy it after reset — it is shown once.
                </p>
              ) : (
                <div className="mb-3">
                  <Label>New password</Label>
                  <Input
                    type="text"
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
              )}
              <Button type="button" variant="outline" disabled={resetting} onClick={() => void resetPassword()}>
                <KeyRound className="mr-2 h-4 w-4" /> {resetting ? 'Resetting…' : passwordMode === 'generate' ? 'Generate & reset' : 'Reset password'}
              </Button>
              {resetResult && (
                <div className="mt-4 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm">
                  <p className="text-[var(--text-secondary)]">{resetResult.message}</p>
                  <div className="flex flex-wrap gap-2">
                    <code className="rounded-md bg-[var(--accent-green-light)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--primary)]">
                      Password: {resetResult.password}
                    </code>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyText(resetResult.password, 'Password')}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </Button>
                    <code className="rounded-md bg-[var(--accent-green-light)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--primary)]">
                      PIN: {resetResult.pin}
                    </code>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyText(resetResult.pin, 'PIN')}>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Linked sites</h3>
                <Button type="button" size="sm" variant="outline" onClick={() => setLinkOpen((v) => !v)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> {linkOpen ? 'Hide link' : 'Link site'}
                </Button>
              </div>

              {linkOpen && (
                <form onSubmit={linkSite} className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label>Unassigned site</Label>
                    <Select value={linkSiteId} onValueChange={setLinkSiteId}>
                      <SelectTrigger><SelectValue placeholder="Choose a site…" /></SelectTrigger>
                      <SelectContent>
                        {unassignedSites.length === 0 ? (
                          <SelectItem value="__none" disabled>No unassigned sites</SelectItem>
                        ) : (
                          unassignedSites.map((site) => (
                            <SelectItem key={site.id} value={String(site.id)}>
                              {site.site_name} ({site.site_code})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={saving || !linkSiteId} className="bg-[var(--primary)] text-white">
                    Link
                  </Button>
                </form>
              )}

              {sites.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No sites linked yet.</p>
              ) : (
                <div className="space-y-3">
                  {sites.map((site: any) => (
                    <div key={site.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
                      {editingSiteId === site.id ? (
                        <form onSubmit={saveSite} className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div>
                              <Label>Site Name *</Label>
                              <Input value={siteForm.site_name} onChange={(e) => setSiteForm((f) => ({ ...f, site_name: e.target.value }))} required />
                            </div>
                            <div>
                              <Label>Region</Label>
                              <Select value={siteForm.region} onValueChange={(v) => setSiteForm((f) => ({ ...f, region: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{GHANA_REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-2">
                              <Label>Address</Label>
                              <Input value={siteForm.site_address} onChange={(e) => setSiteForm((f) => ({ ...f, site_address: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Location / Town</Label>
                              <Input value={siteForm.location} onChange={(e) => setSiteForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Bogoso" />
                            </div>
                            <div>
                              <Label>Bandwidth</Label>
                              <Input value={siteForm.bandwidth} onChange={(e) => setSiteForm((f) => ({ ...f, bandwidth: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Service Type</Label>
                              <Select value={siteForm.service_type} onValueChange={(v) => setSiteForm((f) => ({ ...f, service_type: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>IP Address</Label>
                              <Input value={siteForm.ip_address} onChange={(e) => setSiteForm((f) => ({ ...f, ip_address: e.target.value }))} />
                            </div>
                            <div>
                              <Label>Status</Label>
                              <Select value={siteForm.connection_status} onValueChange={(v) => setSiteForm((f) => ({ ...f, connection_status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {['Pending', 'Active', 'Live', 'Suspended', 'Down'].map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="submit" size="sm" disabled={saving} className="bg-[var(--primary)] text-white">
                              {saving ? 'Saving…' : 'Save site'}
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={cancelSiteEdit}>Cancel</Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[var(--text-primary)]">{site.site_name}</p>
                              <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--primary)]">{site.site_code}</span>
                              <Badge variant="outline" className={connectionClass(site.connection_status)}>{site.connection_status || 'Pending'}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {[site.location, site.region, site.site_address, site.bandwidth, site.service_type].filter(Boolean).join(' · ') || 'No details'}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => startEditSite(site)}>
                              Edit
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => void unlinkSite(site.id, site.site_name)}>
                              <Unlink className="mr-1 h-3.5 w-3.5" /> Unlink
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Contact Information</h2>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-[var(--text-muted)]">Contact Person</dt><dd className="font-medium text-[var(--text-primary)]">{client.contact_person || '—'}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Email</dt><dd className="font-medium text-[var(--text-primary)]">{client.email || client.contact_email || '—'}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Phone</dt><dd className="font-medium text-[var(--text-primary)]">{client.phone || client.contact_phone || '—'}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Location</dt><dd className="font-medium text-[var(--text-primary)]">{client.location || '—'}</dd></div>
              <div><dt className="text-[var(--text-muted)]">Member Since</dt><dd className="font-medium text-[var(--text-primary)]">{client.created_at ? new Date(client.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</dd></div>
            </dl>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
            <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Quick Stats</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total Sites', value: client.site_count ?? sites.length },
                { label: 'Total Tickets', value: client.ticket_count ?? 0 },
                { label: 'Open Tickets', value: client.open_ticket_count ?? 0 },
                { label: 'Resolved', value: Math.max(0, (client.ticket_count || 0) - (client.open_ticket_count || 0)) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--primary)]">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!editOpen && (
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Linked Sites</h2>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to="/staff/cx/sites">Manage all sites</Link>
                </Button>
                <Button
                  className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                  onClick={() => {
                    setEditOpen(true);
                    setLinkOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Link Site
                </Button>
              </div>
            </div>
            {sites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--text-muted)]">
                No sites linked yet. Open Edit Client to link or update sites.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sites.map((site: any) => (
                  <div key={site.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-bold text-[var(--text-primary)]">{site.site_name}</h3>
                        <span className="mt-1 inline-block rounded-md bg-[var(--accent-green-light)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--primary)]">{site.site_code}</span>
                      </div>
                      <Badge variant="outline" className={connectionClass(site.connection_status)}>{site.connection_status || 'Pending'}</Badge>
                    </div>
                    <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                      <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[site.location, site.region, site.site_address].filter(Boolean).join(' · ') || 'No address'}</p>
                      <p>{[site.bandwidth, site.service_type].filter(Boolean).join(' · ') || '—'}</p>
                      <p className="font-medium text-[var(--text-primary)]">Tickets: {site.ticket_count ?? 0}</p>
                    </div>
                    <Button size="sm" variant="outline" className="mt-4" onClick={() => {
                      setEditOpen(true);
                      startEditSite(site);
                    }}>
                      Edit site
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Recent Tickets</h2>
          {recentTickets.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No tickets for this client yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--surface-secondary)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>{['TCK ID', 'Site', 'Title', 'Status', 'Assignee', 'Created'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {recentTickets.map((t: any) => (
                    <tr key={t.ticket_id} className="hover:bg-[var(--surface-hover)]">
                      <td className="px-3 py-2"><Link to={`/staff/cx/tickets/${encodeURIComponent(t.ticket_id)}`} className="font-mono font-semibold text-[var(--primary)] hover:underline">{t.ticket_id}</Link></td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{t.site_name || '—'}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{t.title}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{t.status}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{t.assignee_name || '—'}</td>
                      <td className="px-3 py-2 text-[var(--text-muted)]">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDetailPage;
