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
          className="todo-panel-trigger inline-flex items-center gap-2 rounded-full border-[1.5px] px-2.5 py-1.5 text-[13px] font-medium transition duration-150 sm:px-3.5"
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
        className="todo-panel w-[min(420px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-transparent bg-transparent p-0 text-inherit shadow-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-[560px] flex-col">
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <span className="todo-panel-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px]">
              <ListTodo className="h-5 w-5" />
            </span>
            <div>
              <h3 className="todo-panel-title text-base font-semibold">My to-dos</h3>
              <p className="todo-panel-sub mt-1 text-xs leading-relaxed">
                Personal tasks only you can see — set a reminder and we&apos;ll nudge you when it&apos;s due.
              </p>
            </div>
          </div>

          <div className="todo-panel-composer relative mx-4 mb-2 rounded-[10px] border">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Add a new task... (Enter to save, Shift+Enter for new line)"
              className="todo-panel-textarea min-h-[72px] w-full resize-y border-0 bg-transparent py-3.5 pl-3.5 pr-12 text-sm focus:outline-none focus:ring-0"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={!text.trim() || create.isPending}
              className="todo-panel-add absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-40"
              aria-label="Add task"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="todo-panel-reminder mx-4 mb-4 rounded-lg px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="todo-panel-reminder-label inline-flex items-center gap-2 text-[13px]">
                <Clock className="h-4 w-4" />
                Set reminder (optional)
              </span>
              <button
                type="button"
                onClick={() => setShowReminder((v) => !v)}
                className="todo-panel-reminder-toggle text-[13px]"
              >
                {showReminder ? 'Hide' : 'Show'}
              </button>
            </div>
            {showReminder && (
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="todo-panel-datetime mt-2 h-9 w-full rounded-md border px-2 text-xs focus:outline-none"
              />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {isLoading && <p className="todo-panel-muted px-4 py-8 text-center text-sm">Loading tasks…</p>}
            {!isLoading && pending.length === 0 && completed.length === 0 && (
              <div className="flex flex-col items-center px-5 py-8 text-center">
                <ListTodo className="todo-panel-empty-icon h-9 w-9" />
                <p className="todo-panel-sub mt-3 text-sm">No tasks yet</p>
                <p className="todo-panel-muted mt-1 text-xs">Add one above to get started</p>
              </div>
            )}

            {pending.length > 0 && (
              <div>
                <p className="todo-panel-section px-4 py-2 text-[10px] font-medium uppercase tracking-widest">Pending</p>
                {pending.map((todo) => (
                  <TodoRow key={todo.id} todo={todo} onToggle={toggleComplete} onDelete={deleteTodo} />
                ))}
              </div>
            )}

            {completed.length > 0 && (
              <div className="mt-1">
                <p className="todo-panel-section is-done px-4 py-2 text-[10px] font-medium uppercase tracking-widest">Completed</p>
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
    <div className="todo-panel-row group mx-4 my-0.5 flex items-start gap-3 rounded-lg px-3.5 py-3">
      <button
        type="button"
        onClick={() => onToggle(todo)}
        className={cn('todo-panel-check mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition duration-150', todo.completed && 'is-done')}
        aria-label={todo.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {todo.completed && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('todo-panel-text text-[13.5px] leading-snug', todo.completed && 'is-done')}>
          {todo.text}
        </p>
        {todo.reminder_at && (
          <span className="todo-panel-when mt-1 inline-flex items-center gap-1 text-[10px]">
            <Clock className="h-3 w-3" />
            {formatReminder(todo.reminder_at)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(todo)}
        className={cn(
          'todo-panel-trash mt-0.5 transition',
          alwaysShowTrash ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
