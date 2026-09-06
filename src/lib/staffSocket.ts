import { io, type Socket } from 'socket.io-client';
import BASE_URL from '@/lib/api';

export function createStaffSocket(token: string): Socket {
  // socket.io-client only defaults to the current page's origin when the uri is null/undefined
  // — an empty string (what BASE_URL is when VITE_API_URL is unset, i.e. "use the dev proxy")
  // fails that check and gets turned into the malformed URL "https://" (protocol, no host).
  return io(BASE_URL || undefined, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 10000,
  });
}
