import EscalationQueue from '../cx/EscalationQueue';

export function NocManagerEscalations() {
  return (
    <EscalationQueue
      stage="noc_manager"
      title="NOC Manager"
      subtitle="Tickets escalated from NOC Unit after the response window."
      detailBasePath="/staff/noc-manager/tickets"
    />
  );
}

export function ROEscalations() {
  return (
    <EscalationQueue
      stage="relationship_officer"
      title="Relationship Officer (R.O)"
      subtitle="Tickets requiring relationship management and cross-unit coordination."
      detailBasePath="/staff/ro/tickets"
    />
  );
}

export function DirectorEscalations() {
  return (
    <EscalationQueue
      stage="director"
      title="CTO / Directors"
      subtitle="Final escalation stage — executive visibility and action."
      detailBasePath="/staff/director/tickets"
    />
  );
}
