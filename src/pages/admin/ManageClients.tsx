import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Copy, KeyRound, RotateCcw, Search } from 'lucide-react';
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

type ClientRow = {
  id: number;
  customer_code: string;
  company_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  site_count?: number;
};

const statusBadge = (status?: string) => {
  const s = (status || 'Active').toLowerCase();
  if (s === 'active') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'suspended') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

const ManageClientsPage: React.FC = () => {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [passwordMode, setPasswordMode] = useState<'code' | 'generate' | 'custom'>('code');
  const [customPassword, setCustomPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ password: string; pin: string; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cxApi.getClients({
        status: status === 'All' ? undefined : status,
        search: search.trim() || undefined,
        limit: 200,
      });
      setClients(Array.isArray(res?.data) ? res.data : []);
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

  const openReset = (client: ClientRow) => {
    setActiveId(client.id);
    setPasswordMode('code');
    setCustomPassword('');
    setResult(null);
  };

  const closeReset = () => {
    setActiveId(null);
    setPasswordMode('code');
    setCustomPassword('');
    setResult(null);
  };

  const resetPassword = async (client: ClientRow) => {
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
      const res = await cxApi.resetClientPassword(client.id, payload);
      setResult({
        password: res.password,
        pin: res.pin,
        message: res.message,
      });
      setCustomPassword('');
      toast.success(`Password reset for ${client.company_name}`);
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

  return (
    <div className="min-h-screen bg-[var(--content-bg)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">System</p>
          <h1 className="mt-1 text-3xl font-bold text-[var(--text-primary)]">Manage Clients</h1>
          <p className="mt-1 text-[var(--text-muted)]">
            Reset client portal passwords and PINs for organizations. For full client and site management, use CX → Clients.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              className="pl-9"
              placeholder="Search by company, code, or email…"
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
          <Button variant="outline" asChild>
            <Link to="/staff/cx/clients">Open CX Clients</Link>
          </Button>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--surface-secondary)]">
                <tr>
                  {['Code', 'Company', 'Email', 'Phone', 'Sites', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">Loading clients…</td>
                  </tr>
                ) : clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">No clients found.</td>
                  </tr>
                ) : (
                  clients.map((client) => (
                    <React.Fragment key={client.id}>
                      <tr className="hover:bg-[var(--surface-hover)]">
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-[var(--accent-green-light)] px-2 py-1 font-mono text-xs font-semibold text-[var(--primary)]">
                            {client.customer_code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">{client.company_name}</p>
                              {client.contact_person && (
                                <p className="text-xs text-[var(--text-muted)]">{client.contact_person}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{client.email || '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{client.phone || '—'}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{client.site_count ?? 0}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={statusBadge(client.status)}>
                            {client.status || 'Active'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={activeId === client.id ? 'default' : 'outline'}
                              className={activeId === client.id ? 'bg-[var(--primary)] text-white' : ''}
                              onClick={() => (activeId === client.id ? closeReset() : openReset(client))}
                            >
                              <KeyRound className="mr-1 h-3.5 w-3.5" />
                              {activeId === client.id ? 'Close' : 'Reset password'}
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/staff/cx/clients/${client.id}`}>View</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {activeId === client.id && (
                        <tr>
                          <td colSpan={7} className="bg-[var(--surface-secondary)] px-4 py-4">
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                              <div className="mb-3 flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-[var(--primary)]" />
                                <p className="text-sm font-semibold text-[var(--text-primary)]">
                                  Reset password — {client.company_name}
                                </p>
                              </div>
                              <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-[var(--surface-secondary)] p-1 sm:max-w-lg">
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
                                  Sets password to{' '}
                                  <span className="font-mono font-semibold text-[var(--primary)]">{client.customer_code}</span>
                                  {' '}and regenerates the 5-digit PIN.
                                </p>
                              ) : passwordMode === 'generate' ? (
                                <p className="mb-3 text-sm text-[var(--text-secondary)]">
                                  Creates a new random password and regenerates the PIN. Copy it after reset — it is shown once.
                                </p>
                              ) : (
                                <div className="mb-3 max-w-md">
                                  <Label>New password</Label>
                                  <Input
                                    value={customPassword}
                                    onChange={(e) => setCustomPassword(e.target.value)}
                                    placeholder="At least 6 characters"
                                  />
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  disabled={resetting}
                                  className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                                  onClick={() => void resetPassword(client)}
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  {resetting ? 'Resetting…' : passwordMode === 'generate' ? 'Generate & reset' : 'Reset password'}
                                </Button>
                                <Button type="button" variant="outline" onClick={closeReset}>
                                  <RotateCcw className="mr-2 h-4 w-4" /> Cancel
                                </Button>
                              </div>
                              {result && (
                                <div className="mt-4 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm">
                                  <p className="text-[var(--text-secondary)]">{result.message}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <code className="rounded-md bg-[var(--accent-green-light)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--primary)]">
                                      Password: {result.password}
                                    </code>
                                    <Button type="button" size="sm" variant="outline" onClick={() => void copyText(result.password, 'Password')}>
                                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                                    </Button>
                                    <code className="rounded-md bg-[var(--accent-green-light)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--primary)]">
                                      PIN: {result.pin}
                                    </code>
                                    <Button type="button" size="sm" variant="outline" onClick={() => void copyText(result.pin, 'PIN')}>
                                      <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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

export default ManageClientsPage;
