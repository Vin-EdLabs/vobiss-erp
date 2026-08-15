import React from 'react';
import { Building2, Calendar, MapPin, User, Layers } from 'lucide-react';
import type { ProjectRequest } from '@/api/project';
import { StatusBadge } from '@/components/production/StatusBadge';
import { StageStepper } from '@/components/production/StageStepper';
import { RecordChatButton } from '@/components/chat/RecordChatButton';

const STAGE_LABELS: Record<string, string> = {
  ts: 'TS',
  ip: 'IP',
  noc: 'NOC',
  project: 'Project Unit',
  done: 'Complete',
  rejected: 'Rejected',
};

function formatWhen(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ProjectRequestDetailHeader({ request }: { request: ProjectRequest }) {
  const stageLabel = STAGE_LABELS[request.current_stage] || request.current_stage;
  const locationLine = [request.site_name, request.region].filter(Boolean).join(' · ');

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600" />

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        {/* Compact header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-1.5">
              <img src="/vobiss-logo.png" alt="Vobiss" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                Vobiss · Service Request
              </p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="truncate text-lg font-bold text-[var(--text-primary)] sm:text-xl">
                  {request.customer_name}
                </h1>
                <StatusBadge status={request.status} size="sm" />
                <span className="font-mono text-xs text-[var(--text-muted)]">#{request.id}</span>
              </div>
              {(locationLine || request.location) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  {locationLine && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-indigo-500" aria-hidden />
                      {locationLine}
                    </span>
                  )}
                  {request.location && (
                    <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {request.location}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Inline meta — compact chips */}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <RecordChatButton
              recordType="project_request"
              recordId={request.id}
              chatChannelId={request.chat_channel_id}
              className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/15"
            />
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              <Layers className="h-3 w-3 text-[var(--text-muted)]" aria-hidden />
              <span className="text-[var(--text-muted)]">Stage</span>
              <span className="font-semibold text-[var(--text-primary)]">{stageLabel}</span>
            </span>
            {request.created_by_name && (
              <span className="inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                <User className="h-3 w-3 shrink-0 text-[var(--text-muted)]" aria-hidden />
                <span className="truncate font-medium text-[var(--text-primary)]">{request.created_by_name}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
              <Calendar className="h-3 w-3 text-[var(--text-muted)]" aria-hidden />
              <span className="font-medium text-[var(--text-body)]">{formatWhen(request.updated_at)}</span>
            </span>
          </div>
        </div>

        {/* Horizontal workflow */}
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Workflow progress
          </p>
          <StageStepper request={request} />
        </div>
      </div>
    </div>
  );
}
