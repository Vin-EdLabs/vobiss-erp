import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { effectiveUnitsForUser, isSystemAdminAccount, userHasAnyRole } from '../roles.js';
import { formatPersonName } from '../utils/displayName.js';
import { logUserAction } from '../services/activityLog.js';

const router = express.Router();

const STAFF_ROLES = ['noc', 'noc_manager', 'noc_supervisor'];
const MANAGER_ROLES = ['noc_manager', 'noc_supervisor'];
const clean = (v) => String(v ?? '').trim();
const noteRef = (id) => `INC-${String(id).padStart(3, '0')}`;
const canUseNotes = (user) => isSystemAdminAccount(user) || userHasAnyRole(user, [...STAFF_ROLES, 'director', 'cto']) || effectiveUnitsForUser(user).includes('noc');
const canDeleteNotes = (user) => isSystemAdminAccount(user) || userHasAnyRole(user, [...MANAGER_ROLES, 'director', 'cto']);
const requireNoc = (req, res, next) => canUseNotes(req.user) ? next() : res.status(403).json({ error: 'NOC access is required' });
const requireNocAuth = (req, res, next) => authenticateToken(req, res, () => requireNoc(req, res, next));

// Caches the in-flight promise (not a boolean) so concurrent early requests await the same
// init() call instead of each racing their own CREATE TABLE/INDEX statements.
let initPromise = null;
function ensureInit() {
  if (!initPromise) initPromise = init().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

// Registered before the router-wide auth gate below so a valid share token can serve
// this one read-only detail route without a user session; every other route in this
// file (including mutations) still requires full staff authentication.
router.get('/:id', authenticateOrShareToken('incident_note', requireNocAuth), async (req, res, next) => {
  // /options (registered below) also matches this pattern in Express's route order —
  // fall through to it instead of treating "options" as a numeric id.
  if (!req.isSharedView && !/^\d+$/.test(req.params.id)) return next();
  try {
    await ensureInit();
    const id = req.isSharedView ? req.shareLink.record_id : req.params.id;
    const note = await getNote(id);
    if (!note) return res.status(404).json({ error: 'Incident note not found' });
    res.json({ ...note, reference_no: noteRef(note.id), read_only: note.status === 'Resolved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use(authenticateToken);

export async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS noc_incident_notes (
      id SERIAL PRIMARY KEY, note_date DATE NOT NULL DEFAULT CURRENT_DATE,
      site_name TEXT NOT NULL DEFAULT '', ticket_number TEXT, pop_name TEXT,
      client_name TEXT, source TEXT NOT NULL DEFAULT 'Other', engineer_on_site_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      engineer_on_site_name TEXT, status TEXT NOT NULL DEFAULT 'Open', priority TEXT NOT NULL DEFAULT 'Medium',
      description TEXT NOT NULL DEFAULT '', is_published BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS noc_incident_note_history (
      id SERIAL PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES noc_incident_notes(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_by_name TEXT, changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS noc_incident_notes_date_idx ON noc_incident_notes(note_date DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS noc_incident_note_history_note_idx ON noc_incident_note_history(note_id, changed_at DESC);
  `);
}
const withPeople = `COALESCE(NULLIF(trim(concat_ws(' ', creator.first_name, creator.last_name)), ''), creator.username, 'System') created_by_name, COALESCE(NULLIF(trim(concat_ws(' ', editor.first_name, editor.last_name)), ''), editor.username, 'System') updated_by_name`;
async function getNote(id) {
  const result = await pool.query(`SELECT n.*, ${withPeople} FROM noc_incident_notes n LEFT JOIN users creator ON creator.id=n.created_by LEFT JOIN users editor ON editor.id=n.updated_by WHERE n.id=$1 AND n.deleted_at IS NULL`, [id]);
  return result.rows[0] || null;
}
async function recordHistory(noteId, field, before, after, user) {
  if (String(before ?? '') === String(after ?? '')) return;
  await pool.query(`INSERT INTO noc_incident_note_history(note_id,field_name,old_value,new_value,changed_by,changed_by_name) VALUES($1,$2,$3,$4,$5,$6)`, [noteId, field, String(before ?? ''), String(after ?? ''), user.id, formatPersonName(user, user.username)]);
}

router.use(async (_req, _res, next) => { try { await ensureInit(); next(); } catch (e) { next(e); } });

router.get('/options', requireNoc, async (_req, res) => {
  try {
    const [tickets, sites, users, pops] = await Promise.all([
      pool.query(`SELECT t.ticket_id, t.title, c.customer_name, s.site_name FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN customer_sites s ON s.id=t.site_id ORDER BY t.updated_at DESC NULLS LAST LIMIT 500`),
      pool.query(`SELECT site_name FROM customer_sites ORDER BY site_name LIMIT 500`),
      pool.query(`SELECT id, COALESCE(NULLIF(trim(concat_ws(' ',first_name,last_name)),''),username) full_name FROM users WHERE deleted_at IS NULL ORDER BY full_name`),
      pool.query(`SELECT location_name FROM pops WHERE deleted_at IS NULL ORDER BY location_name LIMIT 500`).catch(() => ({ rows: [] })),
    ]);
    res.json({ tickets: tickets.rows, sites: sites.rows.map((r) => r.site_name).filter(Boolean), users: users.rows, pops: pops.rows.map((r) => r.location_name).filter(Boolean) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireNoc, async (req, res) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : new Date().toISOString().slice(0, 10);
    // An unresolved note carries forward onto every day's view (not just its own note_date)
    // until someone marks it Resolved — otherwise it silently vanishes once its shift day
    // passes, and (per the PUT gate below) becomes impossible to ever resolve.
    const rows = await pool.query(`SELECT n.*, ${withPeople} FROM noc_incident_notes n LEFT JOIN users creator ON creator.id=n.created_by LEFT JOIN users editor ON editor.id=n.updated_by WHERE n.deleted_at IS NULL AND (n.note_date=$1 OR n.status <> 'Resolved') ORDER BY (n.status <> 'Resolved') DESC, n.updated_at DESC, n.id DESC`, [date]);
    res.json({ date, notes: rows.rows.map((row) => ({ ...row, reference_no: noteRef(row.id), read_only: row.status === 'Resolved', carried_over: String(row.note_date).slice(0, 10) !== date })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/history', requireNoc, async (req, res) => {
  const result = await pool.query(`SELECT h.*, COALESCE(NULLIF(trim(concat_ws(' ',u.first_name,u.last_name)),''),u.username,h.changed_by_name,'System') changed_by_name FROM noc_incident_note_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.note_id=$1 ORDER BY h.changed_at DESC,h.id DESC`, [req.params.id]);
  res.json(result.rows);
});

const fields = ['site_name', 'ticket_number', 'source', 'pop_name', 'client_name', 'engineer_on_site_id', 'engineer_on_site_name', 'status', 'priority', 'description'];
const allowed = { source: ['Customer Call', 'Monitoring Alert', 'Field Report', 'Internal', 'Other'], status: ['Open', 'Resolved', 'Monitoring', 'Escalated'], priority: ['Low', 'Medium', 'High', 'Critical'] };
function normalizeBody(body = {}) { const data = Object.fromEntries(fields.map((f) => [f, clean(body[f])])); data.engineer_on_site_id = data.engineer_on_site_id ? Number(data.engineer_on_site_id) : null; const defaults = { source: 'Other', status: 'Open', priority: 'Medium' }; for (const [field, values] of Object.entries(allowed)) if (!values.includes(data[field])) data[field] = defaults[field]; return data; }

router.post('/', requireNoc, async (req, res) => {
  try {
    const data = normalizeBody(req.body); if (!data.site_name) return res.status(400).json({ error: 'Site Name is required' });
    const published = !!req.body?.is_published;
    const created = await pool.query(`INSERT INTO noc_incident_notes(${fields.join(',')},is_published,created_by,updated_by) VALUES(${fields.map((_, i) => `$${i + 1}`).join(',')},$${fields.length + 1},$${fields.length + 2},$${fields.length + 2}) RETURNING id`, [...fields.map((f) => data[f]), published, req.user.id]);
    const id = created.rows[0].id; await recordHistory(id, published ? 'Published' : 'Draft created', '', published ? 'Published' : 'Draft', req.user);
    const ref = noteRef(id); await logUserAction(req.user, { actionType: 'incident_created', recordType: 'incident_note', recordId: id, recordRef: ref, description: `${formatPersonName(req.user, req.user.username)} created Incident Note #${ref} for ${data.site_name}` });
    if (published) await logUserAction(req.user, { actionType: 'incident_published', recordType: 'incident_note', recordId: id, recordRef: ref, description: `${formatPersonName(req.user, req.user.username)} published Incident Note #${ref}` });
    const note = await getNote(id); res.status(201).json({ ...note, reference_no: ref });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', requireNoc, async (req, res) => {
  try {
    const existing = await getNote(req.params.id); if (!existing) return res.status(404).json({ error: 'Incident note not found' });
    // Read-only means "resolved," not "not today" — an open incident must stay editable
    // (and resolvable) across shift changes for as long as it's actually unresolved.
    if (existing.status === 'Resolved') return res.status(403).json({ error: 'This incident note has been resolved and is now read only.' });
    const data = normalizeBody({ ...existing, ...req.body }); const publish = !!req.body?.is_published; const newlyPublished = publish && !existing.is_published;
    await pool.query(`UPDATE noc_incident_notes SET ${fields.map((f, i) => `${f}=$${i + 1}`).join(',')},is_published=$${fields.length + 1},updated_by=$${fields.length + 2},updated_at=CURRENT_TIMESTAMP WHERE id=$${fields.length + 3}`, [...fields.map((f) => data[f]), publish || existing.is_published, req.user.id, existing.id]);
    for (const field of fields) await recordHistory(existing.id, field.replace(/_/g, ' '), existing[field], data[field], req.user);
    if (newlyPublished) await recordHistory(existing.id, 'Published', 'Draft', 'Published', req.user);
    const ref = noteRef(existing.id); const actor = formatPersonName(req.user, req.user.username);
    await logUserAction(req.user, { actionType: 'incident_updated', recordType: 'incident_note', recordId: existing.id, recordRef: ref, description: `${actor} updated Incident Note #${ref}` });
    if (String(existing.status) !== String(data.status)) await logUserAction(req.user, { actionType: 'incident_status', recordType: 'incident_note', recordId: existing.id, recordRef: ref, description: `${actor} marked Incident Note #${ref} as ${data.status}` });
    if (newlyPublished) await logUserAction(req.user, { actionType: 'incident_published', recordType: 'incident_note', recordId: existing.id, recordRef: ref, description: `${actor} published Incident Note #${ref}` });
    const note = await getNote(existing.id); res.json({ ...note, reference_no: ref });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', requireNoc, async (req, res) => { if (!canDeleteNotes(req.user)) return res.status(403).json({ error: 'Only NOC Supervisors or Managers can delete notes' }); const result = await pool.query('UPDATE noc_incident_notes SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING id', [req.params.id]); if (!result.rowCount) return res.status(404).json({ error: 'Incident note not found' }); res.json({ ok: true }); });
export default router;
