import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setRealtimeIo } from './channels.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

/**
 * @param {import('http').Server} httpServer
 */
export function attachSocketIO(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: process.env.CLIENT_URL, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Unauthorized'));
      }
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.userId = decoded.id;
      socket.data.username = decoded.username;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.data.userId;
    if (uid != null) {
      socket.join(`user:${uid}`);
      socket.join('staff');
    }
    socket.emit('staff:connected', { ok: true });
  });

  setRealtimeIo(io);
  return io;
}
