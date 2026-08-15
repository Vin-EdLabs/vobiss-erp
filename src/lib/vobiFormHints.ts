import {
  VOBI_ALL_STAFF,
  VOBI_CX,
  VOBI_FINANCE,
  VOBI_MANAGER,
  VOBI_WAREHOUSE,
  type VisibleTo,
} from './vobiUserGuide';

export type VobiFormHintField = {
  name: string;
  hint: string;
  visibleTo: VisibleTo;
};

export type VobiFormHint = {
  formName: string;
  visibleTo: VisibleTo;
  fields: VobiFormHintField[];
  warning?: string;
};

export const vobiFormHints: Record<string, VobiFormHint> = {
  'cash-request': {
    formName: 'Cash Request',
    visibleTo: VOBI_ALL_STAFF,
    fields: [
      { name: 'Amount', hint: 'Numbers only. Requests over GHc500 may need stronger approval notes.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Purpose', hint: 'Be specific: "fuel for site visit" is better than just "fuel".', visibleTo: VOBI_ALL_STAFF },
      { name: 'Date needed', hint: 'Must be today or a future date.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Approvers', hint: 'Pick finance-capable approvers. You cannot approve your own request.', visibleTo: VOBI_ALL_STAFF },
    ],
    warning: 'Requests over GHc5,000 require both finance and director-level attention.',
  },
  'material-request': {
    formName: 'Material Request',
    visibleTo: VOBI_ALL_STAFF,
    fields: [
      { name: 'Item name', hint: 'Select the exact inventory item. Add one row per item type.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Quantity', hint: 'Whole numbers only. No decimals.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Reason', hint: 'Mention the project, ticket, or job. Vague reasons get rejected.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Approvers', hint: 'Choose valid approvers who are not the requester.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  'ticket-create': {
    formName: 'New Ticket',
    visibleTo: VOBI_CX,
    fields: [
      { name: 'Subject', hint: 'Clear and specific. Include the customer name if relevant.', visibleTo: VOBI_CX },
      { name: 'Priority', hint: 'P1 = critical/outage. P2 = urgent. P3 = normal. P4 = low.', visibleTo: VOBI_CX },
      { name: 'Queue', hint: 'Select the team that should handle this. NOC = network issues.', visibleTo: VOBI_CX },
      { name: 'Description', hint: 'Include what the customer reported, timing, and any steps already tried.', visibleTo: VOBI_CX },
    ],
  },
  'project-request': {
    formName: 'Service Request',
    visibleTo: VOBI_ALL_STAFF,
    fields: [
      { name: 'Customer and site', hint: 'Use the real customer and site names so TX/IP/NOC can trace the work.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Location', hint: 'Add area, region, landmark, or GPS detail if known.', visibleTo: VOBI_ALL_STAFF },
      { name: 'MRC / NRC', hint: 'Enter numbers only. Leave blank if not applicable.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Remarks', hint: 'Add technical or commercial notes that will help the next unit act quickly.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  'asset-create': {
    formName: 'New Asset',
    visibleTo: VOBI_WAREHOUSE,
    fields: [
      { name: 'Asset name', hint: 'Use a clear name staff can recognize later.', visibleTo: VOBI_WAREHOUSE },
      { name: 'Serial number', hint: 'Enter the exact serial number from the device label.', visibleTo: VOBI_WAREHOUSE },
      { name: 'Category and location', hint: 'Choose the correct category and current physical location.', visibleTo: VOBI_WAREHOUSE },
      { name: 'Photos', hint: 'Upload clear photos for condition and audit evidence.', visibleTo: VOBI_WAREHOUSE },
    ],
  },
  'item-return': {
    formName: 'Item Return',
    visibleTo: VOBI_ALL_STAFF,
    fields: [
      { name: 'Returned item', hint: 'Select the exact inventory item being returned.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Quantity', hint: 'Use whole numbers and return only what was actually received back.', visibleTo: VOBI_ALL_STAFF },
      { name: 'Reason', hint: 'Explain why the item is coming back: unused, damaged, wrong item, or job cancelled.', visibleTo: VOBI_ALL_STAFF },
    ],
  },
  'unit-group-create': {
    formName: 'Service Request Unit',
    visibleTo: VOBI_MANAGER,
    fields: [
      { name: 'Unit name', hint: 'Use the team name staff will recognize in the workflow.', visibleTo: VOBI_MANAGER },
      { name: 'Stage', hint: 'Pick the correct workflow stage so requests route to the right team.', visibleTo: VOBI_MANAGER },
    ],
    warning: 'Only system admins should change workflow units because it affects service request routing.',
  },
  'announcement-post': {
    formName: 'Announcement',
    visibleTo: VOBI_MANAGER,
    fields: [
      { name: 'Title', hint: 'Keep it short and action-focused.', visibleTo: VOBI_MANAGER },
      { name: 'Message', hint: 'Say who is affected, what changed, and what staff should do next.', visibleTo: VOBI_MANAGER },
      { name: 'Push alerts', hint: 'Users must enable alerts before they can receive push notifications.', visibleTo: VOBI_MANAGER },
    ],
  },
  'finance-approval': {
    formName: 'Finance Approval',
    visibleTo: VOBI_FINANCE,
    fields: [
      { name: 'Approval decision', hint: 'Approve only if the purpose, amount, and requester are valid.', visibleTo: VOBI_FINANCE },
      { name: 'Rejection reason', hint: 'Give a clear reason. The requester will see it.', visibleTo: VOBI_FINANCE },
    ],
  },
};

export function getVobiFormHint(formKey: string | null | undefined): VobiFormHint | null {
  if (!formKey) return null;
  return vobiFormHints[formKey] || null;
}
