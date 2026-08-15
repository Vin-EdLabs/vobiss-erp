// src/routes/ticket.routes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { authenticateCustomer } from '../middleware/customerAuth.js';
import {
  createTicket,
  getTicketsForCustomer,
  getTicketById,
  getTicketTimeline
} from '../db.ticketing.cjs';
import { getRealtimeIo } from '../realtime/channels.js';
import { postTicketSystemMessage } from '../services/chatSystemMessage.js';
import { ensureTicketThread } from '../services/chatRecordThreads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use __dirname-based path (reliable in local + production)
const UPLOAD_ROOT = path.join(__dirname, '../uploads');
const TICKET_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'tickets');

const router = express.Router();

// ──────────────────────────────────────────────
// Multer configuration – multiple images
// ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(TICKET_UPLOAD_DIR, { recursive: true });
      console.log(`[Multer] Upload directory ready: ${TICKET_UPLOAD_DIR}`);
      cb(null, TICKET_UPLOAD_DIR);
    } catch (err) {
      console.error('[Multer] Failed to create/verify upload directory:', err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,   // 5 MB per file
    files: 10                    // max 10 images per ticket
  }
});

// ──────────────────────────────────────────────
// POST /api/customer/tickets
// ──────────────────────────────────────────────
router.post(
  '/',
  authenticateCustomer,
  upload.array('attachments', 10),
  async (req, res) => {
    try {
      const {
        title,
        category = 'general',
        priority = 'normal',
        description
      } = req.body;

      if (!title?.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }
      if (!description?.trim()) {
        return res.status(400).json({ error: 'Description is required' });
      }

      const attachmentsData = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            await fs.access(file.path);
            console.log(`[Ticket Upload] File saved: ${file.filename}`);

            attachmentsData.push({
              originalName: file.originalname,
              savedName: file.filename,
              // Clean relative path – what frontend expects
              path: `tickets/${file.filename}`,
              size: file.size,
              mimeType: file.mimetype,
              uploadedAt: new Date().toISOString()
            });
          } catch (accessErr) {
            console.warn(`[Ticket Upload] File missing after save: ${file.path}`, accessErr);
            // Continue – don't fail whole ticket for one bad file
          }
        }
      }

      const ticket = await createTicket(
        {
          project_id: req.customer.project_id,
          customer_id: req.customer.id,
          title: title.trim(),
          category: category.trim(),
          description: description.trim(),
          priority: priority.trim(),
          status: 'NEW',
          source: 'portal',
          attachments: attachmentsData.length > 0 ? attachmentsData : null
        },
        null,
        req.customer.id,
        req.ip,
        'customer'
      );

      try {
        const recordChannelId = await ensureTicketThread(ticket, getRealtimeIo());
        await postTicketSystemMessage({
          ticketId: ticket.ticket_id,
          title: title.trim(),
          actorName: req.customer.name || req.customer.email || 'Customer',
          io: getRealtimeIo(),
          recordChannelId,
          action: 'routed',
        });
      } catch (e) {
        console.warn('[chat] customer ticket system message failed:', e.message);
      }

      return res.status(201).json({
        success: true,
        ticket_id: ticket.ticket_id,
        title: ticket.title,
        status: ticket.status,
        attachments_uploaded: attachmentsData.length
      });

    } catch (error) {
      console.error('[Ticket Route] Creation failed:', error);

      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'Image(s) exceed 5MB limit' });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ error: 'Maximum 10 images allowed' });
        }
      }

      if (error.code === 'ENOENT' || error.code === 'EACCES') {
        return res.status(500).json({ error: 'Server storage issue – attachment save failed' });
      }

      return res.status(500).json({
        error: error.message || 'Failed to create ticket'
      });
    }
  }
);

// ──────────────────────────────────────────────
// GET /api/customer/tickets/my
// ──────────────────────────────────────────────
router.get('/my', authenticateCustomer, async (req, res) => {
  try {
    const tickets = await getTicketsForCustomer(req.customer.id);
    return res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('[Ticket Route] Get my tickets failed:', error);
    return res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// ──────────────────────────────────────────────
// GET /api/customer/tickets/:id
// ──────────────────────────────────────────────
router.get('/:id', authenticateCustomer, async (req, res) => {
  try {
    const { id: ticketId } = req.params;

    const ticket = await getTicketById(ticketId, req.customer.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found or access denied' });
    }

    // Normalize paths for old/inconsistent data
    if (ticket.attachments) {
      try {
        // Handle both string (JSON) and object formats
        let parsed;
        if (typeof ticket.attachments === 'string') {
          try {
            parsed = JSON.parse(ticket.attachments);
          } catch (parseError) {
            // If parsing fails, try to handle as a single path string
            parsed = [{ path: ticket.attachments, originalName: 'Attachment' }];
          }
        } else if (Array.isArray(ticket.attachments)) {
          parsed = ticket.attachments;
        } else if (typeof ticket.attachments === 'object') {
          // If it's a single object, wrap it in an array
          parsed = [ticket.attachments];
        } else {
          parsed = [];
        }

        if (Array.isArray(parsed) && parsed.length > 0) {
          ticket.attachments = parsed.map(att => {
            const path = att.path || att.savedName || att;
            const normalizedPath = String(path)
              .replace(/^[A-Z]:\\.*\\uploads\\/i, '')   // remove absolute Windows prefix if present
              .replace(/\\/g, '/')                      // normalize slashes
              .replace(/^\/uploads\//, '')             // remove leading /uploads/
              .replace(/^uploads\//, '');              // remove leading uploads/
            
            return {
              ...att,
              path: normalizedPath.startsWith('tickets/') ? normalizedPath : `tickets/${normalizedPath}`,
              originalName: att.originalName || att.name || 'Attachment'
            };
          });
          console.log('[Ticket Route] Normalized attachment paths:', ticket.attachments.map(a => a.path));
        } else {
          ticket.attachments = [];
        }
      } catch (e) {
        console.warn('[Ticket Route] Failed to normalize attachments:', e);
        // Set to empty array on error to prevent issues
        ticket.attachments = [];
      }
    }

    const timeline = await getTicketTimeline(ticketId);

    return res.json({
      success: true,
      data: {
        ticket,
        timeline
      }
    });
  } catch (error) {
    console.error('[Ticket Route] Get ticket detail failed:', error);
    return res.status(500).json({ error: 'Failed to load ticket details' });
  }
});

export default router;