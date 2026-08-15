import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BarChart3, CalendarDays, FolderOpen, Users, Wallet } from 'lucide-react';
import { hrApi, HR_QUERY } from '@/api/hr';
import { Button } from '@/components/ui/button';
import { HrPageHeader, TableSkeleton, inputClass, YearSelect } from './components';
import { downloadCsv, downloadHrPdf } from '@/lib/hrPdf';
import { formatGhs } from '@/lib/taxCalculations';
import { cn } from '@/lib/utils';
import {
  AttendanceReportPreview,
  DirectoryReportPreview,
  LeaveReportPreview,
  MonthlySummaryPreview,
  PayrollReportPreview,
} from './ReportPreview';

const now = new Date();

const REPORTS = [
  { id: 'monthly', name: 'Monthly HR Summary', description: 'Headcount, attendance, leave, and payroll in one view', icon: BarChart3 },
  { id: 'attendance', name: 'Attendance Report', description: 'Present, absent, late, and leave by employee', icon: CalendarDays },
  { id: 'payroll', name: 'Payroll Report', description: 'Gross, SSNIT, PAYE, and net pay for the month', icon: Wallet },
  { id: 'leave', name: 'Leave Report', description: 'Used days, remaining balances, and pending requests', icon: FolderOpen },
  { id: 'directory', name: 'Employee Directory', description: 'Staff list grouped by department', icon: Users },
] as const;

const HrReports = () => {
  const [type, setType] = useState<(typeof REPORTS)[number]['id']>('monthly');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [department, setDepartment] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [status, setStatus] = useState('active');
  const [tick, setTick] = useState(0);

  const employeesQ = useQuery({ queryKey: ['hr', 'employees'], queryFn: () => hrApi.employees(), ...HR_QUERY });
  const depts = [...new Set((employeesQ.data || []).map((e: any) => e.department).filter(Boolean))];

  const params = useMemo(() => {
    if (type === 'monthly' || type === 'payroll') return { month, year };
    if (type === 'attendance') return { month, year, department, employee_id: employeeId };
    if (type === 'leave') return { year, leave_type: leaveType, department };
    return { department, employment_type: employmentType, status };
  }, [type, month, year, department, employeeId, leaveType, employmentType, status]);

  const path = type === 'monthly' ? 'monthly-summary' : type === 'attendance' ? 'attendance' : type === 'payroll' ? 'payroll' : type === 'leave' ? 'leave' : 'employee-directory';
  const reportQ = useQuery({
    queryKey: ['hr', 'report', path, params, tick],
    queryFn: () => hrApi.report(path, params),
    ...HR_QUERY,
  });

  const period = type === 'leave' || type === 'directory'
    ? type === 'directory' ? 'Current' : String(year)
    : new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });

  const monthYear = (
    <>
      <select className={`${inputClass} w-36`} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}
      </select>
      <YearSelect value={year} onChange={setYear} />
    </>
  );

  const exportPdf = async () => {
    try {
      const data = reportQ.data;
      if (!data) return;
      if (type === 'monthly') {
        await downloadHrPdf({
          title: 'Monthly HR Summary Report',
          subtitle: period,
          columns: [{ key: 'metric', label: 'Metric', width: 2 }, { key: 'value', label: 'Value', width: 2 }],
          rows: [
            { metric: 'Headcount', value: data.headcount },
            { metric: 'New hires', value: data.new_hires },
            { metric: 'Departures', value: data.departures },
            { metric: 'Attendance rate', value: `${data.attendance_rate}%` },
            { metric: 'Payroll net', value: formatGhs(data.payroll_net_total) },
          ],
        });
      } else if (type === 'attendance') {
        await downloadHrPdf({
          title: 'Attendance Report',
          subtitle: period,
          columns: [
            { key: 'full_name', label: 'Employee', width: 3 },
            { key: 'department', label: 'Dept', width: 2 },
            { key: 'present', label: 'Present', width: 1 },
            { key: 'absent', label: 'Absent', width: 1 },
            { key: 'late', label: 'Late', width: 1 },
            { key: 'attendance_pct', label: '%', width: 1 },
            { key: 'status', label: 'Status', width: 2 },
          ],
          rows: data.employees || [],
        });
      } else if (type === 'payroll') {
        await downloadHrPdf({
          title: 'Payroll Report',
          subtitle: period,
          columns: [
            { key: 'full_name', label: 'Employee', width: 3 },
            { key: 'gross', label: 'Gross', width: 2 },
            { key: 'ssnit', label: 'SSNIT', width: 2 },
            { key: 'paye', label: 'PAYE', width: 2 },
            { key: 'net', label: 'Net', width: 2 },
          ],
          rows: (data.items || []).map((r: any) => ({
            full_name: r.full_name,
            gross: formatGhs(r.gross),
            ssnit: formatGhs(r.ssnit_employee),
            paye: formatGhs(r.paye),
            net: formatGhs(r.net_pay),
          })),
        });
      } else if (type === 'leave') {
        await downloadHrPdf({
          title: 'Leave Report',
          subtitle: period,
          columns: [
            { key: 'full_name', label: 'Employee', width: 3 },
            { key: 'department', label: 'Dept', width: 2 },
            { key: 'annual_used', label: 'Annual', width: 1 },
            { key: 'sick_used', label: 'Sick', width: 1 },
            { key: 'total_days', label: 'Total', width: 1 },
            { key: 'annual_remaining', label: 'Annual left', width: 2 },
          ],
          rows: data.employees || [],
        });
      } else {
        await downloadHrPdf({
          title: 'Employee Directory Report',
          columns: [
            { key: 'full_name', label: 'Name', width: 3 },
            { key: 'department', label: 'Department', width: 2 },
            { key: 'position', label: 'Position', width: 2 },
            { key: 'email', label: 'Email', width: 3 },
            { key: 'start_date', label: 'Start', width: 2 },
          ],
          rows: data.employees || [],
        });
      }
    } catch (e: any) {
      toast.error(e.message || 'Could not download PDF');
    }
  };

  const exportCsv = () => {
    const data = reportQ.data;
    if (!data) return;
    if (type === 'attendance') {
      downloadCsv(`attendance-${year}-${month}.csv`, ['Employee', 'Dept', 'Present', 'Absent', 'Late', 'Leave', '%', 'Status'], (data.employees || []).map((r: any) => [r.full_name, r.department, r.present, r.absent, r.late, r.leave, r.attendance_pct, r.status]));
    } else if (type === 'leave') {
      downloadCsv(`leave-${year}.csv`, ['Employee', 'Dept', 'Annual used', 'Sick used', 'Total', 'Annual left', 'Sick left'], (data.employees || []).map((r: any) => [r.full_name, r.department, r.annual_used, r.sick_used, r.total_days, r.annual_remaining, r.sick_remaining]));
    } else if (type === 'directory') {
      downloadCsv('employee-directory.csv', ['Name', 'ID', 'Dept', 'Position', 'Type', 'Start', 'Tenure', 'Phone', 'Email'], (data.employees || []).map((r: any) => [r.full_name, r.employee_code, r.department, r.position, r.employment_type, r.start_date, r.tenure, r.phone, r.email]));
    } else if (type === 'payroll') {
      downloadCsv(`payroll-${year}-${month}.csv`, ['Employee', 'Gross', 'SSNIT Emp', 'PAYE', 'Net'], (data.items || []).map((r: any) => [r.full_name, r.gross, r.ssnit_employee, r.paye, r.net_pay]));
    }
  };

  return (
    <div>
      <HrPageHeader title="HR Reports" description="Live preview of each report. Download PDF or CSV when you need a copy." />
      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="w-full shrink-0 lg:w-60">
          <div className="space-y-1">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              const active = type === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setType(r.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[var(--radius)] border-l-2 px-3 py-2.5 text-left',
                    active ? 'border-[var(--primary)] bg-[var(--surface-hover)]' : 'border-transparent hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                  <span>
                    <span className="block text-sm font-medium">{r.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{r.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            {(type === 'monthly' || type === 'payroll' || type === 'attendance') && monthYear}
            {type === 'leave' && <YearSelect value={year} onChange={setYear} />}
            {(type === 'attendance' || type === 'leave' || type === 'directory') && (
              <select className={`${inputClass} w-40`} value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">All departments</option>
                {depts.map((d: string) => <option key={d}>{d}</option>)}
              </select>
            )}
            {type === 'attendance' && (
              <select className={`${inputClass} w-44`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">All employees</option>
                {(employeesQ.data || []).map((e: any) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            )}
            {type === 'leave' && (
              <select className={`${inputClass} w-40`} value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                <option value="">All types</option>
                {['Annual', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Unpaid'].map((t) => <option key={t}>{t}</option>)}
              </select>
            )}
            {type === 'directory' && (
              <>
                <select className={`${inputClass} w-40`} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                  <option value="">All types</option>
                  <option value="full-time">Full-time</option>
                  <option value="contract">Contract</option>
                  <option value="part-time">Part-time</option>
                </select>
                <select className={`${inputClass} w-36`} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="all">All</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </>
            )}
            <Button variant="outline" onClick={() => setTick((n) => n + 1)}>Refresh Preview</Button>
            <Button onClick={exportPdf}>Download PDF</Button>
            {type !== 'monthly' && <Button variant="outline" onClick={exportCsv}>Export CSV</Button>}
          </div>
          {reportQ.isLoading && !reportQ.data ? (
            <TableSkeleton />
          ) : (
            <>
              {type === 'monthly' && <MonthlySummaryPreview data={reportQ.data} />}
              {type === 'attendance' && <AttendanceReportPreview data={reportQ.data} />}
              {type === 'payroll' && <PayrollReportPreview data={reportQ.data} />}
              {type === 'leave' && <LeaveReportPreview data={reportQ.data} />}
              {type === 'directory' && <DirectoryReportPreview data={reportQ.data} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HrReports;
