export function formatPersonName(user, fallback = 'Unknown') {
  if (!user || typeof user === 'string') {
    const raw = String(user || '').trim();
    return raw || fallback;
  }
  const first = String(user.first_name || '').trim();
  const last = String(user.last_name || '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const username = String(user.username || user.full_name || '').trim();
  return username || fallback;
}

/** SQL expression: full name, else username. */
export function personNameSql(alias = 'u') {
  return `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(${alias}.first_name, ''), ' ', COALESCE(${alias}.last_name, ''))), ''), NULLIF(TRIM(${alias}.username), ''))`;
}
