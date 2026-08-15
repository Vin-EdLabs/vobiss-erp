import React, { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hrFileUrl } from '@/api/hr';
import { StatCard as UiStatCard } from '@/components/ui/stat-card';
import { EmptyState as UiEmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';
import { DocumentPreview } from './DocumentPreview';

export function HrPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  accentIndex,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'purple';
  accentIndex?: number;
}) {
  return <UiStatCard label={label} value={value} hint={hint} icon={icon} tone={tone} accentIndex={accentIndex} />;
}

export function StatusBadge({ status }: { status?: string | null }) {
  return <StatusPill status={status} />;
}

export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name?: string | null;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const dim = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-8 w-8 text-[12px]' : 'h-8 w-8 text-xs';
  const url = hrFileUrl(src);
  if (url) {
    return <img src={url} alt={name || ''} className={cn('rounded-full object-cover', dim)} />;
  }
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full bg-[var(--primary)] font-semibold text-white', dim)}>
      {initials || '?'}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return <UiEmptyState title={title} description={description} action={action} icon={Inbox} />;
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 280);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return null;
  return (
    <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] outline-none transition duration-150 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]';

const HR_YEAR_FROM = 2020;
const HR_YEAR_TO = 2040;

export function YearSelect({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (year: number) => void;
  className?: string;
}) {
  const years: number[] = [];
  for (let y = HR_YEAR_FROM; y <= HR_YEAR_TO; y++) years.push(y);
  if (!years.includes(value)) years.unshift(value);
  return (
    <select
      className={cn(inputClass, 'w-24', className)}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

export function ReasonActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        <Field label="Reason">
          <textarea
            className={`${inputClass} h-auto min-h-[96px] py-2`}
            rows={4}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Write a clear reason the employee will see after they sign in."
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            disabled={pending || reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PrimaryButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} />;
}

export function AttachmentLink({
  url,
  name,
}: {
  url?: string | null;
  name?: string | null;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  if (!url) return <span className="text-[var(--text-muted)]">—</span>;
  const filename = name || 'document';
  return (
    <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline"
          onClick={() => setPreviewOpen((open) => !open)}
        >
          {previewOpen ? 'Hide preview' : 'View'}
        </button>
        <button
          type="button"
          className="text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline"
          onClick={() => {
            const a = document.createElement('a');
            a.href = hrFileUrl(url, { download: true, name: filename });
            a.download = filename;
            a.rel = 'noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
          }}
        >
          Download
        </button>
      </div>
      {previewOpen && (
        <div className="mt-3 w-[min(100%,56rem)]">
          <DocumentPreview fileUrl={url} documentName={name} />
        </div>
      )}
    </div>
  );
}

export function TruncatedReason({
  text,
  onOpen,
}: {
  text?: string | null;
  onOpen: () => void;
}) {
  const value = String(text || '').trim();
  if (!value) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="text-left text-xs font-medium text-[var(--primary)]"
      >
        View details
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className="max-w-[280px] text-left"
      title="Click to read the full reason"
    >
      <span className="line-clamp-2 break-words text-sm text-[var(--text-primary)]">{value}</span>
      <span className="mt-0.5 block text-xs font-medium text-[var(--primary)]">View full details</span>
    </button>
  );
}

export function RequestDetailDialog({
  open,
  onClose,
  title,
  fields,
  reason,
  reasonLabel = 'Reason / details',
  attachmentUrl,
  attachmentName,
  status,
  rejectionReason,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  fields: { label: string; value: React.ReactNode }[];
  reason?: string | null;
  reasonLabel?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  status?: string | null;
  rejectionReason?: string | null;
  actions?: React.ReactNode;
}) {
  const fileUrl = hrFileUrl(attachmentUrl);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {status && <StatusBadge status={status} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">{field.label}</p>
                <div className="mt-1 break-words text-sm text-[var(--text-primary)]">{field.value || '—'}</div>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">{reasonLabel}</p>
            <div className="max-h-[min(50vh,28rem)] overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm leading-relaxed text-[var(--text-primary)]">
              {String(reason || '').trim() || '—'}
            </div>
          </div>
          {rejectionReason && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">Rejection reason</p>
              <div className="whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm text-[var(--text-primary)]">
                {rejectionReason}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium text-[var(--text-secondary)]">Attachment</p>
            {fileUrl ? (
              <DocumentPreview fileUrl={attachmentUrl} documentName={attachmentName} />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No attachment</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap justify-end gap-2 pt-1">{actions}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
