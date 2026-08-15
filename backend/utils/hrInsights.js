import pool from '../db.js';
import { isoDateOnly, ghanaToday } from './hrShared.js';
import { workingDaysInMonth, leaveDatesByEmployee } from './hrGps.js';

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;
  return { start, end, endDate };
}

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
}

function workingDatesInMonth(year, month, untilIso = null) {
  const { start, end } = monthBounds(year, month);
  const dates = [];
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= new Date(`${end}T00:00:00Z`).getTime(); t += 86400000) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    if (untilIso && iso > untilIso) break;
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(iso);
  }
  return dates;
}

function tenureParts(startDate, asOf = new Date()) {
  if (!startDate) return null;
  const s = new Date(`${isoDateOnly(startDate)}T00:00:00Z`);
  if (Number.isNaN(s.getTime())) return null;
  let months = (asOf.getFullYear() - s.getUTCFullYear()) * 12 + (asOf.getMonth() - s.getUTCMonth());
  if (asOf.getDate() < s.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12, totalMonths: months };
}

function formatTenure(parts) {
  if (!parts) return '—';
  if (parts.years <= 0) return `${parts.months}m`;
  return `${parts.years}y ${parts.months}m`;
}

export async function peopleSnapshot(year, month) {
  const { start, end } = monthBounds(year, month);
  const [active, types, depts, hires, left] = await Promise.all([
    pool.query(
      `SELECT id, full_name, department, employment_type, start_date, status
       FROM hr_employees WHERE status = 'active' ORDER BY full_name`
    ),
    pool.query(
      `SELECT COALESCE(employment_type, 'unspecified') AS employment_type, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' GROUP BY 1`
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Unassigned') AS department, COUNT(*)::int AS count
       FROM hr_employees WHERE status = 'active' GROUP BY 1 ORDER BY count DESC`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM hr_employees
       WHERE start_date >= $1 AND start_date <= $2`,
      [start, end]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n FROM hr_employees
       WHERE status IN ('inactive','suspended')
         AND COALESCE(suspended_at::date, created_at::date) >= $1
         AND COALESCE(suspended_at::date, created_at::date) <= $2`,
      [start, end]
    ),
  ]);
  const employees = active.rows;
  const tenures = employees.map((e) => ({ emp: e, parts: tenureParts(e.start_date) })).filter((x) => x.parts);
  const avgMonths = tenures.length
    ? Math.round(tenures.reduce((s, x) => s + x.parts.totalMonths, 0) / tenures.length)
    : 0;
  const longest = tenures.sort((a, b) => b.parts.totalMonths - a.parts.totalMonths)[0] || null;
  const joined = hires.rows[0].n;
  const departed = left.rows[0].n;
  return {
    as_of: monthLabel(year, month),
    headcount: employees.length,
    net_change: joined - departed,
    joined,
    departed,
    types: types.rows,
    departments: depts.rows,
    department_count: depts.rows.length,
    average_tenure: formatTenure({ years: Math.floor(avgMonths / 12), months: avgMonths % 12, totalMonths: avgMonths }),
    longest_tenure: longest
      ? { name: longest.emp.full_name, tenure: formatTenure(longest.parts) }
      : null,
  };
}

export async function attendanceHealth(year, month) {
  const working = workingDaysInMonth(year, month);
  const { start, end } = monthBounds(year, month);
  const today = ghanaToday();
  const dates = workingDatesInMonth(year, month, `${year}-${String(month).padStart(2, '0')}` === today.slice(0, 7) ? today : end);
  const [emps, records, leaveMap, lateDays] = await Promise.all([
    pool.query(`SELECT id, full_name, department FROM hr_employees WHERE status = 'active'`),
    pool.query(
      `SELECT employee_id, date, status, is_late FROM hr_attendance WHERE date >= $1 AND date <= $2`,
      [start, end]
    ),
    leaveDatesByEmployee(start, end),
    pool.query(
      `SELECT EXTRACT(DOW FROM date)::int AS dow, COUNT(*)::int AS count
       FROM hr_attendance
       WHERE date >= $1 AND date <= $2 AND (is_late = true OR LOWER(status) = 'late')
       GROUP BY 1`,
      [start, end]
    ),
  ]);
  const employees = emps.rows;
  const recByEmpDate = new Map();
  let lateCount = 0;
  for (const r of records.rows) {
    const eid = Number(r.employee_id);
    const d = isoDateOnly(r.date);
    if (!recByEmpDate.has(eid)) recByEmpDate.set(eid, new Map());
    recByEmpDate.get(eid).set(d, r);
    const s = String(r.status || '').toLowerCase();
    if (r.is_late || s === 'late') lateCount += 1;
  }

  const daily = dates.map((iso) => {
    let present = 0;
    let absent = 0;
    let onLeave = 0;
    for (const emp of employees) {
      const leave = leaveMap.get(Number(emp.id))?.has(iso);
      if (leave) {
        onLeave += 1;
        continue;
      }
      const rec = recByEmpDate.get(Number(emp.id))?.get(iso);
      const s = String(rec?.status || '').toLowerCase();
      if (s === 'present' || s === 'late' || s === 'half-day' || rec?.is_late) present += 1;
      else if (s === 'absent') absent += 1;
      else absent += 1;
    }
    const expected = Math.max(employees.length - onLeave, 0);
    const rate = expected > 0 ? Math.round((present / expected) * 1000) / 10 : 100;
    const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { date: iso, label, rate, present, absent, on_leave: onLeave, below_target: rate < 95 };
  });

  const below = daily.filter((d) => d.below_target).length;
  const possible = employees.length * Math.max(dates.length, 1);
  const presentTotal = daily.reduce((s, d) => s + d.present, 0);
  const companyRate = possible > 0 ? Math.round((presentTotal / possible) * 1000) / 10 : 0;

  const perfect = [];
  for (const emp of employees) {
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    let ok = true;
    for (const iso of dates) {
      if (leaveSet.has(iso)) continue;
      const rec = recByEmpDate.get(Number(emp.id))?.get(iso);
      const s = String(rec?.status || '').toLowerCase();
      if (!(s === 'present' || s === 'late' || s === 'half-day' || rec?.is_late)) {
        ok = false;
        break;
      }
    }
    if (ok && dates.length) perfect.push(emp.full_name);
  }

  const dowLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const lateMap = new Map(lateDays.rows.map((r) => [Number(r.dow), r.count]));
  const lateWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => ({
    day,
    count: lateMap.get(dowLabels.indexOf(day)) || 0,
  }));
  const mostLate = [...lateWeek].sort((a, b) => b.count - a.count)[0];

  const deptStats = new Map();
  for (const emp of employees) {
    const dept = emp.department || 'Unassigned';
    if (!deptStats.has(dept)) deptStats.set(dept, { employees: 0, present: 0, expected: 0 });
    const bucket = deptStats.get(dept);
    bucket.employees += 1;
    const leaveSet = leaveMap.get(Number(emp.id)) || new Set();
    for (const iso of dates) {
      if (leaveSet.has(iso)) continue;
      bucket.expected += 1;
      const rec = recByEmpDate.get(Number(emp.id))?.get(iso);
      const s = String(rec?.status || '').toLowerCase();
      if (s === 'present' || s === 'late' || s === 'half-day' || rec?.is_late) bucket.present += 1;
    }
  }
  const departments = [...deptStats.entries()]
    .map(([department, b]) => ({
      department,
      employees: b.employees,
      attendance_rate: b.expected > 0 ? Math.round((b.present / b.expected) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.attendance_rate - a.attendance_rate);

  return {
    working_days: working,
    attendance_rate: companyRate,
    target: 95,
    late_count: lateCount,
    absent_days: daily.reduce((s, d) => s + d.absent, 0),
    perfect_attendance: perfect,
    most_late_day: mostLate?.count ? mostLate.day : null,
    days_below_target: below,
    daily,
    late_week: lateWeek,
    departments,
    best_department: departments[0] || null,
    worst_department: departments[departments.length - 1] || null,
  };
}

export async function leaveOverview(year) {
  const today = ghanaToday();
  const [byType, trend, onLeave, pending] = await Promise.all([
    pool.query(
      `SELECT leave_type, SUM(days)::int AS days, COUNT(*)::int AS requests FROM (
         SELECT leave_type, days FROM hr_leave_applications
         WHERE LOWER(TRIM(status)) = 'approved' AND EXTRACT(YEAR FROM start_date) = $1
         UNION ALL
         SELECT leave_type, days FROM hr_leave_requests
         WHERE LOWER(TRIM(status)) = 'approved' AND EXTRACT(YEAR FROM start_date) = $1
       ) x GROUP BY leave_type ORDER BY days DESC`,
      [year]
    ),
    pool.query(
      `SELECT EXTRACT(MONTH FROM start_date)::int AS month, SUM(days)::int AS days FROM (
         SELECT start_date, days FROM hr_leave_applications
         WHERE LOWER(TRIM(status)) = 'approved' AND EXTRACT(YEAR FROM start_date) = $1
         UNION ALL
         SELECT start_date, days FROM hr_leave_requests
         WHERE LOWER(TRIM(status)) = 'approved' AND EXTRACT(YEAR FROM start_date) = $1
       ) x GROUP BY 1`,
      [year]
    ),
    pool.query(
      `SELECT DISTINCT e.full_name, e.department FROM (
         SELECT employee_id FROM hr_leave_applications
         WHERE LOWER(TRIM(status)) = 'approved' AND start_date <= $1 AND end_date >= $1
         UNION
         SELECT employee_id FROM hr_leave_requests
         WHERE LOWER(TRIM(status)) = 'approved' AND start_date <= $1 AND end_date >= $1 AND employee_id IS NOT NULL
       ) x JOIN hr_employees e ON e.id = x.employee_id ORDER BY e.full_name`,
      [today]
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM hr_leave_requests WHERE status = 'pending'`),
  ]);
  const typeRows = byType.rows;
  const totalDays = typeRows.reduce((s, r) => s + Number(r.days || 0), 0);
  const map = new Map(trend.rows.map((r) => [Number(r.month), r.days]));
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
    days: map.get(i + 1) || 0,
  }));
  const peak = [...months].sort((a, b) => b.days - a.days)[0];
  return {
    year,
    total_days: totalDays,
    most_used: typeRows[0] || null,
    currently_on_leave: onLeave.rows,
    pending_requests: pending.rows[0]?.n || 0,
    by_type: typeRows,
    months,
    peak_month: peak?.days ? peak.label : null,
  };
}

export async function payrollIntelligence(year, month) {
  const [yearRows, dept, avg] = await Promise.all([
    pool.query(
      `SELECT p.month, COALESCE(SUM(i.gross),0)::numeric AS gross, COALESCE(SUM(i.net_pay),0)::numeric AS net
       FROM hr_payroll p JOIN hr_payroll_items i ON i.payroll_id = p.id
       WHERE p.year = $1
       GROUP BY p.month`,
      [year]
    ),
    pool.query(
      `SELECT COALESCE(NULLIF(TRIM(e.department), ''), 'Unassigned') AS department,
              COALESCE(SUM(i.gross),0)::numeric AS gross
       FROM hr_payroll p
       JOIN hr_payroll_items i ON i.payroll_id = p.id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE p.year = $1 AND p.month = $2
       GROUP BY 1 ORDER BY gross DESC`,
      [year, month]
    ),
    pool.query(
      `SELECT COALESCE(AVG(COALESCE(basic_salary,0) + COALESCE(allowances,0)),0)::numeric AS avg
       FROM hr_employees WHERE status = 'active'`
    ),
  ]);
  const byMonth = new Map(yearRows.rows.map((r) => [Number(r.month), r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const row = byMonth.get(i + 1);
    return {
      month: i + 1,
      label: new Date(2000, i, 1).toLocaleString('en', { month: 'short' }),
      gross: Number(row?.gross || 0),
      net: Number(row?.net || 0),
      current: i + 1 === month,
    };
  });
  const yearSpend = months.reduce((s, r) => s + r.gross, 0);
  const highest = [...months].sort((a, b) => b.gross - a.gross)[0];
  const current = months.find((m) => m.month === month);
  const prev = months.find((m) => m.month === month - 1);
  const vsLast = prev?.gross
    ? Math.round(((Number(current?.gross || 0) - prev.gross) / prev.gross) * 1000) / 10
    : 0;
  return {
    year,
    month,
    year_spend: yearSpend,
    average_salary: Number(avg.rows[0]?.avg || 0),
    highest_month: highest?.gross ? highest : null,
    vs_last_month_pct: vsLast,
    months,
    departments: dept.rows.map((r) => ({ department: r.department, gross: Number(r.gross || 0) })),
  };
}

export { monthBounds, monthLabel, workingDatesInMonth, formatTenure, tenureParts, toNum };
