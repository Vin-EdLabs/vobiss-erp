// backend/db/overtime.js — Overtime Payment Request & Authorization schema.

export async function initOvertimeSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_requests (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES users(id),
      staff_name TEXT NOT NULL,
      department TEXT,
      job_title TEXT,
      contact_number TEXT,
      ot_category VARCHAR(30) NOT NULL CHECK (ot_category IN ('emergency_fault','planned_maintenance','weekend_support','public_holiday_support')),
      ot_rate_type VARCHAR(30) NOT NULL DEFAULT 'standard' CHECK (ot_rate_type IN ('standard','weekend','public_holiday','special_approval')),
      normal_shift_hours TEXT,
      total_ot_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
      employee_signature TEXT,
      declaration_date DATE,
      supervisor_id INTEGER REFERENCES users(id),
      manager_id INTEGER REFERENCES users(id),
      current_stage VARCHAR(20) NOT NULL DEFAULT 'supervisor' CHECK (current_stage IN ('supervisor','manager','hr','finance','paid','declined','cancelled')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','declined','cancelled')),
      declined_reason TEXT,
      declined_by_stage VARCHAR(20),
      amount_paid NUMERIC(10,2),
      payment_method VARCHAR(20) CHECK (payment_method IN ('cash','transfer','mobile_money')),
      company VARCHAR(20),
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_request_tickets (
      id SERIAL PRIMARY KEY,
      ot_request_id INTEGER NOT NULL REFERENCES ot_requests(id) ON DELETE CASCADE,
      ticket_type VARCHAR(20) NOT NULL CHECK (ticket_type IN ('fault_ticket','work_order')),
      ticket_ref TEXT,
      ticket_id INTEGER,
      site_id INTEGER,
      site_name TEXT,
      region TEXT,
      digital_address TEXT,
      client_id INTEGER,
      client_name TEXT,
      ot_date DATE NOT NULL,
      day_type VARCHAR(20) NOT NULL CHECK (day_type IN ('weekday','weekend','public_holiday')),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      hours_worked NUMERIC(4,2) NOT NULL DEFAULT 0,
      work_summary TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Client/Site standardization — these columns were added after ot_request_tickets already
  // existed in some deployments, so add them idempotently rather than relying on CREATE TABLE.
  await pool.query(`ALTER TABLE ot_request_tickets ADD COLUMN IF NOT EXISTS site_id INTEGER;`);
  await pool.query(`ALTER TABLE ot_request_tickets ADD COLUMN IF NOT EXISTS client_id INTEGER;`);
  await pool.query(`ALTER TABLE ot_request_tickets ADD COLUMN IF NOT EXISTS client_name TEXT;`);
  // Snapshot of the submitter's tier at submission time — a Supervisor's own OT skips the
  // Supervisor stage and goes straight to Manager (same principle as the Leave flow), so the
  // request needs to remember which stages actually apply to it.
  await pool.query(`ALTER TABLE ot_requests ADD COLUMN IF NOT EXISTS submitter_tier VARCHAR(20);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_request_documents (
      id SERIAL PRIMARY KEY,
      ot_request_id INTEGER NOT NULL REFERENCES ot_requests(id) ON DELETE CASCADE,
      ot_request_ticket_id INTEGER REFERENCES ot_request_tickets(id) ON DELETE CASCADE,
      document_type VARCHAR(30) NOT NULL DEFAULT 'other' CHECK (document_type IN ('attendance_log','call_out_log','fault_ticket','maintenance_report','supervisor_approval','other')),
      other_label TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      uploaded_by TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ot_request_history (
      id SERIAL PRIMARY KEY,
      ot_request_id INTEGER NOT NULL REFERENCES ot_requests(id) ON DELETE CASCADE,
      stage VARCHAR(20) NOT NULL CHECK (stage IN ('submitted','supervisor','manager','hr','finance')),
      actor_id INTEGER REFERENCES users(id),
      actor_name TEXT,
      action VARCHAR(20) NOT NULL CHECK (action IN ('submitted','approved','declined','paid')),
      reason TEXT,
      amount_paid NUMERIC(10,2),
      payment_method VARCHAR(20) CHECK (payment_method IN ('cash','transfer','mobile_money')),
      acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      waiting_duration_minutes INTEGER
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ot_requests_staff ON ot_requests(staff_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ot_requests_stage ON ot_requests(current_stage);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ot_tickets_request ON ot_request_tickets(ot_request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ot_documents_request ON ot_request_documents(ot_request_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ot_history_request ON ot_request_history(ot_request_id);`);
}
