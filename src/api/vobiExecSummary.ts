import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function execSummaryFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/vobi-exec-summary${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ExecSummaryHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** The standing executive briefing — always pre-generated on a 15-minute server sweep, never
 *  built fresh on request (only a cold-boot first call falls back to a one-time synchronous
 *  generation server-side). */
export const getExecutiveSummary = (): Promise<{ success: true; summary: string | null; generated_at: string | null }> =>
  execSummaryFetch('/');

/** A follow-up question about the briefing, answered by Vobi with the current summary as
 *  context plus its own full system-data access. */
export const askExecutiveSummary = (
  question: string,
  history: ExecSummaryHistoryTurn[] = []
): Promise<{ success: true; answer: string; timestamp: string }> =>
  execSummaryFetch('/ask', { method: 'POST', body: JSON.stringify({ question, history }) });
