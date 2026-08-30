import { useEffect, useMemo, useState } from 'react';
import { Search, Shield, Star, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/UserAvatar';
import { useToast } from '@/hooks/use-toast';
import {
  createDaySchedule,
  addStaffToShift,
  setShiftLead,
  setPrimaryDuty,
  type StaffOption,
  type ShiftStaffMember,
} from '@/api/nocShifts';
import { formatShiftTimeRange, formatDateLabel } from '@/lib/shiftTime';

export interface ManageShiftTarget {
  date: string;
  shiftDefinitionId: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  scheduleId: number | null;
  staff: ShiftStaffMember[];
}

export function ManageShiftDialog({
  target,
  staffOptions,
  onClose,
  onChanged,
  onRequestRemove,
}: {
  target: ManageShiftTarget | null;
  staffOptions: StaffOption[];
  onClose: () => void;
  onChanged: () => void;
  onRequestRemove: (scheduleId: number, userId: number, fullName: string) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<Set<number>>(new Set());
  const [leadUserId, setLeadUserId] = useState<number | null>(null);
  const [primaryUserId, setPrimaryUserId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setQuery('');
    setSelectedToAdd(new Set());
    setError(null);
    setLeadUserId(target.staff.find((s) => s.isShiftLead)?.userId ?? null);
    setPrimaryUserId(target.staff.find((s) => s.isPrimaryDuty)?.userId ?? null);
  }, [target]);

  const existingIds = useMemo(() => new Set((target?.staff || []).map((s) => s.userId)), [target]);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staffOptions
      .filter((o) => !existingIds.has(o.id))
      .filter((o) => !q || o.fullName.toLowerCase().includes(q));
  }, [staffOptions, existingIds, query]);

  const eligibleForRoles = useMemo(() => {
    const existing = (target?.staff || []).map((s) => ({ id: s.userId, fullName: s.fullName }));
    const added = staffOptions.filter((o) => selectedToAdd.has(o.id)).map((o) => ({ id: o.id, fullName: o.fullName }));
    return [...existing, ...added];
  }, [target, staffOptions, selectedToAdd]);

  if (!target) return null;

  const toggleAdd = (id: number) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      let scheduleId = target.scheduleId;
      if (!scheduleId) {
        const created = await createDaySchedule(target.date, target.shiftDefinitionId);
        scheduleId = created.scheduleId;
      }
      const newUserIds = [...selectedToAdd];
      if (newUserIds.length) {
        await addStaffToShift(scheduleId, { userIds: newUserIds });
      }
      const currentLead = target.staff.find((s) => s.isShiftLead)?.userId ?? null;
      if (leadUserId && leadUserId !== currentLead) {
        await setShiftLead(scheduleId, leadUserId, true);
      }
      const currentPrimary = target.staff.find((s) => s.isPrimaryDuty)?.userId ?? null;
      if (primaryUserId && primaryUserId !== currentPrimary) {
        await setPrimaryDuty(scheduleId, primaryUserId, true);
      }
      toast({ title: 'Shift updated', description: `${target.shiftName} on ${formatDateLabel(target.date)} has been updated.` });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the shift.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Manage {target.shiftName} — {formatDateLabel(target.date)}
          </DialogTitle>
          <p className="text-xs text-[var(--text-secondary)]">{formatShiftTimeRange(target.startTime, target.endTime)}</p>
        </DialogHeader>

        {error && <p className="rounded-lg border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] px-3 py-2 text-sm text-[var(--danger-text)]">{error}</p>}

        {target.staff.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Currently Assigned</p>
            <div className="space-y-2">
              {target.staff.map((s) => (
                <div key={s.userId} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
                  <UserAvatar name={s.fullName} src={s.avatarUrl} className="h-7 w-7 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{s.fullName}</span>
                  <button
                    type="button"
                    title="Shift Lead"
                    onClick={() => setLeadUserId(leadUserId === s.userId ? null : s.userId)}
                    className={`rounded-md p-1.5 ${leadUserId === s.userId ? 'bg-[var(--accent-purple-light)] text-[var(--purple-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]'}`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Primary Duty"
                    onClick={() => setPrimaryUserId(primaryUserId === s.userId ? null : s.userId)}
                    className={`rounded-md p-1.5 ${primaryUserId === s.userId ? 'bg-[var(--accent-amber-light)] text-[var(--warning-text)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]'}`}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                  {target.scheduleId && (
                    <button
                      type="button"
                      title="Remove from shift"
                      onClick={() => target.scheduleId && onRequestRemove(target.scheduleId, s.userId, s.fullName)}
                      className="rounded-md p-1.5 text-[var(--danger-text)] hover:bg-[var(--accent-red-light)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">Add NOC Staff</p>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff by name…" className="pl-9" />
          </div>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
            {filteredOptions.length === 0 ? (
              <p className="py-4 text-center text-xs text-[var(--text-muted)]">No matching staff found.</p>
            ) : (
              filteredOptions.map((o) => {
                const checked = selectedToAdd.has(o.id);
                return (
                  <label key={o.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--primary)]">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar name={o.fullName} src={o.avatarUrl} className="h-6 w-6 shrink-0 text-[9px]" />
                      <span className="truncate">{o.fullName}</span>
                    </span>
                    <input type="checkbox" checked={checked} onChange={() => toggleAdd(o.id)} className="h-4 w-4 accent-[var(--primary)]" />
                  </label>
                );
              })
            )}
          </div>
        </div>

        {(eligibleForRoles.length > 0) && (leadUserId || primaryUserId) && (
          <p className="text-xs text-[var(--text-secondary)]">
            {leadUserId && <>Shift Lead: <strong>{eligibleForRoles.find((p) => p.id === leadUserId)?.fullName}</strong>. </>}
            {primaryUserId && <>Primary Duty: <strong>{eligibleForRoles.find((p) => p.id === primaryUserId)?.fullName}</strong>.</>}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
