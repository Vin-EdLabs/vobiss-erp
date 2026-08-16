// routes/field.js — FINAL FIXED VERSION (Works 100% with import)
import express from 'express';
import pool from '../db.js';
import { invalidateOnMutation } from '../services/vobiCache.js';

const router = express.Router();
router.use(invalidateOnMutation);

// GET all latest projects
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (project_name)
        id,
        project_name AS "projectName",
        town,
        engineer,
        description,
        status,
        lat,
        lng,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM field_operations
      ORDER BY project_name, updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/field error:', err);
    if (err.code === '42P01') {
      return res.json([]);
    }
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// GET history
router.get('/history/:projectName', async (req, res) => {
  try {
    const { projectName } = req.params;
    const result = await pool.query(`
      SELECT 
        id,
        project_name AS "projectName",
        town,
        engineer,
        description,
        status,
        lat,
        lng,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM field_operations 
      WHERE project_name = $1 
      ORDER BY updated_at DESC
    `, [projectName]);

    res.json(result.rows);
  } catch (err) {
    console.error('GET /api/field/history error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// CREATE new project — FIXED DUPLICATE CHECK
router.post('/', async (req, res) => {
  const { projectName, town = '—', description = '', lat, lng } = req.body || {};

  console.log('POST /api/field received:', req.body); // Debug log

  if (!projectName || lat === undefined || lng === undefined) {
    return res.status(400).json({
      error: 'projectName, lat, and lng are required',
      received: req.body
    });
  }

  const trimmedName = projectName.trim();

  try {
    // Case-insensitive duplicate check
    const existing = await pool.query(
      `SELECT project_name FROM field_operations 
       WHERE LOWER(project_name) = LOWER($1) 
       LIMIT 1`,
      [trimmedName]
    );

    if (existing.rowCount > 0) {
      return res.status(409).json({
        error: 'Project with this name already exists',
        existingProject: existing.rows[0].project_name
      });
    }

    const result = await pool.query(`
      INSERT INTO field_operations 
        (project_name, town, engineer, description, status, lat, lng)
      VALUES ($1, $2, 'Field Engineer', $3, 'Pending', $4, $5)
      RETURNING 
        id, 
        project_name AS "projectName", 
        town, 
        engineer, 
        description, 
        status,
        lat, 
        lng, 
        created_at AS "createdAt", 
        updated_at AS "updatedAt"
    `, [trimmedName, town.trim() || '—', description.trim(), Number(lat), Number(lng)]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('INSERT error:', err);
    res.status(500).json({ error: 'Failed to save project', details: err.message });
  }
});

// UPDATE (creates new version)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { projectName, town = '—', description = '', lat, lng } = req.body || {};

  if (!projectName || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'projectName, town, lat, lng required' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO field_operations 
        (project_name, town, engineer, description, status, lat, lng, created_at, updated_at)
      SELECT $1, $2, engineer, $3, status, $4, $5, created_at, NOW()
      FROM field_operations WHERE id = $6
      RETURNING 
        id, project_name AS "projectName", town, engineer, description, status,
        lat, lng, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [projectName.trim(), town.trim() || '—', description.trim(), Number(lat), Number(lng), id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE all versions
router.delete('/:id', async (req, res) => {
  try {
    const nameRes = await pool.query('SELECT project_name FROM field_operations WHERE id = $1', [req.params.id]);
    if (nameRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectName = nameRes.rows[0].project_name;
    await pool.query('DELETE FROM field_operations WHERE project_name = $1', [projectName]);

    res.json({ success: true, message: `Project "${projectName}" and all versions deleted` });
  } catch (err) {
    console.error('DELETE error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;