import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Banknote,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
  MessageSquare,
  Package,
  RotateCcw,
  Ticket,
  FolderKanban,
} from 'lucide-react';
import type { ChatChannel, ChatMessage, ChatRecordContext } from '@/api/chat';

export const RECORD_TYPE_META: Record<
  string,
  { badge: string; section: string; badgeClass: string }
> = {
  ticket: { badge: 'TKT', section: 'Tickets', badgeClass: 'bg-blue-600 text-white' },
  material_request: { badge: 'MAT', section: 'Material Requests', badgeClass: 'bg-blue-600 text-white' },
  item_return: { badge: 'RET', section: 'Material Requests', badgeClass: 'bg-blue-600 text-white' },
  cash_request: { badge: 'CSH', section: 'Cash Requests', badgeClass: 'bg-amber-600 text-white' },
  project_request: { badge: 'SRV', section: 'Service Requests', badgeClass: 'bg-violet-600 text-white' },
};

export const CATEGORY_SECTIONS = [
  { key: 'tickets', label: 'Tickets', recordTypes: ['ticket'], hubName: 'tickets' },
  { key: 'material-requests', label: 'Material Requests', recordTypes: ['material_request', 'item_return'], hubName: 'material-requests' },
  { key: 'cash-requests', label: 'Cash Requests', recordTypes: ['cash_request'], hubName: 'cash-requests' },
  { key: 'project-requests', label: 'Service Requests', recordTypes: ['project_request'], hubName: 'project-requests' },
] as const;

export function recordTypesForCategoryHub(hubName: string): string[] {
  const section = CATEGORY_SECTIONS.find((s) => s.hubName === hubName);
  return section ? [...section.recordTypes] : [];
}

export function categoryHubForRecordType(recordType: string | null | undefined): string | null {
  if (!recordType) return null;
  const section = CATEGORY_SECTIONS.find((s) => s.recordTypes.includes(recordType as never));
  return section?.hubName || null;
}

export function formatChatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function renderMentionBody(body: string): React.ReactNode[] {
  const parts = body.split(/(@\[[^\]]+\]\(\d+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/@\[([^\]]+)\]\((\d+)\)/);
    if (m) {
      return (
        <span key={`m-${i}`} className="font-medium text-blue-400">
          @{m[1]}
        </span>
      );
    }
    return <React.Fragment key={`t-${i}`}>{part}</React.Fragment>;
  });
}

export function RecordTypeBadge({ type, size = 'sm' }: { type: string; size?: 'sm' | 'md' }) {
  const meta = RECORD_TYPE_META[type];
  if (!meta) return null;
  const sizeClass = size === 'md' ? 'h-7 w-7 text-[10px]' : 'h-5 min-w-[1.25rem] px-1 text-[9px]';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded font-bold ${sizeClass} ${meta.badgeClass}`}>
      {meta.badge}
    </span>
  );
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes('approv') || s.includes('complet') || s.includes('resolved') || s.includes('closed')) {
    return 'chat-status-badge chat-status-badge--success';
  }
  if (s.includes('reject') || s.includes('cancel') || s.includes('denied')) {
    return 'chat-status-badge chat-status-badge--danger';
  }
  if (s.includes('pending') || s.includes('open') || s.includes('new') || s.includes('review')) {
    return 'chat-status-badge chat-status-badge--warning';
  }
  return 'chat-status-badge chat-status-badge--neutral';
}

export function RecordContextBar({
  context,
  loading,
  onOpenPanel,
}: {
  context: ChatRecordContext | null;
  loading: boolean;
  onOpenPanel?: () => void;
}) {
  if (loading) {
    return (
      <div className="chat-context-bar">
        <span className="text-xs text-gray-500">Loading record context…</span>
      </div>
    );
  }
  if (!context) return null;

  return (
    <div className="chat-context-bar">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <RecordTypeBadge type={context.record_type} />
        <span className="truncate text-sm font-medium text-gray-200">{context.title}</span>
        <span className={statusBadgeClass(context.status)}>{context.status}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onOpenPanel && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="chat-context-bar-link hidden sm:inline-flex"
          >
            Details
          </button>
        )}
        <Link to={context.linkUrl} className="chat-context-bar-link inline-flex items-center gap-1">
          Open record
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

type ActionItem = NonNullable<ChatMessage['meta']>['actions'] extends (infer A)[] | undefined ? A : never;

type SummaryCard = NonNullable<NonNullable<ChatMessage['meta']>['summaryCard']>;

const SUMMARY_VARIANT_UI: Record<
  SummaryCard['variant'],
  { icon: React.ElementType; accent: string; label: string }
> = {
  ticket: { icon: Ticket, accent: 'ticket', label: 'Support ticket' },
  material_request: { icon: Package, accent: 'material', label: 'Material request' },
  cash_request: { icon: Banknote, accent: 'cash', label: 'Cash request' },
  item_return: { icon: RotateCcw, accent: 'return', label: 'Item return' },
  project_request: { icon: FolderKanban, accent: 'project', label: 'Service request' },
};

function ThreadSummaryCard({ card }: { card: SummaryCard }) {
  const ui = SUMMARY_VARIANT_UI[card.variant] || SUMMARY_VARIANT_UI.ticket;
  const Icon = ui.icon;

  return (
    <div className={`chat-summary-card chat-summary-card--${ui.accent}`}>
      <div className="chat-summary-card-header">
        <div className="chat-summary-card-icon" aria-hidden>
          <Icon className="h-4 w-4" />
        </div>
        <div className="chat-summary-card-titles">
          <p className="chat-summary-card-headline">{card.headline}</p>
          <p className="chat-summary-card-tagline">{card.tagline}</p>
        </div>
        <span className="chat-summary-card-kind">{ui.label}</span>
      </div>
      {(card.status || card.priority) && (
        <div className="chat-summary-card-badges">
          {card.priority && (
            <span className="chat-summary-card-badge chat-summary-card-badge--priority">{card.priority}</span>
          )}
          {card.status && (
            <span className="chat-summary-card-badge chat-summary-card-badge--status">{card.status}</span>
          )}
        </div>
      )}
      {card.fields.length > 0 && (
        <dl className="chat-summary-card-fields">
          {card.fields.map((f) => (
            <div
              key={`${f.label}-${f.value}`}
              className={f.highlight ? 'chat-summary-card-field chat-summary-card-field--highlight' : 'chat-summary-card-field'}
            >
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.note && <p className="chat-summary-card-note">{card.note}</p>}
      <p className="chat-summary-card-footer">Created by Vobiss · thread opened automatically</p>
    </div>
  );
}

export function RecordSystemMessage({
  msg,
  canAct,
  onAction,
  actionLoading,
  recordStatus,
}: {
  msg: ChatMessage;
  canAct: boolean;
  onAction: (msg: ChatMessage, action: ActionItem) => void;
  actionLoading: boolean;
  /** When set, hides stale "pending approval" banners after the request moves on. */
  recordStatus?: string | null;
}) {
  const meta = msg.meta;
  const linkUrl = meta?.linkUrl;
  const linkLabel = meta?.linkLabel || 'View request';
  const actionState = meta?.actionState;
  const hadApprovalActions = (meta?.actions?.length ?? 0) > 0;
  const isClosedPendingCard =
    hadApprovalActions &&
    (actionState === 'completed' ||
      actionState === 'rejected' ||
      actionState === 'approved' ||
      (!!recordStatus && recordStatus !== 'pending'));
  const showActions = !actionState && hadApprovalActions && canAct;

  const summaryCard = meta?.summaryCard;

  if (isClosedPendingCard) return null;

  return (
    <div className={`chat-system-banner my-3 ${summaryCard ? 'chat-system-banner--summary' : ''}`}>
      <div className={`chat-system-banner-inner ${summaryCard ? 'chat-system-banner-inner--wide' : ''}`}>
        {summaryCard ? (
          <ThreadSummaryCard card={summaryCard} />
        ) : (
          <p className="chat-system-banner-text">{renderMentionBody(msg.body)}</p>
        )}
        <span className="chat-system-banner-time">{formatChatTime(msg.created_at)}</span>
        {linkUrl && (
          <Link to={linkUrl} className="chat-link-chip">
            {linkLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
        {actionState && (
          <p className="mt-1.5 text-[11px] font-medium text-gray-500">
            {actionState === 'approved' ? 'Approved' : 'Rejected'}
          </p>
        )}
        {showActions && (
          <div className="mt-2 flex flex-wrap gap-2">
            {meta!.actions!.map((action) => (
              <button
                key={`${action.actionType}-${action.recordId}`}
                type="button"
                disabled={action.disabled || actionLoading}
                onClick={() => onAction(msg, action)}
                className={`rounded-md px-3 py-1 text-[11px] font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
                  action.style === 'danger'
                    ? 'bg-red-600/90 text-white hover:bg-red-500'
                    : 'bg-emerald-600/90 text-white hover:bg-emerald-500'
                }`}
              >
                {actionLoading ? '…' : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Banner when viewing a category hub — activity feed only, chat in sidebar threads */
export function CategoryHubFlowBanner({ hubLabel }: { hubLabel: string }) {
  return (
    <div className="chat-category-flow-banner mx-4 mb-3 mt-1 flex items-start gap-3 rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2.5 sm:mx-5">
      <Activity className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-indigo-200/95">{hubLabel} — activity feed</p>
        <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
          System updates appear here. To chat, pick a ticket or request in the list on the left.
        </p>
      </div>
    </div>
  );
}

/** Category hub row styled like #general, with expandable thread list */
export function CategoryChannelRow({
  channel,
  threads,
  activeChannelId,
  expanded,
  onToggleExpand,
  onSelectHub,
  onSelectThread,
}: {
  channel: ChatChannel;
  threads: ChatChannel[];
  activeChannelId: string | null;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectHub: (ch: ChatChannel) => void;
  onSelectThread: (ch: ChatChannel) => void;
}) {
  const hubActive = channel.id === activeChannelId;
  const [showAllThreads, setShowAllThreads] = useState(false);
  const threadUnread = threads.reduce((n, t) => n + (t.unread_count || 0), 0);
  const sortedThreads = [...threads].sort((a, b) => {
    const aTime = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0;
    const bTime = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0;
    return bTime - aTime;
  });
  const visibleThreads = showAllThreads ? sortedThreads : sortedThreads.slice(0, 4);
  const hiddenThreadCount = Math.max(0, sortedThreads.length - visibleThreads.length);

  return (
    <div className="mb-0.5">
      <div
        className={`chat-channel-btn flex w-full items-center gap-0.5 rounded-md transition-colors duration-150 ${
          hubActive ? 'chat-channel-btn--active' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectHub(channel)}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[13px]"
          title="View activity feed (read-only)"
        >
          <Activity className="h-3.5 w-3.5 shrink-0 text-indigo-400/90" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{channel.name}</span>
            <span className="text-[10px] font-normal text-gray-500">Activity feed</span>
          </span>
        </button>
        {threads.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="relative shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-800/60 hover:text-gray-300"
            title={expanded ? 'Hide threads' : 'Show threads'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {!expanded && threadUnread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1 py-0 text-[8px] font-semibold leading-none text-white">
                {threadUnread > 9 ? '9+' : threadUnread}
              </span>
            )}
          </button>
        )}
      </div>
      {expanded && threads.length > 0 && (
        <div className="chat-thread-nest ml-2 border-l border-gray-800/80 pl-2 pt-0.5">
          {visibleThreads.map((thread) => {
            const threadActive = thread.id === activeChannelId;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelectThread(thread)}
                title="Open thread to chat"
                className={`chat-channel-btn mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
                  threadActive ? 'chat-channel-btn--active' : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {thread.record_type ? (
                  <RecordTypeBadge type={thread.record_type} />
                ) : (
                  <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
                )}
                <span className="flex-1 truncate">{thread.name}</span>
                {thread.unread_count > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                    {thread.unread_count > 9 ? '9+' : thread.unread_count}
                  </span>
                )}
              </button>
            );
          })}
          {sortedThreads.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllThreads((v) => !v)}
              className="mb-0.5 flex w-full items-center justify-center rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-blue-400 transition-colors duration-150 hover:bg-blue-500/10 hover:text-blue-300"
            >
              {showAllThreads ? 'Show less' : `See more (${hiddenThreadCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact thread switcher for header (record threads only — not category hubs) */
export function ThreadSwitcherMenu({
  threads,
  activeChannelId,
  onSelect,
}: {
  threads: ChatChannel[];
  activeChannelId: string | null;
  onSelect: (ch: ChatChannel) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!threads.length) return null;

  const active = threads.find((t) => t.id === activeChannelId) || null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`chat-icon-btn rounded-lg p-2 transition-colors duration-150 ${
          open ? 'chat-icon-btn--active' : ''
        }`}
        title="Switch thread in this category"
      >
        <Layers className="h-4 w-4" />
      </button>
      {open && (
        <div className="chat-popover absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Threads — chat here
          </p>
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect(t);
                setOpen(false);
              }}
              className={`chat-thread-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                t.id === activeChannelId ? 'chat-thread-menu-item--active' : ''
              }`}
            >
              {t.record_type && <RecordTypeBadge type={t.record_type} />}
              <span className="truncate">{t.name}</span>
            </button>
          ))}
          {active && (
            <div className="border-t border-gray-800/60 px-3 py-2">
              <p className="truncate text-[10px] text-gray-500">Current: {active.name}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** @deprecated Use ThreadSwitcherMenu in header */
export function ThreadSwitcher({
  threads,
  activeChannelId,
  onSelect,
}: {
  label?: string;
  threads: ChatChannel[];
  activeChannelId: string | null;
  onSelect: (ch: ChatChannel) => void;
}) {
  return (
    <ThreadSwitcherMenu threads={threads} activeChannelId={activeChannelId} onSelect={onSelect} />
  );
}

export interface ActionRequiredAlert {
  id: string;
  channelId: string;
  messageId?: string;
  title: string;
  linkUrl?: string;
  linkLabel?: string;
}

export function ActionRequiredBanner({
  alerts,
  onOpen,
  onDismiss,
}: {
  alerts: ActionRequiredAlert[];
  onOpen: (alert: ActionRequiredAlert) => void;
  onDismiss: (id: string) => void;
}) {
  if (!alerts.length) return null;
  const alert = alerts[0];

  return (
    <div className="action-required-banner flex shrink-0 items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500/90">Action required</p>
        <p className="truncate text-[13px] text-amber-100/90">{alert.title}</p>
      </div>
      <button
        type="button"
        onClick={() => onOpen(alert)}
        className="shrink-0 rounded-md bg-amber-500/90 px-2.5 py-1 text-[11px] font-semibold text-amber-950 transition-colors duration-150 hover:bg-amber-400"
      >
        {alert.linkLabel || 'View'}
      </button>
      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        className="shrink-0 text-[11px] text-amber-400/70 transition-colors duration-150 hover:text-amber-300"
      >
        Dismiss
      </button>
      {alerts.length > 1 && (
        <span className="text-[10px] text-amber-500/80">+{alerts.length - 1}</span>
      )}
    </div>
  );
}
