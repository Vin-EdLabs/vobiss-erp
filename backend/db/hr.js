import bcrypt from 'bcrypt';

export const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Unpaid'];
export const DEFAULT_LEAVE_BALANCES = {
  Annual: 21,
  Sick: 14,
  Emergency: 5,
  Maternity: 84,
  Paternity: 5,
  Unpaid: 0,
};

export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract'];
export const EMPLOYEE_STATUSES = ['active', 'inactive', 'suspended'];
export const DOCUMENT_CATEGORIES = ['Contract', 'ID', 'Certificate', 'Offer Letter', 'Warning Letter', 'Other'];
export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Half-day', 'Leave'];
export const PAYROLL_STATUSES = ['Draft', 'Approved', 'Paid'];

export async function initHrSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_employees (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      photo_url TEXT,
      department TEXT,
      position TEXT,
      employment_type TEXT NOT NULL DEFAULT 'full-time',
      start_date DATE,
      contract_end_date DATE,
      basic_salary NUMERIC(12, 2) DEFAULT 0,
      allowances NUMERIC(12, 2) DEFAULT 0,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      line_manager TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_leave_applications (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT,
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_leave_balances (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      leave_type TEXT NOT NULL,
      year INTEGER NOT NULL,
      total_days INTEGER NOT NULL DEFAULT 0,
      used_days INTEGER NOT NULL DEFAULT 0,
      UNIQUE (employee_id, leave_type, year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_payroll (
      id SERIAL PRIMARY KEY,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      UNIQUE (month, year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_payroll_items (
      id SERIAL PRIMARY KEY,
      payroll_id INTEGER NOT NULL REFERENCES hr_payroll(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      basic_salary NUMERIC(12, 2) DEFAULT 0,
      allowances NUMERIC(12, 2) DEFAULT 0,
      gross NUMERIC(12, 2) DEFAULT 0,
      ssnit_employer NUMERIC(12, 2) DEFAULT 0,
      ssnit_employee NUMERIC(12, 2) DEFAULT 0,
      taxable_income NUMERIC(12, 2) DEFAULT 0,
      paye NUMERIC(12, 2) DEFAULT 0,
      net_pay NUMERIC(12, 2) DEFAULT 0,
      UNIQUE (payroll_id, employee_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_attendance (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'Present',
      clock_in TIME,
      clock_out TIME,
      overtime_hours NUMERIC(6, 2) DEFAULT 0,
      notes TEXT,
      recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (employee_id, date)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_documents (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      document_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      file_url TEXT,
      notes TEXT,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_activity (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      employee_id INTEGER REFERENCES hr_employees(id) ON DELETE SET NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS allowances NUMERIC(12, 2) DEFAULT 0`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS line_manager TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS location TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS suspension_reason TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS unsuspend_reason TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS unsuspended_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unsuspend_reason TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unsuspend_ack BOOLEAN DEFAULT TRUE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS unsuspended_at TIMESTAMPTZ`);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT`);
  await pool.query(`ALTER TABLE hr_payroll ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_leave_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES hr_employees(id) ON DELETE SET NULL,
      leave_type VARCHAR(50) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER NOT NULL,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_form_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_id INTEGER REFERENCES hr_employees(id) ON DELETE SET NULL,
      form_type VARCHAR(100) NOT NULL,
      reason TEXT,
      details JSONB,
      status VARCHAR(20) DEFAULT 'pending',
      rejection_reason TEXT,
      reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMP,
      generated_file_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await pool.query(`ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
  await pool.query(`ALTER TABLE hr_form_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await pool.query(`ALTER TABLE hr_form_requests ADD COLUMN IF NOT EXISTS attachment_name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_settings (
      id SERIAL PRIMARY KEY,
      office_latitude DECIMAL(10, 8),
      office_longitude DECIMAL(11, 8),
      office_radius_meters INTEGER DEFAULT 100,
      office_name VARCHAR(255) DEFAULT 'Vobiss Office',
      expected_clock_in TIME DEFAULT '08:00:00',
      expected_clock_out TIME DEFAULT '17:00:00',
      updated_by INTEGER REFERENCES users(id),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO hr_settings (office_name, office_radius_meters, expected_clock_in, expected_clock_out)
    SELECT 'Vobiss Office', 100, '08:00:00', '17:00:00'
    WHERE NOT EXISTS (SELECT 1 FROM hr_settings)
  `);

  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_in_lat DECIMAL(10,8)`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_in_lng DECIMAL(11,8)`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_out_lat DECIMAL(10,8)`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_out_lng DECIMAL(11,8)`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_in_distance_meters INTEGER`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_out_distance_meters INTEGER`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS is_remote BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_in_time TIMESTAMP`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS clock_out_time TIMESTAMP`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE hr_attendance ADD COLUMN IF NOT EXISTS late_minutes INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE hr_payroll_items ADD COLUMN IF NOT EXISTS allowance_breakdown JSONB DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_name TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS bank_account TEXT`);
  await pool.query(`ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS ssnit_number TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_payroll_settings (
      id SERIAL PRIMARY KEY,
      ssnit_employee_rate DECIMAL(5,2) DEFAULT 5.5,
      ssnit_employer_rate DECIMAL(5,2) DEFAULT 13.0,
      tax_bands JSONB DEFAULT '[
        {"from":0,"to":490,"rate":0},
        {"from":490,"to":600,"rate":5},
        {"from":600,"to":730,"rate":10},
        {"from":730,"to":3730,"rate":17.5},
        {"from":3730,"to":20125,"rate":25},
        {"from":20125,"to":null,"rate":35}
      ]'::jsonb,
      allowance_types JSONB DEFAULT '[]'::jsonb,
      updated_by INTEGER,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO hr_payroll_settings (ssnit_employee_rate, ssnit_employer_rate)
    SELECT 5.5, 13.0
    WHERE NOT EXISTS (SELECT 1 FROM hr_payroll_settings)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_employee_allowances (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER REFERENCES hr_employees(id) ON DELETE CASCADE,
      allowance_name VARCHAR(100),
      allowance_type VARCHAR(20),
      value DECIMAL(10,2),
      taxable BOOLEAN DEFAULT true,
      effective_from DATE,
      effective_to DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export async function ensureLeaveBalances(pool, employeeId, year = new Date().getFullYear()) {
  for (const leaveType of LEAVE_TYPES) {
    await pool.query(
      `INSERT INTO hr_leave_balances (employee_id, leave_type, year, total_days, used_days)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (employee_id, leave_type, year) DO NOTHING`,
      [employeeId, leaveType, year, DEFAULT_LEAVE_BALANCES[leaveType] ?? 0]
    );
  }
}

export async function logHrActivity(pool, { kind, message, employeeId = null, meta = null }) {
  await pool.query(
    `INSERT INTO hr_activity (kind, message, employee_id, meta) VALUES ($1, $2, $3, $4)`,
    [kind, message, employeeId, meta ? JSON.stringify(meta) : null]
  );
}

export async function seedHrDemo(pool) {
  const existingHr = await pool.query(`SELECT id FROM users WHERE LOWER(username) = 'hr' AND deleted_at IS NULL`);
  let hrUserId;
  if (existingHr.rowCount === 0) {
    const hashed = await bcrypt.hash('@vobisshr', 10);
    const created = await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password, role, main_role, roles, units, unit, position)
       VALUES ($1, $2, $3, $4, $5, 'hr', 'hr', jsonb_build_array('hr'), '[]'::jsonb, 'hr', 'HR Manager')
       RETURNING id`,
      ['HR', 'Admin', 'hr', 'hr@vobiss.com', hashed]
    );
    hrUserId = created.rows[0].id;
    console.log('Default HR user created (username: hr)');
  } else {
    hrUserId = existingHr.rows[0].id;
    await pool.query(
      `UPDATE users SET role = 'hr', main_role = 'hr', roles = jsonb_build_array('hr'), unit = 'hr', position = 'HR Manager'
       WHERE id = $1`,
      [hrUserId]
    );
  }

  const demoEmails = [
    'kwame.asante@vobiss.com',
    'akosua.darko@vobiss.com',
    'yaw.mensah@vobiss.com',
    'abena.owusu@vobiss.com',
    'kofi.adjei@vobiss.com',
    'efua.boateng@vobiss.com',
    'nana.boateng@vobiss.com',
    'kojo.owusu@vobiss.com',
    'adwoa.sarpong@vobiss.com',
  ];
  const found = await pool.query(
    `SELECT id FROM hr_employees
     WHERE LOWER(TRIM(email)) = ANY($1::text[])
        OR (LOWER(TRIM(email)) = 'hr@vobiss.com' AND full_name ILIKE 'Ama Mensah')`,
    [demoEmails]
  );
  const ids = found.rows.map((r) => r.id);
  if (ids.length) {
    await pool.query(`DELETE FROM hr_leave_requests WHERE employee_id = ANY($1::int[])`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM hr_form_requests WHERE employee_id = ANY($1::int[])`, [ids]).catch(() => {});
    await pool.query(`DELETE FROM hr_employees WHERE id = ANY($1::int[])`, [ids]);
    console.log(`Removed ${ids.length} HR demo employee record(s)`);
  }
  await pool.query(`DELETE FROM hr_documents WHERE notes ILIKE 'Seeded placeholder%'`).catch(() => {});
  await pool.query(`DELETE FROM hr_payroll p WHERE NOT EXISTS (SELECT 1 FROM hr_payroll_items i WHERE i.payroll_id = p.id)`).catch(() => {});
  await pool.query(
    `DELETE FROM hr_activity
     WHERE message ~* 'Kwame Asante|Akosua Darko|Yaw Mensah|Abena Owusu|Kofi Adjei|Efua Boateng|Nana Boateng|Kojo Owusu|Adwoa Sarpong|Ama Mensah'
        OR (employee_id IS NULL AND kind IN ('employee_added', 'leave_recorded', 'payslip_generated'))`
  ).catch(() => {});
  return { seeded: false, cleaned: ids.length, hrUserId };
}
