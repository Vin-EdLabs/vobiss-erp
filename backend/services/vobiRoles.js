import { isSystemAdminAccount, parseUserUnitsArray, canonicalizeUnitSlug } from '../roles.js';

// Every role gets these regardless of unit/department — mirrors 'my_work'/'chat' already being
// universal: every employee submits their own performance reports and transport/fuel/vehicle
// requests, and can ask about their own workflow-performance/attendance score, no matter which
// unit they're in.
const UNIVERSAL_MODULES = ['my_work', 'chat', 'performance_reports', 'transport', 'my_assessment', 'archive'];

export const ROLE_ACCESS = {
  cx: {
    sees_everything: false,
    modules: ['tickets_cx', 'service_requests', 'clients', 'chat'],
    description: 'Customer experience — clients, sites, CX tickets',
  },
  // Operators with admin role are NOT global — modules come from their units/department.
  admin: {
    sees_everything: false,
    modules: ['my_work', 'chat'],
    description: 'Admin operator — scoped to assigned units only',
  },
  director: {
    sees_everything: true,
    hr_full_access: true,
    modules: ['inventory', 'finance', 'tickets', 'hr', 'assets', 'field', 'service_requests', 'clients', 'users', 'chat', 'production', 'network_assets', 'noc_shifts', 'archive', 'admin_config'],
    description: 'Executive full view',
  },
  superadmin: {
    sees_everything: true,
    hr_full_access: true,
    modules: ['inventory', 'finance', 'tickets', 'hr', 'assets', 'field', 'service_requests', 'clients', 'users', 'audit', 'chat', 'production', 'network_assets', 'noc_shifts', 'archive', 'admin_config'],
    description: 'Full system access (System Admin only)',
  },
  hr: {
    sees_everything: false,
    hr_full_access: true,
    modules: ['hr', 'users', 'chat'],
    description: 'Full HR module access',
  },
  finance: {
    sees_everything: false,
    modules: ['finance', 'cash_requests', 'inventory', 'chat'],
    description: 'Finance and cash approvals',
  },
  noc: {
    sees_everything: false,
    modules: ['tickets_noc', 'service_requests', 'field', 'chat', 'noc_shifts'],
    description: 'NOC operations',
  },
  ip: {
    sees_everything: false,
    modules: ['tickets_ip', 'service_requests', 'chat', 'network_assets', 'ip_unit'],
    description: 'IP operations',
  },
  tx: {
    sees_everything: false,
    modules: ['tickets_tx', 'service_requests', 'chat', 'network_assets'],
    description: 'TX/Transmission operations',
  },
  project_unit: {
    sees_everything: false,
    modules: ['service_requests', 'field', 'chat', 'production'],
    description: 'Project management',
  },
  field_engineer: {
    sees_everything: false,
    modules: ['field', 'tickets_tx', 'service_requests', 'chat', 'my_work'],
    description: 'Field / TS operations',
  },
  issuer: {
    sees_everything: false,
    modules: ['inventory', 'chat', 'my_work'],
    description: 'Warehouse / stock issue',
  },
  approver: {
    sees_everything: false,
    modules: ['finance', 'inventory', 'chat', 'my_work'],
    description: 'Request approvals',
  },
  user: {
    sees_everything: false,
    modules: ['my_work', 'chat'],
    description: 'Standard staff access',
  },
};

// Apply the universal set to every role so it doesn't have to be repeated above.
for (const key of Object.keys(ROLE_ACCESS)) {
  const mods = new Set(ROLE_ACCESS[key].modules || []);
  UNIVERSAL_MODULES.forEach((m) => mods.add(m));
  ROLE_ACCESS[key].modules = [...mods];
}

const ROLE_ALIASES = {
  system_admin: 'superadmin',
  superadmin: 'superadmin',
  admin: 'admin',
  director: 'director',
  cto: 'director',
  hr: 'hr',
  finance: 'finance',
  finance_manager: 'finance',
  noc: 'noc',
  noc_manager: 'noc',
  noc_supervisor: 'noc',
  ip: 'ip',
  ip_manager: 'ip',
  ip_supervisor: 'ip',
  tx: 'tx',
  ts: 'tx',
  ts_manager: 'tx',
  ts_supervisor: 'tx',
  field_engineer: 'field_engineer',
  field_engineer_admin: 'field_engineer',
  cx: 'cx',
  relationship_officer: 'cx',
  project: 'project_unit',
  project_unit: 'project_unit',
  issuer: 'issuer',
  stock_admin: 'issuer',
  requester: 'user',
  approver: 'approver',
  user: 'user',
  customer: 'user',
};

const UNIT_MODULE_MAP = {
  noc: ['tickets_noc', 'service_requests', 'field', 'chat', 'noc_shifts'],
  ip: ['tickets_ip', 'service_requests', 'chat', 'network_assets', 'ip_unit'],
  ts: ['tickets_tx', 'service_requests', 'field', 'chat', 'network_assets'],
  tx: ['tickets_tx', 'service_requests', 'field', 'chat', 'network_assets'],
  cx: ['tickets_cx', 'service_requests', 'clients', 'chat'],
  sales: ['tickets_cx', 'clients', 'service_requests', 'chat'],
  project: ['service_requests', 'field', 'chat', 'production'],
  design: ['service_requests', 'chat', 'production'],
  finance: ['finance', 'cash_requests', 'chat'],
  hr: ['hr', 'chat'],
  operations: ['field', 'service_requests', 'chat'],
  inventory: ['inventory', 'chat'],
  warehouse: ['inventory', 'chat'],
  assets: ['assets', 'chat'],
};

export function canonicalVobiRole(role) {
  const raw = String(role || 'user').trim().toLowerCase();
  if (ROLE_ALIASES[raw]) return ROLE_ALIASES[raw];
  if (ROLE_ACCESS[raw]) return raw;
  return 'user';
}

function isExecutivePosition(position) {
  const pos = String(position || '').trim().toLowerCase();
  if (!pos) return false;
  if (pos === 'director' || pos === 'cto' || pos === 'chief') return true;
  if (pos.includes('director') || pos.includes('cto')) return true;
  if (/\bchief\b/.test(pos)) return true;
  return false;
}

function normalizeUnitList(units, unit) {
  const list = [
    ...parseUserUnitsArray(units),
    canonicalizeUnitSlug(unit),
  ]
    .map((u) => canonicalizeUnitSlug(u))
    .filter(Boolean);
  return [...new Set(list)];
}

/** Map assigned ERP units → Vobi module keys. */
export function modulesFromUnits(units = [], unit = null) {
  const mods = new Set(UNIVERSAL_MODULES);
  for (const raw of normalizeUnitList(units, unit)) {
    const slug = String(raw).toLowerCase();
    const mapped = UNIT_MODULE_MAP[slug];
    if (mapped) {
      mapped.forEach((m) => mods.add(m));
      continue;
    }
    if (slug.startsWith('project')) {
      UNIT_MODULE_MAP.project.forEach((m) => mods.add(m));
    }
  }
  return [...mods];
}

function isOperatorAdminRole(key) {
  return key === 'admin' || key === 'superadmin';
}

/**
 * Resolve Vobi access.
 * Full ERP visibility is ONLY for:
 *  - System Admin account (isSystemAdminAccount)
 *  - Director / CTO role
 *  - True executive position (Director / CTO / Chief)
 *
 * Plain admin / non–System-Admin superadmin with units → unit-scoped modules only.
 *
 * @param {string} role
 * @param {string|null} position
 * @param {object} [opts] user / units context
 */
export function getRoleAccess(role, position, opts = {}) {
  const key = canonicalVobiRole(role);
  const access = ROLE_ACCESS[key] || ROLE_ACCESS.user;
  const userLike = {
    username: opts.username,
    full_name: opts.full_name,
    first_name: opts.first_name,
    last_name: opts.last_name,
    role: opts.role || role,
    main_role: opts.main_role || role,
    roles: opts.roles,
  };
  const systemAdmin =
    opts.isSystemAdmin === true ||
    (opts.isSystemAdmin !== false && isSystemAdminAccount(userLike));

  // System Admin account — full access
  if (systemAdmin) {
    return {
      ...ROLE_ACCESS.superadmin,
      sees_everything: true,
      hr_full_access: true,
      modules: [...ROLE_ACCESS.superadmin.modules],
      key: 'superadmin',
      scoped_to_units: false,
    };
  }

  // Director / CTO (role or executive position) — executive view
  if (key === 'director' || isExecutivePosition(position)) {
    return {
      ...ROLE_ACCESS.director,
      sees_everything: true,
      hr_full_access: true,
      modules: [...ROLE_ACCESS.director.modules],
      key: 'director',
      scoped_to_units: false,
    };
  }

  const pos = String(position || '').trim().toLowerCase();
  const unitList = normalizeUnitList(opts.units, opts.unit);

  // Admin / non–System-Admin superadmin: NEVER full access — scope to units
  if (isOperatorAdminRole(key)) {
    const unitMods = modulesFromUnits(opts.units, opts.unit);
    const modules = new Set(unitMods);
    let hrFull = false;

    if (pos === 'hr' || pos.includes('human resource')) {
      modules.add('hr');
      hrFull = true;
    }
    // Position hints for admins assigned to a specialty
    if (pos.includes('noc')) UNIT_MODULE_MAP.noc.forEach((m) => modules.add(m));
    if (pos.includes('finance')) UNIT_MODULE_MAP.finance.forEach((m) => modules.add(m));
    if (/\bip\b/.test(pos) || pos.includes('ip ')) UNIT_MODULE_MAP.ip.forEach((m) => modules.add(m));
    if (pos.includes('field') || pos.includes('transmission') || /\bts\b/.test(pos)) {
      UNIT_MODULE_MAP.ts.forEach((m) => modules.add(m));
    }
    if (pos.includes('cx') || pos.includes('customer') || pos.includes('relationship')) {
      UNIT_MODULE_MAP.cx.forEach((m) => modules.add(m));
    }
    if (pos.includes('warehouse') || pos.includes('store') || pos.includes('inventory')) {
      UNIT_MODULE_MAP.inventory.forEach((m) => modules.add(m));
    }
    if (pos.includes('asset')) UNIT_MODULE_MAP.assets.forEach((m) => modules.add(m));

    return {
      sees_everything: false,
      hr_full_access: hrFull,
      modules: [...modules],
      key: 'admin',
      description: unitList.length
        ? `Admin operator scoped to: ${unitList.join(', ')}`
        : 'Admin operator — no units assigned; personal work only',
      scoped_to_units: true,
      units: unitList,
    };
  }

  const modules = new Set(access.modules || []);
  let hrFull = Boolean(access.hr_full_access);

  if (pos === 'hr' || pos.includes('human resource')) {
    modules.add('hr');
    hrFull = true;
  }

  // Enrich unit staff with their assigned units (in case role is narrow but units add more)
  if (unitList.length) {
    modulesFromUnits(opts.units, opts.unit).forEach((m) => modules.add(m));
  }

  return {
    ...access,
    key,
    hr_full_access: hrFull,
    modules: [...modules],
    scoped_to_units: false,
    units: unitList,
  };
}

export function canSeePayroll(access) {
  return Boolean(access?.sees_everything || access?.hr_full_access);
}

/** Live frontend routes — must match src/pages/Index.tsx */
export const MODULE_LINKS = {
  inventory: {
    dashboard: '/dashboard',
    items: '/inventory',
    low_stock: '/low-stock',
    material_requests: '/request-forms',
    issue_item: '/approved-forms',
    returns: '/item-returns',
    history: '/items-out',
  },
  finance: {
    cash_approvals: '/cash-approvals',
    material_approvals: '/material-approvals',
    finance_approvals: '/finance-approvals',
    cash_request: '/cash-request',
  },
  tickets_cx: {
    dashboard: '/staff/cx/dashboard',
    queue: '/staff/cx/tickets',
    create: '/staff/cx/create-ticket',
    escalation: '/staff/cx/escalate',
    search: '/staff/cx/ticket-search',
  },
  tickets_noc: {
    dashboard: '/staff/noc/dashboard',
    queue: '/staff/noc/tickets',
    create: '/staff/cx/create-ticket',
    escalation: '/staff/cx/escalate',
  },
  tickets_ip: {
    queue: '/staff/ip/tickets',
    escalation: '/staff/cx/escalate',
  },
  tickets_tx: {
    queue: '/staff/field/tickets',
    escalation: '/staff/cx/escalate',
  },
  service_requests: {
    project_unit: '/project-request/project',
    tx: '/project-request/ts',
    ip: '/project-request/ip',
    noc: '/project-request/noc',
    create: '/project-request/create',
  },
  hr: {
    dashboard: '/hr/dashboard',
    employees: '/hr/employees',
    leave: '/hr/leave',
    payroll: '/hr/payroll',
    attendance: '/hr/attendance',
    documents: '/hr/documents',
    form_requests: '/hr/forms',
    analytics: '/hr/analytics',
  },
  hr_self: {
    attendance: '/hr-self/attendance',
    leave: '/hr-self/leave',
    forms: '/hr-self/forms',
  },
  assets: {
    all: '/assets',
    maintenance: '/assets/maintenance',
    assignments: '/assets/assignments',
  },
  field: {
    dashboard: '/field/dashboard',
    map: '/field/map',
    all: '/field/activities',
  },
  chat: {
    general: '/chat',
    announcements: '/chat',
    dm: '/chat',
  },
  workspace: {
    my: '/workspace',
    vobiss: '/chat',
  },
  reports: '/staff/reports',
  users: '/users',
  audit: '/audit-logs',
  performance_reports: {
    dashboard: '/performance-reports/dashboard',
    my_reports: '/performance-reports/my-reports',
    team: '/performance-reports/team',
    unit_reviews: '/performance-reports/unit-reviews',
    executive: '/performance-reports/executive',
    hr_access: '/performance-reports/hr',
    periods: '/performance-reports/periods',
    analytics: '/performance-reports/analytics',
  },
  transport: {
    requests: '/transport-request',
    approvals: '/transport-approvals',
    fuel_requests: '/transport/fuel-requests',
    fuel_approvals: '/transport/fuel-approvals',
    rental_requests: '/transport/rental-vehicle-requests',
    rental_approvals: '/transport/rental-approvals',
  },
  my_assessment: {
    mine: '/my-assessment',
    staff: '/staff-assessment',
    workflow_performance: '/workflow-performance',
  },
  network_assets: {
    pops: '/network-assets/pops',
    equipment: '/network-assets/equipment',
    passive: '/network-assets/passive',
  },
  noc_shifts: {
    schedule: '/noc/shift-schedule',
    incident_notes: '/noc/incident-notes',
  },
  ip_unit: {
    circuits: '/ip-unit/circuits',
    requests: '/ip-unit/requests',
  },
  production: {
    wip: '/project-unit/wip',
    signoff: '/project-unit/signoff',
  },
  archive: {
    home: '/archive',
  },
};

export function ticketRecordLink(queue, ticketId) {
  const id = encodeURIComponent(String(ticketId || '').trim());
  if (!id) {
    if (queue === 'noc') return MODULE_LINKS.tickets_noc.queue;
    if (queue === 'ip') return MODULE_LINKS.tickets_ip.queue;
    if (queue === 'tx') return MODULE_LINKS.tickets_tx.queue;
    return MODULE_LINKS.tickets_cx.queue;
  }
  if (queue === 'noc') return `/staff/noc/tickets/${id}`;
  if (queue === 'ip') return `/staff/ip/tickets/${id}`;
  if (queue === 'tx') return `/staff/field/tickets/${id}`;
  return `/staff/cx/tickets/${id}`;
}

export function serviceRequestLink(unitSlug, id) {
  const slug = String(unitSlug || 'project').toLowerCase();
  const mapped = slug === 'tx' ? 'ts' : slug;
  if (id) return `/project-request/${mapped}/${id}`;
  return `/project-request/${mapped}`;
}
