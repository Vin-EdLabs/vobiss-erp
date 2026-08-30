import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { normalizeLinkedReference, REFERENCE_TYPE_META, type LinkedReference } from '@/lib/referenceLink';

export function ReferenceLinkCard({
  reference,
  emptyLabel = 'No reference linked',
}: {
  reference?: LinkedReference | Parameters<typeof normalizeLinkedReference>[0] | null;
  emptyLabel?: string;
}) {
  const linked = reference && 'type' in (reference as LinkedReference) && (reference as LinkedReference).id
    ? (reference as LinkedReference)
    : normalizeLinkedReference(reference as any);

  if (!linked) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const meta = REFERENCE_TYPE_META[linked.type];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">
        {meta.emoji} {meta.label}
      </p>
      <p className="mt-2 text-lg font-bold text-slate-900">
        #{linked.number} — {linked.title}
      </p>
      {linked.status && (
        <p className="mt-2 text-sm text-slate-600">
          Status:{' '}
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-700">
            {String(linked.status).replace(/_/g, ' ')}
          </span>
        </p>
      )}
      {linked.link && (
        <Link
          to={linked.link}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:text-amber-800"
        >
          {meta.viewLabel} →
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
