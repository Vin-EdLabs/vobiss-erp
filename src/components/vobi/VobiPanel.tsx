import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVobi } from '@/context/VobiContext';
import { useAuth } from '@/context/AuthContext';
import { useVobiOverview } from '@/hooks/useVobiOverview';
import { VobiCommandBar } from './VobiCommandBar';
import { VobiDigestCard, VobiThreadSummaryCard } from './VobiChatSummaryCard';
import { VobiMessageCard } from './VobiMessageCard';
import { VobiMessage } from './VobiMessage';
import { VobiMemoryConfirmButtons, VobiMemoryPanel } from './VobiMemoryPanel';
import {
  postVobiCommand,
  type VobiItem,
  type VobiMemoryConfirmation,
  type VobiPersonalDigest,
  type VobiThreadSummary,
} from '@/api/vobi';
import { buildVobiPageContext } from '@/lib/vobiPageContext';
import { getVobiPageGuide } from '@/lib/vobiPageGuides';
import { markVobiIntroSeen, vobiDisplayName } from './vobi-utils';
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
  threadSummary?: VobiThreadSummary;
  digest?: VobiPersonalDigest;
  memoryConfirmation?: VobiMemoryConfirmation | null;
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

export function VobiPanel({ theme: _theme }: VobiPanelProps) {
  const { isOpen, close } = useVobi();
  const { user } = useAuth();
  const location = useLocation();
  const { displayName } = vobiDisplayName(user);
  const userId = Number(user?.id) || undefined;
  const { data: overviewData } = useVobiOverview(isOpen);
  const hasPending = (overviewData?.pendingCount ?? 0) > 0;
  const [messages, setMessages] = useState<VobiPanelMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const pageName = useMemo(
    () => getVobiPageGuide(location.pathname)?.pageName || 'This page',
    [location.pathname]
  );

  useEffect(() => {
    if (!isOpen) return;
    markVobiIntroSeen(userId);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 280);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const handleSubmit = async (text: string, options?: { command?: string }) => {
    const now = new Date();
    const history = messages.map((m) => ({
      role: m.role === 'vobi' ? 'assistant' : 'user',
      content: m.text,
    }));
    setMessages((prev) => [
      ...prev,
      { id: `u-${now.getTime()}`, role: 'user', text, timestamp: now },
    ]);
    setThinking(true);
    try {
      const isPageHelp = options?.command === 'page-help';
      const [result] = await Promise.all([
        postVobiCommand(text, {
          persist: true,
          persistUser: true,
          history,
          command: options?.command,
          pageContext: isPageHelp ? buildVobiPageContext(location.pathname) : null,
        }),
        wait(400),
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
          memoryConfirmation: result.memoryConfirmation || result.meta?.memoryConfirmation || null,
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
      const history = messages.map((m) => ({
        role: m.role === 'vobi' ? 'assistant' : 'user',
        content: m.text,
      }));
      const result = await postVobiCommand('about vobi', {
        persist: true,
        persistUser: true,
        command: 'about',
        history,
      });
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
            ? 'inset-0'
            : 'bottom-[max(80px,calc(env(safe-area-inset-bottom)+80px))] right-[max(20px,env(safe-area-inset-right))]',
          isOpen ? 'pointer-events-auto vobi-panel-open' : 'pointer-events-none'
        )}
        aria-hidden={!isOpen}
      >
        <div
          className={cn(
            'vobi-panel-inner relative flex flex-col overflow-hidden',
            'border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] shadow-none',
            'transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
            isMobile
              ? 'h-full w-full rounded-none'
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
                <p className="text-[14px] font-medium leading-tight text-white">Vobi Intelligence</p>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-[#9FE1CB]">
                  Your work assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMemoryOpen(true)}
                className="rounded-full border border-[#9FE1CB]/30 px-2 py-1 text-[10px] font-medium text-[#9FE1CB] transition-colors hover:border-[#9FE1CB] hover:text-white"
                title="What Vobi remembers"
              >
                <span className="inline-flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  Memory
                </span>
              </button>
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
                className="flex h-11 w-11 items-center justify-center rounded-full p-1 text-[#9FE1CB] transition-colors hover:text-white"
                aria-label="Close Vobi"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <VobiMemoryPanel open={memoryOpen} onClose={() => setMemoryOpen(false)} />

          <div className="vobi-fiber-bg min-h-0 flex-1 overflow-y-auto bg-[var(--color-background-primary)] p-4">
            {messages.length === 0 && !thinking && (
              <div className="mb-4 flex flex-col items-center text-center">
                <img
                  src="/vobi-logo.png"
                  alt="Vobi"
                  className="h-16 w-auto max-w-[180px] rounded-xl object-contain"
                  draggable={false}
                />
                <p className="mt-2 text-[12px] font-medium text-[var(--color-text-primary)]">
                  Vobi Intelligence
                </p>
                <p className="mt-0.5 max-w-[260px] text-[11px] text-[var(--color-text-tertiary)]">
                  Ask about your work anytime. Tap{' '}
                  <span className="font-medium text-[#1D9E75]">Guide</span> only if you want a
                  walkthrough of this screen.
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

          <VobiCommandBar
            ref={inputRef}
            disabled={thinking}
            pageName={pageName}
            onSubmit={handleSubmit}
          />
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
          <VobiMessage content={message.text} onNavigate={onNavigate} />
          {message.cards?.map((item) => (
            <VobiMessageCard key={item.id} item={item} onNavigate={onNavigate} />
          ))}
          {message.memoryConfirmation?.memoryId != null && (
            <VobiMemoryConfirmButtons
              memoryId={message.memoryConfirmation.memoryId}
              memoryContent={message.memoryConfirmation.memory_content}
            />
          )}
        </div>
        <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
          {formatTime(message.timestamp)}
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
