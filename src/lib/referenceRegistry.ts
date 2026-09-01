import { iconForRecordType, humanizeRecordType } from '@/lib/shareRecord';

/** Every request-like type that can be linked to / found via reference search. Mirrors backend/services/referenceRegistry.js. */
export const REFERENCE_TYPES = [
  'ticket',
  'transport_request',
  'fuel_request',
  'vehicle_request',
  'material_request',
  'cash_request',
  'item_return',
  'service_request',
  'wip_entry',
  'incident_note',
  'signoff_form',
  'field_work',
  'ip_circuit',
] as const;

export type ReferenceRecordType = (typeof REFERENCE_TYPES)[number];

export const REFERENCE_TYPE_LABELS: Record<string, string> = {
  ticket: 'Ticket',
  transport_request: 'Transport Request',
  fuel_request: 'Fuel Request',
  vehicle_request: 'Vehicle Rental Request',
  material_request: 'Material Request',
  cash_request: 'Cash Request',
  item_return: 'Item Return',
  service_request: 'Service Request',
  wip_entry: 'WIP Entry',
  incident_note: 'Incident Note',
  signoff_form: 'Sign-Off Form',
  field_work: 'Field Work',
  ip_circuit: 'IP Circuit',
};

export function referenceTypeLabel(type: string): string {
  return REFERENCE_TYPE_LABELS[type] || humanizeRecordType(type);
}

/** Mirrors backend/services/referenceRegistry.js REFERENCE_REGISTRY[type].prefix for types with no stored ref column. */
const REFERENCE_TYPE_PREFIXES: Record<string, string> = {
  transport_request: 'TR',
  vehicle_request: 'RV',
  material_request: 'MR',
  cash_request: 'CR',
  item_return: 'IR',
  service_request: 'SR',
  wip_entry: 'WIP',
  incident_note: 'INC',
  field_work: 'FW',
};

/**
 * Computes a record's own display reference number the same way the backend registry does:
 * a real stored value (ticket_id, ref_no, reference_no) when one exists, otherwise a
 * computed `PREFIX-NNN` from its id. Pass the real stored value when the type has one.
 */
export function formatOwnReference(type: string, id: number | string, storedValue?: string | null): string {
  if (storedValue) return storedValue;
  const prefix = REFERENCE_TYPE_PREFIXES[type];
  if (!prefix) return String(id);
  return `${prefix}-${String(id).padStart(3, '0')}`;
}

/** Reuses the same icon-per-record-type map already used by the share-link feature. */
export const referenceTypeIcon = iconForRecordType;

export interface ReferenceSummary {
  type: string;
  label?: string;
  id: number;
  referenceNumber: string;
  title: string;
  status: string | null;
  pagePath: string | null;
}

export interface LinkedReferenceRow {
  id: number;
  direction: 'outbound' | 'inbound';
  type: string;
  recordId: number;
  referenceNumber: string | null;
  title: string | null;
  status: string | null;
  pagePath: string | null;
  createdByName: string;
  createdAt: string;
}
