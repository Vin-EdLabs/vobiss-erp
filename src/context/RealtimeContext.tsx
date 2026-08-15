import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BellRing, CheckCircle2, Megaphone, MessageCircle, PackageCheck, Ticket, XCircle } from 'lucide-react';
import { createStaffSocket } from '@/lib/staffSocket';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export type StaffRealtimePayload = {
  topic: string;
  action?: string;
  requestId?: number;
  requestType?: string;
  ticketId?: string;
  id?: number;
  approverName?: string;
  stage?: string;
  stageLabel?: string;
  approvalsCount?: number;
  approvalsRequired?: number;
  newStatus?: string;
  url?: string;
  title?: string;
  body?: string;
  forRequester?: boolean;
  [key: string]: unknown;
};

type RealtimeContextValue = {
  connected: boolean;
  lastEvent: StaffRealtimePayload | null;
};

const RealtimeContext = createContext<RealtimeContextValue>({ connected: false, lastEvent: null });

export function useStaffRealtime() {
  return useContext(RealtimeContext);
}

const CHANNEL = 'staff:realtime';
const MESSAGE_SOUND_COOLDOWN_MS = 1200;

type LiveAlertTone = 'chat' | 'request' | 'success' | 'danger' | 'announcement' | 'ticket' | 'default';

type LiveAlert = {
  id: string;
  tone: LiveAlertTone;
  title: string;
  body?: string;
  url?: string;
};

type ChatSocketMessage = {
  id: string;
  channel_id?: string | null;
  dm_id?: string | null;
  sender_id?: number | null;
  sender_name?: string;
  body?: string;
  message_type?: string;
  meta?: { linkUrl?: string; linkLabel?: string } | null;
};

const alertStyles: Record<LiveAlertTone, { wrap: string; icon: string; Icon: React.ElementType; label: string }> = {
  chat: {
    wrap: 'border-cyan-300/25 bg-gradient-to-br from-slate-950 via-cyan-950 to-blue-950 shadow-cyan-950/40',
    icon: 'bg-cyan-400 text-slate-950',
    Icon: MessageCircle,
    label: 'New chat',
  },
  request: {
    wrap: 'border-violet-300/25 bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-950 shadow-violet-950/40',
    icon: 'bg-violet-400 text-slate-950',
    Icon: PackageCheck,
    label: 'Request update',
  },
  success: {
    wrap: 'border-emerald-300/25 bg-gradient-to-br from-slate-950 via-emerald-950 to-teal-950 shadow-emerald-950/40',
    icon: 'bg-emerald-400 text-slate-950',
    Icon: CheckCircle2,
    label: 'Completed',
  },
  danger: {
    wrap: 'border-red-300/25 bg-gradient-to-br from-slate-950 via-red-950 to-rose-950 shadow-red-950/40',
    icon: 'bg-red-400 text-slate-950',
    Icon: XCircle,
    label: 'Needs attention',
  },
  announcement: {
    wrap: 'border-amber-300/30 bg-gradient-to-br from-slate-950 via-amber-950 to-orange-950 shadow-amber-950/40',
    icon: 'bg-amber-300 text-slate-950',
    Icon: Megaphone,
    label: 'Announcement',
  },
  ticket: {
    wrap: 'border-blue-300/25 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 shadow-blue-950/40',
    icon: 'bg-blue-400 text-slate-950',
    Icon: Ticket,
    label: 'Ticket update',
  },
  default: {
    wrap: 'border-slate-300/20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 shadow-slate-950/40',
    icon: 'bg-slate-200 text-slate-950',
    Icon: BellRing,
    label: 'Notification',
  },
};

function LiveNotificationStack({
  alerts,
  onOpen,
  onDismiss,
}: {
  alerts: LiveAlert[];
  onOpen: (alert: LiveAlert) => void;
  onDismiss: (id: string) => void;
}) {
  if (!alerts.length) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-4 z-[120] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-3 sm:right-5 sm:top-5">
      {alerts.slice(0, 4).map((alert) => {
        const style = alertStyles[alert.tone] || alertStyles.default;
        const Icon = style.Icon;
        return (
          <div
            key={alert.id}
            role={alert.url ? 'button' : undefined}
            tabIndex={alert.url ? 0 : undefined}
            onClick={() => alert.url && onOpen(alert)}
            onKeyDown={(event) => {
              if (!alert.url) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(alert);
              }
            }}
            className={cn(
              'pointer-events-auto overflow-hidden rounded-2xl border p-0.5 text-white shadow-2xl backdrop-blur-xl',
              alert.url && 'cursor-pointer outline-none transition hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-white/70',
              style.wrap
            )}
          >
            <div className="relative rounded-[0.9rem] bg-white/[0.04] p-4">
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
              <div className="flex items-start gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-lg', style.icon)}>
                  <Icon className="h-5 w-5" />
                </div>
                <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(alert); }} className="min-w-0 flex-1 text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/55">{style.label}</p>
                  <p className="mt-1 line-clamp-1 text-sm font-bold text-white">{alert.title}</p>
                  {alert.body && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/75">{alert.body}</p>}
                  {alert.url && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white">
                      Open now <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDismiss(alert.id);
                  }}
                  className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label="Dismiss notification"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function previewText(text?: string, fallback = 'Open Vobiss to view details.') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean;
}

function openAppUrl(url: string) {
  if (typeof window === 'undefined') return;
  const target = new URL(url, window.location.origin);
  if (target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  window.focus();
  window.history.pushState({}, '', `${target.pathname}${target.search}${target.hash}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastMessageSoundAtRef = useRef(0);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<StaffRealtimePayload | null>(null);
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);

  const value = useMemo(() => ({ connected, lastEvent }), [connected, lastEvent]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  const pushAlert = useCallback(
    (alert: Omit<LiveAlert, 'id'> & { id?: string }) => {
      const id = alert.id || `live-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const next = { ...alert, id };
      setAlerts((prev) => [next, ...prev.filter((item) => item.id !== id)].slice(0, 6));
      window.setTimeout(() => dismissAlert(id), alert.tone === 'announcement' ? 14000 : 9000);

      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          const notification = new Notification(alert.title, {
            body: alert.body,
            icon: '/vobiss-logo-192.png',
            tag: id,
            data: { url: alert.url || '/' },
          });
          notification.onclick = () => {
            notification.close();
            openAppUrl(alert.url || '/');
          };
        } catch {
          /* ignore */
        }
      }
    },
    [dismissAlert]
  );

  const openAlert = useCallback(
    (alert: LiveAlert) => {
      dismissAlert(alert.id);
      if (alert.url) openAppUrl(alert.url);
    },
    [dismissAlert]
  );

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    return audioContextRef.current;
  }, []);

  const playMessageSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(pointer: coarse)').matches) return;

    const now = Date.now();
    if (now - lastMessageSoundAtRef.current < MESSAGE_SOUND_COOLDOWN_MS) return;

    const audioContext = ensureAudioContext();
    if (!audioContext) return;

    lastMessageSoundAtRef.current = now;
    audioContext
      .resume()
      .then(() => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(740, start);
        oscillator.frequency.exponentialRampToValueAtTime(980, start + 0.08);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      })
      .catch(() => {
        /* Browsers block audio until the user interacts with the page. */
      });
  }, [ensureAudioContext]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unlockAudio = () => {
      ensureAudioContext()
        ?.resume()
        .catch(() => {
          /* ignore */
        });
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [ensureAudioContext]);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = createStaffSocket(token);
    socketRef.current = socket;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onPayload = (payload: StaffRealtimePayload) => {
      setLastEvent(payload);
      if (payload.topic === 'requests') {
        queryClient.invalidateQueries({ queryKey: ['requests'] });
        window.dispatchEvent(new CustomEvent('staff:requests-changed', { detail: payload }));

        const action = payload.action;
        const title = (payload.title as string) || (action === 'request_created' ? 'New request received' : 'Request update');
        const body = (payload.body as string) || (action === 'request_created' ? 'A new request needs attention.' : 'Open the request to view details.');
        const url = (payload.url as string) || (payload.requestId ? `/request-forms/${payload.requestId}` : '/workspace');
        pushAlert({
          id: `request-${payload.action || 'update'}-${payload.requestId || payload.id || Date.now()}-${payload.forRequester ? 'me' : 'team'}`,
          tone:
            action === 'request_rejected'
              ? 'danger'
              : action === 'request_approved' || action === 'request_finalized' || action === 'cash_received'
                ? 'success'
                : 'request',
          title,
          body,
          url,
        });
      }
      if (payload.topic === 'notifications') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        window.dispatchEvent(new CustomEvent('staff:notifications-changed', { detail: payload }));

        const title = (payload.title as string) || (payload.action === 'mention' ? 'You were mentioned' : 'New notification');
        const body = (payload.body as string) || (payload.message as string) || 'Open Vobiss to view details.';
        const url = (payload.url as string) || (payload.action === 'mention' ? '/chat' : '/workspace');
        pushAlert({
          id: `notification-${payload.action || 'new'}-${payload.messageId || payload.id || Date.now()}`,
          tone: payload.action === 'mention' ? 'chat' : payload.action === 'new' ? 'announcement' : 'default',
          title,
          body,
          url,
        });
      }
      if (payload.topic === 'tickets') {
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        window.dispatchEvent(new CustomEvent('staff:tickets-changed', { detail: payload }));
        pushAlert({
          id: `ticket-${payload.action || 'update'}-${payload.ticketId || payload.id || Date.now()}`,
          tone: 'ticket',
          title: (payload.title as string) || 'Ticket update',
          body: (payload.body as string) || 'A ticket needs attention.',
          url: (payload.url as string) || '/staff/cx/tickets',
        });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    };

    const onNewMessage = (message: ChatSocketMessage) => {
      if (message.sender_id && user?.id && message.sender_id === user.id) return;
      if (typeof window !== 'undefined' && window.location.pathname === '/chat') {
        const params = new URLSearchParams(window.location.search);
        if (
          (message.channel_id && params.get('channel') === message.channel_id) ||
          (message.dm_id && params.get('dm') === message.dm_id)
        ) {
          return;
        }
      }
      const isSystem = message.message_type === 'system';
      const isAnnouncement = message.channel_id && !message.dm_id && /announcement/i.test(String(message.meta?.linkLabel || ''));
      const messageParam = `message=${encodeURIComponent(message.id)}`;
      const url = message.dm_id
        ? `/chat?dm=${encodeURIComponent(message.dm_id)}&${messageParam}`
        : message.channel_id
          ? `/chat?channel=${encodeURIComponent(message.channel_id)}&${messageParam}`
          : message.meta?.linkUrl || `/chat?${messageParam}`;
      pushAlert({
        id: `chat-${message.id}`,
        tone: isAnnouncement || isSystem ? 'announcement' : 'chat',
        title: isSystem ? 'System update' : `${message.sender_name || 'Someone'} sent a message`,
        body: previewText(message.body, 'Open chat to view the message.'),
        url,
      });
      playMessageSound();
      window.dispatchEvent(new CustomEvent('chat:unread-changed'));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(CHANNEL, onPayload);
    socket.on('new_message', onNewMessage);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(CHANNEL, onPayload);
      socket.off('new_message', onNewMessage);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token, queryClient, pushAlert, playMessageSound, user?.id]);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      <LiveNotificationStack alerts={alerts} onOpen={openAlert} onDismiss={dismissAlert} />
    </RealtimeContext.Provider>
  );
}
