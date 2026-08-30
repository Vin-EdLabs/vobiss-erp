import { Sun, Moon, Clock, Users, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatShiftTimeRange, formatDateLabel } from '@/lib/shiftTime';
import { StaffRow } from './StaffBadges';
import type { DutySnapshot } from '@/api/nocShifts';

export function NextShiftCard({
  shift,
  isManager,
  onAddStaff,
}: {
  shift: DutySnapshot | null;
  isManager: boolean;
  onAddStaff: () => void;
}) {
  if (!shift) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-6 shadow-[var(--shadow-sm)]">
        <p className="text-sm text-[var(--text-secondary)]">No upcoming shift is configured.</p>
      </div>
    );
  }

  const isNight = /night/i.test(shift.shiftName);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Next Shift</p>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
            {isNight ? <Moon className="h-5 w-5 text-[var(--accent-purple)]" /> : <Sun className="h-5 w-5 text-[var(--accent-amber)]" />}
            {shift.shiftName}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
            <Clock className="h-3.5 w-3.5" /> {formatShiftTimeRange(shift.startsAt.slice(11, 16), shift.endsAt.slice(11, 16))} · {formatDateLabel(shift.date)}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <Users className="h-3.5 w-3.5" /> {shift.staff.length} NOC Staff Scheduled
        </p>
        {isManager && (
          <button
            type="button"
            onClick={onAddStaff}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-strong)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Staff
          </button>
        )}
      </div>

      {shift.staff.length === 0 ? (
        <EmptyState
          title="No staff scheduled yet"
          description="Get ahead by assigning NOC Staff to the upcoming shift."
          action={
            isManager ? (
              <button type="button" onClick={onAddStaff} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
                <Plus className="h-3.5 w-3.5" /> Add Staff
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {shift.staff.map((s) => (
            <StaffRow key={s.userId} staff={s} />
          ))}
        </div>
      )}
    </div>
  );
}
