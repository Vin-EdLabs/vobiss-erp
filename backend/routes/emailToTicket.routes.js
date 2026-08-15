// backend/routes/emailToTicket.routes.js
import express from 'express';
import { authenticateCustomer } from '../middleware/customerAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { canAccessRoute } from '../db.js';
import emailToTicketService from '../emailToTicketService.js';

const router = express.Router();

// GET /api/email-to-ticket/status - Check service status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    if (!canAccessRoute(req.user.role, 'settings')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = emailToTicketService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error checking email-to-ticket service status:', error);
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

// POST /api/email-to-ticket/start - Start the service
router.post('/start', authenticateToken, async (req, res) => {
  try {
    if (!canAccessRoute(req.user.role, 'settings')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const started = await emailToTicketService.start();
    if (started) {
      res.json({
        success: true,
        message: 'Email-to-ticket service started successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to start email-to-ticket service. Check configuration.'
      });
    }
  } catch (error) {
    console.error('Error starting email-to-ticket service:', error);
    res.status(500).json({ error: 'Failed to start service' });
  }
});

// POST /api/email-to-ticket/stop - Stop the service
router.post('/stop', authenticateToken, async (req, res) => {
  try {
    if (!canAccessRoute(req.user.role, 'settings')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    emailToTicketService.stop();
    res.json({
      success: true,
      message: 'Email-to-ticket service stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping email-to-ticket service:', error);
    res.status(500).json({ error: 'Failed to stop service' });
  }
});

// POST /api/email-to-ticket/test - Test email processing
router.post('/test', authenticateToken, async (req, res) => {
  try {
    if (!canAccessRoute(req.user.role, 'settings')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // This would be used for testing email processing manually
    // For now, we'll just return a success message
    res.json({
      success: true,
      message: 'Test endpoint - service is ready to process emails'
    });
  } catch (error) {
    console.error('Error testing email-to-ticket service:', error);
    res.status(500).json({ error: 'Failed to test service' });
  }
});

export default router;
