import { ChevronLeft, ChevronRight, Copy, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ShiftCell } from './ShiftCell';
import type { WeekRosterResponse, WeekShiftCell } from '@/api/nocShifts';
import { toDateOnlyString } from '@/lib/shiftTime';

export function WeeklyGrid({
  week,
  loading,
  error,
  isManager,
  isCurrentWeek,
  onPrevWeek,
  onCurrentWeek,
  onNextWeek,
  onCopyWeek,
  onManageCell,
  copying,
}: {
  week: WeekRosterResponse | undefined;
  loading: boolean;
  error: string | null;
  isManager: boolean;
  isCurrentWeek: boolean;
  onPrevWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onCopyWeek: () => void;
  onManageCell: (date: string, cell: WeekShiftCell) => void;
  copying: boolean;
}) {
  const today = toDateOnlyString(new Date());

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[var(--text-secondary)]" />
          <h2 className="text-sm font-bold text-[var(--text-primary)]">Weekly Roster</h2>
          {week && (
            <span className="text-xs text-[var(--text-secondary)]">
              {week.weekStart} – {week.weekEnd}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-0.5">
            <button type="button" onClick={onPrevWeek} className="rounded-md p-1.5 hover:bg-[var(--surface-secondary)]" aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCurrentWeek}
              className="rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              disabled={isCurrentWeek}
            >
              Current Week
            </button>
            <button type="button" onClick={onNextWeek} className="rounded-md p-1.5 hover:bg-[var(--surface-secondary)]" aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {isManager && (
            <Button size="sm" variant="outline" onClick={onCopyWeek} disabled={copying} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> {copying ? 'Copying…' : 'Copy Week'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] px-3 py-2 text-sm text-[var(--danger-text)]">{error}</p>
      )}

      {loading && !week && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      )}

      {week && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {week.days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2">
              <div className={`rounded-lg px-2 py-1.5 text-center ${day.date === today ? 'bg-[var(--accent-green-light)]' : 'bg-[var(--surface-secondary)]'}`}>
                <p className="text-xs font-bold text-[var(--text-primary)]">{day.dayLabel}</p>
                <p className="text-[10px] text-[var(--text-secondary)]">{day.date}</p>
              </div>
              <div className="flex flex-col gap-2">
                {day.shifts.map((shift) => (
                  <ShiftCell
                    key={shift.shiftDefinitionId}
                    cell={shift}
                    date={day.date}
                    isManager={isManager}
                    onManage={onManageCell}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
