import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local draft state for one editable field that survives parent re-renders, poll/refetch
 * results, and other users' concurrent edits.
 *
 * - `draft` is what the input should render — the locally-typed value while dirty, the
 *   server value once clean.
 * - `onChange` updates the draft immediately (no network call) and (re)schedules a debounced
 *   commit — nothing hits the API on every keystroke.
 * - `flush` forces an immediate commit (wire to onBlur / Enter / explicit Save).
 * - The draft only re-syncs from `serverValue` while NOT dirty, so a refetch/poll or another
 *   user's save can never clobber an in-progress edit — this is the core fix for "typing gets
 *   wiped by a refresh."
 */
export function useDraftValue<T>(
  serverValue: T,
  commit: (value: T) => void | Promise<void>,
  { debounceMs = 500 }: { debounceMs?: number } = {}
) {
  const [draft, setDraft] = useState(serverValue);
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!dirty) setDraft(serverValue);
  }, [serverValue, dirty]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const flush = useCallback((value: T = draftRef.current) => {
    window.clearTimeout(timerRef.current);
    setDirty(false);
    void commit(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit]);

  const onChange = useCallback((value: T) => {
    setDraft(value);
    setDirty(true);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => flush(value), debounceMs);
  }, [flush, debounceMs]);

  const cancel = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setDirty(false);
    setDraft(serverValue);
  }, [serverValue]);

  return { draft, dirty, onChange, flush, cancel };
}
