import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getReferenceFlow, type ReferenceFlow } from '@/api/references';
import { referenceTypeIcon, referenceTypeLabel, type ReferenceSummary } from '@/lib/referenceRegistry';
import { statusBadgeClass } from '@/lib/shareRecord';

function FlowRow({ summary, prefix }: { summary: ReferenceSummary; prefix: string }) {
  const navigate = useNavigate();
  const Icon = referenceTypeIcon(summary.type);
  return (
    <button
      type="button"
      onClick={() => summary.pagePath && navigate(summary.pagePath)}
      disabled={!summary.pagePath}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
    >
      <span className="shrink-0 font-mono text-xs text-slate-400">{prefix}</span>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-900">{referenceTypeLabel(summary.type)} #{summary.referenceNumber}</span>
        {summary.title && <span className="ml-1.5 truncate text-sm text-slate-500">— {summary.title}</span>}
      </div>
      {summary.status && (
        <Badge className={`${statusBadgeClass(summary.status)} shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium`}>
          {summary.status}
        </Badge>
      )}
    </button>
  );
}

/** The connected-records view opened from a global search result — shows the record plus everything linked to/from it. */
export function FlowPanel({ type, id, onClose }: { type: string; id: number | string; onClose: () => void }) {
  const [flow, setFlow] = useState<ReferenceFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setFlow(null);
    setError(null);
    getReferenceFlow(type, id)
      .then((data) => !cancelled && setFlow(data))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load this record.'));
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const RecordIcon = flow ? referenceTypeIcon(flow.record.type) : null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Connected Records</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!flow && !error && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && <p className="px-5 py-8 text-center text-sm text-red-600">{error}</p>}

        {flow && (
          <div className="p-5">
            <button
              type="button"
              onClick={() => flow.record.pagePath && navigate(flow.record.pagePath)}
              className="w-full rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-left transition hover:bg-amber-100"
            >
              <div className="flex items-start gap-3">
                {RecordIcon && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
                    <RecordIcon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{referenceTypeLabel(flow.record.type)}</p>
                  <p className="text-lg font-bold text-slate-900">
                    {flow.record.referenceNumber} — {flow.record.title}
                  </p>
                  {flow.record.status && (
                    <Badge className={`${statusBadgeClass(flow.record.status)} mt-1 rounded-full px-2.5 py-0.5 text-xs font-medium`}>
                      {flow.record.status}
                    </Badge>
                  )}
                </div>
              </div>
            </button>

            {(flow.linkedFrom.length > 0 || flow.linkedTo.length > 0) ? (
              <div className="mt-4 space-y-1 border-l-2 border-dashed border-slate-200 pl-4">
                {flow.linkedFrom.map((s) => (
                  <FlowRow key={`from-${s.type}-${s.id}`} summary={s} prefix="Linked from →" />
                ))}
                {flow.linkedTo.map((s) => (
                  <FlowRow key={`to-${s.type}-${s.id}`} summary={s} prefix="Linked to →" />
                ))}
              </div>
            ) : (
              <p className="mt-4 flex items-center gap-1.5 pl-1 text-sm text-slate-400">
                <ArrowRight className="h-3.5 w-3.5" /> Nothing else is linked to this record yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
