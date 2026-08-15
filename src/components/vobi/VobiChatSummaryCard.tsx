import { Link } from 'react-router-dom';
import { markChannelRead } from '@/api/chat';
import type { VobiPersonalDigest, VobiThreadSummary } from '@/api/vobi';
import { cn } from '@/lib/utils';

function formatTime(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatPeriod(summary: VobiThreadSummary) {
  const from = new Date(summary.period.from);
  const ageHours = Math.max(1, Math.round((Date.now() - from.getTime()) / 36e5));
  return ageHours <= 24 ? 'Last 24 hours' : `Last ${ageHours} hours`;
}

export function VobiThreadSummaryCard({ summary }: { summary: VobiThreadSummary }) {
  const participants = summary.participants.slice(0, 3).map((p) => p.displayName).join(', ');
  const badge = summary.recordType || 'CHAT';
  const openUrl = `/chat?channel=${summary.channelId}`;

  return (
    <div className="mt-2 overflow-hidden rounded-[10px] border border-black/10 border-l-4 border-l-blue-500 bg-white text-slate-900 shadow-sm">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold">{summary.channelName}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {formatPeriod(summary)} · {summary.messageCount} message{summary.messageCount === 1 ? '' : 's'}
            </p>
          </div>
          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">
            {badge}
          </span>
        </div>

        {!!summary.participants.length && (
          <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
            {participants}
            {summary.participants.length > 3 ? ` +${summary.participants.length - 3}` : ''} ({summary.participants.length} participant{summary.participants.length === 1 ? '' : 's'})
          </p>
        )}

        {!!summary.systemEvents.length && (
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Events</p>
            <div className="mt-1 space-y-1">
              {summary.systemEvents.slice(0, 3).map((event) => (
                <p key={`${event.created_at}-${event.body}`} className="text-[11px] leading-snug text-slate-700">
                  · {event.body} <span className="text-slate-400">({formatTime(event.created_at)})</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {summary.lastMessage && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last message</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-700">"{summary.lastMessage.body}"</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {summary.lastMessage.sender} · {formatTime(summary.lastMessage.created_at)}
            </p>
          </div>
        )}
      </div>
      <div className="flex border-t border-slate-100 bg-slate-50/70">
        <Link to={openUrl} className="flex-1 px-3 py-2 text-center text-[11px] font-semibold text-blue-700 hover:bg-blue-50">
          Open thread →
        </Link>
        <button
          type="button"
          onClick={() => void markChannelRead(summary.channelId)}
          className="flex-1 border-l border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-white"
        >
          Mark all read
        </button>
      </div>
    </div>
  );
}

export function VobiDigestCard({ digest }: { digest: VobiPersonalDigest }) {
  const threadCount = digest.mentionedIn.length + digest.activeThreads.length + digest.systemEvents.length;
  return (
    <div className="mt-2 overflow-hidden rounded-[10px] border border-black/10 border-l-4 border-l-[#1D9E75] bg-white text-slate-900 shadow-sm">
      <div className="p-3">
        <p className="text-[12px] font-semibold">
          Since your last login — {threadCount} thread{threadCount === 1 ? '' : 's'} updated
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">{digest.totalUnread} unread message{digest.totalUnread === 1 ? '' : 's'}</p>
        <DigestSection title="You were mentioned in" items={digest.mentionedIn} tone="text-cyan-700" />
        <DigestSection title="Active threads" items={digest.activeThreads} tone="text-blue-700" />
        <DigestSection title="System events" items={digest.systemEvents} tone="text-amber-700" />
      </div>
      <Link to="/chat" className="block border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-center text-[11px] font-semibold text-[#0f7b59] hover:bg-emerald-50">
        Open chat →
      </Link>
    </div>
  );
}

function DigestSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<{ channelName: string; channelId?: string; dmId?: string; unreadCount: number; lastMessage?: { body: string; sender: string } }>;
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className={cn('text-[10px] font-bold uppercase tracking-wide', tone)}>{title}</p>
      <div className="mt-1 space-y-1">
        {items.slice(0, 4).map((item) => {
          const url = item.channelId ? `/chat?channel=${item.channelId}` : item.dmId ? `/chat?dm=${item.dmId}` : '/chat';
          return (
            <Link key={`${item.channelId || item.dmId}-${item.channelName}`} to={url} className="block rounded-md px-1 py-1 text-[11px] leading-snug text-slate-700 hover:bg-slate-50">
              · {item.channelName} — {item.unreadCount} new
              {item.lastMessage?.sender ? ` (${item.lastMessage.sender}: ${item.lastMessage.body})` : ''}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
