import React, { useState } from 'react';
import { Check, Clock, ListTodo, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useTodos } from '@/hooks/useTodos';
import type { UserTodo } from '@/api/todos';

function formatReminder(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'MMM d, yyyy · h:mm a');
}

export function TodoPanel() {
  const { pending, completed, create, update, remove, isLoading } = useTodos();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [showReminder, setShowReminder] = useState(false);
  const [reminderAt, setReminderAt] = useState('');

  const save = async () => {
    const value = text.trim();
    if (!value || create.isPending) return;
    try {
      await create.mutateAsync({
        text: value,
        reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
      });
      setText('');
      setReminderAt('');
      setShowReminder(false);
    } catch (err) {
      console.error(err);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void save();
    }
  };

  const toggleComplete = (todo: UserTodo) => {
    update.mutate({ id: todo.id, completed: !todo.completed });
  };

  const deleteTodo = (todo: UserTodo) => {
    if (!window.confirm('Delete this task?')) return;
    remove.mutate(todo.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-[var(--primary)] bg-transparent px-2.5 py-1.5 text-[13px] font-medium text-[var(--primary)] transition duration-150 hover:bg-[var(--accent-green-light)] sm:px-3.5"
        >
          <ListTodo className="h-4 w-4" />
          <span className="hidden sm:inline">My to-dos</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={10}
        data-todo-panel
        className="todo-panel w-[min(420px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border p-0 text-white"
        onOpenAutoFocus={(e) => e.preventDefault()}
        style={{
          background: '#0F1B2D',
          borderColor: 'rgba(16, 185, 129, 0.25)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          maxHeight: 560,
        }}
      >
        <div className="flex max-h-[560px] flex-col">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#10B981] bg-[rgba(16,185,129,0.1)]">
              <ListTodo className="h-5 w-5 text-[#10B981]" />
            </span>
            <div>
              <h3 className="text-base font-semibold text-white">My to-dos</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/50">
                Personal tasks only you can see — set a reminder and we&apos;ll nudge you when it&apos;s due.
              </p>
            </div>
          </div>

          <div className="relative mx-4 mb-2 rounded-[10px] border border-white/10 bg-white/[0.06]">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Add a new task... (Enter to save, Shift+Enter for new line)"
              className="min-h-[72px] w-full resize-y border-0 bg-transparent py-3.5 pl-3.5 pr-12 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || create.isPending}
              className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
              aria-label="Add task"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-4 mb-4 rounded-lg bg-white/[0.04] px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-[13px] text-white/60">
                <Clock className="h-4 w-4" />
                Set reminder (optional)
              </span>
              <button
                type="button"
                onClick={() => setShowReminder((v) => !v)}
                className="text-[13px] text-white/40 hover:text-white/70"
              >
                {showReminder ? 'Hide' : 'Show'}
              </button>
            </div>
            {showReminder && (
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#0B1524] px-2 text-xs text-white [color-scheme:dark] focus:border-[#10B981] focus:outline-none"
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {isLoading && <p className="px-4 py-8 text-center text-sm text-white/40">Loading tasks…</p>}
            {!isLoading && pending.length === 0 && completed.length === 0 && (
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <ListTodo className="h-9 w-9 text-white/20" />
                <p className="mt-3 text-sm text-white/50">No tasks yet</p>
                <p className="mt-1 text-xs text-white/30">Add one above to get started</p>
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-white/35">Pending</p>
                {pending.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} onToggle={toggleComplete} onDelete={deleteTodo} />
                ))}
              </div>
            )}

            {completed.length > 0 && (
              <div className="mt-1">
                <p className="px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-[#10B981]">Completed</p>
                {completed.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} onToggle={toggleComplete} onDelete={deleteTodo} alwaysShowTrash />
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
  alwaysShowTrash,
}: {
  todo: UserTodo;
  onToggle: (todo: UserTodo) => void;
  onDelete: (todo: UserTodo) => void;
  alwaysShowTrash?: boolean;
}) {
  return (
    <div className="group mx-4 my-0.5 flex items-start gap-3 rounded-lg bg-white/[0.04] px-3.5 py-3">
      <button
        type="button"
        onClick={() => onToggle(todo)}
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition duration-150',
          todo.completed ? 'border-[#10B981] bg-[#10B981]' : 'border-white/20 bg-transparent hover:border-[#10B981]'
        )}
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {todo.completed && <Check className="h-3 w-3 text-white" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[13.5px] leading-snug',
            todo.completed ? 'text-white/35 line-through' : 'text-white'
          )}
        >
          {todo.text}
        </p>
        {todo.reminder_at && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#10B981]/80">
            <Clock className="h-3 w-3" />
            {formatReminder(todo.reminder_at)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(todo)}
        className={cn(
          'mt-0.5 text-white/30 transition hover:text-red-400',
          alwaysShowTrash ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
