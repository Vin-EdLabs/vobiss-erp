import { API_URL } from '@/lib/api';

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function chatFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/chat${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ChatChannel {
  id: string;
  name: string;
  slug?: string;
  description: string | null;
  channel_type: string;
  record_type?: string | null;
  record_id?: string | null;
  unread_count: number;
  member_count: number;
  last_message: {
    body: string;
    sender_name: string;
    created_at: string;
  } | null;
}

export interface ChatDm {
  id: string;
  unread_count: number;
  other_user: {
    id: number;
    name: string;
    initials: string;
    unit: string | null;
    role: string;
    avatar_color: string;
    avatar_url?: string | null;
    status_text?: string | null;
    status_emoji?: string | null;
  } | null;
  last_message: {
    body: string;
    sender_name: string;
    created_at: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  channel_id?: string | null;
  dm_id?: string | null;
  body: string;
  sender_id: number | null;
  sender_name: string;
  sender_initials: string;
  sender_unit: string | null;
  sender_position?: string | null;
  sender_role: string | null;
  sender_avatar_color: string;
  sender_avatar_url?: string | null;
  created_at: string;
  edited_at: string | null;
  message_type: string;
  reply_to: { id: string; body: string; sender_name: string } | null;
  attachments: {
    id: string;
    file_name: string;
    file_url: string;
    file_size: number;
    mime_type: string;
  }[];
  reactions: {
    emoji: string;
    count: number;
    reacted_by_me: boolean;
  }[];
  meta?: {
    relatedType?: string;
    relatedId?: string | number;
    linkUrl?: string;
    linkLabel?: string;
    summaryCard?: {
      variant: 'ticket' | 'material_request' | 'cash_request' | 'item_return' | 'project_request';
      headline: string;
      tagline: string;
      fields: { label: string; value: string; highlight?: boolean }[];
      note?: string | null;
      status?: string | null;
      priority?: string | null;
    };
    actionState?: 'approved' | 'rejected';
    actions?: Array<{
      label: string;
      actionType: string;
      recordId: string;
      recordType: string;
      style: 'primary' | 'danger' | 'default';
      disabled?: boolean;
      result?: string;
    }>;
    sharedRecord?: {
      recordType: string;
      recordId: string | number;
      pagePath: string;
      pageTitle: string | null;
      recordPreview: Record<string, any> | null;
      sharedByName: string;
    };
  } | null;
  forwarded_from?: string | null;
  forwardedOrigin?: {
    id: string;
    sender_name: string;
    body: string;
    created_at: string;
    attachments: { file_name: string; file_url: string; mime_type: string }[];
  } | null;
  bookmark_id?: string | null;
  thread_count?: number;
  thread_last_reply_at?: string | null;
}

export interface BookmarkSource {
  type: 'channel' | 'dm';
  id: string;
  name: string;
  record_type: string | null;
  deep_link: string;
}

export interface BookmarkedMessage {
  bookmark_id: string;
  bookmarked_at: string;
  message: {
    id: string;
    body: string;
    message_type: string;
    created_at: string;
    sender_name: string | null;
    forwarded_from: string | null;
    attachments: { file_name: string; file_url: string; mime_type: string }[];
    source: BookmarkSource;
  };
}

export interface ChatUser {
  id: number;
  name: string;
  initials: string;
  unit: string | null;
  role: string;
  avatar_color: string;
  avatar_url?: string | null;
  is_online: boolean;
  status_text?: string | null;
  status_emoji?: string | null;
}

export async function updateMyChatStatus(statusText: string | null, statusEmoji: string | null): Promise<{ status_text: string | null; status_emoji: string | null }> {
  return chatFetch('/me/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_text: statusText, status_emoji: statusEmoji }),
  });
}

export async function getChatUnreadTotal(): Promise<{ total: number; count: number }> {
  try {
    const data = await chatFetch('/unread-total');
    const n = Number(data?.count ?? data?.total ?? 0) || 0;
    return { total: n, count: n };
  } catch {
    return { total: 0, count: 0 };
  }
}

export async function getChatChannels(): Promise<ChatChannel[]> {
  return chatFetch('/channels');
}

export async function getChannelMessages(
  channelId: string,
  before?: string
): Promise<{ messages: ChatMessage[] }> {
  const q = before ? `?before=${encodeURIComponent(before)}&limit=50` : '?limit=50';
  return chatFetch(`/channels/${channelId}/messages${q}`);
}

export async function sendChannelMessage(
  channelId: string,
  body: string,
  replyTo?: string,
  files?: File[]
): Promise<ChatMessage> {
  const form = new FormData();
  form.append('body', body);
  if (replyTo) form.append('reply_to', replyTo);
  for (const f of files || []) form.append('files', f);
  return chatFetch(`/channels/${channelId}/messages`, { method: 'POST', body: form });
}

/** Clears the chat from the current user's view only — other members' copies are untouched. */
export async function clearChannelMessages(channelId: string): Promise<void> {
  await chatFetch(`/channels/${channelId}/messages`, { method: 'DELETE' });
}

export async function reactToMessage(
  channelId: string,
  messageId: string,
  emoji: string
): Promise<{ messageId: string; reactions: ChatMessage['reactions'] }> {
  return chatFetch(`/channels/${channelId}/messages/${messageId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
}

export async function reactToDmMessage(
  dmId: string,
  messageId: string,
  emoji: string
): Promise<{ messageId: string; reactions: ChatMessage['reactions'] }> {
  return chatFetch(`/dms/${dmId}/messages/${messageId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
}

export async function markChannelRead(channelId: string): Promise<void> {
  await chatFetch(`/channels/${channelId}/read`, { method: 'POST' });
}

export async function markDmRead(dmId: string): Promise<void> {
  await chatFetch(`/dms/${dmId}/read`, { method: 'POST' });
}

export async function getChannelMembers(channelId: string) {
  return chatFetch(`/channels/${channelId}/members`);
}

export async function getChatDms(): Promise<ChatDm[]> {
  return chatFetch('/dms');
}

export async function createDm(targetUserId: number): Promise<{ dmId: string }> {
  return chatFetch('/dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  });
}

/** Ad-hoc group chat — open to any user, unlike admin-managed unit groups. */
export async function createGroupDm(memberIds: number[], name?: string): Promise<{ channelId: string }> {
  return chatFetch('/group-dms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberIds, name }),
  });
}

export async function getDmMessages(
  dmId: string,
  before?: string
): Promise<{ messages: ChatMessage[] }> {
  const q = before ? `?before=${encodeURIComponent(before)}&limit=50` : '?limit=50';
  return chatFetch(`/dms/${dmId}/messages${q}`);
}

export async function sendDmMessage(
  dmId: string,
  body: string,
  replyTo?: string,
  files?: File[]
): Promise<ChatMessage> {
  const form = new FormData();
  form.append('body', body);
  if (replyTo) form.append('reply_to', replyTo);
  for (const f of files || []) form.append('files', f);
  return chatFetch(`/dms/${dmId}/messages`, { method: 'POST', body: form });
}

/** Clears the chat from the current user's view only — the other participant's copy is untouched. */
export async function clearDmMessages(dmId: string): Promise<void> {
  await chatFetch(`/dms/${dmId}/messages`, { method: 'DELETE' });
}

export async function getChatUsers(): Promise<ChatUser[]> {
  return chatFetch('/users');
}

export async function createUnitGroup(data: {
  name: string;
  description?: string;
  memberIds: number[];
}): Promise<ChatChannel> {
  return chatFetch('/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function addGroupMembers(channelId: string, userIds: number[]): Promise<{ ok: boolean; added: number }> {
  return chatFetch(`/channels/${channelId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds }),
  });
}

export async function removeGroupMember(channelId: string, userId: number): Promise<{ ok: boolean }> {
  return chatFetch(`/channels/${channelId}/members/${userId}`, { method: 'DELETE' });
}

export async function getPinnedMessages(
  target: { channelId: string } | { dmId: string }
): Promise<{ messages: ChatMessage[] }> {
  if ('channelId' in target) {
    return chatFetch(`/channels/${target.channelId}/pins`);
  }
  return chatFetch(`/dms/${target.dmId}/pins`);
}

export async function pinMessage(
  target: { channelId: string; messageId: string } | { dmId: string; messageId: string }
): Promise<{ ok: boolean; messageId: string }> {
  const body =
    'channelId' in target ? { channelId: target.channelId } : { dmId: target.dmId };
  return chatFetch(`/messages/${target.messageId}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function unpinMessage(
  target: { channelId: string; messageId: string } | { dmId: string; messageId: string }
): Promise<{ ok: boolean; messageId: string }> {
  const qs =
    'channelId' in target
      ? `?channelId=${encodeURIComponent(target.channelId)}`
      : `?dmId=${encodeURIComponent(target.dmId)}`;
  return chatFetch(`/messages/${target.messageId}/pin${qs}`, { method: 'DELETE' });
}

export async function searchChatMessages(
  target: { channelId: string; q: string } | { dmId: string; q: string }
): Promise<{ messages: ChatMessage[] }> {
  const q = encodeURIComponent(target.q);
  if ('channelId' in target) {
    return chatFetch(`/channels/${target.channelId}/search?q=${q}`);
  }
  return chatFetch(`/dms/${target.dmId}/search?q=${q}`);
}

/** Cross-channel/cross-DM search over everything the caller is a member of. */
export async function searchChatGlobal(q: string): Promise<{ messages: ChatMessage[] }> {
  return chatFetch(`/search?q=${encodeURIComponent(q)}`);
}

/** A message's full thread — the root plus every reply, chronological. */
export async function getMessageThread(messageId: string): Promise<{ root: ChatMessage; replies: ChatMessage[] }> {
  return chatFetch(`/messages/${messageId}/thread`);
}

export async function editChatMessage(
  target: { channelId: string; messageId: string; body: string } | { dmId: string; messageId: string; body: string }
): Promise<ChatMessage> {
  const payload =
    'channelId' in target
      ? { channelId: target.channelId, body: target.body }
      : { dmId: target.dmId, body: target.body };
  return chatFetch(`/messages/${target.messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteChatMessage(
  target: { channelId: string; messageId: string } | { dmId: string; messageId: string }
): Promise<{ ok: boolean; messageId: string; scope: 'everyone' | 'self' }> {
  const payload =
    'channelId' in target
      ? { channelId: target.channelId }
      : { dmId: target.dmId };
  return chatFetch(`/messages/${target.messageId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export interface ChatRecordContext {
  id: string | number;
  record_type: string;
  status: string;
  title: string;
  subject: string;
  requester: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
  linkUrl: string;
  key_fields: [string, string][];
}

const CONTEXT_PATHS: Record<string, (id: string) => string> = {
  ticket: (id) => `/context/ticket/${id}`,
  material_request: (id) => `/context/material-request/${id}`,
  cash_request: (id) => `/context/cash-request/${id}`,
  item_return: (id) => `/context/item-return/${id}`,
  project_request: (id) => `/context/project-request/${id}`,
};

export async function getChatRecordContext(
  recordType: string,
  recordId: string | number
): Promise<ChatRecordContext> {
  const pathFn = CONTEXT_PATHS[recordType];
  if (!pathFn) throw new Error('Unsupported record type');
  return chatFetch(pathFn(String(recordId)));
}

export async function ensureChatThread(
  recordType: string,
  recordId: string | number
): Promise<{ channelId: string }> {
  return chatFetch(`/threads/${recordType}/${recordId}`, { method: 'POST' });
}

export async function getBookmarks(): Promise<BookmarkedMessage[]> {
  return chatFetch('/bookmarks');
}

export async function bookmarkMessage(messageId: string): Promise<{
  bookmark_id: string;
  message_id: string;
  bookmarked_at: string;
}> {
  return chatFetch('/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message_id: messageId }),
  });
}

export async function removeBookmark(bookmarkId: string): Promise<void> {
  await chatFetch(`/bookmarks/${bookmarkId}`, { method: 'DELETE' });
}

export async function checkBookmarks(messageIds: string[]): Promise<{ bookmarked: string[] }> {
  if (!messageIds.length) return { bookmarked: [] };
  const q = encodeURIComponent(messageIds.slice(0, 50).join(','));
  return chatFetch(`/bookmarks/check?message_ids=${q}`);
}

export async function getMessageById(messageId: string): Promise<ChatMessage> {
  return chatFetch(`/messages/${messageId}`);
}

export async function forwardMessage(
  messageId: string,
  destinations: { type: 'channel' | 'dm'; id: string }[],
  note?: string
): Promise<{ success: boolean; forwarded: { destinationId: string; messageId: string }[] }> {
  return chatFetch(`/messages/${messageId}/forward`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinations, note: note || '' }),
  });
}

export async function performChatAction(body: {
  actionType: string;
  recordType: string;
  recordId: string;
  messageId?: string;
  channelId?: string;
  reason?: string;
}): Promise<{ ok: boolean; result: string }> {
  return chatFetch('/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
