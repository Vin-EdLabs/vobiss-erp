import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Loader2 } from 'lucide-react';
import { RecordChatButton } from '@/components/chat/RecordChatButton';
import { StatusBadge } from '@/components/production/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProjectRequest } from '@/api/project';

export function formatProjectRequestUpdated(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProductionRequestsTable({
  requests,
  unitSlug,
  loading = false,
  emptyMessage = 'No requests found.',
  highlightRow,
  renderExtraActions,
  detailUnitSlug,
  showStage = false,
}: {
  requests: ProjectRequest[];
  unitSlug: string;
  loading?: boolean;
  emptyMessage?: React.ReactNode;
  highlightRow?: (r: ProjectRequest) => boolean;
  renderExtraActions?: (r: ProjectRequest) => React.ReactNode;
  /** Override link target unit (e.g. executive all-requests view uses current_stage). */
  detailUnitSlug?: (r: ProjectRequest) => string;
  showStage?: boolean;
}) {
  const spinnerClass =
    unitSlug === 'noc'
      ? 'text-amber-600'
      : unitSlug === 'ip'
        ? 'text-teal-600'
        : unitSlug === 'ts'
          ? 'text-violet-600'
          : 'text-indigo-600';

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className={`h-8 w-8 animate-spin ${spinnerClass}`} />
      </div>
    );
  }

  if (requests.length === 0) {
    return <p className="py-16 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    <div className="vobiss-table-wrap overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--surface-secondary)] hover:bg-[var(--surface-secondary)]">
            <TableHead className="w-16 font-semibold text-[var(--text-body)]">ID</TableHead>
            <TableHead className="font-semibold text-[var(--text-body)]">Customer</TableHead>
            <TableHead className="font-semibold text-[var(--text-body)]">Site</TableHead>
            <TableHead className="hidden font-semibold text-[var(--text-body)] md:table-cell">Region</TableHead>
            {showStage ? (
              <TableHead className="hidden font-semibold text-[var(--text-body)] sm:table-cell">Stage</TableHead>
            ) : null}
            <TableHead className="font-semibold text-[var(--text-body)]">Status</TableHead>
            <TableHead className="hidden font-semibold text-[var(--text-body)] lg:table-cell">Updated</TableHead>
            <TableHead className="w-[240px] text-right font-semibold text-[var(--text-body)]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => {
            const highlight = highlightRow?.(r);
            return (
              <TableRow
                key={r.id}
                className={
                  highlight
                    ? 'bg-[var(--accent-green-light)] hover:bg-[var(--surface-hover)]'
                    : 'hover:bg-[var(--surface-hover)]'
                }
              >
                <TableCell className="font-mono text-sm text-[var(--text-secondary)]">#{r.id}</TableCell>
                <TableCell className="font-medium text-[var(--text-primary)]">{r.customer_name}</TableCell>
                <TableCell className="text-[var(--text-body)]">{r.site_name}</TableCell>
                <TableCell className="hidden text-[var(--text-secondary)] md:table-cell">{r.region || '—'}</TableCell>
                {showStage ? (
                  <TableCell className="hidden uppercase text-xs font-medium text-[var(--text-secondary)] sm:table-cell">
                    {r.current_stage || '—'}
                  </TableCell>
                ) : null}
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-sm text-[var(--text-muted)] lg:table-cell">
                  {formatProjectRequestUpdated(r.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <span
                      className="inline-flex"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RecordChatButton
                        recordType="project_request"
                        recordId={r.id}
                        chatChannelId={r.chat_channel_id}
                        size="sm"
                        className="h-8 border-[var(--border)]"
                      />
                    </span>
                    <Button asChild size="sm" variant="outline" className="h-8 border-[var(--border)]">
                      <Link to={`/project-request/${r.id}`}>
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        View
                      </Link>
                    </Button>
                    {renderExtraActions?.(r)}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
