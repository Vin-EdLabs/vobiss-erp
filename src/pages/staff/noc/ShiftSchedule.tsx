import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { isSystemAdminAccount, userHasAnyRole } from '@/config/roles';
import {
  getCurrentDuty,
  getWeekRoster,
  getShiftDefinitions,
  getStaffOptions,
  copyWeekForward,
  removeStaffFromShift,
  type WeekShiftCell,
} from '@/api/nocShifts';
import { mondayOf, addDaysToDateString, toDateOnlyString } from '@/lib/shiftTime';
import { CurrentShiftCard } from '@/components/noc/shiftSchedule/CurrentShiftCard';
import { NextShiftCard } from '@/components/noc/shiftSchedule/NextShiftCard';
import { WeeklyGrid } from '@/components/noc/shiftSchedule/WeeklyGrid';
import { ManageShiftDialog, type ManageShiftTarget } from '@/components/noc/shiftSchedule/ManageShiftDialog';
import { ShiftTimesSettingsDialog } from '@/components/noc/shiftSchedule/ShiftTimesSettingsDialog';
import { ConfirmActionDialog, type ConfirmActionState } from '@/components/noc/shiftSchedule/ConfirmActionDialog';

const NOC_MANAGER_ROLES = ['noc_manager', 'noc_supervisor', 'director', 'cto'];

// Real accounts usually carry the actual job title in `position` ("NOC Supervisor") with
// role/main_role left as a generic account type — a role-slug-only check silently hid shift
// times and the staff picker from real NOC supervisors whose role isn't literally tagged.
function isNocManagerByPosition(user: any): boolean {
  const position = String(user?.position || '').trim().toLowerCase();
  const looksLikeManager = position.includes('manager') || position.includes('supervisor');
  const units = [user?.unit, ...(Array.isArray(user?.units) ? user.units : [])]
    .map((u) => String(u || '').trim().toLowerCase());
  return looksLikeManager && units.includes('noc');
}

export default function ShiftSchedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isManager = isSystemAdminAccount(user) || userHasAnyRole(user, NOC_MANAGER_ROLES) || isNocManagerByPosition(user);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const [weekStart, setWeekStart] = useState(() => mondayOf(toDateOnlyString(new Date())));
  const currentWeekStart = mondayOf(toDateOnlyString(new Date()));

  const [manageTarget, setManageTarget] = useState<ManageShiftTarget | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmActionState | null>(null);
  const [copying, setCopying] = useState(false);

  const dutyQuery = useQuery({ queryKey: ['noc-shifts', 'current-duty'], queryFn: getCurrentDuty, refetchInterval: 30000 });
  const weekQuery = useQuery({ queryKey: ['noc-shifts', 'week', weekStart], queryFn: () => getWeekRoster(weekStart) });
  const definitionsQuery = useQuery({ queryKey: ['noc-shifts', 'definitions'], queryFn: getShiftDefinitions });
  const staffOptionsQuery = useQuery({ queryKey: ['noc-shifts', 'staff-options'], queryFn: getStaffOptions, enabled: isManager });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['noc-shifts'] });
  };

  const openManageForCell = (date: string, cell: WeekShiftCell) => {
    setManageTarget({
      date,
      shiftDefinitionId: cell.shiftDefinitionId,
      shiftName: cell.name,
      startTime: cell.startTime,
      endTime: cell.endTime,
      scheduleId: cell.scheduleId,
      staff: cell.staff,
    });
  };

  const openManageForDuty = (snapshot: { date: string; shiftDefinitionId: number; shiftName: string; startsAt: string; endsAt: string; scheduleId: number | null; staff: any[] } | null) => {
    if (!snapshot) return;
    const def = definitionsQuery.data?.find((d) => d.id === snapshot.shiftDefinitionId);
    setManageTarget({
      date: snapshot.date,
      shiftDefinitionId: snapshot.shiftDefinitionId,
      shiftName: snapshot.shiftName,
      startTime: def?.start_time || snapshot.startsAt.slice(11, 16),
      endTime: def?.end_time || snapshot.endsAt.slice(11, 16),
      scheduleId: snapshot.scheduleId,
      staff: snapshot.staff,
    });
  };

  const requestRemoveStaff = (scheduleId: number, userId: number, fullName: string) => {
    setConfirmState({
      title: 'Remove NOC Staff',
      description: `Remove ${fullName} from this shift? They will be notified.`,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        try {
          await removeStaffFromShift(scheduleId, userId);
          toast({ title: 'Staff removed', description: `${fullName} has been removed from the shift.` });
          refreshAll();
        } catch (e) {
          toast({ title: 'Could not remove staff', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
        } finally {
          setConfirmState(null);
        }
      },
    });
  };

  const requestCopyWeek = () => {
    const nextWeekStart = addDaysToDateString(weekStart, 7);
    setConfirmState({
      title: 'Copy Week Forward',
      description: `Copy this week's full roster (${weekStart} to ${weekQuery.data?.weekEnd}) to the week of ${nextWeekStart}? Existing entries for that week will be overwritten.`,
      confirmLabel: 'Copy Week',
      onConfirm: async () => {
        try {
          setCopying(true);
          await copyWeekForward(weekStart);
          toast({ title: 'Week copied', description: `Roster copied to the week of ${nextWeekStart}.` });
          refreshAll();
        } catch (e) {
          toast({ title: 'Could not copy week', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
        } finally {
          setCopying(false);
          setConfirmState(null);
        }
      },
    });
  };

  const duty = dutyQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Network Operations Center</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]">
            <Clock3 className="h-7 w-7" /> NOC Shift Schedule
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Who's on duty, right now and across the week.</p>
        </div>
        {isManager && (
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
            <Settings className="h-4 w-4" /> Shift Times
          </Button>
        )}
      </div>

      {dutyQuery.isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      )}
      {dutyQuery.isError && (
        <div className="rounded-xl border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] p-4">
          <p className="text-sm text-[var(--danger-text)]">Couldn't load the current duty status.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => dutyQuery.refetch()}>Retry</Button>
        </div>
      )}
      {duty && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CurrentShiftCard
            shift={duty.current}
            now={now}
            isManager={isManager}
            onAddStaff={() => openManageForDuty(duty.current)}
            onRemoveStaff={(userId, fullName) => duty.current?.scheduleId && requestRemoveStaff(duty.current.scheduleId, userId, fullName)}
          />
          <NextShiftCard
            shift={duty.next}
            isManager={isManager}
            onAddStaff={() => openManageForDuty(duty.next)}
          />
        </div>
      )}

      <WeeklyGrid
        week={weekQuery.data}
        loading={weekQuery.isLoading}
        error={weekQuery.isError ? 'Could not load the weekly roster.' : null}
        isManager={isManager}
        isCurrentWeek={weekStart === currentWeekStart}
        onPrevWeek={() => setWeekStart((w) => addDaysToDateString(w, -7))}
        onCurrentWeek={() => setWeekStart(currentWeekStart)}
        onNextWeek={() => setWeekStart((w) => addDaysToDateString(w, 7))}
        onCopyWeek={requestCopyWeek}
        onManageCell={openManageForCell}
        copying={copying}
      />

      <ManageShiftDialog
        target={manageTarget}
        staffOptions={staffOptionsQuery.data || []}
        onClose={() => setManageTarget(null)}
        onChanged={refreshAll}
        onRequestRemove={(scheduleId, userId, fullName) => requestRemoveStaff(scheduleId, userId, fullName)}
      />

      <ShiftTimesSettingsDialog
        open={settingsOpen}
        definitions={definitionsQuery.data || []}
        onClose={() => setSettingsOpen(false)}
        onChanged={refreshAll}
      />

      <ConfirmActionDialog state={confirmState} onOpenChange={(open) => !open && setConfirmState(null)} />
    </div>
  );
}
