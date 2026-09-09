/**
 * Client (customers) + Sites data layer.
 * DB table remains `customers`; API/UI labels use "Client".
 */
let pool = null;
let bcrypt = null;
let geo = null;

async function load() {
  if (pool) return;
  const dbModule = await import('./db.js');
  pool = dbModule.pool || dbModule.default?.pool || dbModule.default;
  if (!pool) throw new Error('Failed to load pool from db.js');
  try {
    bcrypt = (await import('bcrypt')).default;
  } catch {
    bcrypt = (await import('bcryptjs')).default;
  }
}

async function loadGeo() {
  if (!geo) geo = await import('./services/geo.js');
  return geo;
}

async function ensureClientSitesSchema() {
  await load();

  await pool.query(`CREATE SEQUENCE IF NOT EXISTS customer_code_seq START 1`);
  await pool.query(`CREATE SEQUENCE IF NOT EXISTS site_code_seq START 1`);

  // Sync sequence with existing CUST-/CW- codes so new codes don't collide
  await pool.query(`
    SELECT setval(
      'customer_code_seq',
      GREATEST(
        1,
        COALESCE(
          (SELECT MAX(
            CASE
              WHEN customer_code ~ '^(CW|CUST)-[0-9]+$'
              THEN NULLIF(regexp_replace(customer_code, '^(CW|CUST)-', ''), '')::int
              ELSE NULL
            END
          ) FROM customers),
          1
        )
      )
    )
  `).catch(() => {});

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='contact_person') THEN
        ALTER TABLE customers ADD COLUMN contact_person VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='status') THEN
        ALTER TABLE customers ADD COLUMN status VARCHAR(50) DEFAULT 'Active';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='password_hash') THEN
        ALTER TABLE customers ADD COLUMN password_hash VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='updated_at') THEN
        ALTER TABLE customers ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
      END IF;
    END $$;
  `);

  await pool.query(`UPDATE customers SET status = 'Active' WHERE status IS NULL`);

  // Backfill password_hash = bcrypt(customer_code) when missing
  const missing = await pool.query(
    `SELECT id, customer_code FROM customers
     WHERE deleted_at IS NULL AND (password_hash IS NULL OR password_hash = '')
       AND customer_code IS NOT NULL`
  );
  for (const row of missing.rows) {
    const hash = await bcrypt.hash(String(row.customer_code), 12);
    await pool.query(`UPDATE customers SET password_hash = $1 WHERE id = $2`, [hash, row.id]);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_sites (
      id SERIAL PRIMARY KEY,
      site_code VARCHAR(50) UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      site_name VARCHAR(255) NOT NULL,
      site_address TEXT,
      region VARCHAR(100),
      bandwidth VARCHAR(50),
      service_type VARCHAR(100),
      ip_address VARCHAR(50),
      connection_status VARCHAR(50) DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE customer_sites ALTER COLUMN customer_id DROP NOT NULL
  `).catch(() => {});

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_sites' AND column_name='location') THEN
        ALTER TABLE customer_sites ADD COLUMN location VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_sites' AND column_name='gps_coordinates') THEN
        ALTER TABLE customer_sites ADD COLUMN gps_coordinates TEXT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_sites' AND column_name='latitude') THEN
        ALTER TABLE customer_sites ADD COLUMN latitude DOUBLE PRECISION;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_sites' AND column_name='longitude') THEN
        ALTER TABLE customer_sites ADD COLUMN longitude DOUBLE PRECISION;
      END IF;
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_sites_customer ON customer_sites(customer_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_sites_status ON customer_sites(connection_status)`);

  await pool.query(`
    SELECT setval(
      'site_code_seq',
      GREATEST(
        1,
        COALESCE(
          (SELECT MAX(
            CASE
              WHEN site_code ~ '^SITE-[0-9]+$'
              THEN NULLIF(regexp_replace(site_code, '^SITE-', ''), '')::int
              ELSE NULL
            END
          ) FROM customer_sites),
          1
        )
      )
    )
  `).catch(() => {});

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'site_id'
      ) THEN
        ALTER TABLE tickets ADD COLUMN site_id INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tickets_site_id ON tickets(site_id)`);

  console.log('✅ Client / sites schema ready');
}

async function nextClientCode(client = pool) {
  const r = await client.query(`SELECT 'CW-' || LPAD(nextval('customer_code_seq')::text, 5, '0') AS code`);
  return r.rows[0].code;
}

async function nextSiteCode(client = pool) {
  const r = await client.query(`SELECT 'SITE-' || LPAD(nextval('site_code_seq')::text, 5, '0') AS code`);
  return r.rows[0].code;
}

function mapClientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customer_code: row.customer_code,
    company_name: row.customer_name,
    customer_name: row.customer_name,
    contact_person: row.contact_person || null,
    email: row.contact_email || null,
    contact_email: row.contact_email || null,
    phone: row.contact_phone || null,
    contact_phone: row.contact_phone || null,
    location: row.location || null,
    status: row.status || 'Active',
    project_id: row.project_id ?? null,
    project_name: row.project_name || null,
    project_code: row.project_code || null,
    site_count: row.site_count != null ? Number(row.site_count) : undefined,
    ticket_count: row.ticket_count != null ? Number(row.ticket_count) : undefined,
    open_ticket_count: row.open_ticket_count != null ? Number(row.open_ticket_count) : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at || null,
  };
}

async function listClients({ status, search, page = 1, limit = 50 } = {}) {
  await load();
  const params = [];
  let where = `c.deleted_at IS NULL`;
  if (status && status !== 'All') {
    params.push(status);
    where += ` AND COALESCE(c.status, 'Active') = $${params.length}`;
  }
  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    where += ` AND (c.customer_name ILIKE $${params.length} OR c.customer_code ILIKE $${params.length} OR c.contact_email ILIKE $${params.length})`;
  }
  const offset = (Math.max(1, page) - 1) * Math.max(1, Math.min(100, limit));
  params.push(Math.max(1, Math.min(100, limit)));
  params.push(offset);

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total FROM customers c WHERE ${where}`,
    params.slice(0, -2)
  );

  const res = await pool.query(
    `SELECT c.id, c.customer_name, c.customer_code, c.contact_person, c.contact_email, c.contact_phone,
            c.location, c.status, c.project_id, c.created_at, c.updated_at,
            (SELECT COUNT(*)::int FROM customer_sites s WHERE s.customer_id = c.id) AS site_count
     FROM customers c
     WHERE ${where}
     ORDER BY c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total_clients,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(status,'Active') = 'Active')::int AS active,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND COALESCE(status,'Active') = 'Suspended')::int AS suspended,
      (SELECT COUNT(*)::int FROM customer_sites)::int AS total_sites
    FROM customers
  `);

  return {
    data: res.rows.map(mapClientRow),
    total: countRes.rows[0].total,
    page: Math.max(1, page),
    limit: Math.max(1, Math.min(100, limit)),
    stats: stats.rows[0],
  };
}

async function createClient({
  company_name,
  contact_person = null,
  email,
  phone,
  location,
  status = 'Active',
  site_ids = [],
}) {
  await load();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Keep optional project_id via default org project for ticket FK compatibility
    let projectId = null;
    const def = await client.query(
      `SELECT id FROM projects WHERE project_name = 'General Organizations' AND deleted_at IS NULL LIMIT 1`
    );
    if (def.rows[0]) {
      projectId = def.rows[0].id;
    } else {
      const codeRes = await client.query(
        `SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects`
      );
      const ins = await client.query(
        `INSERT INTO projects (project_name, description, project_code)
         VALUES ($1, $2, $3) RETURNING id`,
        ['General Organizations', 'Default project for client organizations', codeRes.rows[0].next_code]
      );
      projectId = ins.rows[0].id;
    }

    const customer_code = await nextClientCode(client);
    const password_hash = await bcrypt.hash(customer_code, 12);
    // Also set PIN = last 5 digits of code for legacy portal login compatibility
    const pin = customer_code.replace(/\D/g, '').slice(-5).padStart(5, '0');
    const pin_hash = await bcrypt.hash(pin, 12);

    const res = await client.query(
      `INSERT INTO customers
        (customer_name, contact_person, contact_email, contact_phone, location, status,
         project_id, customer_code, password_hash, pin_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, customer_name, contact_person, contact_email, contact_phone, location,
                 status, project_id, customer_code, created_at, updated_at`,
      [
        company_name.trim(),
        contact_person?.trim() || null,
        email.trim().toLowerCase(),
        phone.trim(),
        location.trim(),
        status || 'Active',
        projectId,
        customer_code,
        password_hash,
        pin_hash,
      ]
    );

    const customerId = res.rows[0].id;
    const linked = await linkSitesToClient(customerId, site_ids, client);

    await client.query('COMMIT');
    return {
      ...mapClientRow(res.rows[0]),
      default_password: customer_code,
      linked_site_count: linked,
      message: `Client created. Customer Code: ${customer_code}. Default password: ${customer_code}`,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getClientById(id) {
  await load();
  const res = await pool.query(
    `SELECT c.*, p.project_name, p.project_code,
            (SELECT COUNT(*)::int FROM customer_sites s WHERE s.customer_id = c.id) AS site_count,
            (SELECT COUNT(*)::int FROM tickets t WHERE t.customer_id = c.id) AS ticket_count,
            (SELECT COUNT(*)::int FROM tickets t
              WHERE t.customer_id = c.id
                AND UPPER(t.status) NOT IN ('RESOLVED','CLOSED')) AS open_ticket_count
     FROM customers c
     LEFT JOIN projects p ON p.id = c.project_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id]
  );
  if (!res.rows[0]) return null;

  const sites = await listSitesForClient(id);
  const recentTickets = await pool.query(
    `SELECT t.ticket_id, t.title, t.status, t.priority, t.created_at,
            s.site_name, s.site_code,
            COALESCE(u.first_name || ' ' || u.last_name, u.username) AS assignee_name
     FROM tickets t
     LEFT JOIN customer_sites s ON s.id = t.site_id
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.customer_id = $1
     ORDER BY t.created_at DESC
     LIMIT 10`,
    [id]
  );

  return {
    ...mapClientRow(res.rows[0]),
    sites,
    recent_tickets: recentTickets.rows,
  };
}

async function updateClient(id, fields = {}) {
  await load();
  const allowed = {
    company_name: 'customer_name',
    customer_name: 'customer_name',
    contact_person: 'contact_person',
    email: 'contact_email',
    contact_email: 'contact_email',
    phone: 'contact_phone',
    contact_phone: 'contact_phone',
    location: 'location',
    status: 'status',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(allowed)) {
    if (fields[k] !== undefined) {
      params.push(typeof fields[k] === 'string' ? fields[k].trim() : fields[k]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) return getClientById(id);
  params.push(id);
  sets.push(`updated_at = NOW()`);
  const res = await pool.query(
    `UPDATE customers SET ${sets.join(', ')}
     WHERE id = $${params.length} AND deleted_at IS NULL
     RETURNING id`,
    params
  );
  if (!res.rows[0]) return null;
  return getClientById(id);
}

async function listSitesForClient(customerId) {
  await load();
  const res = await pool.query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM tickets t WHERE t.site_id = s.id) AS ticket_count
     FROM customer_sites s
     WHERE s.customer_id = $1
     ORDER BY s.created_at DESC`,
    [customerId]
  );
  return res.rows;
}

async function linkSitesToClient(customerId, siteIds = [], dbClient = pool) {
  const ids = [...new Set((Array.isArray(siteIds) ? siteIds : [])
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return 0;

  const cust = await dbClient.query(
    `SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL`,
    [customerId]
  );
  if (!cust.rows[0]) throw new Error('Client not found');

  const res = await dbClient.query(
    `UPDATE customer_sites
     SET customer_id = $1, updated_at = NOW()
     WHERE id = ANY($2::int[]) AND customer_id IS NULL
     RETURNING id`,
    [customerId, ids]
  );
  return res.rowCount;
}

/** A site can never exist without a client and GPS coordinates — a client, on the other hand,
 *  can exist with zero sites linked (see createClient). `requireCustomer`/`requireCoordinates`
 *  let the client-scoped creation path (which already has a guaranteed customerId) skip the
 *  redundant customer_id check while still enforcing coordinates. */
async function siteInsertValues(data = {}, { requireCustomer = true, requireCoordinates = true } = {}) {
  if (!data.site_name?.trim()) throw new Error('Site name is required');

  const gpsRaw = data.gps_coordinates?.trim() || null;
  if (requireCoordinates && !gpsRaw) {
    throw new Error('Site coordinates are required');
  }
  const { parseCoordinates } = await loadGeo();
  const parsed = gpsRaw ? parseCoordinates(gpsRaw) : null;
  if (gpsRaw && !parsed) {
    throw new Error('Could not understand those coordinates — paste a Google Maps link, "lat, lng", or DMS');
  }

  let customerId = null;
  if (data.customer_id !== undefined && data.customer_id !== null && data.customer_id !== '') {
    customerId = parseInt(data.customer_id, 10);
    if (!Number.isFinite(customerId) || customerId <= 0) throw new Error('Invalid client for site assignment');
  }
  if (requireCustomer) {
    if (!customerId) throw new Error('A site must be linked to a client');
    const cust = await pool.query(`SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL`, [customerId]);
    if (!cust.rows[0]) throw new Error('Client not found');
  }

  return {
    customer_id: customerId,
    site_name: data.site_name.trim(),
    site_address: data.site_address?.trim() || null,
    location: data.location?.trim() || null,
    region: data.region?.trim() || null,
    bandwidth: data.bandwidth?.trim() || null,
    service_type: data.service_type?.trim() || null,
    ip_address: data.ip_address?.trim() || null,
    connection_status: data.connection_status || 'Pending',
    gps_coordinates: gpsRaw,
    latitude: parsed?.lat ?? null,
    longitude: parsed?.lng ?? null,
  };
}

async function createStandaloneSite(data = {}) {
  await load();
  const fields = await siteInsertValues(data, { requireCustomer: true, requireCoordinates: true });
  const site_code = await nextSiteCode();
  const res = await pool.query(
    `INSERT INTO customer_sites
      (site_code, customer_id, site_name, site_address, location, region, bandwidth, service_type, ip_address, connection_status, gps_coordinates, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      site_code,
      fields.customer_id,
      fields.site_name,
      fields.site_address,
      fields.location,
      fields.region,
      fields.bandwidth,
      fields.service_type,
      fields.ip_address,
      fields.connection_status,
      fields.gps_coordinates,
      fields.latitude,
      fields.longitude,
    ]
  );
  return res.rows[0];
}

async function createSite(customerId, data = {}) {
  await load();
  // customerId already comes from the client-scoped route (/clients/:id/sites) — skip the
  // redundant customer_id-in-body check but still verify the client is real, and still require
  // coordinates.
  const fields = await siteInsertValues({ ...data, customer_id: customerId }, { requireCustomer: false, requireCoordinates: true });
  const cust = await pool.query(
    `SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL`,
    [customerId]
  );
  if (!cust.rows[0]) throw new Error('Client not found');

  const site_code = await nextSiteCode();
  const res = await pool.query(
    `INSERT INTO customer_sites
      (site_code, customer_id, site_name, site_address, location, region, bandwidth, service_type, ip_address, connection_status, gps_coordinates, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      site_code,
      customerId,
      fields.site_name,
      fields.site_address,
      fields.location,
      fields.region,
      fields.bandwidth,
      fields.service_type,
      fields.ip_address,
      fields.connection_status,
      fields.gps_coordinates,
      fields.latitude,
      fields.longitude,
    ]
  );
  return res.rows[0];
}

async function updateSiteById(siteId, fields = {}) {
  await load();
  const allowed = [
    'site_name',
    'site_address',
    'location',
    'region',
    'bandwidth',
    'service_type',
    'ip_address',
    'connection_status',
    'customer_id',
    'gps_coordinates',
  ];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      let val = fields[key];
      if (key === 'customer_id') {
        val = val === null || val === '' ? null : parseInt(val, 10);
        // A site can never end up unlinked — reassign it to a different client instead.
        if (val === null) throw new Error('A site must stay linked to a client — reassign it to a different client instead of unlinking');
        if (!Number.isFinite(val) || val <= 0) {
          throw new Error('Invalid client for site assignment');
        }
        const cust = await pool.query(
          `SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL`,
          [val]
        );
        if (!cust.rows[0]) throw new Error('Client not found');
      } else if (key === 'gps_coordinates') {
        val = typeof val === 'string' ? val.trim() || null : null;
        if (!val) throw new Error('Site coordinates are required');
        const { parseCoordinates } = await loadGeo();
        const parsed = parseCoordinates(val);
        if (!parsed) throw new Error('Could not understand those coordinates — paste a Google Maps link, "lat, lng", or DMS');
        params.push(parsed.lat);
        sets.push(`latitude = $${params.length}`);
        params.push(parsed.lng);
        sets.push(`longitude = $${params.length}`);
      } else if (typeof val === 'string') {
        val = val.trim();
      }
      params.push(val);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) {
    const cur = await pool.query(`SELECT * FROM customer_sites WHERE id = $1`, [siteId]);
    return cur.rows[0] || null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(siteId);
  const res = await pool.query(
    `UPDATE customer_sites SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function updateSite(customerId, siteId, fields = {}) {
  await load();
  const allowed = [
    'site_name',
    'site_address',
    'location',
    'region',
    'bandwidth',
    'service_type',
    'ip_address',
    'connection_status',
    'gps_coordinates',
  ];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      let val = typeof fields[key] === 'string' ? fields[key].trim() : fields[key];
      if (key === 'gps_coordinates') {
        val = val || null;
        if (!val) throw new Error('Site coordinates are required');
        const { parseCoordinates } = await loadGeo();
        const parsed = parseCoordinates(val);
        if (!parsed) throw new Error('Could not understand those coordinates — paste a Google Maps link, "lat, lng", or DMS');
        params.push(parsed.lat);
        sets.push(`latitude = $${params.length}`);
        params.push(parsed.lng);
        sets.push(`longitude = $${params.length}`);
      }
      params.push(val);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) {
    const cur = await pool.query(
      `SELECT * FROM customer_sites WHERE id = $1 AND customer_id = $2`,
      [siteId, customerId]
    );
    return cur.rows[0] || null;
  }
  sets.push(`updated_at = NOW()`);
  params.push(siteId, customerId);
  const res = await pool.query(
    `UPDATE customer_sites SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND customer_id = $${params.length}
     RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function listAllSites({ client_id, unassigned, assignment, connection_status, region, search, page, pageSize } = {}) {
  await load();
  const params = [];
  let where = '1=1';
  const isUnassigned = unassigned === true || unassigned === 'true' || unassigned === '1' || assignment === 'unassigned';
  if (isUnassigned) {
    where += ' AND s.customer_id IS NULL';
  } else if (assignment === 'assigned') {
    where += ' AND s.customer_id IS NOT NULL';
  } else if (client_id) {
    params.push(Number(client_id));
    where += ` AND s.customer_id = $${params.length}`;
  }
  if (connection_status) {
    params.push(connection_status);
    where += ` AND s.connection_status = $${params.length}`;
  }
  if (region) {
    params.push(region);
    where += ` AND s.region = $${params.length}`;
  }
  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    where += ` AND (s.site_name ILIKE $${params.length} OR s.site_code ILIKE $${params.length} OR c.customer_name ILIKE $${params.length})`;
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM customer_sites s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE ${where}`,
    params
  );
  const total = countRes.rows[0]?.total || 0;

  const pageParams = [...params];
  let limitClause = '';
  const sizeN = Number(pageSize);
  const pageN = Number(page);
  if (Number.isFinite(sizeN) && sizeN > 0) {
    pageParams.push(sizeN);
    limitClause += ` LIMIT $${pageParams.length}`;
    const offset = (Number.isFinite(pageN) && pageN > 1 ? pageN - 1 : 0) * sizeN;
    pageParams.push(offset);
    limitClause += ` OFFSET $${pageParams.length}`;
  }

  const res = await pool.query(
    `SELECT s.*, c.customer_name AS client_name, c.customer_code AS client_code,
            (SELECT COUNT(*)::int FROM tickets t WHERE t.site_id = s.id) AS ticket_count
     FROM customer_sites s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.deleted_at IS NULL
     WHERE ${where}
     ORDER BY s.created_at DESC${limitClause}`,
    pageParams
  );
  return { rows: res.rows, total };
}

async function getSitesStats() {
  await load();
  const res = await pool.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE customer_id IS NULL)::int AS unassigned
    FROM customer_sites
  `);
  const row = res.rows[0] || { total: 0, unassigned: 0 };
  return { total: row.total, unassigned: row.unassigned, assigned: row.total - row.unassigned };
}

async function authenticateClientByEmail(email, password) {
  await load();
  const res = await pool.query(
    `SELECT c.*, p.project_name, p.project_code
     FROM customers c
     LEFT JOIN projects p ON p.id = c.project_id
     WHERE LOWER(c.contact_email) = LOWER($1) AND c.deleted_at IS NULL`,
    [email.trim()]
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  if (!row.password_hash) return null;
  const ok = await bcrypt.compare(String(password), row.password_hash);
  if (!ok) return null;
  if (String(row.status || 'Active').toLowerCase() === 'suspended') {
    const err = new Error('Account suspended');
    err.code = 'SUSPENDED';
    throw err;
  }
  return row;
}

async function changeClientPassword(customerId, currentPassword, newPassword) {
  await load();
  const res = await pool.query(
    `SELECT id, password_hash FROM customers WHERE id = $1 AND deleted_at IS NULL`,
    [customerId]
  );
  if (!res.rows[0]?.password_hash) throw new Error('Client not found');
  const ok = await bcrypt.compare(String(currentPassword), res.rows[0].password_hash);
  if (!ok) {
    const err = new Error('Current password is incorrect');
    err.code = 'BAD_PASSWORD';
    throw err;
  }
  if (!newPassword || String(newPassword).length < 6) {
    throw new Error('New password must be at least 6 characters');
  }
  const hash = await bcrypt.hash(String(newPassword), 12);
  await pool.query(
    `UPDATE customers SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [hash, customerId]
  );
  return true;
}

/** Staff reset — no current password required. Defaults to customer_code. */
async function resetClientPassword(customerId, { new_password, reset_to_code = true, generate = false } = {}) {
  await load();
  const res = await pool.query(
    `SELECT id, customer_code FROM customers WHERE id = $1 AND deleted_at IS NULL`,
    [customerId]
  );
  if (!res.rows[0]) throw new Error('Client not found');
  const code = String(res.rows[0].customer_code || '');

  let password;
  let mode = 'code';
  if (generate) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    password = '';
    for (let i = 0; i < 10; i++) password += chars[Math.floor(Math.random() * chars.length)];
    mode = 'generated';
  } else if (new_password && String(new_password).trim() && !reset_to_code) {
    password = String(new_password).trim();
    mode = 'custom';
  } else {
    password = code;
    mode = 'code';
  }

  if (!password || password.length < 5) {
    throw new Error('Password must be at least 5 characters');
  }
  if (mode === 'custom' && password.length < 6) {
    throw new Error('Custom password must be at least 6 characters');
  }

  const password_hash = await bcrypt.hash(password, 12);
  const pin = code.replace(/\D/g, '').slice(-5).padStart(5, '0') || '00000';
  const pin_hash = await bcrypt.hash(pin, 12);
  await pool.query(
    `UPDATE customers SET password_hash = $1, pin_hash = $2, updated_at = NOW() WHERE id = $3`,
    [password_hash, pin_hash, customerId]
  );

  const messages = {
    code: `Password reset to customer code (${code}). PIN reset to ${pin}.`,
    custom: `Password updated. PIN reset to ${pin}.`,
    generated: `New password generated. PIN reset to ${pin}.`,
  };

  return {
    customer_code: code,
    password,
    pin,
    mode,
    message: messages[mode] || messages.code,
  };
}

module.exports = {
  ensureClientSitesSchema,
  listClients,
  createClient,
  getClientById,
  updateClient,
  listSitesForClient,
  createSite,
  createStandaloneSite,
  updateSite,
  updateSiteById,
  linkSitesToClient,
  listAllSites,
  getSitesStats,
  authenticateClientByEmail,
  changeClientPassword,
  resetClientPassword,
  mapClientRow,
};
