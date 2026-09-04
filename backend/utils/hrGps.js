import pool from '../db.js';
import { ghanaNow, ghanaToday, isoDateOnly } from './hrShared.js';

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function getHrSettings(company = null) {
  const result = await pool.query(
    company
      ? `SELECT * FROM hr_settings WHERE company = $1 ORDER BY id ASC LIMIT 1`
      : `SELECT * FROM hr_settings ORDER BY id ASC LIMIT 1`,
    company ? [company] : []
  );
  return result.rows[0] || null;
}

export function parseCoords(body = {}) {
  const lat = Number(body.latitude ?? body.lat);
  const lng = Number(body.longitude ?? body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function timeToMinutes(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }
  const text = String(value);
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function accraClockParts() {
  const now = ghanaNow();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return {
    now,
    today: ghanaToday(),
    time: `${hh}:${mm}:${ss}`,
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

export function hoursBetween(start, end) {
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.round(((b.getTime() - a.getTime()) / 3600000) * 100) / 100;
}

export function hasClockedIn(row) {
  return !!(row?.clock_in_time || row?.clock_in);
}

export function hasClockedOut(row) {
  return !!(row?.clock_out_time || row?.clock_out);
}

const APPROVED_LEAVE_RANGES_SQL = `
  SELECT employee_id, start_date, end_date FROM hr_leave_applications
  WHERE LOWER(TRIM(status)) = 'approved'
    AND start_date::date <= $2::date AND end_date::date >= $1::date
  UNION ALL
  SELECT employee_id, start_date, end_date FROM hr_leave_requests
  WHERE LOWER(TRIM(status)) = 'approved'
    AND start_date::date <= $2::date AND end_date::date >= $1::date
    AND employee_id IS NOT NULL
`;

function eachIsoDate(startIso, endIso, fn) {
  const s = isoDateOnly(startIso);
  const e = isoDateOnly(endIso);
  if (!s || !e) return;
  const from = new Date(`${s}T00:00:00Z`);
  const to = new Date(`${e}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return;
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
    fn(new Date(t).toISOString().slice(0, 10), new Date(t).getUTCDay());
  }
}

export async function leaveEmployeeIdsOn(dateIso) {
  const day = isoDateOnly(dateIso) || dateIso;
  const result = await pool.query(
    `SELECT DISTINCT employee_id FROM (
       ${APPROVED_LEAVE_RANGES_SQL}
     ) x WHERE employee_id IS NOT NULL`,
    [day, day]
  );
  return new Set(result.rows.map((r) => Number(r.employee_id)).filter(Number.isFinite));
}

export async function leaveDatesByEmployee(startIso, endIso) {
  const start = isoDateOnly(startIso);
  const end = isoDateOnly(endIso);
  const map = new Map();
  if (!start || !end) return map;
  const result = await pool.query(APPROVED_LEAVE_RANGES_SQL, [start, end]);
  for (const row of result.rows) {
    const eid = Number(row.employee_id);
    if (!Number.isFinite(eid)) continue;
    const set = map.get(eid) || new Set();
    eachIsoDate(row.start_date, row.end_date, (iso) => {
      if (iso >= start && iso <= end) set.add(iso);
    });
    map.set(eid, set);
  }
  return map;
}

export function overlayLeaveStatus(rec, leaveSet) {
  if (!rec) return rec;
  const d = isoDateOnly(rec.date);
  if (!d || !leaveSet?.has(d)) return rec;
  if (hasClockedIn(rec)) return rec;
  const s = String(rec.status || '').toLowerCase();
  if (s === 'present' || s === 'late' || s === 'half-day' || s.includes('leave')) return rec;
  return { ...rec, status: 'Leave' };
}

export function withLeaveAttendanceRows(rows, leaveSet) {
  const byDate = new Map();
  for (const rec of rows || []) {
    const key = isoDateOnly(rec.date);
    if (!key) continue;
    byDate.set(key, overlayLeaveStatus(rec, leaveSet));
  }
  for (const d of leaveSet || []) {
    if (byDate.has(d)) continue;
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    byDate.set(d, { date: d, status: 'Leave', notes: 'Approved leave' });
  }
  return [...byDate.values()].sort((a, b) => String(isoDateOnly(a.date)).localeCompare(String(isoDateOnly(b.date))));
}

export async function markLeaveAttendance(employeeId, startDate, endDate) {
  const eid = Number(employeeId);
  if (!Number.isFinite(eid)) return;
  const inserts = [];
  eachIsoDate(startDate, endDate, (iso, dow) => {
    if (dow === 0 || dow === 6) return;
    inserts.push(iso);
  });
  for (const iso of inserts) {
    await pool.query(
      `INSERT INTO hr_attendance (employee_id, date, status, notes)
       VALUES ($1, $2, 'Leave', 'Approved leave')
       ON CONFLICT (employee_id, date) DO UPDATE SET
         status = CASE
           WHEN hr_attendance.clock_in_time IS NOT NULL OR hr_attendance.clock_in IS NOT NULL THEN hr_attendance.status
           ELSE 'Leave'
         END,
         notes = CASE
           WHEN hr_attendance.clock_in_time IS NOT NULL OR hr_attendance.clock_in IS NOT NULL THEN hr_attendance.notes
           ELSE COALESCE(NULLIF(TRIM(hr_attendance.notes), ''), 'Approved leave')
         END`,
      [eid, iso]
    );
  }
}

export function workingDaysInMonth(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  let days = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}
