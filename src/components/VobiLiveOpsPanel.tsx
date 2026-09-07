import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Bot, RadioTower, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import {
  getVobiFeed,
  reactToFeed,
  markFeedSeen,
  type VobiFeedEntry,
  type VobiFeedReaction,
  type VobiFeedSeenBy,
} from '@/api/vobiFeed';
import { VobiMessage } from '@/components/vobi/VobiMessage';
import { useVobiLiveOpsStore } from '@/stores/vobiLiveOpsStore';

const SWEEP_INTERVAL_MINUTES = 15;
const MAX_ENTRIES = 3;
const REACTION_EMOJIS = ['✅', '👀', '🔥', '⚠️', '💪', '😬'];
const SEEN_AVATAR_CAP = 6;

/** A faint grain layer keeps the gradients below from banding and gives the panel a tactile,
 *  premium-dashboard feel instead of looking flat-printed. Same trick most modern SaaS surfaces
 *  (Linear, Vercel, Stripe) use over hero gradients. */
const GRAIN_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

function cardAccentClass(text: string): string {
  if (text.includes('SLA BREACH')) return 'border-l-[3px] border-l-[var(--accent-red)]';
  if (/escalated/i.test(text)) return 'border-l-[3px] border-l-[var(--accent-amber)]';
  return 'border-l-[3px] border-l-[var(--accent-blue)]';
}

/** Relative timestamps ("2 min ago") go stale the moment they're rendered if nothing ever
 *  re-renders the component again — this just ticks every 30s so a card left open for a while
 *  keeps counting up instead of freezing at whatever it said when it first arrived. */
function useTicker(intervalMs = 30000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function minutesUntilNextSweep(latest: VobiFeedEntry | undefined): number {
  if (!latest) return SWEEP_INTERVAL_MINUTES;
  const nextSweepAt = new Date(latest.created_at).getTime() + SWEEP_INTERVAL_MINUTES * 60 * 1000;
  return Math.max(0, Math.round((nextSweepAt - Date.now()) / 60000));
}

/** Reaction updates arrive from the API response (my own click) and from other staff's clicks
 *  via the socket — both funnel through this one reducer so the two paths can never disagree. */
function applyReactionUpdate(
  entries: VobiFeedEntry[],
  payload: { feedId: number; emoji: string; count: number; staffId: string; action: 'add' | 'remove' },
  myStaffId: string
): VobiFeedEntry[] {
  return entries.map((entry) => {
    if (entry.id !== payload.feedId) return entry;
    const others = entry.reactions.filter((r) => r.emoji !== payload.emoji);
    if (payload.count <= 0) return { ...entry, reactions: others };
    const previous = entry.reactions.find((r) => r.emoji === payload.emoji);
    const reactedByMe = payload.staffId === myStaffId ? payload.action === 'add' : (previous?.reacted_by_me ?? false);
    return { ...entry, reactions: [...others, { emoji: payload.emoji, count: payload.count, reacted_by_me: reactedByMe }] };
  });
}

function applySeenUpdate(entries: VobiFeedEntry[], payload: { feedId: number; staffId: string; initials: string }): VobiFeedEntry[] {
  return entries.map((entry) => {
    if (entry.id !== payload.feedId) return entry;
    if (entry.seen.some((s) => s.staff_id === payload.staffId)) return entry;
    return { ...entry, seen: [...entry.seen, { staff_id: payload.staffId, initials: payload.initials }] };
  });
}

function ReactionBar({ reactions, onReact }: { reactions: VobiFeedReaction[]; onReact: (emoji: string) => void }) {
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const r = byEmoji.get(emoji);
        const count = r?.count ?? 0;
        const mine = r?.reacted_by_me ?? false;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            aria-pressed={mine}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11.5px] font-semibold transition-all active:scale-95',
              mine
                ? 'border-[var(--primary)] bg-[var(--accent-green-light)] text-[var(--primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            <span className="leading-none">{emoji}</span>
            {count > 0 && <span className="tabular-nums leading-none">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SeenByRow({ seen }: { seen: VobiFeedSeenBy[] }) {
  if (!seen.length) return null;
  const visible = seen.slice(0, SEEN_AVATAR_CAP);
  const extra = seen.length - visible.length;
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex -space-x-2">
        {visible.map((s, i) => (
          <span
            key={s.staff_id}
            title={s.initials}
            style={{ zIndex: visible.length - i }}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--surface-secondary)] bg-[var(--primary)] text-[8.5px] font-bold text-white shadow-sm"
          >
            {s.initials}
          </span>
        ))}
      </div>
      {extra > 0 && <span className="text-[10px] font-semibold text-[var(--text-muted)]">+{extra} more</span>}
      <span className="text-[10px] text-[var(--text-muted)]">seen this</span>
    </div>
  );
}

function FeedCard({
  entry,
  isNewest,
  justArrived,
  onReact,
}: {
  entry: VobiFeedEntry;
  isNewest: boolean;
  justArrived: boolean;
  onReact: (emoji: string) => void;
}) {
  useTicker();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95, transition: { duration: 0.22 } }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'relative rounded-2xl border border-[var(--border)]/60 bg-[var(--surface-secondary)] p-4 shadow-[var(--shadow-sm)] backdrop-blur-sm transition hover:shadow-[var(--shadow-md)]',
        cardAccentClass(entry.narrated_text),
        justArrived && 'animate-ops-border-pulse'
      )}
      style={justArrived ? { boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent)' } : undefined}
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--primary)] ring-1 ring-[var(--border)]">
          <Bot className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-primary)]">Update #{entry.id}</p>
            {isNewest ? (
              <span className="flex items-center gap-1 rounded-full bg-[var(--accent-red-light)] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-[var(--accent-red)] ring-1 ring-[var(--accent-red)]/30">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-red)] opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent-red)]" />
                </span>
                Live
              </span>
            ) : (
              <span className="rounded-full bg-[var(--surface)] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                Past
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-[var(--text-muted)]">
            Updated {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
      <div className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
        <VobiMessage content={entry.narrated_text} />
      </div>
      <div className="mt-2.5 border-t border-[var(--border)]/60 pt-2.5">
        <ReactionBar reactions={entry.reactions} onReact={onReact} />
        <SeenByRow seen={entry.seen} />
      </div>
    </motion.div>
  );
}

export function VobiLiveOpsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  useTicker();
  const myStaffId = user?.id != null ? String(user.id) : '';
  const [entries, setEntries] = useState<VobiFeedEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justArrivedId, setJustArrivedId] = useState<number | null>(null);
  const setLiveOpsStoreOpen = useVobiLiveOpsStore((s) => s.setOpen);
  const seenSentRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    setLiveOpsStoreOpen(open);
  }, [open, setLiveOpsStoreOpen]);

  const load = async (opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { entries: rows } = await getVobiFeed('CW');
      setEntries(rows.slice(0, MAX_ENTRIES));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the Live Ops feed.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open]);

  // New entries — prepend and cap at 3; anything past that slides out (AnimatePresence handles
  // the exit animation once it drops out of this array).
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<VobiFeedEntry>).detail;
      if (!detail?.id) return;
      setEntries((prev) => {
        if (prev.some((x) => x.id === detail.id)) return prev;
        return [{ reactions: [], seen: [], ...detail }, ...prev].slice(0, MAX_ENTRIES);
      });
      setJustArrivedId(detail.id);
      window.setTimeout(() => setJustArrivedId((cur) => (cur === detail.id ? null : cur)), 3000);
    };
    window.addEventListener('vobi:feed-update', onUpdate);
    return () => window.removeEventListener('vobi:feed-update', onUpdate);
  }, []);

  useEffect(() => {
    const onReaction = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.feedId) return;
      setEntries((prev) => applyReactionUpdate(prev, detail, myStaffId));
    };
    const onSeen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.feedId) return;
      setEntries((prev) => applySeenUpdate(prev, detail));
    };
    window.addEventListener('vobi:reaction-update', onReaction);
    window.addEventListener('vobi:seen-update', onSeen);
    return () => {
      window.removeEventListener('vobi:reaction-update', onReaction);
      window.removeEventListener('vobi:seen-update', onSeen);
    };
  }, [myStaffId]);

  // Opening the panel marks every currently-loaded entry seen for this user only — each staff
  // member's own read state, tracked independently server-side.
  useEffect(() => {
    if (!open || !entries.length) return;
    for (const entry of entries) {
      if (seenSentRef.current.has(entry.id)) continue;
      seenSentRef.current.add(entry.id);
      markFeedSeen(entry.id).catch(() => {
        seenSentRef.current.delete(entry.id);
      });
    }
  }, [open, entries]);

  const handleReact = async (feedId: number, emoji: string) => {
    try {
      const result = await reactToFeed(feedId, emoji);
      setEntries((prev) => applyReactionUpdate(prev, result, myStaffId));
    } catch {
      // Silent — the reaction bar just won't move; nothing destructive to roll back.
    }
  };

  const latest = entries[0];

  return (
    <>
      <div
        role="presentation"
        className={cn(
          'fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        aria-label="Vobi Live Ops Feed"
        className={cn(
          'fixed inset-y-0 right-0 z-[90] flex w-[420px] max-w-[92vw] flex-col border-l border-[var(--border)] text-[var(--text-primary)] shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header — deeper gradient with a soft radial glow behind the icon, grain for texture,
            and a live pulse so it reads as "streaming" rather than a static banner. */}
        <div
          className="relative shrink-0 overflow-hidden px-4 py-3"
          style={{
            background:
              'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--primary) 88%, white 6%) 0%, var(--primary) 45%, color-mix(in srgb, var(--primary) 62%, black) 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
            style={{ backgroundImage: `url("${GRAIN_SVG}")` }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
            aria-hidden="true"
          />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 shadow-inner">
                <RadioTower className="h-3.5 w-3.5" />
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--primary)]" />
                </span>
              </span>
              <div className="min-w-0">
                <h2 className="text-[14px] font-extrabold tracking-tight text-white">Live Ops Feed</h2>
                <p className="text-[11px] font-medium text-white/70">
                  {latest ? `Updated ${formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}` : 'Watching for the first update'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => load({ silent: true })}
                disabled={refreshing}
                title="Refresh"
                aria-label="Refresh"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Body — layered soft glows + grain over the base surface color, instead of one flat
            gradient, so the panel reads as a considered surface rather than a plain scroll list. */}
        <div
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4"
          style={{
            backgroundColor: 'var(--surface)',
            backgroundImage: [
              `url("${GRAIN_SVG}")`,
              'radial-gradient(640px 320px at 100% 0%, color-mix(in srgb, var(--primary) 7%, transparent) 0%, transparent 60%)',
              'radial-gradient(520px 320px at 0% 100%, color-mix(in srgb, var(--primary) 5%, transparent) 0%, transparent 65%)',
            ].join(', '),
            backgroundBlendMode: 'overlay, normal, normal',
            backgroundSize: '120px 120px, 100% 100%, 100% 100%',
            backgroundRepeat: 'repeat, no-repeat, no-repeat',
          }}
        >
          {loading ? (
            <div className="relative space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
              ))}
            </div>
          ) : error ? (
            <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--danger-text)]">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="relative flex flex-col items-center gap-3 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-green-light)] text-[var(--accent-green)]">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">All systems operational</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Vobi has nothing to flag right now.</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[10.5px] font-semibold text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Next sweep in {minutesUntilNextSweep(undefined)} min
              </span>
            </div>
          ) : (
            <div className="relative space-y-3">
              <AnimatePresence initial={false}>
                {entries.map((entry, i) => (
                  <FeedCard
                    key={entry.id}
                    entry={entry}
                    isNewest={i === 0}
                    justArrived={justArrivedId === entry.id}
                    onReact={(emoji) => handleReact(entry.id, emoji)}
                  />
                ))}
              </AnimatePresence>
              <div className="flex justify-center pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[10.5px] font-semibold text-[var(--text-muted)] shadow-[var(--shadow-sm)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Next sweep in {minutesUntilNextSweep(latest)} min
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
