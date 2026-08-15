import {
  VOBI_ALL_STAFF,
  VOBI_CX,
  VOBI_FINANCE,
  VOBI_MANAGER,
  VOBI_WAREHOUSE,
  type VisibleTo,
} from './vobiUserGuide';

export type VobiPageAction = {
  label: string;
  hint: string;
  urgent?: boolean;
  visibleTo: VisibleTo;
};

export type VobiPageGuide = {
  pageName: string;
  actions: VobiPageAction[];
};

export const vobiPageGuides: Record<string, VobiPageGuide> = {
  '/dashboard': {
    pageName: 'Inventory dashboard',
    actions: [
      { label: 'Check low stock', hint: 'Review items below threshold before approving or issuing stock.', visibleTo: VOBI_WAREHOUSE },
      { label: 'Open requests', hint: 'Use Material Requests to see what staff are asking for.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Review trends', hint: 'Use reports to understand item movement and usage.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/director/dashboard': {
    pageName: 'Director dashboard',
    actions: [
      { label: 'Review global activity', hint: 'This page combines inventory, approvals, tickets, and cash signals.', visibleTo: VOBI_MANAGER },
      { label: 'Open escalations', hint: 'Use escalation cards to act on stuck tickets or blocked requests.', visibleTo: VOBI_MANAGER },
      { label: 'Check audit logs', hint: 'Audit Logs are the last director sidebar item for system activity review.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/chat': {
    pageName: 'Community chat',
    actions: [
      { label: 'Use channels', hint: 'Open team channels for shared updates instead of sending repeated DMs.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Open threads', hint: 'Ticket and request chats keep the work history beside the record.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Mention staff', hint: 'Use @mentions when a specific person needs to respond.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  '/workspace': {
    pageName: 'My workspace',
    actions: [
      { label: 'Check your queue', hint: 'Start with pending requests, approvals, and assigned tickets.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Open recent work', hint: 'Use recent activity to jump back into work you touched today.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Finish approvals', hint: 'Managers should clear approval queues before issuing or finance steps begin.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/staff/cx/tickets': {
    pageName: 'Ticket list',
    actions: [
      { label: 'Filter by status', hint: 'Start with open or unassigned tickets that need action.', visibleTo: VOBI_CX },
      { label: 'Claim ticket', hint: 'Open a ticket and claim it if you are responsible for the next step.', visibleTo: VOBI_CX },
      { label: 'Watch SLA', hint: 'Red or overdue work should be handled first.', urgent: true, visibleTo: VOBI_CX },
    ],
  },
  '/staff/cx/tickets/:id': {
    pageName: 'Ticket detail',
    actions: [
      { label: 'Claim ticket', hint: 'Click Claim to assign it to yourself and stop ownership confusion.', visibleTo: VOBI_CX },
      { label: 'Update status', hint: '"In Progress" shows work has started. "Resolved" closes the issue.', visibleTo: VOBI_CX },
      { label: 'Open chat thread', hint: 'Use the Chat button to discuss this ticket with the team.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Escalate', hint: 'Managers only. Moves the ticket to the next escalation stage.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/staff/noc/tickets/:id': {
    pageName: 'NOC ticket detail',
    actions: [
      { label: 'Confirm ownership', hint: 'Claim or assign the ticket before updating technical work.', visibleTo: VOBI_CX },
      { label: 'Record findings', hint: 'Add clear network checks, timestamps, and next actions.', visibleTo: VOBI_CX },
      { label: 'Escalate if blocked', hint: 'Escalate when the next team or manager must act.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/staff/ip/tickets/:id': {
    pageName: 'IP ticket detail',
    actions: [
      { label: 'Check technical notes', hint: 'Read the NOC/CX context before updating the IP step.', visibleTo: VOBI_CX },
      { label: 'Update progress', hint: 'Keep status and notes current so the requester can track progress.', visibleTo: VOBI_CX },
      { label: 'Open chat thread', hint: 'Ask for missing information in the ticket thread.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  '/staff/field/tickets/:id': {
    pageName: 'TX ticket detail',
    actions: [
      { label: 'Check location', hint: 'Confirm site and customer details before dispatch.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Update field status', hint: 'Record arrival, work progress, and completion notes.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Escalate blocked work', hint: 'Escalate if materials, access, or customer readiness blocks the team.', urgent: true, visibleTo: VOBI_MANAGER },
    ],
  },
  '/requests/material/:id': {
    pageName: 'Material request',
    actions: [
      { label: 'Approve', hint: 'Only visible if you are the assigned approver for this stage.', visibleTo: VOBI_MANAGER },
      { label: 'Reject', hint: 'Add a reason. The requester will see it in the chat thread.', visibleTo: VOBI_MANAGER },
      { label: 'Open chat thread', hint: 'Use the request conversation for clarification.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  '/cash-details/:id': {
    pageName: 'Cash request detail',
    actions: [
      { label: 'Review amount and purpose', hint: 'Finance should confirm purpose, amount, and supporting context.', visibleTo: VOBI_FINANCE },
      { label: 'Approve or reject', hint: 'You cannot approve your own cash request unless you are System Admin.', visibleTo: VOBI_FINANCE },
      { label: 'Release cash', hint: 'Only finance-capable staff should release cash after approval.', visibleTo: VOBI_FINANCE },
    ],
  },
  '/project-request/:unit/:id': {
    pageName: 'Service request detail',
    actions: [
      { label: 'Review unit stage', hint: 'Check which unit owns the current workflow step.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Add technical notes', hint: 'Write notes that help the next unit act without calling for context.', visibleTo: VOBI_ALL_STAFF },
      { label: 'Move workflow forward', hint: 'Managers and assigned units should update the request when their part is done.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/assets/:id': {
    pageName: 'Asset detail',
    actions: [
      { label: 'Check assignment', hint: 'Confirm who has the asset and where it is located.', visibleTo: VOBI_WAREHOUSE },
      { label: 'Add maintenance', hint: 'Create maintenance records when an asset is damaged or under repair.', visibleTo: VOBI_WAREHOUSE },
      { label: 'Review audit trail', hint: 'Use history to see asset movement and accountability.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/inventory': {
    pageName: 'Inventory list',
    actions: [
      { label: 'Search item', hint: 'Search by item name before creating a duplicate.', visibleTo: VOBI_WAREHOUSE },
      { label: 'Check quantity', hint: 'Low or zero stock should be reviewed before approving requests.', visibleTo: VOBI_WAREHOUSE },
      { label: 'Open item history', hint: 'Use item movement to trace issued and returned quantities.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/staff/reports': {
    pageName: 'Reports',
    actions: [
      { label: 'Open Inventory Report', hint: 'Shows issued, returned, and stock movement trends.', visibleTo: VOBI_MANAGER },
      { label: 'Open Service Request Report', hint: 'Shows service request status, value, and unit flow diagrams.', visibleTo: VOBI_MANAGER },
      { label: 'Export evidence', hint: 'Use report exports when preparing management updates.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/reports': {
    pageName: 'Inventory report',
    actions: [
      { label: 'Filter dates', hint: 'Choose all time or a specific date range before exporting.', visibleTo: VOBI_MANAGER },
      { label: 'Check movement', hint: 'Compare items out and returns to understand net stock change.', visibleTo: VOBI_MANAGER },
      { label: 'Export CSV', hint: 'Download the table when sharing inventory movement with management.', visibleTo: VOBI_MANAGER },
    ],
  },
  '/users': {
    pageName: 'Admin panel',
    actions: [
      { label: 'Review users', hint: 'Check role, unit, and position before changing access.', visibleTo: VOBI_MANAGER },
      { label: 'Assign units', hint: 'Service Request visibility follows assigned unit selections.', visibleTo: VOBI_MANAGER },
      { label: 'Protect System Admin', hint: 'System Admin is the reserved full-access account and is hidden from the user list.', urgent: true, visibleTo: ['superadmin'] },
    ],
  },
};

function routePatternMatches(pattern: string, route: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const routeParts = route.split('/').filter(Boolean);
  if (patternParts.length !== routeParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(':') || part === routeParts[index]);
}

function routeToPageName(route: string): string {
  const clean = route
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .filter((part) => !/^\d+$/.test(part) && !/^TCK-/i.test(part))
    .pop();

  if (!clean) return 'Current';
  return clean
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildDefaultGuide(route: string): VobiPageGuide {
  return {
    pageName: routeToPageName(route),
    actions: [
      {
        label: 'Read the page title',
        hint: 'Start from the heading and tabs. They tell you whether this page is for viewing, creating, approving, or reporting.',
        visibleTo: VOBI_ALL_STAFF,
      },
      {
        label: 'Use the main action button',
        hint: 'Look for buttons like Create, Save, Approve, Export, Assign, or Open Chat. Vobi will show stronger warnings when an action needs attention.',
        visibleTo: VOBI_ALL_STAFF,
      },
      {
        label: 'Check filters and status',
        hint: 'On list pages, filter by status or search first so you do not work on the wrong record.',
        visibleTo: VOBI_ALL_STAFF,
      },
    ],
  };
}

export function getVobiPageGuide(route: string | null | undefined): VobiPageGuide | null {
  if (!route) return null;
  if (vobiPageGuides[route]) return vobiPageGuides[route];

  const match = Object.entries(vobiPageGuides).find(([pattern]) => routePatternMatches(pattern, route));
  return match?.[1] || buildDefaultGuide(route);
}
