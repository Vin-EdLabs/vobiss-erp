import pool from '../db.js';
import { isoDateOnly } from './hrShared.js';
import { workingDaysInMonth, leaveDatesByEmployee } from './hrGps.js';
import { monthBounds, monthLabel, workingDatesInMonth, tenureParts, formatTenure } from './hrInsights.js';

function hoursFromRow(r) {
  const start = r?.clock_in_time || r?.clock_in;
  const end = r?.clock_out_time || r?.clock_out;
  if (!start || !end) return null;
  const a = new Date(String(start).includes('T') || String(start).includes('-') ? start : `1970-01-01T${String(start).slice(0, 8)}`);
  const b = new Date(String(end).includes('T') || String(end).includes('-') ? end : `1970-01-01T${String(end).slice(0, 8)}`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null;
  return Math.round(((b.getTime() - a.getTime()) / 3600000) * 100) / 100;
}

export async function monthlySummaryReport(year, month, company = null) {
  const { start, end } = monthBounds(year, month);
  const working = workingDaysInMonth(year, month);
  const dates = workingDatesInMonth(year, month, end);
  const empClause = company ? 'AND company = $1' : '';
  const empParams = company ? [company] : [];
  const [
    employees,
    hires,
    departed,
    types,
    depts,
    attendance,
    leaveTypes,
    onLeave,
    pendingLeave,
    payroll,
    expiring,
  ] = await Promise.all([
    pool.query(
      `SELECT id, full_name, department, employment_type, status FROM hr_employees WHERE status = 'active' ${empClause} ORDER BY full_name`,
      empParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM hr_employees WHERE start_date >= $1 AND start_date <= $2 ${company ? 'AND company = $3' : ''}`,
      company ? [start, end, company] : [start, end]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM hr_employees
       WHERE status IN ('inactive','suspended')
         AND COALESCE(suspended_at::date, created_at::date) >= $1
         AND COALESCE(suspended_at::date, created_at::date) <= $2 ${company ? 'AND company = $3' : ''}`,
      company ? [start, end, company] : [start, end]
    ),
    pool.query(
      `SELECT COALESCE(employment_type, 'unspecified') AS employment_type, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' ${empClause} GROUP BY 1`,
      empParams
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' ${empClause} GROUP BY 1 ORDER BY count DESC`,
      empParams
    ),
    pool.query(
      `SELECT employee_id, date, status, is_late FROM hr_attendance WHERE date >= $1 AND date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT leave_type, COUNT(*)::int AS requests, COALESCE(SUM(days),0)::int AS days FROM (
         SELECT l.leave_type, l.days FROM hr_leave_applications l
         JOIN hr_employees e ON e.id = l.employee_id
         WHERE LOWER(TRIM(l.status)) = 'approved' AND l.start_date <= $2 AND l.end_date >= $1 ${company ? 'AND e.company = $3' : ''}
         UNION ALL
         SELECT r.leave_type, r.days FROM hr_leave_requests r
         JOIN hr_employees e ON e.id = r.employee_id
         WHERE LOWER(TRIM(r.status)) = 'approved' AND r.start_date <= $2 AND r.end_date >= $1 ${company ? 'AND e.company = $3' : ''}
       ) x GROUP BY leave_type ORDER BY days DESC`,
      company ? [start, end, company] : [start, end]
    ),
    pool.query(
      `SELECT DISTINCT e.full_name FROM (
         SELECT employee_id FROM hr_leave_applications
         WHERE LOWER(TRIM(status)) = 'approved' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
         UNION
         SELECT employee_id FROM hr_leave_requests
         WHERE LOWER(TRIM(status)) = 'approved' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE AND employee_id IS NOT NULL
       ) x JOIN hr_employees e ON e.id = x.employee_id ${company ? 'WHERE e.company = $1' : ''} ORDER BY 1`,
      empParams
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM hr_leave_requests r JOIN hr_employees e ON e.id = r.employee_id WHERE r.status = 'pending' ${company ? 'AND e.company = $1' : ''}`,
      empParams
    ),
    pool.query(
      `SELECT p.status, p.generated_at,
              COALESCE(SUM(i.gross),0)::numeric AS gross,
              COALESCE(SUM(i.ssnit_employee),0)::numeric AS ssnit_employee,
              COALESCE(SUM(i.ssnit_employer),0)::numeric AS ssnit_employer,
              COALESCE(SUM(i.paye),0)::numeric AS paye,
              COALESCE(SUM(i.net_pay),0)::numeric AS net
       FROM hr_payroll p
       LEFT JOIN hr_payroll_items i ON i.payroll_id = p.id
       WHERE p.year = $1 AND p.month = $2 ${company ? 'AND p.company = $3' : ''}
       GROUP BY p.id`,
      company ? [year, month, company] : [year, month]
    ),
    pool.query(
      `SELECT full_name FROM hr_employees
       WHERE status = 'active' AND contract_end_date IS NOT NULL
         AND contract_end_date <= CURRENT_DATE + INTERVAL '60 days' ${empClause}
       ORDER BY contract_end_date`,
      empParams
    ),
  ]);

  const leaveMap = await leaveDatesByEmployee(start, end);
  const recByEmp = new Map();
  for (const r of attendance.rows) {
    const eid = Number(r.employee_id);
    if (!recByEmp.has(eid)) recByEmp.set(eid, new Map());
    recByEmp.get(eid).set(isoDateOnly(r.date), r);
  }

  let presentDays = 0;
  let absentDays = 0;
  const perfect = [];
  const below80 = [];
  for (const emp of employees.rows) {
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    let present = 0;
    let expected = 0;
    let hadAbsent = false;
    for (const iso of dates) {
      if (leaveSet.has(iso)) continue;
      expected += 1;
      const rec = recByEmp.get(Number(emp.id))?.get(iso);
      const s = String(rec?.status || '').toLowerCase();
      if (s === 'present' || s === 'late' || s === 'half-day' || rec?.is_late) {
        present += 1;
        presentDays += 1;
      } else {
        absentDays += 1;
        hadAbsent = true;
      }
    }
    const pct = expected > 0 ? (present / expected) * 100 : 100;
    if (expected > 0 && !hadAbsent) perfect.push(emp.full_name);
    if (expected > 0 && pct < 80) below80.push(emp.full_name);
  }

  const headcount = employees.rows.length;
  const newHires = hires.rows[0].n;
  const departures = departed.rows[0].n;
  const rate = presentDays + absentDays > 0 ? Math.round((presentDays / (presentDays + absentDays)) * 1000) / 10 : 0;
  const pay = payroll.rows[0] || null;

  return {
    period: monthLabel(year, month),
    month,
    year,
    headcount,
    new_hires: newHires,
    departures,
    net_change: newHires - departures,
    departments: depts.rows.map((r) => ({
      department: r.department,
      headcount: r.count,
      pct: headcount > 0 ? Math.round((r.count / headcount) * 1000) / 10 : 0,
    })),
    employment_types: types.rows.map((r) => ({
      employment_type: r.employment_type,
      count: r.count,
      pct: headcount > 0 ? Math.round((r.count / headcount) * 1000) / 10 : 0,
    })),
    attendance: {
      working_days: working,
      avg_present: headcount > 0 ? Math.round((presentDays / Math.max(dates.length, 1)) * 10) / 10 : 0,
      avg_absent: headcount > 0 ? Math.round((absentDays / Math.max(dates.length, 1)) * 10) / 10 : 0,
      attendance_rate: rate,
      perfect,
      below80,
    },
    leave: {
      by_type: leaveTypes.rows.map((r) => ({
        leave_type: r.leave_type,
        requests: r.requests,
        days: r.days,
        avg: r.requests > 0 ? Math.round((r.days / r.requests) * 10) / 10 : 0,
      })),
      currently_on_leave: onLeave.rows.map((r) => r.full_name),
    },
    payroll: pay
      ? {
          generated: true,
          status: pay.status,
          gross: Number(pay.gross || 0),
          ssnit_employee: Number(pay.ssnit_employee || 0),
          ssnit_employer: Number(pay.ssnit_employer || 0),
          paye: Number(pay.paye || 0),
          net: Number(pay.net || 0),
        }
      : { generated: false, status: null, gross: 0, ssnit_employee: 0, ssnit_employer: 0, paye: 0, net: 0 },
    flags: {
      attendance_rate: rate,
      pending_leave: pendingLeave.rows[0]?.n || 0,
      payroll_generated: !!pay,
      payroll_status: pay?.status || null,
      expiring_contracts: expiring.rows.map((r) => r.full_name),
    },
  };
}

export async function attendanceReport(year, month, department, employeeId, company = null) {
  const { start, end } = monthBounds(year, month);
  const working = workingDaysInMonth(year, month);
  const dates = workingDatesInMonth(year, month, end);
  const params = [];
  const clauses = [`e.status = 'active'`];
  if (company) {
    params.push(company);
    clauses.push(`e.company = $${params.length}`);
  }
  if (department) {
    params.push(department);
    clauses.push(`e.department = $${params.length}`);
  }
  if (employeeId) {
    params.push(Number(employeeId));
    clauses.push(`e.id = $${params.length}`);
  }
  const emps = await pool.query(
    `SELECT id, full_name, department, photo_url FROM hr_employees WHERE ${clauses.join(' AND ')} ORDER BY full_name`,
    params
  );
  const attParams = [start, end];
  let extra = '';
  if (employeeId) {
    attParams.push(Number(employeeId));
    extra = ` AND employee_id = $3`;
  }
  const records = await pool.query(
    `SELECT * FROM hr_attendance WHERE date >= $1 AND date <= $2 ${extra}`,
    attParams
  );
  const leaveMap = await leaveDatesByEmployee(start, end);
  const recByEmp = new Map();
  for (const r of records.rows) {
    const eid = Number(r.employee_id);
    if (!recByEmp.has(eid)) recByEmp.set(eid, new Map());
    recByEmp.get(eid).set(isoDateOnly(r.date), r);
  }

  const employees = emps.rows.map((emp) => {
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let expected = 0;
    for (const iso of dates) {
      if (leaveSet.has(iso)) {
        leave += 1;
        continue;
      }
      expected += 1;
      const rec = recByEmp.get(Number(emp.id))?.get(iso);
      const s = String(rec?.status || '').toLowerCase();
      if (rec?.is_late || s === 'late') {
        late += 1;
        present += 1;
      } else if (s === 'present' || s === 'half-day') present += 1;
      else absent += 1;
    }
    const pct = expected > 0 ? Math.round((present / expected) * 1000) / 10 : 100;
    const status = pct >= 95 ? 'Excellent' : pct >= 80 ? 'Good' : 'Needs Attention';
    return {
      employee_id: emp.id,
      full_name: emp.full_name,
      department: emp.department || 'Unassigned',
      present,
      absent,
      late,
      leave,
      attendance_pct: pct,
      status,
    };
  }).sort((a, b) => a.attendance_pct - b.attendance_pct);

  const totals = employees.reduce(
    (acc, r) => {
      acc.present += r.present;
      acc.absent += r.absent;
      acc.late += r.late;
      acc.leave += r.leave;
      return acc;
    },
    { present: 0, absent: 0, late: 0, leave: 0 }
  );
  const expectedAll = employees.reduce((s, r) => s + r.present + r.absent, 0);
  const avgRate = expectedAll > 0 ? Math.round((totals.present / expectedAll) * 1000) / 10 : 0;

  let daily = [];
  if (employeeId && emps.rows[0]) {
    const emp = emps.rows[0];
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    daily = dates.map((iso) => {
      const rec = recByEmp.get(Number(emp.id))?.get(iso);
      const onLeave = leaveSet.has(iso);
      const s = onLeave ? 'Leave' : rec?.is_late ? 'Late' : rec?.status || 'Absent';
      return {
        date: iso,
        day: new Date(`${iso}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }),
        status: s,
        clock_in: rec?.clock_in_time || rec?.clock_in || null,
        clock_out: rec?.clock_out_time || rec?.clock_out || null,
        hours: hoursFromRow(rec || {}),
        late_minutes: rec?.late_minutes || 0,
        notes: rec?.notes || null,
      };
    });
  }

  const deptMap = new Map();
  for (const row of employees) {
    if (!deptMap.has(row.department)) {
      deptMap.set(row.department, { department: row.department, employees: 0, present: 0, expected: 0, late: 0, absent: 0 });
    }
    const b = deptMap.get(row.department);
    b.employees += 1;
    b.present += row.present;
    b.expected += row.present + row.absent;
    b.late += row.late;
    b.absent += row.absent;
  }
  const departments = [...deptMap.values()]
    .map((b) => ({
      ...b,
      attendance_pct: b.expected > 0 ? Math.round((b.present / b.expected) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.attendance_pct - b.attendance_pct);

  return {
    period: monthLabel(year, month),
    working_days: working,
    summary: { ...totals, attendance_rate: avgRate, working_days: working },
    employees,
    daily,
    departments,
    single_employee: !!employeeId,
  };
}

export async function payrollReport(year, month, company = null) {
  const result = await pool.query(
    `SELECT e.full_name, e.department, e.position, e.bank_name, e.bank_account, e.ssnit_number, i.*,
            p.status AS payroll_status, p.generated_at, p.approved_at, p.paid_at,
            gb.first_name AS generated_first, gb.last_name AS generated_last,
            ab.first_name AS approved_first, ab.last_name AS approved_last
     FROM hr_payroll p
     JOIN hr_payroll_items i ON i.payroll_id = p.id
     JOIN hr_employees e ON e.id = i.employee_id
     LEFT JOIN users gb ON gb.id = p.generated_by
     LEFT JOIN users ab ON ab.id = p.approved_by
     WHERE p.year = $1 AND p.month = $2 ${company ? 'AND p.company = $3' : ''}
     ORDER BY e.full_name`,
    company ? [year, month, company] : [year, month]
  );
  const items = result.rows;
  const header = items[0]
    ? {
        status: items[0].payroll_status,
        generated_at: items[0].generated_at,
        generated_by: [items[0].generated_first, items[0].generated_last].filter(Boolean).join(' ') || null,
        approved_at: items[0].approved_at,
        approved_by: [items[0].approved_first, items[0].approved_last].filter(Boolean).join(' ') || null,
        paid_at: items[0].paid_at,
      }
    : null;
  const totals = items.reduce(
    (acc, r) => {
      acc.basic += Number(r.basic_salary || 0);
      acc.allowances += Number(r.allowances || 0);
      acc.gross += Number(r.gross || 0);
      acc.ssnit_employee += Number(r.ssnit_employee || 0);
      acc.ssnit_employer += Number(r.ssnit_employer || 0);
      acc.taxable_income += Number(r.taxable_income || 0);
      acc.paye += Number(r.paye || 0);
      acc.net += Number(r.net_pay || 0);
      return acc;
    },
    { basic: 0, allowances: 0, gross: 0, ssnit_employee: 0, ssnit_employer: 0, taxable_income: 0, paye: 0, net: 0 }
  );
  return {
    period: monthLabel(year, month),
    month,
    year,
    header,
    items,
    totals,
  };
}

export async function leaveReport(year, leaveType, department, company = null) {
  const params = [year];
  let extra = '';
  if (company) {
    params.push(company);
    extra += ` AND e.company = $${params.length}`;
  }
  if (department) {
    params.push(department);
    extra += ` AND e.department = $${params.length}`;
  }
  const balances = await pool.query(
    `SELECT b.employee_id, e.full_name, e.department, b.leave_type, b.total_days, b.used_days,
            GREATEST(b.total_days - b.used_days, 0) AS remaining_days
     FROM hr_leave_balances b
     JOIN hr_employees e ON e.id = b.employee_id
     WHERE b.year = $1 AND e.status = 'active' ${extra}
     ORDER BY e.full_name, b.leave_type`,
    params
  );
  const takenParams = [year];
  let takenExtra = '';
  if (leaveType) {
    takenParams.push(leaveType);
    takenExtra += ` AND x.leave_type = $${takenParams.length}`;
  }
  if (department) {
    takenParams.push(department);
    takenExtra += ` AND e.department = $${takenParams.length}`;
  }
  if (company) {
    takenParams.push(company);
    takenExtra += ` AND e.company = $${takenParams.length}`;
  }
  const taken = await pool.query(
    `SELECT e.id AS employee_id, e.full_name, e.department, x.leave_type, SUM(x.days)::int AS days_taken, COUNT(*)::int AS requests
     FROM (
       SELECT employee_id, leave_type, days, EXTRACT(YEAR FROM start_date) AS yr, start_date FROM hr_leave_applications WHERE LOWER(TRIM(status)) = 'approved'
       UNION ALL
       SELECT employee_id, leave_type, days, EXTRACT(YEAR FROM start_date) AS yr, start_date FROM hr_leave_requests WHERE LOWER(TRIM(status)) = 'approved' AND employee_id IS NOT NULL
     ) x
     JOIN hr_employees e ON e.id = x.employee_id
     WHERE x.yr = $1 ${takenExtra}
     GROUP BY e.id, e.full_name, e.department, x.leave_type
     ORDER BY e.full_name`,
    takenParams
  );
  const monthly = await pool.query(
    `SELECT EXTRACT(MONTH FROM start_date)::int AS month, COUNT(*)::int AS requests, COALESCE(SUM(days),0)::int AS days,
            COUNT(DISTINCT employee_id)::int AS employees
     FROM (
       SELECT l.employee_id, l.days, l.start_date FROM hr_leave_applications l
       JOIN hr_employees e ON e.id = l.employee_id
       WHERE LOWER(TRIM(l.status)) = 'approved' AND EXTRACT(YEAR FROM l.start_date) = $1 ${company ? 'AND e.company = $2' : ''}
       UNION ALL
       SELECT r.employee_id, r.days, r.start_date FROM hr_leave_requests r
       JOIN hr_employees e ON e.id = r.employee_id
       WHERE LOWER(TRIM(r.status)) = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $1 AND r.employee_id IS NOT NULL ${company ? 'AND e.company = $2' : ''}
     ) x GROUP BY 1`,
    company ? [year, company] : [year]
  );
  const pendingParams = [];
  let pendingExtra = '';
  if (leaveType) {
    pendingParams.push(leaveType);
    pendingExtra += ` AND r.leave_type = $${pendingParams.length}`;
  }
  if (department) {
    pendingParams.push(department);
    pendingExtra += ` AND e.department = $${pendingParams.length}`;
  }
  if (company) {
    pendingParams.push(company);
    pendingExtra += ` AND e.company = $${pendingParams.length}`;
  }
  const pending = await pool.query(
    `SELECT r.*, e.full_name, e.department
     FROM hr_leave_requests r
     LEFT JOIN hr_employees e ON e.id = r.employee_id
     WHERE r.status = 'pending' ${pendingExtra}
     ORDER BY r.created_at ASC`,
    pendingParams
  );

  const byEmp = new Map();
  for (const b of balances.rows) {
    const eid = Number(b.employee_id);
    if (!byEmp.has(eid)) {
      byEmp.set(eid, {
        employee_id: eid,
        full_name: b.full_name,
        department: b.department,
        annual_used: 0,
        sick_used: 0,
        emergency_used: 0,
        other_used: 0,
        total_days: 0,
        annual_remaining: 0,
        sick_remaining: 0,
      });
    }
    const row = byEmp.get(eid);
    const used = Number(b.used_days || 0);
    const remaining = Number(b.remaining_days || 0);
    const type = String(b.leave_type || '');
    row.total_days += used;
    if (type === 'Annual') {
      row.annual_used = used;
      row.annual_remaining = remaining;
    } else if (type === 'Sick') {
      row.sick_used = used;
      row.sick_remaining = remaining;
    } else if (type === 'Emergency') {
      row.emergency_used = used;
    } else {
      row.other_used += used;
    }
  }

  const typeTotals = taken.rows.reduce((acc, r) => {
    acc.requests += Number(r.requests || 0);
    acc.days += Number(r.days_taken || 0);
    const key = r.leave_type;
    acc.types.set(key, (acc.types.get(key) || 0) + Number(r.days_taken || 0));
    return acc;
  }, { requests: 0, days: 0, types: new Map() });
  const mostUsed = [...typeTotals.types.entries()].sort((a, b) => b[1] - a[1])[0];

  const monthMap = new Map(monthly.rows.map((r) => [Number(r.month), r]));
  const calendar = Array.from({ length: 12 }, (_, i) => {
    const row = monthMap.get(i + 1);
    return {
      month: i + 1,
      label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
      requests: Number(row?.requests || 0),
      days: Number(row?.days || 0),
      employees: Number(row?.employees || 0),
    };
  });

  return {
    year,
    summary: {
      total_requests: typeTotals.requests,
      total_days: typeTotals.days,
      most_used_type: mostUsed ? mostUsed[0] : null,
      pending_requests: pending.rows.length,
    },
    employees: [...byEmp.values()],
    calendar,
    pending: pending.rows.map((r) => ({
      ...r,
      pending_days: Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)),
    })),
  };
}

export async function directoryReport(department, employmentType, status, company = null) {
  const params = [];
  const clauses = [];
  if (company) {
    params.push(company);
    clauses.push(`company = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  } else if (!status) {
    clauses.push(`status = 'active'`);
  }
  if (department) {
    params.push(department);
    clauses.push(`department = $${params.length}`);
  }
  if (employmentType) {
    params.push(employmentType);
    clauses.push(`employment_type = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT id, full_name, email, phone, photo_url, department, position, employment_type, start_date, status
     FROM hr_employees ${where}
     ORDER BY department NULLS LAST, full_name`,
    params
  );
  const rows = result.rows.map((r) => {
    const parts = tenureParts(r.start_date);
    return {
      ...r,
      employee_code: `EMP-${String(r.id).padStart(3, '0')}`,
      tenure: formatTenure(parts),
      start_date: r.start_date ? isoDateOnly(r.start_date) : null,
    };
  });
  const depts = new Map();
  const types = { 'full-time': 0, contract: 0, 'part-time': 0 };
  for (const r of rows) {
    const d = r.department || 'Unassigned';
    depts.set(d, (depts.get(d) || 0) + 1);
    const t = String(r.employment_type || '').toLowerCase();
    if (t in types) types[t] += 1;
  }
  return {
    summary: {
      total: rows.length,
      departments: depts.size,
      full_time: types['full-time'],
      contract: types.contract,
      part_time: types['part-time'],
    },
    employees: rows,
  };
}
