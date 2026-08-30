import { CheckCircle2, Clock3, XCircle } from 'lucide-react';
import {
  formatActedAt,
  pendingPartyNames,
  progressLabel,
  queueStatusLabel,
  type ApprovalParty,
  type ApprovalQueueTab,
  type QueueableApproval,
} from '../../lib/approvalQueue';

export function QueueStatusBadge({ item, tab }: { item: QueueableApproval; tab: ApprovalQueueTab }) {
  const label = queueStatusLabel(item, tab);
  const className =
    label === 'Rejected'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : label === 'Waiting for Other Approvals'
        ? 'bg-sky-100 text-sky-800 border-sky-200'
        : label === 'Fully Approved'
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : 'bg-amber-100 text-amber-800 border-amber-200';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function ApprovalProgress({
  item,
  tab,
  currentUserId,
}: {
  item: QueueableApproval;
  tab?: ApprovalQueueTab;
  currentUserId?: number | null;
}) {
  const parties = item.approval_parties || [];
  const progress = progressLabel(item);
  const waitingNames = pendingPartyNames(parties);
  const mine = parties.find((party) => Number(party.id) === Number(currentUserId));
  const myActed = item.my_acted_at || mine?.actedAt;
  const myDecision = String(item.my_decision || (item._approvedByMe ? 'approved' : '')).toLowerCase();

  return (
    <div className="space-y-1 text-xs text-slate-600">
      {tab && (
        <p className="font-medium text-slate-800">{queueStatusLabel(item, tab)}</p>
      )}
      {myDecision === 'approved' && myActed && (
        <p className="text-emerald-700">You approved this on {formatActedAt(myActed)}</p>
      )}
      {progress && <p>{progress}</p>}
      {waitingNames.length > 0 && tab !== 'completed' && (
        <p>Waiting for {waitingNames.join(', ')} to approve</p>
      )}
    </div>
  );
}

export function ApprovalPartyList({ parties }: { parties?: ApprovalParty[] }) {
  if (!parties?.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {parties.map((party) => {
        const status = String(party.status || 'pending').toLowerCase();
        return (
          <div key={`${party.id}-${party.name}`} className="flex items-center gap-2 text-xs text-slate-600">
            {status === 'approved' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : status === 'rejected' ? (
              <XCircle className="h-3.5 w-3.5 text-rose-600" />
            ) : (
              <Clock3 className="h-3.5 w-3.5 text-amber-500" />
            )}
            <span className="font-medium text-slate-800">{party.name}</span>
            <span>
              {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
              {party.actedAt ? ` · ${formatActedAt(party.actedAt)}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
