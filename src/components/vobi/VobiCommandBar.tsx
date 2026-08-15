import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_COMMANDS = [
  'Catch me up',
  'Summarise #general',
  'Any mentions?',
  'Digest',
  'What needs approval?',
  'Show my tasks',
] as const;

export const VobiCommandBar = forwardRef<
  HTMLInputElement,
  {
    className?: string;
    disabled?: boolean;
    onSubmit: (text: string) => Promise<void> | void;
  }
>(function VobiCommandBar(
  {
    className,
    disabled,
    onSubmit,
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

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

  const submit = async () => {
    const q = text.trim();
    if (!q || sending || disabled) return;
    setSending(true);
    setText('');
    try {
      await onSubmit(q);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className={cn(
        'shrink-0 border-t border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)]/95 px-3 py-2.5 shadow-[0_-10px_26px_rgba(15,23,42,0.08)] backdrop-blur-sm',
        className
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="mb-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#0b1f2a]/90 p-1.5 shadow-inner ring-1 ring-[#5DCAA5]/20">
        {QUICK_COMMANDS.map((command) => (
          <button
            key={command}
            type="button"
            disabled={disabled || sending}
            onClick={() => {
              setText(command);
              window.setTimeout(() => void submitText(command), 0);
            }}
            className={cn(
              'group min-w-0 truncate rounded-full border border-[#5DCAA5]/30 bg-gradient-to-r from-[#102938] to-[#123226] px-2.5 py-1.5 text-[10px] font-semibold leading-none',
              'text-[#D9FFF2] shadow-[0_2px_8px_rgba(0,0,0,0.18)] ring-1 ring-white/5 transition-all duration-150',
              'hover:-translate-y-0.5 hover:border-[#9FE1CB]/70 hover:from-[#123b34] hover:to-[#17543f] hover:text-white hover:shadow-[0_6px_16px_rgba(29,158,117,0.24)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D9E75]/30 disabled:opacity-50'
            )}
          >
            {command}
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

  async function submitText(value: string) {
    const q = value.trim();
    if (!q || sending || disabled) return;
    setSending(true);
    setText('');
    try {
      await onSubmit(q);
    } finally {
      setSending(false);
    }
  }
});
