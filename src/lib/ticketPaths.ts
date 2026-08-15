/**
 * Ticket URLs use tickets.ticket_id (e.g. TCK-000022), never the internal numeric row id.
 */
export function normalizeTicketNumber(value?: string | number | null): string {
  if (value == null) return '';
  return String(value).trim().replace(/^#/, '');
}

/** True when value is a public ticket code safe for URLs (not a bare row id). */
export function isPublicTicketNumber(value?: string | number | null): boolean {
  const raw = normalizeTicketNumber(value);
  if (!raw) return false;
  if (/^TCK-\d+/i.test(raw)) return true;
  if (/^\d+$/.test(raw)) return false;
  return raw.length >= 3;
}

/** Normalize for URL segment — never fabricate TCK-* from numeric-only values. */
export function toFullTicketNumber(value?: string | number | null): string {
  const raw = normalizeTicketNumber(value);
  if (!raw || !isPublicTicketNumber(raw)) return '';
  if (/^TCK-/i.test(raw)) return raw.toUpperCase();
  return raw;
}

/** Build /staff/cx/tickets/TCK-000022 */
export function staffCxTicketPath(ticketNumber?: string | number | null): string {
  const code = toFullTicketNumber(ticketNumber);
  if (!code) return '/staff/cx/tickets';
  return `/staff/cx/tickets/${encodeURIComponent(code)}`;
}

export function resolveWorkspaceTicketNumber(item: {
  ticket_id?: string | null;
  link?: string;
  title?: string;
}): string {
  const fromId = toFullTicketNumber(item.ticket_id);
  if (fromId) return fromId;

  const linkMatch = (item.link || '').match(/\/staff\/cx\/tickets\/([^/?#]+)/i);
  if (linkMatch) {
    const fromLink = toFullTicketNumber(decodeURIComponent(linkMatch[1]));
    if (fromLink) return fromLink;
  }

  const titleMatch = (item.title || '').match(/\b(TCK-\d+)\b/i);
  if (titleMatch) return titleMatch[1].toUpperCase();

  return '';
}

/** Link for My Workspace ticket attention rows — always includes ticket number when known */
export function workspaceTicketHref(item: {
  kind: string;
  link: string;
  ticket_id?: string | null;
  title?: string;
}): string {
  if (item.kind !== 'ticket') return item.link;
  const code = resolveWorkspaceTicketNumber(item);
  return code ? staffCxTicketPath(code) : item.link;
}
