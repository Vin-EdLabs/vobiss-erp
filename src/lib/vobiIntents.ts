import {
  generateVobiReport,
  getVobiActions,
  getVobiChatDigest,
  getVobiSummary,
  getVobiThreadSummary,
  postVobiCommand,
  type VobiCommandResult,
} from '@/api/vobi';
import { getChatChannels } from '@/api/chat';

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

/**
 * Client helper matching commands to structured endpoints.
 * The server remains authoritative via POST /api/vobi/command.
 */
export async function runVobiIntent(text: string): Promise<VobiCommandResult> {
  const intent = matchVobiIntent(text);

  if (intent === 'approvals') {
    const data = await getVobiActions({ type: 'approval' });
    return {
      intent,
      reply: `${data.total} approval${data.total === 1 ? '' : 's'} waiting.`,
      cards: data.items,
    };
  }

  if (intent === 'tasks') {
    const data = await getVobiActions();
    return {
      intent,
      reply: data.total > 0 ? 'Here are your open tasks:' : "You're all clear — no open tasks right now.",
      cards: data.items,
    };
  }

  if (intent === 'overdue') {
    const data = await getVobiActions({ filter: 'overdue' });
    return {
      intent,
      reply: data.total > 0 ? `${data.total} overdue item${data.total === 1 ? '' : 's'}.` : 'Nothing overdue right now.',
      cards: data.items,
    };
  }

  if (intent === 'mentions') {
    const data = await getVobiActions({ type: 'mention' });
    return {
      intent,
      reply: data.total > 0 ? `${data.total} mention${data.total === 1 ? '' : 's'} found.` : 'No new mentions.',
      cards: data.items,
    };
  }

  if (intent === 'summarise_thread') {
    const query = extractChannelName(text);
    const channels = await getChatChannels();
    const match = channels.find((ch) => ch.name.toLowerCase() === query) ||
      channels.find((ch) => ch.name.toLowerCase().includes(query)) ||
      channels.find((ch) => (ch.description || '').toLowerCase().includes(query));
    if (!match) {
      return { intent, reply: `I couldn't find a chat thread named "${query}".`, cards: [] };
    }
    const threadSummary = await getVobiThreadSummary(match.id);
    return {
      intent,
      reply: `Caught you up on ${threadSummary.channelName} — here's the recap.`,
      cards: [],
      meta: { cardType: 'thread_summary', threadSummary },
    };
  }

  if (intent === 'personal_digest' || intent === 'chat_mentions') {
    const digest = await getVobiChatDigest();
    return {
      intent,
      reply:
        intent === 'chat_mentions'
          ? digest.mentionedIn.length
            ? `You were mentioned in ${digest.mentionedIn.length} thread${digest.mentionedIn.length === 1 ? '' : 's'}. Here's where:`
            : 'No new chat mentions right now.'
          : digest.totalUnread
            ? 'You missed some things. Here is what happened while you were away.'
            : "You're all caught up — nothing new since your last login.",
      cards: [],
      meta: {
        cardType: 'personal_digest',
        digest: intent === 'chat_mentions' ? { ...digest, activeThreads: [], systemEvents: [] } : digest,
      },
    };
  }

  if (intent === 'missed') {
    const digest = await getVobiChatDigest();
    return {
      intent: 'personal_digest',
      reply: digest.totalUnread
        ? 'You missed some things. Here is what happened while you were away.'
        : "You're all caught up — nothing new since your last login.",
      cards: [],
      meta: { cardType: 'personal_digest', digest },
    };
  }

  if (intent === 'tickets_summary') {
    const summary = await getVobiSummary('today', 'tickets');
    return {
      intent,
      reply: formatTicketSummary(summary),
      cards: [],
    };
  }

  if (intent === 'report') {
    await generateVobiReport('today');
    const summary = await getVobiSummary('today');
    return {
      intent,
      reply: `${formatSummary(summary)}\n\nExport as PDF is ready from the report action.`,
      cards: [],
    };
  }

  if (intent === 'open_tickets_count' || intent === 'greeting') {
    return postVobiCommand(text, { persist: false });
  }

  return {
    intent,
    reply: "I don't have that right now. Try asking: 'what needs approval', 'summarize my tickets', or 'what did I miss today'.",
    cards: [],
  };
}

function formatSummary(summary: Awaited<ReturnType<typeof getVobiSummary>>) {
  const { tickets, requests, chat } = summary.sections;
  return [
    'Here is what changed:',
    `Tickets: ${tickets.open.length} open, ${tickets.overdue.length} overdue.`,
    `Requests: ${requests.pending} pending, ${requests.approved} approved.`,
    `Chat: ${chat.mentioned} mentions, ${chat.unread_threads} unread threads.`,
  ].join('\n');
}

function formatTicketSummary(summary: Awaited<ReturnType<typeof getVobiSummary>>) {
  const { tickets } = summary.sections;
  return `Tickets today: ${tickets.resolved.length} resolved, ${tickets.open.length} open, ${tickets.overdue.length} overdue.`;
}

function extractChannelName(text: string) {
  return text
    .replace(/summari[sz]e/gi, '')
    .replace(/what\s+happened\s+in/gi, '')
    .replace(/catch\s+me\s+up\s+on/gi, '')
    .replace(/\brecap\b/gi, '')
    .replace(/summary\s+of/gi, '')
    .replace(/what'?s\s+in/gi, '')
    .replace(/^the\s+/i, '')
    .replace(/^#/i, '')
    .trim()
    .toLowerCase();
}
