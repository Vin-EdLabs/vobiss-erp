import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Ticket,
  Banknote,
  Package,
  RotateCcw,
  FolderKanban,
  Loader2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { globalExecutiveSearch, type GlobalSearchResult } from '@/api/globalSearch';
import { cn } from '@/lib/utils';

const KIND_META: Record<
  string,
  { label: string; icon: React.ElementType; chip: string }
> = {
  ticket: { label: 'Tickets', icon: Ticket, chip: 'bg-blue-100 text-blue-800' },
  cash_request: { label: 'Cash requests', icon: Banknote, chip: 'bg-emerald-100 text-emerald-800' },
  material_request: { label: 'Material requests', icon: Package, chip: 'bg-amber-100 text-amber-800' },
  item_return: { label: 'Item returns', icon: RotateCcw, chip: 'bg-violet-100 text-violet-800' },
  project_request: { label: 'Project requests', icon: FolderKanban, chip: 'bg-indigo-100 text-indigo-800' },
};

function groupResults(results: GlobalSearchResult[]) {
  const groups: Record<string, GlobalSearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.kind]) groups[r.kind] = [];
    groups[r.kind].push(r);
  }
  return groups;
}

type Props = {
  variant?: 'compact' | 'page';
  className?: string;
  autoFocus?: boolean;
};

export function GlobalExecutiveSearch({
  variant = 'compact',
  className,
  autoFocus = false,
}: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = query.trim();
  const showPanel = trimmed.length >= 1 && open;
  const isPage = variant === 'page';

  const flatResults = useMemo(() => results, [results]);
  const grouped = useMemo(() => groupResults(results), [results]);

  const updateDropdownPosition = useCallback(() => {
    if (isPage || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 320),
      maxWidth: 'min(96vw, 520px)',
      zIndex: 9999,
    });
  }, [isPage]);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (!t) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await globalExecutiveSearch(t);
      setResults(list);
      setActiveIndex(0);
      setOpen(true);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : 'Search failed');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, runSearch]);

  useLayoutEffect(() => {
    if (!showPanel || isPage) return;
    updateDropdownPosition();
    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [showPanel, isPage, updateDropdownPosition, trimmed]);

  const goTo = (href: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    setError(null);
    navigate(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (trimmed) setOpen(true);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatResults.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatResults[activeIndex]) {
      e.preventDefault();
      goTo(flatResults[activeIndex].href);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  let idx = -1;

  const dropdownContent = showPanel ? (
    <div
      ref={listRef}
      role="listbox"
      className={cn(
        'overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl ring-1 ring-black/5',
        isPage ? 'static mt-3 max-h-[min(520px,65vh)] w-full' : 'max-h-[min(420px,60vh)]'
      )}
      style={isPage ? undefined : dropdownStyle}
    >
      {loading && (
        <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Searching…
        </p>
      )}

      {!loading && error && (
        <p className="flex items-start gap-2 px-4 py-4 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {!loading && !error && flatResults.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          No matches for &ldquo;{trimmed}&rdquo;. Try a ticket code (TCK-…), request #, or customer name.
        </p>
      )}

      {!loading &&
        !error &&
        Object.entries(grouped).map(([kind, items]) => {
          const meta = KIND_META[kind] || KIND_META.material_request;
          const Icon = meta.icon;
          return (
            <div key={kind} className="py-1">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {meta.label} ({items.length})
              </p>
              {items.map((item) => {
                idx += 1;
                const thisIdx = idx;
                const isActive = thisIdx === activeIndex;
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-idx={thisIdx}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition',
                      isActive ? 'bg-blue-50' : 'hover:bg-slate-50'
                    )}
                    onMouseEnter={() => setActiveIndex(thisIdx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => goTo(item.href)}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        meta.chip
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm font-medium text-slate-900">
                        {item.title}
                      </span>
                      <span className="line-clamp-2 text-xs text-slate-500">{item.subtitle}</span>
                    </span>
                    <ArrowRight
                      className={cn(
                        'mt-1 h-4 w-4 shrink-0 text-slate-300',
                        isActive && 'text-blue-500'
                      )}
                    />
                  </button>
                );
              })}
            </div>
          );
        })}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} className={cn('relative', isPage ? 'w-full max-w-3xl' : 'w-full', className)}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border bg-white shadow-sm transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/30',
          isPage ? 'border-slate-200 px-4 py-3' : 'border-slate-200 px-3 py-2'
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => trimmed && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            isPage
              ? 'Search TCK, request #, cash, material, customer…'
              : 'Search tickets, requests, cash…'
          }
          className={cn(
            'min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-slate-400',
            isPage ? 'text-base' : 'text-sm'
          )}
          aria-label="Global search"
          aria-expanded={showPanel}
          aria-autocomplete="list"
        />
      </div>

      {isPage && (
        <p className="mt-2 text-xs text-slate-500">
          Start typing — e.g. <strong>TCK</strong>, <strong>24</strong>, <strong>cash</strong>, or a customer name.
        </p>
      )}

      {isPage && dropdownContent}

      {!isPage && showPanel && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[9998] bg-black/20"
                aria-hidden
                onMouseDown={() => setOpen(false)}
              />
              {dropdownContent}
            </>,
            document.body
          )
        : null}
    </div>
  );
}

export default GlobalExecutiveSearch;
