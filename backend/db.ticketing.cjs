// src/db.ticketing.cjs
// ✅ Full Ticketing System — Now includes Approvers in assignment & visibility
// Updated: January 09, 2026

let pool = null;
let insertAuditLog = null;
let bcrypt = null;

async function loadDbModule() {
  if (pool === null) {
    const dbModule = await import('./db.js');
    pool = dbModule.pool || dbModule.default?.pool || dbModule.default;
    insertAuditLog = dbModule.insertAuditLog || dbModule.default?.insertAuditLog;

    if (!pool) {
      throw new Error('❌ Failed to load "pool" from db.js.');
    }
    if (!insertAuditLog) {
      console.warn('⚠️ insertAuditLog not found — audit logging skipped.');
      insertAuditLog = () => {};
    }

    try {
      bcrypt = (await import('bcrypt')).default;
    } catch {
      bcrypt = (await import('bcryptjs')).default;
    }
  }
}

// Initialize Projects & Customers
async function initTicketingDB() {
  await loadDbModule();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        project_name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        project_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        customer_code VARCHAR(50),
        pin_hash TEXT,
        login_token VARCHAR(255),
        last_active TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP,
        CONSTRAINT unique_email_per_project UNIQUE (project_id, contact_email)
      );
    `);

    // Backfill missing columns
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_code') THEN
          ALTER TABLE projects ADD COLUMN project_code VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_code') THEN
          ALTER TABLE customers ADD COLUMN customer_code VARCHAR(50);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'pin_hash') THEN
          ALTER TABLE customers ADD COLUMN pin_hash TEXT;
        END IF;
      END $$;
    `);

    // Backfill codes
    await pool.query(`
      UPDATE projects SET project_code = 'PROJ-' || LPAD(id::TEXT, 5, '0') WHERE project_code IS NULL OR project_code = '';
    `);
    await pool.query(`
      UPDATE customers SET customer_code = 'CUST-' || LPAD(id::TEXT, 5, '0') WHERE customer_code IS NULL OR customer_code = '';
    `);

    // Enforce uniqueness
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE projects ALTER COLUMN project_code SET NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_code_key') THEN
          ALTER TABLE projects ADD CONSTRAINT projects_project_code_key UNIQUE (project_code);
        END IF;

        ALTER TABLE customers ALTER COLUMN customer_code SET NOT NULL;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_code_key') THEN
          ALTER TABLE customers ADD CONSTRAINT customers_customer_code_key UNIQUE (customer_code);
        END IF;
      END $$;
    `);

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(project_code);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_project_id ON customers(project_id);`);

  } catch (error) {
    console.error('❌ initTicketingDB failed:', error.message);
    throw error;
  }
}

// Initialize Tickets & Timeline
async function initTicketTables() {
  await loadDbModule();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        ticket_id VARCHAR(20) UNIQUE NOT NULL,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        description TEXT NOT NULL,
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(30) NOT NULL DEFAULT 'NEW',
        source VARCHAR(20) NOT NULL DEFAULT 'portal',
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by_id INTEGER NOT NULL,
        created_by_type VARCHAR(20) NOT NULL CHECK (created_by_type IN ('customer', 'staff')),
        attachments JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP
      );
    `);

    // Add attachments column if it doesn't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'tickets' AND column_name = 'attachments'
        ) THEN
          ALTER TABLE tickets ADD COLUMN attachments JSONB;
        END IF;
      END $$;
    `);

    // Ensure ticket_id
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_id') THEN
          ALTER TABLE tickets ADD COLUMN ticket_id VARCHAR(20);
        END IF;

        UPDATE tickets SET ticket_id = 'TCK-' || LPAD(id::TEXT, 6, '0') WHERE ticket_id IS NULL OR ticket_id = '';
        ALTER TABLE tickets ALTER COLUMN ticket_id SET NOT NULL;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_ticket_id_key') THEN
          ALTER TABLE tickets ADD CONSTRAINT tickets_ticket_id_key UNIQUE (ticket_id);
        END IF;
      END $$;
    `);

    // Timeline Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_timeline (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        action VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        visibility VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal')),
        actor_id INTEGER NOT NULL,
        actor_role VARCHAR(30) NOT NULL,
        actor_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ticket_timeline' AND column_name = 'actor_name'
        ) THEN
          ALTER TABLE ticket_timeline ADD COLUMN actor_name VARCHAR(255);
        END IF;
      END $$;
    `);

    // Source constraint
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'tickets_source_check' 
          AND conrelid = 'tickets'::regclass
        ) THEN
          ALTER TABLE tickets 
          ADD CONSTRAINT tickets_source_check 
          CHECK (source IN ('portal', 'email', 'phone', 'staff'));
        END IF;
      END $$;
    `);

    // Full status constraint including IN_PROGRESS
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'tickets_status_check' 
          AND conrelid = 'tickets'::regclass
        ) THEN
          ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
        END IF;

        ALTER TABLE tickets 
        ADD CONSTRAINT tickets_status_check 
        CHECK (
          status IN (
            'NEW',
            'OPEN',
            'IN_PROGRESS',
            'ON_HOLD',
            'RESOLVED',
            'CLOSED'
          )
        );
      END $$;
    `);


    // Remove restrictive actor_role constraint and replace with loose one
await pool.query(`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'ticket_timeline_actor_role_check' 
      AND conrelid = 'ticket_timeline'::regclass
    ) THEN
      ALTER TABLE ticket_timeline DROP CONSTRAINT ticket_timeline_actor_role_check;
    END IF;

    -- Allow any non-empty role
    ALTER TABLE ticket_timeline 
    ADD CONSTRAINT ticket_timeline_actor_role_check 
    CHECK (actor_role IS NOT NULL AND TRIM(actor_role) <> '');
  END $$;
`);

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON ticket_timeline(ticket_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);`);

    // Escalation matrix columns
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'escalation_stage') THEN
          ALTER TABLE tickets ADD COLUMN escalation_stage VARCHAR(40) DEFAULT 'noc';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'stage_entered_at') THEN
          ALTER TABLE tickets ADD COLUMN stage_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'stage_accepted_at') THEN
          ALTER TABLE tickets ADD COLUMN stage_accepted_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'escalation_due_at') THEN
          ALTER TABLE tickets ADD COLUMN escalation_due_at TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'auto_escalation_enabled') THEN
          ALTER TABLE tickets ADD COLUMN auto_escalation_enabled BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_escalation ON tickets(escalation_stage, escalation_due_at);`);

    // Response / resolution SLA deadlines (from Configuration → ticket_sla)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'response_due_at') THEN
          ALTER TABLE tickets ADD COLUMN response_due_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'resolution_due_at') THEN
          ALTER TABLE tickets ADD COLUMN resolution_due_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'first_response_at') THEN
          ALTER TABLE tickets ADD COLUMN first_response_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'custom_sla') THEN
          ALTER TABLE tickets ADD COLUMN custom_sla BOOLEAN DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'sla_monitoring') THEN
          ALTER TABLE tickets ADD COLUMN sla_monitoring BOOLEAN DEFAULT true;
        END IF;
      END $$;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_response_due ON tickets(response_due_at) WHERE response_due_at IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_resolution_due ON tickets(resolution_due_at) WHERE resolution_due_at IS NOT NULL`);

    // Ticket tags / labels
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        color VARCHAR(7) NOT NULL DEFAULT '#1A56DB',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_tag_map (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES ticket_tags(id) ON DELETE CASCADE,
        added_by INTEGER REFERENCES users(id),
        added_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (ticket_id, tag_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_tag_map_tag ON ticket_tag_map(tag_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ticket_tag_map_ticket ON ticket_tag_map(ticket_id)`);
    await pool.query(`
      INSERT INTO ticket_tags (name, color)
      VALUES
        ('Outage', '#E02424'),
        ('Critical', '#D03801')
      ON CONFLICT (name) DO NOTHING
    `);

    // Customer organization: location + optional project
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'location') THEN
          ALTER TABLE customers ADD COLUMN location VARCHAR(255);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers' AND column_name = 'project_id' AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE customers ALTER COLUMN project_id DROP NOT NULL;
        END IF;
      END $$;
    `);

    // updated_at trigger
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
      CREATE TRIGGER update_tickets_updated_at
      BEFORE UPDATE ON tickets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('✅ Tickets & Timeline tables ready — full status + approver support enabled.');

    try {
      const { ensureClientSitesSchema } = await import('./db.clients.cjs');
      await ensureClientSitesSchema();
    } catch (e) {
      console.error('⚠️ Client/sites schema init:', e.message);
    }
  } catch (error) {
    console.error('❌ initTicketTables failed:', error.message);
    throw error;
  }
}

// PIN Utilities
function generatePIN() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

async function hashPIN(pin) {
  const saltRounds = 12;
  return await bcrypt.hash(pin, saltRounds);
}

// =============== PROJECTS ===============
async function createProject(projectName, description = '', userId, ip = 'unknown') {
  await loadDbModule();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const codeRes = await client.query(`
      SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects
    `);
    const project_code = codeRes.rows[0].next_code;

    const res = await client.query(
      `INSERT INTO projects (project_name, description, project_code)
       VALUES ($1, $2, $3)
       RETURNING id, project_name, description, project_code, created_at`,
      [projectName.trim(), description?.trim() || null, project_code]
    );
    const project = res.rows[0];

    await insertAuditLog(client, userId, 'create_project', ip, {
      project_id: project.id,
      project_code,
      project_name: project.project_name
    });
    await client.query('COMMIT');
    return project;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getProjects() {
  await loadDbModule();
  const res = await pool.query(`
    SELECT id, project_name, description, project_code, created_at
    FROM projects
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC
  `);
  return res.rows;
}

// =============== CUSTOMERS ===============
async function ensureDefaultCustomerProject(client) {
  const name = 'General Organizations';
  const existing = await client.query(
    `SELECT id, project_name, project_code FROM projects WHERE project_name = $1 AND deleted_at IS NULL LIMIT 1`,
    [name]
  );
  if (existing.rows[0]) return existing.rows[0];
  const codeRes = await client.query(
    `SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects`
  );
  const ins = await client.query(
    `INSERT INTO projects (project_name, description, project_code)
     VALUES ($1, $2, $3) RETURNING id, project_name, project_code`,
    [name, 'Default project for customer organizations without assignment', codeRes.rows[0].next_code]
  );
  return ins.rows[0];
}

async function createCustomer(
  customerName,
  contactEmail = null,
  contactPhone = null,
  projectId = null,
  userId,
  ip = 'unknown',
  location = null
) {
  await loadDbModule();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let project_name;
    let project_code;
    let resolvedProjectId = projectId;

    if (resolvedProjectId) {
      const projRes = await client.query(
        `SELECT id, project_name, project_code FROM projects WHERE id = $1 AND deleted_at IS NULL`,
        [resolvedProjectId]
      );
      if (projRes.rowCount === 0) throw new Error('Project not found.');
      project_name = projRes.rows[0].project_name;
      project_code = projRes.rows[0].project_code;
      resolvedProjectId = projRes.rows[0].id;
    } else {
      const def = await ensureDefaultCustomerProject(client);
      resolvedProjectId = def.id;
      project_name = def.project_name;
      project_code = def.project_code;
    }

    const custCodeRes = await client.query(`
      SELECT 'CUST-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM customers
    `);
    const customer_code = custCodeRes.rows[0].next_code;
    const pin = generatePIN();
    const pin_hash = await hashPIN(pin);

    const res = await client.query(
      `INSERT INTO customers
        (customer_name, contact_email, contact_phone, location, project_id, customer_code, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, customer_name, contact_email, contact_phone, location, project_id, customer_code, created_at`,
      [
        customerName.trim(),
        contactEmail?.trim() || null,
        contactPhone?.trim() || null,
        location?.trim() || null,
        resolvedProjectId,
        customer_code,
        pin_hash,
      ]
    );
    const customer = res.rows[0];

    await insertAuditLog(client, userId, 'create_customer', ip, {
      customer_id: customer.id,
      customer_code: customer.customer_code,
      pin_generated: true,
      project_code,
      project_name
    });

    await client.query('COMMIT');
    return { ...customer, project_name, project_code, pin };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setCustomerPIN(customerId, newPIN = null) {
  await loadDbModule();
  const pin = newPIN || generatePIN();
  const pin_hash = await hashPIN(pin);

  const res = await pool.query(
    `UPDATE customers SET pin_hash = $1 WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, customer_code`,
    [pin_hash, customerId]
  );

  if (res.rowCount === 0) throw new Error('Customer not found.');
  return { customer_code: res.rows[0].customer_code, pin };
}

async function authenticateCustomer(customerCode, pin) {
  await loadDbModule();

  const res = await pool.query(
    `SELECT id, customer_name, customer_code, project_id, contact_email, contact_phone, created_at, pin_hash
     FROM customers WHERE customer_code = $1 AND deleted_at IS NULL`,
    [customerCode.toUpperCase()]
  );

  if (res.rowCount === 0) return null;

  const customer = res.rows[0];
  if (!customer.pin_hash) return null;

  const match = await bcrypt.compare(pin, customer.pin_hash);
  return match ? customer : null;
}

async function getCustomerById(customerId) {
  await loadDbModule();
  const res = await pool.query(
    `SELECT c.id, c.customer_name, c.customer_code, c.contact_email, c.contact_phone,
            c.project_id, p.project_name, p.project_code, c.created_at
     FROM customers c
     LEFT JOIN projects p ON c.project_id = p.id AND p.deleted_at IS NULL
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [customerId]
  );
  return res.rows[0] || null;
}

/** Default org project used when a client has no project_id (ticket FK requires one). */
async function ensureDefaultOrgProjectId(client = null) {
  await loadDbModule();
  const q = client || pool;
  const def = await q.query(
    `SELECT id FROM projects WHERE project_name = 'General Organizations' AND deleted_at IS NULL LIMIT 1`
  );
  if (def.rows[0]) return def.rows[0].id;
  const codeRes = await q.query(
    `SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects`
  );
  const ins = await q.query(
    `INSERT INTO projects (project_name, description, project_code)
     VALUES ($1, $2, $3) RETURNING id`,
    ['General Organizations', 'Default project for client organizations', codeRes.rows[0].next_code]
  );
  return ins.rows[0].id;
}
async function getCustomers(projectId = null) {
  await loadDbModule();
  let query = `
    SELECT 
      c.id, 
      c.customer_name, 
      c.customer_code, 
      c.contact_email, 
      c.contact_phone,
      c.location,
      c.project_id, 
      p.project_name, 
      p.project_code, 
      c.created_at
      -- Do NOT add c.pin here – plain PIN is not stored in DB
    FROM customers c 
    JOIN projects p ON c.project_id = p.id
    WHERE c.deleted_at IS NULL 
      AND p.deleted_at IS NULL
  `;
  const params = [];
  if (projectId !== null) {
    query += ` AND c.project_id = $1`;
    params.push(projectId);
  }
  query += ` ORDER BY c.created_at DESC`;
  const res = await pool.query(query, params);
  return res.rows;
}

/** Get or create project + customer for inbound email senders not in the system. Returns { customerId, projectId, customerName }. */
async function getOrCreateEmailSupportCustomer(senderEmail, senderName = null) {
  await loadDbModule();
  const client = await pool.connect();
  const projectName = process.env.DEFAULT_IMAP_PROJECT_NAME || 'Email Support';
  const customerName = (senderName && senderName.trim()) ? senderName.trim() : senderEmail;

  let systemUserId = null;
  const userRes = await client.query(`SELECT id FROM users WHERE (role = 'superadmin' OR main_role = 'superadmin') AND deleted_at IS NULL LIMIT 1`);
  if (userRes.rows[0]) systemUserId = userRes.rows[0].id;

  try {

    let projectId;
    const projRes = await client.query(
      `SELECT id FROM projects WHERE project_name = $1 AND deleted_at IS NULL LIMIT 1`,
      [projectName]
    );
    if (projRes.rows[0]) {
      projectId = projRes.rows[0].id;
    } else {
      const newProj = await createProject(projectName, 'Default project for tickets created from inbound email', systemUserId, 'IMAP');
      projectId = newProj.id;
    }

    let customer = null;
    const custRes = await client.query(
      `SELECT id, customer_name FROM customers WHERE project_id = $1 AND LOWER(contact_email) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
      [projectId, senderEmail]
    );
    if (custRes.rows[0]) {
      customer = { id: custRes.rows[0].id, customer_name: custRes.rows[0].customer_name };
    } else {
      const newCust = await createCustomer(customerName, senderEmail, null, projectId, systemUserId, 'IMAP');
      customer = { id: newCust.id, customer_name: newCust.customer_name };
    }

    return { customerId: customer.id, projectId, customerName: customer.customer_name };
  } finally {
    client.release();
  }
}

// =============== TICKETS CORE ===============
async function generateTicketId() {
  await loadDbModule();
  const res = await pool.query(`
    SELECT 'TCK-' || LPAD(
      (COALESCE(MAX(CAST(SUBSTRING(ticket_id FROM 5) AS INTEGER)), 0) + 1)::TEXT, 6, '0'
    ) AS next_id FROM tickets
  `);
  return res.rows[0].next_id;
}

async function createTicket(
  {
    project_id,
    customer_id,
    title,
    category = 'general',
    description,
    priority = 'normal',
    status = 'NEW',
    attachments = null,
    source: sourceOverride = null,
    site_id = null,
  },
  assigned_to = null,
  created_by_id,
  ip = 'unknown',
  created_by_type = 'customer',
  creator_role = 'Customer',
  route_to_unit = null
) {
  await loadDbModule();
  const client = await pool.connect();
  const source = sourceOverride || (created_by_type === 'staff' ? 'staff' : 'portal');

  try {
    await client.query('BEGIN');

    let resolvedProjectId = project_id ? Number(project_id) : null;
    if (!resolvedProjectId && customer_id) {
      const custProj = await client.query(
        `SELECT project_id FROM customers WHERE id = $1 AND deleted_at IS NULL`,
        [customer_id]
      );
      resolvedProjectId = custProj.rows[0]?.project_id ? Number(custProj.rows[0].project_id) : null;
    }
    if (!resolvedProjectId) {
      resolvedProjectId = await ensureDefaultOrgProjectId(client);
      if (customer_id) {
        await client.query(
          `UPDATE customers SET project_id = COALESCE(project_id, $1), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [resolvedProjectId, customer_id]
        );
      }
    }

    const ticket_id = await generateTicketId();

    let creator_name = 'Unknown';
    if (created_by_type === 'staff') {
      const userRes = await client.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [created_by_id]);
      if (userRes.rows[0]) {
        creator_name = `${userRes.rows[0].first_name || ''} ${userRes.rows[0].last_name || ''}`.trim() || 'Staff';
      }
    } else {
      const custRes = await client.query(`SELECT customer_name FROM customers WHERE id = $1`, [customer_id]);
      if (custRes.rows[0]) creator_name = custRes.rows[0].customer_name;
    }

    // Handle attachments - convert string to JSONB if needed
    let attachmentsJsonb = null;
    if (attachments) {
      if (typeof attachments === 'string') {
        try {
          attachmentsJsonb = JSON.parse(attachments);
        } catch {
          attachmentsJsonb = attachments;
        }
      } else {
        attachmentsJsonb = attachments;
      }
    }

    const ticketRes = await client.query(
      `INSERT INTO tickets (
         ticket_id, project_id, customer_id, site_id, title, category, description,
         priority, status, source, assigned_to, created_by_id, created_by_type, attachments
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, ticket_id, title, status, priority, category, source, created_at, attachments, assigned_to, site_id`,
      [
        ticket_id,
        resolvedProjectId,
        customer_id,
        site_id ? Number(site_id) : null,
        title,
        category,
        description,
        priority,
        status,
        source,
        assigned_to,
        created_by_id,
        created_by_type,
        attachmentsJsonb ? JSON.stringify(attachmentsJsonb) : null,
      ]
    );
    const ticket = ticketRes.rows[0];

    const creationMessage = source === 'email'
      ? `Ticket created from email: ${creator_name}`
      : created_by_type === 'customer'
        ? 'Ticket submitted via portal'
        : `Ticket created by ${creator_role}: ${creator_name}`;

    await client.query(
      `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ticket.id, 'CREATED', creationMessage, 'public', created_by_id, creator_role, creator_name]
    );

    if (assigned_to) {
      const assigneeRes = await client.query(`SELECT first_name, last_name, role FROM users WHERE id = $1`, [assigned_to]);
      const assignee = assigneeRes.rows[0];
      const assigneeName = assignee ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || 'Team Member' : 'Unknown';
      const assigneeRole = assignee?.role?.toUpperCase() || 'NOC';

      await client.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'ASSIGNED', $2, 'public', $3, $4, $5)`,
        [ticket.id, `Assigned to ${assigneeName} (${assigneeRole})`, created_by_id, creator_role, creator_name]
      );
    }

    const { applyNewTicketRouting } = await import('./ticketEscalation.js');
    await applyNewTicketRouting(client, ticket.id, ticket.ticket_id, created_by_id, route_to_unit);

    try {
      const { getWorkflowConfig } = await import('./db.js');
      const { computeSlaDeadlines, formatSlaDuration } = await import('./ticketSlaConfig.js');
      const wf = await getWorkflowConfig();
      const sla = computeSlaDeadlines(wf.ticket_sla, priority);
      await client.query(
        `UPDATE tickets SET
           response_due_at = $1,
           resolution_due_at = $2,
           sla_monitoring = $3,
           custom_sla = false,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [sla.response_due_at, sla.resolution_due_at, sla.monitoring_enabled, ticket.id]
      );
      ticket.response_due_at = sla.response_due_at;
      ticket.resolution_due_at = sla.resolution_due_at;
      ticket.sla_monitoring = sla.monitoring_enabled;
      await client.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'SLA_SET', $2, 'internal', $3, $4, $5)`,
        [
          ticket.id,
          `SLA applied for ${sla.priority_key} priority — first response: ${formatSlaDuration(
            sla.rule.first_response_value,
            sla.rule.first_response_unit
          )}, resolution: ${formatSlaDuration(sla.rule.resolution_value, sla.rule.resolution_unit)}${
            sla.monitoring_enabled ? '' : ' (monitoring off)'
          }`,
          created_by_id,
          creator_role,
          creator_name,
        ]
      );
    } catch (slaErr) {
      console.warn('[ticket-sla] apply on create failed:', slaErr.message);
    }

    await client.query('COMMIT');

    // Audit after commit — customer IDs are not users (FK), so only log staff creates
    if (created_by_type === 'staff' && created_by_id && insertAuditLog) {
      try {
        await insertAuditLog(created_by_id, 'create_ticket', ip, { ticket_id: ticket.ticket_id });
      } catch (_) {
        /* non-blocking */
      }
    }

    return ticket;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateTicketStaff(
  ticketId,
  { status, assigned_to, comment, visibility = 'public', isEscalation = false },
  actor_id,
  actor_role = 'CX',
  ip = 'unknown'
) {
  await loadDbModule();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get ticket and customer info for email
    const ticketInfoRes = await client.query(`
      SELECT t.id, t.ticket_id, t.status AS old_status, t.customer_id,
             c.customer_name, c.customer_code, c.contact_email
      FROM tickets t
      JOIN customers c ON t.customer_id = c.id
      WHERE t.ticket_id = $1
    `, [ticketId]);
    
    if (ticketInfoRes.rowCount === 0) throw new Error('Ticket not found');
    const ticketInfo = ticketInfoRes.rows[0];
    const internalId = ticketInfo.id;
    const oldStatus = ticketInfo.status;

    const actorRes = await client.query(`SELECT first_name, last_name FROM users WHERE id = $1`, [actor_id]);
    const actorName = actorRes.rows[0]
      ? `${actorRes.rows[0].first_name || ''} ${actorRes.rows[0].last_name || ''}`.trim()
      : 'Staff';

    const updates = [];
    const values = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      values.push(status.toUpperCase());
      const statusUpper = status.toUpperCase();
      if (statusUpper === 'CLOSED' || statusUpper === 'RESOLVED') {
        updates.push(`closed_at = COALESCE(closed_at, NOW())`);
      }
    }
    if (assigned_to !== undefined) {
      updates.push(`assigned_to = $${idx++}`);
      values.push(assigned_to || null);
      if (assigned_to) {
        updates.push(`stage_accepted_at = COALESCE(stage_accepted_at, CURRENT_TIMESTAMP)`);
        updates.push(`escalation_due_at = NULL`);
      }
    }

    if (updates.length > 0) {
      values.push(ticketId);
      await client.query(
        `UPDATE tickets SET ${updates.join(', ')}, updated_at = NOW() WHERE ticket_id = $${idx}`,
        values
      );
    }

    let emailAction = null;
    let emailDetails = { status: status?.toUpperCase() || oldStatus };

    if (status) {
      const statusUpper = status.toUpperCase();
      const statusMsg = statusUpper === 'IN_PROGRESS' ? 'Escalated and in progress' : `Status updated to ${status.replace('_', ' ')}`;
      await client.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'STATUS_CHANGE', $2, $3, $4, $5, $6)`,
        [internalId, statusMsg, visibility, actor_id, actor_role, actorName]
      );

      // Determine email action
      if (statusUpper === 'IN_PROGRESS' && oldStatus !== 'IN_PROGRESS') {
        // Check if this is an acknowledgement (when comment mentions acknowledged)
        if (comment?.toLowerCase().includes('acknowledged')) {
          emailAction = 'acknowledge';
          emailDetails.assigneeName = actorName;
        } else {
          emailAction = 'escalate';
        }
      } else if (statusUpper === 'OPEN' && oldStatus !== 'OPEN') {
        // Check if this is an acknowledgement for OPEN status
        if (comment?.toLowerCase().includes('acknowledged')) {
          emailAction = 'acknowledge';
          emailDetails.assigneeName = actorName;
        }
      } else if (statusUpper === 'RESOLVED') {
        emailAction = 'resolve';
        emailDetails.resolutionNote = comment || 'Your ticket has been resolved by our support team.';
      } else if (statusUpper === 'CLOSED') {
        emailAction = 'close';
        emailDetails.closingNote = comment || 'Your ticket has been closed.';
      }
    }

    if (assigned_to !== undefined) {
      if (assigned_to) {
        const assigneeRes = await client.query(`SELECT first_name, last_name, role, email FROM users WHERE id = $1`, [assigned_to]);
        const assignee = assigneeRes.rows[0];
        const assigneeName = assignee ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || 'Team Member' : 'Unknown';
        const assigneeEmail = assignee?.email;
        const team = assignee?.role === 'ip' ? 'IP Engineering' : 
                     assignee?.role === 'approver' ? 'Approver' :
                     assignee?.role?.includes('field') ? 'Field Engineers' : 'NOC';

        // Use ESCALATED action if this is an escalation, otherwise ASSIGNED
        const actionType = isEscalation ? 'ESCALATED' : 'ASSIGNED';
        const actionMessage = isEscalation 
          ? `Escalated to ${team}: ${assigneeName}`
          : `Assigned to ${team}: ${assigneeName}`;
        
        await client.query(
          `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
           VALUES ($1, $2, $3, 'public', $4, $5, $6)`,
          [internalId, actionType, actionMessage, actor_id, actor_role, actorName]
        );

        // Send email to assignee (non-blocking - fire and forget)
        if (assigneeEmail) {
          // Don't await - let it run in background
          import('./emailService.js').then(({ sendTicketAssignmentEmail }) => {
            sendTicketAssignmentEmail(
              assigneeEmail,
              assigneeName,
              ticketInfo.ticket_id,
              ticketInfo.customer_name,
              ticketInfo.customer_code,
              isEscalation
            ).catch(emailError => {
              console.error('Failed to send assignment email to staff (non-blocking):', emailError.message);
            });
          }).catch(err => {
            console.error('Failed to load email service:', err);
          });
        }

        // Only send email to customer if not already sending another email
        if (!emailAction) {
          emailAction = isEscalation ? 'escalate' : 'assign';
          emailDetails.team = team;
          emailDetails.assigneeName = assigneeName;
        }
      } else {
        await client.query(
          `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
           VALUES ($1, 'UNASSIGNED', 'Assignment removed', 'internal', $2, $3, $4)`,
          [internalId, actor_id, actor_role, actorName]
        );
      }
    }

    if (comment) {
      await client.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'COMMENT', $2, $3, $4, $5, $6)`,
        [internalId, comment.trim(), visibility, actor_id, actor_role, actorName]
      );
      if (String(visibility).toLowerCase() === 'public') {
        await client.query(
          `UPDATE tickets SET first_response_at = COALESCE(first_response_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND first_response_at IS NULL`,
          [internalId]
        );
      }
    }

    // Enhanced audit log with assignment details
    const auditDetails = { ticket_id: ticketId };
    if (assigned_to !== undefined && assigned_to) {
      auditDetails.assigned_to = assigned_to;
      auditDetails.isEscalation = isEscalation;
    }
    if (status) {
      auditDetails.status_change = { from: oldStatus, to: status.toUpperCase() };
    }
    await insertAuditLog(client, actor_id, 'update_ticket', ip, auditDetails);
    await client.query('COMMIT');

    // Send email notification if needed (non-blocking - fire and forget)
    if (emailAction && ticketInfo.contact_email) {
      // Don't await - let it run in background
      import('./emailService.js').then(({ sendTicketEmail }) => {
        sendTicketEmail(
          ticketInfo.contact_email,
          ticketInfo.customer_name,
          ticketInfo.customer_code,
          ticketInfo.ticket_id,
          emailAction,
          emailDetails
        ).catch(emailError => {
          console.error('Failed to send ticket email notification (non-blocking):', emailError.message);
        });
      }).catch(err => {
        console.error('Failed to load email service:', err);
      });
    }

    const fullTicket = await getTicketByIdForStaff(ticketId);
    const timeline = await getTicketTimeline(ticketId);
    return { ticket: fullTicket, timeline };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getTicketById(ticketId, customerId = null) {
  await loadDbModule();
  let query = `
    SELECT t.id, t.ticket_id, t.title, t.category, t.description, t.priority, t.status,
           t.source, t.created_at, t.updated_at, t.closed_at, t.attachments,
           c.customer_name, c.customer_code, c.contact_email, c.contact_phone,
           p.project_name, p.project_code
    FROM tickets t
    JOIN customers c ON t.customer_id = c.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.ticket_id = $1
  `;
  const params = [ticketId];
  if (customerId !== null) {
    query += ` AND t.customer_id = $2`;
    params.push(customerId);
  }
  const res = await pool.query(query, params);
  return res.rows[0] || null;
}

function normalizeTicketRef(ticketRef) {
  if (ticketRef == null || ticketRef === '') return '';
  return String(ticketRef).trim();
}

/** Resolve public ticket code or numeric id → internal row */
async function resolveTicketRowRef(ticketRef) {
  await loadDbModule();
  const ref = normalizeTicketRef(ticketRef);
  if (!ref) return null;
  // Sargable on purpose: matching the bare `ticket_id`/`id` columns (instead of wrapping them in
  // TRIM()/::text) lets Postgres use their indexes instead of scanning every row.
  const res = await pool.query(
    `SELECT id, ticket_id FROM tickets WHERE ticket_id = $1 OR ($1 ~ '^[0-9]+$' AND id = $1::int) LIMIT 1`,
    [ref]
  );
  return res.rows[0] || null;
}

async function getTicketTimeline(ticketId) {
  await loadDbModule();
  const ref = normalizeTicketRef(ticketId);
  const row = await resolveTicketRowRef(ref);
  if (!row) return [];
  const res = await pool.query(`
    SELECT action, message, visibility, actor_role, actor_name, created_at
    FROM ticket_timeline
    WHERE ticket_id = $1
    ORDER BY created_at ASC
  `, [row.id]);
  return res.rows;
}

async function getTicketsForCustomer(customerId) {
  await loadDbModule();
  const res = await pool.query(
    `SELECT t.ticket_id, t.title, t.status, t.priority, t.created_at, t.updated_at,
            t.site_id, s.site_name, s.site_code, s.connection_status AS site_connection_status
     FROM tickets t
     LEFT JOIN customer_sites s ON s.id = t.site_id
     WHERE t.customer_id = $1
     ORDER BY t.created_at DESC`,
    [customerId]
  );
  return res.rows;
}

async function getAllTickets({ status, project_id, escalation_stage, tag_ids, tag_ids_any } = {}) {
  await loadDbModule();
  let query = `
    SELECT
      t.id AS row_id,
      t.ticket_id, t.title, t.category, t.priority, t.status, t.description,
      t.created_at, t.updated_at, t.source, t.attachments,
      t.escalation_stage, t.stage_entered_at, t.stage_accepted_at, t.escalation_due_at,
      t.chat_channel_id, t.assigned_to, t.site_id,
      p.project_name, p.project_code,
      c.customer_name, c.customer_code, c.contact_email, c.contact_phone, c.location AS customer_location,
      s.site_name, s.site_code, s.connection_status AS site_connection_status,
      u_assigned.first_name || ' ' || u_assigned.last_name AS assignee_name,
      u_assigned.role AS assignee_role,
      u_assigned.unit AS assignee_unit,
      u_assigned.position AS assignee_position,
      u_creator.first_name || ' ' || u_creator.last_name AS creator_name,
      t.created_by_type, t.created_by_id
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    JOIN customers c ON t.customer_id = c.id
    LEFT JOIN customer_sites s ON s.id = t.site_id
    LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
    LEFT JOIN users u_creator ON t.created_by_id = u_creator.id AND t.created_by_type = 'staff'
    WHERE 1=1
  `;
  const values = [];

  if (status) {
    values.push(status.toUpperCase());
    query += ` AND t.status = $${values.length}`;
  }
  if (project_id) {
    values.push(project_id);
    query += ` AND t.project_id = $${values.length}`;
  }
  if (escalation_stage) {
    values.push(escalation_stage);
    query += ` AND t.escalation_stage = $${values.length}`;
  }

  const andTagIds = Array.isArray(tag_ids) ? tag_ids.map(Number).filter((n) => Number.isFinite(n)) : [];
  const anyTagIds = Array.isArray(tag_ids_any) ? tag_ids_any.map(Number).filter((n) => Number.isFinite(n)) : [];

  if (andTagIds.length) {
    values.push(andTagIds);
    query += `
      AND (
        SELECT COUNT(DISTINCT tm.tag_id)::int
        FROM ticket_tag_map tm
        WHERE tm.ticket_id = t.id AND tm.tag_id = ANY($${values.length}::int[])
      ) = ${andTagIds.length}
    `;
  } else if (anyTagIds.length) {
    values.push(anyTagIds);
    query += `
      AND EXISTS (
        SELECT 1 FROM ticket_tag_map tm
        WHERE tm.ticket_id = t.id AND tm.tag_id = ANY($${values.length}::int[])
      )
    `;
  }

  query += ` ORDER BY t.created_at DESC`;
  const result = await pool.query(query, values);
  return attachTagsToTickets(result.rows);
}

async function listTicketTags() {
  await loadDbModule();
  const result = await pool.query(`
    SELECT
      tg.id, tg.name, tg.color, tg.created_by, tg.created_at,
      COUNT(tm.ticket_id)::int AS usage_count
    FROM ticket_tags tg
    LEFT JOIN ticket_tag_map tm ON tm.tag_id = tg.id
    GROUP BY tg.id
    ORDER BY LOWER(tg.name) ASC
  `);
  return result.rows;
}

async function createTicketTag({ name, color, created_by }) {
  await loadDbModule();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw Object.assign(new Error('Tag name is required'), { statusCode: 400 });
  if (cleanName.length > 50) throw Object.assign(new Error('Tag name must be 50 characters or less'), { statusCode: 400 });
  const hex = /^#[0-9A-Fa-f]{6}$/.test(String(color || '')) ? String(color) : '#1A56DB';
  try {
    const result = await pool.query(
      `INSERT INTO ticket_tags (name, color, created_by) VALUES ($1, $2, $3)
       RETURNING id, name, color, created_by, created_at`,
      [cleanName, hex, created_by || null]
    );
    return { ...result.rows[0], usage_count: 0 };
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('A tag with that name already exists'), { statusCode: 409 });
    throw err;
  }
}

async function updateTicketTag(id, { name, color }) {
  await loadDbModule();
  const fields = [];
  const values = [];
  if (name !== undefined) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw Object.assign(new Error('Tag name is required'), { statusCode: 400 });
    values.push(cleanName);
    fields.push(`name = $${values.length}`);
  }
  if (color !== undefined) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(String(color))) {
      throw Object.assign(new Error('Color must be a hex value like #1A56DB'), { statusCode: 400 });
    }
    values.push(String(color));
    fields.push(`color = $${values.length}`);
  }
  if (!fields.length) throw Object.assign(new Error('Nothing to update'), { statusCode: 400 });
  values.push(Number(id));
  try {
    const result = await pool.query(
      `UPDATE ticket_tags SET ${fields.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, color, created_by, created_at`,
      values
    );
    if (!result.rowCount) throw Object.assign(new Error('Tag not found'), { statusCode: 404 });
    const usage = await pool.query(`SELECT COUNT(*)::int AS n FROM ticket_tag_map WHERE tag_id = $1`, [id]);
    return { ...result.rows[0], usage_count: usage.rows[0]?.n || 0 };
  } catch (err) {
    if (err.statusCode) throw err;
    if (err.code === '23505') throw Object.assign(new Error('A tag with that name already exists'), { statusCode: 409 });
    throw err;
  }
}

async function deleteTicketTag(id) {
  await loadDbModule();
  const result = await pool.query(`DELETE FROM ticket_tags WHERE id = $1 RETURNING id`, [id]);
  if (!result.rowCount) throw Object.assign(new Error('Tag not found'), { statusCode: 404 });
  return true;
}

async function getTagsForTicketIds(ticketIds = []) {
  await loadDbModule();
  const ids = [...new Set(ticketIds.map(Number).filter((n) => Number.isFinite(n)))];
  if (!ids.length) return new Map();
  const result = await pool.query(
    `SELECT tm.ticket_id, tg.id, tg.name, tg.color
     FROM ticket_tag_map tm
     JOIN ticket_tags tg ON tg.id = tm.tag_id
     WHERE tm.ticket_id = ANY($1::int[])
     ORDER BY LOWER(tg.name)`,
    [ids]
  );
  const map = new Map();
  for (const row of result.rows) {
    const list = map.get(row.ticket_id) || [];
    list.push({ id: row.id, name: row.name, color: row.color });
    map.set(row.ticket_id, list);
  }
  return map;
}

async function attachTagsToTickets(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const ids = rows.map((r) => r.row_id || r.id).filter((id) => id != null);
  const tagMap = await getTagsForTicketIds(ids);
  return rows.map((r) => {
    const key = r.row_id || r.id;
    return { ...r, tags: tagMap.get(Number(key)) || [] };
  });
}

async function getTagsForTicket(ticketRef) {
  await loadDbModule();
  const row = await resolveTicketRowRef(ticketRef);
  if (!row) return [];
  const map = await getTagsForTicketIds([row.id]);
  return map.get(row.id) || [];
}

async function addTagsToTicket(ticketRef, tagIds, actor = {}) {
  await loadDbModule();
  const row = await resolveTicketRowRef(ticketRef);
  if (!row) throw Object.assign(new Error('Ticket not found'), { statusCode: 404 });
  const ids = [...new Set((tagIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) throw Object.assign(new Error('tag_ids is required'), { statusCode: 400 });

  const existing = await pool.query(`SELECT id, name FROM ticket_tags WHERE id = ANY($1::int[])`, [ids]);
  if (existing.rowCount === 0) throw Object.assign(new Error('No valid tags found'), { statusCode: 400 });

  const addedNames = [];
  for (const tag of existing.rows) {
    const inserted = await pool.query(
      `INSERT INTO ticket_tag_map (ticket_id, tag_id, added_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING tag_id`,
      [row.id, tag.id, actor.id || null]
    );
    if (inserted.rowCount) addedNames.push(tag.name);
  }

  if (addedNames.length) {
    const actorName = actor.name || 'Staff';
    const actorRole = actor.role || 'staff';
    await pool.query(
      `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
       VALUES ($1, 'TAGGED', $2, 'internal', $3, $4, $5)`,
      [row.id, `Tagged: ${addedNames.join(', ')}`, actor.id || 0, actorRole, actorName]
    );
  }

  return getTagsForTicket(ticketRef);
}

async function removeTagFromTicket(ticketRef, tagId, actor = {}) {
  await loadDbModule();
  const row = await resolveTicketRowRef(ticketRef);
  if (!row) throw Object.assign(new Error('Ticket not found'), { statusCode: 404 });
  const tagRes = await pool.query(`SELECT id, name FROM ticket_tags WHERE id = $1`, [tagId]);
  if (!tagRes.rowCount) throw Object.assign(new Error('Tag not found'), { statusCode: 404 });

  const deleted = await pool.query(
    `DELETE FROM ticket_tag_map WHERE ticket_id = $1 AND tag_id = $2 RETURNING tag_id`,
    [row.id, tagId]
  );
  if (!deleted.rowCount) throw Object.assign(new Error('Tag is not on this ticket'), { statusCode: 404 });

  await pool.query(
    `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
     VALUES ($1, 'UNTAGGED', $2, 'internal', $3, $4, $5)`,
    [
      row.id,
      `Untagged: ${tagRes.rows[0].name}`,
      actor.id || 0,
      actor.role || 'staff',
      actor.name || 'Staff',
    ]
  );

  return getTagsForTicket(ticketRef);
}

async function getTicketByIdForStaff(ticketId) {
  await loadDbModule();
  const ref = normalizeTicketRef(ticketId);
  if (!ref) return null;
  const query = `
    SELECT
      t.*,
      COALESCE(p.project_name, 'General') AS project_name,
      COALESCE(p.project_code, '') AS project_code,
      COALESCE(c.customer_name, 'Unknown Customer') AS customer_name,
      COALESCE(c.customer_code, '') AS customer_code,
      COALESCE(c.contact_email, '') AS contact_email,
      COALESCE(c.contact_phone, '') AS contact_phone,
      s.id AS site_row_id,
      s.site_name,
      s.site_code,
      s.connection_status AS site_connection_status,
      u_assigned.first_name || ' ' || u_assigned.last_name AS assignee_name,
      u_assigned.role AS assignee_role,
      u_creator.first_name || ' ' || u_creator.last_name AS creator_name,
      t.created_by_type AS creator_type
    FROM tickets t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN customer_sites s ON s.id = t.site_id
    LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
    LEFT JOIN users u_creator ON t.created_by_id = u_creator.id AND t.created_by_type = 'staff'
    WHERE t.ticket_id = $1 OR ($1 ~ '^[0-9]+$' AND t.id = $1::int)
  `;
  const result = await pool.query(query, [ref]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.site_id || row.site_row_id) {
    row.site = {
      id: row.site_id || row.site_row_id,
      site_code: row.site_code || null,
      site_name: row.site_name || null,
      connection_status: row.site_connection_status || null,
    };
  } else {
    row.site = null;
  }
  return row;
}

// =============== USER WORK HISTORY ===============
async function getUserWorkHistory(userId) {
  await loadDbModule();
  const uid = parseInt(userId, 10);
  if (!Number.isFinite(uid)) return { tickets: [], material_requests: [], cash_requests: [], summary: {} };

  const ticketsResult = await pool.query(
    `
    SELECT DISTINCT
      t.id,
      t.ticket_id,
      t.title,
      t.status,
      t.priority,
      t.category,
      t.created_at,
      t.updated_at,
      t.closed_at,
      p.project_name,
      p.project_code,
      c.customer_name,
      c.customer_code,
      CASE
        WHEN t.assigned_to = $1 THEN 'assigned'
        WHEN EXISTS (
          SELECT 1 FROM ticket_timeline tl
          WHERE tl.ticket_id = t.id AND tl.actor_id = $1
        ) THEN 'worked_on'
        ELSE 'assigned'
      END AS involvement_type,
      (
        SELECT COUNT(*)
        FROM ticket_timeline tl
        WHERE tl.ticket_id = t.id AND tl.actor_id = $1
      ) AS timeline_entries_count,
      (
        SELECT MAX(tl.created_at)
        FROM ticket_timeline tl
        WHERE tl.ticket_id = t.id AND tl.actor_id = $1
      ) AS last_activity_at
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    JOIN customers c ON t.customer_id = c.id
    WHERE (
      t.assigned_to = $1
      OR EXISTS (
        SELECT 1 FROM ticket_timeline tl
        WHERE tl.ticket_id = t.id AND tl.actor_id = $1
      )
    )
    ORDER BY t.created_at DESC
  `,
    [uid]
  );

  let material_requests = [];
  let cash_requests = [];
  try {
    const reqResult = await pool.query(
      `
      SELECT
        r.id,
        r.type,
        r.status,
        r.purpose,
        r.department,
        r.total_amount,
        r.created_at,
        r.updated_at,
        r.ticket_id AS linked_ticket_row_id,
        t.ticket_id AS linked_ticket_id,
        CASE
          WHEN r.created_by_id = $1 THEN 'requester'
          WHEN EXISTS (
            SELECT 1 FROM request_approvers ra WHERE ra.request_id = r.id AND ra.approver_id = $1
          ) OR EXISTS (
            SELECT 1 FROM approvals a WHERE a.request_id = r.id AND a.approver_id = $1
          ) THEN 'approver'
          ELSE 'participant'
        END AS involvement_type
      FROM requests r
      LEFT JOIN tickets t ON t.id = r.ticket_id
      WHERE r.deleted_at IS NULL
        AND (
          r.created_by_id = $1
          OR EXISTS (
            SELECT 1 FROM request_approvers ra WHERE ra.request_id = r.id AND ra.approver_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM approvals a WHERE a.request_id = r.id AND a.approver_id = $1
          )
        )
      ORDER BY r.created_at DESC
      LIMIT 200
    `,
      [uid]
    );
    material_requests = reqResult.rows.filter((r) =>
      ['material_request', 'item_return'].includes(String(r.type || ''))
    );
    cash_requests = reqResult.rows.filter((r) => String(r.type || '') === 'cash_request');
  } catch (e) {
    console.warn('[work-history] requests lookup failed:', e.message);
  }

  const tickets = ticketsResult.rows;
  return {
    tickets,
    material_requests,
    cash_requests,
    summary: {
      tickets_total: tickets.length,
      tickets_resolved: tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(String(t.status || '').toUpperCase())).length,
      tickets_active: tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(String(t.status || '').toUpperCase())).length,
      material_total: material_requests.length,
      cash_total: cash_requests.length,
    },
  };
}

// =============== TICKET SEARCH WITH FULL DETAILS ===============
async function searchTicketWithFullDetails(ticketId) {
  await loadDbModule();
  
  // Get ticket details
  const ticket = await getTicketByIdForStaff(ticketId);
  if (!ticket) return null;
  
  // Get timeline
  const timeline = await getTicketTimeline(ticketId);
  
  // Get all users who worked on this ticket (from timeline)
  const usersResult = await pool.query(`
    SELECT DISTINCT
      u.id,
      u.first_name,
      u.last_name,
      u.username,
      u.email,
      u.role,
      COUNT(tl.id) AS activity_count,
      MIN(tl.created_at) AS first_activity,
      MAX(tl.created_at) AS last_activity
    FROM ticket_timeline tl
    JOIN users u ON tl.actor_id = u.id
    WHERE tl.ticket_id = (SELECT id FROM tickets WHERE ticket_id = $1)
      AND tl.actor_id IS NOT NULL
    GROUP BY u.id, u.first_name, u.last_name, u.username, u.email, u.role
    ORDER BY activity_count DESC, last_activity DESC
  `, [ticketId]);
  
  const usersWorkedOn = usersResult.rows.map(u => ({
    id: u.id,
    fullName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
    username: u.username,
    email: u.email,
    role: u.role,
    activityCount: parseInt(u.activity_count),
    firstActivity: u.first_activity,
    lastActivity: u.last_activity
  }));
  
  // Calculate resolution time
  let resolutionTime = null;
  let resolutionTimeFormatted = null;
  
  if (ticket.closed_at) {
    const created = new Date(ticket.created_at);
    const closed = new Date(ticket.closed_at);
    const diffMs = closed.getTime() - created.getTime();
    resolutionTime = diffMs;
    resolutionTimeFormatted = formatResolutionMs(diffMs);
  }

  // Linked material / cash requests
  let linkedRequests = [];
  try {
    const { getRequestsByTicketId } = await import('./db.js');
    linkedRequests = await getRequestsByTicketId(ticket.ticket_id);
  } catch (e) {
    console.warn('[ticket-report] linked requests failed:', e.message);
  }

  const materialRequests = [];
  const cashRequests = [];
  const byRequestId = new Map();
  for (const row of linkedRequests) {
    const key = row.id;
    if (!byRequestId.has(key)) {
      byRequestId.set(key, {
        id: row.id,
        type: row.type,
        status: row.status,
        purpose: row.purpose,
        department: row.department,
        total_amount: row.total_amount,
        created_at: row.created_at,
        items: [],
      });
    }
    if (row.material_name) {
      byRequestId.get(key).items.push({
        name: row.material_name,
        quantity_requested: row.quantity_requested,
        quantity_received: row.quantity_received,
      });
    }
  }
  for (const req of byRequestId.values()) {
    if (String(req.type) === 'cash_request') cashRequests.push(req);
    else materialRequests.push(req);
  }

  const tags = typeof getTagsForTicket === 'function' ? await getTagsForTicket(ticket.ticket_id).catch(() => []) : [];

  const startedAt = ticket.created_at;
  const endedAt = ticket.closed_at || null;
  const stage = ticket.escalation_stage || null;

  const reportNarrative = [
    `Ticket ${ticket.ticket_id}: ${ticket.title}`,
    `Status: ${ticket.status} | Priority: ${ticket.priority} | Category: ${ticket.category || 'general'}`,
    `Customer: ${ticket.customer_name || '—'} (${ticket.customer_code || '—'})`,
    `Project: ${ticket.project_name || '—'}`,
    `Started: ${startedAt ? new Date(startedAt).toISOString() : '—'}`,
    `Ended: ${endedAt ? new Date(endedAt).toISOString() : 'Still open'}`,
    resolutionTimeFormatted ? `Resolution time: ${resolutionTimeFormatted}` : null,
    stage ? `Current escalation stage: ${stage}` : null,
    ticket.response_due_at ? `SLA first response due: ${new Date(ticket.response_due_at).toISOString()}` : null,
    ticket.resolution_due_at ? `SLA resolution due: ${new Date(ticket.resolution_due_at).toISOString()}` : null,
    ticket.first_response_at ? `First response at: ${new Date(ticket.first_response_at).toISOString()}` : null,
    `People who worked on it (${usersWorkedOn.length}): ${
      usersWorkedOn.map((u) => `${u.fullName} (${u.role}, ${u.activityCount} actions)`).join('; ') || 'None recorded'
    }`,
    `Timeline events: ${timeline.length}`,
    `Material requests linked: ${materialRequests.length}`,
    `Cash requests linked: ${cashRequests.length}`,
    tags?.length ? `Tags: ${tags.map((t) => t.name).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ticket: {
      ...ticket,
      tags,
    },
    timeline,
    usersWorkedOn,
    resolutionTime,
    resolutionTimeFormatted,
    totalActivities: timeline.length,
    startedAt,
    endedAt,
    materialRequests,
    cashRequests,
    linkedRequests: [...materialRequests, ...cashRequests],
    reportNarrative,
    report: {
      ticket_id: ticket.ticket_id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      customer_name: ticket.customer_name,
      customer_code: ticket.customer_code,
      project_name: ticket.project_name,
      description: ticket.description,
      assignee_name: ticket.assignee_name,
      started_at: startedAt,
      ended_at: endedAt,
      resolution_time: resolutionTimeFormatted,
      escalation_stage: stage,
      workers: usersWorkedOn,
      timeline,
      material_requests: materialRequests,
      cash_requests: cashRequests,
      tags,
      sla: {
        response_due_at: ticket.response_due_at || null,
        resolution_due_at: ticket.resolution_due_at || null,
        first_response_at: ticket.first_response_at || null,
        monitoring: ticket.sla_monitoring !== false,
      },
      narrative: reportNarrative,
    },
  };
}

function formatResolutionMs(diffMs) {
  if (diffMs == null || diffMs < 0) return null;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''}, ${diffHours % 24} hour${diffHours % 24 !== 1 ? 's' : ''}`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}, ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
  }
  return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
}

const COMPLETED_TICKET_STATUSES = ['RESOLVED', 'CLOSED'];

function isCompletedTicketRow(row) {
  const status = String(row?.status || '').trim().toUpperCase();
  if (COMPLETED_TICKET_STATUSES.includes(status)) return true;
  if (row?.closed_at) return true;
  return false;
}

const TICKET_COMPLETED_SQL = `
  (
    UPPER(TRIM(t.status)) = ANY($COMPLETED)
    OR t.closed_at IS NOT NULL
  )
`;

// =============== TICKET REPORT (executive / managers) ===============
async function getTicketReport({ bucket, date_from, date_to } = {}) {
  await loadDbModule();

  const values = [COMPLETED_TICKET_STATUSES];
  let whereExtra = '';
  let paramIdx = 2;

  if (bucket === 'completed') {
    whereExtra += ` AND ${TICKET_COMPLETED_SQL.replace('$COMPLETED', '$1')}`;
  } else if (bucket === 'pending') {
    whereExtra += ` AND NOT ${TICKET_COMPLETED_SQL.replace('$COMPLETED', '$1')}`;
  }

  if (date_from) {
    whereExtra += ` AND t.created_at >= $${paramIdx++}`;
    values.push(date_from);
  }
  if (date_to) {
    whereExtra += ` AND t.created_at <= $${paramIdx++}`;
    values.push(date_to);
  }

  const completedParam = '$1';

  const result = await pool.query(
    `
    SELECT
      t.ticket_id,
      t.title,
      t.category,
      t.priority,
      t.status,
      t.description,
      t.created_at,
      t.updated_at,
      t.closed_at,
      t.source,
      t.escalation_stage,
      t.stage_entered_at,
      t.stage_accepted_at,
      t.escalation_due_at,
      p.project_name,
      p.project_code,
      c.customer_name,
      c.customer_code,
      c.contact_email,
      c.contact_phone,
      c.location AS customer_location,
      TRIM(COALESCE(u_assigned.first_name, '') || ' ' || COALESCE(u_assigned.last_name, '')) AS assignee_name,
      u_assigned.role AS assignee_role,
      TRIM(COALESCE(u_creator.first_name, '') || ' ' || COALESCE(u_creator.last_name, '')) AS creator_name,
      CASE
        WHEN ${TICKET_COMPLETED_SQL.replace('$COMPLETED', completedParam)} THEN 'completed'
        ELSE 'pending'
      END AS report_bucket,
      COALESCE(w.workers, '[]'::json) AS workers,
      last_ev.action AS last_action,
      last_ev.message AS last_activity_message,
      last_ev.created_at AS last_activity_at
    FROM tickets t
    JOIN projects p ON t.project_id = p.id
    JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
    LEFT JOIN users u_creator ON t.created_by_id = u_creator.id AND t.created_by_type = 'staff'
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'name', x.name,
          'role', x.role,
          'actions', x.actions,
          'firstAt', x.first_at,
          'lastAt', x.last_at
        ) ORDER BY x.last_at DESC
      ) AS workers
      FROM (
        SELECT
          COALESCE(
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
            tl.actor_name,
            'System'
          ) AS name,
          COALESCE(u.role, tl.actor_role) AS role,
          COUNT(*)::int AS actions,
          MIN(tl.created_at) AS first_at,
          MAX(tl.created_at) AS last_at
        FROM ticket_timeline tl
        LEFT JOIN users u ON tl.actor_id = u.id
        WHERE tl.ticket_id = t.id
        GROUP BY u.id, u.first_name, u.last_name, u.username, u.role, tl.actor_name, tl.actor_role
      ) x
    ) w ON true
    LEFT JOIN LATERAL (
      SELECT tl.action, tl.message, tl.created_at
      FROM ticket_timeline tl
      WHERE tl.ticket_id = t.id
      ORDER BY tl.created_at DESC
      LIMIT 1
    ) last_ev ON true
    WHERE 1=1
    ${whereExtra}
    ORDER BY t.created_at DESC
    `,
    values
  );

  const tickets = result.rows.map((row) => {
    const completed = isCompletedTicketRow(row);
    const endAt = row.closed_at || (completed ? row.updated_at : null);
    let resolutionMs = null;
    let resolutionFormatted = null;
    let ageMs = null;
    let ageFormatted = null;

    if (endAt) {
      resolutionMs = new Date(endAt).getTime() - new Date(row.created_at).getTime();
      resolutionFormatted = formatResolutionMs(resolutionMs);
    } else {
      ageMs = Date.now() - new Date(row.created_at).getTime();
      ageFormatted = formatResolutionMs(ageMs);
    }

    const workers = Array.isArray(row.workers)
      ? row.workers
      : typeof row.workers === 'string'
        ? JSON.parse(row.workers)
        : [];

    return {
      ...row,
      workers,
      resolution_ms: resolutionMs,
      resolution_formatted: resolutionFormatted,
      open_age_ms: ageMs,
      open_age_formatted: ageFormatted,
      is_completed: completed,
    };
  });

  const summary = {
    total: tickets.length,
    pending: tickets.filter((t) => !t.is_completed).length,
    completed: tickets.filter((t) => t.is_completed).length,
    by_status: {},
    by_priority: {},
    avg_resolution_ms: null,
    avg_resolution_formatted: null,
  };

  tickets.forEach((t) => {
    summary.by_status[t.status] = (summary.by_status[t.status] || 0) + 1;
    summary.by_priority[t.priority] = (summary.by_priority[t.priority] || 0) + 1;
  });

  const resolvedTimes = tickets
    .filter((t) => t.resolution_ms != null && t.resolution_ms >= 0)
    .map((t) => t.resolution_ms);
  if (resolvedTimes.length > 0) {
    const avg = resolvedTimes.reduce((a, b) => a + b, 0) / resolvedTimes.length;
    summary.avg_resolution_ms = Math.round(avg);
    summary.avg_resolution_formatted = formatResolutionMs(avg);
  }

  const statusColors = {
    NEW: '#94a3b8',
    OPEN: '#3b82f6',
    IN_PROGRESS: '#8b5cf6',
    ON_HOLD: '#f59e0b',
    RESOLVED: '#22c55e',
    CLOSED: '#64748b',
    REOPEN: '#f97316',
  };

  const charts = {
    pending_vs_completed: [
      { name: 'Pending', value: summary.pending, color: '#f59e0b' },
      { name: 'Completed', value: summary.completed, color: '#22c55e' },
    ],
    by_status: Object.entries(summary.by_status).map(([name, value]) => ({
      name,
      value,
      color: statusColors[name.toUpperCase()] || '#6366f1',
    })),
    by_priority: Object.entries(summary.by_priority).map(([name, value]) => ({
      name: name.toUpperCase(),
      value,
    })),
    volume_by_month: buildTicketVolumeByMonth(tickets),
    top_workers: buildTopWorkers(tickets),
  };

  return { summary, tickets, charts };
}

function buildTicketVolumeByMonth(tickets) {
  const map = new Map();
  for (const t of tickets) {
    const d = new Date(t.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const row = map.get(key) || { month: key, created: 0, completed: 0 };
    row.created += 1;
    if (t.is_completed) row.completed += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

function buildTopWorkers(tickets) {
  const counts = new Map();
  for (const t of tickets) {
    for (const w of t.workers || []) {
      const name = w.name || 'Unknown';
      counts.set(name, (counts.get(name) || 0) + (w.actions || 1));
    }
  }
  return [...counts.entries()]
    .map(([name, actions]) => ({ name, actions }))
    .sort((a, b) => b.actions - a.actions)
    .slice(0, 8);
}

async function searchTickets(searchTerm) {
  await loadDbModule();
  const query = `
    SELECT
      t.id,
      t.ticket_id,
      t.title,
      t.status,
      c.id AS customer_id,
      c.customer_name,
      p.project_name,
      t.site_id,
      s.site_name,
      s.site_code,
      s.region,
      s.site_address,
      s.latitude,
      s.longitude
    FROM tickets t
    JOIN customers c ON t.customer_id = c.id
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN customer_sites s ON s.id = t.site_id
    WHERE t.ticket_id ILIKE $1
      OR REPLACE(REPLACE(LOWER(t.ticket_id), '-', ''), ' ', '') ILIKE $2
      OR t.title ILIKE $1
      OR c.customer_name ILIKE $1
      OR p.project_name ILIKE $1
    ORDER BY t.created_at DESC
    LIMIT 20;
  `;
  const normalized = String(searchTerm || '').toLowerCase().replace(/[\s-]+/g, '');
  const result = await pool.query(query, [`%${searchTerm}%`, `%${normalized}%`]);
  return result.rows;
}

// =============== EXPORTS ===============
module.exports = {
  initTicketingDB,
  initTicketTables,
  createProject,
  getProjects,
  createCustomer,
  getOrCreateEmailSupportCustomer,
  setCustomerPIN,
  authenticateCustomer,
  getCustomerById,
  ensureDefaultOrgProjectId,
  getCustomers,
  createTicket,
  updateTicketStaff,
  getTicketById,
  getTicketTimeline,
  getTicketsForCustomer,
  getAllTickets,
  getTicketByIdForStaff,
  normalizeTicketRef,
  resolveTicketRowRef,
  getUserWorkHistory,
  searchTicketWithFullDetails,
  getTicketReport,
  searchTickets,
  listTicketTags,
  createTicketTag,
  updateTicketTag,
  deleteTicketTag,
  getTagsForTicket,
  addTagsToTicket,
  removeTagFromTicket,
  attachTagsToTickets,
};