// backend/routes/requests.js
// Unified Request Routes – Material + Cash Advance + All Actions

import express from 'express';
import { 
  createRequest, 
  getRequests, 
  updateRequest, 
  rejectRequest, 
  approveRequest, 
  finalizeRequest, 
  getRequestDetails,
  markCashReceived,
  insertAuditLog 
} from '../db.js';
import {
  canApproveCashRequest,
  canApproveMaterialRequest,
  canCreateCashRequest,
  canCreateMaterialRequest,
  canExecuteMaterial,
  canReleaseCash,
} from '../permissions.js';

const router = express.Router();

// Helper to get client IP
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
};

// CREATE REQUEST (Material or Cash)
router.post('/', async (req, res) => {
  try {
    let requestData, selectedApproverIds, requestType = 'material_request';

    // Support both formats
    if (req.body.requestData && req.body.selectedApproverIds !== undefined) {
      // Cash request format from frontend
      requestData = req.body.requestData;
      selectedApproverIds = req.body.selectedApproverIds;
      requestType = req.body.requestType || 'cash_request';
    } else {
      // Legacy material request
      requestData = req.body;
      selectedApproverIds = req.body.selectedApproverIds || [];
      requestType = req.body.type || 'material_request';
    }

    if (!selectedApproverIds || !Array.isArray(selectedApproverIds) || selectedApproverIds.length === 0) {
      return res.status(400).json({ error: 'At least one approver must be selected' });
    }
    if (requestType === 'cash_request' && !canCreateCashRequest(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to create cash requests' });
    }
    if (requestType !== 'cash_request' && !canCreateMaterialRequest(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to create material requests' });
    }

    const ip = getClientIp(req);

    const newRequest = await createRequest(
      requestData,
      selectedApproverIds,
      requestType,
      req.user.id,
      ip
    );

    await insertAuditLog(
      req.user.id,
      'create_request',
      ip,
      {
        request_id: newRequest.id,
        type: requestType,
        total_amount: requestData.totalAmount || null
      }
    );

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating request:', error.stack);
    res.status(500).json({ 
      error: error.message || 'Failed to create request'
    });
  }
});

// GET ALL REQUESTS
router.get('/', async (req, res) => {
  try {
    const requests = await getRequests(req.user.role, req.user.id);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching requests:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// GET SINGLE REQUEST DETAILS
router.get('/:id', async (req, res) => {
  try {
    const request = await getRequestDetails(req.params.id);
    res.json(request);
  } catch (error) {
    console.error('Error fetching request details:', error.stack);
    res.status(error.message === 'Request not found' ? 404 : 500).json({ error: error.message });
  }
});

// UPDATE REQUEST (edit before approval)
router.put('/:id', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await updateRequest(req.params.id, req.body, req.user.id, ip, req.user.role);
    res.json(result);
  } catch (error) {
    console.error('Error updating request:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// REJECT REQUEST
router.post('/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ error: 'Rejection reason required' });

    const rejectorName = `${req.user.first_name || ''} ${req.user.last_name || req.user.username || 'User'}`.trim();

    const result = await rejectRequest(
      req.params.id,
      req.user.id,
      getClientIp(req),
      { reason: reason.trim(), rejectorName }
    );

    res.json(result);
  } catch (error) {
    console.error('Error rejecting request:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// APPROVE REQUEST (Supervisor or Finance stage)
router.post('/:id/approve', async (req, res) => {
  try {
    const { approverName, signature, stage } = req.body; // stage optional, defaults to supervisor

    if (!approverName?.trim()) return res.status(400).json({ error: 'Approver name required' });

    if (stage === 'finance' && !canReleaseCash(req.user)) {
      return res.status(403).json({ error: 'Only a Finance Officer can release cash' });
    }
    if (stage !== 'finance' && !canApproveMaterialRequest(req.user) && !canApproveCashRequest(req.user)) {
      return res.status(403).json({ error: 'Only Supervisor, Manager, or Director can approve requests' });
    }

    const result = await approveRequest(
      req.params.id,
      { approverName: approverName.trim(), signature: signature || null, stage: stage || 'approver' },
      req.user.id,
      getClientIp(req)
    );

    res.json(result);
  } catch (error) {
    console.error('Error approving request:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// MARK CASH AS RECEIVED
router.post('/:id/cash-received', async (req, res) => {
  try {
    const { receivedBy } = req.body;
    if (!receivedBy?.trim()) return res.status(400).json({ error: 'Recipient name required' });

    const result = await markCashReceived(
      req.params.id,
      receivedBy.trim(),
      req.user.id,
      getClientIp(req)
    );

    res.json(result);
  } catch (error) {
    console.error('Error marking cash received:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// FINALIZE (for material requests - issue stock)
router.post('/:id/finalize', async (req, res) => {
  try {
    const { items, releasedBy } = req.body;
    if (!items || !releasedBy) return res.status(400).json({ error: 'Items and releaser required' });
    if (!canExecuteMaterial(req.user)) {
      return res.status(403).json({ error: 'Only Procurement can execute approved material requests' });
    }

    const result = await finalizeRequest(
      req.params.id,
      { items, releasedBy },
      req.user.id,
      getClientIp(req)
    );

    res.json(result);
  } catch (error) {
    console.error('Error finalizing request:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

export default router;