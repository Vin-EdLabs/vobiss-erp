import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Link2, Loader2, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { validateReference } from '@/api/references';
import { referenceTypeIcon, referenceTypeLabel, type ReferenceSummary } from '@/lib/referenceRegistry';
import { statusBadgeClass } from '@/lib/shareRecord';

/**
 * The one reusable "Link References" section — used on the Transport Request, Fuel Request,
 * and Vehicle Rental Request forms (and anywhere else a record needs to link to other
 * records). Fully controlled: the parent owns the list of linked references and persists
 * them (via POST /api/references/link, once the parent record has an id) after submit.
 */
export function ReferenceLinkPicker({
  value,
  onChange,
  required = false,
  hint,
  onLinked,
}: {
  value: ReferenceSummary[];
  onChange: (next: ReferenceSummary[]) => void;
  required?: boolean;
  /** Optional extra guidance shown under the label, e.g. which types are most relevant for this form. */
  hint?: string;
  /** Called whenever a NEW reference is successfully added, so a form can react (e.g. auto-fill from a linked Transport Request). */
  onLinked?: (ref: ReferenceSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setChecking(false);
      setError(null);
      return;
    }
    setError(null);
    debounceRef.current = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setChecking(true);
      try {
        const result = await validateReference(q);
        if (requestId !== requestIdRef.current) return; // a newer keystroke superseded this check
        if (!result.found) {
          setError('No record found with this reference number.');
          return;
        }
        const alreadyLinked = value.some((v) => v.type === result.type && v.id === result.id);
        if (alreadyLinked) {
          setError('That record is already linked.');
          setQuery('');
          return;
        }
        const summary: ReferenceSummary = {
          type: result.type,
          id: result.id,
          referenceNumber: result.referenceNumber,
          title: result.title,
          status: result.status,
          pagePath: result.pagePath,
        };
        onChange([...value, summary]);
        onLinked?.(summary);
        setQuery('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not validate that reference.');
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const remove = (type: string, id: number) => {
    onChange(value.filter((v) => !(v.type === type && v.id === id)));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <Link2 className="h-4 w-4 text-slate-500" />
          Link References
          {required && <span className="text-red-600">*</span>}
        </label>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paste a reference number — e.g. TKT-042, MR-015, SR-008"
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-9 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
        />
        {checking && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {value.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {value.map((ref) => {
            const Icon = referenceTypeIcon(ref.type);
            return (
              <div key={`${ref.type}-${ref.id}`} className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 pr-8">
                <button
                  type="button"
                  onClick={() => remove(ref.type, ref.id)}
                  title="Remove link"
                  aria-label="Remove link"
                  className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{referenceTypeLabel(ref.type)}</p>
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {ref.referenceNumber} — {ref.title}
                    </p>
                    {ref.status && (
                      <Badge className={`${statusBadgeClass(ref.status)} mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium`}>
                        {ref.status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {value.length === 0 && (
        <p className={`text-xs ${required ? 'text-red-600' : 'text-slate-500'}`}>
          {required
            ? 'At least one linked reference is required before this request can be submitted.'
            : 'Linking a related record is optional but helps keep everything connected.'}
        </p>
      )}
    </div>
  );
}
