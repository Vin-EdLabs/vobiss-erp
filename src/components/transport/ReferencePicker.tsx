import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { API_URL } from '@/api';
import { REFERENCE_TYPE_META, type LinkedReference, type ReferenceType } from '@/lib/referenceLink';

const TYPES: ReferenceType[] = ['ticket', 'project', 'material_request'];

const TYPE_HINT: Record<ReferenceType, string> = {
  ticket: 'link to a support or project ticket',
  project: 'link to a project',
  material_request: 'link to a material request',
};

async function searchRecords(type: ReferenceType, query: string): Promise<LinkedReference[]> {
  const response = await fetch(
    `${API_URL}/transport/references/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } }
  );
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export default function ReferencePicker({
  value,
  onChange,
  required = false,
  error = '',
}: {
  value: LinkedReference | null;
  onChange: (next: LinkedReference | null) => void;
  required?: boolean;
  error?: string;
}) {
  const [type, setType] = useState<ReferenceType | null>(value?.type || null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkedReference[]>([]);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value?.type) setType(value.type);
  }, [value?.type]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!type || value) {
      setResults([]);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setSearching(true);
      const rows = await searchRecords(type, query.trim());
      if (cancelled) return;
      setResults(rows);
      setNotFound(Boolean(query.trim()) && rows.length === 0);
      setSearching(false);
      setOpen(true);
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [type, query, value]);

  const showError = Boolean(error);
  const borderClass = showError ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200';

  const helper = useMemo(() => {
    if (required) return null;
    return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Optional</span>;
  }, [required]);

  return (
    <div ref={wrapRef} className={`rounded-2xl border bg-white p-5 shadow-sm ${borderClass}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Link to a Reference</h3>
          <p className="mt-0.5 text-sm text-slate-500">Connect this request to an existing record</p>
        </div>
        {helper}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {TYPES.map((item) => {
          const meta = REFERENCE_TYPE_META[item];
          const selected = type === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => {
                setType(item);
                if (value?.type !== item) onChange(null);
                setQuery('');
                setOpen(true);
              }}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? 'border-amber-400 bg-amber-50 shadow-sm ring-1 ring-amber-200'
                  : 'border-slate-200 bg-slate-50 hover:border-amber-200 hover:bg-white'
              }`}
            >
              <span className="text-lg">{meta.emoji}</span>
              <p className="mt-1 text-sm font-semibold text-slate-900">{meta.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{TYPE_HINT[item]}</p>
            </button>
          );
        })}
      </div>

      {type && !value && (
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={`Search ${REFERENCE_TYPE_META[type].label.toLowerCase()}s by number or name…`}
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
          {open && (
            <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {searching && <p className="px-3 py-2 text-sm text-slate-500">Searching…</p>}
              {!searching && results.map((row) => (
                <button
                  key={`${row.type}-${row.id}`}
                  type="button"
                  onClick={() => {
                    onChange(row);
                    setNotFound(false);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-amber-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row.number}</p>
                    <p className="text-xs text-slate-500">{row.title}</p>
                  </div>
                  {row.status && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                      {String(row.status).replace(/_/g, ' ')}
                    </span>
                  )}
                </button>
              ))}
              {!searching && results.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-500">
                  {query.trim() ? 'No matching records.' : 'Start typing to search existing records.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {notFound && (
        <p className="mt-3 text-sm font-medium text-rose-600">The reference number does not exist.</p>
      )}

      {value && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                <Check className="h-4 w-4" />
                Linked to {REFERENCE_TYPE_META[value.type].label} #{value.number}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">{value.title}</p>
              {value.status && (
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                  {String(value.status).replace(/_/g, ' ')}
                </span>
              )}
              {value.link && (
                <a href={value.link} className="mt-2 block text-xs font-semibold text-amber-700 hover:underline">
                  View original record
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
              aria-label="Clear reference"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
