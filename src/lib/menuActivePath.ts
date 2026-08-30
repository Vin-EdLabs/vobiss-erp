/**
 * Menu highlight: a list item stays active on its detail/child routes.
 * Extra aliases cover list vs detail path mismatches (e.g. /transport-request vs /transport-requests/12).
 */
const MENU_ALIASES: Record<string, string[]> = {
  '/transport-request': ['/transport-requests', '/transport/vehicle-request'],
  '/transport-approvals': ['/transport-requests'],
  '/transport/rental-vehicle-requests': [
    '/transport/vehicle-rental-requests',
    '/transport/vehicle-request',
    '/transport/new-rental-vehicle-request',
  ],
  '/transport/rental-approvals': ['/transport/vehicle-rental-requests'],
  '/transport/fuel-requests': ['/transport/fuel-requests'],
  '/transport/fuel-approvals': ['/transport/fuel-requests'],
  '/cash-request': ['/cash-details'],
  '/cash-approvals': ['/cash-details'],
  '/finance-approvals': ['/cash-details'],
  '/request-forms': ['/request-forms'],
  '/material-approvals': ['/request-forms'],
  '/item-returns': ['/request-forms'],
  '/approved-forms': ['/request-forms'],
  '/staff/cx/tickets': ['/staff/cx/tickets', '/staff/cx/escalate'],
  '/staff/cx/assign': ['/staff/cx/tickets'],
  '/staff/noc/tickets': ['/staff/noc/tickets'],
  '/staff/ip/tickets': ['/staff/ip/tickets'],
  '/staff/field/tickets': ['/staff/field/tickets'],
  '/staff/cx/clients': ['/staff/cx/clients'],
  '/staff/cx/projects': ['/staff/cx/projects'],
  '/staff/cx/sites': ['/staff/cx/sites'],
  '/finance/fuel-requests': ['/finance/fuel-requests', '/transport/fuel-requests'],
  '/finance/approvals': ['/cash-details'],
  '/hr/employees': ['/hr/employees'],
  '/assets': ['/assets'],
  '/assets/vendors': ['/assets/vendors'],
  '/assets/assignments': ['/assets/assignments'],
  '/assets/maintenance': ['/assets/maintenance'],
  '/project-request/project': ['/project-request/'],
  '/project-requests': ['/project-request/'],
  '/inventory': ['/inventory'],
  '/users': ['/users'],
};

function pathMatches(currentPath: string, menuPath: string) {
  if (!menuPath) return false;
  if (currentPath === menuPath) return true;
  if (menuPath !== '/' && currentPath.startsWith(`${menuPath}/`)) return true;
  return false;
}

export function isMenuPathActive(currentPath: string, menuPath: string) {
  if (pathMatches(currentPath, menuPath)) return true;
  const aliases = MENU_ALIASES[menuPath] || [];
  return aliases.some((alias) => pathMatches(currentPath, alias));
}
