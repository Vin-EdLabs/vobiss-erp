import { formatPersonName, isNameFallback, type PersonLike } from '@/lib/displayName';

export function PersonName({
  value,
  className = '',
  fallback = 'Unknown',
}: {
  value?: PersonLike;
  className?: string;
  fallback?: string;
}) {
  const name = formatPersonName(value, fallback);
  const fallbackName = isNameFallback(value);
  return (
    <span className={className}>
      {name}
      {fallbackName && name !== fallback && (
        <span
          className="ml-1.5 inline-flex align-middle rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
          title="This person has no full name on their profile. Username is shown until HR updates it."
        >
          No full name
        </span>
      )}
    </span>
  );
}
