import React, { useEffect, useState } from 'react';
import { Loader2, Newspaper, RefreshCw, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { VobiMessage } from '@/components/vobi/VobiMessage';
import { useAuth } from '@/context/AuthContext';
import { timeOfDayGreeting } from '@/components/ui/greeting-banner';
import { getExecutiveSummary, askExecutiveSummary, type ExecSummaryHistoryTurn } from '@/api/vobiExecSummary';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

/** Reveals markdown one source line at a time, fast — a lightweight "being written" effect
 *  without ever mid-type a raw "**"/"##" token, since each line is only shown once complete. */
function RevealingMarkdown({
  content,
  animate,
  speedMs = 35,
  onNavigate,
}: {
  content: string;
  animate: boolean;
  speedMs?: number;
  onNavigate?: () => void;
}) {
  const [revealed, setRevealed] = useState(animate ? '' : content);

  useEffect(() => {
    if (!animate) {
      setRevealed(content);
      return;
    }
    const lines = content.split('\n');
    let i = 0;
    setRevealed('');
    const id = window.setInterval(() => {
      i += 1;
      setRevealed(lines.slice(0, i).join('\n'));
      if (i >= lines.length) window.clearInterval(id);
    }, speedMs);
    return () => window.clearInterval(id);
    // Runs once per mount — the parent remounts this via a changing `key` whenever the reveal
    // should restart, rather than this effect re-running on every content/animate change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <VobiMessage content={revealed} onNavigate={onNavigate} />;
}

/**
 * Executive Summary — same trigger design as "My to-dos" (.todo-panel-trigger), but opens as a
 * big, wide, white modal (matching the app's standard Dialog: blurred backdrop, centered) with
 * the briefing on the left and a follow-up chat on the right. The briefing itself is never
 * generated on click: it's kept warm by a server-side sweep (backend/services/vobiExecSummary.js)
 * that reads the same data as the Live Ops feed, minus the redaction, so it's already sitting
 * there — this dialog just plays it back with a quick line-by-line reveal each time it opens.
 *
 * Every color pair in here is deliberately either (a) from the app's "auto-repainted in dark
 * mode" list (bg-white/bg-slate-50/text-slate-*, see index.css's `[data-theme='dark'] .bg-white`
 * block) so it flips consistently with the rest of the app, or (b) a fixed amber accent that
 * never repaints — never mixed, since that mismatch is what made the follow-up panel unreadable
 * in dark mode before.
 */
export function VobiExecSummaryPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [openToken, setOpenToken] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [newestAssistantIndex, setNewestAssistantIndex] = useState<number | null>(null);

  const firstName = (user?.first_name || user?.full_name?.split(' ')[0] || '').trim();

  const load = async () => {
    try {
      const res = await getExecutiveSummary();
      setSummary(res.summary);
      setGeneratedAt(res.generated_at);
    } catch {
      // keep whatever was last loaded — the dialog just won't show a fresher timestamp
    } finally {
      setLoading(false);
    }
  };

  // Fetched on mount (not on open) so the briefing is already sitting there the instant the
  // dialog is opened — never a spinner-then-generate moment.
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ summary: string; generated_at: string }>).detail;
      if (!detail) return;
      setSummary(detail.summary);
      setGeneratedAt(detail.generated_at);
    };
    window.addEventListener('vobi:exec-summary-update', onUpdate);
    return () => window.removeEventListener('vobi:exec-summary-update', onUpdate);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setOpenToken((t) => t + 1);
  };

  const submitQuestion = async () => {
    const q = question.trim();
    if (!q || asking) return;
    setQuestion('');
    setTurns((prev) => [...prev, { role: 'user', content: q }]);
    setAsking(true);
    try {
      const history: ExecSummaryHistoryTurn[] = turns.map((t) => ({ role: t.role, content: t.content }));
      const res = await askExecutiveSummary(q, history);
      setTurns((prev) => {
        const next = [...prev, { role: 'assistant' as const, content: res.answer }];
        setNewestAssistantIndex(next.length - 1);
        return next;
      });
    } catch {
      setTurns((prev) => {
        const next = [
          ...prev,
          { role: 'assistant' as const, content: "I couldn't reach the system just now — try again in a moment." },
        ];
        setNewestAssistantIndex(next.length - 1);
        return next;
      });
    } finally {
      setAsking(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitQuestion();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="todo-panel-trigger inline-flex items-center gap-2 rounded-full border-[1.5px] px-2.5 py-1.5 text-[13px] font-medium transition duration-150 sm:px-3.5"
        >
          <Newspaper className="h-4 w-4" />
          <span className="hidden md:inline">Summary</span>
        </button>
      </DialogTrigger>
      <DialogContent className="flex w-[calc(100vw-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl sm:max-h-[88vh] sm:rounded-2xl sm:p-0">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-400 bg-amber-50 text-amber-600">
              <Newspaper className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-lg font-semibold text-slate-900">Executive Summary</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                Everything happening across the company right now — kept fresh automatically.
              </DialogDescription>
              {generatedAt && <p className="mt-1 text-xs font-medium text-slate-400">Updated {timeAgo(generatedAt)}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-1 shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
          <div className="min-h-0 overflow-y-auto px-6 py-5 text-[13.5px] text-slate-700 lg:border-r lg:border-slate-100">
            {loading && !summary ? (
              <p className="py-10 text-center text-sm text-slate-400">Putting the briefing together…</p>
            ) : summary ? (
              <>
                <p className="mb-3 text-base font-semibold text-slate-900">
                  {timeOfDayGreeting()}{firstName ? `, ${firstName}` : ''}.
                </p>
                <RevealingMarkdown
                  key={`summary-${openToken}`}
                  content={summary}
                  animate={open}
                  onNavigate={() => setOpen(false)}
                />
              </>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">No briefing yet — check back shortly.</p>
            )}
          </div>

          <div className="flex min-h-0 flex-col bg-slate-50">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {turns.length === 0 ? (
                <p className="text-xs leading-relaxed text-slate-400">
                  Ask a follow-up about anything in the briefing — or about a specific person, and Vobi
                  will pull their recent work and performance record.
                </p>
              ) : (
                <div className="space-y-3">
                  {turns.map((turn, i) =>
                    turn.role === 'user' ? (
                      <div
                        key={i}
                        className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-amber-500 px-3.5 py-2 text-[13px] text-white shadow-sm"
                      >
                        {turn.content}
                      </div>
                    ) : (
                      <div
                        key={i === newestAssistantIndex ? `turn-${i}-new` : `turn-${i}-static`}
                        className="max-w-[95%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-700 shadow-sm"
                      >
                        <RevealingMarkdown
                          content={turn.content}
                          animate={i === newestAssistantIndex}
                          speedMs={25}
                          onNavigate={() => setOpen(false)}
                        />
                      </div>
                    )
                  )}
                  {asking && <p className="text-xs text-slate-400">Vobi is thinking…</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-200 bg-white px-3 py-3">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask a follow-up…"
                className="min-h-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                type="button"
                onClick={() => void submitQuestion()}
                disabled={!question.trim() || asking}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white disabled:opacity-40"
                aria-label="Ask"
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
