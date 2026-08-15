// Asset Manager API – categories, locations, vendors, personnel, assets, assignments, maintenance
import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateToken);

const softDeleteCol = (table) => `deleted_at`;
const whereNotDeleted = (table) => `${table}.deleted_at IS NULL`;

// ---------- Asset Categories ----------
router.get('/categories', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, description, created_at FROM asset_categories WHERE ${whereNotDeleted('asset_categories')} ORDER BY name`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /assets/categories', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `INSERT INTO asset_categories (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at`,
      [name.trim(), (description || '').trim() || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('POST /assets/categories', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `UPDATE asset_categories SET name = $1, description = $2 WHERE id = $3 AND ${whereNotDeleted('asset_categories')} RETURNING id, name, description, created_at`,
      [name.trim(), (description || '').trim() || null, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT /assets/categories/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE asset_categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/categories/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Asset Locations ----------
router.get('/locations', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, description, created_at FROM asset_locations WHERE ${whereNotDeleted('asset_locations')} ORDER BY name`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /assets/locations', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/locations', async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `INSERT INTO asset_locations (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at`,
      [name.trim(), (description || '').trim() || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('POST /assets/locations', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/locations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `UPDATE asset_locations SET name = $1, description = $2 WHERE id = $3 AND ${whereNotDeleted('asset_locations')} RETURNING id, name, description, created_at`,
      [name.trim(), (description || '').trim() || null, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT /assets/locations/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/locations/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE asset_locations SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Location not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/locations/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Asset Vendors ----------
router.get('/vendors', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, contact_person, phone, email, address, type, services, website, notes, created_at
       FROM asset_vendors WHERE ${whereNotDeleted('asset_vendors')} ORDER BY name`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /assets/vendors', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/vendors/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `SELECT id, name, contact_person, phone, email, address, type, services, website, notes, created_at
       FROM asset_vendors WHERE id = $1 AND ${whereNotDeleted('asset_vendors')}`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('GET /assets/vendors/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/vendors', async (req, res) => {
  try {
    const { name, contact_person, phone, email, address, type, services, website, notes } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `INSERT INTO asset_vendors (name, contact_person, phone, email, address, type, services, website, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, contact_person, phone, email, address, type, services, website, notes, created_at`,
      [
        name.trim(),
        (contact_person || '').trim() || null,
        (phone || '').trim() || null,
        (email || '').trim() || null,
        (address || '').trim() || null,
        type && ['supplier', 'repair_technician', 'service_provider', 'manufacturer'].includes(type) ? type : 'supplier',
        (services || '').trim() || null,
        (website || '').trim() || null,
        (notes || '').trim() || null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('POST /assets/vendors', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/vendors/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, contact_person, phone, email, address, type, services, website, notes } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const r = await pool.query(
      `UPDATE asset_vendors SET name=$1, contact_person=$2, phone=$3, email=$4, address=$5, type=$6, services=$7, website=$8, notes=$9
       WHERE id = $10 AND ${whereNotDeleted('asset_vendors')}
       RETURNING id, name, contact_person, phone, email, address, type, services, website, notes, created_at`,
      [
        name.trim(),
        (contact_person || '').trim() || null,
        (phone || '').trim() || null,
        (email || '').trim() || null,
        (address || '').trim() || null,
        type && ['supplier', 'repair_technician', 'service_provider', 'manufacturer'].includes(type) ? type : 'supplier',
        (services || '').trim() || null,
        (website || '').trim() || null,
        (notes || '').trim() || null,
        id,
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT /assets/vendors/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/vendors/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE asset_vendors SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Vendor not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/vendors/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Asset Personnel (people) ----------
router.get('/people', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, first_name, last_name, personnel_number, job_title, "group", location, email, phone, created_at
       FROM asset_personnel WHERE ${whereNotDeleted('asset_personnel')} ORDER BY last_name, first_name`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /assets/people', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/people/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `SELECT id, first_name, last_name, personnel_number, job_title, "group", location, email, phone, created_at
       FROM asset_personnel WHERE id = $1 AND ${whereNotDeleted('asset_personnel')}`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Person not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('GET /assets/people/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/people', async (req, res) => {
  try {
    const { first_name, last_name, personnel_number, job_title, group, location, email, phone } = req.body || {};
    if (!first_name?.trim() || !last_name?.trim()) return res.status(400).json({ error: 'First name and last name are required' });
    const r = await pool.query(
      `INSERT INTO asset_personnel (first_name, last_name, personnel_number, job_title, "group", location, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, first_name, last_name, personnel_number, job_title, "group", location, email, phone, created_at`,
      [
        first_name.trim(),
        last_name.trim(),
        (personnel_number || '').trim() || null,
        (job_title || '').trim() || null,
        (group || '').trim() || null,
        (location || '').trim() || null,
        (email || '').trim() || null,
        (phone || '').trim() || null,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    console.error('POST /assets/people', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/people/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { first_name, last_name, personnel_number, job_title, group, location, email, phone } = req.body || {};
    if (!first_name?.trim() || !last_name?.trim()) return res.status(400).json({ error: 'First name and last name are required' });
    const r = await pool.query(
      `UPDATE asset_personnel SET first_name=$1, last_name=$2, personnel_number=$3, job_title=$4, "group"=$5, location=$6, email=$7, phone=$8
       WHERE id = $9 AND ${whereNotDeleted('asset_personnel')}
       RETURNING id, first_name, last_name, personnel_number, job_title, "group", location, email, phone, created_at`,
      [
        first_name.trim(),
        last_name.trim(),
        (personnel_number || '').trim() || null,
        (job_title || '').trim() || null,
        (group || '').trim() || null,
        (location || '').trim() || null,
        (email || '').trim() || null,
        (phone || '').trim() || null,
        id,
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Person not found' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error('PUT /assets/people/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/people/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE asset_personnel SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Person not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/people/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// Generate next tag AST-XXXXXX
async function nextAssetTag() {
  const r = await pool.query(
    `SELECT 'AST-' || LPAD((COALESCE(MAX(CAST(SUBSTRING(tag FROM 5) AS INTEGER)), 0) + 1)::TEXT, 6, '0') AS next_tag
     FROM assets WHERE tag ~ '^AST-[0-9]+$'`
  );
  return r.rows[0]?.next_tag || 'AST-000001';
}

// ---------- Assignments: list history ----------
router.get('/assignments/history', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT aa.id, aa.asset_id, aa.person_id, aa.assigned_date, aa.returned_date, aa.condition_before, aa.condition_after, aa.notes_before, aa.notes_after, aa.status,
              a.name AS asset_name, a.tag AS asset_tag,
              (p.first_name || ' ' || p.last_name) AS person_name
       FROM asset_assignments aa
       JOIN assets a ON aa.asset_id = a.id AND a.deleted_at IS NULL
       JOIN asset_personnel p ON aa.person_id = p.id AND p.deleted_at IS NULL
       ORDER BY aa.assigned_date DESC`
    );
    const rows = r.rows.map((row) => ({
      id: row.id,
      asset_id: String(row.asset_id),
      person_id: String(row.person_id),
      person_name: row.person_name,
      asset_name: row.asset_name,
      asset_tag: row.asset_tag,
      action: row.status === 'returned' ? 'returned' : 'assigned',
      date: row.status === 'returned' ? (row.returned_date || row.assigned_date) : row.assigned_date,
      condition: row.status === 'returned' ? row.condition_after : row.condition_before,
      notes: row.status === 'returned' ? row.notes_after : row.notes_before,
      status: row.status === 'returned' ? 'Returned' : 'With Person',
    }));
    res.json(rows);
  } catch (e) {
    console.error('GET /assets/assignments/history', e);
    res.status(500).json({ error: e.message });
  }
});

// Assignments by person
router.get('/assignments/by-person/:personId', async (req, res) => {
  try {
    const personId = parseInt(req.params.personId, 10);
    const r = await pool.query(
      `SELECT aa.id, aa.asset_id, aa.assigned_date, aa.returned_date, aa.condition_before, aa.notes_before, aa.status, a.name AS asset_name, a.tag AS asset_tag
       FROM asset_assignments aa
       JOIN assets a ON aa.asset_id = a.id AND a.deleted_at IS NULL
       WHERE aa.person_id = $1 ORDER BY aa.assigned_date DESC`,
      [personId]
    );
    res.json(r.rows.map((row) => ({ ...row, asset_id: String(row.asset_id) })));
  } catch (e) {
    console.error('GET /assets/assignments/by-person/:personId', e);
    res.status(500).json({ error: e.message });
  }
});

// Assign asset to person
router.post('/assignments', async (req, res) => {
  try {
    const { asset_id, person_id, condition_before, notes_before } = req.body || {};
    const aid = parseInt(asset_id, 10);
    const pid = parseInt(person_id, 10);
    if (!aid || !pid) return res.status(400).json({ error: 'asset_id and person_id are required' });
    await pool.query('BEGIN');
    const ins = await pool.query(
      `INSERT INTO asset_assignments (asset_id, person_id, condition_before, notes_before, status) VALUES ($1, $2, $3, $4, 'assigned')
       RETURNING id, asset_id, person_id, assigned_date, status`,
      [aid, pid, (condition_before || '').trim() || null, (notes_before || '').trim() || null]
    );
    await pool.query(
      `UPDATE assets SET status = 'assigned', assigned_to_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [pid, aid]
    );
    await pool.query('COMMIT');
    res.status(201).json(ins.rows[0]);
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('POST /assets/assignments', e);
    res.status(500).json({ error: e.message });
  }
});

// Return asset
router.post('/assignments/:id/return', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { condition_after, notes_after } = req.body || {};
    const r = await pool.query(
      `SELECT asset_id, person_id FROM asset_assignments WHERE id = $1 AND status = 'assigned'`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Assignment not found or already returned' });
    const { asset_id } = r.rows[0];
    await pool.query('BEGIN');
    await pool.query(
      `UPDATE asset_assignments SET returned_date = CURRENT_TIMESTAMP, condition_after = $1, notes_after = $2, status = 'returned' WHERE id = $3`,
      [(condition_after || '').trim() || null, (notes_after || '').trim() || null, id]
    );
    await pool.query(
      `UPDATE assets SET status = 'available', assigned_to_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [asset_id]
    );
    await pool.query('COMMIT');
    res.json({ message: 'Returned' });
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('POST /assets/assignments/:id/return', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Maintenance ----------
router.get('/maintenance/records', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT m.id, m.asset_id, m.type, m.description, m.status, m.technician, m.cost, m.start_date, m.completion_date, m.notes, m.photos, m.created_at, m.updated_at,
              a.name AS asset_name, a.tag AS asset_tag
       FROM asset_maintenance m
       JOIN assets a ON m.asset_id = a.id AND a.deleted_at IS NULL
       WHERE m.deleted_at IS NULL ORDER BY m.start_date DESC`
    );
    res.json(r.rows.map((row) => ({
      ...row,
      id: String(row.id),
      asset_id: String(row.asset_id),
      photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []),
      cost: row.cost != null ? Number(row.cost) : undefined,
    })));
  } catch (e) {
    console.error('GET /assets/maintenance/records', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/maintenance/records/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `SELECT m.*, a.name AS asset_name, a.tag AS asset_tag FROM asset_maintenance m
       JOIN assets a ON m.asset_id = a.id AND a.deleted_at IS NULL WHERE m.id = $1 AND m.deleted_at IS NULL`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Maintenance record not found' });
    const row = r.rows[0];
    res.json({
      ...row,
      id: String(row.id),
      asset_id: String(row.asset_id),
      photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []),
      cost: row.cost != null ? Number(row.cost) : undefined,
    });
  } catch (e) {
    console.error('GET /assets/maintenance/records/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/maintenance/records', async (req, res) => {
  try {
    const { asset_id, type, description, status, technician, cost, start_date, completion_date, notes, photos } = req.body || {};
    const aid = parseInt(asset_id, 10);
    if (!aid) return res.status(400).json({ error: 'asset_id is required' });
    const validType = ['repair', 'service', 'inspection', 'upgrade'].includes(type) ? type : 'repair';
    const validStatus = ['pending', 'in_progress', 'completed', 'not_fixable'].includes(status) ? status : 'pending';
    const photoArr = Array.isArray(photos) ? photos : [];
    const r = await pool.query(
      `INSERT INTO asset_maintenance (asset_id, type, description, status, technician, cost, start_date, completion_date, notes, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, asset_id, type, description, status, technician, cost, start_date, completion_date, notes, photos, created_at, updated_at`,
      [aid, validType, (description || '').trim() || null, validStatus, (technician || '').trim() || null, cost != null && cost !== '' ? parseFloat(cost) : null, start_date || null, completion_date || null, (notes || '').trim() || null, JSON.stringify(photoArr)]
    );
    const row = r.rows[0];
    const a = await pool.query('SELECT name, tag FROM assets WHERE id = $1', [row.asset_id]);
    res.status(201).json({
      ...row,
      id: String(row.id),
      asset_id: String(row.asset_id),
      asset_name: a.rows[0]?.name,
      asset_tag: a.rows[0]?.tag,
      photos: photoArr,
      cost: row.cost != null ? Number(row.cost) : undefined,
    });
  } catch (e) {
    console.error('POST /assets/maintenance/records', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/maintenance/records/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { type, description, status, technician, cost, start_date, completion_date, notes, photos } = req.body || {};
    const r = await pool.query(
      `UPDATE asset_maintenance SET type = COALESCE($1, type), description = COALESCE($2, description), status = COALESCE($3, status),
        technician = COALESCE($4, technician), cost = COALESCE($5, cost), start_date = COALESCE($6, start_date),
        completion_date = COALESCE($7, completion_date), notes = COALESCE($8, notes), photos = COALESCE($9, photos), updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND deleted_at IS NULL RETURNING id, asset_id, type, description, status, technician, cost, start_date, completion_date, notes, photos, created_at, updated_at`,
      [type || undefined, description != null ? (description || '').trim() || null : undefined, status || undefined, technician != null ? (technician || '').trim() || null : undefined, cost !== undefined && cost !== '' ? parseFloat(cost) : undefined, start_date || undefined, completion_date !== undefined ? completion_date || null : undefined, notes != null ? (notes || '').trim() || null : undefined, photos != null ? JSON.stringify(Array.isArray(photos) ? photos : []) : undefined, id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Maintenance record not found' });
    const row = r.rows[0];
    res.json({ ...row, id: String(row.id), asset_id: String(row.asset_id), photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []), cost: row.cost != null ? Number(row.cost) : undefined });
  } catch (e) {
    console.error('PUT /assets/maintenance/records/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/maintenance/records/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(`UPDATE asset_maintenance SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Maintenance record not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/maintenance/records/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// Next tag for new asset form
router.get('/meta/next-tag', async (req, res) => {
  try {
    res.json({ tag: await nextAssetTag() });
  } catch (e) {
    console.error('GET /assets/meta/next-tag', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Assets list ----------
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.id, a.tag, a.name, a.serial_number, a.brand, a.model, a.description,
              a.status, a.purchase_date, a.cost, a.warranty_until, a.photos, a.created_at, a.updated_at,
              ac.name AS category, al.name AS location,
              p.id AS assigned_to_id, (p.first_name || ' ' || p.last_name) AS assigned_to,
              v.id AS vendor_id, v.name AS vendor_name
       FROM assets a
       LEFT JOIN asset_categories ac ON a.category_id = ac.id AND ac.deleted_at IS NULL
       LEFT JOIN asset_locations al ON a.location_id = al.id AND al.deleted_at IS NULL
       LEFT JOIN asset_personnel p ON a.assigned_to_id = p.id AND p.deleted_at IS NULL
       LEFT JOIN asset_vendors v ON a.vendor_id = v.id AND v.deleted_at IS NULL
       WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC`
    );
    res.json(r.rows.map((row) => ({
      ...row,
      id: String(row.id),
      category: row.category || '',
      location: row.location || '',
      assigned_to: row.assigned_to || null,
      photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []),
      cost: row.cost != null ? String(row.cost) : null,
    })));
  } catch (e) {
    console.error('GET /assets', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- Asset by id (detail) ----------
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const r = await pool.query(
      `SELECT a.id, a.tag, a.name, a.serial_number, a.brand, a.model, a.description,
              a.status, a.purchase_date, a.cost, a.warranty_until, a.photos, a.created_at, a.updated_at,
              a.category_id, a.location_id, a.assigned_to_id, a.vendor_id,
              ac.name AS category, al.name AS location,
              (p.first_name || ' ' || p.last_name) AS assigned_to, v.name AS vendor_name
       FROM assets a
       LEFT JOIN asset_categories ac ON a.category_id = ac.id AND ac.deleted_at IS NULL
       LEFT JOIN asset_locations al ON a.location_id = al.id AND al.deleted_at IS NULL
       LEFT JOIN asset_personnel p ON a.assigned_to_id = p.id AND p.deleted_at IS NULL
       LEFT JOIN asset_vendors v ON a.vendor_id = v.id AND v.deleted_at IS NULL
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Asset not found' });
    const row = r.rows[0];
    res.json({
      ...row,
      id: String(row.id),
      category: row.category || '',
      location: row.location || '',
      assigned_to: row.assigned_to || null,
      vendor_name: row.vendor_name || null,
      photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []),
      cost: row.cost != null ? String(row.cost) : null,
    });
  } catch (e) {
    console.error('GET /assets/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, serial_number, brand, model, description, category_id, location_id, status, assigned_to_id, purchase_date, cost, vendor_id, warranty_until, photos } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Asset name is required' });
    const tag = await nextAssetTag();
    const photoArr = Array.isArray(photos) ? photos : [];
    const r = await pool.query(
      `INSERT INTO assets (tag, name, serial_number, brand, model, description, category_id, location_id, status, assigned_to_id, purchase_date, cost, vendor_id, warranty_until, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, tag, name, serial_number, brand, model, description, category_id, location_id, status, assigned_to_id, purchase_date, cost, vendor_id, warranty_until, photos, created_at, updated_at`,
      [tag, name.trim(), (serial_number || '').trim() || null, (brand || '').trim() || null, (model || '').trim() || null, (description || '').trim() || null, category_id ? parseInt(category_id, 10) : null, location_id ? parseInt(location_id, 10) : null, status && ['available', 'assigned', 'in_repair', 'damaged', 'lost', 'retired'].includes(status) ? status : 'available', assigned_to_id ? parseInt(assigned_to_id, 10) : null, purchase_date || null, cost != null && cost !== '' ? parseFloat(cost) : null, vendor_id ? parseInt(vendor_id, 10) : null, warranty_until || null, JSON.stringify(photoArr)]
    );
    const row = r.rows[0];
    const [cat, loc, person, vendor] = await Promise.all([
      row.category_id ? pool.query('SELECT name FROM asset_categories WHERE id = $1', [row.category_id]).then(rr => rr.rows[0]?.name) : null,
      row.location_id ? pool.query('SELECT name FROM asset_locations WHERE id = $1', [row.location_id]).then(rr => rr.rows[0]?.name) : null,
      row.assigned_to_id ? pool.query('SELECT first_name, last_name FROM asset_personnel WHERE id = $1', [row.assigned_to_id]).then(rr => rr.rows[0] ? `${rr.rows[0].first_name} ${rr.rows[0].last_name}` : null) : null,
      row.vendor_id ? pool.query('SELECT name FROM asset_vendors WHERE id = $1', [row.vendor_id]).then(rr => rr.rows[0]?.name) : null,
    ]);
    res.status(201).json({ ...row, id: String(row.id), category: cat || '', location: loc || '', assigned_to: person || null, vendor_name: vendor || null, photos: photoArr, cost: row.cost != null ? String(row.cost) : null });
  } catch (e) {
    console.error('POST /assets', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      name, serial_number, brand, model, description,
      category_id, location_id, status, assigned_to_id,
      purchase_date, cost, vendor_id, warranty_until, photos,
    } = req.body || {};
    const r = await pool.query(
      `UPDATE assets SET
        name = COALESCE($1, name),
        serial_number = COALESCE($2, serial_number),
        brand = COALESCE($3, brand),
        model = COALESCE($4, model),
        description = COALESCE($5, description),
        category_id = $6,
        location_id = $7,
        status = COALESCE($8, status),
        assigned_to_id = $9,
        purchase_date = $10,
        cost = $11,
        vendor_id = $12,
        warranty_until = $13,
        photos = COALESCE($14, photos),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 AND deleted_at IS NULL
       RETURNING id, tag, name, serial_number, brand, model, description, category_id, location_id, status, assigned_to_id, purchase_date, cost, vendor_id, warranty_until, photos, created_at, updated_at`,
      [
        name != null ? name.trim() : null,
        serial_number != null ? (serial_number || '').trim() || null : null,
        brand != null ? (brand || '').trim() || null : null,
        model != null ? (model || '').trim() || null : null,
        description != null ? (description || '').trim() || null : null,
        category_id != null ? (category_id ? parseInt(category_id, 10) : null) : undefined,
        location_id != null ? (location_id ? parseInt(location_id, 10) : null) : undefined,
        status || undefined,
        assigned_to_id != null ? (assigned_to_id ? parseInt(assigned_to_id, 10) : null) : undefined,
        purchase_date !== undefined ? purchase_date || null : undefined,
        cost !== undefined && cost !== '' ? parseFloat(cost) : undefined,
        vendor_id != null ? (vendor_id ? parseInt(vendor_id, 10) : null) : undefined,
        warranty_until !== undefined ? warranty_until || null : undefined,
        photos != null ? JSON.stringify(Array.isArray(photos) ? photos : []) : undefined,
        id,
      ]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Asset not found' });
    const row = r.rows[0];
    const [cat, loc, person, vendor] = await Promise.all([
      row.category_id ? pool.query('SELECT name FROM asset_categories WHERE id = $1', [row.category_id]).then(rr => rr.rows[0]?.name) : null,
      row.location_id ? pool.query('SELECT name FROM asset_locations WHERE id = $1', [row.location_id]).then(rr => rr.rows[0]?.name) : null,
      row.assigned_to_id ? pool.query('SELECT first_name, last_name FROM asset_personnel WHERE id = $1', [row.assigned_to_id]).then(rr => rr.rows[0] ? `${rr.rows[0].first_name} ${rr.rows[0].last_name}` : null) : null,
      row.vendor_id ? pool.query('SELECT name FROM asset_vendors WHERE id = $1', [row.vendor_id]).then(rr => rr.rows[0]?.name) : null,
    ]);
    res.json({
      ...row,
      id: String(row.id),
      category: cat || '',
      location: loc || '',
      assigned_to: person || null,
      vendor_name: vendor || null,
      photos: Array.isArray(row.photos) ? row.photos : (row.photos ? JSON.parse(row.photos) : []),
      cost: row.cost != null ? String(row.cost) : null,
    });
  } catch (e) {
    console.error('PUT /assets/:id', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query(
      `UPDATE assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('DELETE /assets/:id', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
