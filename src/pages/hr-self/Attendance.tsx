import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { hrSelfApi, HR_SELF_QUERY } from '@/api/hrSelf';
import { Button } from '@/components/ui/button';
import { EmptyState, HrPageHeader, StatCard, StatusBadge, TableSkeleton } from '@/pages/hr/components';
import { AttendanceMonthGrid, attendanceSummary, expandApprovedLeaveDates } from '@/pages/hr/AttendanceMonthGrid';
import { OfficeLocationMap } from '@/components/hr/OfficeLocationMap';
import { formatDuration, formatTime12, getCurrentPosition, hoursWorked } from '@/lib/hrChartHelpers';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

const HrSelfAttendance = () => {
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, ...HR_SELF_QUERY });
  const now = useNow();
  const accraNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Accra' }));
  const [month, setMonth] = useState(accraNow.getMonth() + 1);
  const [year, setYear] = useState(accraNow.getFullYear());
  const [tableView, setTableView] = useState(false);
  const [locError, setLocError] = useState<any>(null);
  const [busyLabel, setBusyLabel] = useState('');

  const attQ = useQuery({
    queryKey: ['hr-self', 'attendance', month, year],
    queryFn: () => hrSelfApi.attendance(month, year),
    enabled: !!meQ.data,
    ...HR_SELF_QUERY,
  });
  const todayQ = useQuery({
    queryKey: ['hr-self', 'attendance-today'],
    queryFn: hrSelfApi.attendanceToday,
    enabled: !!meQ.data,
    refetchInterval: 30000,
  });
  const leaveQ = useQuery({
    queryKey: ['hr-self', 'leave-requests'],
    queryFn: hrSelfApi.leaveRequests,
    enabled: !!meQ.data,
    ...HR_SELF_QUERY,
  });

  const records = attQ.data || [];
  const leaveDates = useMemo(
    () => expandApprovedLeaveDates(leaveQ.data || [], year, month),
    [leaveQ.data, year, month]
  );
  const summary = useMemo(() => attendanceSummary(records, leaveDates), [records, leaveDates]);
  const monthLabel = new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
  const rec = todayQ.data?.record;
  const clockedIn = !!(rec?.clock_in_time || rec?.clock_in);
  const clockedOut = !!(rec?.clock_out_time || rec?.clock_out);
  const startMs = rec?.clock_in_time ? new Date(rec.clock_in_time).getTime() : null;
  const todayIso = accraNow.toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  const onLeaveToday = !!(todayQ.data?.on_leave || leaveDates.includes(todayIso));

  const shift = (dir: number) => {
    const d = new Date(year, month - 1 + dir, 1);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hr-self', 'attendance'] });
    qc.invalidateQueries({ queryKey: ['hr-self', 'attendance-today'] });
  };

  const clockMut = useMutation({
    mutationFn: async (kind: 'in' | 'out') => {
      setLocError(null);
      setBusyLabel('Getting your location...');
      const coords = await getCurrentPosition();
      setBusyLabel(kind === 'in' ? 'Clocking in...' : 'Clocking out...');
      return kind === 'in'
        ? hrSelfApi.clockIn(coords.latitude, coords.longitude)
        : hrSelfApi.clockOut(coords.latitude, coords.longitude);
    },
    onSuccess: () => {
      setBusyLabel('');
      invalidate();
    },
    onError: (e: any) => {
      setBusyLabel('');
      setLocError(e);
    },
  });

  if (meQ.isLoading) return <TableSkeleton />;
  if (!meQ.data) {
    return <EmptyState title="Your HR profile hasn't been set up yet" description="Contact HR to get started." />;
  }

  const dateLabel = accraNow.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeLabel = accraNow.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  const hours = hoursWorked(rec?.clock_in, rec?.clock_out, rec?.clock_in_time, rec?.clock_out_time);

  return (
    <div>
      <HrPageHeader title="My Attendance" description="Clock in at the office with GPS, then review your month." />

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 shadow-[var(--shadow-md)]">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--text-muted)]">{dateLabel}</p>
        <p className="mt-2 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl">{timeLabel}</p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {!clockedIn && onLeaveToday && 'On leave today'}
          {!clockedIn && !onLeaveToday && 'Not clocked in'}
          {clockedIn && !clockedOut && `Clocked in at ${formatTime12(rec.clock_in_time || rec.clock_in)}`}
          {clockedIn && clockedOut && `Clocked out at ${formatTime12(rec.clock_out_time || rec.clock_out)}`}
        </p>

        <div className="mt-5">
          {!clockedIn && onLeaveToday && (
            <div className="mb-3">
              <StatusBadge status="On Leave" />
            </div>
          )}
          {!clockedIn && (
            <Button size="lg" disabled={clockMut.isPending} onClick={() => clockMut.mutate('in')}>
              {clockMut.isPending ? busyLabel || 'Clock In' : 'Clock In'}
            </Button>
          )}
          {clockedIn && !clockedOut && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="Present" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Currently Clocked In</span>
                {startMs && (
                  <span className="text-sm text-[var(--text-secondary)]">Working for {formatDuration(Date.now() - startMs)}</span>
                )}
                {rec?.is_late && (
                  <span className="rounded-full bg-[var(--accent-amber-light)] px-2 py-0.5 text-xs font-medium text-[var(--warning-text)]">
                    Clocked in {rec.late_minutes || 0} minutes late
                  </span>
                )}
              </div>
              <Button variant="outline" disabled={clockMut.isPending} onClick={() => clockMut.mutate('out')}>
                {clockMut.isPending ? busyLabel || 'Clock Out' : 'Clock Out'}
              </Button>
            </div>
          )}
          {clockedIn && clockedOut && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-[var(--text-muted)]">Clock In</p>
                <p className="text-sm font-semibold">{formatTime12(rec.clock_in_time || rec.clock_in)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Clock Out</p>
                <p className="text-sm font-semibold">{formatTime12(rec.clock_out_time || rec.clock_out)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Total Hours</p>
                <p className="text-sm font-semibold">{hours != null ? `${hours}h` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Status</p>
                <StatusBadge status={rec.is_late ? 'Late' : rec.status} />
              </div>
            </div>
          )}
        </div>

        {locError && (
          <div className="mt-4 rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-4">
            <p className="text-sm font-semibold text-[var(--danger-text)]">{locError.message || locError.error}</p>
            {locError.distance != null && (
              <p className="mt-1 text-sm text-[var(--danger-text)]">
                You are {locError.distance} meters away from the office. You must be within {locError.required}m to clock in.
              </p>
            )}
            {locError.office && locError.current && (
              <div className="mt-3">
                <OfficeLocationMap
                  office={{ lat: Number(locError.office.latitude), lng: Number(locError.office.longitude), name: locError.office.name }}
                  current={{ lat: Number(locError.current.latitude), lng: Number(locError.current.longitude) }}
                  radiusMeters={Number(locError.required || 100)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard label="Present" value={summary.present} accentIndex={0} />
        <StatCard label="Absent" value={summary.absent} accentIndex={1} />
        <StatCard label="Late" value={summary.late} accentIndex={2} />
        <StatCard label="On Leave" value={summary.leave} accentIndex={3} />
        <StatCard label="Total Hours" value={summary.hours.toFixed(1)} accentIndex={0} />
        <StatCard label="Overtime Hours" value={Number(summary.overtime).toFixed(2)} accentIndex={2} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Button variant="outline" onClick={() => setTableView((v) => !v)}>{tableView ? 'Calendar' : 'Table'}</Button>
      </div>

      <div className="mt-3">
        {attQ.isLoading && !attQ.data ? (
          <TableSkeleton />
        ) : tableView ? (
          records.length === 0 ? (
            <EmptyState title="No attendance records this month" />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              <table className="vobiss-table w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Clock In</th>
                    <th className="px-4 py-3">Clock Out</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Late</th>
                    <th className="px-4 py-3">Distance</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r: any) => {
                    const date = String(r.date).slice(0, 10);
                    const day = new Date(`${date}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' });
                    const h = hoursWorked(r.clock_in, r.clock_out, r.clock_in_time, r.clock_out_time);
                    return (
                      <tr key={r.id || date} className="border-b">
                        <td className="px-4 py-3">{date}</td>
                        <td className="px-4 py-3">{day}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              leaveDates.includes(date) && String(r.status || '').toLowerCase() === 'absent'
                                ? 'On Leave'
                                : r.is_late
                                  ? 'Late'
                                  : r.status
                            }
                          />
                        </td>
                        <td className="px-4 py-3">{formatTime12(r.clock_in_time || r.clock_in)}</td>
                        <td className="px-4 py-3">{formatTime12(r.clock_out_time || r.clock_out)}</td>
                        <td className="px-4 py-3">{h != null ? `${h}h` : '—'}</td>
                        <td className="px-4 py-3">{r.is_late ? `${r.late_minutes || 0}m` : '—'}</td>
                        <td className="px-4 py-3">
                          {r.clock_in_distance_meters != null ? (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.clock_in_distance_meters}m</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">{r.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <AttendanceMonthGrid year={year} month={month} records={records} leaveDates={leaveDates} />
        )}
      </div>
    </div>
  );
};

export default HrSelfAttendance;
