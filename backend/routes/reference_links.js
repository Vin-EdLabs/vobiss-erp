import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { searchReferences, getReferenceRecord, getReferenceRequirement, getReferenceRequirementFor } from '../services/referenceLink.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/requirement', async (req, res) => {
  try {
    // ?type=fuel_request|vehicle_request|transport_request selects that type's own toggle;
    // no type keeps the original (Transport) behavior for callers that predate this.
    const type = String(req.query.type || '').trim();
    const required = type ? await getReferenceRequirementFor(type) : await getReferenceRequirement();
    res.json({ required, mode: required ? 'required' : 'optional' });
  } catch (error) {
    console.error('Error reading reference requirement:', error.stack);
    res.status(500).json({ error: 'Failed to load reference setting.' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    const q = String(req.query.q || '').trim();
    const results = await searchReferences(type, q);
    res.json(results);
  } catch (error) {
    console.error('Error searching references:', error.stack);
    res.status(500).json({ error: 'Failed to search records.' });
  }
});

router.get('/:type/:id', async (req, res) => {
  try {
    const record = await getReferenceRecord(req.params.type, req.params.id);
    if (!record) {
      return res.status(404).json({ valid: false, message: 'The reference number does not exist.' });
    }
    res.json({ valid: true, ...record });
  } catch (error) {
    console.error('Error loading reference:', error.stack);
    res.status(500).json({ valid: false, message: 'Failed to load the reference.' });
  }
});

export default router;
