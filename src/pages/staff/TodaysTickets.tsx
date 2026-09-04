import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, ExternalLink, RefreshCw, Ticket as TicketIcon } from 'lucide-react';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';

interface MyDayTicket {
  id: number;
  ticket_id: string;
  title: string;
  status: string;
  priority: string;
  escalation_stage: string | null;
  category: string;
  created_at: string;
  updated_at: string;
  last_touched_at: string;
}

const statusStyle: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  OPEN: 'bg-sky-100 text-sky-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  ON_HOLD: 'bg-slate-100 text-slate-700',
  RESOLVED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-emerald-100 text-emerald-700',
};
const priorityStyle: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  normal: 'bg-sky-100 text-sky-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-rose-100 text-rose-700',
  critical: 'bg-rose-100 text-rose-700',
};

/**
 * "Today's Tickets" — a personal filter over the SAME ticket flow every other queue page
 * reads from (via activity_logs), not a separate ticket system. Shows every ticket the
 * signed-in staff member has personally viewed, commented on, assigned, or updated today.
 */
export default function TodaysTickets() {
  const [tickets, setTickets] = useState<MyDayTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await cxApi.getMyDayTickets();
      setTickets(res.data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load today's tickets");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--primary)]">My Day</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
            <Clock className="h-7 w-7" /> Today's Tickets
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every ticket you've personally touched today — {todayLabel}. Still part of the main ticket flow; this is just your day at a glance.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </header>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] py-16 text-center">
          <TicketIcon className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
          <p className="mt-3 font-semibold text-[var(--text-primary)]">Nothing worked on yet today</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Tickets you view, comment on, assign, or update will show up here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link
              key={t.id}
              to={`/staff/cx/tickets/${encodeURIComponent(t.ticket_id)}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] transition hover:border-[var(--primary)] hover:shadow-[var(--shadow-md)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-[var(--primary)]">{t.ticket_id}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusStyle[t.status] || 'bg-slate-100 text-slate-700'}`}>
                    {(t.status || '').replace(/_/g, ' ')}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityStyle[(t.priority || '').toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>
                    {t.priority}
                  </span>
                  {t.escalation_stage && (
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold uppercase text-indigo-600">{t.escalation_stage}</span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-sm font-medium text-[var(--text-primary)]">{t.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-muted)]">
                Last touched {new Date(t.last_touched_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
