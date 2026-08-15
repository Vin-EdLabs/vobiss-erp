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

export function vobiReplyTone(intent, data = {}) {
  const n = data.actionCount ?? data.total ?? 0;
  switch (intent) {
    case 'greeting':
      return data.statusLine
        ? `${data.greeting || 'Hello'} — ${data.statusLine}`
        : `${data.greeting || 'Hello'}! You're all clear right now.`;
    case 'tasks':
      return n > 0
        ? `You have ${n} things on your plate. Here's what needs your attention:`
        : "You're all clear right now. Nothing needs your attention.";
    case 'approvals':
      return n > 0
        ? `Looks like ${n} approval${n === 1 ? '' : 's'} waiting — want to start there?`
        : 'No approvals waiting on you.';
    case 'tickets_summary':
      return data.summaryText || 'No ticket activity to summarize yet.';
    case 'missed':
      return data.summaryText || "Nothing notable since your last login — you're caught up.";
    case 'report':
      return 'I pulled your report summary. You can export it as PDF from the report action.';
    case 'overdue':
      return n > 0
        ? `${n} item${n === 1 ? '' : 's'} look overdue or at risk. Handle these first:`
        : 'Nothing overdue right now. Nice work.';
    case 'mentions':
      return n > 0
        ? `You were mentioned in ${n} thread${n === 1 ? '' : 's'} recently.`
        : 'No new mentions.';
    case 'open_tickets_count':
      return `You have ${data.openTickets ?? 0} open ticket${data.openTickets === 1 ? '' : 's'}.`;
    case 'about':
      return [
        "I'm Vobi, your personal work assistant inside Vobiss.",
        '',
        'What I do now:',
        '• Give you a daily briefing across tickets, requests, projects, approvals, and chat.',
        '• Show attention cards that take you directly to the record that needs action.',
        '• Help with quick questions like "what did I miss?", "my approvals", and "my mentions".',
        '',
        'Future ambition:',
        '• Predict urgent work before it becomes overdue.',
        '• Prepare smarter handover notes, weekly reports, and follow-up reminders.',
        '• Become a calm operations layer that helps every staff member know the next best action.',
      ].join('\n');
    default:
      return "I don't have that right now. Try asking: 'what needs approval', 'summarize my tickets', or 'what did I miss today'.";
  }
}
