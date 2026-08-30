import { Sun, Moon, Clock, Users, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatShiftTimeRange, formatTimeRemaining } from '@/lib/shiftTime';
import { StaffRow } from './StaffBadges';
import { IncidentNoteMiniCard } from './IncidentNoteMiniCard';
import type { DutySnapshot } from '@/api/nocShifts';

export function CurrentShiftCard({
  shift,
  now,
  isManager,
  onAddStaff,
  onRemoveStaff,
}: {
  shift: DutySnapshot | null;
  now: Date;
  isManager: boolean;
  onAddStaff: () => void;
  onRemoveStaff: (userId: number, fullName: string) => void;
}) {
  if (!shift) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--text-secondary)]">No shift is configured for right now.</p>
      </div>
    );
  }

  const isNight = /night/i.test(shift.shiftName);
  const remaining = formatTimeRemaining(shift.endsAt, now);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-green)]/40 bg-[var(--surface)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent-green)] opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-green)]" />
            </span>
            Current Shift
          </p>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-3xl">
            {isNight ? <Moon className="h-6 w-6 text-[var(--accent-purple)]" /> : <Sun className="h-6 w-6 text-[var(--accent-amber)]" />}
            {shift.shiftName.toUpperCase()}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Clock className="h-3.5 w-3.5" /> {formatShiftTimeRange(shift.startsAt.slice(11, 16), shift.endsAt.slice(11, 16))}
          </p>
        </div>
        {remaining && (
          <div className="rounded-xl bg-[var(--accent-green-light)] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--success-text)]">Time Remaining</p>
            <p className="text-lg font-bold text-[var(--success-text)]">{remaining}</p>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Users className="h-3.5 w-3.5" /> {shift.staff.length} NOC Staff On Duty
        </p>
        {isManager && (
          <button
            type="button"
            onClick={onAddStaff}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Staff
          </button>
        )}
      </div>

      {shift.staff.length === 0 ? (
        <EmptyState
          title="No staff assigned to this shift"
          description="Add NOC Staff so it's clear who's on duty right now."
          action={
            isManager ? (
              <button type="button" onClick={onAddStaff} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)]">
                <Plus className="h-3.5 w-3.5" /> Add Staff
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {shift.staff.map((s) => (
            <StaffRow key={s.userId} staff={s} removable={isManager} onRemove={() => onRemoveStaff(s.userId, s.fullName)} />
          ))}
        </div>
      )}

      <div className="mt-4">
        <IncidentNoteMiniCard startsAt={shift.startsAt} endsAt={shift.endsAt} />
      </div>
    </div>
  );
}
