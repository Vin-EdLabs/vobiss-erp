import express from 'express';
import pool, { insertAuditLog } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { isSystemAdminAccount } from '../roles.js';

const router = express.Router();

// init() (defined below) runs a couple dozen CREATE TABLE/INDEX IF NOT EXISTS statements plus
// seed-data inserts — safe to repeat, but not free. Every other route file in this app guards
// its equivalent behind a boot-once flag; this one didn't, so it was re-running that whole
// migration on every single request to almost every Network Assets route (Dashboard, Equipment,
// Passive Infra, POPs...), which is real, avoidable latency on every page load and every search
// keystroke. ensureInit() is the guarded entry point every route should call instead of init().
// Caches the in-flight PROMISE, not just a boolean set after completion — several requests can
// land before the first init() finishes, and a boolean lets every one of them start its own
// init() in parallel, racing on the same CREATE INDEX/CREATE EXTENSION (Postgres's IF NOT
// EXISTS check isn't atomic with the create, so two concurrent creators can genuinely collide
// on a pg_class unique-constraint violation — this is not hypothetical, it was reproduced).
let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = init().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

// Registered before the router-wide auth gate below so a valid share token can serve
// this route without a user session — either one row (`network_asset` link, never more
// than that row) or the full register listing (`network_asset_register` link, the
// explicit whole-sheet share); every other route in this file (including mutations)
// still requires full authentication.
router.get('/source/:sheet', authenticateOrShareToken(['network_asset', 'network_asset_register'], authenticateToken), async (req, res) => {
  try {
    // Registered above the general init-gate below (for the share-token bypass), so this
    // route needs its own guarded call to pick up index migrations like the trigram search
    // index — never the unguarded init() directly, or every search keystroke re-runs it.
    await ensureInit();
    if (req.isSharedView && req.shareLink.record_type === 'network_asset') {
      const row = await pool.query(
        `SELECT id, source_row, row_data, imported_at, sheet_name FROM network_asset_sheet_rows WHERE id = $1`,
        [req.shareLink.record_id]
      );
      if (!row.rowCount) return res.json({ rows: [], total: 0, page: 1, pageSize: 1, headers: [] });
      const sheetHeaders = await buildSheetHeaders(row.rows[0].sheet_name);
      return res.json({ rows: row.rows, total: 1, page: 1, pageSize: 1, headers: sheetHeaders });
    }
    // A network_asset_register share (or a normal authenticated request) falls through
    // to the full listing below, respecting page/search/filter like any other view.
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim(),
      region = String(req.query.region || '').trim(),
      status = String(req.query.status || '').trim(),
      summary = req.query.summary !== 'false';

    const values = [req.params.sheet],
      where = ['sheet_name=$1', sourceRowFilter];

    if (search) {
      values.push(`%${search}%`);
      where.push(`row_data::text ILIKE $${values.length}`);
    }
    if (region && region !== 'All') {
      values.push(`%${region}%`);
      where.push(`row_data::text ILIKE $${values.length}`);
    }
    if (status && status !== 'All') {
      values.push(`%${status}%`);
      where.push(`row_data::text ILIKE $${values.length}`);
    }

    const clause = where.join(' AND ');
    const count = await pool.query(`SELECT count(*)::int total FROM network_asset_sheet_rows WHERE ${clause}`, values);
    const rows = await pool.query(
      `SELECT id,source_row,row_data,imported_at FROM network_asset_sheet_rows WHERE ${clause} ORDER BY source_row LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );

    const headers = await buildSheetHeaders(req.params.sheet);
    const summaryColCount = Math.min(headers.length, 18);

    const processedRows = rows.rows.map(r => {
      if (summary && Array.isArray(r.row_data?.cells) && r.row_data.cells.length > summaryColCount) {
        return {
          ...r,
          row_data: {
            ...r.row_data,
            cells: r.row_data.cells.slice(0, summaryColCount)
          }
        };
      }
      return r;
    });

    res.json({
      rows: processedRows,
      total: count.rows[0].total,
      page,
      pageSize: limit,
      headers: summary ? headers.slice(0, summaryColCount) : headers
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.use(authenticateToken);

const headerCache = new Map();
let dashboardCache = { data: null, expiresAt: 0 };
let catalogueCache = new Map();

function invalidateCaches(sheetName = null) {
  dashboardCache = { data: null, expiresAt: 0 };
  if (sheetName) {
    headerCache.delete(sheetName);
  }
}

const audit = async (req, t, id, field, oldV, newV) => {
  invalidateCaches();
  await pool.query(
    'INSERT INTO asset_audit_log(table_name,record_id,field_changed,old_value,new_value,changed_by_user_id) VALUES($1,$2,$3,$4,$5,$6)',
    [t, id, field, String(oldV ?? ''), String(newV ?? ''), req.user.id]
  );
  await insertAuditLog(req.user.id, `Network Assets: ${t} ${field}`, req.ip, {
    record_id: id,
    old_value: oldV,
    new_value: newV
  });
};

router.get('/dashboard', async (_req, res) => {
  try {
    const now = Date.now();
    if (dashboardCache.data && dashboardCache.expiresAt > now) {
      return res.json(dashboardCache.data);
    }
    const q = await pool.query(
      `SELECT 
        (SELECT count(*) FROM pops WHERE deleted_at IS NULL)::int pops,
        (SELECT count(*) FROM fiber_links WHERE deleted_at IS NULL)::int links,
        (SELECT coalesce(sum(distance_m),0) FROM passive_metro)+(SELECT coalesce(sum(distance_m),0) FROM passive_backhaul) cable,
        (SELECT coalesce(sum(quantity),0) FROM pop_equipment WHERE deleted_at IS NULL) equipment`
    );
    const result = q.rows[0];
    dashboardCache = { data: result, expiresAt: now + 5 * 60 * 1000 };
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const sourceRowFilter = `jsonb_typeof(row_data->'cells') = 'array' AND COALESCE(row_data->'cells'->>0,'') ~ '^[0-9]+(\\.[0-9]+)?$'`;

async function buildSheetHeaders(sheetName) {
  if (headerCache.has(sheetName)) {
    const cached = headerCache.get(sheetName);
    if (cached.expiresAt > Date.now()) return cached.headers;
  }
  try {
    const topRowsRes = await pool.query(
      'SELECT source_row, row_data FROM network_asset_sheet_rows WHERE sheet_name=$1 ORDER BY source_row ASC LIMIT 10',
      [sheetName]
    );
    if (!topRowsRes.rowCount) return [];
    const rows = topRowsRes.rows;
    const storedHeaders = rows[0]?.row_data?.headers;

    const headerRows = rows.filter(r => {
      const first = String(r.row_data?.cells?.[0] || '').trim();
      return !/^\d+(\.\d+)?$/.test(first);
    });

    const sampleRowsRes = await pool.query(
      `SELECT row_data FROM network_asset_sheet_rows WHERE sheet_name=$1 AND ${sourceRowFilter} ORDER BY source_row ASC LIMIT 30`,
      [sheetName]
    );

    let maxLen = Array.isArray(storedHeaders) ? storedHeaders.length : 0;
    const allRows = [...headerRows, ...sampleRowsRes.rows];
    allRows.forEach(r => {
      const cells = r.row_data?.cells || [];
      for (let c = cells.length - 1; c >= 0; c--) {
        if (cells[c] != null && String(cells[c]).trim() !== '') {
          if (c + 1 > maxLen) maxLen = c + 1;
          break;
        }
      }
    });

    if (maxLen === 0) maxLen = 1;

    const result = [];
    for (let i = 0; i < maxLen; i++) {
      if (Array.isArray(storedHeaders) && storedHeaders[i] && String(storedHeaders[i]).trim()) {
        result.push(String(storedHeaders[i]).trim());
        continue;
      }

      let topSection = '';
      const row0Cells = headerRows[0]?.row_data?.cells || [];
      for (let j = i; j >= 0; j--) {
        const val = row0Cells[j] != null ? String(row0Cells[j]).trim() : '';
        if (val) { topSection = val; break; }
      }

      const sub1 = headerRows[0]?.row_data?.cells?.[i] != null ? String(headerRows[0].row_data.cells[i]).trim() : '';
      const sub2 = headerRows[1]?.row_data?.cells?.[i] != null ? String(headerRows[1].row_data.cells[i]).trim() : '';
      const sub3 = headerRows[2]?.row_data?.cells?.[i] != null ? String(headerRows[2].row_data.cells[i]).trim() : '';

      let label = '';
      const parts = [];
      if (sub1 && sub1 !== topSection) parts.push(sub1);
      if (sub2 && sub2 !== topSection && !parts.includes(sub2)) parts.push(sub2);
      if (sub3 && sub3 !== topSection && !parts.includes(sub3)) parts.push(sub3);

      if (parts.length > 0) {
        if (topSection && topSection !== sub1) {
          label = `${topSection} - ${parts.join(' ')}`;
        } else {
          label = parts.join(' ');
        }
      } else if (sub1) {
        label = sub1;
      } else if (topSection && topSection !== 'SN') {
        label = `${topSection} (${i + 1})`;
      } else if (i === 0) {
        label = 'SN';
      } else {
        label = `Column ${i + 1}`;
      }

      result.push(label);
    }
    headerCache.set(sheetName, { headers: result, expiresAt: Date.now() + 10 * 60 * 1000 });
    return result;
  } catch {
    return [];
  }
}


async function getCustomHeaders(viewKey, defaultHeaders = []) {
  try {
    const res = await pool.query(
      `SELECT row_data->'headers' headers FROM network_asset_sheet_rows WHERE sheet_name=$1 LIMIT 1`,
      [`META_HEADERS_${viewKey}`]
    );
    const custom = res.rows[0]?.headers;
    if (Array.isArray(custom) && custom.length > 0) {
      return defaultHeaders.map((dh, i) => (custom[i] && String(custom[i]).trim() ? String(custom[i]).trim() : dh));
    }
  } catch {}
  return defaultHeaders;
}

router.put('/headers/:viewKey', async (req, res) => {
  try {
    const viewKey = req.params.viewKey;
    const index = Number(req.body?.index);
    const name = String(req.body?.name || '').trim();
    if (!Number.isInteger(index) || index < 0 || !name) {
      return res.status(400).json({ error: 'Invalid header payload' });
    }

    invalidateCaches(viewKey);

    const isSheet = await pool.query('SELECT 1 FROM network_asset_sheet_rows WHERE sheet_name=$1 LIMIT 1', [viewKey]);
    if (isSheet.rowCount) {
      let currentHeaders = await buildSheetHeaders(viewKey);
      while (currentHeaders.length <= index) {
        currentHeaders.push(`Column ${currentHeaders.length + 1}`);
      }
      currentHeaders[index] = name;
      const rows = await pool.query('SELECT id,row_data FROM network_asset_sheet_rows WHERE sheet_name=$1', [viewKey]);
      for (const r of rows.rows) {
        const data = r.row_data || {};
        data.headers = currentHeaders;
        await pool.query('UPDATE network_asset_sheet_rows SET row_data=$1 WHERE id=$2', [JSON.stringify(data), r.id]);
      }
      await audit(req, 'network_asset_sheet_rows', 0, `Header Column ${index + 1}`, '', name);
      return res.json({ success: true, headers: currentHeaders });
    }

    const metaSheet = `META_HEADERS_${viewKey}`;
    const existing = await pool.query('SELECT id, row_data FROM network_asset_sheet_rows WHERE sheet_name=$1 LIMIT 1', [metaSheet]);
    let currentHeaders = existing.rows[0]?.row_data?.headers || [];
    while (currentHeaders.length <= index) {
      currentHeaders.push('');
    }
    currentHeaders[index] = name;
    if (existing.rowCount) {
      await pool.query('UPDATE network_asset_sheet_rows SET row_data=$1 WHERE id=$2', [JSON.stringify({ headers: currentHeaders }), existing.rows[0].id]);
    } else {
      await pool.query('INSERT INTO network_asset_sheet_rows(sheet_name, source_row, row_data) VALUES($1, 0, $2)', [metaSheet, JSON.stringify({ headers: currentHeaders })]);
    }
    await audit(req, 'custom_headers', 0, `Header Column ${index + 1}`, '', name);
    res.json({ success: true, headers: currentHeaders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/source/:sheet/headers', async (req, res) => {
  req.params.viewKey = req.params.sheet;
  const isSheet = await pool.query('SELECT 1 FROM network_asset_sheet_rows WHERE sheet_name=$1 LIMIT 1', [req.params.sheet]);
  if (isSheet.rowCount) {
    invalidateCaches(req.params.sheet);
    let currentHeaders = await buildSheetHeaders(req.params.sheet);
    const index = Number(req.body?.index);
    const name = String(req.body?.name || '').trim();
    if (!Number.isInteger(index) || index < 0 || !name) return res.status(400).json({ error: 'Invalid header payload' });
    while (currentHeaders.length <= index) {
      currentHeaders.push(`Column ${currentHeaders.length + 1}`);
    }
    currentHeaders[index] = name;
    const rows = await pool.query('SELECT id,row_data FROM network_asset_sheet_rows WHERE sheet_name=$1', [req.params.sheet]);
    for (const r of rows.rows) {
      const data = r.row_data || {};
      data.headers = currentHeaders;
      await pool.query('UPDATE network_asset_sheet_rows SET row_data=$1 WHERE id=$2', [JSON.stringify(data), r.id]);
    }
    await audit(req, 'network_asset_sheet_rows', 0, `Header Column ${index + 1}`, '', name);
    return res.json({ success: true, headers: currentHeaders });
  }
  return res.status(404).json({ error: 'Sheet not found' });
});

router.put('/source/:sheet/:sourceRow', async (req, res, next) => {
  if (req.params.sourceRow === 'headers') return next();
  const sourceRow = Number.parseInt(req.params.sourceRow, 10);
  if (!Number.isInteger(sourceRow)) return res.status(400).json({ error: 'Invalid source row index' });
  try {
    const found = await pool.query(
      'SELECT id,row_data FROM network_asset_sheet_rows WHERE sheet_name=$1 AND source_row=$2',
      [req.params.sheet, sourceRow]
    );
    if (!found.rowCount) return res.status(404).json({ error: 'Source row not found' });
    const row = found.rows[0],
      index = Number(req.body?.index),
      value = req.body?.value;
    if (!Number.isInteger(index) || index < 0) return res.status(400).json({ error: 'Invalid cell index' });
    const data = row.row_data;
    if (!Array.isArray(data.cells)) data.cells = [];
    const old = data.cells[index] ?? null;
    // Clicking into a cell and back out without typing (or a resend of the same value) must
    // not write a no-op "changed from X to X" history entry — this was the actual cause of
    // "duplicate history just from clicking."
    const changed = String(old ?? '') !== String(value ?? '');
    if (changed) {
      data.cells[index] = value;
      await pool.query('UPDATE network_asset_sheet_rows SET row_data=$1,imported_at=NOW() WHERE id=$2', [
        JSON.stringify(data),
        row.id
      ]);
      const headers = await buildSheetHeaders(req.params.sheet);
      await audit(
        req,
        'network_asset_sheet_rows',
        row.id,
        headers[index] || `Column ${index + 1}`,
        old,
        value
      );
    }
    res.json({ id: row.id, source_row: sourceRow, row_data: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/source/:sheet', async (req, res) => {
  try {
    invalidateCaches(req.params.sheet);
    const headers = await buildSheetHeaders(req.params.sheet);
    const last = await pool.query(
      `SELECT COALESCE(MAX(source_row),0)+1 source_row,COALESCE(MAX(NULLIF(row_data->'cells'->>0,'' )::numeric),0)+1 serial FROM network_asset_sheet_rows WHERE sheet_name=$1 AND ${sourceRowFilter}`,
      [req.params.sheet]
    );
    const cells = Array(headers.length).fill('');
    cells[0] = String(last.rows[0].serial);
    const created = await pool.query(
      'INSERT INTO network_asset_sheet_rows(sheet_name,source_row,row_data) VALUES($1,$2,$3) RETURNING id,source_row,row_data,imported_at',
      [req.params.sheet, last.rows[0].source_row, JSON.stringify({ headers, cells })]
    );
    await audit(req, 'network_asset_sheet_rows', created.rows[0].id, 'Record created', '', `Row ${cells[0]}`);
    res.status(201).json(created.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pops', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim(),
      region = String(req.query.region || '').trim(),
      status = String(req.query.status || '').trim();

    const values = [];
    let where = 'WHERE p.deleted_at IS NULL';
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (p.location_name ILIKE $${values.length} OR coalesce(p.coordinates_raw,'') ILIKE $${values.length})`;
    }
    if (region && region !== 'All') {
      values.push(`%${region}%`);
      where += ` AND r.name ILIKE $${values.length}`;
    }
    if (status && status !== 'All') {
      values.push(status);
      where += ` AND p.status = $${values.length}`;
    }

    const count = await pool.query(
      `SELECT count(DISTINCT p.id)::int total FROM pops p LEFT JOIN regions r ON r.id=p.region_id ${where}`,
      values
    );
    const rows = await pool.query(
      `SELECT p.*,r.name region,t.name territory,coalesce(sum(e.quantity),0)::int equipment_count 
       FROM pops p 
       LEFT JOIN regions r ON r.id=p.region_id 
       LEFT JOIN territories t ON t.id=p.territory_id 
       LEFT JOIN pop_equipment e ON e.pop_id=p.id AND e.deleted_at IS NULL 
       ${where} 
       GROUP BY p.id,r.name,t.name 
       ORDER BY p.location_name 
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );

    const defaultHeaders = ['location_name', 'region', 'territory', 'pop_type', 'status', 'notes'];
    const headers = await getCustomHeaders('pops', defaultHeaders);
    res.json({ rows: rows.rows, total: count.rows[0].total, page, pageSize: limit, headers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pops', async (req, res) => {
  invalidateCaches('pops');
  const b = req.body;
  const x = await pool.query(
    'INSERT INTO pops(region_id,territory_id,location_name,latitude,longitude,coordinates_raw,age_year,pop_type,status,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
    [
      b.region_id || null,
      b.territory_id || null,
      b.location_name,
      b.latitude || null,
      b.longitude || null,
      b.coordinates_raw || null,
      b.age_year || null,
      b.pop_type || 'Indoor',
      b.status || 'Active',
      b.notes || null,
      req.user.id
    ]
  );
  await audit(req, 'pops', x.rows[0].id, 'created', '', b.location_name);
  res.status(201).json(x.rows[0]);
});

router.put('/pops/:id', async (req, res) => {
  invalidateCaches('pops');
  const b = req.body;
  const x = await pool.query(
    'UPDATE pops SET region_id=$1,territory_id=$2,location_name=$3,latitude=$4,longitude=$5,coordinates_raw=$6,age_year=$7,pop_type=$8,status=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *',
    [
      b.region_id || null,
      b.territory_id || null,
      b.location_name,
      b.latitude || null,
      b.longitude || null,
      b.coordinates_raw || null,
      b.age_year || null,
      b.pop_type,
      b.status,
      b.notes || null,
      req.params.id
    ]
  );
  await audit(req, 'pops', req.params.id, 'updated', '', '');
  res.json(x.rows[0]);
});

router.get('/equipment', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim(),
      region = String(req.query.region || '').trim(),
      status = String(req.query.status || '').trim();

    const values = [];
    let where = 'WHERE e.deleted_at IS NULL AND p.deleted_at IS NULL';

    if (search) {
      values.push(`%${search}%`);
      where += ` AND (p.location_name ILIKE $${values.length} OR c.model_name ILIKE $${values.length} OR coalesce(e.serial_number,'') ILIKE $${values.length})`;
    }
    if (region && region !== 'All') {
      values.push(`%${region}%`);
      where += ` AND r.name ILIKE $${values.length}`;
    }
    if (status && status !== 'All') {
      values.push(status);
      where += ` AND e.status = $${values.length}`;
    }

    const count = await pool.query(
      `SELECT count(*)::int total 
       FROM pop_equipment e 
       JOIN pops p ON p.id=e.pop_id 
       JOIN equipment_catalogue c ON c.id=e.equipment_catalogue_id 
       LEFT JOIN regions r ON r.id=p.region_id 
       ${where}`,
      values
    );
    const rows = await pool.query(
      `SELECT e.id,p.location_name,r.name region,t.name territory,c.category,c.model_name,e.quantity,e.serial_number,e.status 
       FROM pop_equipment e 
       JOIN pops p ON p.id=e.pop_id 
       JOIN equipment_catalogue c ON c.id=e.equipment_catalogue_id 
       LEFT JOIN regions r ON r.id=p.region_id 
       LEFT JOIN territories t ON t.id=p.territory_id 
       ${where} 
       ORDER BY p.location_name,c.model_name 
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );

    const defaultHeaders = ['location_name', 'region', 'territory', 'category', 'model_name', 'quantity', 'serial_number', 'status'];
    const headers = await getCustomHeaders('equipment', defaultHeaders);
    res.json({ rows: rows.rows, total: count.rows[0].total, page, pageSize: limit, headers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/equipment', async (req, res) => {
  invalidateCaches('equipment');
  const b = req.body;
  const x = await pool.query(
    'INSERT INTO pop_equipment(pop_id,equipment_catalogue_id,quantity,serial_number,status) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [b.pop_id, b.equipment_catalogue_id, b.quantity || 0, b.serial_number || null, b.status || 'Active']
  );
  await audit(req, 'pop_equipment', x.rows[0].id, 'created', '', JSON.stringify(b));
  res.status(201).json(x.rows[0]);
});

router.put('/equipment/:id', async (req, res) => {
  try {
    invalidateCaches('equipment');
    const id = req.params.id,
      b = req.body;
    const allowed = ['quantity', 'serial_number', 'status'];
    const before = await pool.query('SELECT * FROM pop_equipment WHERE id=$1', [id]);
    if (!before.rowCount) return res.status(404).json({ error: 'Equipment record not found' });
    const updates = [],
      values = [];
    // One (field, before, after) audit entry per changed field — matches the sheet grid's
    // per-cell history instead of the old generic "updated" stub with no before/after values,
    // and skips the audit write entirely for a field that was resent unchanged.
    const changes = [];
    for (const key of allowed) {
      if (b[key] === undefined) continue;
      if (String(before.rows[0][key] ?? '') === String(b[key] ?? '')) continue;
      values.push(b[key]);
      updates.push(`${key}=$${values.length}`);
      changes.push({ key, oldValue: before.rows[0][key], newValue: b[key] });
    }
    if (!updates.length) return res.json(before.rows[0]);
    values.push(id);
    const q = await pool.query(`UPDATE pop_equipment SET ${updates.join(',')} WHERE id=$${values.length} RETURNING *`, values);
    for (const c of changes) await audit(req, 'pop_equipment', id, c.key, c.oldValue, c.newValue);
    res.json(q.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/passive/:kind', async (req, res) => {
  try {
    const table = req.params.kind === 'backhaul' ? 'passive_backhaul' : 'passive_metro';
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim(),
      region = String(req.query.region || '').trim();

    const values = [];
    let where = '';
    if (search) {
      values.push(`%${search}%`);
      where += ` WHERE r.name ILIKE $${values.length}`;
    }
    if (region && region !== 'All') {
      values.push(`%${region}%`);
      where += `${where ? ' AND' : ' WHERE'} r.name ILIKE $${values.length}`;
    }

    const count = await pool.query(`SELECT count(*)::int total FROM ${table} p JOIN regions r ON r.id=p.region_id ${where}`, values);
    const rows = await pool.query(
      `SELECT p.*,r.name region FROM ${table} p JOIN regions r ON r.id=p.region_id ${where} ORDER BY r.name LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );

    const defaultHeaders = ['region', 'distance_m', 'pole_brackets_pcs', 'tension_clamps_pcs', 'suspensions_pcs', 'buckles_pcs', 'steel_band_m', 'closures_pcs'];
    const headers = await getCustomHeaders(`passive_${req.params.kind}`, defaultHeaders);
    res.json({ rows: rows.rows, total: count.rows[0].total, page, pageSize: limit, headers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/passive/:kind', async (req, res) => {
  const table = req.params.kind === 'backhaul' ? 'passive_backhaul' : 'passive_metro',
    b = req.body;
  invalidateCaches();
  const cols = ['distance_m', 'pole_brackets_pcs', 'tension_clamps_pcs', 'suspensions_pcs', 'buckles_pcs', 'steel_band_m', 'closures_pcs'];
  const x = await pool.query(
    `INSERT INTO ${table}(region_id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => `$${i + 2}`).join(',')}) ON CONFLICT(region_id) DO UPDATE SET ${cols.map((c, i) => `${c}=EXCLUDED.${c}`).join(',')} RETURNING *`,
    [b.region_id, ...cols.map(c => b[c] || 0)]
  );
  await audit(req, table, x.rows[0].id, 'saved', '', '');
  res.json(x.rows[0]);
});

router.get('/links', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim();

    const values = [];
    let where = 'WHERE f.deleted_at IS NULL';
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (f.name ILIKE $1 OR r.name ILIKE $1 OR t.name ILIKE $1)`;
    }
    const count = await pool.query(`SELECT count(*)::int total FROM fiber_links f LEFT JOIN regions r ON r.id=f.region_id LEFT JOIN territories t ON t.id=f.territory_id ${where}`, values);
    const rows = await pool.query(
      `SELECT f.*,r.name region,t.name territory,p.location_name pop_name FROM fiber_links f LEFT JOIN regions r ON r.id=f.region_id LEFT JOIN territories t ON t.id=f.territory_id LEFT JOIN pops p ON p.id=f.pop_id ${where} ORDER BY f.name LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );
    res.json({ rows: rows.rows, total: count.rows[0].total, page, pageSize: limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/links', async (req, res) => {
  invalidateCaches('links');
  const b = req.body;
  const x = await pool.query(
    `INSERT INTO fiber_links(region_id,territory_id,name,distance_m,sfp_distance_km,cable_type,age_year,status,commissioned,notes,pop_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      b.region_id || null,
      b.territory_id || null,
      b.name,
      b.distance_m || 0,
      b.sfp_distance_km || null,
      b.cable_type || null,
      b.age_year || null,
      b.status || 'Active',
      !!b.commissioned,
      b.notes || null,
      b.pop_id || null
    ]
  );
  await audit(req, 'fiber_links', x.rows[0].id, 'created', '', b.name);
  res.status(201).json(x.rows[0]);
});

router.get('/catalogue', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1),
      limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 50)),
      search = String(req.query.search || '').trim();

    const cacheKey = `${page}-${limit}-${search}`;
    if (catalogueCache.has(cacheKey)) {
      const cached = catalogueCache.get(cacheKey);
      if (cached.expiresAt > Date.now()) return res.json(cached.data);
    }

    const values = [];
    let where = 'WHERE deleted_at IS NULL';
    if (search) {
      values.push(`%${search}%`);
      where += ` AND (category ILIKE $1 OR model_name ILIKE $1 OR coalesce(notes,'') ILIKE $1)`;
    }
    const count = await pool.query(`SELECT count(*)::int total FROM equipment_catalogue ${where}`, values);
    const rows = await pool.query(
      `SELECT id,category,model_name,notes FROM equipment_catalogue ${where} ORDER BY category,model_name LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]
    );

    const defaultHeaders = ['category', 'model_name', 'notes'];
    const headers = await getCustomHeaders('catalogue', defaultHeaders);
    const responsePayload = { rows: rows.rows, total: count.rows[0].total, page, pageSize: limit, headers };

    catalogueCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 60 * 60 * 1000 });
    res.json(responsePayload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/catalogue', async (req, res) => {
  if (!isSystemAdminAccount(req.user)) return res.status(403).json({ error: 'System Admin only' });
  catalogueCache.clear();
  const b = req.body;
  const x = await pool.query('INSERT INTO equipment_catalogue(category,model_name,notes) VALUES($1,$2,$3) RETURNING *', [
    b.category,
    b.model_name,
    b.notes || null
  ]);
  await audit(req, 'equipment_catalogue', x.rows[0].id, 'created', '', b.model_name);
  res.status(201).json(x.rows[0]);
});

router.put('/catalogue/:id', async (req, res) => {
  try {
    catalogueCache.clear();
    const id = req.params.id,
      b = req.body;
    const allowed = ['category', 'model_name', 'notes'];
    const before = await pool.query('SELECT * FROM equipment_catalogue WHERE id=$1', [id]);
    if (!before.rowCount) return res.status(404).json({ error: 'Catalogue entry not found' });
    const updates = [],
      values = [];
    const changes = [];
    for (const key of allowed) {
      if (b[key] === undefined) continue;
      if (String(before.rows[0][key] ?? '') === String(b[key] ?? '')) continue;
      values.push(b[key]);
      updates.push(`${key}=$${values.length}`);
      changes.push({ key, oldValue: before.rows[0][key], newValue: b[key] });
    }
    if (!updates.length) return res.json(before.rows[0]);
    values.push(id);
    const q = await pool.query(`UPDATE equipment_catalogue SET ${updates.join(',')} WHERE id=$${values.length} RETURNING *`, values);
    for (const c of changes) await audit(req, 'equipment_catalogue', id, c.key, c.oldValue, c.newValue);
    res.json(q.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/audit/:table/:id', async (req, res) =>
  res.json(
    (
      await pool.query(
        `SELECT a.*,COALESCE(NULLIF(trim(concat_ws(' ',u.first_name,u.last_name)),''),u.username,'System') changed_by FROM asset_audit_log a LEFT JOIN users u ON u.id=a.changed_by_user_id WHERE a.table_name=$1 AND a.record_id=$2 ORDER BY a.changed_at DESC`,
        [req.params.table, req.params.id]
      )
    ).rows
  )
);

const regions = [
  'Ashanti',
  'Central',
  'Eastern',
  'Greater Accra',
  'Volta',
  'Oti',
  'Western',
  'Western North',
  'Bono East',
  'Ahafo',
  'Brong Ahafo',
  'Savannah',
  'Northern',
  'North East',
  'Upper East',
  'Upper West'
];
const catalogue = [
  ['CPE', 'Mikrotik'],
  ['CPE', 'VSOL 2DAC'],
  ['CPE', 'ONT'],
  ['Router', 'Mikrotik CCR1072-1G-8S+'],
  ['Router', 'Mikrotik CCR2216-1G-12XS-2XQ'],
  ['Router', 'Mikrotik RB5009UG+S+'],
  ['Router', 'Cisco ASR1001-X'],
  ['OLT', 'VSOL OLT'],
  ['OLT', 'Furukawa OLT LD3008'],
  ['OLT', 'Furukawa FK-OLT-G2500_SFU'],
  ['OLT', 'Furukawa OLT LD3032'],
  ['Switch', 'Mikrotik CRS326-24S+2Q+'],
  ['Switch', 'Mikrotik CRS305-1G-4S+'],
  ['Switch', 'Mikrotik CRS328-4C-20S-4S+'],
  ['Switch', 'Mikrotik CRS317-1G-16S+'],
  ['Switch', 'Mikrotik CRS510-8XS-2XQ'],
  ['Switch', 'Mikrotik CRS504-8XS-2XQ'],
  ['Switch', 'FS Campus Switch S5860-20SQ'],
  ['Switch', 'Cisco WS-C3850-24P'],
  ['Server', 'HP ProLiant DL380p Gen8'],
  ['Server', 'Dell PowerEdge R730'],
  ['Server', '24Online Server']
];

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS regions(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS territories(id SERIAL PRIMARY KEY,name TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS equipment_catalogue(id SERIAL PRIMARY KEY,category TEXT NOT NULL,model_name TEXT UNIQUE NOT NULL,notes TEXT,deleted_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pops(id SERIAL PRIMARY KEY,region_id INT REFERENCES regions(id),territory_id INT REFERENCES territories(id),location_name TEXT NOT NULL,latitude NUMERIC,longitude NUMERIC,coordinates_raw TEXT,age_year INT,pop_type TEXT,status TEXT DEFAULT 'Active',notes TEXT,created_by INT,created_at TIMESTAMP DEFAULT NOW(),updated_at TIMESTAMP DEFAULT NOW(),deleted_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pop_equipment(id SERIAL PRIMARY KEY,pop_id INT REFERENCES pops(id),equipment_catalogue_id INT REFERENCES equipment_catalogue(id),quantity INT DEFAULT 0,serial_number TEXT,status TEXT DEFAULT 'Active',deleted_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS pop_cabinets(id SERIAL PRIMARY KEY,pop_id INT REFERENCES pops(id),size TEXT,quantity INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pop_odfs(id SERIAL PRIMARY KEY,pop_id INT REFERENCES pops(id),size TEXT,quantity INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS pop_power(id SERIAL PRIMARY KEY,pop_id INT UNIQUE REFERENCES pops(id),ups_qty INT DEFAULT 0,stabilizer_qty INT DEFAULT 0,battery_bank_qty INT DEFAULT 0,battery_containment_qty INT DEFAULT 0,battery_100ah_qty INT DEFAULT 0,battery_200ah_qty INT DEFAULT 0,inverter_5kva_qty INT DEFAULT 0,inverter_3kva_qty INT DEFAULT 0,inverter_qty INT DEFAULT 0,avr_qty INT DEFAULT 0,solar_qty INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS passive_metro(id SERIAL PRIMARY KEY,region_id INT UNIQUE REFERENCES regions(id),distance_m NUMERIC DEFAULT 0,pole_brackets_pcs INT DEFAULT 0,tension_clamps_pcs INT DEFAULT 0,suspensions_pcs INT DEFAULT 0,buckles_pcs INT DEFAULT 0,steel_band_m NUMERIC DEFAULT 0,closures_pcs INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS passive_backhaul(LIKE passive_metro INCLUDING ALL);
    CREATE TABLE IF NOT EXISTS fiber_links(id SERIAL PRIMARY KEY,region_id INT REFERENCES regions(id),territory_id INT REFERENCES territories(id),name TEXT NOT NULL,coordinates_a_end TEXT,coordinates_b_end TEXT,fiber_count INT,distance_m NUMERIC DEFAULT 0,sfp_distance_km NUMERIC,cable_type TEXT,age_year INT,status TEXT DEFAULT 'Active',commissioned BOOLEAN,total_new_poles INT,new_9m_poles INT,new_11m_poles INT,notes TEXT,pop_id INT REFERENCES pops(id),deleted_at TIMESTAMP);
    CREATE TABLE IF NOT EXISTS asset_audit_log(id SERIAL PRIMARY KEY,table_name TEXT,record_id INT,field_changed TEXT,old_value TEXT,new_value TEXT,changed_by_user_id INT,changed_at TIMESTAMP DEFAULT NOW());

    CREATE INDEX IF NOT EXISTS idx_sheet_rows_name ON network_asset_sheet_rows(sheet_name);
    CREATE INDEX IF NOT EXISTS idx_sheet_rows_gin ON network_asset_sheet_rows USING gin (row_data);
    -- Matches sourceRowFilter below exactly: without this, the planner falls back to a full
    -- table scan (all sheets combined) instead of the plain sheet_name index once a sheet's
    -- share of the table gets large (e.g. ECG Metro was ~45% of all rows, ~600ms per request).
    -- A partial index over exactly the predicate the route always filters by turns that into
    -- a sub-millisecond index-only scan.
    CREATE INDEX IF NOT EXISTS idx_sheet_rows_valid_source_row ON network_asset_sheet_rows (sheet_name, source_row)
      WHERE jsonb_typeof(row_data->'cells') = 'array' AND COALESCE(row_data->'cells'->>0,'') ~ '^[0-9]+(\\.[0-9]+)?$';
    CREATE INDEX IF NOT EXISTS idx_pops_region ON pops(region_id);
    CREATE INDEX IF NOT EXISTS idx_pops_status ON pops(status);
    CREATE INDEX IF NOT EXISTS idx_pops_territory ON pops(territory_id);
    CREATE INDEX IF NOT EXISTS idx_pop_equipment_pop ON pop_equipment(pop_id);
    CREATE INDEX IF NOT EXISTS idx_pop_equipment_status ON pop_equipment(status);
    CREATE INDEX IF NOT EXISTS idx_fiber_links_region ON fiber_links(region_id);
    CREATE INDEX IF NOT EXISTS idx_fiber_links_status ON fiber_links(status);
    CREATE INDEX IF NOT EXISTS idx_fiber_links_territory ON fiber_links(territory_id);
    CREATE INDEX IF NOT EXISTS idx_passive_metro_region ON passive_metro(region_id);
    CREATE INDEX IF NOT EXISTS idx_passive_backhaul_region ON passive_backhaul(region_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON asset_audit_log(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON asset_audit_log(changed_at);
  `);
  for (const n of regions) await pool.query('INSERT INTO regions(name) VALUES($1) ON CONFLICT DO NOTHING', [n]);
  for (const n of ['ECG', 'NEDCO']) await pool.query('INSERT INTO territories(name) VALUES($1) ON CONFLICT DO NOTHING', [n]);
  for (const [c, m] of catalogue) await pool.query('INSERT INTO equipment_catalogue(category,model_name) VALUES($1,$2) ON CONFLICT DO NOTHING', [c, m]);

  // The search box does `row_data::text ILIKE '%term%'` — a leading wildcard, which a plain
  // btree/gin(jsonb) index can never use (idx_sheet_rows_gin above is jsonb containment only,
  // dead weight for this query shape). pg_trgm's trigram GIN index is what actually makes
  // substring ILIKE fast, turning a multi-hundred-ms sequential scan into a few ms on a large
  // sheet like ECG Metro. Isolated in its own try/catch — CREATE EXTENSION needs a privilege
  // the app's DB role might not have on every environment, and it must never take the rest of
  // init() (base tables/indexes) down with it if that's missing here.
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sheet_rows_text_trgm ON network_asset_sheet_rows USING gin ((row_data::text) gin_trgm_ops)`);
  } catch (e) {
    console.warn('[network-assets] pg_trgm search index unavailable, search will stay a sequential scan:', e.message);
  }
}

router.use(async (_q, _s, next) => {
  try {
    await ensureInit();
    next();
  } catch (e) {
    next(e);
  }
});

export default router;
