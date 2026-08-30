/** Display a staff member's full name. Username is only a fallback. */

export type PersonLike =
  | {
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      username?: string | null;
      name?: string | null;
    }
  | string
  | null
  | undefined;

function looksLikeUsername(value: string) {
  const v = value.trim();
  if (!v) return false;
  if (v.includes(' ')) return false;
  return v === v.toLowerCase() || !/[A-Z]/.test(v);
}

export function formatPersonName(person?: PersonLike, fallback = 'Unknown') {
  if (person == null) return fallback;
  if (typeof person === 'string') {
    const raw = person.trim();
    return raw || fallback;
  }
  const combined = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  if (combined) return combined;
  const full = String(person.full_name || person.name || '').trim();
  if (full) return full;
  const username = String(person.username || '').trim();
  return username || fallback;
}

export function isNameFallback(person?: PersonLike) {
  if (person == null) return true;
  if (typeof person === 'string') return looksLikeUsername(person);
  const combined = `${person.first_name || ''} ${person.last_name || ''}`.trim();
  if (combined) return false;
  const full = String(person.full_name || person.name || '').trim();
  if (full && !looksLikeUsername(full)) return false;
  return true;
}
