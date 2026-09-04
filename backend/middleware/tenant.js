// backend/middleware/tenant.js
import { isSystemAdminAccount } from '../roles.js';

/**
 * Attaches req.company for every downstream route handler to filter by.
 * - The System Admin account (isSystemAdminAccount — the same "sees everything" bypass already
 *   used for Realm/Audit Logs/etc. elsewhere in this app, not just anyone with a superadmin-ish
 *   role slug) gets req.company = null, meaning "no filter, every company."
 * - Everyone else — including company-level admins — is scoped to their own company. A plain
 *   'admin'/'superadmin' role user is NOT global here; only the true System Admin account is.
 *
 * req.user is already populated by authenticateToken with a fresh DB row (see middleware/auth.js
 * — it re-fetches on every request), so req.user.company is always current, never stale JWT data.
 *
 * "View as Company": a true System Admin's browser may send an `x-view-as-company` header (set
 * via the Sidebar switcher, see src/context/AuthContext.tsx's viewAsCompany) asking to see the
 * app scoped to one specific company instead of the default "every company" view. Only ever
 * honored for a real System Admin — on anyone else this header is silently ignored, since they
 * are already locked to their own company regardless of what a stale/tampered header claims.
 */
export function attachTenant(req, res, next) {
  const user = req.user || {};
  if (isSystemAdminAccount(user)) {
    const viewAs = String(req.headers['x-view-as-company'] || '').trim().toUpperCase();
    req.company = /^[A-Z0-9_-]{1,20}$/.test(viewAs) ? viewAs : null;
  } else {
    req.company = user.company || 'CW';
  }
  next();
}

/** Apply the company scope to a SQL WHERE fragment. Usage:
 *    const { clause, params } = companyFilter(req, []);
 *    const rows = await pool.query(`SELECT * FROM x WHERE 1=1 ${clause}`, params);
 *  req.company === null (System Admin) means no filter — every company's rows. */
export function companyFilter(req, params = []) {
  if (req.company == null) return { clause: '', params };
  params.push(req.company);
  return { clause: `AND company = $${params.length}`, params };
}
