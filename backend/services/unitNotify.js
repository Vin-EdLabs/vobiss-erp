import pool from '../db.js';
import { createNotification } from '../db.js';

/**
 * Shared "who's in this unit" + "notify all of them" helpers for the 360° Service Request
 * Flow's stage-transition notifications. The equivalent pattern already exists three times
 * over (backend/services/fieldWork.js's resolveUnitRoleUserIds/notifyMany, ipUnit.js's
 * ipManagerUserIds/notifyMany, workflowTimeEngine.js's resolveUnitManagerIds) — this is the
 * canonical version for new call sites, deliberately checking BOTH role slugs (role/main_role/
 * roles array) AND unit membership (unit/units array), since this app represents "which unit
 * someone belongs to" both ways depending on how the account was set up (the same gap found
 * and fixed for IP Unit's own permission checks earlier this session).
 */
export async function resolveUnitRecipients({ roles = [], unitSlugs = [] } = {}) {
  const clauses = [];
  const params = [];
  if (roles.length) {
    params.push(roles);
    const roleClause = [
      `role = ANY($${params.length}::text[])`,
      `main_role = ANY($${params.length}::text[])`,
      `roles ?| $${params.length}`,
    ];
    // Most real accounts carry their job title in `position` ("IP Supervisor", "Director") with
    // role/main_role left as a generic account type ("admin"/"superadmin"/"user") — matching only
    // the exact role slug silently misses them, so also match position for the tier the slug
    // implies (derived from the slug itself, so this stays generic across every unit/stage).
    const positionWords = new Set();
    for (const r of roles) {
      const slug = String(r || '').toLowerCase();
      if (slug.endsWith('_manager')) positionWords.add('manager');
      else if (slug.endsWith('_supervisor')) positionWords.add('supervisor');
      else if (slug === 'director') positionWords.add('director');
      else if (slug === 'cto') positionWords.add('cto');
    }
    for (const word of positionWords) {
      params.push(`%${word}%`);
      roleClause.push(`LOWER(position) LIKE $${params.length}`);
    }
    clauses.push(`(${roleClause.join(' OR ')})`);
  }
  if (unitSlugs.length) {
    params.push(unitSlugs);
    clauses.push(`(unit = ANY($${params.length}::text[]) OR units ?| $${params.length})`);
  }
  if (!clauses.length) return [];
  // Both dimensions given ("role X" + "unit Y") must both hold — this is what makes it
  // "the Xes in unit Y", not "everyone in unit Y" or "every X anywhere". A dimension left empty
  // by the caller (e.g. unitSlugs-only for "everyone in this unit") is simply omitted, not OR'd.
  const result = await pool.query(
    `SELECT id FROM users WHERE deleted_at IS NULL AND (${clauses.join(' AND ')})`,
    params
  );
  return result.rows.map((r) => r.id);
}

export async function notifyMany(userIds, title, message, actorId, opts) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  await Promise.all(unique.map((uid) => createNotification(title, message, actorId, { ...opts, targetUserId: uid }).catch(() => {})));
}

/** Resolve + notify in one call — the shape every SR stage-transition notification uses. */
export async function notifyUnit({ roles = [], unitSlugs = [], title, message, actingUserId, linkUrl, notificationType }) {
  const userIds = await resolveUnitRecipients({ roles, unitSlugs });
  await notifyMany(userIds, title, message, actingUserId, { linkUrl, notificationType });
  return userIds;
}
