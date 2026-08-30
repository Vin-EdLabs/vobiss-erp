import express from 'express';
import path from 'path';
import fs from 'fs';
import fileDir from '../utils/fileDir.js';
import multer from 'multer';
import pool, { getWorkflowConfig, createNotification } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { isSystemAdminAccount, userHasAnyRole } from '../roles.js';
import { resolveReferenceInput, attachReference, isReferenceRequired, isReferenceRequiredFor } from '../services/referenceLink.js';
import { getRecordSummary } from '../services/referenceRegistry.js';

async function persistLinkedReferences(sourceType, sourceId, links, userId) {
  if (!Array.isArray(links) || !links.length) return;
  for (const link of links) {
    try {
      const summary = await getRecordSummary(String(link?.type || ''), Number(link?.id));
      if (!summary) continue;
      await pool.query(
        `INSERT INTO linked_references
           (source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sourceType, sourceId, summary.type, summary.id, summary.referenceNumber, summary.title, summary.status, userId]
      );
    } catch (linkError) {
      console.warn(`[linked_references] failed to persist link for ${sourceType} #${sourceId}:`, linkError.message);
    }
  }
}
import { parseIdList, buildApprovalParties, myApprovalState, loadUserNames } from '../utils/approvalSummary.js';
import { formatPersonName } from '../utils/displayName.js';
import { logUserAction } from '../services/activityLog.js';
import { recordTimingEvent } from '../services/workflowTimeEngine.js';

const router = express.Router();

const uploadsDir = path.join(fileDir.__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'fuel-receipt-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    return cb(new Error('Only image (PNG, JPG, WEBP) or PDF files are allowed!'), false);
  },
});

// Registered before the router-wide auth gate below so a valid share token can serve
// this one read-only detail route without a user session; every other route in this
// file (including mutations) still requires full authentication.
router.get('/:id', authenticateOrShareToken('fuel_request', authenticateToken), async (req, res) => {
  try {
    const id = req.isSharedView ? req.shareLink.record_id : req.params.id;
    const reqRes = await pool.query(
      `SELECT fr.*, ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
       FROM fuel_requests fr
       LEFT JOIN users ru ON ru.id = fr.requester_id
       WHERE fr.id = $1 AND fr.deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];

    const approvalsRes = await pool.query(
      `SELECT * FROM fuel_request_approvals WHERE request_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    const config = await getWorkflowConfig();
    const transportConfig = config.transport || {};
    const selected = parseIdList(request.selected_approver_ids);
    const fallbackApprovers = parseIdList([
      ...(transportConfig.fuel_request_approver_ids || []),
      ...(transportConfig.approver_ids || []),
    ]);
    const required = [...(selected.length ? selected : fallbackApprovers)];
    const supervisorId = Number(transportConfig.supervisor_id || 0);
    if (supervisorId > 0 && !required.includes(supervisorId)) required.push(supervisorId);
    const names = await loadUserNames(pool, required);
    const parties = buildApprovalParties(required, names, approvalsRes.rows);
    const mine = myApprovalState(approvalsRes.rows, req.user?.id);

    res.json({
      ...request,
      requester_name: formatPersonName(
        { first_name: request.requester_first_name, last_name: request.requester_last_name, username: request.requester_username },
        request.requester_name
      ),
      ...attachReference(request),
      selected_approver_ids: selected,
      ...mine,
      approvals_required: required.length,
      approvals_count: parties.filter((party) => party.status === 'approved').length,
      approval_parties: parties,
      approvals: approvalsRes.rows,
    });
  } catch (error) {
    console.error('Error fetching fuel request detail:', error.stack);
    res.status(500).json({ error: 'Failed to fetch fuel request detail' });
  }
});

router.use(authenticateToken);

router.get('/validate-reference', async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    const rawNumber = String(req.query.number || '').trim();
    if (!type || !rawNumber) {
      return res.status(400).json({ valid: false, message: 'Reference type and number are required.' });
    }

    if (type === 'Ticket') {
      const ticketResult = await pool.query(
        `SELECT id, ticket_number, title FROM tickets WHERE deleted_at IS NULL AND (ticket_number = $1 OR id::text = $1) LIMIT 1`,
        [rawNumber]
      );
      if (ticketResult.rowCount === 0) {
        return res.status(404).json({ valid: false, message: 'No record found with this number' });
      }
      const ticket = ticketResult.rows[0];
      return res.json({
        valid: true,
        type: 'Ticket',
        id: ticket.id,
        number: ticket.ticket_number || String(ticket.id),
        title: ticket.title || 'Ticket',
        message: `Ticket #${ticket.ticket_number || ticket.id} found — ${ticket.title || 'Ticket'}`,
        link: `/staff/cx/tickets/${ticket.id}`,
      });
    }

    if (type === 'Transport Request') {
      const requestResult = await pool.query(
        `SELECT id, requester_name, site_name, location, client_name FROM transport_requests WHERE deleted_at IS NULL AND id::text = $1 LIMIT 1`,
        [rawNumber]
      );
      if (requestResult.rowCount === 0) {
        return res.status(404).json({ valid: false, message: 'No record found with this number' });
      }
      const transportRequest = requestResult.rows[0];
      return res.json({
        valid: true,
        type: 'Transport Request',
        id: transportRequest.id,
        number: String(transportRequest.id),
        title: `Transport Request #${transportRequest.id}`,
        message: `Transport Request #${transportRequest.id} found`,
        link: `/transport-requests/${transportRequest.id}`,
      });
    }

    return res.status(400).json({ valid: false, message: 'Unsupported reference type.' });
  } catch (error) {
    console.error('Error validating fuel request reference:', error.stack);
    res.status(500).json({ valid: false, message: 'Failed to validate the reference number.' });
  }
});

// GET /api/transport/fuel-requests/references
router.get('/references', async (req, res) => {
  try {
    let projects = [];
    let tickets = [];
    try {
      const projRes = await pool.query(
        `SELECT id, title, project_code FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
      );
      projects = projRes.rows.map((p) => ({
        id: p.id,
        ref: p.project_code ? `${p.project_code}: ${p.title}` : `PRJ-${p.id}: ${p.title}`,
        title: p.title,
        type: 'project',
      }));
    } catch (e) {
      console.warn('Projects table read notice:', e.message);
    }

    try {
      const ticketRes = await pool.query(
        `SELECT id, ticket_number, title FROM tickets WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50`
      );
      tickets = ticketRes.rows.map((t) => ({
        id: t.id,
        ref: t.ticket_number ? `${t.ticket_number}: ${t.title}` : `TICK-${t.id}: ${t.title}`,
        title: t.title,
        type: 'ticket',
      }));
    } catch (e) {
      console.warn('Tickets table read notice:', e.message);
    }

    res.json({ projects, tickets });
  } catch (error) {
    console.error('Error fetching fuel request references:', error.stack);
    res.status(500).json({ error: 'Failed to load reference projects and tickets' });
  }
});

// POST /api/transport/fuel-requests
router.post('/', async (req, res) => {
  try {
    const {
      project_ticket_ref = '',
      project_id = null,
      ticket_id = null,
      vehicle_plate,
      fuel_type,
      quantity_litres,
      estimated_amount: manualAmount,
      purpose = '',
      selected_approver_ids,
      reference_type,
      reference_number,
      reference_title,
      reference_id,
    } = req.body;

    if (!vehicle_plate || !fuel_type || !quantity_litres) {
      return res.status(400).json({ error: 'Vehicle plate, fuel type, and quantity are required.' });
    }
    const selectedApproverIds = [...new Set((Array.isArray(selected_approver_ids) ? selected_approver_ids : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!selectedApproverIds.length) {
      return res.status(400).json({ error: 'Please select at least one fuel approver from Realm.' });
    }

    const config = await getWorkflowConfig();
    const transportConfig = config.transport || {};
    const linkedRefsInput = Array.isArray(req.body?.linked_references) ? req.body.linked_references : [];
    let linkedReference;
    try {
      linkedReference = await resolveReferenceInput(req.body || {}, {
        required: isReferenceRequiredFor('fuel_request', transportConfig) && linkedRefsInput.length === 0,
      });
    } catch (refError) {
      return res.status(refError.status || 400).json({ error: refError.message });
    }

    const qty = Number(quantity_litres);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be a positive number.' });
    }

    const pricePerLitre = transportConfig.price_per_litre ? Number(transportConfig.price_per_litre) : null;

    let finalAmount = 0;
    if (pricePerLitre && pricePerLitre > 0) {
      finalAmount = qty * pricePerLitre;
    } else {
      finalAmount = Number(manualAmount || 0);
      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        return res.status(400).json({ error: 'Please enter a valid estimated amount.' });
      }
    }

    const requesterName = formatPersonName(req.user, req.user.username || 'Requester');

    const department = req.user.unit || req.user.department || '';

    // Generate Reference Number: FR-YYYYMM-XXXX
    const dateStr = new Date().toISOString().slice(0, 7).replace('-', '');
    const countRes = await pool.query(`SELECT COUNT(*) FROM fuel_requests`);
    const count = parseInt(countRes.rows[0].count, 10) + 1;
    const refNo = `FR-${dateStr}-${String(count).padStart(4, '0')}`;

    const insertRes = await pool.query(
      `INSERT INTO fuel_requests (
        ref_no, requester_id, requester_name, department,
        project_ticket_ref, project_id, ticket_id,
        vehicle_plate, fuel_type, quantity_litres, price_per_litre,
        estimated_amount, purpose, selected_approver_ids,
        reference_type, reference_number, reference_title, reference_id, reference_status,
        status, current_stage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18, $19, 'Pending', 'approver')
      RETURNING *`,
      [
        refNo,
        req.user.id,
        requesterName,
        department,
        linkedReference.reference_number || project_ticket_ref || null,
        linkedReference.reference_type === 'project' ? linkedReference.reference_id : (project_id || null),
        linkedReference.reference_type === 'ticket' ? linkedReference.reference_id : (ticket_id || null),
        vehicle_plate.trim(),
        fuel_type,
        qty,
        pricePerLitre,
        finalAmount,
        purpose.trim(),
        JSON.stringify(selectedApproverIds),
        linkedReference.reference_type,
        linkedReference.reference_number,
        linkedReference.reference_title,
        linkedReference.reference_id,
        linkedReference.reference_status,
      ]
    );

    const newRequest = insertRes.rows[0];

    await persistLinkedReferences('fuel_request', newRequest.id, linkedRefsInput, req.user.id);

    // Notify Configured Fuel Approvers (or fallback to transport approvers)
    const approverIds = [...new Set([...selectedApproverIds, ...(transportConfig.fuel_request_approver_ids || []), ...(transportConfig.approver_ids || [])])].map(Number).filter(Boolean);

    for (const approverId of approverIds) {
      if (approverId !== req.user.id) {
        await createNotification(
          `Fuel Request Pending Approval`,
          `A new fuel request ${refNo} from ${requesterName} (${vehicle_plate}) is waiting for your approval.`,
          req.user.id,
          approverId,
          `/transport/fuel-requests/${newRequest.id}`,
          'fuel_request'
        );
      }
    }

    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'fuel_request',
      recordId: newRequest.id,
    });

    recordTimingEvent({
      workflowType: 'fuel_request', recordId: newRequest.id,
      eventType: 'created', stageName: 'pending_approval', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating fuel request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to submit fuel request' });
  }
});

// GET /api/transport/fuel-requests
router.get('/', async (req, res) => {
  try {
    const { finance_queue, tab } = req.query;
    const config = await getWorkflowConfig();
    const transportConfig = config.transport || {};

    const userId = Number(req.user.id);
    const userRole = String(req.user.role || req.user.main_role || '').toLowerCase();
    const isAdmin =
      ['admin', 'superadmin', 'system_admin'].includes(userRole) ||
      isSystemAdminAccount(req.user) ||
      userHasAnyRole(req.user, ['admin', 'superadmin', 'system_admin']);

    let query = `SELECT fr.*, ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
      FROM fuel_requests fr
      LEFT JOIN users ru ON ru.id = fr.requester_id
      WHERE fr.deleted_at IS NULL`;
    const params = [];

    if (finance_queue === 'true') {
      if (tab === 'pending_cash') {
        query += ` AND fr.current_stage = 'finance_cash'`;
      } else if (tab === 'awaiting_receipt') {
        query += ` AND fr.current_stage IN ('awaiting_receipt', 'finance_completed')`;
      } else {
        query += ` AND fr.current_stage IN ('finance_cash', 'awaiting_receipt', 'finance_completed')`;
      }
    } else if (!isAdmin) {
      const isApprover = (transportConfig.fuel_request_approver_ids || [])
        .concat(transportConfig.approver_ids || [])
        .map(Number)
        .includes(userId);
      const isSupervisor = Number(transportConfig.supervisor_id) === userId;
      const isFinance = (transportConfig.finance_user_ids || []).map(Number).includes(userId) || userRole === 'finance';

      const conditions = [`fr.requester_id = $1`];
      params.push(userId);

      if (isApprover) {
        conditions.push(`fr.current_stage = 'approver'`);
        conditions.push(`EXISTS (SELECT 1 FROM fuel_request_approvals a WHERE a.request_id = fr.id AND a.approver_id = $1)`);
        conditions.push(`COALESCE(fr.selected_approver_ids, '[]'::jsonb) @> to_jsonb($1::int)`);
      }
      if (isSupervisor) {
        conditions.push(`fr.current_stage = 'supervisor' OR fr.status IN ('Approved by Approver', 'Approved by Supervisor', 'Approved')`);
        conditions.push(`EXISTS (SELECT 1 FROM fuel_request_approvals a WHERE a.request_id = fr.id AND a.approver_id = $1)`);
      }
      if (isFinance) {
        conditions.push(`fr.current_stage IN ('finance_cash', 'awaiting_receipt', 'finance_completed', 'completed')`);
      }

      query += ` AND (${conditions.join(' OR ')})`;
    }

    query += ` ORDER BY fr.created_at DESC`;

    const result = await pool.query(query, params);
    const ids = result.rows.map((row) => row.id);
    let approvalRows = [];
    if (ids.length) {
      const approvalRes = await pool.query(
        `SELECT * FROM fuel_request_approvals WHERE request_id = ANY($1::int[]) ORDER BY created_at ASC`,
        [ids]
      );
      approvalRows = approvalRes.rows;
    }

    const supervisorId = Number(transportConfig.supervisor_id || 0);
    const fallbackApprovers = parseIdList([
      ...(transportConfig.fuel_request_approver_ids || []),
      ...(transportConfig.approver_ids || []),
    ]);
    const allApproverIds = new Set(supervisorId > 0 ? [supervisorId] : []);
    result.rows.forEach((row) => {
      const selected = parseIdList(row.selected_approver_ids);
      (selected.length ? selected : fallbackApprovers).forEach((id) => allApproverIds.add(id));
    });
    const names = await loadUserNames(pool, [...allApproverIds]);

    res.json(
      result.rows.map((row) => {
        const selected = parseIdList(row.selected_approver_ids);
        const required = [...(selected.length ? selected : fallbackApprovers)];
        if (supervisorId > 0 && !required.includes(supervisorId)) required.push(supervisorId);
        const rows = approvalRows.filter((item) => Number(item.request_id) === row.id);
        const parties = buildApprovalParties(required, names, rows);
        const mine = myApprovalState(rows, userId);
        return {
          ...row,
          requester_name: formatPersonName(
            { first_name: row.requester_first_name, last_name: row.requester_last_name, username: row.requester_username },
            row.requester_name
          ),
          ...attachReference(row),
          selected_approver_ids: selected,
          ...mine,
          approvals_required: required.length,
          approvals_count: parties.filter((party) => party.status === 'approved').length,
          approval_parties: parties,
        };
      })
    );
  } catch (error) {
    console.error('Error fetching fuel requests:', error.stack);
    res.status(500).json({ error: 'Failed to load fuel requests' });
  }
});

// GET /api/transport/fuel-requests/:id
// POST /api/transport/fuel-requests/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    const reqRes = await pool.query(
      `SELECT * FROM fuel_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];
    const config = await getWorkflowConfig();
    const transportConfig = config.transport || {};
    const userId = Number(req.user.id);
    const userRole = String(req.user.role || req.user.main_role || '').toLowerCase();
    const isAdmin = ['admin', 'superadmin'].includes(userRole);

    const userName =
      formatPersonName(req.user, req.user.username);
    const selectedApprovers = Array.isArray(request.selected_approver_ids) ? request.selected_approver_ids.map(Number) : [];

    if (request.current_stage === 'approver') {
      const isApprover =
        isAdmin ||
        selectedApprovers.includes(userId) ||
        (transportConfig.fuel_request_approver_ids || [])
          .concat(transportConfig.approver_ids || [])
          .map(Number)
          .includes(userId);

      if (!isApprover) {
        return res.status(403).json({ error: 'You are not authorized for first-level approval on this request.' });
      }

      await pool.query(
        `UPDATE fuel_requests SET status = 'Approved by Approver', current_stage = 'supervisor', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      await pool.query(
        `INSERT INTO fuel_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
         VALUES ($1, $2, $3, 'approver', 'approved', $4)`,
        [id, userId, userName, reason]
      );

      // Notify Transport Supervisor
      if (transportConfig.supervisor_id) {
        await createNotification(
          `Fuel Request Needs Supervisor Sign-off`,
          `Fuel request ${request.ref_no} from ${request.requester_name} has been approved by approvers and awaits your sign-off.`,
          userId,
          Number(transportConfig.supervisor_id),
          `/transport/fuel-requests/${id}`,
          'fuel_request'
        );
      }

      await logUserAction(req.user, {
        actionType: 'approve',
        recordType: 'fuel_request',
        recordId: request.id,
      });
      recordTimingEvent({
        workflowType: 'fuel_request', recordId: request.id,
        eventType: 'approved', stageName: 'pending_approval', triggeredByUserId: req.user.id,
      }).catch(() => {});

      return res.json({ message: 'Request approved by first-level approver.', new_stage: 'supervisor' });
    } else if (request.current_stage === 'supervisor') {
      const isSupervisor = isAdmin || Number(transportConfig.supervisor_id) === userId;

      if (!isSupervisor) {
        return res.status(403).json({ error: 'Only the Transport Supervisor can perform final approval at this step.' });
      }

      await pool.query(
        `UPDATE fuel_requests SET status = 'Approved by Supervisor', current_stage = 'finance_cash', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      await pool.query(
        `INSERT INTO fuel_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
         VALUES ($1, $2, $3, 'supervisor', 'approved', $4)`,
        [id, userId, userName, reason]
      );

      // Notify Requester
      if (request.requester_id) {
        await createNotification(
          `Fuel Request Approved`,
          `Your fuel request ${request.ref_no} has been approved by Transport Supervisor and sent to Finance for cash issuance.`,
          userId,
          request.requester_id,
          `/transport/fuel-requests/${id}`,
          'fuel_request'
        );
      }

      // Notify Finance users
      const financeIds = (transportConfig.finance_user_ids || []).map(Number).filter(Boolean);
      for (const fId of financeIds) {
        await createNotification(
          `Fuel Request Ready for Cash Issuance`,
          `Fuel request ${request.ref_no} for ${request.requester_name} (GHC ${request.estimated_amount}) is ready for cash issuance.`,
          userId,
          fId,
          `/finance/fuel-requests`,
          'fuel_request'
        );
      }

      await logUserAction(req.user, {
        actionType: 'approve',
        recordType: 'fuel_request',
        recordId: request.id,
      });
      recordTimingEvent({
        workflowType: 'fuel_request', recordId: request.id,
        eventType: 'approved', stageName: 'finance_processing', toUnitSlug: 'finance', triggeredByUserId: req.user.id,
      }).catch(() => {});

      return res.json({ message: 'Request fully approved by Transport Supervisor and forwarded to Finance.', new_stage: 'finance_cash' });
    } else {
      return res.status(400).json({ error: 'Request is not currently in an approval stage.' });
    }
  } catch (error) {
    console.error('Error approving fuel request:', error.stack);
    res.status(500).json({ error: 'Failed to approve fuel request' });
  }
});

// POST /api/transport/fuel-requests/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }

    const reqRes = await pool.query(
      `SELECT * FROM fuel_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];
    const userId = Number(req.user.id);
    const userName =
      formatPersonName(req.user, req.user.username);

    await pool.query(
      `UPDATE fuel_requests
       SET status = 'Rejected', current_stage = 'rejected', rejected_at = NOW(), rejected_by = $2, rejection_reason = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, userId, reason]
    );

    await pool.query(
      `INSERT INTO fuel_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, $4, 'rejected', $5)`,
      [id, userId, userName, request.current_stage, reason]
    );

    // Notify requester
    if (request.requester_id) {
      await createNotification(
        `Fuel Request Rejected`,
        `Your fuel request ${request.ref_no} was rejected. Reason: ${reason}`,
        userId,
        request.requester_id,
        `/transport/fuel-requests/${id}`,
        'fuel_request'
      );
    }

    await logUserAction(req.user, {
      actionType: 'reject',
      recordType: 'fuel_request',
      recordId: request.id,
    });
    recordTimingEvent({
      workflowType: 'fuel_request', recordId: request.id,
      eventType: 'rejected', stageName: 'pending_approval', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Fuel request rejected.' });
  } catch (error) {
    console.error('Error rejecting fuel request:', error.stack);
    res.status(500).json({ error: 'Failed to reject fuel request' });
  }
});

// POST /api/finance/fuel-requests/:id/issue-cash
router.post('/:id/issue-cash', async (req, res) => {
  try {
    const { id } = req.params;
    const reqRes = await pool.query(
      `SELECT * FROM fuel_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];
    const userId = Number(req.user.id);
    const userName =
      formatPersonName(req.user, req.user.username);

    await pool.query(
      `UPDATE fuel_requests
       SET status = 'Awaiting Receipt', current_stage = 'awaiting_receipt', cash_issued_at = NOW(), cash_issued_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, userId]
    );

    await pool.query(
      `INSERT INTO fuel_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, 'finance_cash', 'cash_issued', 'Cash issued by Finance')`,
      [id, userId, userName]
    );

    // Notify Requester to upload receipt
    if (request.requester_id) {
      await createNotification(
        `Fuel Request Cash Issued — Receipt Required`,
        `Cash has been issued for fuel request ${request.ref_no}. Please upload your fuel receipt to close this request.`,
        userId,
        request.requester_id,
        `/transport/fuel-requests/${id}`,
        'fuel_request'
      );
    }

    await logUserAction(req.user, {
      actionType: 'issue_cash',
      recordType: 'fuel_request',
      recordId: request.id,
    });
    recordTimingEvent({
      workflowType: 'fuel_request', recordId: request.id,
      eventType: 'started', stageName: 'awaiting_receipt', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Cash marked as issued. Status changed to Awaiting Receipt.' });
  } catch (error) {
    console.error('Error issuing cash for fuel request:', error.stack);
    res.status(500).json({ error: 'Failed to issue cash' });
  }
});

// POST /api/transport/fuel-requests/:id/upload-receipt
router.post('/:id/upload-receipt', upload.single('receipt'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a receipt file (Image or PDF).' });
    }

    const reqRes = await pool.query(
      `SELECT * FROM fuel_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];
    const receiptUrl = `/uploads/${req.file.filename}`;
    const receiptFilename = req.file.originalname;

    await pool.query(
      `UPDATE fuel_requests
       SET receipt_url = $1, receipt_filename = $2, receipt_uploaded_at = NOW(),
           status = 'Receipt Submitted', current_stage = 'finance_completed', updated_at = NOW()
       WHERE id = $3`,
      [receiptUrl, receiptFilename, id]
    );

    const config = await getWorkflowConfig();
    const transportConfig = config.transport || {};
    const financeIds = (transportConfig.finance_user_ids || []).map(Number).filter(Boolean);

    for (const fId of financeIds) {
      await createNotification(
        `Fuel Receipt Uploaded`,
        `Requester ${request.requester_name} uploaded a fuel receipt for ${request.ref_no}. Please review and mark as completed.`,
        req.user.id,
        fId,
        `/finance/fuel-requests`,
        'fuel_request'
      );
    }

    await logUserAction(req.user, {
      actionType: 'upload',
      recordType: 'fuel_request',
      recordId: request.id,
      fileKind: 'receipt',
    });
    recordTimingEvent({
      workflowType: 'fuel_request', recordId: request.id,
      eventType: 'started', stageName: 'finance_processing', toUnitSlug: 'finance', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.json({
      message: 'Receipt uploaded successfully. Status changed to Receipt Submitted.',
      receipt_url: receiptUrl,
      receipt_filename: receiptFilename,
    });
  } catch (error) {
    console.error('Error uploading fuel receipt:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to upload receipt' });
  }
});

// POST /api/finance/fuel-requests/:id/complete
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const reqRes = await pool.query(
      `SELECT * FROM fuel_requests WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (reqRes.rowCount === 0) {
      return res.status(404).json({ error: 'Fuel request not found' });
    }

    const request = reqRes.rows[0];
    const userId = Number(req.user.id);
    const userName =
      formatPersonName(req.user, req.user.username);

    if (!request.receipt_url) {
      return res.status(400).json({ error: 'Cannot complete request without an uploaded fuel receipt.' });
    }

    await pool.query(
      `UPDATE fuel_requests
       SET status = 'Completed', current_stage = 'completed', completed_at = NOW(), completed_by = $2, updated_at = NOW()
       WHERE id = $1`,
      [id, userId]
    );

    await pool.query(
      `INSERT INTO fuel_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, 'finance_completed', 'completed', 'Receipt verified and completed by Finance')`,
      [id, userId, userName]
    );

    // Notify requester
    if (request.requester_id) {
      await createNotification(
        `Fuel Request Completed`,
        `Your fuel request ${request.ref_no} has been verified and completed by Finance.`,
        userId,
        request.requester_id,
        `/transport/fuel-requests/${id}`,
        'fuel_request'
      );
    }

    await logUserAction(req.user, {
      actionType: 'verify_receipt',
      recordType: 'fuel_request',
      recordId: request.id,
    });
    await logUserAction(req.user, {
      actionType: 'complete',
      recordType: 'fuel_request',
      recordId: request.id,
    });
    recordTimingEvent({
      workflowType: 'fuel_request', recordId: request.id,
      eventType: 'completed', stageName: 'finance_processing', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Fuel request verified and marked as Completed. Request is now closed.' });
  } catch (error) {
    console.error('Error completing fuel request:', error.stack);
    res.status(500).json({ error: 'Failed to complete fuel request' });
  }
});

export default router;
