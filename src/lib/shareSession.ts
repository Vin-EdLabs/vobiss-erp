/**
 * Support for attaching the active share token to API requests made by a page rendered
 * in shared (read-only) view — so the various fetch wrappers across the app (api.ts,
 * api/project.ts, inline page fetchers) can attach it without every API function needing
 * a new param.
 *
 * The token is derived straight from the browser's URL rather than tracked in a variable
 * set/cleared by a mount effect: SharedRecordPage renders the target page component
 * in place (no nested Router, no location override — see SharedRecordPage.tsx for why),
 * so the real address bar stays on `/shared/:token` for the page's entire lifetime. Reading
 * it fresh on every call sidesteps any mount/unmount-timing race (React StrictMode's
 * dev-mode double-invoke of effects included) that a stored-then-cleared variable would be
 * exposed to.
 */
function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/shared\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** True whenever the browser is actually on `/shared/:token`. */
export function isSharedRoute(): boolean {
  return tokenFromUrl() !== null;
}

/** The active share token, if the browser is currently on `/shared/:token`. */
export function getActiveShareToken(): string | null {
  return tokenFromUrl();
}

/** Header to attach to a GET request when a share session is active. Never attach on writes. */
export function shareTokenHeaders(method?: string): Record<string, string> {
  const token = tokenFromUrl();
  if (!token) return {};
  const m = (method || 'GET').toUpperCase();
  if (m !== 'GET') return {};
  return { 'x-share-token': token };
}
