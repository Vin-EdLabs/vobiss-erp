// backend/routes/finance.js
// Cash Request Routes – Fully Integrated with Existing System
// Handles: Create cash request, Finance approve, Reject, Mark as received

import express from 'express';
import { 
  createRequest, 
  approveRequest, 
  rejectRequest, 
  markCashReceived,
  getRequestDetails 
} from '../db.js'; // adjust path if needed
import { insertAuditLog } from '../db.js';
import { canCreateCashRequest, canReleaseCash } from '../permissions.js';

const router = express.Router();

// Middleware to get current user (assuming you have auth middleware that sets req.user)
const getCurrentUser = (req) => {
  // Replace with your actual auth logic (e.g., from JWT or session)
  return req.user || { id: null, fullName: 'Unknown', role: 'unknown' };
};

// CREATE CASH REQUEST - Uses existing createRequest but with type 'cash_request'
router.post('/', async (req, res) => {
  const { requestData, selectedApproverIds } = req.body;
  const currentUser = getCurrentUser(req);

  if (!currentUser.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!canCreateCashRequest(currentUser)) {
    return res.status(403).json({ message: 'You do not have permission to create cash requests' });
  }

  if (!requestData || !selectedApproverIds || !Array.isArray(selectedApproverIds)) {
    return res.status(400).json({ message: 'Invalid request data' });
  }

  try {
    const newRequest = await createRequest(
      requestData,
      selectedApproverIds,
      'cash_request', // fixed type
      currentUser.id,
      req.ip || 'unknown'
    );

    await insertAuditLog(
      currentUser.id,
      'create_cash_request',
      req.ip,
      { request_id: newRequest.id, total_amount: requestData.totalAmount }
    );

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating cash request:', error);
    res.status(500).json({ message: error.message || 'Failed to create cash request' });
  }
});

// FINANCE APPROVE (Stage 2)
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { approverName, signature } = req.body;
  const currentUser = getCurrentUser(req);

  if (!currentUser.id || !canReleaseCash(currentUser)) {
    return res.status(403).json({ message: 'Only a Finance Officer can release cash' });
  }

  if (!approverName?.trim()) {
    return res.status(400).json({ message: 'Approver name is required' });
  }

  try {
    // Check if request is in correct state
    const details = await getRequestDetails(id);
    if (!details) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (details.type !== 'cash_request') {
      return res.status(400).json({ message: 'Not a cash request' });
    }
    if (details.status !== 'supervisor_approved') {
      return res.status(400).json({ message: 'Request not yet approved by supervisor' });
    }

    const result = await approveRequest(
      id,
      { approverName: approverName.trim(), signature: signature || null, stage: 'finance' },
      currentUser.id,
      req.ip
    );

    await insertAuditLog(
      currentUser.id,
      'finance_approve_cash',
      req.ip,
      { request_id: id, amount: details.total_amount }
    );

    res.json(result);
  } catch (error) {
    console.error('Error in finance approval:', error);
    res.status(500).json({ message: error.message || 'Approval failed' });
  }
});

// REJECT (can be done by supervisor or finance)
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const currentUser = getCurrentUser(req);

  if (!currentUser.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!reason?.trim()) {
    return res.status(400).json({ message: 'Rejection reason is required' });
  }

  try {
    const details = await getRequestDetails(id);
    if (!details || details.type !== 'cash_request') {
      return res.status(404).json({ message: 'Cash request not found' });
    }

    const rejectorName = currentUser.fullName || 'Finance/Supervisor';

    await rejectRequest(
      id,
      currentUser.id,
      req.ip,
      { rejectorName, reason: reason.trim() }
    );

    await insertAuditLog(
      currentUser.id,
      'reject_cash_request',
      req.ip,
      { request_id: id, reason }
    );

    res.json({ message: 'Request rejected' });
  } catch (error) {
    console.error('Error rejecting cash request:', error);
    res.status(500).json({ message: error.message || 'Rejection failed' });
  }
});

// MARK AS RECEIVED (by recipient after finance release)
router.post('/:id/cash-received', async (req, res) => {
  const { id } = req.params;
  const { receivedBy } = req.body;
  const currentUser = getCurrentUser(req);

  if (!currentUser.id) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!receivedBy?.trim()) {
    return res.status(400).json({ message: 'Recipient name is required' });
  }

  try {
    const result = await markCashReceived(
      id,
      receivedBy.trim(),
      currentUser.id,
      req.ip
    );

    await insertAuditLog(
      currentUser.id,
      'cash_received_confirmation',
      req.ip,
      { request_id: id, received_by: receivedBy }
    );

    res.json(result);
  } catch (error) {
    console.error('Error marking cash received:', error);
    res.status(500).json({ message: error.message || 'Failed to confirm receipt' });
  }
});

export default router;