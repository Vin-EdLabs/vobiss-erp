import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setRealtimeIo } from './channels.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

// Mirrors server.js's HTTP CORS allowance — a phone on the same Wi-Fi connects to chat over a
// LAN-IP origin (e.g. http://192.168.1.23:3000), which a bare CLIENT_URL string match would
// reject even though the HTTP API itself now accepts it.
const PRIVATE_LAN_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d+$/;

/**
 * @param {import('http').Server} httpServer
 */
export function attachSocketIO(httpServer) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin(origin, cb) {
        if (!origin) return cb(null, true);
        if (origin === process.env.CLIENT_URL || PRIVATE_LAN_ORIGIN.test(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    },
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
