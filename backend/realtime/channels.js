/**
 * Socket.IO bridge — set by socket.js after server starts.
 * Other modules (routes) can emit without importing the HTTP server.
 */

let io = null;

export function setRealtimeIo(socketIo) {
  io = socketIo;
}

export function getRealtimeIo() {
  return io;
}

export function emitToUser(userId, event, payload) {
  if (!io || userId == null) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/** All authenticated staff sockets join room "staff" */
export function emitToStaff(event, payload) {
  if (!io) return;
  io.to('staff').emit(event, payload);
}
