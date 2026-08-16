import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { hrApi, HR_QUERY } from '@/api/hr';
import { HrPageHeader, TableSkeleton, inputClass, YearSelect } from './components';
import { PIE_COLORS, rechartsTooltipStyle, useChartTheme } from '@/lib/chartDefaults';
import { formatGhs, formatGhsCompact } from '@/lib/taxCalculations';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

function monthName(month: number, year?: number) {
  return new Date(year || 2000, month - 1, 1).toLocaleString('en', { month: 'long', ...(year ? { year: 'numeric' } : {}) });
}

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-2 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--text-secondary)]">{title}</h2>
      {aside && <p className="text-xs text-[var(--text-muted)]">{aside}</p>}
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 shadow-[var(--shadow-md)]', className)}>
      {children}
    </div>
  );
}

function ChartBlock({
  title,
  subtitle,
  callout,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  callout?: React.ReactNode;
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
      {callout && <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{callout}</p>}
      <div className="mt-4" style={{ height }}>{children}</div>
    </Card>
  );
}

function rateColor(pct: number) {
  if (pct >= 95) return 'var(--accent-green)';
  if (pct >= 80) return 'var(--accent-amber)';
  return 'var(--accent-red)';
}

function typeLabel(t: string) {
  const s = String(t || '').replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const HrAnalytics = () => {
  const chartTheme = useChartTheme();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const period = monthName(month, year);

  const peopleQ = useQuery({ queryKey: ['hr', 'an', 'people', month, year], queryFn: () => hrApi.analytics('people-snapshot', { month, year }), ...HR_QUERY });
  const headQ = useQuery({ queryKey: ['hr', 'an', 'head'], queryFn: () => hrApi.analytics('headcount-trend'), ...HR_QUERY });
  const deptQ = useQuery({ queryKey: ['hr', 'an', 'dept'], queryFn: () => hrApi.analytics('by-department'), ...HR_QUERY });
  const attQ = useQuery({ queryKey: ['hr', 'an', 'att-h', month, year], queryFn: () => hrApi.analytics('attendance-health', { month, year }), ...HR_QUERY });
  const leaveQ = useQuery({ queryKey: ['hr', 'an', 'lv-ov', year], queryFn: () => hrApi.analytics('leave-overview', { year }), ...HR_QUERY });
  const payQ = useQuery({ queryKey: ['hr', 'an', 'pay-int', month, year], queryFn: () => hrApi.analytics('payroll-intelligence', { month, year }), ...HR_QUERY });

  const people = peopleQ.data;
  const att = attQ.data;
  const leave = leaveQ.data;
  const pay = payQ.data;
  const headMonths = headQ.data?.months || [];
  const lastCount = headMonths[headMonths.length - 1]?.count || people?.headcount || 0;
  const sixAgo = headMonths[Math.max(0, headMonths.length - 6)]?.count || lastCount;
  const growth6 = sixAgo > 0 ? Math.round(((lastCount - sixAgo) / sixAgo) * 1000) / 10 : 0;
  const deptRows = (deptQ.data || []).map((r: any) => ({
    ...r,
    pct: lastCount > 0 ? Math.round((Number(r.count) / lastCount) * 1000) / 10 : 0,
  }));
  const leaveTotal = Number(leave?.total_days || 0);
  const leaveTypeData = (leave?.by_type || []).map((r: any) => ({
    ...r,
    pct: leaveTotal > 0 ? Math.round((Number(r.days) / leaveTotal) * 1000) / 10 : 0,
  }));
  const bestDept = att?.best_department;
  const worstDept = att?.worst_department;
  const currentGross = pay?.months?.find((m: any) => m.current)?.gross || 0;

  const selectors = (
    <div className="flex gap-2">
      <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthName(i + 1)}</option>)}
      </select>
      <YearSelect value={year} onChange={setYear} />
    </div>
  );

  if (peopleQ.isLoading && !people) return <TableSkeleton />;

  return (
    <div>
      <HrPageHeader title="HR Analytics" description="Executive view of people, attendance, leave, and payroll." actions={selectors} />

      <SectionHeader title="People Snapshot" aside={`as of ${period}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Total Headcount</p>
          <p className="mt-2 text-[32px] font-bold leading-none tracking-tight">{people?.headcount ?? 0}</p>
          <p className={cn('mt-2 text-sm font-medium', (people?.net_change || 0) >= 0 ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]')}>
            {(people?.net_change || 0) >= 0 ? '+' : ''}{people?.net_change ?? 0} this month
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {(people?.types || []).map((t: any) => `${t.count} ${typeLabel(t.employment_type)}`).join(' · ') || 'No breakdown yet'}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Departments</p>
          <p className="mt-2 text-[32px] font-bold leading-none tracking-tight">{people?.department_count ?? 0}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {(people?.departments || []).map((d: any) => (
              <span key={d.department} className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{d.department}</span>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Average Tenure</p>
          <p className="mt-2 text-[32px] font-bold leading-none tracking-tight">{people?.average_tenure || '—'}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {people?.longest_tenure ? `Longest: ${people.longest_tenure.name} — ${people.longest_tenure.tenure}` : 'Start dates needed for tenure'}
          </p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">This Month</p>
          <p className="mt-2 text-[32px] font-bold leading-none tracking-tight">{people?.joined ?? 0} joined · {people?.departed ?? 0} left</p>
          <span className={cn('mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', (people?.net_change || 0) >= 0 ? 'bg-[var(--accent-green-light)] text-[var(--success-text)]' : 'bg-[var(--accent-red-light)] text-[var(--danger-text)]')}>
            {(people?.net_change || 0) >= 0 ? '+' : ''}{people?.net_change ?? 0}
          </span>
        </Card>
      </div>

      <SectionHeader title="Headcount & Growth" />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ChartBlock
            title="Headcount Over Time"
            subtitle={growth6 > 0 ? 'Growing team ↑' : growth6 < 0 ? 'Headcount declined' : 'Stable headcount'}
            callout={`${lastCount} total employees${growth6 ? ` · ${growth6 > 0 ? '+' : ''}${growth6}% vs 6 months ago` : ''}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={headMonths}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={rechartsTooltipStyle} formatter={(v: number, _n, p: any) => [`${v} employees`, `${p.payload.label} ${p.payload.year}`]} />
                <Area type="monotone" dataKey="count" stroke={chartTheme.accent} fill="var(--accent-green-light)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartBlock>
        </div>
        <div className="lg:col-span-2">
          <ChartBlock title="By Department" subtitle="Active employees sorted largest to smallest" callout={`${deptRows.length} departments`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptRows} layout="vertical" margin={{ right: 48 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="department" width={90} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={rechartsTooltipStyle} formatter={(v: number, _n, p: any) => [`${v} (${p.payload.pct}%)`, p.payload.department]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'var(--text-secondary)', formatter: (_: number, _i: number, p: any) => `${p?.value ?? ''} (${p?.payload?.pct ?? 0}%)` }}>
                  {deptRows.map((_: unknown, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>
        </div>
      </div>

      <SectionHeader title="Attendance Health" aside={period} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Company attendance</p>
          <p className="mt-2 text-5xl font-bold leading-none tracking-tight" style={{ color: rateColor(Number(att?.attendance_rate || 0)) }}>{att?.attendance_rate ?? 0}%</p>
          <p className="mt-3 text-xs text-[var(--text-muted)]">Target: 95%</p>
          <Progress className="mt-2 h-2" value={Math.min(Number(att?.attendance_rate || 0), 100)} />
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Late arrivals</p>
          <p className="mt-2 text-5xl font-bold leading-none tracking-tight">{att?.late_count ?? 0}</p>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">employees arrived late this month</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Most late arrivals: {att?.most_late_day || '—'}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Absent days</p>
          <p className="mt-2 text-5xl font-bold leading-none tracking-tight">{att?.absent_days ?? 0}</p>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">{att?.perfect_attendance?.length ?? 0} employees with perfect attendance this month</p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartBlock
          title="Daily Attendance Rate"
          subtitle="Working days this month vs 95% target"
          callout={`${att?.days_below_target ?? 0} days below target this month`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={att?.daily || []}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartTheme.muted }} axisLine={false} tickLine={false} interval={2} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <ReferenceLine y={95} stroke="var(--accent-red)" strokeDasharray="4 4" />
              <Tooltip contentStyle={rechartsTooltipStyle} formatter={(v: number, _n, p: any) => [`${v}% (${p.payload.absent} absent)`, p.payload.label]} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke={chartTheme.accent}
                strokeWidth={2}
                dot={(props: any) => {
                  const { cx, cy, payload, index } = props;
                  if (!payload?.below_target) return <g key={index} />;
                  return <circle key={index} cx={cx} cy={cy} r={4} fill="var(--accent-red)" />;
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartBlock>
        <ChartBlock
          title="Attendance by Department"
          subtitle="Best to worst this month"
          callout={bestDept && worstDept ? `Best: ${bestDept.department} at ${bestDept.attendance_rate}% · Needs attention: ${worstDept.department} at ${worstDept.attendance_rate}%` : 'No department data yet'}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={att?.departments || []} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="department" width={90} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={rechartsTooltipStyle} formatter={(v: number) => [`${v}%`, 'Attendance']} />
              <Bar dataKey="attendance_rate" radius={[0, 4, 4, 0]}>
                {(att?.departments || []).map((r: any, i: number) => <Cell key={i} fill={rateColor(Number(r.attendance_rate))} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>
      <div className="mt-4">
        <ChartBlock title="When do people arrive late?" subtitle="Late arrivals by weekday" callout={att?.most_late_day ? `Most late arrivals happen on ${att.most_late_day}` : 'No late arrivals this month'} height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={att?.late_week || []}>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={rechartsTooltipStyle} />
              <Bar dataKey="count" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>

      <SectionHeader title="Leave Overview" aside={String(year)} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Leave days this year</p>
          <p className="mt-2 text-[32px] font-bold leading-none">{leave?.total_days ?? 0}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Most used type</p>
          <p className="mt-2 text-[32px] font-bold leading-none">{leave?.most_used?.leave_type || '—'}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{leave?.most_used ? `${leave.most_used.days} days` : 'No leave recorded'}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Currently on leave</p>
          <p className="mt-2 text-[32px] font-bold leading-none">{leave?.currently_on_leave?.length ?? 0}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {(leave?.currently_on_leave || []).map((p: any) => p.full_name).join(', ') || 'Nobody is on leave today'}
          </p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartBlock title="Leave by Type" subtitle="Share of approved days this year" callout={`${leaveTotal} days taken`}>
          <div className="flex h-full items-center gap-4">
            <div className="h-full min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={leaveTypeData} dataKey="days" nameKey="leave_type" innerRadius={52} outerRadius={80} paddingAngle={3}>
                    {leaveTypeData.map((_: unknown, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={rechartsTooltipStyle} />
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-[var(--text-primary)] text-xl font-bold">{leaveTotal}</text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-40 shrink-0 space-y-2 text-xs">
              {leaveTypeData.map((r: any, i: number) => (
                <p key={r.leave_type} className="flex items-start gap-2 text-[var(--text-secondary)]">
                  <span className="mt-1 h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {r.leave_type} — {r.days} days ({r.pct}%)
                </p>
              ))}
            </div>
          </div>
        </ChartBlock>
        <ChartBlock title="Monthly Leave Trend" subtitle={String(year)} callout={leave?.peak_month ? `Peak leave month: ${leave.peak_month}` : 'No peak month yet'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leave?.months || []}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={rechartsTooltipStyle} />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {(leave?.months || []).map((m: any) => (
                  <Cell key={m.month} fill={m.month === month ? chartTheme.accent : 'var(--surface-secondary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>

      <SectionHeader title="Payroll Intelligence" aside={String(year)} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Payroll spend this year</p>
          <p className="mt-2 text-[32px] font-bold leading-none">{formatGhs(pay?.year_spend || 0)}</p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Average salary</p>
          <p className="mt-2 text-[32px] font-bold leading-none">{formatGhs(pay?.average_salary || 0)} <span className="text-sm font-medium text-[var(--text-muted)]">/ month</span></p>
        </Card>
        <Card>
          <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Highest payroll month</p>
          <p className="mt-2 text-[32px] font-bold leading-none">
            {pay?.highest_month?.gross ? `${pay.highest_month.label} — ${formatGhs(pay.highest_month.gross)}` : '—'}
          </p>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartBlock
          title="Monthly Payroll Cost"
          subtitle="Gross payroll by month"
          callout={
            pay?.vs_last_month_pct
              ? `${pay.vs_last_month_pct > 0 ? '↑' : '↓'} ${Math.abs(pay.vs_last_month_pct)}% vs last month`
              : formatGhs(currentGross)
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pay?.months || []}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} tickFormatter={(v) => formatGhsCompact(v)} />
              <Tooltip
                contentStyle={rechartsTooltipStyle}
                formatter={(v: number, name: string, p: any) => [formatGhs(v), name === 'gross' ? `${p.payload.label} ${year} gross` : 'Net']}
              />
              <Bar dataKey="gross" radius={[4, 4, 0, 0]}>
                {(pay?.months || []).map((m: any) => (
                  <Cell key={m.month} fill={m.current ? chartTheme.accent : 'var(--surface-secondary)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
        <ChartBlock
          title="Payroll by Department"
          subtitle={period}
          callout={pay?.departments?.[0] ? `Highest cost dept: ${pay.departments[0].department}` : 'Generate payroll to see this'}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pay?.departments || []} layout="vertical" margin={{ right: 80 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="department" width={90} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={rechartsTooltipStyle} formatter={(v: number) => formatGhs(v)} />
              <Bar dataKey="gross" fill={chartTheme.accent} radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: 'var(--text-secondary)', formatter: (v: number) => formatGhsCompact(v) }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>
    </div>
  );
};

export default HrAnalytics;
