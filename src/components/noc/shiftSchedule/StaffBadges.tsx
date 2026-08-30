import { Shield, Star } from 'lucide-react';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';
import type { ShiftStaffMember } from '@/api/nocShifts';

export function ShiftLeadBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-[var(--accent-purple-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--purple-text)]', className)}>
      <Shield className="h-3 w-3" /> Shift Lead
    </span>
  );
}

export function PrimaryDutyBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-[var(--accent-amber-light)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--warning-text)]', className)}>
      <Star className="h-3 w-3" /> Primary Duty
    </span>
  );
}

export function StaffRow({
  staff,
  onRemove,
  removable = false,
}: {
  staff: ShiftStaffMember;
  onRemove?: (userId: number) => void;
  removable?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <UserAvatar name={staff.fullName} src={staff.avatarUrl} className="h-9 w-9 shrink-0 text-xs" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{staff.fullName}</p>
        {(staff.isShiftLead || staff.isPrimaryDuty) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {staff.isShiftLead && <ShiftLeadBadge />}
            {staff.isPrimaryDuty && <PrimaryDutyBadge />}
          </div>
        )}
      </div>
      {removable && onRemove && (
        <button
          type="button"
          onClick={() => onRemove(staff.userId)}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[var(--danger-text)] hover:bg-[var(--accent-red-light)]"
        >
          Remove
        </button>
      )}
    </div>
  );
}

export function StaffAvatarStack({ staff, max = 5 }: { staff: ShiftStaffMember[]; max?: number }) {
  const shown = staff.slice(0, max);
  const overflow = staff.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((s, i) => (
        <UserAvatar
          key={s.userId}
          name={s.fullName}
          src={s.avatarUrl}
          className={cn('h-7 w-7 border-2 border-[var(--surface)] text-[10px]', i > 0 && '-ml-2')}
        />
      ))}
      {overflow > 0 && (
        <span className="-ml-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--surface)] bg-[var(--surface-secondary)] text-[10px] font-semibold text-[var(--text-secondary)]">
          +{overflow}
        </span>
      )}
    </div>
  );
}
