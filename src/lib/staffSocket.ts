import { io, type Socket } from 'socket.io-client';
import BASE_URL from '@/lib/api';

export function createStaffSocket(token: string): Socket {
  return io(BASE_URL, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 10000,
  });
}
