import pool from '../db.js';

/**
 * Returns middleware that lets a GET request through without a user session when a
 * valid, non-revoked, non-expired share token for one of `recordTypes` is supplied
 * via `?share_token=` or the `x-share-token` header. Sets `req.isSharedView = true`
 * and `req.shareLink` (the shared_links row) so handlers can serve that exact record.
 *
 * Route handlers MUST use `req.shareLink.record_id` (not `req.params.id`) to decide
 * what to fetch when `req.isSharedView` is true — this is what makes the token
 * authoritative for exactly the record it was generated for, regardless of the URL.
 *
 * Every other method (POST/PUT/PATCH/DELETE) always falls through to `fallbackAuth`,
 * so a share token can never authorize a mutation.
 */
export function authenticateOrShareToken(recordTypes, fallbackAuth) {
  const types = Array.isArray(recordTypes) ? recordTypes : [recordTypes];
  return async (req, res, next) => {
    if (req.method === 'GET') {
      const token = req.query.share_token || req.headers['x-share-token'];
      if (token) {
        try {
          const { rows } = await pool.query('SELECT * FROM shared_links WHERE token = $1', [String(token)]);
          const link = rows[0];
          const notExpired = !link?.expires_at || new Date(link.expires_at) > new Date();
          if (link && !link.revoked && notExpired && types.includes(link.record_type)) {
            req.shareLink = link;
            req.isSharedView = true;
            return next();
          }
        } catch (e) {
          console.error('[shareAuth] token check failed:', e.message);
        }
      }
    }
    return fallbackAuth(req, res, next);
  };
}
