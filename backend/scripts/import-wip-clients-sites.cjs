/**
 * One-off import: every distinct customer_name / site_name sitting in project_wip_entries
 * (free text, no real customers/customer_sites link) becomes a real Client / Site record —
 * name only, so they show up in search and can be linked properly later. Skips any name that
 * already exists (exact, case-insensitive match) so re-running is safe.
 *
 * Direct INSERT for customers (not db.clients.cjs's createClient) because that helper requires
 * an email and there's a unique (project_id, contact_email) constraint — passing real NULL for
 * an unset email avoids colliding with every other customer that also has no email yet, the way
 * an empty string '' would.
 *
 * Usage: node backend/scripts/import-wip-clients-sites.cjs
 */
const { ensureClientSitesSchema, createStandaloneSite } = require('../db.clients.cjs');

async function nextClientCode(pool) {
  const r = await pool.query(`SELECT 'CW-' || LPAD(nextval('customer_code_seq')::text, 5, '0') AS code`);
  return r.rows[0].code;
}

async function ensureDefaultProjectId(pool) {
  const def = await pool.query(`SELECT id FROM projects WHERE project_name = 'General Organizations' AND deleted_at IS NULL LIMIT 1`);
  if (def.rows[0]) return def.rows[0].id;
  const codeRes = await pool.query(`SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects`);
  const ins = await pool.query(
    `INSERT INTO projects (project_name, description, project_code) VALUES ($1, $2, $3) RETURNING id`,
    ['General Organizations', 'Default project for client organizations', codeRes.rows[0].next_code]
  );
  return ins.rows[0].id;
}

async function main() {
  await ensureClientSitesSchema();
  const dbModule = await import('../db.js');
  const pool = dbModule.pool || dbModule.default?.pool || dbModule.default;

  const wipCustomers = await pool.query(
    `SELECT DISTINCT customer_name FROM project_wip_entries
     WHERE deleted_at IS NULL AND customer_name IS NOT NULL AND trim(customer_name) <> ''
     ORDER BY customer_name`
  );
  const wipSites = await pool.query(
    `SELECT DISTINCT site_name FROM project_wip_entries
     WHERE deleted_at IS NULL AND site_name IS NOT NULL AND trim(site_name) <> ''
     ORDER BY site_name`
  );

  const existingCustomers = await pool.query(`SELECT customer_name FROM customers WHERE deleted_at IS NULL`);
  const existingCustomerNames = new Set(existingCustomers.rows.map((r) => r.customer_name.trim().toLowerCase()));

  const existingSites = await pool.query(`SELECT site_name FROM customer_sites`);
  const existingSiteNames = new Set(existingSites.rows.map((r) => r.site_name.trim().toLowerCase()));

  const projectId = await ensureDefaultProjectId(pool);

  let customersCreated = 0;
  let customersSkipped = 0;
  for (const row of wipCustomers.rows) {
    const name = row.customer_name.trim();
    if (existingCustomerNames.has(name.toLowerCase())) {
      console.log(`  skip (already exists): ${name}`);
      customersSkipped++;
      continue;
    }
    const customerCode = await nextClientCode(pool);
    const inserted = await pool.query(
      `INSERT INTO customers (customer_name, project_id, customer_code, status)
       VALUES ($1, $2, $3, 'Active') RETURNING customer_name, customer_code`,
      [name, projectId, customerCode]
    );
    console.log(`  + created client: ${inserted.rows[0].customer_name} (${inserted.rows[0].customer_code})`);
    existingCustomerNames.add(name.toLowerCase());
    customersCreated++;
  }

  let sitesCreated = 0;
  let sitesSkipped = 0;
  for (const row of wipSites.rows) {
    const name = row.site_name.trim();
    if (existingSiteNames.has(name.toLowerCase())) {
      console.log(`  skip (already exists): ${name}`);
      sitesSkipped++;
      continue;
    }
    const created = await createStandaloneSite({ site_name: name });
    console.log(`  + created site: ${name} (${created.site_code})`);
    existingSiteNames.add(name.toLowerCase());
    sitesCreated++;
  }

  console.log(`\nDone. Clients: ${customersCreated} created, ${customersSkipped} skipped. Sites: ${sitesCreated} created, ${sitesSkipped} skipped.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
