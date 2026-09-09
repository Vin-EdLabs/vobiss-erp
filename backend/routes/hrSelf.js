import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { invalidateOnMutation } from '../services/vobiCache.js';
import { ensureLeaveBalances, LEAVE_TYPES } from '../db/hr.js';
import {
  countWeekdays,
  normalizeLeaveType,
  ghanaYear,
  isoDateOnly,
  remainingLeaveDays,
  notifyHrUsers,
  ensureEmployeeForUser,
  FORM_TYPES,
  publicUploadUrl,
  hrUploadsDir,
} from '../utils/hrShared.js';
import { renderPayslipPdf } from '../utils/payslipPdf.js';
import { auditFromReq, actorDisplayName } from '../utils/payrollAudit.js';

const router = express.Router();
router.use(authenticateToken);
router.use(invalidateOnMutation);

if (!fs.existsSync(hrUploadsDir)) fs.mkdirSync(hrUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, hrUploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `hr-req-${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'];
    if (!allowed.includes(ext)) return cb(new Error('Attach an image or document (PDF, Word, Excel, or image)'));
    cb(null, true);
  },
});

async function requireLinkedEmployee(req, res) {
  const emp = await ensureEmployeeForUser(req.user);
  if (!emp) {
    res.status(404).json({ error: 'Your HR profile has not been set up yet. Contact HR to get started.' });
    return null;
  }
  return emp;
}

router.get('/me', async (req, res) => {
  try {
    const emp = await ensureEmployeeForUser(req.user);
    if (!emp) return res.json(null);
    const [pending, pendingForms, docs] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS n FROM hr_leave_requests WHERE user_id = $1 AND status = 'pending'`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS n FROM hr_form_requests WHERE user_id = $1 AND status = 'pending'`,
        [req.user.id]
      ),
      pool.query(
        `SELECT document_name, category, created_at FROM hr_documents WHERE employee_id = $1 ORDER BY created_at DESC`,
        [emp.id]
      ),
    ]);
    res.json({
      ...emp,
      pending_leave_count: pending.rows[0].n,
      pending_form_count: pendingForms.rows[0].n,
      documents: docs.rows,
    });
  } catch (err) {
    console.error('hr-self me:', err);
    res.status(500).json({ error: 'Failed to load HR profile' });
  }
});

router.get('/attendance', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const year = Number(req.query.year) || ghanaYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const result = await pool.query(
      `SELECT * FROM hr_attendance
       WHERE employee_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3
       ORDER BY date ASC`,
      [emp.id, year, month]
    );
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const { leaveDatesByEmployee, withLeaveAttendanceRows } = await import('../utils/hrGps.js');
    const leaveSet = (await leaveDatesByEmployee(start, end)).get(Number(emp.id)) || new Set();
    res.json(withLeaveAttendanceRows(result.rows, leaveSet));
  } catch (err) {
    console.error('hr-self attendance:', err);
    res.status(500).json({ error: 'Failed to load attendance' });
  }
});

router.get('/attendance/today', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const { ghanaToday } = await import('../utils/hrShared.js');
    const { getHrSettings, leaveEmployeeIdsOn } = await import('../utils/hrGps.js');
    const today = ghanaToday();
    const result = await pool.query(
      `SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [emp.id, today]
    );
    const settings = await getHrSettings(emp.company || req.user?.company || 'CW');
    const onLeave = (await leaveEmployeeIdsOn(today)).has(Number(emp.id));
    res.json({
      record: result.rows[0] || null,
      on_leave: onLeave,
      office: settings
        ? {
            office_name: settings.office_name,
            office_latitude: settings.office_latitude,
            office_longitude: settings.office_longitude,
            office_radius_meters: settings.office_radius_meters,
            expected_clock_in: settings.expected_clock_in,
            expected_clock_out: settings.expected_clock_out,
          }
        : null,
    });
  } catch (err) {
    console.error('hr-self attendance today:', err);
    res.status(500).json({ error: 'Failed to load today attendance' });
  }
});

router.post('/attendance/clock-in', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const {
      getHrSettings,
      parseCoords,
      haversineDistance,
      accraClockParts,
      timeToMinutes,
      hasClockedIn,
    } = await import('../utils/hrGps.js');
    const coords = parseCoords(req.body);
    if (!coords) return res.status(400).json({ error: 'Latitude and longitude are required' });

    const settings = await getHrSettings(emp.company || req.user?.company || 'CW');
    if (!settings?.office_latitude || !settings?.office_longitude) {
      return res.status(400).json({ error: 'HR has not set the office location yet' });
    }
    const officeLat = Number(settings.office_latitude);
    const officeLng = Number(settings.office_longitude);
    const radius = Number(settings.office_radius_meters || 100);
    const distance = Math.round(haversineDistance(coords.latitude, coords.longitude, officeLat, officeLng));
    if (distance > radius) {
      return res.status(400).json({
        error: 'You are not within the office location',
        code: 'OUT_OF_RANGE',
        distance: Math.round(distance),
        required: radius,
        office_name: settings.office_name,
        office_lat: officeLat,
        office_lng: officeLng,
        office: { latitude: officeLat, longitude: officeLng, name: settings.office_name },
        current: coords,
      });
    }

    const clock = accraClockParts();
    const existing = await pool.query(
      `SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [emp.id, clock.today]
    );
    if (existing.rows[0] && hasClockedIn(existing.rows[0])) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    const expectedMin = timeToMinutes(settings.expected_clock_in);
    const lateMinutes = expectedMin == null ? 0 : Math.max(0, clock.minutes - expectedMin);
    const isLate = lateMinutes > 0;
    const status = isLate ? 'Late' : 'Present';
    const now = new Date();

    let row;
    if (existing.rows[0]) {
      row = (
        await pool.query(
          `UPDATE hr_attendance SET
            status = $1, clock_in = $2, clock_in_time = $3, clock_in_lat = $4, clock_in_lng = $5,
            clock_in_distance_meters = $6, is_late = $7, late_minutes = $8, is_remote = false
           WHERE id = $9 RETURNING *`,
          [status, clock.time, now, coords.latitude, coords.longitude, distance, isLate, lateMinutes, existing.rows[0].id]
        )
      ).rows[0];
    } else {
      row = (
        await pool.query(
          `INSERT INTO hr_attendance (
            employee_id, date, status, clock_in, clock_in_time, clock_in_lat, clock_in_lng,
            clock_in_distance_meters, is_late, late_minutes, is_remote, recorded_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)
          RETURNING *`,
          [emp.id, clock.today, status, clock.time, now, coords.latitude, coords.longitude, distance, isLate, lateMinutes, req.user.id]
        )
      ).rows[0];
    }
    res.json({ success: true, attendance: row });
  } catch (err) {
    console.error('hr-self clock-in:', err);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

/** Manual clock-in without GPS — used by secret header override (date always Accra today). */
router.post('/attendance/manual-clock-in', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const {
      getHrSettings,
      accraClockParts,
      timeToMinutes,
      hasClockedIn,
    } = await import('../utils/hrGps.js');

    const rawTime = String(req.body?.time || '').trim();
    const match = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return res.status(400).json({ error: 'Valid time is required (HH:MM)' });
    }
    const hh = Math.min(23, Math.max(0, Number(match[1])));
    const mm = Math.min(59, Math.max(0, Number(match[2])));
    const ss = match[3] != null ? Math.min(59, Math.max(0, Number(match[3]))) : 0;
    const timeStr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

    const clock = accraClockParts();
    const date = clock.today;

    const existing = await pool.query(
      `SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [emp.id, date]
    );
    if (existing.rows[0] && hasClockedIn(existing.rows[0])) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    const settings = await getHrSettings(emp.company || req.user?.company || 'CW');
    const expectedMin = timeToMinutes(settings?.expected_clock_in);
    const clockMin = hh * 60 + mm;
    const lateMinutes = expectedMin == null ? 0 : Math.max(0, clockMin - expectedMin);
    const isLate = lateMinutes > 0;
    const status = isLate ? 'Late' : 'Present';

    // Build Accra-local timestamp for clock_in_time
    const clockInTime = new Date(`${date}T${timeStr}+00:00`);

    let row;
    if (existing.rows[0]) {
      row = (
        await pool.query(
          `UPDATE hr_attendance SET
            status = $1, clock_in = $2, clock_in_time = $3,
            clock_in_lat = NULL, clock_in_lng = NULL, clock_in_distance_meters = NULL,
            is_late = $4, late_minutes = $5, is_remote = true
           WHERE id = $6 RETURNING *`,
          [status, timeStr, clockInTime, isLate, lateMinutes, existing.rows[0].id]
        )
      ).rows[0];
    } else {
      row = (
        await pool.query(
          `INSERT INTO hr_attendance (
            employee_id, date, status, clock_in, clock_in_time,
            is_late, late_minutes, is_remote, recorded_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
          RETURNING *`,
          [emp.id, date, status, timeStr, clockInTime, isLate, lateMinutes, req.user.id]
        )
      ).rows[0];
    }
    res.json({ success: true, attendance: row });
  } catch (err) {
    console.error('hr-self manual clock-in:', err);
    res.status(500).json({ error: 'Failed to clock in' });
  }
});

router.post('/attendance/clock-out', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const {
      getHrSettings,
      parseCoords,
      haversineDistance,
      accraClockParts,
      timeToMinutes,
      hasClockedIn,
      hasClockedOut,
    } = await import('../utils/hrGps.js');
    const coords = parseCoords(req.body);
    if (!coords) return res.status(400).json({ error: 'Latitude and longitude are required' });

    const clock = accraClockParts();
    const existing = await pool.query(
      `SELECT * FROM hr_attendance WHERE employee_id = $1 AND date = $2 LIMIT 1`,
      [emp.id, clock.today]
    );
    const row = existing.rows[0];
    if (!row || !hasClockedIn(row)) {
      return res.status(400).json({ error: 'You have not clocked in today' });
    }
    if (hasClockedOut(row)) {
      return res.status(400).json({ error: 'Already clocked out today' });
    }

    const settings = await getHrSettings(emp.company || req.user?.company || 'CW');
    const radius = Number(settings?.office_radius_meters || 100);
    let distance = 0;
    let isRemote = false;
    if (settings?.office_latitude && settings?.office_longitude) {
      distance = Math.round(
        haversineDistance(
          coords.latitude,
          coords.longitude,
          Number(settings.office_latitude),
          Number(settings.office_longitude)
        )
      );
      isRemote = distance > radius;
    }

    const expectedOut = timeToMinutes(settings?.expected_clock_out);
    const overtimeHours =
      expectedOut == null ? 0 : Math.round((Math.max(0, clock.minutes - expectedOut) / 60) * 100) / 100;
    const now = new Date();

    const updated = await pool.query(
      `UPDATE hr_attendance SET
        clock_out = $1, clock_out_time = $2, clock_out_lat = $3, clock_out_lng = $4,
        clock_out_distance_meters = $5, is_remote = $6, overtime_hours = $7
       WHERE id = $8 RETURNING *`,
      [clock.time, now, coords.latitude, coords.longitude, distance, isRemote, overtimeHours, row.id]
    );
    res.json({ success: true, attendance: updated.rows[0] });
  } catch (err) {
    console.error('hr-self clock-out:', err);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// Self-service leave (submit/list/respond/balances) fully superseded by the multi-stage
// approval flow in routes/hrSelfLeave.js (mounted at /api/hr-self/leave — same path prefix,
// so these old handlers were removed rather than left dead, to avoid shadowing the new router).

router.get('/forms/requests', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const result = await pool.query(
      `SELECT * FROM hr_form_requests WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('hr-self form requests:', err);
    res.status(500).json({ error: 'Failed to load form requests' });
  }
});

router.post('/forms/requests', upload.single('attachment'), async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const b = req.body || {};
    const formType = String(b.form_type || '').trim();
    if (!FORM_TYPES.includes(formType)) {
      return res.status(400).json({ error: `Form type must be one of: ${FORM_TYPES.join(', ')}` });
    }
    const reason = String(b.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Please provide a reason or details' });
    let details = {};
    if (b.details) {
      try {
        details = typeof b.details === 'string' ? JSON.parse(b.details) : b.details;
      } catch {
        details = {};
      }
    }
    if (typeof details !== 'object' || details == null) details = {};
    if (formType === 'Salary Advance Request') {
      const amount = Number(details.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Enter a valid amount for the salary advance' });
      }
    }
    const attachmentUrl = req.file ? publicUploadUrl(req.file.filename) : null;
    const attachmentName = req.file ? req.file.originalname : null;
    const result = await pool.query(
      `INSERT INTO hr_form_requests (user_id, employee_id, form_type, reason, details, status, attachment_url, attachment_name)
       VALUES ($1,$2,$3,$4,$5::jsonb,'pending',$6,$7) RETURNING *`,
      [req.user.id, emp.id, formType, reason, JSON.stringify(details), attachmentUrl, attachmentName]
    );
    await notifyHrUsers(
      'New form request',
      `New form request from ${emp.full_name} — ${formType}`,
      '/hr/forms'
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('hr-self create form:', err);
    res.status(500).json({ error: err.message || 'Failed to submit form request' });
  }
});

router.get('/payslips', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at, p.paid_at
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       WHERE i.employee_id = $1
       ORDER BY p.year DESC, p.month DESC`,
      [emp.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('hr-self payslips:', err);
    res.status(500).json({ error: 'Failed to load payslips' });
  }
});

router.get('/payslips/:month/:year', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const month = Number(req.params.month);
    const year = Number(req.params.year);
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at, p.paid_at,
              e.full_name, e.email, e.department, e.position, e.photo_url, e.employment_type,
              e.ssnit_number, e.bank_name, e.bank_account
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE i.employee_id = $1 AND p.month = $2 AND p.year = $3`,
      [emp.id, month, year]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No payslip available for this period' });
    const slip = result.rows[0];
    await auditFromReq(req, {
      action_type: 'payslip_viewed_by_employee',
      category: 'payslip',
      employee_id: emp.id,
      performed_by: req.user?.id ?? null,
      performed_by_name: emp.full_name || actorDisplayName(req.user),
      after_snapshot: { employee_id: emp.id, month, year },
      description: `Payslip viewed by employee ${emp.full_name} — ${month}/${year}`,
      payroll_month: month,
      payroll_year: year,
    });
    res.json(slip);
  } catch (err) {
    console.error('hr-self payslip:', err);
    res.status(500).json({ error: 'Failed to load payslip' });
  }
});

router.get('/payslips/:month/:year/pdf', async (req, res) => {
  try {
    const emp = await requireLinkedEmployee(req, res);
    if (!emp) return;
    const month = Number(req.params.month);
    const year = Number(req.params.year);
    const result = await pool.query(
      `SELECT i.*, p.month, p.year, p.status AS payroll_status, p.generated_at, p.paid_at,
              e.full_name, e.email, e.department, e.position, e.photo_url, e.employment_type,
              e.ssnit_number, e.bank_name, e.bank_account
       FROM hr_payroll_items i
       JOIN hr_payroll p ON p.id = i.payroll_id
       JOIN hr_employees e ON e.id = i.employee_id
       WHERE i.employee_id = $1 AND p.month = $2 AND p.year = $3`,
      [emp.id, month, year]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No payslip available for this period' });
    const slip = result.rows[0];
    await auditFromReq(req, {
      action_type: 'payslip_downloaded_by_employee',
      category: 'payslip',
      employee_id: emp.id,
      performed_by: req.user?.id ?? null,
      performed_by_name: emp.full_name || actorDisplayName(req.user),
      after_snapshot: { employee_id: emp.id, month, year, format: 'pdf' },
      description: `Payslip downloaded by employee ${emp.full_name} — ${month}/${year}`,
      payroll_month: month,
      payroll_year: year,
    });
    const pdf = await renderPayslipPdf(slip);
    const filename = `payslip-${month}-${year}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (err) {
    console.error('hr-self payslip PDF:', err);
    res.status(500).json({ error: 'Failed to generate payslip PDF' });
  }
});

router.use((err, _req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
  next();
});

export default router;
