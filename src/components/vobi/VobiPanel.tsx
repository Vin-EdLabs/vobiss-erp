import { useEffect, useRef, useState } from 'react';
import { ClipboardList, MessageCircle, Rocket, Ticket, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVobi } from '@/context/VobiContext';
import { useAuth } from '@/context/AuthContext';
import { useVobiOverview } from '@/hooks/useVobiOverview';
import { VobiCommandBar } from './VobiCommandBar';
import { VobiDigestCard, VobiThreadSummaryCard } from './VobiChatSummaryCard';
import { VobiMessageCard } from './VobiMessageCard';
import { VobiMessage } from './VobiMessage';
import {
  getVobiBriefing,
  getVobiOverview,
  getVobiSummary,
  postVobiCommand,
  type VobiItem,
  type VobiOverview,
  type VobiPersonalDigest,
  type VobiSummaryResponse,
  type VobiThreadSummary,
} from '@/api/vobi';
import {
  hasSeenVobiIntro,
  markVobiIntroSeen,
  vobiDisplayName,
} from './vobi-utils';
import { useIsMobile } from '@/hooks/useIsMobile';

interface VobiPanelProps {
  theme: 'light' | 'dark';
}

type VobiPanelMessage = {
  id: string;
  role: 'vobi' | 'user';
  text: string;
  timestamp: Date;
  cards?: VobiItem[];
  summary?: VobiDailySummary;
  threadSummary?: VobiThreadSummary;
  digest?: VobiPersonalDigest;
};

type VobiDailySummary = {
  statusLine: string;
  tickets: { open: number; overdue: number; resolved: number };
  requests: { pending: number; approved: number; rejected: number };
  chat: { mentions: number; unreadThreads: number };
  projects: { updated: number; inProduction: number };
  hasCards: boolean;
};

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function uniqueCards(items: VobiItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildDailyBriefing(
  overview: VobiOverview,
  summary: VobiSummaryResponse
): { text: string; cards: VobiItem[]; summary: VobiDailySummary } {
  const t = summary.sections.tickets;
  const r = summary.sections.requests;
  const c = summary.sections.chat;
  const p = summary.sections.projects;
  const cards = uniqueCards([
    ...overview.groups.overdue,
    ...overview.groups.needsAction,
    ...overview.groups.mentions,
    ...overview.groups.sinceLogin,
  ]).slice(0, 6);

  return {
    text: 'Your daily briefing',
    cards,
    summary: {
      statusLine: overview.statusLine,
      tickets: { open: t.open.length, overdue: t.overdue.length, resolved: t.resolved.length },
      requests: { pending: r.pending, approved: r.approved, rejected: r.rejected },
      chat: { mentions: c.mentioned, unreadThreads: c.unread_threads },
      projects: { updated: p.updated, inProduction: p.in_production },
      hasCards: cards.length > 0,
    },
  };
}

export function VobiPanel({ theme: _theme }: VobiPanelProps) {
  const { isOpen, close } = useVobi();
  const { user } = useAuth();
  const { displayName } = vobiDisplayName(user);
  const userId = Number(user?.id) || undefined;
  const { data: overviewData } = useVobiOverview(isOpen);
  const hasPending = (overviewData?.pendingCount ?? 0) > 0;
  const [messages, setMessages] = useState<VobiPanelMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const greetedThisSession = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 280);
    if (!greetedThisSession.current) {
      greetedThisSession.current = true;
      Promise.all([getVobiBriefing(), getVobiOverview(), getVobiSummary('today')])
        .then(([briefing, overview, summary]) => {
          const nextMessages: VobiPanelMessage[] = [];
          if (!hasSeenVobiIntro(userId)) {
            markVobiIntroSeen(userId);
          }
          nextMessages.push({
            id: `greet-${Date.now()}`,
            role: 'vobi',
            text: briefing.response,
            timestamp: new Date(),
          });
          const briefingCard = buildDailyBriefing(overview, summary);
          nextMessages.push({
            id: `briefing-${Date.now()}`,
            role: 'vobi',
            text: briefingCard.text,
            cards: briefingCard.cards,
            summary: briefingCard.summary,
            timestamp: new Date(),
          });
          setMessages((prev) => [...prev, ...nextMessages]);
        })
        .catch(() => {
          setMessages((prev) => prev);
        });
    }
    return () => window.clearTimeout(focusTimer);
  }, [isOpen, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSubmit = async (text: string) => {
    const now = new Date();
    setMessages((prev) => [
      ...prev,
      { id: `u-${now.getTime()}`, role: 'user', text, timestamp: now },
    ]);
    setThinking(true);
    try {
      const [result] = await Promise.all([
        postVobiCommand(text, { persist: false }),
        wait(900),
      ]);
      setMessages((prev) => [
        ...prev,
        {
          id: `v-${Date.now()}`,
          role: 'vobi',
          text: result.reply || result.response || '',
          cards: result.cards,
          threadSummary: result.meta?.threadSummary,
          digest: result.meta?.digest,
          timestamp: new Date(),
        },
      ]);
    } catch (e) {
      await wait(800);
      setMessages((prev) => [
        ...prev,
        {
          id: `v-err-${Date.now()}`,
          role: 'vobi',
          text:
            e instanceof Error
              ? e.message
              : "I couldn't reach my work data right now.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const showAboutVobi = async () => {
    setThinking(true);
    try {
      const result = await postVobiCommand('about vobi', { persist: false, command: 'about' });
      setMessages((prev) => [
        ...prev,
        {
          id: `about-${Date.now()}`,
          role: 'vobi',
          text: result.reply || result.response || '',
          timestamp: new Date(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: `about-err-${Date.now()}`,
          role: 'vobi',
          text: e instanceof Error ? e.message : 'Vobi is unavailable right now.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[9997] bg-slate-950/[0.04] backdrop-blur-[1.5px] transition-opacity duration-200',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={close}
        aria-hidden
      />
      <div
        className={cn(
          'vobi-panel fixed z-[9998]',
          isMobile
            ? 'inset-x-0 bottom-0'
            : 'bottom-[max(80px,calc(env(safe-area-inset-bottom)+80px))] right-[max(20px,env(safe-area-inset-right))]',
          isOpen ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      aria-hidden={!isOpen}
    >
      <div
        className={cn(
          'vobi-panel-inner flex flex-col overflow-hidden',
          'border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] shadow-none',
          'transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
          isMobile
            ? 'h-[min(92dvh,640px)] w-full rounded-t-2xl'
            : 'h-[min(640px,calc(100dvh-100px))] w-[min(400px,calc(100vw-40px))] rounded-2xl',
          isOpen ? 'translate-y-0 opacity-100' : 'translate-y-[110%] opacity-0'
        )}
      >
        <header className="flex h-[58px] shrink-0 items-center justify-between bg-[#111827] px-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full bg-[#111827] ring-1 ring-[#1D9E75]/40',
                hasPending && 'vobi-logo-halo'
              )}
            >
              <img
                src="/vobi-logo.png"
                alt=""
                className={cn(
                  'h-[58px] w-[58px] max-w-none object-cover object-left',
                  hasPending && 'vobi-logo-attention'
                )}
                draggable={false}
              />
            </span>
            <div>
              <p className="text-[14px] font-medium leading-tight text-white">Vobi</p>
              <p className="text-[11px] leading-tight text-[#9FE1CB]">Your work assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={showAboutVobi}
              className="rounded-full border border-[#9FE1CB]/30 px-2 py-1 text-[10px] font-medium text-[#9FE1CB] transition-colors hover:border-[#9FE1CB] hover:text-white"
            >
              About
            </button>
            <button
              type="button"
              onClick={close}
              className="p-1 text-[#9FE1CB] transition-colors hover:text-white"
              aria-label="Close Vobi"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="vobi-fiber-bg min-h-0 flex-1 overflow-y-auto bg-[var(--color-background-primary)] p-4">
          {messages.length <= 1 && (
            <div className="mb-4 flex flex-col items-center text-center">
              <img
                src="/vobi-logo.png"
                alt="Vobi"
                className="h-16 w-auto max-w-[180px] rounded-xl object-contain"
                draggable={false}
              />
              <p className="mt-2 text-[12px] font-medium text-[var(--color-text-primary)]">
                Vobi
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)]">
                Your work assistant
              </p>
            </div>
          )}
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                userInitials={initialsFor(displayName)}
                onNavigate={close}
              />
            ))}
            {thinking && <TypingBubble />}
            <div ref={bottomRef} />
          </div>
        </div>

        <VobiCommandBar ref={inputRef} disabled={thinking} onSubmit={handleSubmit} />
      </div>
    </div>
    </>
  );
}

function ChatBubble({
  message,
  userInitials,
  onNavigate,
}: {
  message: VobiPanelMessage;
  userInitials: string;
  onNavigate?: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[78%] text-right">
          <div className="rounded-[14px_14px_3px_14px] bg-[#111827] px-[13px] py-2.5 text-left text-[13px] leading-normal text-white">
            {message.text}
          </div>
          <div className="mt-1 text-[11px] text-[#9FE1CB]">
            {formatTime(message.timestamp)}
          </div>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-background-info)] text-[10px] font-bold text-white">
          {userInitials}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1D9E75] text-[12px] font-bold text-white">
        <img
          src="/vobi-logo.png"
          alt=""
          className="h-9 w-9 max-w-none rounded-full object-cover object-left"
          draggable={false}
        />
      </span>
      <div className="max-w-[88%]">
        <div className="rounded-[14px_14px_14px_3px] bg-[var(--color-background-secondary)] px-[13px] py-2.5 text-[13px] leading-[1.5] text-[var(--color-text-primary)] shadow-sm ring-1 ring-black/5">
          {message.threadSummary && <VobiThreadSummaryCard summary={message.threadSummary} />}
          {message.digest && <VobiDigestCard digest={message.digest} />}
          {message.summary ? (
            <VobiDailySummaryCard summary={message.summary} onNavigate={onNavigate} />
          ) : (
            <VobiMessage content={message.text} onNavigate={onNavigate} />
          )}
          {message.cards?.map((item) => (
            <VobiMessageCard key={item.id} item={item} onNavigate={onNavigate} />
          ))}
        </div>
        <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function VobiDailySummaryCard({
  summary,
  onNavigate,
}: {
  summary: VobiDailySummary;
  onNavigate?: () => void;
}) {
  const tiles = [
    {
      label: 'Tickets',
      value: summary.tickets.open,
      detail: `${summary.tickets.overdue} overdue • ${summary.tickets.resolved} resolved`,
      icon: Ticket,
      tone: 'from-blue-500/15 to-cyan-500/10 text-blue-700',
    },
    {
      label: 'Requests',
      value: summary.requests.pending,
      detail: `${summary.requests.approved} approved • ${summary.requests.rejected} rejected`,
      icon: ClipboardList,
      tone: 'from-emerald-500/15 to-teal-500/10 text-emerald-700',
    },
    {
      label: 'Chat',
      value: summary.chat.mentions,
      detail: `${summary.chat.unreadThreads} unread thread${summary.chat.unreadThreads === 1 ? '' : 's'}`,
      icon: MessageCircle,
      tone: 'from-violet-500/15 to-fuchsia-500/10 text-violet-700',
    },
    {
      label: 'Projects',
      value: summary.projects.updated,
      detail: `${summary.projects.inProduction} in production`,
      icon: Rocket,
      tone: 'from-amber-500/15 to-orange-500/10 text-amber-700',
    },
  ];

  return (
    <div className="min-w-0">
      <div className="rounded-xl border border-white/70 bg-white/90 p-3 text-slate-900 shadow-[var(--shadow-md)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#1D9E75]">
              Daily briefing
            </p>
            <div className="mt-1 text-[13px] font-semibold leading-snug text-slate-950">
              <VobiMessage content={summary.statusLine} onNavigate={onNavigate} />
            </div>
          </div>
          <span className="rounded-full bg-[#1D9E75]/10 px-2 py-1 text-[10px] font-semibold text-[#0f7b59]">
            Today
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <div
                key={tile.label}
                className={cn('rounded-lg bg-gradient-to-br p-2 ring-1 ring-black/5', tile.tone)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-600">{tile.label}</span>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 text-lg font-bold leading-none text-slate-950">
                  {tile.value}
                </div>
                <div className="mt-1 truncate text-[10px] text-slate-500">{tile.detail}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-[11px] leading-snug text-slate-500">
          <VobiMessage content={summary.statusLine} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1D9E75] text-[12px] font-bold text-white">
        <img
          src="/vobi-logo.png"
          alt=""
          className="h-9 w-9 max-w-none rounded-full object-cover object-left"
          draggable={false}
        />
      </span>
      <div>
        <div className="rounded-[14px_14px_14px_3px] bg-[var(--color-background-secondary)] px-[13px] py-3">
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="vobi-typing-dot h-1.5 w-1.5 rounded-full bg-[#1D9E75]"
                style={{ animationDelay: `${i * 140}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
