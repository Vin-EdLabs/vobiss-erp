/** Canonical roles — keep in sync with backend/roles.js SYSTEM_ROLES */

export const ALL_STAFF_ROLES = [
  'user',
  'admin',
  'requester',
  'approver',
  'issuer',
  'finance',
  'finance_manager',
  'director',
  'cto',
  'superadmin',
  'system_admin',
  'stock_admin',
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
  'customer',
  'hr',
] as const;

export type StaffRole = (typeof ALL_STAFF_ROLES)[number];

export const UNIT_GROUP_MANAGER_ROLES = [
  'admin',
  'superadmin',
  'system_admin',
  'director',
  'cto',
  'hr',
  'noc_manager',
  'ts_manager',
  'ip_manager',
  'finance_manager',
] as const;

export function canManageUnitGroups(user?: {
  role?: string;
  main_role?: string;
  roles?: string[];
  unit?: string | null;
  units?: string[] | string | null;
  position?: string | null;
} | null): boolean {
  if (!user) return false;
  if (isSystemAdminAccount(user) || isAdminOperator(user)) return true;
  if (isHrStaff(user)) return true;
  const candidates = new Set<string>();
  if (user.role) candidates.add(user.role.toLowerCase());
  if (user.main_role) candidates.add(user.main_role.toLowerCase());
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) candidates.add(String(r).toLowerCase());
  }
  return UNIT_GROUP_MANAGER_ROLES.some((r) => candidates.has(r));
}

export function isSuperAdmin(user?: {
  role?: string;
  main_role?: string;
  roles?: string[];
} | null): boolean {
  if (!user) return false;
  const candidates = new Set<string>();
  if (user.role) candidates.add(user.role.toLowerCase());
  if (user.main_role) candidates.add(user.main_role.toLowerCase());
  if (Array.isArray(user.roles)) {
    for (const r of user.roles) candidates.add(String(r).toLowerCase());
  }
  return candidates.has('superadmin') || candidates.has('system_admin');
}

export const SYSTEM_ADMIN_LABEL = 'System Admin';

export function isSystemAdminAccount(user?: {
  username?: string | null;
  role?: string;
  main_role?: string;
  roles?: string[] | string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null): boolean {
  if (!user) return false;
  const roles = getUserRoles(user);
  const username = String(user.username || '').trim().toLowerCase();
  const fullName = String(
    user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ')
  )
    .trim()
    .toLowerCase();
  if (username === 'superadmin') return true;
  if (
    (fullName === 'admin super' || fullName === 'system admin') &&
    (roles.includes('superadmin') || roles.includes('system_admin'))
  ) return true;
  return false;
}

/** Admin role — system tools only. Not the reserved Superadmin account. */
export function isAdminOperator(user?: {
  username?: string | null;
  role?: string;
  main_role?: string;
  roles?: string[] | string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
} | null): boolean {
  if (!user || isSystemAdminAccount(user)) return false;
  return userHasAnyRole(user, ['admin', 'superadmin', 'system_admin']);
}

export const SYSTEM_OPERATOR_ROLES: string[] = ['admin', 'superadmin', 'system_admin'];

/** Every authenticated user lands here after login */
export const POST_LOGIN_PATH = '/workspace';

export const WORKSPACE_ROLES: string[] = [...ALL_STAFF_ROLES];

export const TICKET_SUPPORT_ROLES: string[] = [
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

/** CX module pages (dashboard, tickets, customers, etc.) */
export const CX_MODULE_ROLES: string[] = [...TICKET_SUPPORT_ROLES];

export const NOC_DASHBOARD_ROLES: string[] = [
  'noc',
  'noc_manager',
  'noc_supervisor',
  'cx',
  'director',
  'cto',
  'superadmin',
];

export const IP_TICKET_ROLES: string[] = [
  'ip',
  'ip_manager',
  'ip_supervisor',
  'director',
  'cto',
  'superadmin',
  'noc',
  'noc_manager',
  'cx',
];

export const FIELD_TICKET_ROLES: string[] = [
  'field_engineer',
  'field_engineer_admin',
  'ts_manager',
  'ts_supervisor',
  'director',
  'cto',
  'superadmin',
  'cx',
  'noc',
];

export const FINANCE_ROLES: string[] = [
  'finance',
  'finance_manager',
  'superadmin',
  'issuer',
  'field_engineer_admin',
  'director',
];

export const INVENTORY_ADMIN_ROLES: string[] = [
  'issuer',
  'superadmin',
  'stock_admin',
  'director',
];

export const APPROVER_ROLES: string[] = [
  'approver',
  'superadmin',
  'field_engineer_admin',
  'finance',
  'finance_manager',
  'director',
  'noc_manager',
  'noc_supervisor',
  'ip_manager',
  'ip_supervisor',
  'ts_manager',
  'ts_supervisor',
];

export const REQUESTER_ROLES: string[] = WORKSPACE_ROLES.filter(
  (r) => !['customer', 'director', 'cto'].includes(r)
);

export const CASH_REQUEST_ROLES: string[] = [
  ...REQUESTER_ROLES,
];

export const CUSTOMER_PORTAL_STAFF_ROLES: string[] = [
  'customer',
  ...CX_MODULE_ROLES,
];

export const DIRECTOR_DASHBOARD_ROLES: string[] = ['director', 'cto', 'superadmin'];

export const MAIN_DASHBOARD_ROLES: string[] = ['issuer', 'superadmin', 'stock_admin'];

export const APPROVED_FORMS_ROLES: string[] = ['issuer', 'superadmin', 'director'];

export const REPORTS_ROLES: string[] = [
  'superadmin',
  'director',
  'cto',
];

export const ITEMS_OUT_ROLES: string[] = [
  ...APPROVER_ROLES,
  'issuer',
  'stock_admin',
];

export const PRODUCTION_ACCESS_ROLES: string[] = [
  'requester',
  'approver',
  'issuer',
  'superadmin',
  'stock_admin',
  'director',
  'finance',
  'finance_manager',
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
  'project',
  'cto',
];

export const FIELD_ACTIVITY_ROLES: string[] = [
  'superadmin',
  'issuer',
  'field_engineer',
  'field_engineer_admin',
  'ts_manager',
  'ts_supervisor',
  'director',
  'cto',
];

export const EXEC_ROLES: string[] = ['director', 'cto', 'superadmin'];

export const HR_ROLES: string[] = ['hr'];
export const HR_POSITIONS: string[] = ['HR'];
export const HR_UNITS: string[] = ['hr'];
export const CX_POSITIONS: string[] = ['Account Manager', 'Relationship Officer', 'Customer Support'];

export function canonicalizeUnitSlug(unit?: string | null): string {
  const slug = String(unit || '').trim().toLowerCase();
  if (!slug) return '';
  if (slug === 'tx') return 'ts';
  return slug;
}

export function getUserUnits(user: {
  unit?: string | null;
  units?: string[] | string | null;
} | null | undefined): string[] {
  if (!user) return [];
  const raw: unknown[] = [user.unit];
  if (Array.isArray(user.units)) raw.push(...user.units);
  else if (typeof user.units === 'string' && user.units.trim()) {
    try {
      const parsed = JSON.parse(user.units);
      if (Array.isArray(parsed)) raw.push(...parsed);
    } catch {
      raw.push(user.units);
    }
  }
  return [...new Set(raw.map((v) => canonicalizeUnitSlug(String(v || ''))).filter(Boolean))];
}

/** HR module access: unit, position, or legacy role. Superadmin is handled separately. */
export function isHrStaff(user: {
  role?: string;
  main_role?: string;
  roles?: string[] | string;
  unit?: string | null;
  units?: string[] | string | null;
  position?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  if (userHasAnyRole(user, ['hr'])) return true;
  if (getUserUnits(user).includes('hr')) return true;
  return String(user.position || '').trim().toLowerCase() === 'hr';
}

/** Ticket Report — R.O, superadmin, managers, CTO/Director only */
export const TICKET_REPORT_ROLES: string[] = [
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

export const CASH_REPORT_ROLES: string[] = [
  'superadmin',
  'finance_manager',
  'director',
  'cto',
];

export const SERVICE_REQUEST_REPORT_ROLES: string[] = [
  'superadmin',
  'director',
  'cto',
  'project',
  'ts_manager',
  'ts_supervisor',
  'ip_manager',
  'ip_supervisor',
  'noc_manager',
  'noc_supervisor',
];

/** Report System hub — union of report types */
export const REPORT_SYSTEM_ROLES: string[] = [
  ...new Set([...TICKET_REPORT_ROLES, ...REPORTS_ROLES, ...CASH_REPORT_ROLES, ...SERVICE_REQUEST_REPORT_ROLES]),
];

export function userCanAccessReport(
  userRole: string | undefined,
  allowed: string[]
): boolean {
  if (!userRole) return false;
  const roles = userRole.split(',').map((r) => r.trim().toLowerCase());
  return allowed.some((a) => roles.includes(a.toLowerCase()));
}

/** CTO and Director share the same access, menus, and workspace. */
export const DIRECTOR_CTO_ROLES: string[] = ['director', 'cto'];

export function isDirectorOrCto(role?: string): boolean {
  const r = (role || '').trim().toLowerCase();
  return DIRECTOR_CTO_ROLES.includes(r);
}

/** Map legacy `cto` slug to shared director menu/config key. */
export function normalizeMenuRole(role: string): string {
  const r = role.trim().toLowerCase();
  if (isDirectorOrCto(r)) return 'director';
  return r;
}

export function formatRoleLabel(role?: string): string {
  if (isDirectorOrCto(role)) return 'CTO / Director';
  const r = (role || '').trim().toLowerCase();
  if (r === 'project') return 'Project Unit';
  if (r === 'hr') return 'Human Resources';
  return (role || '').replace(/_/g, ' ');
}

export interface QuickLink {
  label: string;
  path: string;
  description: string;
}

/** Role slug from user record (handles comma-separated legacy values). */
export function resolvePrimaryRole(user: {
  role?: string;
  main_role?: string;
  roles?: string[] | string;
} | null | undefined): string {
  if (!user) return 'requester';
  const candidates: string[] = [];
  if (user.main_role) candidates.push(String(user.main_role));
  if (user.role) candidates.push(String(user.role));
  const raw = user.roles;
  if (Array.isArray(raw)) candidates.push(...raw.map(String));
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) candidates.push(...parsed.map(String));
    } catch {
      candidates.push(raw);
    }
  }
  for (const c of candidates) {
    for (const part of c.split(',')) {
      const v = part.trim().toLowerCase();
      if (ALL_STAFF_ROLES.includes(v as StaffRole)) return v;
    }
  }
  return 'requester';
}

export function getUserRoles(user: {
  role?: string;
  main_role?: string;
  roles?: string[] | string;
} | null | undefined): string[] {
  if (!user) return [];
  const set = new Set<string>();
  const add = (raw?: string) => {
    if (!raw) return;
    raw.split(',').forEach((p) => {
      const v = p.trim().toLowerCase();
      if (v) set.add(v);
    });
  };
  add(user.main_role);
  add(user.role);
  const raw = user.roles;
  if (Array.isArray(raw)) raw.forEach((r) => add(String(r)));
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach((r) => add(String(r)));
      else add(raw);
    } catch {
      add(raw);
    }
  }
  return [...set];
}

export function userHasAnyRole(
  user: Parameters<typeof getUserRoles>[0],
  allowedRoles: string[]
): boolean {
  if (!allowedRoles?.length) return true;
  const userRoles = getUserRoles(user);
  const allowed = allowedRoles.map((r) => r.toLowerCase());
  return userRoles.some((r) => {
    if (allowed.includes(r)) return true;
    if (isDirectorOrCto(r) && allowed.some((a) => isDirectorOrCto(a))) return true;
    return false;
  });
}

/** Quick links on My Workspace — includes role dashboard where applicable */
export function getWorkspaceQuickLinks(
  role: string,
  permissions?: {
    realm_material_approver?: boolean;
    realm_cash_approver?: boolean;
  } | null
): QuickLink[] {
  const r = normalizeMenuRole(role);
  const profile: QuickLink = {
    label: 'Profile & Security',
    path: '/profile',
    description: 'Password and account settings',
  };

  const byRole: Record<string, QuickLink[]> = {
    user: [
      { label: 'Material Requests', path: '/request-forms', description: 'Submit or track requests' },
      { label: 'Cash Advance', path: '/cash-request', description: 'Request petty cash' },
      profile,
    ],
    admin: [
      { label: 'User Management', path: '/users', description: 'Manage staff accounts' },
      { label: 'Report System', path: '/staff/reports', description: 'Monitor operations' },
      profile,
    ],
    requester: [
      { label: 'Material Requests', path: '/request-forms', description: 'Submit or track requests' },
      { label: 'Cash Advance', path: '/cash-request', description: 'Request petty cash' },
      profile,
    ],
    approver: [
      { label: 'Material Approvals', path: '/material-approvals', description: 'Material requests awaiting you' },
      { label: 'Cash Approvals', path: '/cash-approvals', description: 'Cash requests awaiting you' },
      { label: 'Material Requests', path: '/request-forms', description: 'All request forms' },
      profile,
    ],
    issuer: [
      { label: 'Inventory Dashboard', path: '/dashboard', description: 'Stock & operations overview' },
      { label: 'Items', path: '/inventory', description: 'Manage catalogue' },
      { label: 'Low Stock', path: '/low-stock', description: 'Alerts' },
      profile,
    ],
    superadmin: [
      { label: 'Admin Dashboard', path: '/dashboard', description: 'System overview' },
      { label: 'User Management', path: '/users', description: 'Manage accounts' },
      { label: 'System Messages', path: '/system-messages', description: 'Broadcast alerts' },
      { label: 'Configuration', path: '/configuration', description: 'Workflow & escalation' },
      profile,
    ],
    stock_admin: [
      { label: 'Inventory Dashboard', path: '/dashboard', description: 'Stock overview' },
      { label: 'Items', path: '/inventory', description: 'Manage items' },
      { label: 'Low Stock', path: '/low-stock', description: 'Stock alerts' },
      profile,
    ],
    finance: [
      { label: 'Finance Approvals', path: '/finance-approvals', description: 'Cash requests' },
      profile,
    ],
    finance_manager: [
      { label: 'Finance Approvals', path: '/finance-approvals', description: 'Approve cash requests' },
      { label: 'Cash Report', path: '/staff/reports/cash', description: 'Financial reports' },
      profile,
    ],
    director: [
      { label: 'CTO / Directors Dashboard', path: '/director/dashboard', description: 'Executive overview' },
      { label: 'Community Chat', path: '/chat', description: 'Ticket threads, DMs, and team channels' },
      { label: 'Report System', path: '/staff/reports', description: 'Ticket and support analytics' },
      { label: 'Ticket Report', path: '/staff/reports/tickets', description: 'All tickets — pending & completed' },
      { label: 'Executive Escalations', path: '/staff/director/escalations', description: 'CTO / Director queue' },
      { label: 'All Tickets', path: '/staff/cx/tickets', description: 'All tickets — new, pending, and completed' },
      { label: 'Search for Tickets', path: '/staff/cx/ticket-search', description: 'Find any ticket by number' },
      { label: 'User Work History', path: '/staff/cx/user-work-history', description: 'Staff ticket activity' },
      { label: 'Field Engineer Map', path: '/field/map', description: 'Live map of field engineer activity' },
      { label: 'All Service Requests', path: '/project-request/project', description: 'All statuses — pending, ongoing, completed' },
      { label: 'Global Search', path: '/director/search', description: 'Search tickets, requests, and projects' },
      { label: 'Audit Logs', path: '/audit-logs', description: 'System actions with user, IP, and timestamp' },
      profile,
    ],
    cx: [
      { label: 'CX Dashboard', path: '/staff/cx/dashboard', description: 'Support overview' },
      { label: 'Ticket Queue', path: '/staff/cx/tickets', description: 'All tickets' },
      profile,
    ],
    noc: [
      { label: 'NOC Dashboard', path: '/staff/noc/dashboard', description: 'Network operations' },
      { label: 'NOC Tickets', path: '/staff/noc/tickets', description: 'Your ticket queue' },
      profile,
    ],
    noc_manager: [
      { label: 'Manager Escalations', path: '/staff/noc-manager/escalations', description: 'NOC manager queue' },
      { label: 'Ticket Report', path: '/staff/reports/tickets', description: 'All tickets — pending & completed' },
      { label: 'NOC Dashboard', path: '/staff/noc/dashboard', description: 'Team overview' },
      { label: 'NOC Tickets', path: '/staff/noc/tickets', description: 'All NOC tickets' },
      profile,
    ],
    noc_supervisor: [
      { label: 'NOC Dashboard', path: '/staff/noc/dashboard', description: 'Supervisor overview' },
      { label: 'NOC Tickets', path: '/staff/noc/tickets', description: 'Ticket queue' },
      profile,
    ],
    relationship_officer: [
      { label: 'R.O Queue', path: '/staff/ro/escalations', description: 'Relationship officer tickets' },
      { label: 'Ticket Report', path: '/staff/reports/tickets', description: 'All tickets — pending & completed' },
      { label: 'CX Tickets', path: '/staff/cx/tickets', description: 'Customer tickets' },
      profile,
    ],
    ip: [
      { label: 'IP Ticket Queue', path: '/staff/ip/tickets', description: 'Integration work' },
      profile,
    ],
    ip_manager: [
      { label: 'IP Ticket Queue', path: '/staff/ip/tickets', description: 'IP team queue' },
      profile,
    ],
    ip_supervisor: [
      { label: 'IP Ticket Queue', path: '/staff/ip/tickets', description: 'IP tickets' },
      profile,
    ],
    ts_manager: [
      { label: 'CX Dashboard', path: '/staff/cx/dashboard', description: 'TS overview' },
      { label: 'Ticket Queue', path: '/staff/cx/tickets', description: 'Project-related tickets' },
      profile,
    ],
    ts_supervisor: [
      { label: 'Ticket Queue', path: '/staff/cx/tickets', description: 'Support tickets' },
      profile,
    ],
    field_engineer: [
      { label: 'Field Dashboard', path: '/field/dashboard', description: 'Field overview' },
      { label: 'Field Tickets', path: '/staff/field/tickets', description: 'Assigned tickets' },
      { label: 'Add Activity', path: '/field/add', description: 'Log site work' },
      profile,
    ],
    field_engineer_admin: [
      { label: 'Field Dashboard', path: '/field/dashboard', description: 'Field team overview' },
      { label: 'Field Activities', path: '/field/activities', description: 'All field logs' },
      { label: 'Field Tickets', path: '/staff/field/tickets', description: 'Engineer tickets' },
      profile,
    ],
    customer: [
      { label: 'Customer Portal', path: '/customer/dashboard', description: 'Your account' },
      { label: 'Create Ticket', path: '/customer/create-ticket', description: 'Get support' },
      profile,
    ],
    hr: [
      { label: 'HR Dashboard', path: '/hr/dashboard', description: 'People operations overview' },
      { label: 'Employees', path: '/hr/employees', description: 'Staff directory and profiles' },
      { label: 'Leave Management', path: '/hr/leave', description: 'Leave records and balances' },
      { label: 'Payroll', path: '/hr/payroll', description: 'Monthly payroll and payslips' },
      profile,
    ],
  };

  let links =
    byRole[r] || [
      { label: 'System Guide', path: '/system-guide', description: 'How to use Vobiss' },
      profile,
    ];
  if (r === 'customer') return links;

  if (permissions) {
    links = links.filter((l) => {
      if (l.path === '/material-approvals') return !!permissions.realm_material_approver;
      if (l.path === '/cash-approvals') return !!permissions.realm_cash_approver;
      return true;
    });
    const extras: QuickLink[] = [];
    if (permissions.realm_material_approver && !links.some((l) => l.path === '/material-approvals')) {
      extras.push({
        label: 'Material Approvals',
        path: '/material-approvals',
        description: 'Material requests awaiting you',
      });
    }
    if (permissions.realm_cash_approver && !links.some((l) => l.path === '/cash-approvals')) {
      extras.push({
        label: 'Cash Approvals',
        path: '/cash-approvals',
        description: 'Cash requests awaiting you',
      });
    }
    links = [...extras, ...links];
  }

  const hrLinks: QuickLink[] = [
    { label: 'Clock In', path: '/hr-self/attendance', description: 'Sign your attendance' },
    { label: 'Leave Request', path: '/hr-self/leave', description: 'Apply for leave' },
    { label: 'HR Forms', path: '/hr-self/forms', description: 'Request letters and advances' },
  ];
  const profileIdx = links.findIndex((l) => l.path === '/profile');
  if (profileIdx >= 0) {
    return [...links.slice(0, profileIdx), ...hrLinks, ...links.slice(profileIdx)];
  }
  return [...links, ...hrLinks];
}

/** Primary CTA on My Workspace (first non-profile tool for the role). */
export function getPrimaryWorkspaceAction(role: string): QuickLink | null {
  const links = getWorkspaceQuickLinks(role).filter((l) => l.path !== '/profile');
  return links[0] ?? null;
}

export function getRoleWorkspaceTip(role: string): string {
  const r = normalizeMenuRole(role);
  const tips: Record<string, string> = {
    requester: 'Submit material requests and track approvals from your quick links.',
    approver: 'Review pending approvals first — items may be waiting on you.',
    issuer: 'Check low stock alerts and inventory levels before issuing items.',
    superadmin: 'Broadcast system messages when teams need urgent updates.',
    stock_admin: 'Keep item quantities accurate so requesters see real availability.',
    finance: 'Cash advance requests land in Finance Approvals for your review.',
    finance_manager: 'Approve or reject cash requests promptly to unblock field teams.',
    director:
      'As CTO / Director, review executive escalations and the directors dashboard daily.',
    cx: 'New tickets route to NOC first — monitor the master queue for handoffs.',
    noc: 'You are the first line for new tickets — accept and triage quickly.',
    noc_manager: 'Manager escalations time out — resolve before auto-escalation to R.O.',
    noc_supervisor: 'Support NOC analysts and watch the ticket queue for bottlenecks.',
    relationship_officer: 'R.O queue holds customer-critical escalations — prioritize SLA.',
    ip: 'IP integration work appears in your ticket queue when NOC escalates.',
    ip_manager: 'Coordinate IP engineers on integration tickets from the queue.',
    ip_supervisor: 'Review IP queue depth and unblock stuck integrations.',
    ts_manager: 'TS reviews service requests — align tickets with active projects.',
    ts_supervisor: 'Help TX track service-linked tickets and site work.',
    field_engineer: 'Log field activities and close assigned tickets when work is done.',
    field_engineer_admin: 'Oversee field logs and engineer ticket assignments.',
    customer: 'Create a ticket anytime — our team will route it to the right unit.',
    hr: 'Start with the HR dashboard — leave, payroll, and new hires land there first.',
  };
  return tips[r] || 'Use quick links below for your most common tasks.';
}
