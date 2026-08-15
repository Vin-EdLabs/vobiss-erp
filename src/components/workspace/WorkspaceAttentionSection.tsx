import React from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  ArrowRight,
  ClipboardCheck,
  Ticket,
  CheckCircle2,
} from 'lucide-react';
import type { WorkspaceAttentionItem } from '@/api';
import { workspaceTicketHref } from '@/lib/ticketPaths';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

const KIND_META: Record<
  WorkspaceAttentionItem['kind'],
  { icon: React.ElementType; accent: string; label: string }
> = {
  approval: {
    icon: ClipboardCheck,
    accent: 'text-amber-600 bg-amber-50 ring-amber-100',
    label: 'Approval',
  },
  ticket: {
    icon: Ticket,
    accent: 'text-violet-600 bg-violet-50 ring-violet-100',
    label: 'Ticket',
  },
  project: {
    icon: AlertCircle,
    accent: 'text-indigo-600 bg-indigo-50 ring-indigo-100',
    label: 'Project',
  },
  notification: {
    icon: AlertCircle,
    accent: 'text-rose-600 bg-rose-50 ring-rose-100',
    label: 'Alert',
  },
  chat: {
    icon: CheckCircle2,
    accent: 'text-blue-600 bg-blue-50 ring-blue-100',
    label: 'Chat',
  },
};

export function WorkspaceAttentionSection({
  items,
  loading,
}: {
  items: WorkspaceAttentionItem[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <div className="h-4 w-36 animate-pulse rounded bg-[var(--surface-secondary)]" />
        </div>
        <div className="divide-y divide-[var(--border)] p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex animate-pulse gap-3 px-2 py-3">
              <div className="h-8 w-8 rounded-[var(--radius-sm)] bg-[var(--surface-secondary)]" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/3 rounded bg-[var(--surface-secondary)]" />
                <div className="h-2.5 w-1/2 rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Needs your attention</h2>
        </div>
        <EmptyState
          title="You're all caught up"
          description="No pending approvals or assigned tickets right now."
          icon={CheckCircle2}
        />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Needs your attention</h2>
        <StatusPill tone="warning">{items.length}</StatusPill>
      </div>
      <ul className="max-h-[280px] overflow-y-auto">
        {items.map((item) => {
          const meta = KIND_META[item.kind] || KIND_META.approval;
          const Icon = meta.icon;
          const href = workspaceTicketHref(item);
          return (
            <li key={item.id}>
              <Link
                to={href}
                className="group flex items-center gap-3 px-4 py-3 transition duration-150 hover:bg-[var(--surface-hover)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--primary)]">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{item.title}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{item.subtitle}</p>
                </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default WorkspaceAttentionSection;
