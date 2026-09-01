/**
 * Server-side page knowledge for Vobi — how each ERP screen works.
 * Matched by exact path or :param patterns. Always scoped as guidance, not live data.
 */
import { MODULE_LINKS } from './vobiRoles.js';

const PAGES = [
  {
    patterns: ['/workspace'],
    name: 'My Workspace',
    module: 'workspace',
    howItWorks:
      'Personal home for attention items: pending approvals, assigned tickets, unread chat, and recent work. Start here each day to clear blockers.',
    howToUse: [
      'Scan Needs Action / Overdue first.',
      'Open a card to jump to the record.',
      'Use Chat and Vobi for follow-ups without leaving context.',
    ],
  },
  {
    patterns: ['/dashboard'],
    name: 'Inventory Dashboard',
    module: 'inventory',
    howItWorks:
      'Operational overview of stock health: low stock, request volume, and inventory movement signals for warehouse and managers.',
    howToUse: [
      'Check low-stock alerts before approving material requests.',
      'Drill into Inventory, Request Forms, or Reports from here.',
    ],
  },
  {
    patterns: ['/inventory', '/categories', '/low-stock', '/items-out', '/item-returns', '/approved-forms', '/request-forms', '/request-forms/:id'],
    name: 'Inventory / Materials',
    module: 'inventory',
    howItWorks:
      'Manage catalog items, categories, stock levels, material requests, issues, and returns. Approvals may be required before stock leaves the warehouse.',
    howToUse: [
      'Search before creating duplicate items.',
      'Create material requests from Request Forms; wait for approval; then Issue from Approved Forms.',
      'Record returns on Item Returns so stock stays accurate.',
      'Low Stock shows items below threshold — act before operations stall.',
    ],
  },
  {
    patterns: ['/cash-request', '/cash-details/:id', '/cash-approvals', '/finance-approvals', '/material-approvals', '/pending-approvals'],
    name: 'Finance & Approvals',
    module: 'finance',
    howItWorks:
      'Staff raise cash requests; finance/managers approve or reject; release happens after approval. Material approvals sit in the purchase/stock path.',
    howToUse: [
      'Fill purpose and amount clearly on cash requests.',
      'Approvers cannot usually approve their own request.',
      'Use the detail page to approve/reject with a reason and open the related chat thread.',
    ],
  },
  {
    patterns: [
      '/staff/cx/dashboard',
      '/staff/cx/tickets',
      '/staff/cx/tickets/:id',
      '/staff/cx/create-ticket',
      '/staff/cx/escalate',
      '/staff/cx/ticket-search',
      '/staff/noc/dashboard',
      '/staff/noc/tickets',
      '/staff/noc/tickets/:id',
      '/staff/ip/tickets',
      '/staff/ip/tickets/:id',
      '/staff/field/tickets',
      '/staff/field/tickets/:id',
    ],
    name: 'Ticketing',
    module: 'ticketing',
    howItWorks:
      'Tickets (TCK-#####) move NEW → OPEN → RESOLVED/CLOSED across CX, NOC, IP, and Field/TX queues. SLA timers and escalation stages track urgency. Clients/sites may be linked; portal customers can also create tickets.',
    howToUse: [
      'Filter by status / unassigned / SLA-risk first.',
      'Claim or assign before working.',
      'Update status and notes so the next team has context.',
      'Use the ticket chat thread for coordination.',
      'Escalate only when the next stage or manager must act.',
      'Create tickets with clear site/client and symptoms.',
    ],
    docs: ['ticketing'],
  },
  {
    patterns: ['/staff/cx/clients', '/staff/cx/sites', '/admin/clients'],
    name: 'Clients & Sites',
    module: 'cx',
    howItWorks:
      'Clients are companies; Sites (SITE-#####) are locations under a client. Tickets and service work often attach to a site. Admin Manage Clients handles portal access.',
    howToUse: [
      'Create/edit clients, then add sites under them.',
      'Link tickets to the correct site for field accuracy.',
      'Portal passwords default to the customer code unless reset.',
    ],
  },
  {
    patterns: [
      '/project-request/create',
      '/project-request/:unit',
      '/project-request/:unit/:id',
      '/project-request/admin/units',
    ],
    name: 'Service / Project Requests',
    module: 'production',
    howItWorks:
      'Multi-unit pipeline (Project, NOC, IP, TS/TX) for customer site builds and related work. Each unit advances its stage with notes and attachments.',
    howToUse: [
      'Create from Project Request → Create.',
      'Open your unit queue and complete your stage notes.',
      'Managers move workflow forward when the unit step is done.',
      'Use remarks/chat on the request for clarification.',
    ],
  },
  {
    patterns: ['/assets', '/assets/new', '/assets/:id', '/assets/assignments', '/assets/maintenance', '/assets/vendors'],
    name: 'Assets',
    module: 'assets',
    howItWorks:
      'Asset registry with assignment, maintenance, and vendor records for accountability of company equipment.',
    howToUse: [
      'Register new assets with category, location, and photos.',
      'Assign to staff; track returns/reassignment.',
      'Log maintenance when assets are repaired or damaged.',
    ],
    docs: ['assets'],
  },
  {
    patterns: [
      '/hr/dashboard',
      '/hr/employees',
      '/hr/leave',
      '/hr/payroll',
      '/hr/attendance',
      '/hr/documents',
      '/hr/forms',
      '/hr/analytics',
      '/hr/payroll/audit',
      '/hr-self/attendance',
      '/hr-self/leave',
      '/hr-self/forms',
    ],
    name: 'HR & Payroll',
    module: 'hr',
    howItWorks:
      'HR manages employees, attendance, leave, documents, forms, and payroll. Self-service lets staff clock and request leave. Payroll figures are restricted by role.',
    howToUse: [
      'HR: start from HR Dashboard for people signals.',
      'Attendance and leave feed payroll readiness.',
      'Self-service: clock in/out within office geofence rules when enabled.',
      'Never ask Vobi for payroll numbers if your role cannot see them.',
    ],
    docs: ['payroll'],
  },
  {
    patterns: ['/field/dashboard', '/field/map', '/field/activities'],
    name: 'Field Operations',
    module: 'field',
    howItWorks:
      'Field engineer activities, map view, and daily ops tracking for TX/field teams.',
    howToUse: [
      'Confirm site/location before dispatch.',
      'Log activity progress and completion notes.',
      'Use the map for engineer/site awareness.',
    ],
  },
  {
    patterns: ['/chat'],
    name: 'Chat',
    module: 'chat',
    howItWorks:
      'Team channels, DMs, ticket/request threads, announcements, and your personal Vobi channel. Mentions and unread drive workspace attention.',
    howToUse: [
      'Use channels for shared updates; DMs for private.',
      'Open record threads from tickets/requests to keep history attached.',
      'Talk to Vobi in the Vobi channel or floating panel.',
    ],
  },
  {
    patterns: ['/director/dashboard', '/director/search'],
    name: 'Director / Executive',
    module: 'executive',
    howItWorks:
      'Cross-module executive view: inventory, tickets, cash, service requests, escalations, and global search.',
    howToUse: [
      'Act on escalations and overdue items first.',
      'Use Global Search to find people, tickets, and records.',
      'Audit Logs for forensic “who changed what”.',
    ],
  },
  {
    patterns: ['/users', '/settings', '/configuration', '/audit-logs', '/system-messages', '/realm', '/admin/clients', '/profile', '/system-guide'],
    name: 'Admin & Settings',
    module: 'admin',
    howItWorks:
      'User roles/units, system configuration, audit trail, and system messages. Profile is personal account settings.',
    howToUse: [
      'Assign roles and units carefully — they control sidebar and data access.',
      'Audit Logs answer who changed inventory/records.',
    ],
  },
  {
    patterns: ['/staff/reports', '/staff/reports/tickets', '/staff/reports/cash', '/staff/reports/service-requests', '/reports'],
    name: 'Reports',
    module: 'reports',
    howItWorks:
      'Management reports for inventory movement, tickets, cash, and service requests. Filter dates then export when needed.',
    howToUse: [
      'Set date range before interpreting totals.',
      'Export CSV/PDF for leadership packs.',
    ],
  },
  {
    patterns: [
      '/performance-reports/dashboard', '/performance-reports/my-reports', '/performance-reports/report/:id',
      '/performance-reports/team', '/performance-reports/unit-reviews', '/performance-reports/executive',
      '/performance-reports/hr', '/performance-reports/periods', '/performance-reports/analytics',
    ],
    name: 'Performance & Reports',
    module: 'performance_reports',
    howItWorks:
      'Employee submits a periodic performance report → routes to their unit\'s Supervisor → Manager → CTO, each scoring and commenting before forwarding (a tier with nobody in it is skipped automatically). HR gets automatic read access the moment a report reaches CTO. A System Score (workflow performance + attendance) is computed automatically at submission.',
    howToUse: [
      'Submit from My Reports → Create New Report, pick the Assessment Period.',
      'Reviewers act from Team Reports (Supervisor) / Unit Reviews (Manager) / Executive Review (CTO) — score, add a comment, then Send Back or Score & Forward.',
      'If a unit has more than one Supervisor/Manager, the sender picks who it goes to.',
      'HR Access shows every report once it reaches CTO or is finalized; Analytics is HR/CTO/Director/admin only.',
    ],
  },
  {
    patterns: [
      '/transport-request', '/transport-supervisor-dashboard', '/transport-approvals',
      '/transport/rental-vehicle-requests', '/transport/rental-approvals',
      '/transport/fuel-requests', '/transport/fuel-approvals',
    ],
    name: 'Transport & Fleet',
    module: 'transport',
    howItWorks:
      'Any staff member can submit a Transport, Fuel, or Rental Vehicle request. Each goes to the approver(s)/supervisor configured for that request type before it\'s actioned.',
    howToUse: [
      'Pick an engineer and the approver(s) shown when submitting — most units only have one, so it\'s often pre-filled.',
      'Approvers act from the matching Approvals page for that request type.',
      'Fuel requests need a vehicle plate and estimated litres/amount.',
    ],
  },
  {
    patterns: [
      '/network-assets', '/network-assets/pops', '/network-assets/equipment', '/network-assets/passive',
      '/network-assets/metro', '/network-assets/nedcoMetro', '/network-assets/backhaul', '/network-assets/nedcoBackhaul',
      '/network-assets/backhaulAccessories', '/network-assets/metroAccessories', '/network-assets/poles', '/network-assets/catalogue',
    ],
    name: 'Network Assets',
    module: 'network_assets',
    howItWorks:
      'Register of physical network infrastructure: PoPs (points of presence), Equipment Inventory, Passive Infrastructure, ECG/NEDCO Metro and Backhaul, Poles, and an Equipment Catalogue.',
    howToUse: [
      'PoP Register is the master list of sites — most other tabs link back to a PoP.',
      'Equipment Inventory tracks what hardware is installed at each PoP.',
      'Use Reports for a rolled-up view across regions.',
    ],
  },
  {
    patterns: ['/noc/shift-schedule', '/noc/incident-notes', '/noc/incident-notes/:id'],
    name: 'NOC Shift Schedule & Incident Notes',
    module: 'noc_shifts',
    howItWorks:
      'Shift Schedule assigns staff to published shifts by date. Incident Notes log site-level NOC incidents (Open/Monitoring/Escalated/Resolved) independent of the ticketing system.',
    howToUse: [
      'Shifts must be published before they show as the live schedule.',
      'Log an incident note as soon as an issue is noticed, even before a ticket exists.',
      'Escalate an incident note\'s status as it develops.',
    ],
  },
  {
    patterns: ['/ip-unit/dashboard', '/ip-unit/circuits', '/ip-unit/circuits/:id', '/ip-unit/circuits/new', '/ip-unit/requests', '/ip-unit/requests/:id', '/ip-unit/reports'],
    name: 'IP Unit',
    module: 'ip_unit',
    howItWorks:
      'Circuit inventory for IP unit — each circuit has a code, status (active/available/inactive/decommissioned), capacity, and links to a client/site. Circuit Requests is the intake/approval workflow before a circuit is added to inventory.',
    howToUse: [
      'Search circuits by code, client, or PoP.',
      'New circuits usually start as a Request, then get generated and added to inventory once approved.',
    ],
  },
  {
    patterns: ['/project-unit/wip', '/project-unit/signoff', '/project-unit/signoff/:id'],
    name: 'Production — WIP & Sign-Off Forms',
    module: 'production',
    howItWorks:
      'WIP tracks in-progress site builds (customer, site, region, service type, status) — many WIP entries are auto-linked to their originating Service Request. Sign-Off Forms are the completion/test-result document (circuit test, bandwidth, latency/jitter/packet-loss, client + Vobiss + manager signatures) that closes out a build.',
    howToUse: [
      'Update WIP status as work progresses so it reflects reality.',
      'Sign-Off Forms move draft → pending → approved/rejected — approval usually needs a manager signature.',
    ],
  },
  {
    patterns: ['/archive'],
    name: 'Archive',
    module: 'archive',
    howItWorks:
      'Folder-based document storage, separate from the /uploads used elsewhere. Folders are global (everyone), unit-scoped (only that unit), or private (only the uploader).',
    howToUse: [
      'Check folder scope before uploading something sensitive — private stays with you, unit stays in-department.',
      'Search by folder or file name.',
    ],
  },
  {
    patterns: ['/my-assessment', '/staff-assessment/:userId', '/workflow-performance'],
    name: 'My Assessment / Workflow Performance',
    module: 'my_assessment',
    howItWorks:
      'An automatically-computed scorecard from actual ticket/workflow timing data (not a human review) — compliance %, speed, volume, and attendance %, for This Week/Month/Last Month. Distinct from the Performance & Reports module, which is human-submitted and reviewed. Managers/HR/Directors can also open someone else\'s via /staff-assessment/:userId.',
    howToUse: [
      'Switch the period selector to change the window.',
      'Needs at least 5 completed items in the period to show a real score.',
      'This is evidence for performance conversations, not an automatic HR grade.',
    ],
  },
];

function matchPattern(pattern, route) {
  const pp = pattern.split('/').filter(Boolean);
  const rp = String(route || '').split('?')[0].split('/').filter(Boolean);
  if (pp.length !== rp.length) return false;
  return pp.every((p, i) => p.startsWith(':') || p === rp[i]);
}

function matchPrefixFamily(route) {
  const path = String(route || '').split('?')[0];
  // Prefer longest matching pattern
  let best = null;
  let bestLen = -1;
  for (const page of PAGES) {
    for (const pattern of page.patterns) {
      if (matchPattern(pattern, path) || path === pattern) {
        const len = pattern.length;
        if (len > bestLen) {
          best = page;
          bestLen = len;
        }
      }
    }
  }
  if (best) return best;

  // Soft prefix fallbacks
  if (path.startsWith('/hr')) return PAGES.find((p) => p.module === 'hr');
  if (path.startsWith('/staff/cx') || path.startsWith('/staff/noc') || path.startsWith('/staff/ip') || path.startsWith('/staff/field')) {
    return PAGES.find((p) => p.module === 'ticketing');
  }
  if (path.startsWith('/project-request')) return PAGES.find((p) => p.module === 'production');
  if (path.startsWith('/assets')) return PAGES.find((p) => p.module === 'assets');
  if (path.startsWith('/field')) return PAGES.find((p) => p.module === 'field');
  return null;
}

export function resolvePageKnowledge(pathname, clientGuide = null) {
  const path = String(pathname || '/').split('?')[0] || '/';
  const known = matchPrefixFamily(path);
  const guideActions = Array.isArray(clientGuide?.actions)
    ? clientGuide.actions.map((a) => ({
        label: a.label,
        hint: a.hint,
        urgent: Boolean(a.urgent),
      }))
    : [];

  return {
    pathname: path,
    page_name: clientGuide?.pageName || known?.name || 'Current page',
    module: known?.module || null,
    how_it_works: known?.howItWorks || null,
    how_to_use: known?.howToUse || [],
    guide_actions: guideActions,
    related_routes: known
      ? Object.values(MODULE_LINKS[known.module] || {}).filter((v) => typeof v === 'string')
      : [],
    doc_ids: known?.docs || [],
  };
}

export function buildPageBriefingPrompt(pageKnowledge, liveUi = null) {
  const pk = pageKnowledge || {};
  const ui = liveUi || {};
  return [
    `The user is on this Vobiss ERP page right now: ${pk.pathname || 'unknown'}.`,
    `Page name: ${pk.page_name || 'Current page'}.`,
    'Explain clearly how this page works and exactly how they should use it step by step.',
    'Be practical and confident. Cover purpose, main actions, common mistakes, and what to do next.',
    'Use markdown links to related routes when helpful.',
    'Do not invent buttons that are not listed in LIVE UI SNAPSHOT if a snapshot is provided.',
    'Keep it concise but complete — this replaces asking a colleague.',
    pk.how_it_works ? `Known page purpose: ${pk.how_it_works}` : '',
    pk.how_to_use?.length ? `Standard how-to:\n${pk.how_to_use.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    pk.guide_actions?.length
      ? `Page guide actions:\n${pk.guide_actions.map((a) => `- ${a.label}: ${a.hint}`).join('\n')}`
      : '',
    ui.headings?.length ? `Visible headings: ${ui.headings.join(' | ')}` : '',
    ui.buttons?.length ? `Visible primary actions: ${ui.buttons.join(', ')}` : '',
    ui.fields?.length ? `Visible form fields: ${ui.fields.join(', ')}` : '',
    ui.title ? `Browser title: ${ui.title}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
