import React from 'react';
import type { ProjectRequestStatus } from '@/api/project';

const styles: Record<string, string> = {
  pending: 'bg-[var(--accent-amber-light)] text-[var(--warning-text)] border-transparent',
  ongoing: 'bg-[var(--accent-blue-light)] text-[var(--info-text)] border-transparent',
  integrated: 'bg-[var(--accent-purple-light)] text-[var(--purple-text)] border-transparent',
  rejected: 'bg-[var(--accent-red-light)] text-[var(--danger-text)] border-transparent',
  completed: 'bg-[var(--accent-green-light)] text-[var(--success-text)] border-transparent',
  noc_approved: 'bg-[var(--accent-green-light)] text-[var(--success-text)] border-transparent',
};

const labels: Record<string, string> = {
  pending: 'Pending',
  ongoing: 'Ongoing',
  integrated: 'Awaiting Project Unit',
  rejected: 'Rejected',
  completed: 'Completed',
  noc_approved: 'Awaiting Project sign-off',
};

export function StatusBadge({
  status,
  size = 'sm',
}: {
  status: ProjectRequestStatus | string;
  size?: 'sm' | 'md';
}) {
  const s = (status in styles ? status : 'pending') as ProjectRequestStatus;
  const sizeClass =
    size === 'md'
      ? 'px-3.5 py-1 text-xs shadow-sm ring-1 ring-black/5'
      : 'px-2.5 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${sizeClass} ${styles[s]}`}
    >
      {labels[s] || status}
    </span>
  );
}
