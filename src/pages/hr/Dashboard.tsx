import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, CalendarDays, Wallet, UserPlus, AlertCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { hrApi, HR_QUERY } from '@/api/hr';
import { Avatar, EmptyState, StatCard, StatusBadge } from './components';
import { PIE_COLORS, rechartsTooltipStyle, useChartTheme } from '@/lib/chartDefaults';
import { formatGhs } from '@/lib/taxCalculations';
import { StatusPill } from '@/components/ui/status-pill';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const HrDashboard = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const firstName = user?.first_name || String(user?.full_name || 'there').split(/\s+/)[0];
  const statsQ = useQuery({ queryKey: ['hr', 'stats'], queryFn: hrApi.dashboardStats, ...HR_QUERY });
  const extrasQ = useQuery({ queryKey: ['hr', 'dashboard-extras'], queryFn: () => hrApi.analytics('dashboard-extras'), ...HR_QUERY });
  useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  useQuery({ queryKey: ['hr', 'leave-requests'], queryFn: () => hrApi.leaveRequests(), ...HR_QUERY });
  useQuery({ queryKey: ['hr', 'leave'], queryFn: () => hrApi.leave(), ...HR_QUERY });
  useQuery({ queryKey: ['hr', 'docs'], queryFn: () => hrApi.documents(), ...HR_QUERY });
  useQuery({ queryKey: ['hr', 'form-requests'], queryFn: () => hrApi.formRequests(), ...HR_QUERY });

  const stats = statsQ.data;
  const chartTheme = useChartTheme();
  const onLeaveToday = stats?.onLeavePeople || [];
  const now = new Date();
  const payrollMut = useMutation({
    mutationFn: () => {
      if (!stats?.payroll) return hrApi.generatePayroll(now.getMonth() + 1, now.getFullYear());
      if (stats.payroll.status === 'Approved') return hrApi.updatePayrollStatus(stats.payroll.id, 'Paid');
      return hrApi.updatePayrollStatus(stats.payroll.id, 'Approved');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr'] });
    },
  });

  return (
    <div>
      <GreetingBanner
        name={firstName}
        pills={
          <>
            <OutlinePill icon={Users}>HR</OutlinePill>
            <OutlinePill icon={CalendarDays}>{new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}</OutlinePill>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/hr/employees')}>
              <Users className="h-4 w-4" />
              Employees
            </Button>
            <Button size="sm" onClick={() => navigate('/hr/payroll')}>
              <Wallet className="h-4 w-4" />
              Generate Payroll
            </Button>
          </>
        }
      />

      {(stats?.pendingLeaveRequests > 0 || stats?.pendingFormRequests > 0) && (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-[var(--primary)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Pending approvals</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {stats.pendingLeaveRequests || 0} leave request{(stats.pendingLeaveRequests || 0) === 1 ? '' : 's'} and {stats.pendingFormRequests || 0} form request{(stats.pendingFormRequests || 0) === 1 ? '' : 's'} need your attention
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate('/hr/leave')}>View leave</Button>
              <Button size="sm" onClick={() => navigate('/hr/forms')}>View forms</Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <div>
            <StatCard label="Total Employees" value={stats?.totalEmployees ?? 0} icon={Users} accentIndex={0} />
            <div className="mt-1 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={extrasQ.data?.sparkline || []}>
                  <Line type="monotone" dataKey="n" stroke="var(--primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <StatCard label="On Leave Today" value={stats?.onLeaveToday ?? 0} icon={CalendarDays} accentIndex={1} />
          <StatCard
            label="Payroll This Month"
            value={
              !stats?.payroll
                ? 'Not generated'
                : stats.payroll.status === 'Draft'
                  ? 'Pending approval'
                  : stats.payroll.status === 'Approved'
                    ? 'Approved'
                    : 'Paid ✓'
            }
            hint={
              extrasQ.data
                ? `${formatGhs(extrasQ.data.payroll_gross)} ${extrasQ.data.payroll_delta_pct >= 0 ? '↑' : '↓'} ${Math.abs(extrasQ.data.payroll_delta_pct)}% vs last month`
                : stats?.payroll?.paid_at
                  ? new Date(stats.payroll.paid_at).toLocaleDateString()
                  : stats?.payrollStatus
            }
            icon={Wallet}
            accentIndex={2}
          />
          <StatCard label="New This Month" value={stats?.newThisMonth ?? 0} icon={UserPlus} accentIndex={3} />
        </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-5">
          <p className="text-sm font-semibold">This month attendance</p>
          <div className="mt-4 flex items-center gap-4">
            <div
              className="flex h-[88px] w-[88px] items-center justify-center rounded-full"
              style={{
                background: `conic-gradient(var(--primary) ${(extrasQ.data?.attendance_rate || 0) * 3.6}deg, var(--border) 0deg)`,
              }}
            >
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[var(--surface)] text-lg font-bold">
                {extrasQ.data?.attendance_rate ?? 0}%
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Share of working days marked present this month.</p>
          </div>
        </div>
        <div className="flex min-h-[200px] items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-4">
          <div className="h-[200px] w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.employmentTypeBreakdown || []}
                  dataKey="count"
                  nameKey="employment_type"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {(stats?.employmentTypeBreakdown || []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={rechartsTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">Payroll status</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {!stats?.payroll
                ? 'Payroll not generated'
                : stats.payroll.status === 'Draft'
                  ? 'Pending approval'
                  : stats.payroll.status === 'Approved'
                    ? 'Approved — ready to mark as paid'
                    : `Paid ✓${stats.payroll.paid_at ? ` · ${new Date(stats.payroll.paid_at).toLocaleDateString()}` : ''}`}
            </p>
          </div>
          <div className="flex gap-2">
            {!stats?.payroll && (
              <Button size="sm" onClick={() => payrollMut.mutate()} disabled={payrollMut.isPending}>Generate Now</Button>
            )}
            {stats?.payroll?.status === 'Draft' && (
              <Button size="sm" variant="outline" onClick={() => navigate('/hr/payroll')}>Review</Button>
            )}
            {stats?.payroll?.status === 'Approved' && (
              <Button size="sm" onClick={() => payrollMut.mutate()} disabled={payrollMut.isPending}>Mark as Paid</Button>
            )}
            {stats?.payroll && (
              <Button size="sm" variant="outline" onClick={() => navigate('/hr/payroll')}>Open payroll</Button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-3 sm:mt-6">
        <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-4 sm:p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Headcount by department</h2>
            <span className="text-[13px] text-[var(--primary)]">This month</span>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.headcountByDepartment || []}>
                <XAxis dataKey="department" tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.muted }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={rechartsTooltipStyle} cursor={{ fill: 'var(--surface-hover)' }} />
                <Bar dataKey="count" fill={chartTheme.accent} fillOpacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Employment type</h2>
          <div className="mt-4 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats?.employmentTypeBreakdown || []}
                  dataKey="count"
                  nameKey="employment_type"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {(stats?.employmentTypeBreakdown || []).map((_: unknown, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={rechartsTooltipStyle} />
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-[var(--text-primary)] text-xl font-bold">
                  {(stats?.employmentTypeBreakdown || []).reduce((s: number, r: any) => s + Number(r.count || 0), 0)}
                </text>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {(stats?.employmentTypeBreakdown || []).map((row: any, i: number) => (
              <div key={row.employment_type} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="capitalize">{row.employment_type}</span>
                <span className="font-semibold text-[var(--text-primary)]">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Recent activity</h2>
          <div className="mt-4 space-y-1">
            {(stats?.activity || []).length === 0 && (
              <EmptyState title="No recent activity" description="HR actions will show up here as they happen." />
            )}
            {(stats?.activity || []).slice(0, 8).map((a: any) => (
              <div key={a.id} className="flex gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition duration-150 hover:bg-[var(--surface-hover)]">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--primary)]" />
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{a.message}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {a.employee_name ? `${a.employee_name} · ` : ''}
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">On leave today</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {onLeaveToday.length === 0 && (
              <EmptyState title="Nobody is on leave" description="The team is fully in today." />
            )}
            {onLeaveToday.map((l: any) => (
              <div key={l.id} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] py-1 pl-1 pr-3">
                <Avatar name={l.full_name} src={l.photo_url} size="sm" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{l.full_name}</span>
                <StatusBadge status={l.leave_type} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Upcoming contract renewals (60 days)</h2>
        <div className="mt-4 overflow-x-auto">
          {(stats?.upcomingRenewals || []).length === 0 ? (
            <EmptyState title="No renewals coming up" description="No contracts expire in the next 60 days." />
          ) : (
            <div className="vobiss-table-wrap">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Ends</th>
                  <th>Days left</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.upcomingRenewals.map((e: any) => {
                  const days = Math.ceil((new Date(e.contract_end_date).getTime() - Date.now()) / 86400000);
                  const tone = days < 15 ? 'danger' : days <= 30 ? 'warning' : 'success';
                  return (
                  <tr
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/hr/employees/${e.id}`)}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                        <span className="font-medium">{e.full_name}</span>
                      </div>
                    </td>
                    <td className="text-[var(--text-secondary)]">{e.department}</td>
                    <td>{String(e.contract_end_date).slice(0, 10)}</td>
                    <td>
                      <StatusPill tone={tone}>{days} days</StatusPill>
                    </td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HrDashboard;
