import React, { useCallback, useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  Hash,
  Megaphone,
  Search,
  Users,
  Pin,
  Paperclip,
  Smile,
  Send,
  X,
  Plus,
  UserMinus,
  MessageCircle,
  Sun,
  Moon,
  ArrowLeft,
  PanelLeft,
  PanelLeftClose,
  ArrowRight,
  FileText,
  ChevronRight,
  Forward,
  Bookmark,
  Menu,
  Globe,
  Play,
} from 'lucide-react';
import '@/styles/chat-theme.css';
import '@/styles/chat-mobile.css';
import { ChatAttachment } from '@/components/chat/ChatAttachments';
import { ChatAudioPlayer } from '@/components/chat/ChatAudioPlayer';
import { ChatVoiceRecorder } from '@/components/chat/ChatVoiceRecorder';
import {
  ActionRequiredBanner,
  CategoryChannelRow,
  CategoryHubFlowBanner,
  RecordContextBar,
  RecordSystemMessage,
  RecordTypeBadge,
  ThreadSwitcherMenu,
  categoryHubForRecordType,
  recordTypesForCategoryHub,
  type ActionRequiredAlert,
} from '@/components/chat/RecordChatUI';
import { SharedRecordCard } from '@/components/chat/SharedRecordCard';
import {
  ForwardMessageModal,
  ForwardedOriginBanner,
} from '@/components/chat/ForwardMessageModal';
import { SavedMessagesPanel } from '@/components/chat/SavedMessagesPanel';
import { createStaffSocket } from '@/lib/staffSocket';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { canManageUnitGroups } from '@/config/roles';
import {
  getChatChannels,
  getChatDms,
  getChatUsers,
  getChannelMessages,
  getDmMessages,
  sendChannelMessage,
  sendDmMessage,
  reactToMessage,
  reactToDmMessage,
  createDm,
  createGroupDm,
  updateMyChatStatus,
  getChannelMembers,
  createUnitGroup,
  addGroupMembers,
  removeGroupMember,
  getPinnedMessages,
  pinMessage,
  unpinMessage,
  searchChatMessages,
  searchChatGlobal,
  getMessageThread,
  editChatMessage,
  deleteChatMessage,
  getChatRecordContext,
  performChatAction,
  getMessageById,
  getBookmarks,
  bookmarkMessage,
  removeBookmark,
  checkBookmarks,
  markChannelRead,
  markDmRead,
  type BookmarkedMessage,
  type ChatChannel,
  type ChatDm,
  type ChatMessage,
  type ChatUser,
  type ChatRecordContext,
} from '@/api/chat';
import { cn } from '@/lib/utils';
import { dispatchVobiOpen, isVobiChatTrigger, VobiChatView } from '@/components/vobi';
import { getVobiThread } from '@/api/vobi';
import { useVobiOverview } from '@/hooks/useVobiOverview';
import { channelCountsForUnread, sumCountableChannelUnread } from '@/lib/chatUnread';
import { staffCxTicketPath, toFullTicketNumber } from '@/lib/ticketPaths';
import { useIsMobile } from '@/hooks/useIsMobile';
import { UserAvatar } from '@/components/UserAvatar';
import { useChatMobileNav } from '@/hooks/useChatMobileNav';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { fileIconFor, formatFileSize } from '@/components/archive/shared';
import { MobileWorkspaceNavDrawer } from '@/components/chat/mobile/MobileWorkspaceNavDrawer';
import { MobileChatToasts } from '@/components/chat/mobile/MobileChatToasts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function emitChatUnreadChanged() {
  window.dispatchEvent(new CustomEvent('chat:unread-changed'));
}

function syncChatUnreadQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
  queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
  queryClient.invalidateQueries({ queryKey: ['chat-unread-total'] });
  emitChatUnreadChanged();
}

function clearLocalUnread(
  queryClient: QueryClient,
  target: { channelId?: string | null; dmId?: string | null }
) {
  let cleared = 0;
  if (target.channelId) {
    queryClient.setQueryData<ChatChannel[]>(['chat-channels'], (old) =>
      (old ?? []).map((c) => {
        if (c.id === target.channelId && c.unread_count > 0) {
          if (channelCountsForUnread(c)) cleared += c.unread_count;
          return { ...c, unread_count: 0 };
        }
        return c;
      })
    );
  }
  if (target.dmId) {
    queryClient.setQueryData<ChatDm[]>(['chat-dms'], (old) =>
      (old ?? []).map((d) => {
        if (d.id === target.dmId && d.unread_count > 0) {
          cleared += d.unread_count;
          return { ...d, unread_count: 0 };
        }
        return d;
      })
    );
  }
  if (cleared > 0) {
    queryClient.setQueryData<{ total: number }>(['chat-unread-total'], (old) => ({
      total: Math.max(0, (old?.total ?? 0) - cleared),
    }));
    emitChatUnreadChanged();
  }
}

const COMMON_EMOJIS = ['👍', '✅', '❤️', '😂', '🎉', '🔥', '👀', '💯', '🙏', '😊', '👏', '💡', '🚀', '⭐', '✨', '🤝'];

const EMOJI_PICKER = [
  ...COMMON_EMOJIS,
  '😀', '😃', '😄', '😁', '😅', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😎', '🤔',
  '😐', '😑', '🙄', '😏', '😣', '😥', '😮', '😯', '😪', '😴', '😌', '🤗', '🤭', '🫡', '🥳', '😭',
  '😤', '😡', '🤯', '😱', '🥺', '😬', '🙃', '😈', '👻', '💀', '☠️', '🤖', '👋', '🤚', '👏', '🙌',
  '👍', '👎', '👊', '✊', '🤝', '🙏', '💪', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💔', '❣️', '💕', '💖', '💗', '💘', '💝', '💞', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💬',
  '👁️', '🎉', '🎊', '🎁', '🎈', '🏆', '🥇', '🎯', '🎮', '🎵', '🎶', '📌', '📎', '📝', '📁', '📂',
  '📅', '📆', '📈', '📉', '💼', '💻', '📱', '☎️', '📧', '✉️', '🔔', '🔕', '⏰', '⌛', '⏳', '🔒',
  '🔓', '🔑', '✅', '❌', '⚠️', '🚫', '❓', '❗', '‼️', '💡', '🔥', '⭐', '🌟', '✨', '⚡', '☀️',
  '🌙', '☁️', '🌧️', '❄️', '🌈', '🍕', '🍔', '🍟', '🌮', '🍿', '☕', '🍺', '🍻', '🥂', '🍷', '🍰',
];

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  if (d > weekAgo) {
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatDateDivider(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function roleBadgeClass(role: string | null) {
  const r = (role || '').toLowerCase();
  if (r === 'admin super' || r === 'system admin') return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
  if (r.includes('finance')) return 'bg-lime-500/20 text-lime-300 border-lime-500/30';
  if (r.includes('manager') || r.includes('approver') || r.includes('director')) return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
  if (r.includes('support') || r.includes('cx')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
}

function formatUnitLabel(unit: string | null | undefined) {
  const value = String(unit || '').trim();
  if (!value) return '';
  const upper = value.toUpperCase();
  if (['NOC', 'IP', 'TX', 'TS', 'CX'].includes(upper)) return upper === 'TX' ? 'TS' : upper;
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSenderBadge(msg: ChatMessage) {
  const role = String(msg.sender_role || '').trim().toLowerCase();
  const position = String(msg.sender_position || '').trim();
  const unit = formatUnitLabel(msg.sender_unit);
  const senderName = String(msg.sender_name || '').trim().toLowerCase();

  if (role === 'superadmin' && (senderName === 'admin super' || senderName === 'system admin')) {
    return 'System Admin';
  }
  if (role === 'director' || role === 'cto' || position.toLowerCase().includes('director')) {
    return position || 'Director';
  }

  return unit || 'Staff';
}

function normalizeSearchText(text: string) {
  return String(text || '')
    .toLowerCase()
    .replace(/@\[[^\]]+\]\(\d+\)/g, (_m, _n, _o, _s) => {
      const match = _m.match(/@\[([^\]]+)\]/);
      return match ? `@${match[1]}` : '';
    })
    .replace(/#/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function channelDisplayName(ch: { name?: string; channel_type?: string } | null | undefined) {
  const name = String(ch?.name || '').toLowerCase();
  const type = String(ch?.channel_type || '').toLowerCase();
  if (type === 'general' || name === 'general') return 'General';
  if (type === 'announcements' || name === 'announcements') return 'Announcements';
  return ch?.name || '';
}

function isCompanyGeneral(ch: { name?: string; channel_type?: string } | null | undefined) {
  const name = String(ch?.name || '').toLowerCase();
  const type = String(ch?.channel_type || '').toLowerCase();
  return type === 'general' || name === 'general';
}

function channelMatchesSearch(
  query: string,
  ch: ChatChannel
) {
  if (!query) return true;
  const haystack = normalizeSearchText(
    [
      ch.name,
      `#${ch.name}`,
      channelDisplayName(ch),
      `# ${channelDisplayName(ch)}`,
      ch.description || '',
      isCompanyGeneral(ch) ? 'company-wide everyone general' : '',
      ch.last_message?.body || '',
      ch.last_message?.sender_name || '',
    ].join(' ')
  );
  return haystack.includes(query);
}

function dmMatchesSearch(query: string, dm: ChatDm) {
  if (!query) return true;
  const haystack = normalizeSearchText(
    [
      dm.other_user?.name || '',
      dm.other_user?.role || '',
      dm.last_message?.body || '',
      dm.last_message?.sender_name || '',
    ].join(' ')
  );
  return haystack.includes(query);
}

function userMatchesSearch(query: string, u: ChatUser) {
  if (!query) return false;
  const haystack = normalizeSearchText([u.name, u.role || '', u.unit || ''].join(' '));
  return haystack.includes(query);
}

function formatMessagePreview(body: string) {
  return String(body || '').replace(/@\[[^\]]+\]\(\d+\)/g, (_m) => {
    const match = _m.match(/@\[([^\]]+)\]/);
    return match ? `@${match[1]}` : _m;
  });
}

function isPlaceholderAttachmentBody(body: string) {
  const t = String(body || '').trim();
  return !t || t === '(attachment)';
}

function shouldShowMessageBody(msg: ChatMessage) {
  return !isPlaceholderAttachmentBody(msg.body);
}

function messagePreviewText(msg: ChatMessage) {
  const preview = formatMessagePreview(msg.body).trim();
  if (preview && !isPlaceholderAttachmentBody(preview)) return preview;
  const attachments = msg.attachments || [];
  if (attachments.some((a) => (a.mime_type || '').startsWith('audio/'))) return 'Voice message';
  if (attachments.some((a) => (a.mime_type || '').startsWith('image/'))) return 'Photo';
  if (attachments.some((a) => (a.mime_type || '').startsWith('video/'))) return 'Video';
  if (attachments.length > 0) return 'Attachment';
  return '';
}

function toForwardedOrigin(m: ChatMessage): NonNullable<ChatMessage['forwardedOrigin']> {
  return {
    id: m.id,
    sender_name: m.sender_name,
    body: m.body,
    created_at: m.created_at,
    attachments: (m.attachments || []).map((a) => ({
      file_name: a.file_name,
      file_url: a.file_url,
      mime_type: a.mime_type,
    })),
  };
}

function messageMatchesQuery(msg: ChatMessage, query: string) {
  if (!query) return false;
  const q = normalizeSearchText(query);
  const haystack = normalizeSearchText(
    [msg.body, msg.sender_name, ...(msg.attachments?.map((a) => a.file_name) || [])].join(' ')
  );
  return haystack.includes(q);
}

function parseSystemLink(body: string, meta?: ChatMessage['meta']) {
  if (meta?.linkUrl) return meta.linkUrl;
  const mr = body.match(/Mat\. Request #(\d+)/i) || body.match(/Material Request #MR-(\d+)/i);
  if (mr) return `/request-forms/${mr[1]}`;
  const cr = body.match(/Cash Request #(?:CR-)?(\d+)/i);
  if (cr) return `/cash-details/${cr[1]}`;
  const ir = body.match(/Item Return #(?:IR-)?(\d+)/i);
  if (ir) return `/item-returns/${ir[1]}`;
  const tk = body.match(/Ticket #([\w-]+)/i);
  if (tk) return staffCxTicketPath(toFullTicketNumber(tk[1]) || tk[1]);
  return null;
}

function recordContextTitle(recordType: string | null | undefined, recordId: string | null | undefined) {
  if (!recordType || !recordId) return 'Record';
  if (recordType === 'ticket') return `Ticket #${recordId}`;
  if (recordType === 'cash_request') return `Cash Request #${recordId}`;
  if (recordType === 'project_request') return `Project #${recordId}`;
  if (recordType === 'item_return') return `Item Return #${recordId}`;
  return `Request #${recordId}`;
}

function canShowChatApprovalActions(user: { role?: string; main_role?: string } | null) {
  if (!user) return false;
  const role = user.main_role || user.role || '';
  return ['approver', 'director', 'superadmin', 'finance'].includes(role);
}

function renderFormattedText(text: string, keyPrefix = 't'): React.ReactNode[] {
  if (!text) return [];
  const pattern = /(\*\*(.+?)\*\*|_(.+?)_|\[(.+?)\]\((.+?)\))/;
  const match = text.match(pattern);
  if (!match || match.index === undefined) return [text];

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const nodes: React.ReactNode[] = [];
  if (before) nodes.push(before);

  if (match[2]) {
    nodes.push(
      <strong key={`${keyPrefix}-b-${match.index}`} className="font-bold text-white">
        {match[2]}
      </strong>
    );
  } else if (match[3]) {
    nodes.push(
      <em key={`${keyPrefix}-i-${match.index}`} className="italic">
        {match[3]}
      </em>
    );
  } else if (match[4] && match[5]) {
    nodes.push(
      <a
        key={`${keyPrefix}-l-${match.index}`}
        href={match[5]}
        target="_blank"
        rel="noreferrer"
        className="text-blue-400 underline hover:text-blue-300"
      >
        {match[4]}
      </a>
    );
  }

  nodes.push(...renderFormattedText(after, `${keyPrefix}-${match.index}`));
  return nodes;
}

function renderBody(body: string) {
  const parts = body.split(/(@\[[^\]]+\]\(\d+\))/g);
  return parts.map((part, i) => {
    const m = part.match(/@\[([^\]]+)\]\((\d+)\)/);
    if (m) {
      return (
        <span key={i} className="font-medium text-blue-400">
          @{m[1]}
        </span>
      );
    }
    return <span key={i}>{renderFormattedText(part, `p${i}`)}</span>;
  });
}

function groupMessages(messages: ChatMessage[]) {
  const groups: { key: string; date: string; items: ChatMessage[][] }[] = [];
  let currentDate = '';
  let currentGroup: ChatMessage[] = [];

  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString();
    if (date !== currentDate) {
      if (currentGroup.length) {
        groups[groups.length - 1]?.items.push(currentGroup);
        currentGroup = [];
      }
      currentDate = date;
      groups.push({ key: date, date: msg.created_at, items: [] });
    }

    const prev = currentGroup[currentGroup.length - 1];
    const sameSender = prev && prev.sender_id === msg.sender_id && prev.message_type === msg.message_type;
    const within5 =
      prev &&
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
    if (sameSender && within5 && msg.message_type !== 'system') {
      currentGroup.push(msg);
    } else {
      if (currentGroup.length) groups[groups.length - 1].items.push(currentGroup);
      currentGroup = [msg];
    }
  }
  if (currentGroup.length && groups.length) groups[groups.length - 1].items.push(currentGroup);
  return groups;
}

/** A data: URL instead of URL.createObjectURL — the latter needs a matching revoke() on
 *  cleanup, and under React 18 StrictMode's dev-only double-invoke of effects (mount → effect →
 *  cleanup → effect again), an effect whose body is nothing but `return () => revoke(url)` gets
 *  its cleanup fired immediately, permanently revoking the URL with nothing left to recreate it
 *  — the preview goes blank and stays blank. A data: URL has no such lifecycle to manage. */
function useFileDataUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled) setUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
    };
  }, [file]);
  return url;
}

function PendingAudioPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useFileDataUrl(file);
  if (!url) return null;
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <ChatAudioPlayer url={url} compact />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-2 rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
        title="Remove voice message"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Actual thumbnail before sending — matches how the message itself will render the image
 *  once sent (see ChatAttachment), so what you see here is what the recipient will see. */
function PendingImagePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useFileDataUrl(file);
  return (
    <div className="chat-pending-image group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-black/30">
      {url && <img src={url} alt={file.name} className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        title="Remove image"
        className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-90 hover:bg-black/90"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** A <video> with no autoplay/controls just paints its first frame like a poster image — no
 *  extra decoding step needed to get a real thumbnail instead of a generic file-type icon. */
function PendingVideoPreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useFileDataUrl(file);
  return (
    <div className="chat-pending-video group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-700 bg-black/30">
      {url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      )}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
        <Play className="h-5 w-5 fill-white text-white drop-shadow" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove video"
        className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-90 hover:bg-black/90"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Same file-type icon set the File Storage page uses (fileIconFor) — a PDF, a spreadsheet,
 *  a video all look distinct here instead of every non-image file being a plain text chip. */
function PendingFileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const ext = file.name.split('.').pop() || '';
  const Icon = fileIconFor(ext);
  return (
    <div className="chat-pending-file flex h-16 w-40 shrink-0 items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-2.5">
      <Icon className="h-6 w-6 shrink-0 text-gray-300" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-gray-200" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-gray-500">{formatFileSize(file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove file"
        className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const CHAT_THEME_KEY = 'chat-theme';

function readChatTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(CHAT_THEME_KEY) === 'light' ? 'light' : 'dark';
}

const Chat: React.FC<{
  mainNavHidden?: boolean;
  onToggleMainNav?: () => void;
}> = ({ mainNavHidden = false, onToggleMainNav }) => {
  const [chatTheme, setChatTheme] = useState<'light' | 'dark'>(readChatTheme);
  const isLight = chatTheme === 'light';

  const toggleChatTheme = useCallback(() => {
    setChatTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(CHAT_THEME_KEY, next);
      return next;
    });
  }, []);

  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [vobiChannelId, setVobiChannelId] = useState<string | null>(null);
  const { data: vobiOverview } = useVobiOverview(!!token);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [dmSearch, setDmSearch] = useState('');
  const deferredSearch = useDeferredValue(sidebarSearch.trim().toLowerCase());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [input, setInput] = useState('');
  const draftRestoreKeyRef = useRef<string | null>(null);

  // Unsent-message drafts, kept per conversation in localStorage so switching away and back
  // (or a page reload) doesn't lose what you were typing.
  useEffect(() => {
    const key = activeChannelId
      ? `chat-draft:channel:${activeChannelId}`
      : activeDmId
        ? `chat-draft:dm:${activeDmId}`
        : null;
    draftRestoreKeyRef.current = key;
    if (!key) return;
    try {
      setInput(localStorage.getItem(key) || '');
    } catch {
      setInput('');
    }
  }, [activeChannelId, activeDmId]);

  useEffect(() => {
    const key = draftRestoreKeyRef.current;
    if (!key) return;
    try {
      if (input.trim()) localStorage.setItem(key, input);
      else localStorage.removeItem(key);
    } catch {
      /* localStorage unavailable (private browsing, quota) — drafts just won't persist */
    }
  }, [input]);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const forwardOriginCacheRef = useRef<Map<string, NonNullable<ChatMessage['forwardedOrigin']>>>(new Map());
  const [activePanelView, setActivePanelView] = useState<'chat' | 'saved'>('chat');
  const [bookmarkedMessageIds, setBookmarkedMessageIds] = useState<Set<string>>(new Set());
  const [bookmarkIdByMessageId, setBookmarkIdByMessageId] = useState<Map<string, string>>(new Map());
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTextDraft, setStatusTextDraft] = useState('');
  const [statusEmojiDraft, setStatusEmojiDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);
  const [newDmMode, setNewDmMode] = useState<'single' | 'group'>('single');
  const [groupDmSelectedIds, setGroupDmSelectedIds] = useState<number[]>([]);
  const [creatingGroupDm, setCreatingGroupDm] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addingMembers, setAddingMembers] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [activeThreadRootId, setActiveThreadRootId] = useState<string | null>(null);
  const activeThreadRootIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeThreadRootIdRef.current = activeThreadRootId;
  }, [activeThreadRootId]);
  const [recordContext, setRecordContext] = useState<ChatRecordContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionAlerts, setActionAlerts] = useState<ActionRequiredAlert[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    tickets: true,
    'material-requests': true,
    'cash-requests': true,
    'project-requests': true,
  });
  const [memberFilterSearch, setMemberFilterSearch] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showPinned, setShowPinned] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [activeMobileActionsMessageId, setActiveMobileActionsMessageId] = useState<string | null>(null);
  // On mobile, tapping a message opens its react/reply/pin row via activeMobileActionsMessageId
  // (there's no hover there to reveal it) — but nothing closed it again except tapping that same
  // message a second time. Tapping anywhere else on the page (the background, the composer, the
  // header) now closes it too. Tapping a different message bubble isn't treated as "outside"
  // here — that click's own handler (below, on the bubble) already swaps which message is open.
  useEffect(() => {
    if (!activeMobileActionsMessageId) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.chat-msg-bubble, .chat-hover-actions')) {
        setActiveMobileActionsMessageId(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [activeMobileActionsMessageId]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{
    message: ChatMessage;
    channelId?: string | null;
    dmId?: string | null;
  } | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<ReturnType<typeof createStaffSocket> | null>(null);
  const membersPanelRef = useRef<HTMLDivElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);
  const messageSearchRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const lastDeepLinkMessageRef = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('chat-route-active');
    document.body.classList.add('chat-route-active');
    return () => {
      document.documentElement.classList.remove('chat-route-active');
      document.body.classList.remove('chat-route-active');
      document.body.removeAttribute('data-chat-route-theme');
    };
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-chat-route-theme', chatTheme);
  }, [chatTheme]);

  const resetMobileChatViewport = useCallback(() => {
    if (!isMobile || typeof window === 'undefined') return;

    const reset = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    window.requestAnimationFrame(reset);
    window.setTimeout(reset, 80);
  }, [isMobile]);

  const syncMobileKeyboardViewport = useCallback(() => {
    if (!isMobile || typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    const visualHeight = Math.max(320, Math.floor(viewport?.height || window.innerHeight));
    const visualOffsetTop = Math.max(0, Math.floor(viewport?.offsetTop || 0));
    const keyboardInset = Math.max(
      0,
      Math.floor(window.innerHeight - visualHeight - visualOffsetTop)
    );
    const rootStyle = document.documentElement.style;

    rootStyle.setProperty('--chat-visual-viewport-height', `${visualHeight}px`);
    rootStyle.setProperty('--chat-visual-viewport-offset-top', `${visualOffsetTop}px`);
    rootStyle.setProperty('--chat-keyboard-inset', `${keyboardInset}px`);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;

    syncMobileKeyboardViewport();
    resetMobileChatViewport();
    const resetAndCloseTransientUi = () => {
      syncMobileKeyboardViewport();
      resetMobileChatViewport();
      setActiveMobileActionsMessageId(null);
      setShowEmoji(false);
      setShowLinkPopover(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resetAndCloseTransientUi();
    };

    window.addEventListener('pageshow', resetAndCloseTransientUi);
    window.addEventListener('focus', resetAndCloseTransientUi);
    window.addEventListener('focusin', syncMobileKeyboardViewport);
    window.addEventListener('focusout', syncMobileKeyboardViewport);
    window.addEventListener('popstate', resetAndCloseTransientUi);
    window.addEventListener('orientationchange', resetAndCloseTransientUi);
    window.addEventListener('resize', syncMobileKeyboardViewport);
    window.visualViewport?.addEventListener('scroll', syncMobileKeyboardViewport);
    window.visualViewport?.addEventListener('resize', syncMobileKeyboardViewport);
    window.visualViewport?.addEventListener('resize', resetMobileChatViewport);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.documentElement.style.removeProperty('--chat-visual-viewport-height');
      document.documentElement.style.removeProperty('--chat-visual-viewport-offset-top');
      document.documentElement.style.removeProperty('--chat-keyboard-inset');
      window.removeEventListener('pageshow', resetAndCloseTransientUi);
      window.removeEventListener('focus', resetAndCloseTransientUi);
      window.removeEventListener('focusin', syncMobileKeyboardViewport);
      window.removeEventListener('focusout', syncMobileKeyboardViewport);
      window.removeEventListener('popstate', resetAndCloseTransientUi);
      window.removeEventListener('orientationchange', resetAndCloseTransientUi);
      window.removeEventListener('resize', syncMobileKeyboardViewport);
      window.visualViewport?.removeEventListener('scroll', syncMobileKeyboardViewport);
      window.visualViewport?.removeEventListener('resize', syncMobileKeyboardViewport);
      window.visualViewport?.removeEventListener('resize', resetMobileChatViewport);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isMobile, resetMobileChatViewport, syncMobileKeyboardViewport]);

  const { data: allBookmarks = [], refetch: refetchBookmarks } = useQuery({
    queryKey: ['chat-bookmarks'],
    queryFn: getBookmarks,
  });

  const bookmarkCount = allBookmarks.length;

  useEffect(() => {
    setBookmarkedMessageIds(new Set(allBookmarks.map((b) => b.message.id)));
    setBookmarkIdByMessageId(
      new Map(allBookmarks.map((b) => [b.message.id, b.bookmark_id] as [string, string]))
    );
  }, [allBookmarks]);

  const { data: channels = [] } = useQuery({
    queryKey: ['chat-channels'],
    queryFn: getChatChannels,
    refetchInterval: 60000,
  });

  const { data: dms = [] } = useQuery({
    queryKey: ['chat-dms'],
    queryFn: getChatDms,
    refetchInterval: 60000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['chat-users'],
    queryFn: getChatUsers,
  });

  const myStatus = useMemo(() => users.find((u) => u.id === user?.id), [users, user?.id]);

  const openStatusModal = () => {
    setStatusTextDraft(myStatus?.status_text || '');
    setStatusEmojiDraft(myStatus?.status_emoji || '');
    setShowStatusModal(true);
  };

  const applyStatusUpdate = (userId: number, statusText: string | null, statusEmoji: string | null) => {
    queryClient.setQueryData<ChatUser[]>(['chat-users'], (old) =>
      old?.map((u) => (u.id === userId ? { ...u, status_text: statusText, status_emoji: statusEmoji } : u))
    );
    queryClient.invalidateQueries({ queryKey: ['chat-members'] });
    queryClient.setQueryData<ChatDm[]>(['chat-dms'], (old) =>
      old?.map((d) =>
        d.other_user?.id === userId
          ? { ...d, other_user: { ...d.other_user, status_text: statusText, status_emoji: statusEmoji } }
          : d
      )
    );
  };

  const handleSaveStatus = async (text: string, emoji: string) => {
    setSavingStatus(true);
    try {
      const saved = await updateMyChatStatus(text.trim() || null, emoji.trim() || null);
      if (user?.id) applyStatusUpdate(user.id, saved.status_text, saved.status_emoji);
      setShowStatusModal(false);
    } catch (e) {
      toast({
        title: 'Could not update status',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingStatus(false);
    }
  };

  const markConversationRead = useCallback(
    async (target: { channelId?: string | null; dmId?: string | null }) => {
      clearLocalUnread(queryClient, target);
      if (target.channelId) {
        setActionAlerts((prev) => prev.filter((alert) => alert.channelId !== target.channelId));
      }
      try {
        if (target.channelId) await markChannelRead(target.channelId);
        else if (target.dmId) await markDmRead(target.dmId);
      } catch {
        /* GET /messages also marks read server-side */
      }
      window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
      syncChatUnreadQueries(queryClient);
    },
    [queryClient]
  );

  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const isVobiChannel = !!(vobiChannelId && activeChannelId === vobiChannelId);

  useEffect(() => {
    if (!token) return;
    getVobiThread()
      .then((t) => setVobiChannelId(t.channelId))
      .catch(() => setVobiChannelId(null));
  }, [token]);
  const activeDm = dms.find((d) => d.id === activeDmId) || null;

  const mobileNav = useChatMobileNav(isMobile);

  const handleMobileBackToList = useCallback(() => {
    mobileNav.goToList();
    setActivePanelView('chat');
    setActiveChannelId(null);
    setActiveDmId(null);
    setSearchParams({});
  }, [mobileNav.goToList, setSearchParams]);

  // A PWA opened from the home screen has no browser chrome, so the OS/browser's native
  // edge-swipe-back gesture never fires there — this is that gesture, reimplemented, only
  // active on the thread screen (swiping back from the list makes no sense, there's nothing
  // behind it). The list itself is never unmounted (see chat-mobile.css's display:none
  // toggling between screens), so its scroll position is already exactly where it was.
  const swipeBackRef = useSwipeBack<HTMLDivElement>(handleMobileBackToList, isMobile && mobileNav.isThread);

  const chatUnreadTotal = useMemo(
    () => sumCountableChannelUnread(channels) + dms.reduce((s, d) => s + (d.unread_count || 0), 0),
    [channels, dms]
  );
  const canManageGroups = canManageUnitGroups(user);
  const hasRecordContext = !!(activeChannel?.record_type && activeChannel?.record_id);
  const isRecordThread = !!activeChannel?.record_type;
  const isCategoryHubView = activeChannel?.channel_type === 'category';
  const canCompose =
    !!(activeChannelId || activeDmId) && !isCategoryHubView && !isVobiChannel;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !canCompose ||
        activePanelView !== 'chat' ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isEditable) return;

      if (event.key.length === 1) {
        event.preventDefault();
        inputRef.current?.focus();
        setInput((value) => value + event.key);
        if (event.key === '@') {
          setMentionQuery('');
          setMentionIndex(0);
        }
      } else if (event.key === 'Backspace' && input) {
        event.preventDefault();
        inputRef.current?.focus();
        setInput((value) => value.slice(0, -1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanelView, canCompose, input]);

  useEffect(() => {
    if (!hasRecordContext || !activeChannel) {
      setRecordContext(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    getChatRecordContext(activeChannel.record_type!, activeChannel.record_id!)
      .then((ctx) => {
        if (!cancelled) setRecordContext(ctx);
      })
      .catch(() => {
        if (!cancelled) setRecordContext(null);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasRecordContext, activeChannel?.record_type, activeChannel?.record_id]);

  const handleChatAction = useCallback(
    async (msg: ChatMessage, action: NonNullable<ChatMessage['meta']>['actions'][0]) => {
      if (!activeChannelId) return;
      let reason: string | undefined;
      if (action.actionType === 'reject') {
        const input = window.prompt('Reason for rejection (optional):');
        if (input === null) return;
        reason = input.trim() || undefined;
      }
      setActionLoadingId(msg.id);
      try {
        await performChatAction({
          actionType: action.actionType,
          recordType: action.recordType,
          recordId: action.recordId,
          messageId: msg.id,
          channelId: activeChannelId,
          reason,
        });
        toast({ title: action.actionType === 'approve' ? 'Approved' : 'Rejected' });
      } catch (e) {
        toast({
          title: 'Action failed',
          description: e instanceof Error ? e.message : 'Please try again',
          variant: 'destructive',
        });
      } finally {
        setActionLoadingId(null);
      }
    },
    [activeChannelId, toast]
  );

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['chat-members', activeChannelId],
    queryFn: () => getChannelMembers(activeChannelId!),
    enabled: !!activeChannelId,
  });

  const deferredDmSearch = useDeferredValue(dmSearch.trim().toLowerCase());
  const deferredMessageSearch = useDeferredValue(messageSearchQuery.trim());

  const { data: pinnedData, refetch: refetchPins } = useQuery({
    queryKey: ['chat-pins', activeChannelId, activeDmId],
    queryFn: () =>
      activeChannelId
        ? getPinnedMessages({ channelId: activeChannelId })
        : getPinnedMessages({ dmId: activeDmId! }),
    enabled: !!(activeChannelId || activeDmId),
  });

  const pinnedMessages = pinnedData?.messages ?? [];
  const pinnedIds = useMemo(() => new Set(pinnedMessages.map((m) => m.id)), [pinnedMessages]);

  const { data: messageSearchData, isFetching: searchingMessages } = useQuery({
    queryKey: ['chat-message-search', activeChannelId, activeDmId, deferredMessageSearch],
    queryFn: () =>
      activeChannelId
        ? searchChatMessages({ channelId: activeChannelId, q: deferredMessageSearch })
        : searchChatMessages({ dmId: activeDmId!, q: deferredMessageSearch }),
    enabled: showMessageSearch && deferredMessageSearch.length >= 1 && !!(activeChannelId || activeDmId),
  });

  const messageSearchResults = messageSearchData?.messages ?? [];

  const { data: globalSearchData } = useQuery({
    queryKey: ['chat-global-search', deferredSearch],
    queryFn: () => searchChatGlobal(deferredSearch),
    enabled: deferredSearch.length >= 2,
  });

  const globalMessageResults = useMemo(
    () => (deferredSearch.length >= 2 ? (globalSearchData?.messages ?? []).slice(0, 20) : []),
    [deferredSearch, globalSearchData]
  );

  const { data: threadData, isFetching: threadLoading } = useQuery({
    queryKey: ['chat-thread', activeThreadRootId],
    queryFn: () => getMessageThread(activeThreadRootId!),
    enabled: !!activeThreadRootId,
  });
  const threadRoot = threadData?.root ?? null;
  const threadReplies = threadData?.replies ?? [];

  const openThread = (msg: ChatMessage) => {
    setShowContext(false);
    setActiveThreadRootId(msg.id);
  };

  const combinedSearchResults = useMemo(() => {
    const q = messageSearchQuery.trim();
    if (!q) return [];
    const byId = new Map<string, ChatMessage>();
    for (const msg of messageSearchResults) byId.set(msg.id, msg);
    for (const msg of messages) {
      if (msg.message_type === 'user' && messageMatchesQuery(msg, q) && !byId.has(msg.id)) {
        byId.set(msg.id, msg);
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [messageSearchQuery, messageSearchResults, messages]);

  const enrichMessageWithForwardOrigin = useCallback(async (msg: ChatMessage): Promise<ChatMessage> => {
    if (!msg.forwarded_from || msg.forwardedOrigin) return msg;
    const cached = forwardOriginCacheRef.current.get(msg.forwarded_from);
    if (cached) return { ...msg, forwardedOrigin: cached };
    try {
      const origin = await getMessageById(msg.forwarded_from);
      const fo = toForwardedOrigin(origin);
      forwardOriginCacheRef.current.set(msg.forwarded_from, fo);
      return { ...msg, forwardedOrigin: fo };
    } catch {
      return msg;
    }
  }, []);

  const enrichMessagesWithForwardOrigin = useCallback(
    async (list: ChatMessage[]) => Promise.all(list.map(enrichMessageWithForwardOrigin)),
    [enrichMessageWithForwardOrigin]
  );

  const loadMessages = useCallback(
    async (opts?: { before?: string; append?: boolean }) => {
      if (!activeChannelId && !activeDmId) return;
      try {
        if (opts?.append) setLoadingOlder(true);
        const res = activeChannelId
          ? await getChannelMessages(activeChannelId, opts?.before)
          : await getDmMessages(activeDmId!, opts?.before);
        const enriched = await enrichMessagesWithForwardOrigin(res.messages);
        if (opts?.append) {
          setMessages((prev) => [...enriched, ...prev]);
          setHasMore(res.messages.length >= 50);
        } else {
          setMessages(enriched);
          setHasMore(res.messages.length >= 50);
          if (activeChannelId) {
            clearLocalUnread(queryClient, { channelId: activeChannelId });
          } else if (activeDmId) {
            clearLocalUnread(queryClient, { dmId: activeDmId });
          }
          syncChatUnreadQueries(queryClient);
        }
        const ids = enriched.map((m) => m.id);
        if (ids.length) {
          try {
            const { bookmarked } = await checkBookmarks(ids);
            if (bookmarked.length) {
              setBookmarkedMessageIds((prev) => {
                const next = new Set(prev);
                bookmarked.forEach((id) => next.add(id));
                return next;
              });
            }
          } catch {
            /* optional */
          }
        }
      } finally {
        setLoadingOlder(false);
      }
    },
    [activeChannelId, activeDmId, enrichMessagesWithForwardOrigin, queryClient]
  );

  const handleToggleBookmark = useCallback(
    async (msg: ChatMessage) => {
      const isBookmarked = bookmarkedMessageIds.has(msg.id);
      if (isBookmarked) {
        const bookmarkId = bookmarkIdByMessageId.get(msg.id);
        if (!bookmarkId) return;
        setBookmarkedMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(msg.id);
          return next;
        });
        setBookmarkIdByMessageId((prev) => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
        try {
          await removeBookmark(bookmarkId);
          toast({ title: 'Bookmark removed' });
          refetchBookmarks();
        } catch (e) {
          setBookmarkedMessageIds((prev) => new Set(prev).add(msg.id));
          setBookmarkIdByMessageId((prev) => new Map(prev).set(msg.id, bookmarkId));
          toast({
            title: 'Could not remove bookmark',
            description: e instanceof Error ? e.message : undefined,
            variant: 'destructive',
          });
        }
      } else {
        setBookmarkedMessageIds((prev) => new Set(prev).add(msg.id));
        try {
          const res = await bookmarkMessage(msg.id);
          setBookmarkIdByMessageId((prev) => new Map(prev).set(msg.id, res.bookmark_id));
          toast({ title: 'Message saved' });
          refetchBookmarks();
        } catch (e) {
          setBookmarkedMessageIds((prev) => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
          toast({
            title: 'Could not save message',
            description: e instanceof Error ? e.message : undefined,
            variant: 'destructive',
          });
        }
      }
    },
    [bookmarkedMessageIds, bookmarkIdByMessageId, refetchBookmarks, toast]
  );

  const handleGoToBookmark = useCallback(
    async (bm: BookmarkedMessage) => {
      setActivePanelView('chat');
      mobileNav.goToThread();
      const src = bm.message.source;
      const stub: ChatMessage = {
        id: bm.message.id,
        body: bm.message.body,
        message_type: bm.message.message_type,
        created_at: bm.message.created_at,
        sender_id: null,
        sender_name: bm.message.sender_name || 'System',
        sender_initials: '??',
        sender_unit: null,
        sender_position: null,
        sender_role: null,
        sender_avatar_color: 'bg-slate-500',
        edited_at: null,
        reply_to: null,
        attachments: bm.message.attachments.map((a, i) => ({
          id: `att-${i}`,
          file_name: a.file_name,
          file_url: a.file_url,
          file_size: 0,
          mime_type: a.mime_type,
        })),
        reactions: [],
        channel_id: src.type === 'channel' ? src.id : null,
        dm_id: src.type === 'dm' ? src.id : null,
      };

      if (src.type === 'channel') {
        setActiveChannelId(src.id);
        setActiveDmId(null);
        setSearchParams({ channel: src.id });
        try {
          const res = await getChannelMessages(src.id);
          const enriched = await enrichMessagesWithForwardOrigin(res.messages);
          setMessages(enriched);
          setHasMore(enriched.length >= 50);
          window.setTimeout(() => scrollToMessage(stub), 150);
        } catch {
          toast({ title: 'Could not open channel', variant: 'destructive' });
        }
      } else {
        setActiveDmId(src.id);
        setActiveChannelId(null);
        setSearchParams({ dm: src.id });
        try {
          const res = await getDmMessages(src.id);
          const enriched = await enrichMessagesWithForwardOrigin(res.messages);
          setMessages(enriched);
          setHasMore(enriched.length >= 50);
          window.setTimeout(() => scrollToMessage(stub), 150);
        } catch {
          toast({ title: 'Could not open conversation', variant: 'destructive' });
        }
      }
    },
    [enrichMessagesWithForwardOrigin, mobileNav.goToThread, setSearchParams, toast]
  );

  const handleForwardComplete = useCallback(
    async (result: { forwarded: { destinationId: string; messageId: string }[] }) => {
      const count = result.forwarded.length;
      toast({
        title: `Forwarded to ${count} destination${count === 1 ? '' : 's'}`,
      });
      for (const item of result.forwarded) {
        const inView =
          item.destinationId === activeChannelId || item.destinationId === activeDmId;
        if (!inView) continue;
        try {
          const raw = await getMessageById(item.messageId);
          const enriched = await enrichMessageWithForwardOrigin(raw);
          setMessages((prev) => (prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched]));
        } catch {
          /* optional */
        }
      }
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
      queryClient.invalidateQueries({ queryKey: ['chat-unread-total'] });
      emitChatUnreadChanged();
    },
    [activeChannelId, activeDmId, enrichMessageWithForwardOrigin, queryClient, toast]
  );

  useEffect(() => {
    if (searchParams.get('view') === 'saved') {
      setActivePanelView('saved');
      if (isMobile) mobileNav.goToThread();
      return;
    }
    const chParam = searchParams.get('channel');
    const dmParam = searchParams.get('dm');
    if (dmParam) {
      setActivePanelView('chat');
      setActiveDmId(dmParam);
      setActiveChannelId(null);
      if (isMobile) mobileNav.goToThread();
    } else if (chParam && channels.length) {
      setActivePanelView('chat');
      const ch =
        channels.find((c) => c.id === chParam) ||
        channels.find((c) => c.name.toLowerCase() === chParam.toLowerCase()) ||
        channels.find((c) => c.slug?.toLowerCase() === chParam.toLowerCase());
      if (ch) {
        setActiveChannelId(ch.id);
        setActiveDmId(null);
        if (isMobile) mobileNav.goToThread();
      }
    } else if (
      !isMobile &&
      !activeChannelId &&
      !activeDmId &&
      activePanelView !== 'saved' &&
      channels.length
    ) {
      const general = channels.find((c) => c.name === 'general') || channels[0];
      setActiveChannelId(general.id);
    }
  }, [channels, searchParams, isMobile, mobileNav.goToThread]);

  useEffect(() => {
    if (activeChannelId || activeDmId) {
      setActiveMobileActionsMessageId(null);
      setMessages([]);
      setHasMore(true);
      loadMessages();
    }
  }, [activeChannelId, activeDmId, loadMessages]);

  useEffect(() => {
    const messageParam = searchParams.get('message');
    if (!messageParam || activePanelView !== 'chat' || (!activeChannelId && !activeDmId)) return;

    const conversationKey = activeChannelId ? `channel:${activeChannelId}` : `dm:${activeDmId}`;
    const deepLinkKey = `${conversationKey}:${messageParam}`;
    if (lastDeepLinkMessageRef.current === deepLinkKey) return;
    lastDeepLinkMessageRef.current = deepLinkKey;

    const existing = messages.find((m) => m.id === messageParam);
    if (existing) {
      scrollToMessage(existing);
      return;
    }

    getMessageById(messageParam)
      .then((raw) => enrichMessageWithForwardOrigin(raw))
      .then((msg) => {
        const belongsToActiveConversation =
          (activeChannelId && msg.channel_id === activeChannelId) ||
          (activeDmId && msg.dm_id === activeDmId);
        if (belongsToActiveConversation) scrollToMessage(msg);
      })
      .catch(() => {
        toast({
          title: 'Message not found',
          description: 'The message may have been deleted or is no longer available.',
          variant: 'destructive',
        });
      });
  }, [
    activeChannelId,
    activeDmId,
    activePanelView,
    enrichMessageWithForwardOrigin,
    messages,
    searchParams,
    toast,
  ]);

  useEffect(() => {
    if (activePanelView !== 'chat') return;
    if (activeChannelId) {
      void markConversationRead({ channelId: activeChannelId });
    } else if (activeDmId) {
      void markConversationRead({ dmId: activeDmId });
    }
  }, [activeChannelId, activeDmId, activePanelView, markConversationRead]);

  useEffect(() => {
    if (!token) return;
    const socket = createStaffSocket(token);
    socketRef.current = socket;

    socket.on('new_message', (msg: ChatMessage) => {
      void (async () => {
        const enriched = await enrichMessageWithForwardOrigin(msg);

        // Thread reply — keep the open thread panel and the parent's "N replies" affordance
        // live, independent of which branch (own message / active conversation / elsewhere)
        // handles the rest of this event below.
        if (enriched.reply_to?.id) {
          const parentId = enriched.reply_to.id;
          if (parentId === activeThreadRootIdRef.current) {
            queryClient.setQueryData<{ root: ChatMessage; replies: ChatMessage[] } | undefined>(
              ['chat-thread', parentId],
              (old) => {
                if (!old) return old;
                if (old.replies.some((r) => r.id === enriched.id)) return old;
                return { ...old, replies: [...old.replies, enriched] };
              }
            );
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === parentId ? { ...m, thread_count: (m.thread_count ?? 0) + 1 } : m))
          );
        }

        const isOwnForward =
          enriched.forwarded_from != null &&
          enriched.sender_id != null &&
          enriched.sender_id === user?.id;
        if (enriched.sender_id != null && enriched.sender_id === user?.id && !isOwnForward) {
          queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
          queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
          return;
        }
        const belongs =
          (activeChannelId && enriched.channel_id === activeChannelId) ||
          (activeDmId && enriched.dm_id === activeDmId);
        if (belongs) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === enriched.id)) return prev;
            return [...prev, enriched];
          });
          clearLocalUnread(queryClient, {
            channelId: activeChannelId,
            dmId: activeDmId,
          });
          void (activeChannelId
            ? markChannelRead(activeChannelId)
            : activeDmId
              ? markDmRead(activeDmId)
              : Promise.resolve());
          return;
        }
        queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
        queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
        queryClient.invalidateQueries({ queryKey: ['chat-unread-total'] });
        emitChatUnreadChanged();
      })();
    });

    socket.on('user_status_update', (payload: { userId: number; status_text: string | null; status_emoji: string | null }) => {
      queryClient.setQueryData<ChatUser[]>(['chat-users'], (old) =>
        old?.map((u) => (u.id === payload.userId ? { ...u, status_text: payload.status_text, status_emoji: payload.status_emoji } : u))
      );
      queryClient.invalidateQueries({ queryKey: ['chat-members'] });
      queryClient.setQueryData<ChatDm[]>(['chat-dms'], (old) =>
        old?.map((d) =>
          d.other_user?.id === payload.userId
            ? { ...d, other_user: { ...d.other_user, status_text: payload.status_text, status_emoji: payload.status_emoji } }
            : d
        )
      );
    });

    socket.on('chat:action_required', (payload: ActionRequiredAlert) => {
      setActionAlerts((prev) => {
        const id = payload.messageId || `${payload.channelId}-${Date.now()}`;
        if (prev.some((a) => a.messageId && a.messageId === payload.messageId)) return prev;
        return [{ ...payload, id }, ...prev].slice(0, 10);
      });
    });

    socket.on(
      'chat:mention',
      (payload: {
        title?: string;
        body?: string;
        url?: string;
        channelId?: string;
        dmId?: string;
      }) => {
        window.dispatchEvent(new CustomEvent('staff:notifications-changed'));
        emitChatUnreadChanged();
        const onThisThread =
          (payload.channelId && activeChannelId === payload.channelId) ||
          (payload.dmId && activeDmId === payload.dmId);
        if (onThisThread) {
          void markConversationRead({
            channelId: payload.channelId || null,
            dmId: payload.dmId || null,
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
          queryClient.invalidateQueries({ queryKey: ['chat-unread-total'] });
        }
      }
    );

    socket.on('message_edit', (updated: ChatMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
    });

    socket.on(
      'message_delete',
      ({ messageId }: { messageId: string; channelId?: string; dmId?: string; scope?: 'everyone' | 'self' }) => {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        setBookmarkedMessageIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ['chat-pins', activeChannelId, activeDmId] });
        queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
        queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
      }
    );

    const refreshChannels = () => {
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    };
    socket.on('chat:group_created', refreshChannels);
    socket.on('chat:added_to_group', refreshChannels);
    socket.on('chat:removed_from_group', refreshChannels);
    socket.on('pin_update', ({ channelId, dmId }: { channelId?: string; dmId?: string }) => {
      if (
        (activeChannelId && channelId === activeChannelId) ||
        (activeDmId && dmId === activeDmId)
      ) {
        queryClient.invalidateQueries({ queryKey: ['chat-pins', activeChannelId, activeDmId] });
      }
    });
    socket.on('chat:join_channel', ({ channelId }: { channelId: string }) => {
      socket.emit('chat:join_channel', { channelId });
      refreshChannels();
    });

    socket.on('reaction_update', ({ messageId, reactions }: { messageId: string; reactions: ChatMessage['reactions'] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    });

    socket.on('unread_increment', () => {
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
      queryClient.invalidateQueries({ queryKey: ['chat-unread-total'] });
    });

    socket.on('chat:typing', ({ userName, isTyping }: { userName: string; isTyping: boolean }) => {
      if (isTyping) {
        setTypingUser(userName);
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTypingUser(null), 3000);
      } else {
        setTypingUser(null);
      }
    });

    socket.on('presence_update', ({ onlineUserIds }: { onlineUserIds: number[] }) => {
      setOnlineIds(new Set(onlineUserIds));
    });

    socket.on('chat:join_dm', ({ dmId }: { dmId: string }) => {
      socket.emit('chat:join_dm', { dmId });
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, activeChannelId, activeDmId, queryClient, user?.id, enrichMessageWithForwardOrigin, markConversationRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChannelId, activeDmId]);

  useEffect(() => {
    const el = messagesTopRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingOlder && messages.length) {
          loadMessages({ before: messages[0].created_at, append: true });
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingOlder, messages, loadMessages]);

  useEffect(() => {
    setShowMessageSearch(false);
    setMessageSearchQuery('');
    setShowPinned(false);
    setShowMembers(false);
    setMemberFilterSearch('');
    setHighlightMessageId(null);
  }, [activeChannelId, activeDmId]);

  useEffect(() => {
    if (showMessageSearch) {
      messageSearchRef.current?.focus();
    }
  }, [showMessageSearch]);

  useEffect(() => {
    if (!showEmoji) return;
    const onDocClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showEmoji]);

  useEffect(() => {
    if (showPinned && (activeChannelId || activeDmId)) {
      refetchPins();
    }
  }, [showPinned, activeChannelId, activeDmId, refetchPins]);

  const canEditMessage = (msg: ChatMessage) => {
    if (msg.sender_id !== user?.id) return false;
    if (msg.message_type !== 'user') return false;
    if (msg.id.startsWith('temp-')) return false;
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    return ageMs <= 15 * 60 * 1000;
  };

  const canDeleteMessage = (msg: ChatMessage) => {
    if (msg.id.startsWith('temp-')) return false;
    return !!(activeChannelId || activeDmId);
  };

  const deleteScopeLabel = (msg: ChatMessage) => {
    if (msg.sender_id !== user?.id || msg.message_type !== 'user') return 'Delete for me';
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    return ageMs <= 24 * 60 * 60 * 1000 ? 'Delete' : 'Delete for me';
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditDraft(msg.body);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const handleSaveEdit = async (msg: ChatMessage) => {
    const body = editDraft.trim();
    if (!body) return;
    try {
      const updated = activeChannelId
        ? await editChatMessage({ channelId: activeChannelId, messageId: msg.id, body })
        : await editChatMessage({ dmId: activeDmId!, messageId: msg.id, body });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...updated } : m)));
      setEditingMessageId(null);
      setEditDraft('');
      toast({ title: 'Message updated' });
    } catch (e) {
      toast({
        title: 'Could not edit message',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteMessage = async (msg: ChatMessage) => {
    setPendingDelete({
      message: msg,
      channelId: activeChannelId,
      dmId: activeDmId,
    });
  };

  const handleConfirmDeleteMessage = async () => {
    if (!pendingDelete) return;
    const { message: msg, channelId, dmId } = pendingDelete;
    try {
      setDeletingMessageId(msg.id);
      const result = channelId
        ? await deleteChatMessage({ channelId, messageId: msg.id })
        : await deleteChatMessage({ dmId: dmId!, messageId: msg.id });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      setBookmarkedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(msg.id);
        return next;
      });
      setBookmarkIdByMessageId((prev) => {
        const next = new Map(prev);
        next.delete(msg.id);
        return next;
      });
      toast({
        title: result.scope === 'everyone' ? 'Message deleted' : 'Message removed from your chat',
      });
      await queryClient.invalidateQueries({ queryKey: ['chat-pins', activeChannelId, activeDmId] });
      await refetchBookmarks();
      setPendingDelete(null);
    } catch (e) {
      toast({
        title: 'Could not delete message',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleVoiceRecorded = (file: File) => {
    setPendingFiles((prev) => [...prev, file]);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleInsertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) {
      setInput((v) => v + emoji);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newVal = input.slice(0, start) + emoji + input.slice(end);
    setInput(newVal);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const searchQuery = deferredSearch;

  const coreChannels = useMemo(
    () =>
      channels
        .filter((c) => c.channel_type === 'general' || c.channel_type === 'announcements')
        .filter((c) => channelMatchesSearch(searchQuery, c))
        .sort((a, b) => {
          const rank = (c: ChatChannel) => (isCompanyGeneral(c) ? 0 : c.channel_type === 'announcements' ? 1 : 2);
          return rank(a) - rank(b);
        }),
    [channels, searchQuery]
  );

  const categoryChannels = useMemo(
    () =>
      channels
        .filter((c) => c.channel_type === 'category')
        .filter((c) => channelMatchesSearch(searchQuery, c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [channels, searchQuery]
  );

  const systemChannels = coreChannels;

  const recordThreads = useMemo(
    () => channels.filter((c) => c.record_type).filter((c) => channelMatchesSearch(searchQuery, c)),
    [channels, searchQuery]
  );

  const customUnitGroups = useMemo(
    () => channels.filter((c) => c.channel_type === 'unit' && !c.record_type).filter((c) => channelMatchesSearch(searchQuery, c)),
    [channels, searchQuery]
  );

  const unitGroups = customUnitGroups;

  const groupDms = useMemo(
    () => channels.filter((c) => c.channel_type === 'group_dm').filter((c) => channelMatchesSearch(searchQuery, c)),
    [channels, searchQuery]
  );

  const filteredDms = useMemo(
    () => dms.filter((d) => dmMatchesSearch(searchQuery, d)),
    [dms, searchQuery]
  );

  const matchingUsers = useMemo(() => {
    if (!searchQuery) return [];
    const dmUserIds = new Set(dms.map((d) => d.other_user?.id).filter(Boolean));
    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => !dmUserIds.has(u.id))
      .filter((u) => userMatchesSearch(searchQuery, u))
      .slice(0, 8);
  }, [searchQuery, users, dms, user?.id]);

  const filteredMembers = useMemo(() => {
    const q = memberFilterSearch.trim().toLowerCase();
    if (!q) return channelMembers;
    return channelMembers.filter(
      (m: ChatUser) =>
        m.name.toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
    );
  }, [channelMembers, memberFilterSearch]);

  const sidebarHasResults =
    !searchQuery ||
    coreChannels.length > 0 ||
    categoryChannels.length > 0 ||
    recordThreads.length > 0 ||
    unitGroups.length > 0 ||
    groupDms.length > 0 ||
    filteredDms.length > 0 ||
    matchingUsers.length > 0 ||
    globalMessageResults.length > 0;

  const activeCategoryHubName = useMemo(() => {
    if (!activeChannel) return null;
    if (activeChannel.channel_type === 'category') return activeChannel.name;
    return categoryHubForRecordType(activeChannel.record_type);
  }, [activeChannel]);

  const threadsForActiveCategory = useMemo(() => {
    if (!activeCategoryHubName) return [];
    const types = recordTypesForCategoryHub(activeCategoryHubName);
    return recordThreads.filter((t) => t.record_type && types.includes(t.record_type));
  }, [activeCategoryHubName, recordThreads]);

  useEffect(() => {
    if (activeCategoryHubName) {
      setExpandedCategories((prev) => ({ ...prev, [activeCategoryHubName]: true }));
    }
  }, [activeCategoryHubName]);

  const mentionPool = useMemo((): ChatUser[] => {
    if (activeDm?.other_user) {
      return [activeDm.other_user as ChatUser];
    }
    if (activeChannel?.channel_type === 'unit') {
      return channelMembers.filter((m: ChatUser) => m.id !== user?.id);
    }
    if (activeChannel) {
      return channelMembers.filter((m: ChatUser) => m.id !== user?.id);
    }
    return [];
  }, [activeChannel, activeDm, channelMembers, user?.id]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const matches = q ? mentionPool.filter((u) => u.name.toLowerCase().includes(q)) : mentionPool;
    return matches.slice(0, 30);
  }, [mentionQuery, mentionPool]);

  const selectChannel = (ch: ChatChannel) => {
    setActivePanelView('chat');
    setActiveChannelId(ch.id);
    setActiveDmId(null);
    setSearchParams({ channel: ch.id });
    setReplyTo(null);
    setShowContext(false);
    mobileNav.goToThread();
  };

  const selectVobiChannel = () => {
    if (!vobiChannelId) return;
    setActivePanelView('chat');
    setActiveChannelId(vobiChannelId);
    setActiveDmId(null);
    setSearchParams({ channel: vobiChannelId, vobi: '1' });
    setReplyTo(null);
    setShowContext(false);
    mobileNav.goToThread();
  };

  const openActionAlert = (alert: ActionRequiredAlert) => {
    setActivePanelView('chat');
    setActiveChannelId(alert.channelId);
    setActiveDmId(null);
    setSearchParams({ channel: alert.channelId });
    setActionAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    void markConversationRead({ channelId: alert.channelId });
    mobileNav.goToThread();
  };

  const selectDm = (dm: ChatDm) => {
    setActivePanelView('chat');
    setActiveDmId(dm.id);
    setActiveChannelId(null);
    setSearchParams({ dm: dm.id });
    setReplyTo(null);
    mobileNav.goToThread();
  };

  const openMessageResult = (msg: ChatMessage) => {
    if (msg.channel_id) {
      const ch = channels.find((c) => c.id === msg.channel_id);
      if (ch) selectChannel(ch);
    } else if (msg.dm_id) {
      const dm = dms.find((d) => d.id === msg.dm_id);
      if (dm) selectDm(dm);
    }
    setSidebarSearch('');
  };

  const openSavedPanel = () => {
    setActivePanelView('saved');
    setActiveChannelId(null);
    setActiveDmId(null);
    setSearchParams({ view: 'saved' });
    setShowMembers(false);
    setShowContext(false);
    setShowPinned(false);
    setShowMessageSearch(false);
    mobileNav.goToThread();
  };

  const emitTyping = (isTyping: boolean) => {
    const room = activeChannelId ? `channel:${activeChannelId}` : activeDmId ? `dm:${activeDmId}` : null;
    if (!room || !socketRef.current) return;
    socketRef.current.emit('chat:typing', {
      room,
      isTyping,
      userName: user?.full_name || user?.username,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    emitTyping(true);

    if (/^(@vobi|\/vobi)\s*$/i.test(val.trim())) {
      dispatchVobiOpen();
      setInput('');
      setMentionQuery(null);
      return;
    }

    const atMatch = val.match(/@([^\s@[\]()]*?)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (u: ChatUser) => {
    const replaced = input.replace(/@([^\s@[\]()]*?)$/, `@[${u.name}](${u.id}) `);
    setInput(replaced);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    const body = input.trim();
    if (!body && pendingFiles.length === 0) return;
    if (!canCompose) return;

    if (isVobiChatTrigger(body)) {
      dispatchVobiOpen(body.replace(/^(@vobi|\/vobi)\s*/i, '').trim() || undefined);
      setInput('');
      setMentionQuery(null);
      setReplyTo(null);
      return;
    }

    setSending(true);
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      body: body || '',
      sender_id: user?.id ?? null,
      sender_name: user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'You',
      sender_initials: (user?.full_name || user?.username || 'YO').slice(0, 2).toUpperCase(),
      sender_unit: user?.unit || null,
      sender_position: user?.position || null,
      sender_role: user?.role || null,
      sender_avatar_color: 'bg-blue-500',
      sender_avatar_url: user?.avatar_url || null,
      created_at: new Date().toISOString(),
      edited_at: null,
      message_type: 'user',
      reply_to: replyTo
        ? { id: replyTo.id, body: replyTo.body, sender_name: replyTo.sender_name }
        : null,
      attachments: [],
      reactions: [],
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setReplyTo(null);
    const files = [...pendingFiles];
    setPendingFiles([]);

    try {
      const saved = activeChannelId
        ? await sendChannelMessage(activeChannelId, body, replyTo?.id, files)
        : await sendDmMessage(activeDmId!, body, replyTo?.id, files);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== optimistic.id);
        if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp, saved];
      });
      queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      console.error('[chat] send failed', e);
      toast({
        title: 'Message not sent',
        description: e instanceof Error ? e.message : 'Something went wrong sending that.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (msg: ChatMessage, emoji: string) => {
    if (activeChannelId) {
      await reactToMessage(activeChannelId, msg.id, emoji);
    } else if (activeDmId) {
      await reactToDmMessage(activeDmId, msg.id, emoji);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!activeChannelId || !canManageGroups) return;
    try {
      await removeGroupMember(activeChannelId, memberId);
      await queryClient.invalidateQueries({ queryKey: ['chat-members', activeChannelId] });
      await queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleTogglePin = async (msg: ChatMessage) => {
    if (!activeChannelId && !activeDmId) return;
    if (msg.id.startsWith('temp-')) {
      toast({
        title: 'Please wait',
        description: 'Message is still sending — pin it once it appears in the chat.',
        variant: 'destructive',
      });
      return;
    }
    const isPinned = pinnedIds.has(msg.id);
    try {
      if (isPinned) {
        if (activeChannelId) {
          await unpinMessage({ channelId: activeChannelId, messageId: msg.id });
        } else {
          await unpinMessage({ dmId: activeDmId!, messageId: msg.id });
        }
        toast({ title: 'Message unpinned' });
      } else if (activeChannelId) {
        await pinMessage({ channelId: activeChannelId, messageId: msg.id });
        toast({ title: 'Message pinned' });
        setShowPinned(true);
      } else {
        await pinMessage({ dmId: activeDmId!, messageId: msg.id });
        toast({ title: 'Message pinned' });
        setShowPinned(true);
      }
      await queryClient.invalidateQueries({ queryKey: ['chat-pins', activeChannelId, activeDmId] });
    } catch (e) {
      toast({
        title: isPinned ? 'Could not unpin message' : 'Could not pin message',
        description: e instanceof Error ? e.message : 'Try again after refreshing the page.',
        variant: 'destructive',
      });
    }
  };

  const scrollToMessage = (msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
    setShowMessageSearch(false);
    setShowPinned(false);
    window.setTimeout(() => {
      const el = document.getElementById(`chat-msg-${msg.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightMessageId(msg.id);
        window.setTimeout(() => setHighlightMessageId(null), 2000);
      }
    }, 80);
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const created = await createUnitGroup({
        name,
        description: groupDescription.trim() || undefined,
        memberIds: groupMemberIds,
      });
      queryClient.setQueryData(['chat-channels'], (prev: ChatChannel[] | undefined) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((c) => c.id === created.id)) return list;
        return [created, ...list];
      });
      await queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      setShowCreateGroup(false);
      setGroupName('');
      setGroupDescription('');
      setGroupMemberIds([]);
      setGroupMemberSearch('');
      selectChannel(created);
      toast({ title: 'Group created', description: `# ${created.name}` });
    } catch (e) {
      toast({
        title: 'Could not create group',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleAddMembersToGroup = async (userIds: number[]) => {
    if (!activeChannelId || !userIds.length) return;
    setAddingMembers(true);
    try {
      await addGroupMembers(activeChannelId, userIds);
      await queryClient.invalidateQueries({ queryKey: ['chat-members', activeChannelId] });
      await queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      setAddMemberSearch('');
    } finally {
      setAddingMembers(false);
    }
  };

  const toggleGroupMember = (id: number) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleNewDm = async (target: ChatUser) => {
    const { dmId } = await createDm(target.id);
    await queryClient.invalidateQueries({ queryKey: ['chat-dms'] });
    setShowNewDm(false);
    setShowMembers(false);
    setDmSearch('');
    setActiveDmId(dmId);
    setActiveChannelId(null);
    setSearchParams({ dm: dmId });
  };

  const toggleGroupDmMember = (id: number) => {
    setGroupDmSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const closeNewDmModal = () => {
    setShowNewDm(false);
    setNewDmMode('single');
    setGroupDmSelectedIds([]);
    setDmSearch('');
  };

  const handleCreateGroupDm = async () => {
    if (groupDmSelectedIds.length < 2) return;
    setCreatingGroupDm(true);
    try {
      const { channelId } = await createGroupDm(groupDmSelectedIds);
      await queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
      closeNewDmModal();
      setActiveChannelId(channelId);
      setActiveDmId(null);
      setSearchParams({ channel: channelId });
    } catch (e) {
      toast({
        title: 'Could not start group chat',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingGroupDm(false);
    }
  };

  const openDmWithUser = async (target: ChatUser) => {
    if (target.id === user?.id) return;
    const existing = dms.find((d) => d.other_user?.id === target.id);
    setShowMembers(false);
    if (existing) {
      selectDm(existing);
      return;
    }
    try {
      await handleNewDm(target);
    } catch (e) {
      toast({
        title: 'Could not open direct message',
        description: e instanceof Error ? e.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const filteredDmUsers = useMemo(
    () =>
      users
        .filter((u) => u.id !== user?.id)
        .filter((u) => !deferredDmSearch || u.name.toLowerCase().includes(deferredDmSearch)),
    [users, user?.id, deferredDmSearch]
  );

  const flowMessages = useMemo(() => {
    if (!isCategoryHubView) return messages;
    return messages.filter((m) => m.message_type === 'system');
  }, [messages, isCategoryHubView]);

  const messageGroups = groupMessages(isCategoryHubView ? flowMessages : messages);

  const headerTitle = isVobiChannel
    ? 'Vobi · your work assistant'
    : activeChannel
      ? isCategoryHubView
        ? `# ${channelDisplayName(activeChannel)}`
        : activeChannel.record_type
          ? activeChannel.name
          : `# ${channelDisplayName(activeChannel)}`
      : activeDm?.other_user?.name || 'Direct Message';
  const headerSubtitle = isCompanyGeneral(activeChannel)
    ? 'Company-wide — everyone in Vobiss can see and post here'
    : activeChannel?.channel_type === 'announcements'
      ? 'Official updates for the whole company'
      : !activeChannel && activeDm?.other_user?.status_text
        ? `${activeDm.other_user.status_emoji || ''} ${activeDm.other_user.status_text}`.trim()
        : null;

  const renderChannelButton = (ch: ChatChannel) => {
    const active = ch.id === activeChannelId;
    const isAnnounce = ch.channel_type === 'announcements';
    const isUnit = ch.channel_type === 'unit' || ch.channel_type === 'group_dm';
    const isGeneral = isCompanyGeneral(ch);

    return (
      <button
        key={ch.id}
        type="button"
        onClick={() => selectChannel(ch)}
        className={`chat-channel-btn mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
          active ? 'chat-channel-btn--active' : ''
        }`}
      >
        {isAnnounce ? (
          <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        ) : isGeneral ? (
          <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
        ) : isUnit ? (
          <Users className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        ) : (
          <Hash className="h-3.5 w-3.5 shrink-0 text-gray-500" />
        )}
        <span className="flex-1 truncate">{channelDisplayName(ch)}</span>
        {isGeneral && (
          <span className="chat-general-pill rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-300">
            All
          </span>
        )}
        {ch.unread_count > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {ch.unread_count > 99 ? '99+' : ch.unread_count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      data-chat-theme={chatTheme}
      className={cn(
        'chat-app flex h-full min-h-0 w-full overflow-hidden bg-[#0f1117] text-gray-100',
        isMobile && 'h-[100dvh] max-h-[100dvh] chat-app--mobile',
        isMobile && mobileNav.isList && 'chat-app--mobile-list',
        isMobile && mobileNav.isThread && 'chat-app--mobile-thread'
      )}
    >
      <MobileWorkspaceNavDrawer
        open={mobileNav.navDrawerOpen}
        onClose={mobileNav.closeNavDrawer}
        unreadChat={chatUnreadTotal}
        theme={chatTheme}
      />

      {isMobile && (
        <MobileChatToasts
          alerts={actionAlerts}
          theme={chatTheme}
          onOpen={openActionAlert}
          onDismiss={(id) => setActionAlerts((prev) => prev.filter((a) => a.id !== id))}
        />
      )}

      {/* Chat channel sidebar — full screen on mobile (list view) */}
      <aside className="chat-sidebar flex w-[240px] shrink-0 flex-col border-r border-gray-800 bg-[#13151c]">
        <div className="chat-mobile-list-bar chat-mobile-only items-center border-b border-gray-800">
          <button
            type="button"
            className="chat-mobile-icon-btn"
            onClick={mobileNav.openNavDrawer}
            aria-label="Open workspace menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="chat-mobile-list-title truncate text-sm font-semibold">Vobiss Workspace</p>
            <p className="text-[11px] text-gray-500">Conversations</p>
          </div>
          {chatUnreadTotal > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {chatUnreadTotal > 99 ? '99+' : chatUnreadTotal}
            </span>
          )}
        </div>

        <div className="chat-side-header border-b border-gray-800 px-4 py-3">
          <Link
            to="/workspace"
            className="chat-back-btn mb-3 flex w-full items-center gap-2 rounded-lg border border-gray-700/80 bg-gray-800/40 px-2.5 py-2 text-xs font-medium text-gray-300 transition hover:border-gray-600 hover:bg-gray-800/70 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Back to workspace
          </Link>
          <div className="flex items-center gap-2.5">
            <img
              src="/vobiss-logo.png"
              alt="Vobiss"
              className="h-10 w-10 shrink-0 object-contain drop-shadow-md"
            />
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-white">Vobiss</h1>
              <p className="text-[11px] text-gray-500">Vobiss Workspace</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openStatusModal}
            className="mt-2.5 flex w-full items-center gap-1.5 rounded-md bg-gray-800/40 px-2 py-1.5 text-left text-xs text-gray-400 transition-colors hover:bg-gray-800/70 hover:text-gray-200"
          >
            {myStatus?.status_emoji ? (
              <span>{myStatus.status_emoji}</span>
            ) : (
              <Smile className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{myStatus?.status_text || 'Set a status'}</span>
          </button>
        </div>

        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-500" />
            <input
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Search channels, people"
              className="chat-search-input w-full rounded-lg border border-gray-700 bg-[#0f1117] py-2 pl-8 pr-2 text-xs text-gray-200 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <button
            type="button"
            onClick={openSavedPanel}
            className={`chat-channel-btn mb-2 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
              activePanelView === 'saved' ? 'chat-channel-btn--active' : ''
            }`}
          >
            <Bookmark
              className={`h-3.5 w-3.5 shrink-0 ${
                activePanelView === 'saved' ? 'text-amber-400' : 'text-gray-500'
              }`}
            />
            <span className="flex-1 truncate">Saved messages</span>
            {bookmarkCount > 0 && (
              <span className="rounded-full bg-gray-700/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-400">
                {bookmarkCount > 99 ? '99+' : bookmarkCount}
              </span>
            )}
          </button>

          {!sidebarHasResults && searchQuery ? (
            <p className="px-2 py-4 text-center text-xs text-gray-500">No channels or people match &ldquo;{sidebarSearch}&rdquo;</p>
          ) : null}

          {(coreChannels.length > 0 || categoryChannels.length > 0 || !searchQuery) && (
            <>
              <p className="chat-section-label px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Channels</p>
              {coreChannels.map(renderChannelButton)}
              {vobiChannelId && !searchQuery && (
                <button
                  type="button"
                  onClick={selectVobiChannel}
                  className={`chat-channel-btn mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
                    isVobiChannel ? 'chat-channel-btn--active' : ''
                  }`}
                >
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111827] ring-1 ring-[#1D9E75]/35">
                    <img
                      src="/vobi-logo.png"
                      alt=""
                      className="h-11 w-11 max-w-none object-cover object-left"
                      draggable={false}
                    />
                    {(vobiOverview?.pendingCount ?? 0) > 0 && (
                      <span className="vobi-pulse-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#1D9E75]" />
                    )}
                  </span>
                  <span className="flex-1 truncate">Vobi</span>
                  <span className="text-[10px] text-gray-500">assistant</span>
                </button>
              )}
              {categoryChannels.map((cat) => {
                const types = recordTypesForCategoryHub(cat.name);
                const threads = recordThreads.filter(
                  (t) => t.record_type && types.includes(t.record_type)
                );
                if (searchQuery && threads.length === 0 && !channelMatchesSearch(searchQuery, cat)) {
                  return null;
                }
                return (
                  <CategoryChannelRow
                    key={cat.id}
                    channel={cat}
                    threads={threads}
                    activeChannelId={activeChannelId}
                    expanded={expandedCategories[cat.name] ?? true}
                    onToggleExpand={() =>
                      setExpandedCategories((prev) => ({
                        ...prev,
                        [cat.name]: !(prev[cat.name] ?? true),
                      }))
                    }
                    onSelectHub={selectChannel}
                    onSelectThread={selectChannel}
                  />
                );
              })}
            </>
          )}

          {(unitGroups.length > 0 || !searchQuery) && (
            <>
              <div className="mt-4 flex items-center justify-between px-2 py-1">
                <p className="chat-section-label text-[10px] font-semibold uppercase tracking-wider text-gray-500">Unit Groups</p>
                {canManageGroups && (
                  <button
                    type="button"
                    onClick={() => setShowCreateGroup(true)}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                    title="Create unit group"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {unitGroups.length === 0 && !searchQuery ? (
                <p className="px-2 py-2 text-xs text-gray-600">No unit groups yet</p>
              ) : (
                unitGroups.map(renderChannelButton)
              )}
            </>
          )}

          {(groupDms.length > 0 || !searchQuery) && (
            <>
              <div className="mt-4 flex items-center justify-between px-2 py-1">
                <p className="chat-section-label text-[10px] font-semibold uppercase tracking-wider text-gray-500">Group Chats</p>
                <button
                  type="button"
                  onClick={() => {
                    setNewDmMode('group');
                    setShowNewDm(true);
                  }}
                  className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                  title="Start group chat"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {groupDms.length === 0 && !searchQuery ? (
                <p className="px-2 py-2 text-xs text-gray-600">No group chats yet</p>
              ) : (
                groupDms.map(renderChannelButton)
              )}
            </>
          )}

          {(filteredDms.length > 0 || !searchQuery) && (
            <>
              <p className="chat-section-label mt-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Direct Messages
              </p>
              {filteredDms.map((dm) => {
            const active = dm.id === activeDmId;
            const other = dm.other_user;
            const online = other && onlineIds.has(other.id);
            return (
              <button
                key={dm.id}
                type="button"
                onClick={() => selectDm(dm)}
                className={`chat-channel-btn mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-150 ${
                  active ? 'chat-channel-btn--active' : ''
                } ${dm.unread_count > 0 ? 'font-semibold' : ''}`}
              >
                <div className="relative shrink-0">
                  <UserAvatar
                    src={other?.avatar_url}
                    name={other?.name}
                    colorClass={other?.avatar_color || 'bg-slate-500'}
                    className="h-7 w-7 text-[10px] font-bold"
                  />
                  <span
                    className={`chat-online-ring absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#13151c] ${
                      online ? 'bg-emerald-400' : 'bg-gray-500'
                    }`}
                  />
                </div>
                <span className="flex-1 truncate">{other?.name || 'Unknown'}</span>
                {other?.status_emoji && (
                  <span className="shrink-0 text-xs" title={other.status_text || undefined}>
                    {other.status_emoji}
                  </span>
                )}
                {dm.unread_count > 0 && (
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}
            </>
          )}

          {matchingUsers.length > 0 && (
            <>
              <p className="chat-section-label mt-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                People
              </p>
              {matchingUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleNewDm(u)}
                  className="chat-people-btn mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-800/60"
                >
                  <UserAvatar
                    src={u.avatar_url}
                    name={u.name}
                    colorClass={u.avatar_color}
                    className="h-7 w-7 text-[10px] font-bold"
                  />
                  <span className="flex-1 truncate">{u.name}</span>
                  <span className="text-[10px] text-blue-400">Message</span>
                </button>
              ))}
            </>
          )}

          {globalMessageResults.length > 0 && (
            <>
              <p className="chat-section-label mt-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Messages
              </p>
              {globalMessageResults.map((msg) => {
                const source = msg.channel_id
                  ? channels.find((c) => c.id === msg.channel_id)
                  : dms.find((d) => d.id === msg.dm_id);
                const sourceName = msg.channel_id
                  ? (source as ChatChannel | undefined)?.name || 'Channel'
                  : (source as ChatDm | undefined)?.other_user?.name || 'Direct message';
                return (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => openMessageResult(msg)}
                    className="mb-0.5 flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-[13px] text-gray-300 hover:bg-gray-800/60"
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-[10px] text-gray-500">
                      <span className="truncate font-medium text-gray-400">{sourceName}</span>
                      <span className="shrink-0">{msg.sender_name}</span>
                    </span>
                    <span className="line-clamp-2 w-full truncate text-gray-300">{msg.body}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="border-t border-gray-800 p-3 space-y-2">
          {canManageGroups && (
            <button
              type="button"
              onClick={() => setShowCreateGroup(true)}
              className="chat-dashed-btn flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-600 py-2 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Create unit group
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNewDmMode('single');
              setShowNewDm(true);
            }}
            className="chat-dashed-btn flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-600 py-2 text-xs text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-200"
          >
            <Plus className="h-3.5 w-3.5" />
            New direct message
          </button>
        </div>
      </aside>

      {/* MAIN CHAT — full screen on mobile (thread view) */}
      <div ref={swipeBackRef} className="chat-main chat-panel flex min-w-0 flex-1 flex-col bg-[#0f1117] md:flex-row">
        {showMembers && activeChannel && (
          <aside
            ref={membersPanelRef}
            className="chat-members-panel flex w-72 shrink-0 flex-col border-r border-gray-800 bg-[#13151c]"
          >
            <div className="chat-panel-header flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <div>
                <p className="chat-members-title text-sm font-semibold text-white">Members</p>
                <p className="text-[11px] text-gray-500">#{activeChannel.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMembers(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-gray-800 px-3 py-2">
              <input
                placeholder="Filter members…"
                value={memberFilterSearch}
                onChange={(e) => setMemberFilterSearch(e.target.value)}
                className="chat-field-input w-full rounded-md border border-gray-700 bg-[#0f1117] px-2.5 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {activeChannel.channel_type === 'unit' && canManageGroups && (
              <div className="border-b border-gray-800 p-3">
                <input
                  placeholder="Add members…"
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  className="mb-2 w-full rounded-md border border-gray-700 bg-[#0f1117] px-2.5 py-1.5 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
                />
                <div className="max-h-28 overflow-y-auto">
                  {users
                    .filter((u) => u.id !== user?.id)
                    .filter((u) => !channelMembers.some((m: ChatUser) => m.id === u.id))
                    .filter((u) => u.name.toLowerCase().includes(addMemberSearch.toLowerCase()))
                    .slice(0, 6)
                    .map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={addingMembers}
                        onClick={() => handleAddMembersToGroup([u.id])}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-800"
                      >
                        <span className="truncate text-white">{u.name}</span>
                        <Plus className="ml-auto h-3 w-3 shrink-0 text-gray-400" />
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto py-2">
              {filteredMembers.map((m: ChatUser & { channel_role?: string }) => (
                <div
                  key={m.id}
                  className="group/member flex items-center gap-1 px-2 py-0.5"
                >
                  <button
                    type="button"
                    onClick={() => openDmWithUser(m)}
                    disabled={m.id === user?.id}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-gray-800/60 disabled:cursor-default disabled:opacity-60"
                    title={m.id === user?.id ? 'This is you' : `Message ${m.name}`}
                  >
                    <UserAvatar
                      src={m.avatar_url}
                      name={m.name}
                      colorClass={m.avatar_color}
                      className="h-8 w-8 shrink-0 text-[10px] font-bold"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{m.name}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {m.status_text ? `${m.status_emoji || ''} ${m.status_text}`.trim() : m.role}
                      </p>
                    </div>
                    {onlineIds.has(m.id) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Online" />
                    )}
                    {m.id !== user?.id && (
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-gray-500 opacity-0 transition-opacity group-hover/member:opacity-100" />
                    )}
                  </button>
                  {canManageGroups &&
                    activeChannel.channel_type === 'unit' &&
                    m.id !== user?.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMember(m.id);
                        }}
                        className="shrink-0 rounded p-1 text-gray-500 hover:bg-red-500/20 hover:text-red-400"
                        title="Remove member"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    )}
                </div>
              ))}
            </div>
          </aside>
        )}

        <div className="chat-panel-stack flex min-h-0 min-w-0 flex-1 flex-col">
        <ActionRequiredBanner
          alerts={actionAlerts}
          onOpen={openActionAlert}
          onDismiss={(id) => setActionAlerts((prev) => prev.filter((a) => a.id !== id))}
        />
        {activePanelView === 'saved' ? (
          <SavedMessagesPanel
            onClose={() => {
              setActivePanelView('chat');
              const general = channels.find((c) => c.name === 'general');
              if (general) {
                setActiveChannelId(general.id);
                setSearchParams({ channel: general.id });
              } else {
                setSearchParams({});
              }
            }}
            onGoToMessage={handleGoToBookmark}
            onBookmarksChange={() => refetchBookmarks()}
          />
        ) : (
        <>
        {/* Header */}
        <div className="chat-topbar flex items-center justify-between gap-2 border-b border-gray-800 px-3 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
            {isMobile && mobileNav.isThread && (
              <button
                type="button"
                onClick={handleMobileBackToList}
                className="chat-mobile-back-btn chat-mobile-icon-btn shrink-0 rounded-lg"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {onToggleMainNav && (
              <button
                type="button"
                onClick={onToggleMainNav}
                className={`chat-icon-btn chat-desktop-only shrink-0 rounded-lg p-2 ${
                  mainNavHidden ? 'chat-icon-btn--active' : ''
                }`}
                title={mainNavHidden ? 'Show main navigation' : 'Hide main navigation'}
              >
                {mainNavHidden ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            )}
            {isVobiChannel && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#111827] ring-1 ring-[#1D9E75]/35">
                <img
                  src="/vobi-logo.png"
                  alt=""
                  className="h-11 w-11 max-w-none object-cover object-left"
                  draggable={false}
                />
              </span>
            )}
            {isRecordThread && activeChannel?.record_type && (
              <RecordTypeBadge type={activeChannel.record_type} />
            )}
            {isCompanyGeneral(activeChannel) && (
              <span className="chat-general-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
                <Globe className="h-4 w-4 text-sky-400" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="chat-topbar-title min-w-0 truncate text-white">{headerTitle}</h2>
              {headerSubtitle && (
                <p className="chat-topbar-sub hidden min-w-0 truncate text-[11px] text-gray-500 sm:block">
                  {headerSubtitle}
                </p>
              )}
            </div>
          </div>
          <div className="chat-topbar-actions--compact flex shrink-0 items-center gap-0.5">
            {isRecordThread && threadsForActiveCategory.length > 1 && (
                <ThreadSwitcherMenu
                  threads={threadsForActiveCategory}
                  activeChannelId={activeChannelId}
                  onSelect={selectChannel}
                />
              )}
            <button
              type="button"
              onClick={() => {
                setShowMessageSearch((v) => !v);
                setShowPinned(false);
                if (showMessageSearch) setMessageSearchQuery('');
              }}
              className={`chat-icon-btn rounded-lg p-2 ${
                showMessageSearch ? 'chat-icon-btn--active' : ''
              }`}
              title="Search messages"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPinned((v) => !v);
                setShowMessageSearch(false);
              }}
              className={`chat-icon-btn relative rounded-lg p-2 ${
                showPinned ? 'chat-icon-btn--active' : ''
              }`}
              title="Pinned messages"
            >
              <Pin className="h-4 w-4" />
              {pinnedMessages.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-black">
                  {pinnedMessages.length > 9 ? '9+' : pinnedMessages.length}
                </span>
              )}
            </button>
            {activeChannel && (
              <button
                type="button"
                onClick={() => {
                  setShowMembers((v) => !v);
                  setShowContext(false);
                  setShowPinned(false);
                  setShowMessageSearch(false);
                }}
                className={`chat-icon-btn rounded-lg p-2 ${
                  showMembers ? 'chat-icon-btn--active' : ''
                }`}
                title="Members"
              >
                <Users className="h-4 w-4" />
              </button>
            )}
            {activeChannel && hasRecordContext && (
              <button
                type="button"
                onClick={() => {
                  setShowContext((v) => !v);
                  setShowMembers(false);
                  setShowPinned(false);
                  setShowMessageSearch(false);
                }}
                className={`chat-icon-btn rounded-lg p-2 ${
                  showContext ? 'chat-icon-btn--active' : ''
                }`}
                title="Record details"
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleChatTheme}
              className="chat-icon-btn chat-desktop-only rounded-lg p-2"
              title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
            {isMobile && (
              <button
                type="button"
                onClick={mobileNav.openNavDrawer}
                className="chat-mobile-icon-btn chat-icon-btn rounded-lg p-2 md:hidden"
                aria-label="Workspace menu"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {hasRecordContext && isRecordThread && (
          <RecordContextBar
            context={recordContext}
            loading={contextLoading}
            onOpenPanel={() => {
              setShowContext(true);
              setShowMembers(false);
            }}
          />
        )}

        {showMessageSearch && (activeChannelId || activeDmId) && (
          <div className="chat-search-panel border-b border-gray-800 bg-[#13151c] px-5 py-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                ref={messageSearchRef}
                value={messageSearchQuery}
                onChange={(e) => setMessageSearchQuery(e.target.value)}
                placeholder="Search in this conversation…"
                className="chat-field-input w-full rounded-lg border border-gray-700 bg-[#0f1117] py-2 pl-9 pr-8 text-sm text-gray-200 placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setShowMessageSearch(false);
                  setMessageSearchQuery('');
                }}
                className="absolute right-2 top-2 rounded p-0.5 text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {messageSearchQuery.trim().length >= 1 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-[#0f1117]">
                {searchingMessages && combinedSearchResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>
                ) : combinedSearchResults.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-500">No messages found</p>
                ) : (
                  combinedSearchResults.map((msg) => (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => scrollToMessage(msg)}
                      className="chat-search-result flex w-full flex-col gap-0.5 border-b border-gray-800/60 px-3 py-2 text-left last:border-0 hover:bg-gray-800/50"
                    >
                      <span className="text-[11px] font-medium text-gray-400">
                        {msg.sender_name} · {formatTime(msg.created_at)}
                      </span>
                      <span className="line-clamp-2 text-sm text-gray-200">
                        {messagePreviewText(msg)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {showPinned && (activeChannelId || activeDmId) && (
          <div className="chat-pinned-panel border-b border-gray-800 bg-[#13151c] px-5 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="chat-pinned-title text-sm font-medium text-white">Pinned messages</p>
              <button
                type="button"
                onClick={() => setShowPinned(false)}
                className="rounded p-1 text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {pinnedMessages.length === 0 ? (
              <p className="text-xs text-gray-500">No pinned messages yet. Hover a message and click Pin.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800 bg-[#0f1117]">
                {pinnedMessages.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => scrollToMessage(msg)}
                    className="chat-pinned-item flex w-full items-start gap-2 border-b border-gray-800/60 px-3 py-2 text-left last:border-0 hover:bg-gray-800/50"
                  >
                    <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-gray-400">
                        {msg.sender_name} · {formatTime(msg.created_at)}
                      </span>
                      <p className="line-clamp-2 text-sm text-gray-200">
                        {messagePreviewText(msg)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isCategoryHubView && activeChannel && (
          <CategoryHubFlowBanner hubLabel={`#${channelDisplayName(activeChannel)}`} />
        )}

        {isVobiChannel && vobiChannelId ? (
          <VobiChatView channelId={vobiChannelId} />
        ) : (
        <>
        {/* Messages */}
        <div className="chat-messages min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3 sm:px-5">
          <div ref={messagesTopRef} className="h-1" />
          {loadingOlder && (
            <p className="mb-4 text-center text-xs text-gray-500">Loading older messages…</p>
          )}
          {isCategoryHubView && !loadingOlder && flowMessages.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">
              No activity yet. Updates from tickets and requests will show here.
            </p>
          )}
          {!isCategoryHubView && !loadingOlder && messages.length === 0 && isCompanyGeneral(activeChannel) && (
            <div className="chat-general-welcome mx-auto mt-8 max-w-md rounded-2xl border border-sky-500/20 bg-sky-500/5 px-6 py-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15">
                <Globe className="h-6 w-6 text-sky-400" />
              </span>
              <h3 className="chat-general-welcome-title mt-4 text-base font-semibold text-white">Welcome to General</h3>
              <p className="chat-general-welcome-copy mt-2 text-sm leading-relaxed text-gray-400">
                This is the company-wide channel. Everyone in Vobiss can see it and post here — say hello, share an update, or ask the team.
              </p>
            </div>
          )}

          {(() => {
            let messageFlatIndex = 0;
            return messageGroups.map((group) => (
            <div key={group.key}>
              <div className="my-5 flex justify-center">
                <span className="chat-date-pill">{formatDateDivider(group.date)}</span>
              </div>
              {group.items.map((msgGroup, gi) => {
                const first = msgGroup[0];
                if (first.message_type === 'system') {
                  return msgGroup.map((sysMsg) => (
                    <RecordSystemMessage
                      key={`sys-${sysMsg.id}`}
                      msg={sysMsg}
                      canAct={
                        false
                      }
                      recordStatus={recordContext?.status}
                      onAction={handleChatAction}
                      actionLoading={actionLoadingId === sysMsg.id}
                    />
                  ));
                }

                const index = messageFlatIndex;
                messageFlatIndex += msgGroup.length;
                const isNewGroup =
                  index === 0 || messages[index - 1].sender_id !== first.sender_id;

                return (
                  <div
                    key={`grp-${first.id}-${gi}`}
                    className={`chat-msg-group ${isNewGroup ? 'chat-msg-group--spaced' : ''}`}
                  >
                    {msgGroup.map((msg, mi) => {
                      const isEditing = editingMessageId === msg.id;
                      const isOwn = msg.sender_id === user?.id;
                      const showHeader = mi === 0;

                      return (
                      <div
                        key={msg.id}
                        id={`chat-msg-${msg.id}`}
                        className={`chat-msg-row group/msg ${mi > 0 ? 'chat-msg-row--continued' : ''}`}
                      >
                        {showHeader ? (
                          <UserAvatar
                            src={msg.sender_avatar_url}
                            name={msg.sender_name}
                            colorClass={msg.sender_avatar_color}
                            className="chat-msg-avatar text-[11px] font-bold"
                          />
                        ) : (
                          <>
                            <span className="chat-msg-time chat-msg-time--hover">{formatTime(msg.created_at)}</span>
                            <div className="chat-msg-avatar-spacer" />
                          </>
                        )}
                        <div className="chat-msg-content">
                          {showHeader && (
                            <div className="chat-msg-header">
                              <span className="chat-msg-sender">{msg.sender_name}</span>
                              <span className={`chat-msg-role ${roleBadgeClass(formatSenderBadge(msg))}`}>
                                {formatSenderBadge(msg)}
                              </span>
                              <span className="chat-msg-time chat-msg-time--inline">
                                {formatTime(msg.created_at)}
                                {msg.edited_at ? ' · edited' : ''}
                              </span>
                            </div>
                          )}
                          {isEditing ? (
                            <div className="chat-msg-bubble chat-msg-bubble--edit">
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="chat-edit-area w-full resize-none rounded-lg border border-gray-600 bg-[#0f1117] px-3 py-2 text-[13px] leading-[1.6] text-gray-200 focus:border-blue-500 focus:outline-none"
                              />
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(msg)}
                                  className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="rounded-md px-3 py-1 text-xs text-gray-400 hover:bg-gray-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              className={`chat-msg-bubble ${
                                isOwn ? 'chat-msg-bubble--own' : ''
                              } ${
                                highlightMessageId === msg.id ? 'chat-msg-bubble--highlight' : ''
                              } ${
                                isMobile && activeMobileActionsMessageId === msg.id
                                  ? 'chat-msg-bubble--actions-open'
                                  : ''
                              }`}
                              onClick={(event) => {
                                if (!isMobile) return;
                                const target = event.target as HTMLElement;
                                if (target.closest('button, a, input, textarea, select')) return;
                                setActiveMobileActionsMessageId((current) =>
                                  current === msg.id ? null : msg.id
                                );
                              }}
                            >
                              {msg.reply_to && showHeader && (
                                <div className="chat-reply-quote mb-1 border-l-2 border-gray-700/60 pl-2 text-xs text-gray-500">
                                  Replying to {msg.reply_to.sender_name}: {msg.reply_to.body.slice(0, 80)}
                                </div>
                              )}
                              {msg.forwardedOrigin && (
                                <ForwardedOriginBanner origin={msg.forwardedOrigin} />
                              )}
                              {msg.message_type === 'shared_record' && msg.meta?.sharedRecord ? (
                                <SharedRecordCard sharedRecord={msg.meta.sharedRecord} />
                              ) : (
                                shouldShowMessageBody(msg) && (
                                  <p className="chat-msg-body whitespace-pre-wrap">
                                    {renderBody(msg.body)}
                                  </p>
                                )
                              )}
                              {(activeChannelId || activeDmId) && (
                                <div
                                  className={`chat-hover-actions invisible flex shrink-0 items-center gap-0.5 rounded-md border border-gray-700/80 bg-[#1a1d27] p-0.5 opacity-0 shadow-sm group-hover/msg:visible group-hover/msg:opacity-100 ${
                                    isMobile && activeMobileActionsMessageId === msg.id
                                      ? 'chat-hover-actions--open'
                                      : ''
                                  }`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {COMMON_EMOJIS.slice(0, 4).map((e) => (
                                    <button
                                      key={e}
                                      type="button"
                                      onClick={() => handleReact(msg, e)}
                                      className="rounded px-1 py-0.5 text-sm hover:bg-gray-700/80"
                                    >
                                      {e}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setReplyTo(msg)}
                                    className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700/80"
                                    title="Reply"
                                  >
                                    Reply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setForwardingMessage(msg)}
                                    className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700/80"
                                    title="Forward"
                                  >
                                    <Forward className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleBookmark(msg)}
                                    className={`rounded px-1.5 py-0.5 text-[10px] hover:bg-gray-700/80 ${
                                      bookmarkedMessageIds.has(msg.id)
                                        ? 'text-amber-400'
                                        : 'text-gray-400'
                                    }`}
                                    title={
                                      bookmarkedMessageIds.has(msg.id)
                                        ? 'Remove bookmark'
                                        : 'Save message'
                                    }
                                  >
                                    <Bookmark
                                      className={`h-3 w-3 ${
                                        bookmarkedMessageIds.has(msg.id) ? 'fill-current' : ''
                                      }`}
                                    />
                                  </button>
                                  {canEditMessage(msg) && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(msg)}
                                      className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-700/80"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePin(msg)}
                                    className={`rounded px-1.5 py-0.5 text-[10px] hover:bg-gray-700/80 ${
                                      pinnedIds.has(msg.id) ? 'text-amber-400' : 'text-gray-400'
                                    }`}
                                    title={pinnedIds.has(msg.id) ? 'Unpin' : 'Pin'}
                                  >
                                    Pin
                                  </button>
                                  {canDeleteMessage(msg) && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteMessage(msg)}
                                      className="rounded px-1.5 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                      title={deleteScopeLabel(msg)}
                                    >
                                      {deleteScopeLabel(msg)}
                                    </button>
                                  )}
                                </div>
                              )}
                              {msg.attachments?.map((a) => (
                                <ChatAttachment
                                  key={a.id}
                                  attachment={a}
                                  onImageClick={setLightboxUrl}
                                />
                              ))}
                              {msg.reactions.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {msg.reactions.map((r) => (
                                    <button
                                      key={r.emoji}
                                      type="button"
                                      onClick={() => handleReact(msg, r.emoji)}
                                      className={`chat-reaction rounded-full border px-2 py-0.5 text-xs transition-colors duration-150 ${
                                        r.reacted_by_me
                                          ? 'chat-reaction--mine border-blue-500/50 bg-blue-500/20'
                                          : 'border-gray-700/60 bg-gray-800/40 hover:bg-gray-800/70'
                                      }`}
                                    >
                                      {r.emoji} {r.count}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {(msg.thread_count ?? 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => openThread(msg)}
                                  className="mt-1 flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                                >
                                  <MessageCircle className="h-3 w-3" />
                                  {msg.thread_count} {msg.thread_count === 1 ? 'reply' : 'replies'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                );
              })}
            </div>
          ));
          })()}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUser && (
          <p className="chat-typing px-5 pb-1 text-xs italic text-gray-500">{typingUser} is typing…</p>
        )}

        {/* Input — hidden on category hubs (activity feed only; chat in sidebar threads) */}
        {canCompose ? (
        <div
          ref={inputAreaRef}
          className="chat-composer relative shrink-0 border-t border-gray-800 px-4 py-3 sm:px-5 max-md:py-0 max-md:pt-2 max-md:px-2"
        >
          {replyTo && (
            <div className="mb-2 flex items-center justify-between rounded-md bg-gray-800/40 px-3 py-1.5 text-xs text-gray-400">
              <span>Replying to {replyTo.sender_name}</span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-gray-500 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className="mb-2 space-y-2">
              {pendingFiles.some((f) => f.type.startsWith('audio/')) && (
                <div className="space-y-2">
                  {pendingFiles.map((f, i) =>
                    f.type.startsWith('audio/') ? (
                      <PendingAudioPreview
                        key={`${f.name}-${i}`}
                        file={f}
                        onRemove={() => removePendingFile(i)}
                      />
                    ) : null
                  )}
                </div>
              )}
              {pendingFiles.some((f) => !f.type.startsWith('audio/')) && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pendingFiles.map((f, i) =>
                    f.type.startsWith('audio/') ? null : f.type.startsWith('image/') ? (
                      <PendingImagePreview
                        key={`${f.name}-${i}`}
                        file={f}
                        onRemove={() => removePendingFile(i)}
                      />
                    ) : f.type.startsWith('video/') ? (
                      <PendingVideoPreview
                        key={`${f.name}-${i}`}
                        file={f}
                        onRemove={() => removePendingFile(i)}
                      />
                    ) : (
                      <PendingFileChip
                        key={`${f.name}-${i}`}
                        file={f}
                        onRemove={() => removePendingFile(i)}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}
          {voiceRecording && (
            <p className="mb-2 text-xs text-red-300">Recording voice message…</p>
          )}
          <div className="chat-composer-box">
            <div className="chat-composer-input-row relative flex items-end gap-1.5 px-2.5 py-2 sm:px-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="chat-mobile-plus-btn hidden shrink-0 items-center justify-center"
                title="Upload image or take photo"
                aria-label="Upload image or take photo"
              >
                <Plus className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="chat-toolbar-btn chat-attach-toolbar-btn mb-0.5 shrink-0 rounded-md p-1.5"
                title="Attach"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={
                  activeChannel
                    ? `Message ${isCompanyGeneral(activeChannel) || activeChannel.channel_type === 'announcements' ? channelDisplayName(activeChannel) : `#${activeChannel.name}`}…`
                    : activeDm
                      ? `Message ${activeDm.other_user?.name || ''}…`
                      : 'Select a conversation…'
                }
                disabled={!canCompose}
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-gray-200 placeholder:text-gray-500 focus:outline-none"
              />
              <div ref={emojiPickerRef} className="relative mb-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEmoji((v) => !v)}
                  className={`chat-toolbar-btn rounded-md p-1.5 ${
                    showEmoji ? 'chat-toolbar-btn--active' : ''
                  }`}
                  title="Emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                {showEmoji && (
                  <div className="chat-popover absolute bottom-full right-0 z-30 mb-2 w-72 overflow-hidden rounded-xl border border-gray-600 bg-[#1a1d27] shadow-xl">
                    <div className="border-b border-gray-700 px-3 py-2">
                      <p className="text-xs font-medium text-gray-300">Emoji</p>
                    </div>
                    <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
                      {[...new Set(EMOJI_PICKER)].map((e) => (
                        <button
                          key={e}
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-xl transition-colors duration-150 hover:bg-gray-700/80"
                          onClick={() => handleInsertEmoji(e)}
                          title={e}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="mb-0.5 shrink-0">
                <ChatVoiceRecorder
                  disabled={!canCompose}
                  onRecorded={handleVoiceRecorded}
                  onRecordingChange={setVoiceRecording}
                />
              </div>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!input.trim() && pendingFiles.length === 0)}
                className="chat-send-btn mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {mentionQuery !== null && mentionCandidates.length > 0 && (
            <div className="chat-mention-menu absolute bottom-full left-4 z-20 mb-1 max-w-[200px] overflow-hidden rounded-lg border border-gray-700 bg-[#1a1d27] shadow-lg">
              {mentionCandidates.map((u, i) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => insertMention(u)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-800 ${
                    i === mentionIndex ? 'bg-gray-800' : ''
                  }`}
                >
                  <UserAvatar
                    src={u.avatar_url}
                    name={u.name}
                    colorClass={u.avatar_color}
                    className="h-5 w-5 shrink-0 text-[9px]"
                  />
                  <span className="truncate text-xs text-gray-200">{u.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        ) : isCategoryHubView ? (
          <div className="chat-composer-hint shrink-0 border-t border-gray-800 px-4 py-3 sm:px-5">
            <p className="text-center text-xs text-gray-500">
              Open a thread under{' '}
              <span className="font-medium text-gray-400">#{activeChannel?.name}</span> in the list to chat.
            </p>
          </div>
        ) : null}
        </>
        )}
        {showContext && !activeThreadRootId && activeChannel && hasRecordContext && activePanelView === 'chat' && !isVobiChannel && (
          <aside className="chat-context-panel flex w-72 shrink-0 flex-col border-l border-gray-800 bg-[#13151c]">
            <div className="chat-panel-header flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <div>
                <p className="chat-members-title text-sm font-semibold text-white">
                  {recordContextTitle(activeChannel.record_type, activeChannel.record_id)}
                </p>
                <p className="text-[11px] text-gray-500">Linked record</p>
              </div>
              <button
                type="button"
                onClick={() => setShowContext(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {contextLoading ? (
                <p className="text-xs text-gray-500">Loading…</p>
              ) : recordContext ? (
                <div className="chat-context-card rounded-lg border border-gray-700/80 bg-[#0f1117] p-3">
                  <p className="mb-1 text-sm font-medium text-white">{recordContext.title}</p>
                  <p className="mb-3 text-[11px] uppercase tracking-wide text-gray-500">{recordContext.status}</p>
                  <dl className="space-y-2 text-xs">
                    <div>
                      <dt className="text-gray-500">Requester</dt>
                      <dd className="text-gray-200">{recordContext.requester || '—'}</dd>
                    </div>
                    {recordContext.assignee && (
                      <div>
                        <dt className="text-gray-500">Assignee</dt>
                        <dd className="text-gray-200">{recordContext.assignee}</dd>
                      </div>
                    )}
                    {recordContext.key_fields?.map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="text-gray-200">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <Link
                    to={recordContext.linkUrl}
                    className="mt-4 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open full record
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Could not load record details.</p>
              )}
            </div>
          </aside>
        )}
        </>
        )}

        {activeThreadRootId && (
          <aside className="chat-context-panel flex w-80 shrink-0 flex-col border-l border-gray-800 bg-[#13151c]">
            <div className="chat-panel-header flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <p className="chat-members-title text-sm font-semibold text-white">Thread</p>
              <button
                type="button"
                onClick={() => setActiveThreadRootId(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {threadLoading && !threadRoot ? (
                <p className="text-xs text-gray-500">Loading…</p>
              ) : threadRoot ? (
                <>
                  <div className="mb-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        src={threadRoot.sender_avatar_url}
                        name={threadRoot.sender_name}
                        colorClass={threadRoot.sender_avatar_color}
                        className="h-6 w-6 text-[10px] font-bold"
                      />
                      <span className="text-xs font-semibold text-white">{threadRoot.sender_name}</span>
                      <span className="text-[10px] text-gray-500">{formatTime(threadRoot.created_at)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{renderBody(threadRoot.body)}</p>
                  </div>
                  <p className="mb-2 border-t border-gray-800 pt-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {threadReplies.length} {threadReplies.length === 1 ? 'reply' : 'replies'}
                  </p>
                  <div className="space-y-3">
                    {threadReplies.map((reply) => (
                      <div key={reply.id}>
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            src={reply.sender_avatar_url}
                            name={reply.sender_name}
                            colorClass={reply.sender_avatar_color}
                            className="h-6 w-6 text-[10px] font-bold"
                          />
                          <span className="text-xs font-semibold text-white">{reply.sender_name}</span>
                          <span className="text-[10px] text-gray-500">{formatTime(reply.created_at)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">{renderBody(reply.body)}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">Could not load this thread.</p>
              )}
            </div>
            {canCompose && threadRoot && (
              <div className="border-t border-gray-800 p-3">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(threadRoot);
                    inputRef.current?.focus();
                  }}
                  className="w-full rounded-md bg-gray-800/60 px-3 py-2 text-left text-xs text-gray-400 hover:bg-gray-800"
                >
                  Reply in thread…
                </button>
              </div>
            )}
          </aside>
        )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          setPendingFiles((prev) => [...prev, ...files]);
          e.target.value = '';
        }}
      />

      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          channels={channels}
          dms={dms}
          onlineIds={onlineIds}
          onClose={() => setForwardingMessage(null)}
          onForwardComplete={handleForwardComplete}
        />
      )}

      {/* Create unit group modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="chat-modal-panel w-full max-w-md rounded-xl border border-gray-700 bg-[#13151c] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="chat-modal-title font-semibold text-white">Create unit group</h3>
              <button type="button" onClick={() => setShowCreateGroup(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              placeholder="Group name (e.g. Finance Team)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            />
            <input
              placeholder="Description (optional)"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            />
            <input
              placeholder="Search members to add…"
              value={groupMemberSearch}
              onChange={(e) => setGroupMemberSearch(e.target.value)}
              className="mb-2 w-full rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            />
            <div className="chat-modal-list mb-3 max-h-48 overflow-y-auto rounded-lg border border-gray-800">
              {users
                .filter((u) => u.id !== user?.id)
                .filter((u) => u.name.toLowerCase().includes(groupMemberSearch.toLowerCase()))
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleGroupMember(u.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-800 ${
                      groupMemberIds.includes(u.id) ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <UserAvatar
                      src={u.avatar_url}
                      name={u.name}
                      colorClass={u.avatar_color}
                      className="h-7 w-7 text-[10px] font-bold"
                    />
                    <span className="flex-1 text-sm text-white">{u.name}</span>
                    {groupMemberIds.includes(u.id) && (
                      <span className="text-xs text-blue-400">Selected</span>
                    )}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={!groupName.trim() || creatingGroup}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {creatingGroup ? 'Creating…' : `Create group (${groupMemberIds.length + 1} members)`}
            </button>
          </div>
        </div>
      )}

      {/* New DM modal */}
      {showNewDm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="chat-modal-panel w-full max-w-md rounded-xl border border-gray-700 bg-[#13151c] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="chat-modal-title font-semibold text-white">
                {newDmMode === 'group' ? 'New group chat' : 'New direct message'}
              </h3>
              <button type="button" onClick={closeNewDmModal} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-3 flex gap-1 rounded-lg bg-[#0f1117] p-1">
              <button
                type="button"
                onClick={() => setNewDmMode('single')}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  newDmMode === 'single' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Direct message
              </button>
              <button
                type="button"
                onClick={() => setNewDmMode('group')}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  newDmMode === 'group' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Group chat
              </button>
            </div>
            <input
              placeholder="Search people…"
              value={dmSearch}
              onChange={(e) => setDmSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
            />
            <div className="max-h-64 overflow-y-auto">
              {filteredDmUsers.map((u) =>
                newDmMode === 'group' ? (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleGroupDmMember(u.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-800"
                  >
                    <input
                      type="checkbox"
                      checked={groupDmSelectedIds.includes(u.id)}
                      onChange={() => {}}
                      className="h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-800 text-blue-500"
                    />
                    <UserAvatar
                      src={u.avatar_url}
                      name={u.name}
                      colorClass={u.avatar_color}
                      className="h-8 w-8 text-xs font-bold"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.role}</p>
                    </div>
                    {u.is_online && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />}
                  </button>
                ) : (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleNewDm(u)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-800"
                  >
                    <UserAvatar
                      src={u.avatar_url}
                      name={u.name}
                      colorClass={u.avatar_color}
                      className="h-8 w-8 text-xs font-bold"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.role}</p>
                    </div>
                    {u.is_online && <span className="ml-auto h-2 w-2 rounded-full bg-emerald-400" />}
                  </button>
                )
              )}
            </div>
            {newDmMode === 'group' && (
              <div className="mt-3 border-t border-gray-800 pt-3">
                <p className="mb-2 text-xs text-gray-500">
                  {groupDmSelectedIds.length < 2
                    ? `Select at least ${2 - groupDmSelectedIds.length} more ${groupDmSelectedIds.length === 1 ? 'person' : 'people'}`
                    : `${groupDmSelectedIds.length} people selected`}
                </p>
                <button
                  type="button"
                  disabled={groupDmSelectedIds.length < 2 || creatingGroupDm}
                  onClick={() => void handleCreateGroupDm()}
                  className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingGroupDm ? 'Creating…' : 'Start group chat'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="chat-modal-panel w-full max-w-sm rounded-xl border border-gray-700 bg-[#13151c] p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="chat-modal-title font-semibold text-white">Set a status</h3>
              <button type="button" onClick={() => setShowStatusModal(false)} className="text-gray-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2">
              <input
                value={statusEmojiDraft}
                onChange={(e) => setStatusEmojiDraft(e.target.value)}
                placeholder="🙂"
                maxLength={4}
                className="w-14 rounded-lg border border-gray-700 bg-[#0f1117] px-2 py-2 text-center text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <input
                value={statusTextDraft}
                onChange={(e) => setStatusTextDraft(e.target.value)}
                placeholder="What's your status?"
                maxLength={100}
                className="flex-1 rounded-lg border border-gray-700 bg-[#0f1117] px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {[
                ['📅', 'In a meeting'],
                ['🌙', 'Away'],
                ['⛔', 'Do not disturb'],
                ['🏖️', 'On leave'],
                ['🎯', 'Focusing'],
              ].map(([emoji, text]) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => {
                    setStatusEmojiDraft(emoji);
                    setStatusTextDraft(text);
                  }}
                  className="rounded-full border border-gray-700 bg-gray-800/40 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
                >
                  {emoji} {text}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {(myStatus?.status_text || myStatus?.status_emoji) && (
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => void handleSaveStatus('', '')}
                  className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                disabled={savingStatus}
                onClick={() => void handleSaveStatus(statusTextDraft, statusEmojiDraft)}
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingStatus ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deletingMessageId) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="border border-gray-700 bg-[#13151c] text-gray-100 shadow-2xl shadow-black/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {pendingDelete && deleteScopeLabel(pendingDelete.message) === 'Delete'
                ? 'Delete message for everyone?'
                : 'Delete message for you?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {pendingDelete && deleteScopeLabel(pendingDelete.message) === 'Delete'
                ? 'This message is less than 24 hours old, so it will be removed from everyone in this chat.'
                : 'This will remove the message from your chat only. Other people will still see it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete?.message.body && (
            <div className="max-h-28 overflow-hidden rounded-lg border border-gray-700/80 bg-[#0f1117] px-3 py-2 text-sm text-gray-300">
              {pendingDelete.message.body}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={!!deletingMessageId}
              className="border-gray-700 bg-transparent text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Keep message
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingMessageId}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDeleteMessage();
              }}
              className="bg-red-600 text-white hover:bg-red-500 focus:ring-red-500"
            >
              {deletingMessageId ? 'Deleting...' : 'Delete message'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex animate-in items-center justify-center fade-in-0 bg-black/50 p-4 backdrop-blur-md duration-200"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxUrl(null)}
          role="button"
          tabIndex={0}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            style={{ top: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Attachment preview"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default Chat;
