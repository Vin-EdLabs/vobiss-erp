import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { formatPersonName } from '../utils/displayName.js';
import {
  REFERENCE_REGISTRY,
  findByReferenceString,
  getRecordSummary,
  searchAllReferenceTypes,
} from '../services/referenceRegistry.js';

const router = express.Router();
router.use(authenticateToken);

// GET /api/references/validate?ref=TCK-000042
router.get('/validate', async (req, res) => {
  try {
    const ref = String(req.query.ref || '').trim();
    if (!ref) return res.status(400).json({ found: false, message: 'A reference number is required.' });
    const summary = await findByReferenceString(ref);
    if (!summary) {
      return res.status(404).json({ found: false, message: 'No record found with this reference number.' });
    }
    res.json({ found: true, ...summary });
  } catch (error) {
    console.error('Error validating reference:', error.stack);
    res.status(500).json({ found: false, message: 'Failed to validate the reference number.' });
  }
});

// GET /api/references/search?q=obuasi — free-text, for pickers that also want to browse.
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const results = q ? await searchAllReferenceTypes(q) : [];
    res.json({ results });
  } catch (error) {
    console.error('Error searching references:', error.stack);
    res.status(500).json({ error: 'Failed to search records.' });
  }
});

// GET /api/references/linked/:type/:id — outbound links (this record → others) and inbound
// (other records → this one), for the "Linked References" section and the Flow Panel.
router.get('/linked/:type/:id', async (req, res) => {
  try {
    const sourceType = req.params.type;
    const sourceId = Number(req.params.id);
    if (!Number.isInteger(sourceId)) return res.status(400).json({ error: 'A valid record id is required.' });

    const [outbound, inbound] = await Promise.all([
      pool.query(
        `SELECT lr.*, u.first_name, u.last_name, u.username
         FROM linked_references lr
         LEFT JOIN users u ON u.id = lr.created_by_user_id
         WHERE lr.source_record_type = $1 AND lr.source_record_id = $2
         ORDER BY lr.created_at DESC`,
        [sourceType, sourceId]
      ),
      pool.query(
        `SELECT lr.*, u.first_name, u.last_name, u.username
         FROM linked_references lr
         LEFT JOIN users u ON u.id = lr.created_by_user_id
         WHERE lr.linked_record_type = $1 AND lr.linked_record_id = $2
         ORDER BY lr.created_at DESC`,
        [sourceType, sourceId]
      ),
    ]);

    const shapeOutbound = (row) => ({
      id: row.id,
      direction: 'outbound',
      type: row.linked_record_type,
      recordId: row.linked_record_id,
      referenceNumber: row.linked_reference_number,
      title: row.linked_title,
      status: row.linked_status,
      pagePath: REFERENCE_REGISTRY[row.linked_record_type]?.path?.(row.linked_record_id) || null,
      createdByName: formatPersonName({ first_name: row.first_name, last_name: row.last_name, username: row.username }, 'Someone'),
      createdAt: row.created_at,
    });

    // Inbound rows only snapshot the linked (target) side, not the source — re-fetch a live
    // summary of each source record so the section shows its current ref/title/status.
    const shapeInbound = async (row) => {
      const summary = await getRecordSummary(row.source_record_type, row.source_record_id);
      return {
        id: row.id,
        direction: 'inbound',
        type: row.source_record_type,
        recordId: row.source_record_id,
        referenceNumber: summary?.referenceNumber || null,
        title: summary?.title || null,
        status: summary?.status || null,
        pagePath: summary?.pagePath || REFERENCE_REGISTRY[row.source_record_type]?.path?.(row.source_record_id) || null,
        createdByName: formatPersonName({ first_name: row.first_name, last_name: row.last_name, username: row.username }, 'Someone'),
        createdAt: row.created_at,
      };
    };

    res.json({
      outbound: outbound.rows.map(shapeOutbound),
      inbound: await Promise.all(inbound.rows.map(shapeInbound)),
    });
  } catch (error) {
    console.error('Error loading linked references:', error.stack);
    res.status(500).json({ error: 'Failed to load linked references.' });
  }
});

// GET /api/references/flow/:type/:id — the record itself + everything connected to it.
router.get('/flow/:type/:id', async (req, res) => {
  try {
    const type = req.params.type;
    const id = Number(req.params.id);
    const record = await getRecordSummary(type, id);
    if (!record) return res.status(404).json({ error: 'Record not found.' });

    const [outbound, inbound] = await Promise.all([
      pool.query(
        `SELECT * FROM linked_references WHERE source_record_type = $1 AND source_record_id = $2 ORDER BY created_at DESC`,
        [type, id]
      ),
      pool.query(
        `SELECT * FROM linked_references WHERE linked_record_type = $1 AND linked_record_id = $2 ORDER BY created_at DESC`,
        [type, id]
      ),
    ]);

    // For inbound links we only stored the linked (target) side's snapshot, not the source's —
    // re-fetch a live summary of each source record so the flow shows its current ref/title/status.
    const inboundSummaries = await Promise.all(
      inbound.rows.map(async (row) => {
        const summary = await getRecordSummary(row.source_record_type, row.source_record_id);
        return summary || {
          type: row.source_record_type,
          id: row.source_record_id,
          referenceNumber: `#${row.source_record_id}`,
          title: row.source_record_type,
          status: null,
          pagePath: REFERENCE_REGISTRY[row.source_record_type]?.path?.(row.source_record_id) || null,
        };
      })
    );

    res.json({
      record,
      linkedTo: outbound.rows.map((row) => ({
        type: row.linked_record_type,
        id: row.linked_record_id,
        referenceNumber: row.linked_reference_number,
        title: row.linked_title,
        status: row.linked_status,
        pagePath: REFERENCE_REGISTRY[row.linked_record_type]?.path?.(row.linked_record_id) || null,
      })),
      linkedFrom: inboundSummaries,
    });
  } catch (error) {
    console.error('Error building reference flow:', error.stack);
    res.status(500).json({ error: 'Failed to load the connected records.' });
  }
});

// POST /api/references/link — { sourceType, sourceId, linkedType, linkedId }
router.post('/link', async (req, res) => {
  try {
    const sourceType = String(req.body?.sourceType || '').trim();
    const sourceId = Number(req.body?.sourceId);
    const linkedType = String(req.body?.linkedType || '').trim();
    const linkedId = Number(req.body?.linkedId);
    if (!sourceType || !Number.isInteger(sourceId) || !linkedType || !Number.isInteger(linkedId)) {
      return res.status(400).json({ error: 'sourceType, sourceId, linkedType and linkedId are required.' });
    }
    const summary = await getRecordSummary(linkedType, linkedId);
    if (!summary) return res.status(404).json({ error: 'The record being linked no longer exists.' });

    const created = await pool.query(
      `INSERT INTO linked_references
         (source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [sourceType, sourceId, linkedType, linkedId, summary.referenceNumber, summary.title, summary.status, req.user.id]
    );
    const row = created.rows[0];
    res.status(201).json({
      id: row.id,
      direction: 'outbound',
      type: linkedType,
      recordId: linkedId,
      referenceNumber: row.linked_reference_number,
      title: row.linked_title,
      status: row.linked_status,
      pagePath: summary.pagePath,
      createdByName: formatPersonName(req.user, req.user.username),
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('Error linking reference:', error.stack);
    res.status(500).json({ error: 'Failed to link the reference.' });
  }
});

// DELETE /api/references/link/:id
router.delete('/link/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM linked_references WHERE id = $1 AND created_by_user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Link not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('Error unlinking reference:', error.stack);
    res.status(500).json({ error: 'Failed to unlink the reference.' });
  }
});

export default router;
