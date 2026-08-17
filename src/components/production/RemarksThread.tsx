import React, { useState } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectRequestRemark } from '@/api/project';

export function RemarksThread({
  remarks,
  stage,
  onAdd,
  disabled,
  onlyAdd = false,
  readOnly = false,
  addLabel = 'Add your comment',
}: {
  remarks: ProjectRequestRemark[];
  stage: string;
  onAdd?: (text: string) => Promise<void>;
  disabled?: boolean;
  onlyAdd?: boolean;
  readOnly?: boolean;
  addLabel?: string;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered =
    stage === 'all' ? remarks : remarks.filter((r) => r.stage === stage);

  const submit = async () => {
    if (!text.trim() || disabled || readOnly || !onAdd) return;
    setSaving(true);
    try {
      await onAdd(text.trim());
      setText('');
    } finally {
      setSaving(false);
    }
  };

  const showAddForm = !readOnly && !disabled && !!onAdd;

  return (
    <div className="space-y-4">
      {(!onlyAdd || readOnly) && (
        <>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Remarks / Comments</h3>
          </div>
          <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            {filtered.length === 0 ? (
              <p className="text-center text-sm italic text-[var(--text-muted)]">No remarks yet</p>
            ) : (
              filtered.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-md)]"
                >
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{r.author_name}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-[var(--text-body)]">{r.comment_text}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {showAddForm && (
        <div className="space-y-2">
          {onlyAdd && <p className="text-sm font-semibold text-[var(--text-primary)]">{addLabel}</p>}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a remark or comment…"
            className="min-h-[120px] resize-y border-[var(--border-strong)] bg-[var(--surface)] text-base text-[var(--text-primary)]"
            rows={4}
          />
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !text.trim()}
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Add Remark
          </Button>
        </div>
      )}
    </div>
  );
}
