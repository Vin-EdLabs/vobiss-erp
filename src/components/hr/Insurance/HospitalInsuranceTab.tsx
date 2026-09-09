import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, HeartPulse, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard, EmptyState, StatusBadge, TruncatedReason, RequestDetailDialog } from '@/pages/hr/components';
import type { InsuranceTransfer } from '@/api/insurance';
import { formatGhs } from '@/lib/taxCalculations';
import { insuranceApi, insuranceSelfApi, INSURANCE_QUERY, type InsuranceProfile } from '@/api/insurance';
import { CircularProgress } from './CircularProgress';
import { CategoryCard } from './CategoryCard';
import { PendingActionCard } from './PendingActionCard';
import { LogClaimModal } from './LogClaimModal';
import { InitiateTransferModal } from './InitiateTransferModal';

const PAGE_SIZE = 8;

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function transferStatusLabel(status: string) {
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  if (status === 'acknowledged') return 'Acknowledged';
  if (status === 'reversed') return 'Reversed';
  return status;
}

function Paginated<T>({
  rows,
  page,
  onPageChange,
}: {
  rows: T[];
  page: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.min(page, totalPages - 1);
  const start = clamped * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  return {
    pageRows,
    footer:
      rows.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span>
            {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={clamped === 0}
              onClick={() => onPageChange(clamped - 1)}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={clamped >= totalPages - 1}
              onClick={() => onPageChange(clamped + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null,
  } as const;
}

export function HospitalInsuranceTab({
  employeeId,
  canManage,
}: {
  employeeId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const [claimsPage, setClaimsPage] = useState(0);
  const [transfersPage, setTransfersPage] = useState(0);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferDetail, setTransferDetail] = useState<InsuranceTransfer | null>(null);

  const queryKey = canManage ? ['insurance', 'staff', employeeId] : ['insurance', 'me'];
  const { data: profile, isLoading, error } = useQuery<InsuranceProfile | null>({
    queryKey,
    queryFn: () => (canManage ? insuranceApi.getStaffProfile(employeeId) : insuranceSelfApi.me()),
    ...INSURANCE_QUERY,
  });

  const refresh = () => qc.invalidateQueries({ queryKey });

  const sortedClaims = useMemo(
    () => [...(profile?.claims || [])].sort((a, b) => new Date(b.claimDate).getTime() - new Date(a.claimDate).getTime()),
    [profile?.claims]
  );
  const sortedTransfers = useMemo(
    () => [...(profile?.transfers || [])].sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime()),
    [profile?.transfers]
  );

  const claimsPaged = Paginated({ rows: sortedClaims, page: claimsPage, onPageChange: setClaimsPage });
  const transfersPaged = Paginated({ rows: sortedTransfers, page: transfersPage, onPageChange: setTransfersPage });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[var(--card-radius)] bg-[var(--surface-secondary)]" />
        ))}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <EmptyState
        title="No active insurance policy"
        description={
          canManage
            ? 'Set up a company-wide policy template under HR → Insurance → Policy Configuration to get started.'
            : 'Your medical insurance has not been set up yet. Contact HR if you believe this is a mistake.'
        }
      />
    );
  }

  const usedPct = profile.totals.limit > 0 ? (profile.totals.used / profile.totals.limit) * 100 : 0;

  return (
    <div className="space-y-5">
      {profile.pendingForStaff.length > 0 && (
        <div className="space-y-2">
          {profile.pendingForStaff.map((t) => (
            <PendingActionCard key={t.id} transfer={t} onResolved={refresh} canRespond={!canManage} />
          ))}
        </div>
      )}

      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <CircularProgress
              value={usedPct}
              label={
                <span className="text-xl font-bold text-[var(--text-primary)]">{Math.round(usedPct)}%</span>
              }
              sublabel="Used"
            />
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                <ShieldCheck className="h-4 w-4 text-[var(--accent-green)]" />
                {profile.template.name}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Policy period: {formatDate(profile.policy.startDate)} — {formatDate(profile.policy.endDate)}
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setTransferModalOpen(true)}>
                <ArrowRight className="mr-1 h-4 w-4" />
                Transfer Balance
              </Button>
              <Button size="sm" onClick={() => setClaimModalOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Log Claim
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="Total Limit" value={formatGhs(profile.totals.limit)} icon={HeartPulse} accentIndex={3} />
          <StatCard label="Total Used" value={formatGhs(profile.totals.used)} accentIndex={2} />
          <StatCard label="Total Remaining" value={formatGhs(profile.totals.remaining)} accentIndex={0} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Categories</h3>
        {profile.categories.length === 0 ? (
          <EmptyState title="No categories configured" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.categories.map((cat) => (
              <CategoryCard key={cat.id} category={cat} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Claims History</h3>
        <div className="overflow-x-auto rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Hospital</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Logged By</th>
              </tr>
            </thead>
            <tbody>
              {claimsPaged.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">
                    No claims logged yet.
                  </td>
                </tr>
              ) : (
                claimsPaged.pageRows.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(c.claimDate)}</td>
                    <td className="px-3 py-2">{c.hospitalName || '—'}</td>
                    <td className="px-3 py-2">{c.categoryName}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={c.claimType === 'inpatient' ? 'processing' : 'active'} />
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatGhs(c.amount)}</td>
                    <td className="px-3 py-2">{c.loggedBy || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {claimsPaged.footer}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Transfers History</h3>
        <div className="overflow-x-auto rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Flow</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Initiated By</th>
              </tr>
            </thead>
            <tbody>
              {transfersPaged.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[var(--text-muted)]">
                    No transfers yet.
                  </td>
                </tr>
              ) : (
                transfersPaged.pageRows.map((t) => (
                  <tr key={t.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.initiatedAt)}</td>
                    <td className="px-3 py-2">{t.fromCategoryName}</td>
                    <td className="px-3 py-2">{t.toCategoryName}</td>
                    <td className="px-3 py-2 capitalize">{t.transferType}</td>
                    <td className="px-3 py-2 font-semibold">{formatGhs(t.amount)}</td>
                    <td className="px-3 py-2">
                      <TruncatedReason text={t.reason} onOpen={() => setTransferDetail(t)} />
                    </td>
                    <td className="px-3 py-2">{t.flowType === 'hr_override' ? 'HR Override' : 'Staff Confirm'}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={transferStatusLabel(t.status)} />
                    </td>
                    <td className="px-3 py-2">{t.initiatedBy || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {transfersPaged.footer}
        </div>
      </div>

      <RequestDetailDialog
        open={!!transferDetail}
        onClose={() => setTransferDetail(null)}
        title={transferDetail ? `Transfer — ${transferDetail.fromCategoryName} → ${transferDetail.toCategoryName}` : 'Transfer'}
        status={transferDetail ? transferStatusLabel(transferDetail.status) : undefined}
        reason={transferDetail?.reason}
        reasonLabel="Reason for transfer"
        rejectionReason={transferDetail?.status === 'rejected' ? transferDetail?.notes : undefined}
        fields={[
          { label: 'Amount', value: transferDetail ? formatGhs(transferDetail.amount) : '' },
          { label: 'Type', value: transferDetail?.transferType },
          { label: 'Flow', value: transferDetail?.flowType === 'hr_override' ? 'HR Override' : 'Staff Confirm' },
          { label: 'Initiated By', value: transferDetail?.initiatedBy },
          { label: 'Initiated At', value: transferDetail ? formatDate(transferDetail.initiatedAt) : '' },
          { label: 'Staff Responded At', value: transferDetail?.staffRespondedAt ? formatDate(transferDetail.staffRespondedAt) : '—' },
        ]}
      />

      {canManage && (
        <>
          <LogClaimModal
            open={claimModalOpen}
            onOpenChange={setClaimModalOpen}
            employeeId={employeeId}
            categories={profile.categories}
            onLogged={refresh}
          />
          <InitiateTransferModal
            open={transferModalOpen}
            onOpenChange={setTransferModalOpen}
            employeeId={employeeId}
            categories={profile.categories}
            onInitiated={refresh}
          />
        </>
      )}
    </div>
  );
}
