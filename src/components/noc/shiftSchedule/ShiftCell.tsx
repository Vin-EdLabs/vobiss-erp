import { Sun, Moon, Plus, Users } from 'lucide-react';
import { StatusPill } from '@/components/ui/status-pill';
import { formatShiftTimeRange } from '@/lib/shiftTime';
import { StaffAvatarStack, ShiftLeadBadge, PrimaryDutyBadge } from './StaffBadges';
import type { WeekShiftCell } from '@/api/nocShifts';
import { cn } from '@/lib/utils';

const STATUS_TONE = {
  active: 'success',
  upcoming: 'info',
  completed: 'info',
} as const;

export function ShiftCell({
  cell,
  date,
  isManager,
  onManage,
}: {
  cell: WeekShiftCell;
  date: string;
  isManager: boolean;
  onManage: (date: string, cell: WeekShiftCell) => void;
}) {
  const isNight = /night/i.test(cell.name);
  const lead = cell.staff.find((s) => s.isShiftLead);
  const primary = cell.staff.find((s) => s.isPrimaryDuty);

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border p-3 transition',
        cell.status === 'active' ? 'border-[var(--accent-green)]/50 shadow-[var(--shadow-sm)]' : 'border-[var(--border)]',
        isNight ? 'bg-[var(--surface-secondary)]' : 'bg-[var(--surface)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
          {isNight ? <Moon className="h-3.5 w-3.5 text-[var(--accent-purple)]" /> : <Sun className="h-3.5 w-3.5 text-[var(--accent-amber)]" />}
          {cell.name}
        </div>
        <StatusPill tone={STATUS_TONE[cell.status]} className={cell.status === 'completed' ? 'opacity-60' : undefined}>
          {cell.status}
        </StatusPill>
      </div>
      <p className="text-[11px] text-[var(--text-secondary)]">{formatShiftTimeRange(cell.startTime, cell.endTime)}</p>

      {cell.staff.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">No staff assigned</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <StaffAvatarStack staff={cell.staff} max={4} />
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <Users className="h-3 w-3" /> {cell.staff.length}
            </span>
          </div>
          {lead && <ShiftLeadBadge />}
          {primary && <PrimaryDutyBadge />}
        </div>
      )}

      {isManager && (
        <button
          type="button"
          onClick={() => onManage(date, cell)}
          className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-strong)] px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Plus className="h-3 w-3" /> {cell.staff.length ? 'Manage Staff' : 'Add Staff'}
        </button>
      )}
    </div>
  );
}
