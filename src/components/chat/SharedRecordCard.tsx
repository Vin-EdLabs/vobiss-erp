import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { ChatMessage } from '@/api/chat';
import { humanizeRecordType, iconForRecordType, previewDetailFields, statusBadgeClass } from '@/lib/shareRecord';

type SharedRecord = NonNullable<NonNullable<ChatMessage['meta']>['sharedRecord']>;

export function SharedRecordCard({ sharedRecord }: { sharedRecord: SharedRecord }) {
  const Icon = iconForRecordType(sharedRecord.recordType);
  const preview = sharedRecord.recordPreview;
  const title = preview?.title || sharedRecord.pageTitle || humanizeRecordType(sharedRecord.recordType);
  const details = previewDetailFields(preview).slice(0, 3);

  return (
    <div className="w-full max-w-sm rounded-xl border border-gray-700 bg-[#171922] p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#232634] text-gray-300">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-gray-100">{title}</p>
            {preview?.status && (
              <span className={`${statusBadgeClass(preview.status)} rounded-full px-2 py-0.5 text-[10px] font-medium`}>
                {preview.status}
              </span>
            )}
          </div>
          {preview?.reference && <p className="mt-0.5 text-xs text-gray-500">Ref: {preview.reference}</p>}
          {details.length > 0 && (
            <dl className="mt-1.5 space-y-0.5">
              {details.map(([label, value]) => (
                <div key={label} className="flex gap-1 text-xs text-gray-400">
                  <dt className="font-medium text-gray-500">{label}:</dt>
                  <dd className="truncate">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      <Link
        to={sharedRecord.pagePath}
        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300"
      >
        View in System <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
