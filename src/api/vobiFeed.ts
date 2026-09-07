import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface VobiFeedReaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

export interface VobiFeedSeenBy {
  staff_id: string;
  initials: string;
}

export interface VobiFeedEntry {
  id: number;
  company: string;
  narrated_text: string;
  created_at: string;
  expires_at: string;
  reactions: VobiFeedReaction[];
  seen: VobiFeedSeenBy[];
}

async function vobiFeedFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/vobi-feed${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export const getVobiFeed = (company = 'CW'): Promise<{ entries: VobiFeedEntry[] }> =>
  vobiFeedFetch(`?company=${encodeURIComponent(company)}`);

/** Toggles the current staff member's reaction on one entry — add if they hadn't reacted with
 *  this emoji, remove if they had. */
export const reactToFeed = (
  feedId: number,
  emoji: string
): Promise<{ feedId: number; emoji: string; count: number; staffId: string; action: 'add' | 'remove' }> =>
  vobiFeedFetch(`/${feedId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });

/** Marks one entry seen for the current staff member — identity comes from their own auth
 *  token, so this can never mark it seen for anyone else. */
export const markFeedSeen = (feedId: number): Promise<{ ok: true; feedId: number; staffId: string; initials: string }> =>
  vobiFeedFetch(`/${feedId}/seen`, { method: 'POST', body: JSON.stringify({}) });

export const getFeedReactions = (feedId: number): Promise<{ reactions: VobiFeedReaction[] }> =>
  vobiFeedFetch(`/${feedId}/reactions`);
