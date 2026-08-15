import type { ChatChannel } from '@/api/chat';

/** Channels that increment global/sidebar unread badges. */
export function channelCountsForUnread(
  channel: Pick<ChatChannel, 'channel_type' | 'record_type'>
): boolean {
  const type = channel.channel_type;
  if (type === 'category') return false;
  if (type === 'general' || type === 'announcements') return true;
  if (type === 'unit' && channel.record_type) return true;
  return false;
}

export function sumCountableChannelUnread(channels: ChatChannel[]): number {
  return channels.reduce(
    (s, c) => s + (channelCountsForUnread(c) ? c.unread_count || 0 : 0),
    0
  );
}
