// backend/routes/staff_ticket.routes.js
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getRequestsByTicketId } from '../db.js';
import { searchTickets, searchTicketWithFullDetails } from '../db.ticketing.cjs'; // Import searchTicketWithFullDetails

const router = express.Router();

// ──────────────────────────────────────────────
// GET /api/tickets/search
// ──────────────────────────────────────────────
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    // First, search for summary tickets to find a matching ticket_id
    const summaryTickets = await searchTickets(q);

    if (summaryTickets.length > 0) {
      // If matches found, get full details for the first one
      const firstTicketId = summaryTickets[0].ticket_id;
      const fullDetails = await searchTicketWithFullDetails(firstTicketId);
      return res.json({
        success: true,
        data: fullDetails // Return full details
      });
    } else {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'No tickets found matching your search criteria.'
      });
    }
  } catch (error) {
    console.error('[Ticket Route] Ticket search failed:', error);
    return res.status(500).json({ error: 'Failed to search tickets' });
  }
});

// ──────────────────────────────────────────────
// GET /api/tickets/summary/search
// ──────────────────────────────────────────────
router.get('/summary/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    const summaryTickets = await searchTickets(q); // searchTickets returns an array of summary tickets

    return res.json({
      success: true,
      data: summaryTickets
    });
  } catch (error) {
    console.error('[Ticket Route] Ticket summary search failed:', error);
    return res.status(500).json({ error: 'Failed to search summary tickets' });
  }
});

// ──────────────────────────────────────────────
// GET /api/tickets/:id/requests
// ──────────────────────────────────────────────
router.get('/:id/requests', authenticateToken, async (req, res) => {
  try {
    const { id: ticketId } = req.params;

    const requests = await getRequestsByTicketId(ticketId);

    return res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('[Ticket Route] Get ticket requests failed:', error);
    return res.status(500).json({ error: 'Failed to load ticket requests' });
  }
});

export default router;
