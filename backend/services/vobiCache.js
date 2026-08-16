const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(key) {
  cache.delete(key);
}

export function invalidateAllCache() {
  cache.clear();
}

export function invalidateVobiData(userId) {
  invalidateCache('global');
  if (userId != null && userId !== '') {
    invalidateCache(`user_${userId}`);
  }
  for (const key of [...cache.keys()]) {
    if (String(key).startsWith('role_')) cache.delete(key);
  }
}

/** Drop Vobi snapshots after a successful create/update/delete. */
export function invalidateOnMutation(req, res, next) {
  const method = String(req.method || '').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      invalidateVobiData(req.user?.id);
    }
  });
  next();
}
