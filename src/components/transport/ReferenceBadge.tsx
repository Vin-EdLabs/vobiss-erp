import React from 'react';
import { Link } from 'react-router-dom';
import { normalizeLinkedReference, REFERENCE_TYPE_META, type LinkedReference } from '@/lib/referenceLink';

export function ReferenceBadge({
  reference,
}: {
  reference?: LinkedReference | Parameters<typeof normalizeLinkedReference>[0] | null;
}) {
  const linked = reference && 'type' in (reference as LinkedReference) && (reference as LinkedReference).id
    ? (reference as LinkedReference)
    : normalizeLinkedReference(reference as any);

  if (!linked) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const meta = REFERENCE_TYPE_META[linked.type];
  const content = (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50">
      <span>{meta.emoji}</span>
      <span>{linked.number}</span>
    </span>
  );

  if (!linked.link) return content;
  return (
    <Link to={linked.link} onClick={(event) => event.stopPropagation()} className="inline-flex">
      {content}
    </Link>
  );
}
