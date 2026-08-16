import { format, formatDistanceToNow } from 'date-fns';
import type { WorkspaceAttentionItem } from '@/api';

export function vobiGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function vobiDisplayName(user: {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  username?: string;
} | null): { displayName: string; firstName: string } {
  const displayName =
    user?.full_name ||
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    user?.username ||
    'there';
  const firstName = displayName.split(/\s+/)[0] || displayName;
  return { displayName, firstName };
}

export function formatActivityTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

export function formatLastLogin(iso: string | null): string {
  if (!iso) return 'your last visit';
  try {
    return format(new Date(iso), "EEE, MMM d 'at' h:mm a");
  } catch {
    return 'your last visit';
  }
}

export function buildSinceLastLoginLines(
  items: WorkspaceAttentionItem[],
  lastLoginAt: string | null,
  chatUnread: number,
  notifUnread: number
): string[] {
  const lines: string[] = [];
  const approvals = items.filter((i) => i.kind === 'approval').length;
  const tickets = items.filter((i) => i.kind === 'ticket').length;
  const high = items.filter((i) => i.priority === 'high').length;

  if (approvals > 0) {
    lines.push(
      `${approvals} approval${approvals === 1 ? '' : 's'} waiting for you`
    );
  }
  if (tickets > 0) {
    lines.push(`${tickets} ticket${tickets === 1 ? '' : 's'} need attention`);
  }
  if (chatUnread > 0) {
    lines.push(
      `${chatUnread} unread chat message${chatUnread === 1 ? '' : 's'}`
    );
  }
  if (notifUnread > 0) {
    lines.push(
      `${notifUnread} new notification${notifUnread === 1 ? '' : 's'}`
    );
  }
  if (high > 0 && lines.length < 4) {
    lines.push(`${high} high-priority item${high === 1 ? '' : 's'}`);
  }

  if (!lines.length) {
    lines.push('');
  }

  return lines.slice(0, 5);
}

const VOBI_INTRO_PREFIX = 'vobi-intro-seen';

export function vobiIntroStorageKey(userId?: number | null): string {
  return userId ? `${VOBI_INTRO_PREFIX}-${userId}` : VOBI_INTRO_PREFIX;
}

export function hasSeenVobiIntro(userId?: number | null): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(vobiIntroStorageKey(userId)) === '1';
}

export function markVobiIntroSeen(userId?: number | null): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(vobiIntroStorageKey(userId), '1');
}

export function buildVobiIntroMessage(_firstName: string): {
  greeting: string;
  paragraphs: string[];
  bullets: string[];
} {
  return { greeting: '', paragraphs: [], bullets: [] };
}

/** Detect @vobi or /vobi in chat composer (exact command or trailing token). */
export function isVobiChatTrigger(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\/vobi\b/i.test(t)) return true;
  if (/^@vobi\b/i.test(t)) return true;
  if (/@vobi\s*$/i.test(t)) return true;
  return false;
}
