/**
 * Which channels count toward chat unread badges (sidebar, bell, workspace).
 * Category hubs (#tickets, #project-requests, …) are activity feeds only.
 */
export function channelCountsForUnread(channel) {
  if (!channel) return false;
  const type = channel.channel_type;
  if (type === 'category') return false;
  if (type === 'general' || type === 'announcements') return true;
  if (type === 'unit' && channel.record_type) return true;
  return false;
}

export async function isChannelUnreadCountable(pool, channelId) {
  if (!channelId) return false;
  const { rows } = await pool.query(
    `SELECT channel_type, record_type FROM chat_channels WHERE id = $1`,
    [channelId]
  );
  return channelCountsForUnread(rows[0]);
}

/** SQL predicate on chat_channels alias `ch` */
export const COUNTABLE_CHANNEL_SQL = `
  (
    ch.channel_type IN ('general', 'announcements')
    OR (ch.channel_type = 'unit' AND ch.record_type IS NOT NULL)
  )
`;
