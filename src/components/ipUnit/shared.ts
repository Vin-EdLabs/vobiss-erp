import type { CircuitStatus, CircuitRequestStatus } from '@/api/ipUnit';

export const CIRCUIT_STATUS_LABELS: Record<CircuitStatus, string> = {
  active: 'Active',
  available: 'Available',
  inactive: 'Inactive',
  decommissioned: 'Decommissioned',
};

export function circuitStatusTone(status: CircuitStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'active') return 'success';
  if (status === 'available') return 'info';
  if (status === 'inactive') return 'warning';
  return 'danger'; // decommissioned
}

export const CIRCUIT_REQUEST_STATUS_LABELS: Record<CircuitRequestStatus, string> = {
  submitted: 'Submitted',
  circuit_generated: 'Circuit Generated',
  added_to_inventory: 'Added to Inventory',
  returned_to_requester: 'Returned to Requester',
  rejected: 'Rejected',
};

export function circuitRequestStatusTone(status: CircuitRequestStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'returned_to_requester') return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'added_to_inventory' || status === 'circuit_generated') return 'info';
  return 'warning'; // submitted
}

// The 4-stage progress ladder shown on Circuit Request detail — "circuit_generated" and
// "added_to_inventory" happen atomically the instant a manager clicks Generate, so both
// light up together once the request has passed the ip_manager review stage.
export const CIRCUIT_REQUEST_STAGE_ORDER: CircuitRequestStatus[] = ['submitted', 'circuit_generated', 'added_to_inventory', 'returned_to_requester'];

export function timeElapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
