/** System access roles shown on the Users page. System Admin is never listed here. */
export const SYSTEM_ACCESS_ROLES = ['user', 'admin', 'superadmin'];

/** Canonical roles stored in DB (includes legacy slugs for existing accounts). */
export const SYSTEM_ROLES = [
  ...SYSTEM_ACCESS_ROLES,
  'system_admin',
  'hr', // legacy — HR is now a unit/position, kept so existing accounts still log in
  'requester',
  'issuer',
  'finance',
  'finance_manager',
  'director',
  'cto',
  'cx',
  'noc',
  'noc_manager',
  'noc_supervisor',
  'ip',
  'ip_manager',
  'ip_supervisor',
  'ts_manager',
  'ts_supervisor',
  'project',
  'field_engineer',
  'field_engineer_admin',
  'relationship_officer',
  'approver', // legacy — maps to supervisor-style approvals
  'stock_admin',
  'customer',
];

/** Drop legacy CHECK so new roles can be saved (idempotent). */
export async function migrateUserRoleConstraint(pool) {
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
      END IF;
    END $$;
  `);
}

export function isValidSystemRole(role) {
  return normalizeSystemRole(role) !== null;
}

/** Single canonical role slug, or null if not allowed. */
export function normalizeSystemRole(role) {
  if (role == null || role === '') return null;
  const raw = String(role).trim().toLowerCase();
  const single = raw.includes(',') ? raw.split(',')[0].trim() : raw;
  return SYSTEM_ROLES.includes(single) ? single : null;
}

export function invalidRoleMessage(role) {
  const shown = role == null || role === '' ? '(empty)' : String(role);
  return `Invalid role "${shown}". Choose one of: ${SYSTEM_ROLES.join(', ')}`;
}

/** Default project pipeline unit slugs when assigning a primary role. */
export function defaultUnitsForRole(role) {
  const r = normalizeSystemRole(role);
  if (!r) return [];
  const map = {
    user: [],
    admin: [],
    superadmin: ['project', 'ts', 'ip', 'noc'],
    system_admin: ['project', 'ts', 'ip', 'noc'],
    project: ['project'],
    noc: ['noc', 'project'],
    noc_supervisor: ['noc', 'project'],
    noc_manager: ['project', 'ts', 'ip', 'noc'],
    ip: ['ip', 'project'],
    ip_supervisor: ['ip', 'project'],
    ip_manager: ['project', 'ts', 'ip', 'noc'],
    ts_manager: ['project', 'ts', 'ip', 'noc'],
    ts_supervisor: ['ts', 'project'],
    director: ['project', 'ts', 'ip', 'noc'],
    cto: ['project', 'ts', 'ip', 'noc'],
    field_engineer: ['ts', 'project'],
    field_engineer_admin: ['ts', 'ip', 'noc', 'project'],
    cx: ['cx'],
    finance: ['finance'],
    hr: ['hr'],
  };
  return map[r] ? [...map[r]] : [];
}

export function parseUserUnitsArray(units) {
  if (!units) return [];
  if (Array.isArray(units)) {
    return units.map((u) => canonicalizeUnitSlug(u)).filter(Boolean);
  }
  if (typeof units === 'string') {
    try {
      const parsed = JSON.parse(units);
      if (Array.isArray(parsed)) {
        return parsed.map((u) => canonicalizeUnitSlug(u)).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }
  return [];
}

/** A person can belong to at most two units / departments. */
export function capUserUnits(units, max = 2) {
  return [...new Set(parseUserUnitsArray(units))].slice(0, max);
}

/** The seeded System Admin account — not assignable, more powerful than superadmin. */
export function isSystemAdminAccount(user) {
  if (!user) return false;
  const slugs = new Set();
  const add = (value) => {
    if (!value) return;
    String(value)
      .split(',')
      .forEach((part) => {
        const slug = part.trim().toLowerCase();
        if (slug) slugs.add(slug);
      });
  };
  add(user.role);
  add(user.main_role);
  if (Array.isArray(user.roles)) user.roles.forEach(add);
  else add(user.roles);
  const username = String(user.username || '').trim().toLowerCase();
  const fullName = (
    String(user.full_name || '').trim() ||
    `${user.first_name || ''} ${user.last_name || ''}`.trim()
  ).toLowerCase();
  if (slugs.has('system_admin')) return true;
  if (username === 'superadmin') return true;
  if (
    (fullName === 'admin super' || fullName === 'system admin') &&
    (slugs.has('superadmin') || slugs.has('system_admin'))
  ) return true;
  return false;
}

/** Transmission is TS. Legacy accounts may still store TX. */
export function canonicalizeUnitSlug(unit) {
  const slug = String(unit || '').toLowerCase().trim();
  if (!slug) return '';
  if (slug === 'tx') return 'ts';
  return slug;
}

/** Units from DB merged with defaults implied by primary role (for project workflow + chat). */
export function effectiveUnitsForUser(user) {
  const fromDb = parseUserUnitsArray(user?.units);
  const primary = canonicalizeUnitSlug(user?.unit);
  const fromRole = defaultUnitsForRole(user?.main_role || user?.role);
  return [...new Set([primary, ...fromDb, ...fromRole].filter(Boolean))];
}

export function hasProjectUnitAccess(user) {
  if (!user) return false;
  const role = String(user.main_role || user.role || '').toLowerCase();
  const pos = String(user.position || '').trim().toLowerCase();
  if (isSystemAdminAccount(user) || role === 'project' || role === 'director' || role === 'cto') return true;
  if (pos === 'director' || pos === 'cto') return true;
  const units = effectiveUnitsForUser(user);
  return units.includes('project') || units.some((u) => u.startsWith('project'));
}

export const TICKET_SUPPORT_ROLES = [
  'cx',
  'noc',
  'noc_manager',
  'noc_supervisor',
  'ip',
  'ip_manager',
  'ip_supervisor',
  'ts_manager',
  'ts_supervisor',
  'field_engineer',
  'field_engineer_admin',
  'relationship_officer',
  'approver',
  'director',
  'cto',
  'superadmin',
];

export const MANAGER_ROLES = ['noc_manager', 'ts_manager', 'ip_manager', 'finance_manager'];
export const SUPERVISOR_ROLES = ['noc_supervisor', 'ts_supervisor', 'ip_supervisor', 'approver'];

/** Roles allowed to create unit chat groups and manage their members */
export const UNIT_GROUP_MANAGER_ROLES = [
  'admin',
  'superadmin',
  'system_admin',
  'director',
  'cto',
  'hr',
  ...MANAGER_ROLES,
];

export function canManageUnitGroups(user) {
  if (isSystemAdminAccount(user)) return true;
  if (userHasAnyRole(user, UNIT_GROUP_MANAGER_ROLES)) return true;
  const main = String(user?.main_role || user?.role || '').toLowerCase();
  if (UNIT_GROUP_MANAGER_ROLES.includes(main)) return true;
  const units = effectiveUnitsForUser(user);
  if (units.includes('hr')) return true;
  const pos = String(user?.position || '').trim().toLowerCase();
  return pos === 'hr';
}

export function isSuperAdmin(user) {
  if (!user) return false;
  const candidates = new Set();
  if (user.role) candidates.add(String(user.role).toLowerCase());
  if (user.main_role) candidates.add(String(user.main_role).toLowerCase());
  const raw = user.roles;
  if (Array.isArray(raw)) raw.forEach((r) => candidates.add(String(r).toLowerCase()));
  return candidates.has('superadmin');
}

/** Superadmin, managers/supervisors, CTO/Director — ticket report only */
export const TICKET_REPORT_ROLES = [
  'superadmin',
  'director',
  'cto',
  'noc_manager',
  'ts_manager',
  'ip_manager',
  'noc_supervisor',
  'ts_supervisor',
  'ip_supervisor',
];

export const CASH_REPORT_ROLES = [
  'superadmin',
  'finance_manager',
  'director',
  'cto',
];

export const INVENTORY_REPORT_ROLES = [
  'superadmin',
  'director',
  'cto',
];

export function userHasAnyRole(user, roles) {
  if (!user || !roles?.length) return false;
  const list = new Set();
  const add = (value) => {
    if (!value) return;
    String(value)
      .split(',')
      .forEach((part) => {
        const slug = part.trim().toLowerCase();
        if (slug) list.add(slug);
      });
  };
  add(user.role);
  add(user.main_role);
  if (Array.isArray(user.roles)) user.roles.forEach(add);
  else add(user.roles);
  return roles.some((r) => list.has(String(r).toLowerCase()));
}
