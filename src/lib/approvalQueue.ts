export type ApprovalQueueTab = 'pending_mine' | 'waiting_others' | 'completed';

export type ApprovalParty = {
  id?: number | null;
  name: string;
  status: 'approved' | 'pending' | 'rejected' | string;
  actedAt?: string | null;
};

export type QueueableApproval = {
  status?: string | null;
  current_stage?: string | null;
  type?: string | null;
  my_decision?: string | null;
  my_acted_at?: string | null;
  _approvedByMe?: boolean;
  approvals_count?: number;
  approvals_required?: number;
  approval_parties?: ApprovalParty[];
};

export function isRejectedStatus(status?: string | null) {
  return String(status || '').toLowerCase().includes('rejected');
}

export function formatActedAt(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

export function pendingPartyNames(parties?: ApprovalParty[]) {
  return (parties || [])
    .filter((party) => String(party.status || 'pending').toLowerCase() === 'pending')
    .map((party) => party.name)
    .filter(Boolean);
}

export function classifyApprovalQueueItem(item: QueueableApproval): ApprovalQueueTab {
  const decision = String(item.my_decision || (item._approvedByMe ? 'approved' : '')).toLowerCase();
  const status = String(item.status || '').toLowerCase();
  const stage = String(item.current_stage || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();

  if (decision === 'rejected' || isRejectedStatus(status)) return 'completed';

  const cashWaitingFinance = type === 'cash_request' && status === 'supervisor_approved';
  const fullyApproved =
    !cashWaitingFinance &&
    (
      status === 'approved' ||
      status === 'completed' ||
      status === 'finance_approved' ||
      status === 'sent_to_finance' ||
      status === 'pending_finance' ||
      status === 'cash_issued' ||
      status === 'supervisor_approved' ||
      status.includes('approved by supervisor') ||
      ['finance_cash', 'awaiting_receipt', 'finance_completed', 'completed'].includes(stage)
    );

  if (fullyApproved) return 'completed';
  if (decision === 'approved' || cashWaitingFinance && item._approvedByMe) return 'waiting_others';
  return 'pending_mine';
}

export function queueStatusLabel(item: QueueableApproval, tab: ApprovalQueueTab) {
  const status = String(item.status || '').toLowerCase();
  if (isRejectedStatus(status) || String(item.my_decision || '').toLowerCase() === 'rejected') return 'Rejected';
  if (tab === 'waiting_others') return 'Waiting for Other Approvals';
  if (tab === 'completed') {
    if (isRejectedStatus(status)) return 'Rejected';
    return 'Fully Approved';
  }
  return 'Pending My Action';
}

export function progressLabel(item: QueueableApproval) {
  const required = Number(item.approvals_required || 0);
  const count = Number(item.approvals_count || 0);
  if (required > 0) return `${count} of ${required} approvers have approved`;
  const parties = item.approval_parties || [];
  if (!parties.length) return null;
  const approved = parties.filter((party) => String(party.status).toLowerCase() === 'approved').length;
  return `${approved} of ${parties.length} approvers have approved`;
}
