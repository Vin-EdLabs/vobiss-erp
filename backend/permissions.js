import { isSystemAdminAccount } from './roles.js';

const GLOBAL_DASHBOARD_POSITIONS = new Set([
  'director',
  'operations director',
  'finance director',
  'technical director',
  'general manager',
]);

const MATERIAL_EXECUTION_POSITIONS = new Set(['procurement', 'procurement officer', 'store keeper', 'stock controller']);
const CASH_RELEASE_POSITIONS = new Set(['finance', 'finance officer', 'finance manager']);

const LEGACY_ROLE_MAP = {
  system_admin: { systemRole: 'system_admin', position: null, unit: null },
  superadmin: { systemRole: 'superadmin', position: null, unit: null },
  admin: { systemRole: 'admin', position: null, unit: null },
  requester: { systemRole: 'user', position: null, unit: null },
  user: { systemRole: 'user', position: null, unit: null },
  approver: { systemRole: 'user', position: 'Supervisor', unit: null },
  director: { systemRole: 'user', position: 'Director', unit: null },
  cto: { systemRole: 'user', position: 'Technical Director', unit: null },
  finance: { systemRole: 'user', position: 'Finance', unit: 'Finance' },
  finance_manager: { systemRole: 'user', position: 'Finance', unit: 'Finance' },
  issuer: { systemRole: 'user', position: 'Procurement', unit: 'Procurement' },
  stock_admin: { systemRole: 'user', position: 'Procurement', unit: 'Procurement' },
  cx: { systemRole: 'user', position: 'Customer Support', unit: 'CX' },
  relationship_officer: { systemRole: 'user', position: 'Relationship Officer', unit: 'CX' },
  noc: { systemRole: 'user', position: 'Engineer', unit: 'NOC' },
  noc_manager: { systemRole: 'user', position: 'NOC Manager', unit: 'NOC' },
  noc_supervisor: { systemRole: 'user', position: 'NOC Supervisor', unit: 'NOC' },
  ip: { systemRole: 'user', position: 'Engineer', unit: 'IP' },
  ip_manager: { systemRole: 'user', position: 'IP Manager', unit: 'IP' },
  ip_supervisor: { systemRole: 'user', position: 'IP Supervisor', unit: 'IP' },
  ts_manager: { systemRole: 'user', position: 'TX Manager', unit: 'TX' },
  ts_supervisor: { systemRole: 'user', position: 'TX Supervisor', unit: 'TX' },
  project: { systemRole: 'user', position: 'Project Manager', unit: 'Project Unit' },
  field_engineer: { systemRole: 'user', position: 'Engineer', unit: null },
  field_engineer_admin: { systemRole: 'admin', position: 'Project Manager', unit: 'Operations' },
};

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function roleSlugs(user) {
  const roles = new Set();
  const add = (value) => {
    if (!value) return;
    String(value).split(',').forEach((part) => {
      const slug = part.trim().toLowerCase();
      if (slug) roles.add(slug);
    });
  };

  add(user?.main_role);
  add(user?.role);
  if (Array.isArray(user?.roles)) {
    user.roles.forEach(add);
  } else if (typeof user?.roles === 'string') {
    try {
      const parsed = JSON.parse(user.roles);
      if (Array.isArray(parsed)) parsed.forEach(add);
      else add(user.roles);
    } catch {
      add(user.roles);
    }
  }
  return [...roles];
}

function normalizedUnits(user) {
  const values = [];
  if (user?.unit) values.push(user.unit);
  if (user?.department) values.push(user.department);
  if (Array.isArray(user?.units)) values.push(...user.units);
  else if (typeof user?.units === 'string') {
    try {
      const parsed = JSON.parse(user.units);
      if (Array.isArray(parsed)) values.push(...parsed);
      else values.push(user.units);
    } catch {
      values.push(user.units);
    }
  }

  for (const role of roleSlugs(user)) {
    const mapped = LEGACY_ROLE_MAP[role]?.unit;
    if (mapped) values.push(mapped);
  }

  return values.map(normalize).filter(Boolean);
}

function normalizedPositions(user) {
  const positions = [];
  if (user?.position) positions.push(user.position);
  if (user?.job_title) positions.push(user.job_title);
  if (Array.isArray(user?.positions)) positions.push(...user.positions);

  for (const role of roleSlugs(user)) {
    const mapped = LEGACY_ROLE_MAP[role]?.position;
    if (mapped) positions.push(mapped);
  }

  return positions.map(normalize).filter(Boolean);
}

export function getSystemRole(user) {
  if (isSystemAdminAccount(user) || roleSlugs(user).includes('system_admin')) return 'system_admin';
  if (roleSlugs(user).includes('superadmin')) return 'superadmin';
  if (roleSlugs(user).includes('admin')) return 'admin';

  for (const role of roleSlugs(user)) {
    const mapped = LEGACY_ROLE_MAP[role]?.systemRole;
    if (mapped) return mapped;
  }

  return 'user';
}

export function isSuperadmin(user) {
  return getSystemRole(user) === 'superadmin';
}

export function isAdmin(user) {
  return getSystemRole(user) === 'admin';
}

export function isAdminSuper(user) {
  return isSystemAdminAccount(user);
}

export function isSystemOperator(user) {
  const role = getSystemRole(user);
  return role === 'system_admin' || role === 'superadmin' || role === 'admin';
}

export function isDirector(user) {
  return normalizedPositions(user).some((position) => GLOBAL_DASHBOARD_POSITIONS.has(position));
}

export function canBypassApprovalRestrictions(user) {
  return isAdminSuper(user) || isDirector(user);
}

export function canCreateMaterialRequest() {
  return true;
}

export function canCreateCashRequest() {
  return true;
}

let realmMaterialIds = new Set();
let realmCashIds = new Set();

export function setRealmApproverIds({ material_user_ids = [], cash_user_ids = [] } = {}) {
  realmMaterialIds = new Set((material_user_ids || []).map(Number).filter(Boolean));
  realmCashIds = new Set((cash_user_ids || []).map(Number).filter(Boolean));
}

export function isRealmMaterialApprover(user) {
  return realmMaterialIds.has(Number(user?.id));
}

export function isRealmCashApprover(user) {
  return realmCashIds.has(Number(user?.id));
}

export function canApproveMaterialRequest(user) {
  if (canBypassApprovalRestrictions(user)) return true;
  return isRealmMaterialApprover(user);
}

export function canApproveCashRequest(user) {
  if (canBypassApprovalRestrictions(user)) return true;
  if (isRealmCashApprover(user)) return true;
  return normalizedUnits(user).includes('finance') && normalizedPositions(user).some((position) => CASH_RELEASE_POSITIONS.has(position));
}

export function canExecuteMaterial(user) {
  if (canBypassApprovalRestrictions(user)) return true;
  const hasProcurementUnit = normalizedUnits(user).includes('procurement');
  const hasExecutionPosition = normalizedPositions(user).some((position) => MATERIAL_EXECUTION_POSITIONS.has(position));
  return hasProcurementUnit && hasExecutionPosition;
}

export function canReleaseCash(user) {
  if (canBypassApprovalRestrictions(user)) return true;
  return normalizedUnits(user).includes('finance') && normalizedPositions(user).some((position) => CASH_RELEASE_POSITIONS.has(position));
}

export function canAccessGlobalDashboard(user) {
  return canBypassApprovalRestrictions(user);
}

export function getPrimaryUnit(user) {
  const units = normalizedUnits(user);
  return units[0] || null;
}

export function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}
