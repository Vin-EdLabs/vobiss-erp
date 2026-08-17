import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hrApi, HR_QUERY } from '@/api/hr';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Avatar, EmptyState, Field, HrPageHeader, StatusBadge, TableSkeleton, inputClass, YearSelect } from './components';
import { AttendanceMonthGrid, expandApprovedLeaveDates } from './AttendanceMonthGrid';
import { OfficeLocationMap } from '@/components/hr/OfficeLocationMap';
import { formatDuration, formatTime12, getCurrentPosition } from '@/lib/hrChartHelpers';
import { rechartsTooltipStyle, useChartTheme } from '@/lib/chartDefaults';
import { cn } from '@/lib/utils';

function heatmapTone(dayIso: string, rec: any, leaveDates: string[]) {
  const dow = new Date(`${dayIso}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  const leaveSet = new Set((leaveDates || []).map((d) => String(d).slice(0, 10)));
  const status = String(rec?.status || '').toLowerCase();
  const worked = !!(rec?.clock_in_time || rec?.clock_in) || status === 'present' || status === 'late' || status === 'half-day';
  if (dayIso > today) return { className: 'bg-transparent border border-[var(--border)]', label: 'No data' };
  if (rec?.is_late || status === 'late') return { className: 'bg-[var(--accent-amber)]', label: 'Late' };
  if (worked && status !== 'absent') return { className: 'bg-[var(--accent-green)]', label: 'Present' };
  if (leaveSet.has(dayIso) || status.includes('leave')) return { className: 'bg-[var(--accent-blue)]', label: 'On Leave' };
  if (status === 'absent') return { className: 'bg-[var(--accent-red)]', label: 'Absent' };
  if (weekend) return { className: 'bg-[var(--surface-secondary)]', label: 'Weekend' };
  return { className: 'bg-transparent border border-[var(--border)]', label: 'No data' };
}

function notInBadge(status?: string) {
  const s = String(status || '');
  if (/leave/i.test(s)) return 'On Leave';
  if (/clocked out/i.test(s)) return 'Clocked out';
  return s || 'Not clocked in';
}

const HrAttendance = () => {
  const qc = useQueryClient();
  const chartTheme = useChartTheme();
  const now = new Date();
  const [tab, setTab] = useState('live');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [individualId, setIndividualId] = useState<string>('');
  const [form, setForm] = useState({
    employee_id: '',
    date: now.toISOString().slice(0, 10),
    status: 'Present',
    clock_in: '08:00',
    clock_out: '17:00',
    overtime_hours: '0',
    notes: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    office_name: 'Vobiss Office',
    office_latitude: '',
    office_longitude: '',
    office_radius_meters: 100,
    expected_clock_in: '08:00',
    expected_clock_out: '17:00',
  });

  const summaryQ = useQuery({
    queryKey: ['hr', 'att-sum', month, year],
    queryFn: () => hrApi.attendanceSummary(month, year),
    ...HR_QUERY,
  });
  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const liveQ = useQuery({
    queryKey: ['hr', 'att-live'],
    queryFn: hrApi.attendanceLive,
    refetchInterval: tab === 'live' ? 30000 : false,
  });
  const todaySumQ = useQuery({
    queryKey: ['hr', 'att-today-sum'],
    queryFn: hrApi.attendanceTodaySummary,
    refetchInterval: tab === 'live' ? 30000 : false,
  });
  const heatmapQ = useQuery({
    queryKey: ['hr', 'att-heat', month, year],
    queryFn: () => hrApi.attendanceHeatmap(month, year),
    enabled: tab === 'monthly',
  });
  const deptAttQ = useQuery({
    queryKey: ['hr', 'att-dept', month, year],
    queryFn: () => hrApi.analytics('attendance-by-department', { month, year }),
    enabled: tab === 'monthly',
  });
  const settingsQ = useQuery({
    queryKey: ['hr', 'settings'],
    queryFn: hrApi.hrSettings,
    enabled: tab === 'settings',
  });
  const detailQ = useQuery({
    queryKey: ['hr', 'att-detail', detailId || individualId, month, year],
    queryFn: () => hrApi.employeeAttendance(Number(detailId || individualId), month, year),
    enabled: !!(detailId || (tab === 'individual' && individualId)),
  });
  const individualLeaveQ = useQuery({
    queryKey: ['hr', 'emp-leave', individualId],
    queryFn: () => hrApi.employeeLeave(individualId),
    enabled: tab === 'individual' && !!individualId,
    ...HR_QUERY,
  });
  const individualLeaveDates = useMemo(
    () => expandApprovedLeaveDates(individualLeaveQ.data?.history || [], year, month),
    [individualLeaveQ.data, year, month]
  );

  useEffect(() => {
    if (!settingsQ.data) return;
    const s = settingsQ.data;
    setSettingsForm({
      office_name: s.office_name || 'Vobiss Office',
      office_latitude: s.office_latitude != null ? String(s.office_latitude) : '',
      office_longitude: s.office_longitude != null ? String(s.office_longitude) : '',
      office_radius_meters: Number(s.office_radius_meters || 100),
      expected_clock_in: String(s.expected_clock_in || '08:00').slice(0, 5),
      expected_clock_out: String(s.expected_clock_out || '17:00').slice(0, 5),
    });
  }, [settingsQ.data]);

  const logMut = useMutation({
    mutationFn: () => hrApi.logAttendance({ ...form, employee_id: Number(form.employee_id), overtime_hours: Number(form.overtime_hours) }),
    onSuccess: () => {
      toast.success('Attendance logged');
      qc.invalidateQueries({ queryKey: ['hr'] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveSettings = useMutation({
    mutationFn: () =>
      hrApi.saveHrSettings({
        ...settingsForm,
        office_latitude: settingsForm.office_latitude === '' ? null : Number(settingsForm.office_latitude),
        office_longitude: settingsForm.office_longitude === '' ? null : Number(settingsForm.office_longitude),
        expected_clock_in: `${settingsForm.expected_clock_in}:00`,
        expected_clock_out: `${settingsForm.expected_clock_out}:00`,
      }),
    onSuccess: () => {
      toast.success('Attendance settings saved');
      qc.invalidateQueries({ queryKey: ['hr', 'settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = summaryQ.data?.summary || [];
    const header = ['Employee', 'Working Days', 'Present', 'Absent', 'Leave', 'Late', 'Overtime Hours', 'Attendance %'];
    const csv = [header.join(','), ...rows.map((r: any) => [r.full_name, r.working_days, r.present, r.absent, r.leave ?? 0, r.late, r.overtime_hours, r.attendance_pct].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${year}-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const live = todaySumQ.data;
  const officeLat = Number(settingsForm.office_latitude);
  const officeLng = Number(settingsForm.office_longitude);
  const office = Number.isFinite(officeLat) && Number.isFinite(officeLng) ? { lat: officeLat, lng: officeLng, name: settingsForm.office_name } : null;
  const daysInMonth = new Date(year, month, 0).getDate();

  return (
    <div>
      <HrPageHeader
        title="Attendance"
        description="Live GPS presence, monthly heatmap, and office geofence."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
            <Button onClick={() => setOpen(true)}>Log Entry</Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4 space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm shadow-[var(--shadow-md)]">
            <span className="font-semibold">{live?.clocked_in_count ?? 0}/{live?.total_employees ?? 0}</span> employees in today
            <span className="mx-2 text-[var(--text-muted)]">·</span>
            {live?.late_count ?? 0} late
            <span className="mx-2 text-[var(--text-muted)]">·</span>
            {live?.on_leave_count ?? 0} on leave
          </div>
          {liveQ.isLoading && !liveQ.data ? <TableSkeleton /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
                <h2 className="text-sm font-semibold">In Office</h2>
                <div className="mt-3 space-y-2">
                  {(liveQ.data?.in_office || []).length === 0 && <EmptyState title="Nobody is clocked in" />}
                  {(liveQ.data?.in_office || []).map((e: any) => {
                    const start = e.clock_in_time ? new Date(e.clock_in_time).getTime() : null;
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 hover:bg-[var(--surface-hover)]">
                        <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.full_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{e.department || '—'} · Clocked in at {formatTime12(e.clock_in_time)}</p>
                        </div>
                        <div className="text-right">
                          {start && <p className="text-xs text-[var(--text-secondary)]">{formatDuration(Date.now() - start)}</p>}
                          {e.is_late && (
                            <span className="rounded-full bg-[var(--accent-amber-light)] px-2 py-0.5 text-[10px] font-medium text-[var(--warning-text)]">
                              Late by {e.late_minutes || 0}m
                            </span>
                          )}
                          {e.clock_in_distance_meters != null && (
                            <p className="text-[10px] text-[var(--text-muted)]">{e.clock_in_distance_meters}m from office</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
                <h2 className="text-sm font-semibold">Not In</h2>
                <div className="mt-3 space-y-2">
                  {(liveQ.data?.not_in || []).length === 0 && <EmptyState title="Everyone is in" />}
                  {(liveQ.data?.not_in || []).map((e: any) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2">
                      <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.full_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{e.department || '—'}</p>
                      </div>
                      <StatusBadge status={notInBadge(e.status)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="monthly" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
            </select>
            <YearSelect value={year} onChange={setYear} />
          </div>
          {heatmapQ.isLoading && !heatmapQ.data ? <TableSkeleton /> : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
              <div className="min-w-max">
                <div className="mb-2 flex gap-[3px] pl-40">
                  {Array.from({ length: daysInMonth }, (_, i) => (
                    <div key={i} className="w-6 text-center text-[9px] text-[var(--text-muted)]">{i + 1}</div>
                  ))}
                </div>
                {(heatmapQ.data?.employees || []).map((emp: any) => (
                  <div key={emp.id} className="mb-[3px] flex items-center gap-2">
                    <div className="w-40 truncate text-xs font-medium">{emp.full_name}</div>
                    <div className="flex gap-[3px]">
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const dayIso = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                        const rec = emp.days?.[dayIso];
                        const tone = heatmapTone(dayIso, rec, emp.leave_dates || []);
                        return (
                          <div
                            key={dayIso}
                            title={`${emp.full_name} · ${dayIso} · ${tone.label}${rec ? ` · In ${formatTime12(rec.clock_in_time || rec.clock_in)} Out ${formatTime12(rec.clock_out_time || rec.clock_out)}` : ''}`}
                            className={cn('h-6 w-6 rounded', tone.className)}
                            style={{ height: 24, width: 24, borderRadius: 4 }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                {[
                  ['Present on time', 'bg-[var(--accent-green)]'],
                  ['Present late', 'bg-[var(--accent-amber)]'],
                  ['Absent', 'bg-[var(--accent-red)]'],
                  ['On Leave', 'bg-[var(--accent-blue)]'],
                  ['Weekend / holiday', 'bg-[var(--surface-secondary)]'],
                ].map(([label, cls]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    <span className={cn('h-3 w-3 rounded', cls)} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-md)]">
            <h2 className="text-sm font-semibold">Department attendance %</h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptAttQ.data || []} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={rechartsTooltipStyle} />
                  <Bar dataKey="attendance_rate" fill={chartTheme.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="individual" className="mt-4 space-y-4">
          <select className={`${inputClass} max-w-sm`} value={individualId} onChange={(e) => setIndividualId(e.target.value)}>
            <option value="">Select employee…</option>
            {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          {!individualId ? (
            <EmptyState title="Choose an employee" description="Their monthly calendar and stats will appear here." />
          ) : (
            <>
              {(() => {
                const row = (summaryQ.data?.summary || []).find((r: any) => String(r.employee_id) === String(individualId));
                return (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-green)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Present</p>
                      <p className="mt-1 text-xl font-bold">{row?.present ?? 0}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-red)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Absent</p>
                      <p className="mt-1 text-xl font-bold">{row?.absent ?? 0}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-blue)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">On Leave</p>
                      <p className="mt-1 text-xl font-bold">{row?.leave ?? 0}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-amber)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Late</p>
                      <p className="mt-1 text-xl font-bold">{row?.late ?? 0}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-purple)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">OT hours</p>
                      <p className="mt-1 text-xl font-bold">{row?.overtime_hours ?? 0}</p>
                    </div>
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--accent-blue)' }}>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Attendance %</p>
                      <p className="mt-1 text-xl font-bold">{row?.attendance_pct ?? 0}%</p>
                    </div>
                  </div>
                );
              })()}
              <AttendanceMonthGrid year={year} month={month} records={detailQ.data || []} leaveDates={individualLeaveDates} />
            </>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <div className="max-w-3xl space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
            <Field label="Office name">
              <input className={inputClass} value={settingsForm.office_name} onChange={(e) => setSettingsForm({ ...settingsForm, office_name: e.target.value })} />
            </Field>
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Office location — click the map to set the pin</p>
              <OfficeLocationMap
                office={office}
                radiusMeters={settingsForm.office_radius_meters}
                onPick={(lat, lng) => setSettingsForm({ ...settingsForm, office_latitude: String(lat), office_longitude: String(lng) })}
                className="h-72 w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)]"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Latitude">
                  <input className={inputClass} value={settingsForm.office_latitude} onChange={(e) => setSettingsForm({ ...settingsForm, office_latitude: e.target.value })} />
                </Field>
                <Field label="Longitude">
                  <input className={inputClass} value={settingsForm.office_longitude} onChange={(e) => setSettingsForm({ ...settingsForm, office_longitude: e.target.value })} />
                </Field>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                onClick={async () => {
                  try {
                    const pos = await getCurrentPosition();
                    setSettingsForm((prev) => ({ ...prev, office_latitude: String(pos.latitude), office_longitude: String(pos.longitude) }));
                  } catch (e: any) {
                    toast.error(e.message);
                  }
                }}
              >
                Use my current location
              </Button>
            </div>
            <Field label={`Allowed radius (${settingsForm.office_radius_meters}m)`}>
              <div className="flex items-center gap-3">
                <Slider
                  min={10}
                  max={500}
                  step={5}
                  value={[settingsForm.office_radius_meters]}
                  onValueChange={([v]) => setSettingsForm({ ...settingsForm, office_radius_meters: v })}
                  className="flex-1"
                />
                <input
                  className={`${inputClass} w-24`}
                  type="number"
                  min={10}
                  max={500}
                  value={settingsForm.office_radius_meters}
                  onChange={(e) => setSettingsForm({ ...settingsForm, office_radius_meters: Number(e.target.value) })}
                />
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Expected clock in">
                <input className={inputClass} type="time" value={settingsForm.expected_clock_in} onChange={(e) => setSettingsForm({ ...settingsForm, expected_clock_in: e.target.value })} />
              </Field>
              <Field label="Expected clock out">
                <input className={inputClass} type="time" value={settingsForm.expected_clock_out} onChange={(e) => setSettingsForm({ ...settingsForm, expected_clock_out: e.target.value })} />
              </Field>
            </div>
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailId} onOpenChange={() => setDetailId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Daily breakdown</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">OT</th>
                </tr>
              </thead>
              <tbody>
                {(detailQ.data || []).map((a: any) => (
                  <tr key={a.id || String(a.date).slice(0, 10)} className="border-b">
                    <td className="px-3 py-2">{String(a.date).slice(0, 10)}</td>
                    <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2">{formatTime12(a.clock_in_time || a.clock_in)}</td>
                    <td className="px-3 py-2">{formatTime12(a.clock_out_time || a.clock_out)}</td>
                    <td className="px-3 py-2">{a.overtime_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log attendance</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); logMut.mutate(); }}>
            <Field label="Employee">
              <select className={inputClass} required value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">Select…</option>
                {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {['Present', 'Absent', 'Late', 'Half-day', 'Leave'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Clock in"><input className={inputClass} type="time" value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} /></Field>
              <Field label="Clock out"><input className={inputClass} type="time" value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} /></Field>
            </div>
            <Field label="Overtime hours"><input className={inputClass} type="number" step="0.5" value={form.overtime_hours} onChange={(e) => setForm({ ...form, overtime_hours: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Button type="submit" className="w-full" disabled={logMut.isPending}>Save entry</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HrAttendance;
