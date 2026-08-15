/** Default ticket escalation matrix (minutes until auto-escalate if not accepted/worked). */
export const DEFAULT_TICKET_ESCALATION = {
  enabled: true,
  stages: [
    {
      key: 'noc',
      label: 'NOC Unit',
      minutes: 30,
      target_roles: ['noc'],
    },
    {
      key: 'noc_manager',
      label: 'NOC Manager',
      minutes: 60,
      target_roles: ['noc_manager'],
    },
    {
      key: 'relationship_officer',
      label: 'Relationship Officer (R.O)',
      minutes: 120,
      target_roles: ['relationship_officer'],
    },
    {
      key: 'director',
      label: 'CTO / Directors',
      minutes: 0,
      target_roles: ['director', 'cto'],
    },
  ],
};

export const ESCALATION_STAGE_ORDER = DEFAULT_TICKET_ESCALATION.stages.map((s) => s.key);

export function normalizeTicketEscalationConfig(raw) {
  const base = { ...DEFAULT_TICKET_ESCALATION };
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: raw.enabled !== false,
    stages: Array.isArray(raw.stages) && raw.stages.length > 0
      ? raw.stages.map((s, i) => ({
          key: String(s.key || DEFAULT_TICKET_ESCALATION.stages[i]?.key || `stage_${i}`),
          label: String(s.label || DEFAULT_TICKET_ESCALATION.stages[i]?.label || s.key),
          minutes: Math.max(0, parseInt(s.minutes, 10) || 0),
          target_roles: Array.isArray(s.target_roles) && s.target_roles.length
            ? s.target_roles.map((r) => String(r).toLowerCase())
            : DEFAULT_TICKET_ESCALATION.stages[i]?.target_roles || ['noc'],
        }))
      : base.stages,
  };
}
