export const ROLE_GROUPS = {
  FINANCE: ['finance_manager', 'finance', 'director', 'superadmin'],
  WAREHOUSE: ['warehouse', 'procurement', 'stock_admin', 'issuer', 'noc_manager', 'superadmin'],
  CX: ['cx_agent', 'cx', 'noc_agent', 'relationship_officer', 'superadmin'],
  MANAGER: [
    'noc_manager',
    'ts_manager',
    'tx_manager',
    'ip_manager',
    'project_manager',
    'finance_manager',
    'director',
    'cto',
    'admin',
    'superadmin',
  ],
  ALL: ['*'],
} as const;

export type VisibleTo = string[];

export type GuideUser = {
  role?: string | null;
  main_role?: string | null;
  roles?: string[] | null;
  unit?: string | null;
  units?: string[] | null;
  position?: string | null;
};

export const VOBI_ALL_STAFF = ROLE_GROUPS.ALL as unknown as string[];
export const VOBI_FINANCE = ROLE_GROUPS.FINANCE as unknown as string[];
export const VOBI_WAREHOUSE = ROLE_GROUPS.WAREHOUSE as unknown as string[];
export const VOBI_CX = ROLE_GROUPS.CX as unknown as string[];
export const VOBI_MANAGER = ROLE_GROUPS.MANAGER as unknown as string[];

const norm = (value?: string | null) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');

export function getUserGuideRoles(user?: GuideUser | null): string[] {
  if (!user) return [];

  const roles = [
    user.role,
    user.main_role,
    ...(Array.isArray(user.roles) ? user.roles : []),
    user.unit,
    ...(Array.isArray(user.units) ? user.units : []),
    user.position,
  ]
    .map(norm)
    .filter(Boolean);

  const position = norm(user.position);
  if (position.includes('director')) roles.push('director');
  if (position.includes('manager')) roles.push(`${position.split('_')[0]}_manager`, 'manager');
  if (position.includes('supervisor')) roles.push(`${position.split('_')[0]}_supervisor`, 'manager');

  return Array.from(new Set(roles));
}

export function isVisibleToUser(visibleTo: VisibleTo | undefined, userRoles: string[]): boolean {
  if (!visibleTo?.length || visibleTo.includes('*')) return true;
  const allowed = visibleTo.map(norm);
  return allowed.some((role) => userRoles.includes(role));
}

export function filterVisibleItems<T extends { visibleTo?: VisibleTo }>(items: T[], userRoles: string[]): T[] {
  return items.filter((item) => isVisibleToUser(item.visibleTo, userRoles));
}
