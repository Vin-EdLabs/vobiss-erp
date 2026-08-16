import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { hrSelfApi, HR_SELF_QUERY } from '@/api/hrSelf';
import { Button } from '@/components/ui/button';
import { getCurrentPosition } from '@/lib/hrChartHelpers';

export default function WorkspaceClockCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const meQ = useQuery({ queryKey: ['hr-self', 'me'], queryFn: hrSelfApi.me, ...HR_SELF_QUERY });
  const todayQ = useQuery({
    queryKey: ['hr-self', 'attendance-today'],
    queryFn: hrSelfApi.attendanceToday,
    enabled: !!meQ.data,
    refetchInterval: 30000,
  });

  const rec = todayQ.data?.record;
  const clockedIn = !!(rec?.clock_in_time || rec?.clock_in);
  const clockedOut = !!(rec?.clock_out_time || rec?.clock_out);
  const onLeaveToday = !!todayQ.data?.on_leave;

  const clockMut = useMutation({
    mutationFn: async (kind: 'in' | 'out') => {
      setBusy(true);
      const coords = await getCurrentPosition();
      return kind === 'in'
        ? hrSelfApi.clockIn(coords.latitude, coords.longitude)
        : hrSelfApi.clockOut(coords.latitude, coords.longitude);
    },
    onSuccess: (_data, kind) => {
      setBusy(false);
      toast.success(kind === 'in' ? 'Clocked in' : 'Clocked out');
      qc.invalidateQueries({ queryKey: ['hr-self', 'attendance'] });
      qc.invalidateQueries({ queryKey: ['hr-self', 'attendance-today'] });
    },
    onError: (e: Error) => {
      setBusy(false);
      toast.error(e.message || 'Could not update attendance');
    },
  });

  let status = 'Not clocked in today';
  if (onLeaveToday && !clockedIn) status = 'On leave today';
  else if (clockedIn && !clockedOut) status = 'Clocked in';
  else if (clockedIn && clockedOut) status = 'Clocked out';

  return (
    <section className="w-full shrink-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)] lg:w-[220px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Staff Clock</h2>
        <Link to="/hr-self/attendance" className="text-xs font-medium text-[var(--primary)] hover:underline">
          History
        </Link>
      </div>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">{status}</p>
      <div className="mt-3">
        {!clockedIn && (
          <Button
            className="w-full"
            disabled={clockMut.isPending || busy || onLeaveToday || meQ.isLoading || !meQ.data}
            onClick={() => clockMut.mutate('in')}
          >
            {clockMut.isPending || busy ? 'Clocking in…' : 'Clock In'}
          </Button>
        )}
        {clockedIn && !clockedOut && (
          <Button
            className="w-full"
            variant="outline"
            disabled={clockMut.isPending || busy}
            onClick={() => clockMut.mutate('out')}
          >
            {clockMut.isPending || busy ? 'Clocking out…' : 'Clock Out'}
          </Button>
        )}
      </div>
    </section>
  );
}
