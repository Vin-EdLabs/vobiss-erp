/**
 * Keyword intent matcher for Vobi commands (no external AI).
 */

const INTENTS = [
  { intent: 'greeting', patterns: [/^(hi|hey|hello|good\s*(morning|afternoon|evening))\b/i] },
  { intent: 'tasks', patterns: [/show\s+my\s+tasks/i, /\bmy\s+tasks\b/i, /\btasks\b/i] },
  { intent: 'approvals', patterns: [/what\s+needs\s+approval/i, /\bmy\s+approvals\b/i, /\bapprovals?\b/i, /pending\s+approval/i] },
  { intent: 'tickets_summary', patterns: [/summari[sz]e\s+my\s+tickets/i, /\bticket\s+summary\b/i, /\bmy\s+tickets\b/i] },
  { intent: 'missed', patterns: [/what\s+did\s+i\s+miss/i, /\bmissed\b/i, /\bsince\s+last\s+login\b/i] },
  { intent: 'report', patterns: [/generate\s+(my\s+)?report/i, /\bweekly\s+report\b/i, /\bdaily\s+report\b/i] },
  { intent: 'overdue', patterns: [/what'?s\s+overdue/i, /\boverdue\b/i, /\bat\s+risk\b/i] },
  { intent: 'mentions', patterns: [/\bmy\s+mentions\b/i, /\bmentions\b/i] },
  { intent: 'chat_mentions', patterns: [/\bany\s+mentions\b/i, /did\s+anyone\s+mention/i, /my\s+mentions\s+in\s+chat/i] },
  { intent: 'personal_digest', patterns: [/what\s+happened\s+while\s+i\s+was\s+away/i, /\bwhile\s+i\s+was\s+away\b/i, /^catch\s+me\s+up$/i, /summari[sz]e\s+(all\s+)?my\s+(chats|threads)/i, /\bdigest\b/i, /summari[sz]e\s+all/i] },
  { intent: 'summarise_thread', patterns: [/summari[sz]e\s+/i, /what\s+happened\s+in\s+/i, /catch\s+me\s+up\s+on\s+/i, /\brecap\s+/i, /summary\s+of\s+/i, /what'?s\s+in\s+/i] },
  { intent: 'open_tickets_count', patterns: [/how\s+many\s+open\s+tickets/i, /open\s+tickets\s+count/i] },
  { intent: 'about', patterns: [/\babout\s+vobi\b/i, /\bwhat\s+is\s+vobi\b/i, /\bwho\s+are\s+you\b/i] },
];

export function matchVobiIntent(text) {
  const t = String(text || '').trim();
  if (!t) return 'unknown';
  for (const { intent, patterns } of INTENTS) {
    if (patterns.some((p) => p.test(t))) return intent;
  }
  return 'unknown';
}

