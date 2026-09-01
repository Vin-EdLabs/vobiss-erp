import type { FieldWorkStatus, EngineerStatus } from '@/api/fieldWork';

export const FIELD_WORK_STATUS_LABELS: Record<FieldWorkStatus, string> = {
  assigned: 'Assigned',
  travelling: 'Travelling',
  on_site: 'On Site',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  completed: 'Completed',
  noc_confirmed: 'NOC Confirmed',
  client_confirmed: 'Client Confirmed',
  closed: 'Closed',
};

export const ENGINEER_STATUS_LABELS: Record<EngineerStatus, string> = {
  assigned: 'Assigned',
  travelling: 'Travelling',
  on_site: 'On Site',
  completed: 'Completed',
};

export function fieldWorkStatusTone(status: FieldWorkStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'closed' || status === 'client_confirmed') return 'success';
  if (status === 'completed' || status === 'noc_confirmed') return 'info';
  if (status === 'waiting') return 'warning';
  return 'info';
}

export function progressForStatus(status: FieldWorkStatus): number {
  const order: FieldWorkStatus[] = ['assigned', 'travelling', 'on_site', 'in_progress', 'waiting', 'completed', 'noc_confirmed', 'client_confirmed', 'closed'];
  const idx = order.indexOf(status);
  return idx === -1 ? 0 : Math.round((idx / (order.length - 1)) * 100);
}

/** Matches backend/services/activityLog.js's recordViewPath() for these two source types. */
export function sourcePath(sourceType: 'ticket' | 'service_request', sourceId: number): string {
  return sourceType === 'ticket' ? `/staff/cx/tickets/${sourceId}` : `/project-request/${sourceId}`;
}

export function timeElapsedSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
