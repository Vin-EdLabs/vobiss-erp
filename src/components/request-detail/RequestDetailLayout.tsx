import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock3,
  FileText,
  Link2,
  Paperclip,
  Printer,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { PersonName } from '@/components/PersonName';
import { Button } from '@/components/ui/button';
import type { PersonLike } from '@/lib/displayName';
import { CopyRefButton } from '@/components/CopyRefButton';

export const VOBISS_LOGO = '/vobiss-logo.png';

const statusBadgeClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-800 border-rose-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function statusTone(status?: string) {
  const key = String(status || 'pending').toLowerCase().replace(/\s+/g, '_');
  if (key.includes('reject')) return statusBadgeClass.rejected;
  if (key.includes('complete') || key.includes('issued') || key === 'approved') return statusBadgeClass.approved;
  if (key.includes('draft')) return statusBadgeClass.draft;
  return statusBadgeClass.pending;
}

export function formatDetailWhen(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DetailSection({
  title,
  icon: Icon,
  children,
  className = '',
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)] print:shadow-none ${className}`}>
      <h2 className="mb-4 flex items-center gap-2 border-l-[3px] border-[var(--primary)] pl-3 text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function DetailField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">{value ?? '—'}</div>
    </div>
  );
}

export function InfoStatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
        {label}
      </div>
      <div className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

export function ApprovalTimeline({
  steps,
  progressLabel,
}: {
  steps: {
    id?: string | number;
    name?: PersonLike;
    action?: string;
    at?: string | null;
    note?: string | null;
  }[];
  progressLabel?: string;
}) {
  if (!steps.length) {
    return <p className="text-sm text-[var(--text-secondary)]">No approval actions recorded yet.</p>;
  }
  return (
    <div className="space-y-4">
      {progressLabel && <p className="text-sm font-medium text-[var(--text-secondary)]">{progressLabel}</p>}
      <ol className="relative space-y-4 border-l border-[var(--border)] pl-6">
        {steps.map((step, index) => {
          const action = String(step.action || 'pending').toLowerCase();
          const done = action.includes('approv');
          const rejected = action.includes('reject');
          return (
            <li key={step.id ?? index} className="relative">
              <span
                className={`absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border ${
                  done
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                    : rejected
                      ? 'border-rose-200 bg-rose-100 text-rose-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                }`}
              >
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : rejected ? <XCircle className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
              </span>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <PersonName value={step.name} className="font-semibold text-[var(--text-primary)]" />
                  <span className="text-xs font-semibold capitalize text-[var(--text-secondary)]">{step.action || 'Pending'}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatDetailWhen(step.at)}</p>
                {step.note && <p className="mt-2 text-sm text-[var(--text-secondary)]">{step.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AttachmentGrid({
  files,
}: {
  files: { id?: string; name: string; url?: string; mimeType?: string }[];
}) {
  const [preview, setPreview] = useState<string | null>(null);
  if (!files.length) return <p className="text-sm text-[var(--text-secondary)]">No attachments.</p>;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {files.map((file, index) => {
          const url = file.url || '';
          const image = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name) || String(file.mimeType || '').startsWith('image/');
          return (
            <div key={file.id || index} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]">
              {image && url ? (
                <button type="button" className="block w-full" onClick={() => setPreview(url)}>
                  <img src={url} alt={file.name} className="h-36 w-full object-cover" />
                </button>
              ) : (
                <div className="flex h-36 items-center justify-center bg-slate-100">
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="flex items-center justify-between gap-2 p-3">
                <p className="truncate text-xs font-medium">{file.name}</p>
                {url && (
                  <a href={url} download className="text-xs font-semibold text-[var(--primary)]">
                    Download
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {preview && (
        <button
          type="button"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <img src={preview} alt="Attachment preview" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </>
  );
}

export function RequestDetailLayout({
  title,
  reference,
  status,
  submittedBy,
  submittedAt,
  pills = [],
  stats = [],
  listPath,
  children,
  financeActions,
  headerActions,
}: {
  title?: string;
  reference: string;
  status?: string;
  submittedBy?: PersonLike;
  submittedAt?: string | null;
  pills?: { label: string; value?: React.ReactNode }[];
  stats?: { icon: LucideIcon; label: string; value: React.ReactNode }[];
  listPath: string;
  children: React.ReactNode;
  financeActions?: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 print:max-w-none print:p-0">
      <header className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] print:shadow-none">
        <div className="flex flex-col gap-4 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-white p-1.5">
              <img src={VOBISS_LOGO} alt="Vobiss" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              {title && <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">{title}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">{reference}</h1>
                <CopyRefButton value={reference} />
                {status && (
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusTone(status)}`}>
                    {status}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-sm text-[var(--text-secondary)] sm:text-right">
            {headerActions && <div className="mb-2 flex justify-end">{headerActions}</div>}
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Submitted by</p>
            <PersonName value={submittedBy} className="font-semibold text-[var(--text-primary)]" />
            <p className="mt-0.5 text-xs">{formatDetailWhen(submittedAt)}</p>
          </div>
        </div>
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 py-3">
            {pills.filter((pill) => pill.value).map((pill) => (
              <span key={pill.label} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                <span className="text-[var(--text-muted)]">{pill.label}</span>
                <span className="font-semibold text-[var(--text-primary)]">{pill.value}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <InfoStatCard key={stat.label} {...stat} />
          ))}
        </div>
      )}

      {children}

      {financeActions}

      <footer className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 print:pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <img src={VOBISS_LOGO} alt="" className="h-6 w-6 object-contain" />
          Vobiss Solutions Limited
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => navigate(listPath)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>
      </footer>
    </div>
  );
}

export const detailIcons = { User, Building2, Calendar, Link2, Paperclip, FileText };
