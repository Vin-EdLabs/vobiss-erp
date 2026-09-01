/**
 * One-off import: every distinct customer name / site name in the real WIP-27-Aug-26.xlsx
 * (Archive file id=2, sheets "WIP" and "Data") becomes a real Client / Site record — name only,
 * so they show up in search and can be linked/cleaned up later. Case-insensitive dedup both
 * within the spreadsheet and against what's already in the system, so re-running is safe and
 * "Iklick"/"iklick"/"OZONE"/"Ozone" each collapse to one client (first-seen casing wins).
 *
 * Usage: node backend/scripts/import-wip-excel-clients-sites.cjs
 */
const XLSX = require('xlsx');
const { ensureClientSitesSchema } = require('../db.clients.cjs');

const EXCEL_PATH = 'backend/archive-storage/arc-1788130039551-677839806.xlsx';

function extractNames(wb, sheetName, custColLabel, siteColLabel) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = rows[0];
  const ci = header.findIndex((h) => String(h).trim().toLowerCase() === custColLabel);
  const si = header.findIndex((h) => String(h).trim().toLowerCase() === siteColLabel);
  const customers = [];
  const sites = [];
  for (let i = 1; i < rows.length; i++) {
    const c = String(rows[i][ci] || '').trim();
    const s = String(rows[i][si] || '').trim();
    if (c) customers.push(c);
    if (s) sites.push(s);
  }
  return { customers, sites };
}

/** Case-insensitive dedup, first-seen casing wins. */
function dedupeCaseInsensitive(names) {
  const seen = new Map();
  for (const name of names) {
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

async function main() {
  await ensureClientSitesSchema();
  const dbModule = await import('../db.js');
  const pool = dbModule.pool || dbModule.default?.pool || dbModule.default;

  const wb = XLSX.readFile(EXCEL_PATH);
  const wip = extractNames(wb, 'WIP', 'customer name', 'site name');
  const data = extractNames(wb, 'Data', 'customer name', 'site name');

  const allCustomerNames = dedupeCaseInsensitive([...wip.customers, ...data.customers]);
  const allSiteNames = dedupeCaseInsensitive([...wip.sites, ...data.sites]);
  console.log(`Spreadsheet: ${allCustomerNames.length} distinct clients, ${allSiteNames.length} distinct sites.`);

  const existingCustomers = await pool.query(`SELECT customer_name FROM customers WHERE deleted_at IS NULL`);
  const existingCustomerKeys = new Set(existingCustomers.rows.map((r) => r.customer_name.trim().toLowerCase()));
  const newCustomerNames = allCustomerNames.filter((n) => !existingCustomerKeys.has(n.toLowerCase()));

  const existingSites = await pool.query(`SELECT site_name FROM customer_sites`);
  const existingSiteKeys = new Set(existingSites.rows.map((r) => r.site_name.trim().toLowerCase()));
  const newSiteNames = allSiteNames.filter((n) => !existingSiteKeys.has(n.toLowerCase()));

  console.log(`To create: ${newCustomerNames.length} clients, ${newSiteNames.length} sites (rest already exist).`);

  // Default project (same "General Organizations" bucket every other client uses).
  const def = await pool.query(`SELECT id FROM projects WHERE project_name = 'General Organizations' AND deleted_at IS NULL LIMIT 1`);
  let projectId = def.rows[0]?.id;
  if (!projectId) {
    const codeRes = await pool.query(`SELECT 'PROJ-' || LPAD((COALESCE(MAX(id), 0) + 1)::TEXT, 5, '0') AS next_code FROM projects`);
    const ins = await pool.query(
      `INSERT INTO projects (project_name, description, project_code) VALUES ($1, $2, $3) RETURNING id`,
      ['General Organizations', 'Default project for client organizations', codeRes.rows[0].next_code]
    );
    projectId = ins.rows[0].id;
  }

  // Bulk-generate codes in one round trip each, then bulk-insert.
  if (newCustomerNames.length) {
    const codes = await pool.query(
      `SELECT 'CW-' || LPAD(nextval('customer_code_seq')::text, 5, '0') AS code FROM generate_series(1, $1)`,
      [newCustomerNames.length]
    );
    const values = [];
    const params = [];
    newCustomerNames.forEach((name, i) => {
      const base = params.length;
      params.push(name, projectId, codes.rows[i].code, 'Active');
      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    });
    await pool.query(
      `INSERT INTO customers (customer_name, project_id, customer_code, status) VALUES ${values.join(',')}`,
      params
    );
    console.log(`+ created ${newCustomerNames.length} clients`);
  }

  if (newSiteNames.length) {
    const codes = await pool.query(
      `SELECT 'SITE-' || LPAD(nextval('site_code_seq')::text, 5, '0') AS code FROM generate_series(1, $1)`,
      [newSiteNames.length]
    );
    // customer_sites.site_name has no unique constraint, but chunk the insert to stay well
    // under Postgres's parameter limit for one statement.
    const CHUNK = 500;
    let created = 0;
    for (let start = 0; start < newSiteNames.length; start += CHUNK) {
      const chunkNames = newSiteNames.slice(start, start + CHUNK);
      const chunkCodes = codes.rows.slice(start, start + CHUNK);
      const values = [];
      const params = [];
      chunkNames.forEach((name, i) => {
        const base = params.length;
        params.push(chunkCodes[i].code, name, 'Pending');
        values.push(`($${base + 1}, NULL, $${base + 2}, $${base + 3})`);
      });
      await pool.query(
        `INSERT INTO customer_sites (site_code, customer_id, site_name, connection_status) VALUES ${values.join(',')}`,
        params
      );
      created += chunkNames.length;
    }
    console.log(`+ created ${created} sites`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
