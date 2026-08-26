/** Preset palette for ticket tag colors */
export const TICKET_TAG_COLORS = [
  '#1A56DB', // blue
  '#0E9F6E', // green
  '#C27803', // amber
  '#E02424', // red
  '#7E3AF2', // purple
  '#0694A2', // teal
  '#D03801', // orange
  '#5850EC', // indigo
  '#057A55', // emerald
  '#9B1C1C', // dark red
  '#1E429F', // navy
  '#4B5563', // slate
] as const;

export type TicketTag = {
  id: number;
  name: string;
  color: string;
  usage_count?: number;
};

export function contrastText(hex: string): string {
  const h = String(hex || '#1A56DB').replace('#', '');
  if (h.length !== 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

export function suggestTagsForTicket(
  allTags: TicketTag[],
  category?: string,
  priority?: string
): TicketTag[] {
  const want = new Set<string>();
  const cat = String(category || '').toLowerCase();
  const pri = String(priority || '').toLowerCase();
  if (cat === 'outage') want.add('outage');
  if (pri === 'critical' || pri === 'urgent') want.add('critical');
  return allTags.filter((t) => want.has(String(t.name).toLowerCase()));
}
