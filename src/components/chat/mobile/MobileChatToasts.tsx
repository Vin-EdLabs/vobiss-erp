import React from 'react';
import { X, ChevronRight } from 'lucide-react';
import type { ActionRequiredAlert } from '@/components/chat/RecordChatUI';
import { cn } from '@/lib/utils';

export function MobileChatToasts({
  alerts,
  onOpen,
  onDismiss,
  theme,
}: {
  alerts: ActionRequiredAlert[];
  onOpen: (alert: ActionRequiredAlert) => void;
  onDismiss: (id: string) => void;
  theme: 'light' | 'dark';
}) {
  if (!alerts.length) return null;
  const isDark = theme === 'dark';

  return (
    <div
      className="chat-mobile-toasts pointer-events-none fixed inset-x-0 z-[55] flex flex-col gap-2 px-3"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      {alerts.slice(0, 3).map((alert) => (
        <div
          key={alert.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-md transition duration-200',
            isDark
              ? 'border-amber-500/30 bg-[#1a1d27]/95 text-gray-100'
              : 'border-amber-200 bg-white/95 text-slate-900'
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 text-left active:opacity-80"
            onClick={() => onOpen(alert)}
          >
            <p className="text-xs font-semibold text-amber-400">Needs attention</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug">{alert.summary}</p>
            <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-400">
              Open <ChevronRight className="h-3 w-3" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDismiss(alert.id)}
            className={cn(
              'shrink-0 rounded-lg p-1',
              isDark ? 'text-gray-500 hover:bg-gray-800' : 'text-slate-400 hover:bg-slate-100'
            )}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
