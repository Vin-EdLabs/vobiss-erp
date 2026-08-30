import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, Link2, Loader2, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  createDm,
  getChatChannels,
  getChatDms,
  getChatUsers,
  type ChatChannel,
  type ChatDm,
  type ChatUser,
} from '@/api/chat';
import { generateShareLink, shareRecordToChat, type SharedLink, type SharedLinkPreview, type ShareExpiry } from '@/api';
import { SharePreviewCard } from '@/components/shareRecord/SharePreviewCard';

export type ShareButtonProps = {
  recordType: string;
  recordId: number | string;
  pagePath: string;
  pageTitle: string;
  recordPreview?: SharedLinkPreview;
  variant?: React.ComponentProps<typeof Button>['variant'];
  className?: string;
};

type Destination = { type: 'channel' | 'dm'; id: string; name: string } | { type: 'user'; id: number; name: string };

const EXPIRY_OPTIONS: { value: ShareExpiry; label: string }[] = [
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: 'never', label: 'Never' },
];

/**
 * The single reusable share entry point for every detail page in the system.
 * Renders a Share icon button; clicking opens a modal with "Share in Chat" and
 * "External Link" tabs. Do not build a page-specific share button — extend this one.
 */
export function ShareButton({ recordType, recordId, pagePath, pageTitle, recordPreview, variant = 'outline', className }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <Share2 className="mr-2 h-4 w-4" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {pageTitle}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="chat">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chat">Share in Chat</TabsTrigger>
              <TabsTrigger value="link">External Link</TabsTrigger>
            </TabsList>
            <TabsContent value="chat">
              <ShareInChatTab
                recordType={recordType}
                recordId={recordId}
                pagePath={pagePath}
                pageTitle={pageTitle}
                recordPreview={recordPreview}
                onView={() => {
                  setOpen(false);
                  navigate(pagePath);
                }}
              />
            </TabsContent>
            <TabsContent value="link">
              <ExternalLinkTab
                recordType={recordType}
                recordId={recordId}
                pagePath={pagePath}
                pageTitle={pageTitle}
                recordPreview={recordPreview}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareInChatTab({
  recordType,
  recordId,
  pagePath,
  pageTitle,
  recordPreview,
  onView,
}: {
  recordType: string;
  recordId: number | string;
  pagePath: string;
  pageTitle: string;
  recordPreview?: SharedLinkPreview;
  onView: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [dms, setDms] = useState<ChatDm[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Destination | null>(null);
  const [sending, setSending] = useState(false);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureLoaded = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const [ch, dm, us] = await Promise.all([getChatChannels(), getChatDms(), getChatUsers()]);
      setChannels(ch);
      setDms(dm);
      setUsers(us);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load chats');
    } finally {
      setLoading(false);
    }
  };

  useMemo(() => {
    ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();
  const dmUserIds = new Set(dms.map((d) => d.other_user?.id).filter(Boolean));

  const channelList = useMemo(
    () => channels.filter((c) => !q || c.name.toLowerCase().includes(q)),
    [channels, q]
  );
  const dmList = useMemo(
    () => dms.filter((d) => !q || (d.other_user?.name || '').toLowerCase().includes(q)),
    [dms, q]
  );
  const userList = useMemo(
    () => users.filter((u) => !dmUserIds.has(u.id) && (!q || u.name.toLowerCase().includes(q))),
    [users, q, dmUserIds]
  );

  const send = async () => {
    if (!selected || sending) return;
    setSending(true);
    setError(null);
    try {
      let destinationType: 'channel' | 'dm' = 'channel';
      let destinationId = selected.id as string;
      if (selected.type === 'dm') {
        destinationType = 'dm';
      } else if (selected.type === 'user') {
        const { dmId } = await createDm(selected.id as number);
        destinationType = 'dm';
        destinationId = dmId;
      }
      await shareRecordToChat({
        recordType: String(recordType),
        recordId,
        pagePath,
        pageTitle,
        recordPreview,
        destinationType,
        destinationId,
        destinationName: selected.name,
      });
      setSuccessName(selected.name);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share to chat');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4 pt-2">
      <SharePreviewCard recordType={recordType} pageTitle={pageTitle} recordPreview={recordPreview} onView={onView} />

      {successName && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
          Shared to {successName}
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Send to</label>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search chats, groups, or people…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <SectionLabel text="Channels & groups" />
              {channelList.length === 0 && <EmptyRow text="No matches" />}
              {channelList.map((c) => (
                <DestinationRow
                  key={`ch-${c.id}`}
                  label={`#${c.name}`}
                  selected={selected?.type === 'channel' && selected.id === c.id}
                  onClick={() => setSelected({ type: 'channel', id: c.id, name: c.name })}
                />
              ))}
              <SectionLabel text="Direct messages" />
              {dmList.length === 0 && <EmptyRow text="No matches" />}
              {dmList.map((d) => (
                <DestinationRow
                  key={`dm-${d.id}`}
                  label={d.other_user?.name || 'Unknown'}
                  selected={selected?.type === 'dm' && selected.id === d.id}
                  onClick={() => setSelected({ type: 'dm', id: d.id, name: d.other_user?.name || 'Unknown' })}
                />
              ))}
              <SectionLabel text="People" />
              {userList.length === 0 && <EmptyRow text="No matches" />}
              {userList.map((u) => (
                <DestinationRow
                  key={`u-${u.id}`}
                  label={u.name}
                  selected={selected?.type === 'user' && selected.id === u.id}
                  onClick={() => setSelected({ type: 'user', id: u.id, name: u.name })}
                />
              ))}
            </>
          )}
        </div>
      </div>

      <Button className="w-full" disabled={!selected || sending} onClick={send}>
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {sending ? 'Sending…' : selected ? `Send to ${selected.name}` : 'Send'}
      </Button>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="sticky top-0 z-10 border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 first:border-t-0">
      {text}
    </p>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-3 py-2 text-xs text-slate-400">{text}</p>;
}

function DestinationRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
        selected ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
      }`}
    >
      {label}
    </button>
  );
}

function ExternalLinkTab({
  recordType,
  recordId,
  pagePath,
  pageTitle,
  recordPreview,
}: {
  recordType: string;
  recordId: number | string;
  pagePath: string;
  pageTitle: string;
  recordPreview?: SharedLinkPreview;
}) {
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [expiry, setExpiry] = useState<ShareExpiry>('7d');
  const [link, setLink] = useState<SharedLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await generateShareLink({
        recordType: String(recordType),
        recordId,
        pagePath,
        pageTitle,
        recordPreview,
        visibility,
        expiry,
      });
      setLink(result.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate link');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link?.url) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 pt-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Visibility</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setVisibility('public'); setLink(null); }}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              visibility === 'public' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            Public
          </button>
          <button
            type="button"
            onClick={() => { setVisibility('private'); setLink(null); }}
            className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
              visibility === 'private' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            Private
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          {visibility === 'public'
            ? 'Anyone with this link can view this record without logging in.'
            : 'Recipient must log in to Vobiss before viewing.'}
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Expires</label>
        <div className="grid grid-cols-4 gap-2">
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setExpiry(opt.value); setLink(null); }}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                expiry === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!link ? (
        <Button className="w-full" onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
          {busy ? 'Generating…' : 'Generate Link'}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <input readOnly value={link.url} className="w-full truncate bg-transparent text-sm text-slate-700 focus:outline-none" />
            <Button size="sm" variant="outline" onClick={copy} className="shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">Recipient can view only — they cannot make any changes.</p>
        </div>
      )}
    </div>
  );
}
