import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SharedLinkPreview } from '@/api';
import { humanizeRecordType, iconForRecordType, previewDetailFields, statusBadgeClass } from '@/lib/shareRecord';

export function SharePreviewCard({
  recordType,
  pageTitle,
  recordPreview,
  onView,
  compact = false,
}: {
  recordType: string;
  pageTitle?: string | null;
  recordPreview?: SharedLinkPreview | null;
  onView?: () => void;
  compact?: boolean;
}) {
  const Icon = iconForRecordType(recordType);
  const title = recordPreview?.title || pageTitle || humanizeRecordType(recordType);
  const reference = recordPreview?.reference;
  const status = recordPreview?.status;
  const details = previewDetailFields(recordPreview).slice(0, compact ? 2 : 5);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            {status ? (
              <Badge className={`${statusBadgeClass(status)} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
                {status}
              </Badge>
            ) : null}
          </div>
          {reference ? <p className="mt-0.5 text-xs text-slate-500">Ref: {reference}</p> : null}
          {details.length > 0 && (
            <dl className="mt-2 space-y-1">
              {details.map(([label, value]) => (
                <div key={label} className="flex gap-1 text-xs text-slate-600">
                  <dt className="font-medium text-slate-500">{label}:</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {onView && (
        <button
          type="button"
          onClick={onView}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          View in System <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
