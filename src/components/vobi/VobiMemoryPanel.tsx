import { useCallback, useEffect, useState } from 'react';
import { Brain, Loader2, Pencil, Trash2, X } from 'lucide-react';
import {
  clearVobiMemories,
  confirmVobiMemory,
  deleteVobiMemory,
  dismissVobiMemory,
  getVobiMemories,
  updateVobiMemory,
  updateVobiMemorySettings,
  type VobiMemory,
} from '@/api/vobi';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  preference: 'Preference',
  work_context: 'Work context',
  active_task: 'Active task',
  long_term: 'Long-term',
  useful_fact: 'Useful fact',
};

export function VobiMemoryPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [memories, setMemories] = useState<VobiMemory[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Include active + pending so confirmed/saved items always surface
      const data = await getVobiMemories('all');
      const rows = (data.memories || []).filter((m) => m.status === 'active' || m.status === 'pending');
      setMemories(rows);
      setEnabled(data.settings?.memory_enabled !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load memories');
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await updateVobiMemorySettings(next);
    } catch {
      setEnabled(!next);
    }
  };

  const saveEdit = async (id: number) => {
    setBusyId(id);
    try {
      await updateVobiMemory(id, { memory_content: editText });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      await deleteVobiMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Clear all saved memories for your account?')) return;
    setLoading(true);
    try {
      await clearVobiMemories();
      setMemories([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setLoading(false);
    }
  };

  // Fixed to the Vobi shell (parent must be position:relative) — not inside the chat scroll.
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[var(--color-background-primary)] shadow-lg">
      <header className="flex h-[50px] shrink-0 items-center justify-between border-b border-[var(--color-border-tertiary)] px-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[#1D9E75]" />
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              What Vobi remembers
            </p>
            <p className="text-[10px] text-[var(--color-text-tertiary)]">Only your account</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-text-tertiary)] hover:bg-[var(--color-background-secondary)]"
          aria-label="Close memory"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-tertiary)] px-3 py-2">
        <label className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={enabled} onChange={() => void toggleEnabled()} />
          Persistent memory on
        </label>
        <button
          type="button"
          onClick={() => void clearAll()}
          className="text-[11px] font-medium text-red-600 hover:underline"
        >
          Clear all
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-[#1D9E75]" />
          </div>
        )}
        {error && (
          <p className="mb-2 rounded-lg bg-red-50 px-2 py-1.5 text-[11px] text-red-700">{error}</p>
        )}
        {!loading && memories.length === 0 && (
          <p className="py-8 text-center text-[12px] text-[var(--color-text-tertiary)]">
            Nothing saved yet. When you share lasting context, Vobi may ask to remember it.
          </p>
        )}
        <ul className="space-y-2">
          {memories.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-[var(--color-border-tertiary)] bg-[var(--color-background-secondary)] p-2.5"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-[#1D9E75]/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#0f7b59]">
                    {TYPE_LABELS[m.memory_type] || m.memory_type}
                  </span>
                  {m.status === 'pending' && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                      Pending
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {m.status === 'pending' && (
                    <button
                      type="button"
                      className="rounded-md bg-[#1D9E75] px-1.5 py-0.5 text-[9px] font-semibold text-white"
                      disabled={busyId === m.id}
                      onClick={async () => {
                        setBusyId(m.id);
                        try {
                          await confirmVobiMemory(m.id);
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Confirm failed');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                    >
                      Keep
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--color-text-tertiary)] hover:bg-black/5"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditText(m.memory_content);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-red-500 hover:bg-red-50"
                    disabled={busyId === m.id}
                    onClick={() => void remove(m.id)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {editingId === m.id ? (
                <div className="space-y-1.5">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-[var(--color-border-tertiary)] bg-[var(--color-background-primary)] p-2 text-[12px]"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg bg-[#1D9E75] px-2 py-1 text-[11px] font-semibold text-white"
                      onClick={() => void saveEdit(m.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-[11px] text-[var(--color-text-tertiary)]"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] leading-snug text-[var(--color-text-primary)]">
                  {m.memory_content}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function VobiMemoryConfirmButtons({
  memoryId,
  memoryContent,
  onDone,
}: {
  memoryId: number;
  memoryContent?: string;
  onDone?: (kept: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'kept' | 'skipped' | null>(null);
  const [err, setErr] = useState('');

  if (done === 'kept') {
    return <p className="mt-2 text-[11px] font-medium text-[#0f7b59]">Saved to memory.</p>;
  }
  if (done === 'skipped') {
    return <p className="mt-2 text-[11px] text-[var(--color-text-tertiary)]">Okay — not saved permanently.</p>;
  }

  const act = async (keep: boolean) => {
    setBusy(true);
    setErr('');
    try {
      if (keep) {
        try {
          await confirmVobiMemory(memoryId);
        } catch (e) {
          // Fallback: create an active memory if confirm missed (e.g. stale id)
          if (memoryContent) {
            const { createVobiMemory } = await import('@/api/vobi');
            await createVobiMemory({ memory_content: memoryContent, importance: 'high' });
          } else {
            throw e;
          }
        }
      } else {
        await dismissVobiMemory(memoryId);
      }
      setDone(keep ? 'kept' : 'skipped');
      onDone?.(keep);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update memory');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(true)}
          className={cn(
            'rounded-full bg-[#1D9E75] px-3 py-1 text-[11px] font-semibold text-white',
            busy && 'opacity-60'
          )}
        >
          Remember this
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(false)}
          className="rounded-full border border-[var(--color-border-tertiary)] px-3 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] hover:bg-black/5"
        >
          Not now
        </button>
      </div>
      {err && <p className="text-[10px] text-red-600">{err}</p>}
    </div>
  );
}
