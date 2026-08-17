/**
 * Populate local HR with a realistic week of attendance, leave requests, and form requests.
 * Run: node scripts/populate-hr-local.mjs
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const SEED = '[local-seed]';
const WEEK = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'];
const ACCRA = { lat: 5.6037, lng: -0.187 };

const pool = new pg.Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

function jitter(n, spread = 0.0008) {
  return Number((n + (Math.random() - 0.5) * spread).toFixed(6));
}

function ts(date, time) {
  return `${date} ${time}+00`;
}

function weekdays(start, end) {
  let n = 0;
  for (let d = new Date(`${start}T00:00:00Z`); d <= new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return n;
}

async function byName(name) {
  const { rows } = await pool.query(
    `SELECT id, user_id, full_name FROM hr_employees
     WHERE full_name = $1 AND user_id IS NOT NULL
     LIMIT 1`,
    [name]
  );
  if (!rows[0]) throw new Error(`Employee not found: ${name}`);
  return rows[0];
}

async function upsertAttendance(employeeId, date, row) {
  const lat = jitter(ACCRA.lat);
  const lng = jitter(ACCRA.lng);
  const present = ['Present', 'Late', 'Half-day'].includes(row.status);
  await pool.query(
    `INSERT INTO hr_attendance (
       employee_id, date, status, clock_in, clock_out, overtime_hours, notes, recorded_by,
       clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng,
       clock_in_distance_meters, clock_out_distance_meters, is_remote,
       clock_in_time, clock_out_time, is_late, late_minutes
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,NULL,
       $8,$9,$10,$11,
       $12,$13,false,
       $14,$15,$16,$17
     )
     ON CONFLICT (employee_id, date) DO UPDATE SET
       status = EXCLUDED.status,
       clock_in = EXCLUDED.clock_in,
       clock_out = EXCLUDED.clock_out,
       overtime_hours = EXCLUDED.overtime_hours,
       notes = EXCLUDED.notes,
       clock_in_lat = EXCLUDED.clock_in_lat,
       clock_in_lng = EXCLUDED.clock_in_lng,
       clock_out_lat = EXCLUDED.clock_out_lat,
       clock_out_lng = EXCLUDED.clock_out_lng,
       clock_in_distance_meters = EXCLUDED.clock_in_distance_meters,
       clock_out_distance_meters = EXCLUDED.clock_out_distance_meters,
       clock_in_time = EXCLUDED.clock_in_time,
       clock_out_time = EXCLUDED.clock_out_time,
       is_late = EXCLUDED.is_late,
       late_minutes = EXCLUDED.late_minutes`,
    [
      employeeId,
      date,
      row.status,
      present ? row.in : null,
      present ? row.out : null,
      row.ot || 0,
      `${row.note || row.status} ${SEED}`,
      present ? lat : null,
      present ? lng : null,
      present ? jitter(ACCRA.lat) : null,
      present ? jitter(ACCRA.lng) : null,
      present ? Math.round(Math.random() * 40) : null,
      present ? Math.round(Math.random() * 40) : null,
      present ? ts(date, row.in) : null,
      present ? ts(date, row.out) : null,
      !!row.late,
      row.late || 0,
    ]
  );
}

async function ensureBalances(employeeId) {
  const types = [
    ['Annual', 21],
    ['Sick', 14],
    ['Emergency', 5],
    ['Maternity', 84],
    ['Paternity', 5],
    ['Unpaid', 0],
  ];
  for (const [type, total] of types) {
    await pool.query(
      `INSERT INTO hr_leave_balances (employee_id, leave_type, year, total_days, used_days)
       VALUES ($1,$2,2026,$3,0)
       ON CONFLICT (employee_id, leave_type, year) DO NOTHING`,
      [employeeId, type, total]
    );
  }
}

async function main() {
  const hr = await pool.query(`SELECT id FROM users WHERE LOWER(username) = 'hr' LIMIT 1`);
  const hrId = hr.rows[0]?.id || null;

  const staff = {
    abeeku: await byName('Abeeku Debrah'),
    vincent: await byName('Acquah Vincent'),
    vince: await byName('Acquah Kwesi Vincent'),
    bezalel: await byName('Bezalel Ahulu'),
    carl: await byName('Carl Sackeyfio'),
    aidoo: await byName('Emmanuel Aidoo'),
    ezekiel: await byName('Ezekiel Dannis'),
    felix: await byName('Felix Akrong'),
    frank: await byName('Frank Patterson'),
    herbert: await byName('Herbert Tagoe'),
    kenneth: await byName('Kenneth Amey'),
    prince: await byName('Prince Aggrey Amissah'),
    samson: await byName('Samson Ablorh'),
    william: await byName('William Agyapong'),
    hrEmp: await byName('HR Admin'),
  };

  await pool.query(`DELETE FROM hr_leave_requests WHERE reason LIKE $1`, [`%${SEED}%`]);
  await pool.query(`DELETE FROM hr_leave_applications WHERE notes LIKE $1`, [`%${SEED}%`]);
  await pool.query(`DELETE FROM hr_form_requests WHERE reason LIKE $1`, [`%${SEED}%`]);
  await pool.query(`DELETE FROM hr_attendance WHERE notes LIKE $1`, [`%${SEED}%`]);

  const present = { status: 'Present', in: '07:52:00', out: '17:08:00', note: 'On time' };
  const presentAlt = { status: 'Present', in: '07:58:00', out: '17:04:00', note: 'On time' };
  const lateMon = { status: 'Late', in: '08:37:00', out: '17:12:00', late: 37, note: 'Traffic on Spintex' };
  const lateTue = { status: 'Late', in: '08:22:00', out: '17:06:00', late: 22, note: 'Arrived late' };
  const lateWed = { status: 'Late', in: '08:48:00', out: '17:20:00', late: 48, ot: 0.3, note: 'Stayed to make up time' };
  const absent = { status: 'Absent', note: 'No show' };
  const leave = { status: 'Leave', note: 'Approved leave' };
  const half = { status: 'Half-day', in: '08:02:00', out: '12:30:00', note: 'Left at midday' };

  const weekPlan = {
    abeeku: [present, presentAlt, present, present, present],
    vincent: [presentAlt, present, present, presentAlt, present],
    vince: [present, lateTue, present, present, presentAlt],
    bezalel: [present, presentAlt, leave, leave, present],
    carl: [present, present, lateWed, presentAlt, present],
    aidoo: [presentAlt, present, present, present, presentAlt],
    ezekiel: [present, presentAlt, present, present, present],
    felix: [absent, present, presentAlt, present, present],
    frank: [lateMon, present, present, presentAlt, present],
    herbert: [present, presentAlt, present, absent, absent],
    kenneth: [present, present, presentAlt, present, present],
    prince: [presentAlt, present, present, present, half],
    samson: [absent, absent, absent, present, presentAlt],
    william: [present, presentAlt, present, present, present],
    hrEmp: [presentAlt, present, present, presentAlt, present],
  };

  let attendanceCount = 0;
  for (const [key, days] of Object.entries(weekPlan)) {
    const emp = staff[key];
    await ensureBalances(emp.id);
    for (let i = 0; i < WEEK.length; i += 1) {
      await upsertAttendance(emp.id, WEEK[i], days[i]);
      attendanceCount += 1;
    }
  }

  const leaves = [
    {
      emp: staff.bezalel,
      type: 'Sick',
      start: '2026-08-12',
      end: '2026-08-13',
      status: 'approved',
      reason: `Malaria treatment and rest ${SEED}`,
      created: '2026-08-11 09:15:00',
      reviewed: '2026-08-11 14:40:00',
    },
    {
      emp: staff.ezekiel,
      type: 'Annual',
      start: '2026-08-20',
      end: '2026-08-21',
      status: 'approved',
      reason: `Family visit to Cape Coast ${SEED}`,
      created: '2026-08-10 11:02:00',
      reviewed: '2026-08-12 10:18:00',
    },
    {
      emp: staff.abeeku,
      type: 'Annual',
      start: '2026-08-24',
      end: '2026-08-26',
      status: 'pending',
      reason: `Short break after project close-out ${SEED}`,
      created: '2026-08-15 16:22:00',
    },
    {
      emp: staff.aidoo,
      type: 'Emergency',
      start: '2026-08-18',
      end: '2026-08-18',
      status: 'pending',
      reason: `Urgent family matter in Tema ${SEED}`,
      created: '2026-08-16 18:05:00',
    },
    {
      emp: staff.herbert,
      type: 'Unpaid',
      start: '2026-08-27',
      end: '2026-08-28',
      status: 'pending',
      reason: `Personal errands that cannot wait ${SEED}`,
      created: '2026-08-14 08:44:00',
    },
    {
      emp: staff.carl,
      type: 'Annual',
      start: '2026-08-31',
      end: '2026-09-02',
      status: 'rejected',
      reason: `Holiday with family ${SEED}`,
      rejection: 'Team coverage is thin that week. Please pick dates after 7 September.',
      created: '2026-08-13 13:10:00',
      reviewed: '2026-08-14 09:30:00',
    },
  ];

  for (const item of leaves) {
    const days = weekdays(item.start, item.end);
    const inserted = await pool.query(
      `INSERT INTO hr_leave_requests (
         user_id, employee_id, leave_type, start_date, end_date, days, reason, status,
         rejection_reason, reviewed_by, reviewed_at, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        item.emp.user_id,
        item.emp.id,
        item.type,
        item.start,
        item.end,
        days,
        item.reason,
        item.status,
        item.rejection || null,
        item.status === 'pending' ? null : hrId,
        item.reviewed || null,
        item.created,
      ]
    );
    if (item.status === 'approved') {
      await pool.query(
        `INSERT INTO hr_leave_applications (
           employee_id, leave_type, start_date, end_date, days, status, notes, recorded_by, created_at
         ) VALUES ($1,$2,$3,$4,$5,'Approved',$6,$7,$8)`,
        [item.emp.id, item.type, item.start, item.end, days, item.reason, hrId, item.created]
      );
      await pool.query(
        `UPDATE hr_leave_balances SET used_days = used_days + $1
         WHERE employee_id = $2 AND leave_type = $3 AND year = 2026`,
        [days, item.emp.id, item.type]
      );
    }
    console.log(`Leave ${item.status}: ${item.emp.full_name} — ${item.type} (${inserted.rows[0].id})`);
  }

  const forms = [
    {
      emp: staff.vincent,
      type: 'Reference Letter',
      reason: `Needed for a part-time postgraduate application ${SEED}`,
      details: {},
      status: 'pending',
      created: '2026-08-14 10:12:00',
    },
    {
      emp: staff.frank,
      type: 'Employment Confirmation Letter',
      reason: `Bank requested confirmation for a mortgage ${SEED}`,
      details: {},
      status: 'approved',
      created: '2026-08-11 09:40:00',
      reviewed: '2026-08-12 15:05:00',
    },
    {
      emp: staff.kenneth,
      type: 'Salary Advance Request',
      reason: `School fees for the new term ${SEED}`,
      details: { amount: 2500 },
      status: 'pending',
      created: '2026-08-15 08:20:00',
    },
    {
      emp: staff.felix,
      type: 'Transfer Request',
      reason: `Requesting a move to the Kumasi support desk to be closer to family ${SEED}`,
      details: { from: 'Accra', to: 'Kumasi' },
      status: 'pending',
      created: '2026-08-13 16:48:00',
    },
    {
      emp: staff.william,
      type: 'Complaint/Grievance',
      reason: `Repeated late night call-outs without rest days. Asking HR to review the roster ${SEED}`,
      details: {},
      status: 'pending',
      created: '2026-08-16 19:10:00',
    },
    {
      emp: staff.samson,
      type: 'Salary Advance Request',
      reason: `Urgent medical bill ${SEED}`,
      details: { amount: 1800 },
      status: 'rejected',
      rejection: 'An advance was paid last month. Please wait until September payroll.',
      created: '2026-08-10 11:55:00',
      reviewed: '2026-08-11 12:00:00',
    },
  ];

  for (const item of forms) {
    await pool.query(
      `INSERT INTO hr_form_requests (
         user_id, employee_id, form_type, reason, details, status,
         rejection_reason, reviewed_by, reviewed_at, created_at
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)`,
      [
        item.emp.user_id,
        item.emp.id,
        item.type,
        item.reason,
        JSON.stringify(item.details),
        item.status,
        item.rejection || null,
        item.status === 'pending' ? null : hrId,
        item.reviewed || null,
        item.created,
      ]
    );
    console.log(`Form ${item.status}: ${item.emp.full_name} — ${item.type}`);
  }

  console.log(`\nAttendance rows: ${attendanceCount} (Mon 10 Aug – Fri 14 Aug 2026)`);
  console.log('Leave requests: 6 (2 approved, 3 pending, 1 rejected)');
  console.log('Form requests: 6 (1 approved, 4 pending, 1 rejected)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
