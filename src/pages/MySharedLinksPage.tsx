import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Loader2, Share2 } from 'lucide-react';
import { extendShareLink, getMyShareLinks, revokeShareLink, type SharedLink, type ShareExpiry } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { humanizeRecordType } from '@/lib/shareRecord';

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'never', label: 'Never' },
];

function statusPill(status: SharedLink['status']) {
  if (status === 'active') return <Badge className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Active</Badge>;
  if (status === 'expired') return <Badge className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Expired</Badge>;
  return <Badge className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Revoked</Badge>;
}

export default function MySharedLinksPage() {
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [extendTarget, setExtendTarget] = useState<SharedLink | null>(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await getMyShareLinks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your shared links');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const copy = async (link: SharedLink) => {
    await navigator.clipboard.writeText(link.url);
    setCopiedToken(link.token);
    setTimeout(() => setCopiedToken(null), 1500);
  };

  const revoke = async (link: SharedLink) => {
    if (!confirm(`Revoke this share link for "${link.pageTitle || link.recordType}"?`)) return;
    setBusyToken(link.token);
    try {
      const updated = await revokeShareLink(link.token);
      setLinks((prev) => prev.map((l) => (l.token === updated.token ? updated : l)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke share link');
    } finally {
      setBusyToken(null);
    }
  };

  const extend = async (expiry: ShareExpiry) => {
    if (!extendTarget) return;
    setBusyToken(extendTarget.token);
    try {
      const updated = await extendShareLink(extendTarget.token, expiry);
      setLinks((prev) => prev.map((l) => (l.token === updated.token ? updated : l)));
      setExtendTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not extend share link');
    } finally {
      setBusyToken(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Share2 className="h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Shared Links</h1>
          <p className="text-sm text-slate-500">Every external share link you've generated across the system.</p>
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="p-3">Record</th>
              <th className="p-3">Page</th>
              <th className="p-3">Visibility</th>
              <th className="p-3">Expiry</th>
              <th className="p-3">Views</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : links.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  You haven't generated any share links yet.
                </td>
              </tr>
            ) : (
              links.map((link) => (
                <tr key={link.token} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">
                    <p className="font-medium text-slate-800">{link.pageTitle || humanizeRecordType(link.recordType)}</p>
                    <p className="text-xs text-slate-400">{humanizeRecordType(link.recordType)}</p>
                  </td>
                  <td className="p-3">
                    <Link to={link.pagePath} className="text-blue-600 hover:underline">
                      {link.pagePath}
                    </Link>
                  </td>
                  <td className="p-3 capitalize text-slate-600">{link.visibility}</td>
                  <td className="p-3 text-slate-600">{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}</td>
                  <td className="p-3 text-slate-600">{link.viewCount}</td>
                  <td className="p-3">{statusPill(link.status)}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(link)}>
                        {copiedToken === link.token ? <Check className="mr-1 h-3.5 w-3.5 text-green-600" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                        {copiedToken === link.token ? 'Copied' : 'Copy'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setExtendTarget(link)}
                        disabled={link.status === 'revoked'}
                      >
                        Extend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => revoke(link)}
                        disabled={link.status === 'revoked' || busyToken === link.token}
                      >
                        Revoke
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!extendTarget} onOpenChange={(open) => !open && setExtendTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Extend expiry</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {EXPIRY_OPTIONS.map((opt) => (
              <Button key={opt.value} variant="outline" disabled={busyToken === extendTarget?.token} onClick={() => extend(opt.value)}>
                {opt.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
