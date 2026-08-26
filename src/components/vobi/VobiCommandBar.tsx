import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Send, Loader2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

type QuickAction = {
  id: string;
  label: string;
  /** Sent as the user message. Use __page_guide__ for dedicated page help. */
  value: string;
  command?: string;
};

const BASE_QUICK: QuickAction[] = [
  { id: 'attention', label: 'What needs me?', value: 'What needs my attention right now?' },
  { id: 'tasks', label: 'My tasks', value: 'Show my tasks and pending work.' },
  { id: 'approvals', label: 'Approvals', value: 'What needs approval from me?' },
  { id: 'digest', label: 'Digest', value: 'Catch me up', command: 'digest' },
  { id: 'howto', label: 'Next step', value: 'What should I focus on next based on my role and pending work?' },
];

export const VobiCommandBar = forwardRef<
  HTMLInputElement,
  {
    className?: string;
    disabled?: boolean;
    pageName?: string | null;
    onSubmit: (text: string, options?: { command?: string }) => Promise<void> | void;
  }
>(function VobiCommandBar(
  {
    className,
    disabled,
    pageName,
    onSubmit,
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const quickActions = useMemo<QuickAction[]>(() => {
    return [
      { id: 'page-guide', label: 'Guide', value: '__page_guide__', command: 'page-help' },
      ...BASE_QUICK,
    ];
  }, []);

  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled || sending || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isEditable) return;

      if (event.key.length === 1) {
        event.preventDefault();
        inputRef.current?.focus();
        setText((value) => value + event.key);
      } else if (event.key === 'Backspace' && text) {
        event.preventDefault();
        inputRef.current?.focus();
        setText((value) => value.slice(0, -1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, sending, text]);

  const runSubmit = async (raw: string, command?: string) => {
    const q = raw.trim();
    if (!q || sending || disabled) return;
    if (/^\/\/node$/i.test(q)) {
      setText('');
      window.dispatchEvent(new CustomEvent('staff:open-manual-clock-in'));
      return;
    }
    setSending(true);
    setText('');
    try {
      if (q === '__page_guide__') {
        await onSubmit(
          `Explain how ${pageName || 'this page'} works and how I should use it step by step.`,
          { command: 'page-help' }
        );
      } else {
        await onSubmit(q, command ? { command } : undefined);
      }
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    await runSubmit(text);
  };

  return (
    <form
      className={cn(
        'shrink-0 border-t border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)]/95 px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] shadow-[0_-10px_26px_rgba(15,23,42,0.08)] backdrop-blur-sm',
        className
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {quickActions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={disabled || sending}
            onClick={() => void runSubmit(action.value, action.command)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1.5 text-[10px] font-semibold leading-none transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/30 disabled:opacity-50',
              action.id === 'page-guide'
                ? 'border-[#1D9E75]/50 bg-[#1D9E75] text-white shadow-[0_2px_8px_rgba(29,158,117,0.35)] hover:bg-[#178f68]'
                : 'border-[#5DCAA5]/30 bg-gradient-to-r from-[#102938] to-[#123226] text-[#D9FFF2] hover:border-[#9FE1CB]/70 hover:text-white'
            )}
          >
            {action.id === 'page-guide' && <BookOpen className="h-3 w-3" />}
            {action.label}
          </button>
        ))}
      </div>
      <div className="flex h-[36px] items-center gap-2 rounded-[22px] bg-[#eaf3f8]/70 p-1 ring-1 ring-[#1D9E75]/20">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask Vobi about your work…"
          disabled={disabled || sending}
          className={cn(
            'min-w-0 flex-1 rounded-[20px] border-0 bg-[var(--color-background-secondary)] px-3.5 py-2 text-[13px]',
            'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]',
            'outline-none ring-0 focus:ring-1 focus:ring-[#1D9E75]/30 disabled:opacity-60'
          )}
        />
        <button
          type="submit"
          disabled={disabled || sending || !text.trim()}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#1D9E75] text-white transition-opacity disabled:opacity-45"
          aria-label="Send to Vobi"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </form>
  );
});
