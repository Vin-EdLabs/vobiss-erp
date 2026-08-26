import { API_URL } from '@/lib/api';

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface VobiItem {
  id: string;
  kind: string;
  recordType: string;
  badge: string;
  title: string;
  subtitle: string;
  age: string;
  link: string;
  actionLabel: string;
  priority: string;
  created_at?: string;
}

export interface VobiOverview {
  greeting: { period: string; label: string; firstName: string };
  statusLine: string;
  pendingCount: number;
  groups: {
    needsAction: VobiItem[];
    mentions: VobiItem[];
    sinceLogin: VobiItem[];
    overdue: VobiItem[];
  };
  accentColor: string;
}

export interface VobiSummaryResponse {
  period: string;
  since: string;
  sections: {
    tickets: { resolved: string[]; open: string[]; overdue: string[]; escalated: string[] };
    requests: { approved: number; rejected: number; pending: number };
    chat: { mentioned: number; unread_threads: number };
    projects: { updated: number; in_production: number };
  };
}

export interface VobiCommandMeta extends Record<string, unknown> {
  cardType?: string;
  threadSummary?: VobiThreadSummary;
  digest?: VobiPersonalDigest;
  memoryConfirmation?: VobiMemoryConfirmation | null;
  memoryCandidates?: VobiMemory[];
}

export interface VobiMemory {
  id: number;
  memory_type: string;
  memory_content: string;
  source_channel_id?: string | null;
  source_message_id?: string | null;
  confidence: number;
  importance: string;
  status: string;
  expiration_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface VobiMemoryConfirmation {
  memoryId: number;
  text: string;
  memory_content: string;
}

export interface VobiCommandResult {
  intent: string;
  reply: string;
  response?: string;
  cards: VobiItem[];
  filter?: string | null;
  meta?: VobiCommandMeta;
  channelId?: string;
  messageId?: string;
  memoryConfirmation?: VobiMemoryConfirmation | null;
  memoryCandidates?: VobiMemory[];
}

export interface VobiThreadSummary {
  channelId: string;
  channelName: string;
  recordType?: string | null;
  recordId?: string | null;
  period: { from: string; to: string };
  messageCount: number;
  participants: Array<{ userId: number | null; displayName: string; messageCount: number }>;
  systemEvents: Array<{ created_at: string; body: string }>;
  keyMessages: Array<{ sender: string; body: string; created_at: string }>;
  lastMessage?: { sender: string; body: string; created_at: string } | null;
  lastActivity?: string | null;
  currentStatus?: string | null;
}

export interface VobiDigestThread {
  channelName: string;
  channelId?: string;
  dmId?: string;
  unreadCount: number;
  lastMessage?: { body: string; sender: string; created_at: string };
  recordType?: string | null;
}

export interface VobiPersonalDigest {
  since: string;
  totalUnread: number;
  mentionedIn: VobiDigestThread[];
  activeThreads: VobiDigestThread[];
  systemEvents: VobiDigestThread[];
}

async function vobiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/vobi${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Vobi request failed (${res.status})`);
  }
  return res.json();
}

export function getVobiOverview() {
  return vobiFetch('/overview') as Promise<VobiOverview>;
}

export function getVobiActions(
  params: string | { filter?: string; type?: string } = 'all'
) {
  const search =
    typeof params === 'string'
      ? `filter=${encodeURIComponent(params)}`
      : new URLSearchParams(
          Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][]
        ).toString();
  return vobiFetch(`/actions?${search || 'filter=all'}`) as Promise<{
    filter: string;
    items: VobiItem[];
    total: number;
  }>;
}

export function getVobiSummary(
  period: 'since_login' | 'today' | 'week',
  type?: string
) {
  const qs = new URLSearchParams({ period });
  if (type) qs.set('type', type);
  return vobiFetch(`/summary?${qs.toString()}`) as Promise<VobiSummaryResponse>;
}

export function getVobiThread() {
  return vobiFetch('/thread') as Promise<{ channelId: string; created?: boolean }>;
}

export function getVobiChatDigest(since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return vobiFetch(`/chat/digest${qs}`) as Promise<VobiPersonalDigest>;
}

export function getVobiThreadSummary(channelId: string, since?: string) {
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';
  return vobiFetch(`/chat/thread/${encodeURIComponent(channelId)}${qs}`) as Promise<VobiThreadSummary>;
}

export function getVobiChatInsight() {
  return vobiFetch('/chat/insight') as Promise<{
    urgentMentions: number;
    pendingActions: number;
    recentActivity: number;
    topItems: Array<{
      type: 'mention' | 'action' | 'update';
      channelId: string;
      channelName: string;
      detail: string;
    }>;
  }>;
}

export function postVobiCommand(
  text: string,
  options?: {
    persist?: boolean;
    persistUser?: boolean;
    command?: string;
    history?: Array<{ role: string; content: string }>;
    pageContext?: {
      pathname?: string;
      pageGuide?: {
        pageName: string;
        actions: Array<{ label: string; hint: string; urgent?: boolean }>;
      } | null;
      liveUi?: {
        title?: string;
        headings?: string[];
        buttons?: string[];
        fields?: string[];
      };
    } | null;
  }
) {
  return vobiFetch('/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      command: options?.command,
      persist: Boolean(options?.persist),
      persistUser: Boolean(options?.persistUser),
      history: options?.history || [],
      pathname: options?.pageContext?.pathname,
      pageGuide: options?.pageContext?.pageGuide || null,
      liveUi: options?.pageContext?.liveUi || null,
    }),
  }) as Promise<VobiCommandResult>;
}

export function getVobiBriefing() {
  return vobiFetch('/briefing') as Promise<{ response: string; timestamp: string }>;
}

export function postVobiChat(message: string, history: Array<{ role: string; content: string }> = []) {
  return vobiFetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  }) as Promise<{ response: string; timestamp: string }>;
}

export function generateVobiReport(period: 'today' | 'week' = 'today') {
  return vobiFetch('/report/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period }),
  }) as Promise<{ period: string; filename: string; contentType: string; body: string }>;
}

export function getVobiMemories(status: 'active' | 'pending' | 'all' = 'active') {
  return vobiFetch(`/memories?status=${encodeURIComponent(status)}`) as Promise<{
    success: boolean;
    memories: VobiMemory[];
    settings: { memory_enabled: boolean };
  }>;
}

export function updateVobiMemorySettings(memory_enabled: boolean) {
  return vobiFetch('/memories/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory_enabled }),
  }) as Promise<{ success: boolean; memory_enabled: boolean }>;
}

export function createVobiMemory(payload: {
  memory_content: string;
  memory_type?: string;
  importance?: string;
}) {
  return vobiFetch('/memories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as Promise<{ success: boolean; memory: VobiMemory }>;
}

export function updateVobiMemory(
  id: number,
  patch: { memory_content?: string; memory_type?: string; status?: string; importance?: string }
) {
  return vobiFetch(`/memories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }) as Promise<{ success: boolean; memory: VobiMemory }>;
}

export function confirmVobiMemory(id: number) {
  return vobiFetch(`/memories/${id}/confirm`, { method: 'POST' }) as Promise<{
    success: boolean;
    memory: VobiMemory;
  }>;
}

export function dismissVobiMemory(id: number) {
  return vobiFetch(`/memories/${id}/dismiss`, { method: 'POST' }) as Promise<{
    success: boolean;
    memory: VobiMemory;
  }>;
}

export function deleteVobiMemory(id: number) {
  return vobiFetch(`/memories/${id}`, { method: 'DELETE' }) as Promise<{ success: boolean }>;
}

export function clearVobiMemories() {
  return vobiFetch('/memories', { method: 'DELETE' }) as Promise<{ success: boolean; deleted: number }>;
}
