import React from 'react';
import { StatusBadge, Avatar } from './components';
import { formatGhs } from '@/lib/taxCalculations';
import { formatTime12 } from '@/lib/hrChartHelpers';
import { cn } from '@/lib/utils';

export function ReportShell({
  title,
  period,
  children,
}: {
  title: string;
  period: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-[var(--shadow-md)]">
      <p className="text-base font-bold tracking-tight">VOBISS SOLUTIONS LIMITED</p>
      <p className="text-[13px] text-[var(--text-muted)]">Human Resources Department</p>
      <h2 className="mt-3 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Generated: {new Date().toLocaleDateString('en-GB')} · Period: {period}</p>
      <div className="mt-3 h-px bg-[var(--border)]" />
      <div className="mt-5 space-y-8">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn('px-3 py-2 text-left text-xs font-semibold uppercase text-[var(--text-secondary)]', className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn('px-3 py-2', className)}>{children}</td>;
}

export function MonthlySummaryPreview({ data }: { data: any }) {
  if (!data) return null;
  const att = data.attendance || {};
  const flags = data.flags || {};
  return (
    <ReportShell title="Monthly HR Summary" period={data.period}>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Executive Summary</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Total Employees" value={data.headcount} />
          <Metric label="New Hires" value={data.new_hires} />
          <Metric label="Departures" value={data.departures} />
          <Metric label="Net Change" value={`${data.net_change >= 0 ? '+' : ''}${data.net_change}`} />
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Workforce Breakdown</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <table className="vobiss-table w-full text-sm">
            <thead><tr className="border-b"><Th>Department</Th><Th>Headcount</Th><Th>% of Total</Th></tr></thead>
            <tbody>
              {(data.departments || []).map((r: any) => (
                <tr key={r.department} className="border-b"><Td>{r.department}</Td><Td>{r.headcount}</Td><Td>{r.pct}%</Td></tr>
              ))}
            </tbody>
          </table>
          <table className="vobiss-table w-full text-sm">
            <thead><tr className="border-b"><Th>Employment Type</Th><Th>Count</Th><Th>% of Total</Th></tr></thead>
            <tbody>
              {(data.employment_types || []).map((r: any) => (
                <tr key={r.employment_type} className="border-b"><Td className="capitalize">{String(r.employment_type).replace(/-/g, ' ')}</Td><Td>{r.count}</Td><Td>{r.pct}%</Td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Attendance Summary</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Month</Th><Th>Working Days</Th><Th>Avg Present</Th><Th>Avg Absent</Th><Th>Attendance Rate</Th></tr></thead>
          <tbody>
            <tr className="border-b">
              <Td>{data.period}</Td><Td>{att.working_days}</Td><Td>{att.avg_present}</Td><Td>{att.avg_absent}</Td><Td>{att.attendance_rate}%</Td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-sm">{att.perfect?.length || 0} employees had perfect attendance</p>
        {att.perfect?.length > 0 && <p className="text-xs text-[var(--text-muted)]">{att.perfect.join(', ')}</p>}
        <p className="mt-2 text-sm">{att.below80?.length || 0} employees had attendance below 80%</p>
        {att.below80?.length > 0 && <p className="text-xs text-[var(--text-muted)]">{att.below80.join(', ')}</p>}
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Leave Summary</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Leave Type</Th><Th>Requests</Th><Th>Total Days</Th><Th>Avg Days</Th></tr></thead>
          <tbody>
            {(data.leave?.by_type || []).map((r: any) => (
              <tr key={r.leave_type} className="border-b"><Td>{r.leave_type}</Td><Td>{r.requests}</Td><Td>{r.days}</Td><Td>{r.avg}</Td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm">Employees currently on approved leave: {(data.leave?.currently_on_leave || []).join(', ') || 'None'}</p>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Payroll Summary</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Category</Th><Th>Amount (GHS)</Th></tr></thead>
          <tbody>
            {[
              ['Total Gross Pay', data.payroll?.gross],
              ['Total SSNIT (Employer)', data.payroll?.ssnit_employer],
              ['Total SSNIT (Employee)', data.payroll?.ssnit_employee],
              ['Total PAYE', data.payroll?.paye],
            ].map(([label, amt]) => (
              <tr key={String(label)} className="border-b"><Td>{label}</Td><Td>{formatGhs(amt as number)}</Td></tr>
            ))}
            <tr className="border-b font-bold"><Td>Total Net Pay</Td><Td>{formatGhs(data.payroll?.net)}</Td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Highlights & Flags</h3>
        <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
          <li>● Attendance rate of {att.attendance_rate}% is {Number(att.attendance_rate) >= 95 ? 'above' : 'below'} the 95% target</li>
          <li>● {flags.pending_leave || 0} employees have pending leave requests</li>
          <li>● Payroll for {data.period} is {flags.payroll_generated ? String(flags.payroll_status || 'generated').toLowerCase() : 'not yet generated'}</li>
          <li>● {flags.expiring_contracts?.length || 0} employee contracts expire within 60 days{flags.expiring_contracts?.length ? `: ${flags.expiring_contracts.join(', ')}` : ''}</li>
        </ul>
      </section>
    </ReportShell>
  );
}

export function AttendanceReportPreview({ data }: { data: any }) {
  if (!data) return null;
  const s = data.summary || {};
  return (
    <ReportShell title="Attendance Report" period={data.period}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Working Days" value={s.working_days} />
        <Metric label="Total Present" value={s.present} />
        <Metric label="Total Absent" value={s.absent} />
        <Metric label="Total Late" value={s.late} />
        <Metric label="Avg Attendance" value={`${s.attendance_rate}%`} />
      </div>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Attendance by Employee</h3>
        <div className="overflow-x-auto">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b"><Th>Employee</Th><Th>Dept</Th><Th>Present</Th><Th>Absent</Th><Th>Late</Th><Th>Leave</Th><Th>%</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {(data.employees || []).map((r: any) => (
                <tr key={r.employee_id} className="border-b">
                  <Td>{r.full_name}</Td><Td>{r.department}</Td><Td>{r.present}</Td><Td>{r.absent}</Td><Td>{r.late}</Td><Td>{r.leave}</Td><Td>{r.attendance_pct}%</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                </tr>
              ))}
              <tr className="border-b font-semibold">
                <Td>Totals</Td><Td /><Td>{s.present}</Td><Td>{s.absent}</Td><Td>{s.late}</Td><Td>{s.leave}</Td><Td>{s.attendance_rate}%</Td><Td />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {data.single_employee && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Daily Breakdown</h3>
          <table className="vobiss-table w-full text-sm">
            <thead><tr className="border-b"><Th>Date</Th><Th>Day</Th><Th>Status</Th><Th>Clock In</Th><Th>Clock Out</Th><Th>Hours</Th><Th>Late By</Th><Th>Notes</Th></tr></thead>
            <tbody>
              {(data.daily || []).map((r: any) => {
                const s = String(r.status || '').toLowerCase();
                const bg = s === 'present' ? 'bg-[var(--accent-green-light)]' : s === 'absent' ? 'bg-[var(--accent-red-light)]' : s === 'late' ? 'bg-[var(--accent-amber-light)]' : s.includes('leave') ? 'bg-[var(--accent-blue-light)]' : '';
                return (
                  <tr key={r.date} className={cn('border-b', bg)}>
                    <Td>{r.date}</Td><Td>{r.day}</Td><Td><StatusBadge status={r.status} /></Td>
                    <Td>{formatTime12(r.clock_in)}</Td><Td>{formatTime12(r.clock_out)}</Td>
                    <Td>{r.hours != null ? `${r.hours}h` : '—'}</Td><Td>{r.late_minutes ? `${r.late_minutes}m` : '—'}</Td><Td>{r.notes || '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {!data.single_employee && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">Department Summary</h3>
          <table className="vobiss-table w-full text-sm">
            <thead><tr className="border-b"><Th>Department</Th><Th>Employees</Th><Th>Avg Attendance %</Th><Th>Late</Th><Th>Absent</Th></tr></thead>
            <tbody>
              {(data.departments || []).map((r: any) => (
                <tr key={r.department} className="border-b"><Td>{r.department}</Td><Td>{r.employees}</Td><Td>{r.attendance_pct}%</Td><Td>{r.late}</Td><Td>{r.absent}</Td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </ReportShell>
  );
}

export function PayrollReportPreview({ data }: { data: any }) {
  if (!data) return null;
  const h = data.header;
  const t = data.totals || {};
  return (
    <ReportShell title="Payroll Report" period={data.period}>
      <section>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={h?.status || 'Not generated'} />
          <p className="text-sm text-[var(--text-secondary)]">Period: {data.period}</p>
        </div>
        {h && (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Generated by: {h.generated_by || 'HR'} · Generated on: {h.generated_at ? new Date(h.generated_at).toLocaleString() : '—'}
            {h.approved_by ? ` · Approved by: ${h.approved_by}` : ''}
          </p>
        )}
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Employee Payroll</h3>
        <div className="overflow-x-auto">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>#</Th><Th>Employee</Th><Th>Department</Th><Th>Basic</Th><Th>Allowances</Th><Th>Gross</Th>
                <Th>SSNIT Emp</Th><Th>SSNIT Er</Th><Th>Taxable</Th><Th>PAYE</Th><Th>Net Pay</Th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((r: any, i: number) => (
                <tr key={r.id || i} className="border-b">
                  <Td>{i + 1}</Td><Td>{r.full_name}</Td><Td>{r.department}</Td>
                  <Td>{formatGhs(r.basic_salary)}</Td><Td>{formatGhs(r.allowances)}</Td><Td>{formatGhs(r.gross)}</Td>
                  <Td className="text-[var(--info-text)]">{formatGhs(r.ssnit_employee)}</Td>
                  <Td className="text-[var(--info-text)]">{formatGhs(r.ssnit_employer)}</Td>
                  <Td>{formatGhs(r.taxable_income)}</Td>
                  <Td className="text-[var(--warning-text)]">{formatGhs(r.paye)}</Td>
                  <Td className="font-semibold text-[var(--success-text)]">{formatGhs(r.net_pay)}</Td>
                </tr>
              ))}
              <tr className="border-b font-bold">
                <Td colSpan={3}>TOTALS</Td>
                <Td>{formatGhs(t.basic)}</Td><Td>{formatGhs(t.allowances)}</Td><Td>{formatGhs(t.gross)}</Td>
                <Td className="text-[var(--info-text)]">{formatGhs(t.ssnit_employee)}</Td>
                <Td className="text-[var(--info-text)]">{formatGhs(t.ssnit_employer)}</Td>
                <Td>{formatGhs(t.taxable_income)}</Td>
                <Td className="text-[var(--warning-text)]">{formatGhs(t.paye)}</Td>
                <Td className="text-[var(--success-text)]">{formatGhs(t.net)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold">SSNIT Summary</h3>
          <p className="text-sm">Total Employee SSNIT: {formatGhs(t.ssnit_employee)} (remit to SSNIT)</p>
          <p className="text-sm">Total Employer SSNIT: {formatGhs(t.ssnit_employer)} (remit to SSNIT)</p>
          <p className="mt-2 text-sm font-bold">Total SSNIT Remittance: {formatGhs(Number(t.ssnit_employee || 0) + Number(t.ssnit_employer || 0))}</p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Tax Summary</h3>
          <p className="text-sm">Total Taxable Income: {formatGhs(t.taxable_income)}</p>
          <p className="text-sm">Total PAYE Collected: {formatGhs(t.paye)} (remit to GRA)</p>
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Bank Payment Summary</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Employee</Th><Th>Bank</Th><Th>Account No</Th><Th>Net Pay</Th></tr></thead>
          <tbody>
            {(data.items || []).map((r: any, i: number) => (
              <tr key={r.id || i} className="border-b"><Td>{r.full_name}</Td><Td>{r.bank_name || '—'}</Td><Td>{r.bank_account || '—'}</Td><Td>{formatGhs(r.net_pay)}</Td></tr>
            ))}
            <tr className="font-bold"><Td colSpan={3}>Total</Td><Td>{formatGhs(t.net)}</Td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[var(--text-muted)]">This summary is for payment processing purposes</p>
      </section>
    </ReportShell>
  );
}

export function LeaveReportPreview({ data }: { data: any }) {
  if (!data) return null;
  const maxDays = Math.max(1, ...((data.calendar || []).map((r: any) => Number(r.days || 0))));
  return (
    <ReportShell title="Leave Report" period={String(data.year)}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Total Requests" value={data.summary?.total_requests} />
        <Metric label="Total Days Taken" value={data.summary?.total_days} />
        <Metric label="Most Used Type" value={data.summary?.most_used_type || '—'} />
        <Metric label="Pending Requests" value={data.summary?.pending_requests} />
      </div>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Leave by Employee</h3>
        <div className="overflow-x-auto">
          <table className="vobiss-table w-full text-sm">
            <thead>
              <tr className="border-b"><Th>Employee</Th><Th>Dept</Th><Th>Annual Used</Th><Th>Sick Used</Th><Th>Emergency</Th><Th>Other</Th><Th>Total</Th><Th>Annual Left</Th><Th>Sick Left</Th></tr>
            </thead>
            <tbody>
              {(data.employees || []).map((r: any) => (
                <tr key={r.employee_id} className="border-b">
                  <Td>{r.full_name}</Td><Td>{r.department}</Td>
                  <Td>{r.annual_used}</Td><Td>{r.sick_used}</Td><Td>{r.emergency_used}</Td><Td>{r.other_used}</Td><Td>{r.total_days}</Td>
                  <Td className={r.annual_remaining === 0 ? 'text-[var(--danger-text)]' : ''}>{r.annual_remaining}</Td>
                  <Td className={r.sick_remaining === 0 ? 'text-[var(--danger-text)]' : ''}>{r.sick_remaining}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Leave Calendar Summary</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Month</Th><Th>Requests</Th><Th>Days</Th><Th>Employees on Leave</Th></tr></thead>
          <tbody>
            {(data.calendar || []).map((r: any) => (
              <tr key={r.month} className="border-b">
                <Td>{r.label}</Td><Td>{r.requests}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <span>{r.days}</span>
                    <span className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${Math.round((r.days / maxDays) * 80)}px` }} />
                  </div>
                </Td>
                <Td>{r.employees}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold">Pending Requests</h3>
        <table className="vobiss-table w-full text-sm">
          <thead><tr className="border-b"><Th>Employee</Th><Th>Type</Th><Th>From</Th><Th>To</Th><Th>Days</Th><Th>Submitted</Th><Th>Pending Since</Th></tr></thead>
          <tbody>
            {(data.pending || []).map((r: any) => (
              <tr key={r.id} className="border-b">
                <Td>{r.full_name}</Td><Td>{r.leave_type}</Td>
                <Td>{String(r.start_date).slice(0, 10)}</Td><Td>{String(r.end_date).slice(0, 10)}</Td>
                <Td>{r.days}</Td><Td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</Td>
                <Td className={r.pending_days > 3 ? 'font-semibold text-[var(--danger-text)]' : ''}>{r.pending_days} days</Td>
              </tr>
            ))}
            {(data.pending || []).length === 0 && <tr><Td colSpan={7}>No pending requests</Td></tr>}
          </tbody>
        </table>
      </section>
    </ReportShell>
  );
}

export function DirectoryReportPreview({ data }: { data: any }) {
  if (!data) return null;
  const grouped = new Map<string, any[]>();
  for (const r of data.employees || []) {
    const d = r.department || 'Unassigned';
    if (!grouped.has(d)) grouped.set(d, []);
    grouped.get(d)!.push(r);
  }
  return (
    <ReportShell title="Employee Directory" period="Current">
      <p className="text-sm">
        Total: {data.summary?.total} employees · {data.summary?.departments} departments · {data.summary?.full_time} full-time · {data.summary?.contract} contract · {data.summary?.part_time} part-time
      </p>
      <div className="overflow-x-auto">
        <table className="vobiss-table w-full text-sm">
          <thead>
            <tr className="border-b">
              <Th>Photo</Th><Th>Name</Th><Th>Employee ID</Th><Th>Department</Th><Th>Position</Th>
              <Th>Type</Th><Th>Start Date</Th><Th>Tenure</Th><Th>Phone</Th><Th>Email</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {[...grouped.entries()].map(([dept, rows]) => (
              <React.Fragment key={dept}>
                <tr className="bg-[var(--surface-secondary)]">
                  <Td colSpan={11} className="font-semibold">── {dept} Department ({rows.length} employees) ──</Td>
                </tr>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b">
                    <Td><Avatar name={r.full_name} src={r.photo_url} size="sm" /></Td>
                    <Td>{r.full_name}</Td><Td>{r.employee_code}</Td><Td>{r.department || '—'}</Td><Td>{r.position || '—'}</Td>
                    <Td className="capitalize">{String(r.employment_type || '').replace(/-/g, ' ')}</Td>
                    <Td>{r.start_date || '—'}</Td><Td>{r.tenure}</Td><Td>{r.phone || '—'}</Td><Td>{r.email || '—'}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
