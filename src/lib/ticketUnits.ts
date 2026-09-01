/**
 * Single source of truth for mapping a ticket's `escalation_stage` to a display label.
 * `escalation_stage` also carries values from the separate SLA-escalation-matrix system
 * (noc_manager / relationship_officer / director) — those aren't unit ownership, so they
 * fall back to a generic "Escalated" label rather than being guessed at.
 */
export const TICKET_UNIT_LABELS: Record<string, string> = {
  noc: 'NOC',
  ip: 'IP',
  ts: 'TX',
  cx: 'CX',
};

export function ticketUnitLabel(escalationStage?: string | null): string {
  if (!escalationStage) return 'Unassigned';
  return TICKET_UNIT_LABELS[escalationStage] || 'Escalated';
}

export function isKnownTicketUnit(escalationStage?: string | null): boolean {
  return !!escalationStage && escalationStage in TICKET_UNIT_LABELS;
}
