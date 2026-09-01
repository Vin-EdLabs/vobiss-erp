/**
 * Enrichment pass for the sites/clients already created by import-wip-excel-clients-sites.cjs.
 * That earlier import only pulled customer/site *names* out of WIP-27-Aug-26.xlsx, leaving every
 * new site unlinked (customer_id NULL) and blank on region/location/service_type. The same Excel
 * rows carry all of that — this script re-reads it and, for each site, fills in whichever of
 * customer_id / region / location / service_type is still empty, matched by site name
 * (case-insensitive) against the Excel's LOCATION / Region / Service Type columns.
 *
 * Never overwrites a value someone already set by hand (COALESCE(NULLIF(existing,''), new)) —
 * safe to re-run.
 *
 * Usage: node backend/scripts/link-wip-sites-to-clients.cjs
 */
const path = require('path');
const XLSX = require('xlsx');
const { ensureClientSitesSchema } = require('../db.clients.cjs');

const EXCEL_PATH = path.join(__dirname, '..', 'archive-storage', 'arc-1788130039551-677839806.xlsx');

function extractRows(wb, sheetName, cols) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = {};
  for (const [key, label] of Object.entries(cols)) {
    idx[key] = header.findIndex((h) => h === label);
  }
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const site_name = String(rows[i][idx.site_name] || '').trim();
    if (!site_name) continue;
    out.push({
      customer_name: String(rows[i][idx.customer_name] || '').trim(),
      site_name,
      location: String(rows[i][idx.location] || '').trim(),
      region: String(rows[i][idx.region] || '').trim(),
      service_type: String(rows[i][idx.service_type] || '').trim(),
    });
  }
  return out;
}

async function main() {
  await ensureClientSitesSchema();
  const dbModule = await import('../db.js');
  const pool = dbModule.pool || dbModule.default?.pool || dbModule.default;

  const wb = XLSX.readFile(EXCEL_PATH);
  const wip = extractRows(wb, 'WIP', {
    customer_name: 'customer name', site_name: 'site name', location: 'location', region: 'region', service_type: 'service type',
  });
  const data = extractRows(wb, 'Data', {
    customer_name: 'customer name', site_name: 'site name', location: 'location', region: 'region', service_type: 'service type',
  });

  // Same order the original import deduped in (WIP rows first, then Data), so "first seen"
  // here lines up with whichever row actually produced each site record.
  const bySiteKey = new Map();
  for (const row of [...wip, ...data]) {
    const key = row.site_name.toLowerCase();
    if (!bySiteKey.has(key)) bySiteKey.set(key, row);
  }
  console.log(`Excel: ${bySiteKey.size} distinct site rows with location/region/service-type data.`);

  const customers = await pool.query(`SELECT id, customer_name FROM customers WHERE deleted_at IS NULL`);
  const customerIdByName = new Map(customers.rows.map((c) => [c.customer_name.trim().toLowerCase(), c.id]));

  const sites = await pool.query(
    `SELECT id, site_name, customer_id, region, location, service_type FROM customer_sites`
  );

  let linked = 0, enriched = 0, skipped = 0;
  for (const site of sites.rows) {
    const row = bySiteKey.get(site.site_name.trim().toLowerCase());
    if (!row) { skipped++; continue; }

    const matchedCustomerId = row.customer_name ? customerIdByName.get(row.customer_name.toLowerCase()) : null;
    const newCustomerId = site.customer_id || matchedCustomerId || null;
    const newRegion = site.region || row.region || null;
    const newLocation = site.location || row.location || null;
    const newServiceType = site.service_type || row.service_type || null;

    const changed =
      newCustomerId !== site.customer_id ||
      newRegion !== site.region ||
      newLocation !== site.location ||
      newServiceType !== site.service_type;
    if (!changed) { skipped++; continue; }

    await pool.query(
      `UPDATE customer_sites SET customer_id = $1, region = $2, location = $3, service_type = $4, updated_at = NOW() WHERE id = $5`,
      [newCustomerId, newRegion, newLocation, newServiceType, site.id]
    );
    if (!site.customer_id && newCustomerId) linked++;
    enriched++;
  }

  console.log(`Linked customer_id on ${linked} sites; enriched ${enriched} sites total; ${skipped} already complete or had no matching Excel row.`);
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
