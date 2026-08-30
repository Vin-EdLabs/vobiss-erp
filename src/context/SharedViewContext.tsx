import { createContext, useContext } from 'react';

export type SharedViewInfo = {
  isSharedView: boolean;
  shareToken?: string;
  recordType?: string;
  recordId?: number;
  visibility?: 'public' | 'private';
  /**
   * The route params (e.g. `{ id: '42' }`, `{ unitSlug: 'ts', id: '42' }`) extracted from
   * the shared record's real page path. Shared-view pages must read ids from here instead
   * of `useParams()`/`useLocation()` — the page is rendered directly (no nested Router and
   * no location override, both of which React Router forbids in this position), so the
   * real browser location is still `/shared/:token`, not the record's own URL.
   */
  routeParams?: Record<string, string | undefined>;
};

const defaultValue: SharedViewInfo = { isSharedView: false };

export const SharedViewContext = createContext<SharedViewInfo>(defaultValue);

export function SharedViewProvider({ value, children }: { value: SharedViewInfo; children: React.ReactNode }) {
  return <SharedViewContext.Provider value={value}>{children}</SharedViewContext.Provider>;
}

/** Returns `{ isSharedView: false }` for every normal, authenticated page — safe to call anywhere. */
export function useSharedView(): SharedViewInfo {
  return useContext(SharedViewContext);
}
