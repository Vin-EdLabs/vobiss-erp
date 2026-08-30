import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, Loader2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getLinkedReferences } from '@/api/references';
import { referenceTypeIcon, referenceTypeLabel, type LinkedReferenceRow } from '@/lib/referenceRegistry';
import { statusBadgeClass } from '@/lib/shareRecord';

/**
 * The one reusable "Linked References" section shown on every request detail page —
 * lists everything this record links to (outbound) and everything that links to it
 * (inbound), each as a clickable card.
 */
export function LinkedReferencesSection({ recordType, recordId }: { recordType: string; recordId: number | string }) {
  const [rows, setRows] = useState<LinkedReferenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    getLinkedReferences(recordType, recordId)
      .then((data) => {
        if (cancelled) return;
        setRows([...data.outbound, ...data.inbound]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not load linked references.');
      });
    return () => {
      cancelled = true;
    };
  }, [recordType, recordId]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
        <Link2 className="h-4 w-4 text-slate-500" />
        Linked References
      </h3>
      {rows === null && !error && (
        <div className="flex items-center justify-center py-6 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">No references linked to this request</p>}
      {rows && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const Icon = referenceTypeIcon(row.type);
            const card = (
              <div className="h-full rounded-xl border border-slate-200 bg-slate-50 p-3 transition hover:border-amber-300 hover:bg-amber-50/40">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{referenceTypeLabel(row.type)}</p>
                      <span className="text-[10px] text-slate-400">{row.direction === 'inbound' ? 'linked from' : 'linked to'}</span>
                    </div>
                    {row.title && <p className="truncate text-sm font-semibold text-slate-900">{row.title}</p>}
                    {row.status && (
                      <Badge className={`${statusBadgeClass(row.status)} mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium`}>
                        {row.status}
                      </Badge>
                    )}
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                      <User className="h-3 w-3" /> {row.createdByName} · {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            );
            return row.pagePath ? (
              <Link key={row.id} to={row.pagePath} className="block">
                {card}
              </Link>
            ) : (
              <div key={row.id}>{card}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
