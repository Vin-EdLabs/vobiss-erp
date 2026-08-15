/**
 * Category hub channels for structured chat navigation.
 */
export const CATEGORY_CHANNELS = [
  {
    name: 'tickets',
    description: 'Ticket discussions and updates',
    channel_type: 'category',
    record_types: ['ticket'],
  },
  {
    name: 'material-requests',
    description: 'Material and item return requests',
    channel_type: 'category',
    record_types: ['material_request', 'item_return'],
  },
  {
    name: 'cash-requests',
    description: 'Cash request discussions',
    channel_type: 'category',
    record_types: ['cash_request'],
  },
  {
    name: 'project-requests',
    description: 'Service request threads',
    channel_type: 'category',
    record_types: ['project_request'],
  },
];

export function categoryChannelNameForRecordType(recordType) {
  const map = {
    ticket: 'tickets',
    material_request: 'material-requests',
    item_return: 'material-requests',
    cash_request: 'cash-requests',
    project_request: 'project-requests',
  };
  return map[recordType] || null;
}

export function recordTypesForCategory(name) {
  const ch = CATEGORY_CHANNELS.find((c) => c.name === name);
  return ch?.record_types || [];
}

export const RECORD_TYPE_LABELS = {
  ticket: { badge: 'TKT', section: 'Tickets' },
  material_request: { badge: 'MAT', section: 'Material Requests' },
  item_return: { badge: 'RET', section: 'Material Requests' },
  cash_request: { badge: 'CSH', section: 'Cash Requests' },
  project_request: { badge: 'SRV', section: 'Service Requests' },
};
