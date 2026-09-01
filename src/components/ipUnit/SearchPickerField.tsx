import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { LookupRow } from '@/api/ipUnit';

/**
 * Debounced type-ahead search field used for Client / Site / POP / Staff pickers across
 * Add Circuit and Circuit Requests — same 250ms-debounce dropdown pattern as
 * src/components/fieldwork/AssignEngineersForm.tsx, extracted once instead of copy-pasted
 * per form.
 */
export function SearchPickerField({
  label, placeholder, query, onQueryChange, selectedId, fetchResults, onSelect, renderItem, disabled,
}: {
  label: string;
  placeholder: string;
  query: string;
  onQueryChange: (text: string) => void;
  selectedId: number | null;
  fetchResults: (q: string) => Promise<LookupRow[]>;
  onSelect: (item: LookupRow) => void;
  renderItem: (item: LookupRow) => React.ReactNode;
  disabled?: boolean;
}) {
  const [results, setResults] = useState<LookupRow[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchResults(query).then(setResults).catch(() => setResults([]));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          className="pl-9"
          value={query}
          disabled={disabled}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      {query && !selectedId && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--surface-secondary)]"
              onClick={() => onSelect(item)}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
