/** Default response / resolution SLA by ticket priority (Configuration → ticket_sla). */

export const SLA_PRIORITY_KEYS = ['critical', 'high', 'medium', 'low'];

export const DEFAULT_TICKET_SLA = {
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

const UNIT_TO_MINUTES = {
  minutes: 1,
  hours: 60,
  days: 60 * 24,
};

export function normalizeSlaUnit(unit) {
  const u = String(unit || 'hours').toLowerCase();
  if (u === 'minute' || u === 'minutes' || u === 'm') return 'minutes';
  if (u === 'hour' || u === 'hours' || u === 'h') return 'hours';
  if (u === 'day' || u === 'days' || u === 'd') return 'days';
  return 'hours';
}

export function normalizeSlaPriorityKey(priority) {
  const p = String(priority || 'medium').toLowerCase().trim();
  if (p === 'critical' || p === 'urgent' || p === 'p1') return 'critical';
  if (p === 'high' || p === 'p2') return 'high';
  if (p === 'medium' || p === 'normal' || p === 'p3') return 'medium';
  if (p === 'low' || p === 'p4') return 'low';
  return 'medium';
}

function normalizePriorityRule(raw, fallback) {
  const value = Math.max(1, parseInt(raw?.first_response_value ?? fallback.first_response_value, 10) || 1);
  const resValue = Math.max(1, parseInt(raw?.resolution_value ?? fallback.resolution_value, 10) || 1);
  return {
    first_response_value: value,
    first_response_unit: normalizeSlaUnit(raw?.first_response_unit ?? fallback.first_response_unit),
    resolution_value: resValue,
    resolution_unit: normalizeSlaUnit(raw?.resolution_unit ?? fallback.resolution_unit),
  };
}

export function normalizeTicketSlaConfig(raw) {
  const base = {
    enabled: true,
    priorities: { ...DEFAULT_TICKET_SLA.priorities },
  };
  if (!raw || typeof raw !== 'object') return structuredClone(base);

  const priorities = {};
  for (const key of SLA_PRIORITY_KEYS) {
    priorities[key] = normalizePriorityRule(raw.priorities?.[key], DEFAULT_TICKET_SLA.priorities[key]);
  }

  return {
    enabled: raw.enabled !== false,
    priorities,
  };
}

export function durationToMinutes(value, unit) {
  const n = Math.max(1, parseInt(value, 10) || 1);
  const factor = UNIT_TO_MINUTES[normalizeSlaUnit(unit)] || 60;
  return n * factor;
}

export function formatSlaDuration(value, unit) {
  const n = Math.max(1, parseInt(value, 10) || 1);
  const u = normalizeSlaUnit(unit);
  const label = u === 'minutes' ? (n === 1 ? 'minute' : 'minutes') : u === 'hours' ? (n === 1 ? 'hour' : 'hours') : n === 1 ? 'day' : 'days';
  return `${n} ${label}`;
}

/** Compute due timestamps from ticket_sla config + priority. */
export function computeSlaDeadlines(slaConfig, priority, fromDate = new Date()) {
  const cfg = normalizeTicketSlaConfig(slaConfig);
  const key = normalizeSlaPriorityKey(priority);
  const rule = cfg.priorities[key] || DEFAULT_TICKET_SLA.priorities.medium;
  const start = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const responseMins = durationToMinutes(rule.first_response_value, rule.first_response_unit);
  const resolutionMins = durationToMinutes(rule.resolution_value, rule.resolution_unit);
  return {
    priority_key: key,
    monitoring_enabled: cfg.enabled !== false,
    first_response_minutes: responseMins,
    resolution_minutes: resolutionMins,
    response_due_at: new Date(start.getTime() + responseMins * 60_000),
    resolution_due_at: new Date(start.getTime() + resolutionMins * 60_000),
    rule,
  };
}
