/** Frontend helpers for ticket SLA (mirrors backend/ticketSlaConfig.js). */

export type SlaUnit = 'minutes' | 'hours' | 'days';

export type TicketSlaPriorityKey = 'critical' | 'high' | 'medium' | 'low';

export type TicketSlaPriorityRule = {
  first_response_value: number;
  first_response_unit: SlaUnit;
  resolution_value: number;
  resolution_unit: SlaUnit;
};

export type TicketSlaConfig = {
  enabled: boolean;
  priorities: Record<TicketSlaPriorityKey, TicketSlaPriorityRule>;
};

export const SLA_PRIORITY_META: Record<
  TicketSlaPriorityKey,
  { label: string; badgeClass: string }
> = {
  critical: { label: 'Critical', badgeClass: 'bg-red-600 text-white' },
  high: { label: 'High', badgeClass: 'bg-orange-500 text-white' },
  medium: { label: 'Medium', badgeClass: 'bg-amber-400 text-slate-900' },
  low: { label: 'Low', badgeClass: 'bg-slate-500 text-white' },
};

export const DEFAULT_TICKET_SLA: TicketSlaConfig = {
  enabled: true,
  priorities: {
    critical: {
      first_response_value: 15,
      first_response_unit: 'minutes',
      resolution_value: 4,
      resolution_unit: 'hours',
    },
    high: {
      first_response_value: 30,
      first_response_unit: 'minutes',
      resolution_value: 8,
      resolution_unit: 'hours',
    },
    medium: {
      first_response_value: 2,
      first_response_unit: 'hours',
      resolution_value: 2,
      resolution_unit: 'days',
    },
    low: {
      first_response_value: 8,
      first_response_unit: 'hours',
      resolution_value: 5,
      resolution_unit: 'days',
    },
  },
};

export function normalizeSlaPriorityKey(priority?: string | null): TicketSlaPriorityKey {
  const p = String(priority || 'medium').toLowerCase().trim();
  if (p === 'critical' || p === 'urgent' || p === 'p1') return 'critical';
  if (p === 'high' || p === 'p2') return 'high';
  if (p === 'medium' || p === 'normal' || p === 'p3') return 'medium';
  if (p === 'low' || p === 'p4') return 'low';
  return 'medium';
}

export function formatSlaDuration(value: number, unit: SlaUnit): string {
  const n = Math.max(1, Number(value) || 1);
  if (unit === 'minutes') return `${n} ${n === 1 ? 'minute' : 'minutes'}`;
  if (unit === 'hours') return `${n} ${n === 1 ? 'hour' : 'hours'}`;
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

export function describeSlaForPriority(
  sla: TicketSlaConfig | null | undefined,
  priority?: string | null
): string | null {
  if (!sla?.priorities) return null;
  const key = normalizeSlaPriorityKey(priority);
  const rule = sla.priorities[key];
  if (!rule) return null;
  return `First response ${formatSlaDuration(rule.first_response_value, rule.first_response_unit)} · Resolve in ${formatSlaDuration(rule.resolution_value, rule.resolution_unit)}`;
}
