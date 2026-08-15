import pool from '../db.js';

/** @type {Map<number, { userId: number, userName: string, socketId: string }>} */
const onlineUsers = new Map();

export function getOnlineUserIds() {
  return new Set([...onlineUsers.values()].map((v) => v.userId));
}

export function getOnlineUsersList() {
  const seen = new Map();
  for (const entry of onlineUsers.values()) {
    if (!seen.has(entry.userId)) seen.set(entry.userId, entry);
  }
  return [...seen.values()];
}

function broadcastPresence(io) {
  io.emit('presence_update', {
    onlineUserIds: [...getOnlineUserIds()],
    onlineUsers: getOnlineUsersList().map((u) => ({ userId: u.userId, userName: u.userName })),
  });
}

async function joinUserRooms(socket, userId) {
  socket.join(`user:${userId}`);

  const channels = await pool.query(
    `SELECT channel_id FROM channel_members WHERE user_id = $1`,
    [userId]
  );
  for (const row of channels.rows) {
    socket.join(`channel:${row.channel_id}`);
  }

  const dms = await pool.query(
    `SELECT dm_id FROM dm_participants WHERE user_id = $1`,
    [userId]
  );
  for (const row of dms.rows) {
    socket.join(`dm:${row.dm_id}`);
  }
}

/**
 * @param {import('socket.io').Server} io
 */
export function setupChatSocket(io) {
  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    const userName = socket.data.username || 'User';
    if (userId == null) return;

    onlineUsers.set(socket.id, { userId, userName, socketId: socket.id });
    await joinUserRooms(socket, userId);
    broadcastPresence(io);

    socket.on('chat:join_channel', ({ channelId }) => {
      if (channelId) socket.join(`channel:${channelId}`);
    });

    socket.on('chat:join_dm', ({ dmId }) => {
      if (dmId) socket.join(`dm:${dmId}`);
    });

    socket.on('chat:typing', ({ room, isTyping, userName: name }) => {
      if (!room) return;
      socket.to(room).emit('chat:typing', {
        userId,
        userName: name || userName,
        isTyping: !!isTyping,
        room,
      });
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      broadcastPresence(io);
    });
  });
}
