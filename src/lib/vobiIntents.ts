import { postVobiCommand, type VobiCommandResult } from '@/api/vobi';

export type VobiIntent =
  | 'greeting'
  | 'tasks'
  | 'approvals'
  | 'tickets_summary'
  | 'missed'
  | 'report'
  | 'overdue'
  | 'mentions'
  | 'summarise_thread'
  | 'personal_digest'
  | 'chat_mentions'
  | 'open_tickets_count'
  | 'unknown';

const INTENT_PATTERNS: Array<{ intent: VobiIntent; patterns: RegExp[] }> = [
  { intent: 'approvals', patterns: [/what\s+needs\s+approval/i, /\bmy\s+approvals\b/i, /\bapprovals?\b/i] },
  { intent: 'tasks', patterns: [/show\s+my\s+tasks/i, /\bmy\s+tasks\b/i, /\btasks\b/i] },
  { intent: 'missed', patterns: [/what\s+did\s+i\s+miss/i, /\bmissed\b/i] },
  { intent: 'personal_digest', patterns: [/while\s+i\s+was\s+away/i, /^catch\s+me\s+up$/i, /summari[sz]e\s+(all\s+)?my\s+(chats|threads)/i, /\bdigest\b/i, /summari[sz]e\s+all/i] },
  { intent: 'chat_mentions', patterns: [/\bany\s+mentions\b/i, /did\s+anyone\s+mention/i, /my\s+mentions\s+in\s+chat/i] },
  { intent: 'summarise_thread', patterns: [/summari[sz]e\s+/i, /what\s+happened\s+in\s+/i, /catch\s+me\s+up\s+on\s+/i, /\brecap\s+/i, /summary\s+of\s+/i, /what'?s\s+in\s+/i] },
  { intent: 'tickets_summary', patterns: [/summari[sz]e\s+my\s+tickets/i, /\bticket\s+summary\b/i, /\bmy\s+tickets\b/i] },
  { intent: 'overdue', patterns: [/what'?s\s+overdue/i, /\boverdue\b/i] },
  { intent: 'mentions', patterns: [/\bmy\s+mentions\b/i, /\bmentions\b/i] },
  { intent: 'report', patterns: [/generate\s+(my\s+)?report/i, /\bweekly\s+report\b/i, /\bdaily\s+report\b/i] },
  { intent: 'open_tickets_count', patterns: [/how\s+many\s+open\s+tickets/i] },
  { intent: 'greeting', patterns: [/^(hi|hey|hello|good\s*(morning|afternoon|evening))\b/i] },
];

export function matchVobiIntent(text: string): VobiIntent {
  const value = text.trim();
  if (!value) return 'unknown';
  return INTENT_PATTERNS.find(({ patterns }) => patterns.some((p) => p.test(value)))?.intent ?? 'unknown';
}

/** All spoken replies come from the server (Gemini). */
export async function runVobiIntent(text: string): Promise<VobiCommandResult> {
  return postVobiCommand(text, { persist: false });
}
