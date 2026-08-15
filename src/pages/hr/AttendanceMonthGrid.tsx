import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusBadge } from '@/pages/hr/components';
import { cn } from '@/lib/utils';
import { formatTime12, hoursWorked } from '@/lib/hrChartHelpers';

export type AttendanceRecord = {
  id?: number;
  date: string;
  status?: string;
  clock_in?: string | null;
  clock_out?: string | null;
  clock_in_time?: string | null;
  clock_out_time?: string | null;
  overtime_hours?: number | string;
  notes?: string | null;
  is_late?: boolean;
  late_minutes?: number;
  clock_in_distance_meters?: number | null;
  is_remote?: boolean;
};

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function statusKey(status?: string, rec?: AttendanceRecord) {
  if (rec?.is_late) return 'late';
  return String(status || '').toLowerCase();
}

export function expandApprovedLeaveDates(
  leaves: Array<{ start_date?: string; end_date?: string; status?: string }>,
  year?: number,
  month?: number
) {
  const prefix = year && month ? `${year}-${String(month).padStart(2, '0')}` : null;
  const dates: string[] = [];
  for (const leave of leaves) {
    if (String(leave.status || '').toLowerCase() !== 'approved') continue;
    const start = String(leave.start_date || '').slice(0, 10);
    const end = String(leave.end_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= new Date(`${end}T00:00:00Z`).getTime(); t += 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (prefix && !iso.startsWith(prefix)) continue;
      dates.push(iso);
    }
  }
  return dates;
}

function displayStatus(rec?: AttendanceRecord, onLeave?: boolean) {
  if (rec?.is_late) return 'Late';
  const s = String(rec?.status || '').toLowerCase();
  if (s === 'present' || s === 'late' || s === 'half-day') return rec?.status;
  if (onLeave || s.includes('leave')) return 'On Leave';
  return rec?.status;
}

function DayDot({ status, weekend }: { status?: string; weekend?: boolean }) {
  const s = String(status || '').toLowerCase();
  if (weekend && !s) return null;
  if (s === 'late') {
    return (
      <span className="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-amber)] text-[8px] font-bold text-white">
        L
      </span>
    );
  }
  if (s === 'present') return <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--accent-green)]" />;
  if (s === 'absent') return <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--accent-red)]" />;
  if (s.includes('leave')) return <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--accent-blue)]" />;
  return null;
}

export function AttendanceMonthGrid({
  year,
  month,
  records,
  leaveDates = [],
}: {
  year: number;
  month: number;
  records: AttendanceRecord[];
  leaveDates?: string[];
}) {
  const byDate = new Map(records.map((r) => [String(r.date).slice(0, 10), r]));
  const leaveSet = new Set(leaveDates.map((d) => String(d).slice(0, 10)));
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const mondayIndex = (first.getDay() + 6) % 7;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });

  const cells: Array<{ day: number | null }> = [
    ...Array.from({ length: mondayIndex }, () => ({ day: null })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1 })),
  ];

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-[var(--text-secondary)]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell, i) => {
          if (!cell.day) return <div key={`e${i}`} />;
          const date = iso(year, month, cell.day);
          const rec = byDate.get(date);
          const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
          const weekend = dow === 0 || dow === 6;
          const future = date > today;
          const isToday = date === today;
          const onLeave = leaveSet.has(date);
          let status = rec ? statusKey(rec.status, rec) : undefined;
          if (onLeave && (!status || status === 'absent')) status = 'leave';
          const hours = rec ? hoursWorked(rec.clock_in, rec.clock_out, rec.clock_in_time, rec.clock_out_time) : null;
          return (
            <Popover key={date}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'relative h-12 w-full min-w-[40px] rounded-[var(--radius-sm)] border p-1.5 text-left',
                    weekend ? 'border-[var(--border)] bg-[var(--surface-secondary)]' : 'border-[var(--border)]',
                    isToday && 'border-[var(--primary)]',
                    future && 'opacity-50'
                  )}
                >
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{cell.day}</div>
                  {!future && <DayDot status={status} weekend={weekend} />}
                </button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="text-sm font-semibold">{date}</p>
                {rec && displayStatus(rec, onLeave) !== 'On Leave' ? (
                  <div className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
                    <StatusBadge status={rec.is_late ? 'Late' : rec.status} />
                    <p>Clock in: {formatTime12(rec.clock_in_time || rec.clock_in)}</p>
                    <p>Clock out: {formatTime12(rec.clock_out_time || rec.clock_out)}</p>
                    <p>Hours worked: {hours != null ? `${hours}h` : '—'}</p>
                    <p>Distance: {rec.clock_in_distance_meters != null ? `${rec.clock_in_distance_meters}m` : '—'}</p>
                    {rec.is_late && <p>Late by {rec.late_minutes || 0} minutes</p>}
                    {rec.notes && <p>Notes: {rec.notes}</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {weekend ? 'Weekend' : future ? 'Upcoming' : onLeave ? 'On leave' : 'No record'}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>
    </div>
  );
}

export function attendanceSummary(records: AttendanceRecord[], leaveDates: string[] = []) {
  const leaveSet = new Set(leaveDates.map((d) => String(d).slice(0, 10)));
  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;
  let overtime = 0;
  let hours = 0;
  const seen = new Set<string>();
  for (const r of records) {
    const d = String(r.date).slice(0, 10);
    seen.add(d);
    const s = statusKey(r.status, r);
    if (leaveSet.has(d) && (s === 'absent' || s.includes('leave') || !s)) {
      leave += 1;
    } else if (s === 'present') present += 1;
    else if (s === 'absent') absent += 1;
    else if (s === 'late') {
      late += 1;
      present += 1;
    } else if (s.includes('leave')) leave += 1;
    overtime += Number(r.overtime_hours || 0);
    hours += hoursWorked(r.clock_in, r.clock_out, r.clock_in_time, r.clock_out_time) || 0;
  }
  for (const d of leaveSet) if (!seen.has(d)) leave += 1;
  return { present, absent, late, leave, overtime, hours: Math.round(hours * 100) / 100 };
}
