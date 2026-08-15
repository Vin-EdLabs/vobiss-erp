import React from 'react';
import { MessageSquare } from 'lucide-react';
import type { ProjectRequest, ProjectRequestRemark } from '@/api/project';

export const STAGE_LABELS: Record<string, string> = {
  project: 'Project Unit',
  ts: 'TS — Transmission',
  ip: 'IP',
  noc: 'NOC',
  general: 'General',
};

const STAGE_COLORS: Record<string, string> = {
  project: 'bg-[var(--accent-blue-light)] text-[var(--info-text)] border-transparent',
  ts: 'bg-[var(--accent-amber-light)] text-[var(--warning-text)] border-transparent',
  ip: 'bg-[var(--accent-purple-light)] text-[var(--purple-text)] border-transparent',
  noc: 'bg-[var(--accent-green-light)] text-[var(--success-text)] border-transparent',
  general: 'bg-[var(--surface-secondary)] text-[var(--text-body)] border-[var(--border)]',
};

type HistoryEntry = {
  id: string | number;
  author_name: string;
  stage: string;
  comment_text: string;
  created_at: string;
};

function buildEntries(request: ProjectRequest, remarks: ProjectRequestRemark[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const remarkList = remarks || [];

  const hasInitialAsRemark = remarkList.some(
    (r) =>
      r.stage === 'project' &&
      request.initial_remarks?.trim() &&
      r.comment_text.trim() === request.initial_remarks.trim()
  );

  if (request.initial_remarks?.trim() && !hasInitialAsRemark) {
    entries.push({
      id: 'initial-remarks',
      author_name: request.created_by_name || 'Project Unit',
      stage: 'project',
      comment_text: request.initial_remarks,
      created_at: request.created_at,
    });
  }

  for (const r of remarkList) {
    entries.push({
      id: r.id,
      author_name: r.author_name,
      stage: r.stage || 'general',
      comment_text: r.comment_text,
      created_at: r.created_at,
    });
  }

  return entries.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/** Full comment trail — nothing hidden when units hand off */
export function PipelineHistory({
  request,
  remarks,
  title = 'Comment / Remarks',
}: {
  request: ProjectRequest;
  remarks: ProjectRequestRemark[];
  title?: string;
}) {
  const entries = buildEntries(request, remarks);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-[var(--text-muted)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      </div>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
        {entries.length === 0 ? (
          <p className="text-center text-sm italic text-[var(--text-muted)]">No comments yet</p>
        ) : (
          entries.map((r) => {
            const stageKey = r.stage in STAGE_LABELS ? r.stage : 'general';
            return (
              <article
                key={r.id}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-sm)]"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STAGE_COLORS[stageKey] || STAGE_COLORS.general}`}
                  >
                    {STAGE_LABELS[stageKey] || r.stage}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{r.author_name}</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(r.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-body)]">{r.comment_text}</p>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
