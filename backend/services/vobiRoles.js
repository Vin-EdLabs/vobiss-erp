export const ROLE_ACCESS = {
  superadmin: {
    sees_everything: true,
    hr_full_access: true,
    modules: ['inventory', 'finance', 'tickets', 'hr', 'assets', 'field', 'service_requests', 'users', 'audit', 'chat'],
    description: 'Full system access',
  },
  admin: {
    sees_everything: false,
    modules: ['inventory', 'finance', 'tickets', 'assets', 'field', 'service_requests', 'users', 'chat'],
    description: 'Broad operational access',
  },
  director: {
    sees_everything: true,
    hr_full_access: true,
    modules: ['inventory', 'finance', 'tickets', 'hr', 'assets', 'field', 'service_requests', 'users', 'chat'],
    description: 'Executive full view',
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
    modules: ['tickets_noc', 'service_requests', 'field', 'chat'],
    description: 'NOC operations',
  },
  ip: {
    sees_everything: false,
    modules: ['tickets_ip', 'service_requests', 'chat'],
    description: 'IP operations',
  },
  tx: {
    sees_everything: false,
    modules: ['tickets_tx', 'service_requests', 'chat'],
    description: 'TX/Transmission operations',
  },
  cx: {
    sees_everything: false,
    modules: ['tickets_cx', 'service_requests', 'chat'],
    description: 'Customer experience',
  },
  project_unit: {
    sees_everything: false,
    modules: ['service_requests', 'field', 'chat'],
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

export function getRoleAccess(role, position) {
  const key = canonicalVobiRole(role);
  const access = ROLE_ACCESS[key] || ROLE_ACCESS.user;

  if (isExecutivePosition(position) || key === 'superadmin' || key === 'director') {
    return {
      ...ROLE_ACCESS.superadmin,
      sees_everything: true,
      hr_full_access: true,
      modules: [...ROLE_ACCESS.superadmin.modules],
      key: key === 'director' ? 'director' : 'superadmin',
    };
  }

  const pos = String(position || '').trim().toLowerCase();
  const modules = new Set(access.modules || []);
  let hrFull = Boolean(access.hr_full_access);

  if (pos === 'hr' || pos.includes('human resource')) {
    modules.add('hr');
    hrFull = true;
  }

  return {
    ...access,
    key,
    hr_full_access: hrFull,
    modules: [...modules],
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
