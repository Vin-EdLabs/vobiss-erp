import express from 'express';
import pool, { getWorkflowConfig, createNotification } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { attachTenant } from '../middleware/tenant.js';
import { isSystemAdminAccount, isSuperAdmin, userHasAnyRole } from '../roles.js';
import { formatPersonName } from '../utils/displayName.js';
import { resolveReferenceInput, attachReference, isReferenceRequired, isReferenceRequiredFor } from '../services/referenceLink.js';
import { getRecordSummary } from '../services/referenceRegistry.js';
import { logUserAction } from '../services/activityLog.js';
import { recordTimingEvent } from '../services/workflowTimeEngine.js';
import { sendPushToUserIds } from '../push/sendPush.js';

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

const router = express.Router();

// Registered before the router-wide auth gate below so a valid share token can serve
// this one read-only detail route without a user session; every other route in this
// file (including mutations) still requires full authentication.
router.get('/:id', authenticateOrShareToken('vehicle_request', authenticateToken), async (req, res) => {
  try {
    const id = req.isSharedView ? Number(req.shareLink.record_id) : parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A valid rental request id is required.' });

    const result = await pool.query(
      `SELECT v.*, ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
       FROM vehicle_request_forms v
       LEFT JOIN users ru ON ru.id = v.requester_id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Rental vehicle request not found' });
    }
    const form = result.rows[0];
    if (!req.isSharedView && !isSystemAdminAccount(req.user) && (req.user.company || 'CW') !== form.company) {
      return res.status(404).json({ error: 'Rental vehicle request not found' });
    }
    const transport = await transportConfig();
    const selectedApproverIds = requiredApproverIds(form, transport);
    const [selected_approvers, approvals] = await Promise.all([
      loadApproverProfiles(selectedApproverIds),
      loadApprovals(form.id),
    ]);
    const approvedIds = new Set(
      approvals.filter((row) => row.decision === 'approved').map((row) => Number(row.approver_id))
    );
    const approval_trail = selected_approvers.map((approver) => {
      const record = approvals.filter((row) => Number(row.approver_id) === approver.id).at(-1);
      return {
        approver_id: approver.id,
        approver_name: approver.name,
        decision: record?.decision || 'pending',
        reason: record?.reason || null,
        created_at: record?.created_at || null,
      };
    });

    const mine = approvals.filter((row) => Number(row.approver_id) === Number(req.user?.id)).at(-1);

    res.json(
      serializeForm(form, {
        selected_approvers,
        approvals,
        approval_trail,
        approval_parties: approval_trail.map((item) => ({
          id: item.approver_id,
          name: item.approver_name,
          status: item.decision || 'pending',
          actedAt: item.created_at || null,
        })),
        approvals_required: selectedApproverIds.length,
        approvals_count: approvedIds.size,
        my_decision: mine?.decision || null,
        my_acted_at: mine?.created_at || null,
      })
    );
  } catch (error) {
    console.error('Error fetching rental vehicle request detail:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to fetch rental vehicle request detail' });
  }
});

router.use(authenticateToken);

const FINANCE_VISIBLE = ['approved', 'sent_to_finance', 'cash_issued', 'completed'];
const FINANCE_ACTIONABLE = ['approved', 'sent_to_finance'];

function parseIdList(value, depth = 0) {
  if (value == null || value === '' || depth > 5) return [];
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? [value] : [];
  }
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? [n] : [];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '{}') return [];
    try {
      return parseIdList(JSON.parse(trimmed), depth + 1);
    } catch {
      return [...new Set(
        trimmed
          .replace(/^[{\[]|[}\]]$/g, '')
          .split(/[,\s]+/)
          .map((part) => Number(String(part).replace(/['"]/g, '').trim()))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
    }
  }
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((item) => parseIdList(item, depth + 1)))];
  }
  if (typeof value === 'object') {
    if (value.id != null || value.user_id != null) {
      return parseIdList(value.id ?? value.user_id, depth + 1);
    }
    return [...new Set(Object.values(value).flatMap((item) => parseIdList(item, depth + 1)))];
  }
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? [n] : [];
}

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function displayName(user) {
  return formatPersonName(user, user?.username || 'User');
}

function parseLineItems(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseAttachments(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function grandTotal(lineItems) {
  return lineItems.reduce((sum, item) => sum + Number(item?.total || 0), 0);
}

async function loadApprovals(requestId) {
  const result = await pool.query(
    `SELECT * FROM vehicle_request_approvals WHERE request_id = $1 ORDER BY created_at ASC`,
    [requestId]
  );
  return result.rows;
}

async function loadApproverProfiles(ids) {
  if (!ids.length) return [];
  const users = await pool.query(
    `SELECT id, first_name, last_name, username FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
    [ids]
  );
  const byId = Object.fromEntries(users.rows.map((row) => [Number(row.id), row]));
  return ids.map((id) => {
    const row = byId[id];
    return { id, name: row ? displayName(row) : `User #${id}` };
  });
}

function serializeForm(row, extras = {}) {
  const lineItems = parseLineItems(row.line_items);
  return {
    id: row.id,
    transport_request_id: row.transport_request_id,
    requester_id: row.requester_id,
    requester_name: formatPersonName(
      { first_name: row.requester_first_name, last_name: row.requester_last_name, username: row.requester_username },
      row.requestor_name || row.requester_name || 'Unknown'
    ),
    supervisor_id: row.supervisor_id,
    department: row.department,
    purpose: row.purpose || row.transport_purpose || null,
    date_submitted: row.date_submitted,
    deliver_to: row.deliver_to,
    phone: row.phone,
    special_instructions: row.special_instructions,
    order_no: row.order_no,
    invoice_terms: row.invoice_terms,
    received_by: row.received_by,
    line_items: lineItems,
    attachments: parseAttachments(row.attachments),
    status: row.status,
    current_stage: row.current_stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
    selected_approver_ids: parseIdList(row.selected_approver_ids),
    grand_total: grandTotal(lineItems),
    ...attachReference(row),
    ...extras,
  };
}

async function transportConfig() {
  const config = await getWorkflowConfig();
  return config.transport || {};
}

function isAdminRole(user) {
  return isSystemAdminAccount(user) || isSuperAdmin(user) || userHasAnyRole(user, ['admin', 'superadmin', 'system_admin']);
}

function configuredVehicleApproverIds(transport = {}) {
  return [...new Set([
    ...parseIdList(transport.vehicle_request_approver_ids),
    ...parseIdList(transport.approver_ids),
  ])];
}

function requiredApproverIds(form, transport = {}) {
  const selected = parseIdList(form.selected_approver_ids);
  if (selected.length) return selected;
  return configuredVehicleApproverIds(transport);
}

function isAssignedApprover(form, userId, transport = {}) {
  return requiredApproverIds(form, transport).includes(Number(userId));
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isFinanceUser(user, transport) {
  const financeUsers = parseIdList(transport.finance_user_ids);
  const role = String(user.role || user.main_role || '').toLowerCase();
  return financeUsers.includes(Number(user.id)) || role === 'finance' || isAdminRole(user);
}

function isSupervisorUser(user, transport) {
  const supervisorIds = [transport.supervisor_id, ...(transport.transport_supervisor_ids || [])]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  return supervisorIds.includes(Number(user.id)) || isAdminRole(user);
}

async function notifyUsers(title, message, createdBy, userIds, linkUrl) {
  const unique = [...new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  for (const targetUserId of unique) {
    await createNotification(title, message, createdBy, { targetUserId, linkUrl, notificationType: 'vehicle_rental' });
  }
  if (unique.length) {
    await sendPushToUserIds(unique, {
      title, body: message,
      data: { url: linkUrl, type: 'vehicle_rental', action: 'request_created', tag: `vehicle-rental-${linkUrl}` },
    }).catch(() => {});
  }
}

async function notifySelectedApprovers(form, createdBy) {
  const ids = parseIdList(form.selected_approver_ids);
  await notifyUsers(
    'Vehicle rental request awaiting approval',
    `A rental vehicle request from ${form.requestor_name || 'a supervisor'} is waiting for your approval.`,
    createdBy,
    ids,
    `/transport/vehicle-rental-requests/${form.id}`
  );
}

// GET /api/transport/vehicle-requests
router.get('/', attachTenant, async (req, res) => {
  try {
    const transport = await transportConfig();
    const userId = Number(req.user.id);
    const queue = String(req.query.queue || '').toLowerCase();
    const admin = isAdminRole(req.user);
    const finance = isFinanceUser(req.user, transport);
    const supervisor = isSupervisorUser(req.user, transport);

    const companyClause = req.company ? 'AND v.company = $1' : '';
    const companyParams = req.company ? [req.company] : [];
    const rows = await pool.query(
      `SELECT v.*, tr.purpose AS transport_purpose,
              ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
       FROM vehicle_request_forms v
       LEFT JOIN transport_requests tr ON tr.id = v.transport_request_id
       LEFT JOIN users ru ON ru.id = v.requester_id
       WHERE v.deleted_at IS NULL ${companyClause}
       ORDER BY v.created_at DESC`,
      companyParams
    );

    const forms = rows.rows.map((row) => {
      const form = serializeForm(row);
      const selected = parseIdList(form.selected_approver_ids);
      return {
        ...form,
        selected_approver_ids: selected.length ? selected : requiredApproverIds(form, transport),
      };
    });
    let visible = forms;

    if (queue === 'finance') {
      visible = forms.filter((form) => FINANCE_VISIBLE.includes(normalizeStatus(form.status)));
    } else if (queue === 'approver') {
      visible = forms.filter((form) => {
        const status = normalizeStatus(form.status);
        if (status === 'draft') return false;
        if (admin) return true;
        return isAssignedApprover(form, userId, transport);
      });
    } else if (!admin) {
      visible = forms.filter((form) => {
        const isOwner = Number(form.requester_id) === userId || Number(form.supervisor_id) === userId;
        const isSelected = isAssignedApprover(form, userId, transport);
        const financeOk = finance && FINANCE_VISIBLE.includes(normalizeStatus(form.status));
        const supervisorOk = supervisor && isOwner;
        return isOwner || isSelected || financeOk || supervisorOk;
      });
    }

    const ids = visible.map((form) => form.id);
    let approvalRows = [];
    if (ids.length) {
      const approvalRes = await pool.query(
        `SELECT request_id, approver_id, approver_name, decision, created_at
         FROM vehicle_request_approvals
         WHERE request_id = ANY($1::int[])
         ORDER BY created_at ASC`,
        [ids]
      );
      approvalRows = approvalRes.rows;
    }

    const requiredByForm = visible.map((form) => ({
      form,
      required: requiredApproverIds(form, transport),
    }));
    const profiles = await loadApproverProfiles([...new Set(requiredByForm.flatMap((entry) => entry.required))]);
    const profilesById = new Map(profiles.map((profile) => [profile.id, profile.name]));

    res.json(
      requiredByForm.map(({ form, required }) => {
        const rows = approvalRows.filter((row) => Number(row.request_id) === form.id);
        const mine = rows.filter((row) => Number(row.approver_id) === userId).at(-1);
        const approval_parties = required.map((id) => {
          const rec = rows.filter((row) => Number(row.approver_id) === id).at(-1);
          const decision = String(rec?.decision || 'pending').toLowerCase();
          return {
            id,
            name: profilesById.get(id) || rec?.approver_name || `User #${id}`,
            status: decision === 'approved' || decision === 'rejected' ? decision : 'pending',
            actedAt: rec?.created_at || null,
          };
        });
        return {
          ...form,
          my_decision: mine?.decision || null,
          my_acted_at: mine?.created_at || null,
          approvals_required: required.length,
          approvals_count: approval_parties.filter((party) => party.status === 'approved').length,
          approval_parties,
        };
      })
    );
  } catch (error) {
    console.error('Error fetching vehicle requests:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load vehicle requests' });
  }
});

// POST /api/transport/vehicle-requests
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    const lineItems = parseLineItems(payload.line_items);
    const attachments = parseAttachments(payload.attachments);
    const transport = await transportConfig();
    let selectedApproverIds = parseIdList(payload.selected_approver_ids);
    const isDraft = payload.status === 'draft';
    if (!isDraft && !selectedApproverIds.length) {
      selectedApproverIds = configuredVehicleApproverIds(transport);
    }
    if (!isDraft && !selectedApproverIds.length) {
      return res.status(400).json({ error: 'Please select at least one approver before submitting.' });
    }

    const linkedRefsInput = Array.isArray(payload.linked_references) ? payload.linked_references : [];
    let linkedReference;
    try {
      linkedReference = await resolveReferenceInput(payload, {
        required: !isDraft && isReferenceRequiredFor('vehicle_request', transport) && linkedRefsInput.length === 0,
      });
    } catch (refError) {
      return res.status(refError.status || 400).json({ error: refError.message });
    }

    const status = isDraft ? 'draft' : 'pending';
    const currentStage = isDraft ? 'draft' : 'pending';
    const result = await pool.query(
      `INSERT INTO vehicle_request_forms (
        transport_request_id, requester_id, supervisor_id, department, requestor_name, purpose, deliver_to,
        phone, special_instructions, order_no, invoice_terms, received_by, line_items, attachments,
        status, current_stage, date_submitted, selected_approver_ids,
        reference_type, reference_id, reference_number, reference_title, reference_status, company
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16, COALESCE($17, CURRENT_TIMESTAMP), $18::jsonb, $19, $20, $21, $22, $23,
        COALESCE((SELECT company FROM users WHERE id = $2), 'CW'))
       RETURNING *`,
      [
        payload.transport_request_id ?? null,
        req.user.id,
        payload.supervisor_id ?? req.user.id,
        payload.department || null,
        payload.requestor_name || null,
        payload.purpose || null,
        payload.deliver_to || null,
        payload.phone || null,
        payload.special_instructions || null,
        payload.order_no || null,
        payload.invoice_terms || null,
        payload.received_by || null,
        JSON.stringify(lineItems),
        JSON.stringify(attachments),
        status,
        currentStage,
        payload.date_submitted || null,
        JSON.stringify(selectedApproverIds),
        linkedReference.reference_type,
        linkedReference.reference_id,
        linkedReference.reference_number,
        linkedReference.reference_title,
        linkedReference.reference_status,
      ]
    );

    const form = result.rows[0];
    await persistLinkedReferences('vehicle_request', form.id, linkedRefsInput, req.user.id);
    if (!isDraft) {
      await notifySelectedApprovers(form, req.user.id);
      await logUserAction(req.user, {
        actionType: 'submit',
        recordType: 'vehicle_request',
        recordId: form.id,
      });
      recordTimingEvent({
        workflowType: 'vehicle_request', recordId: form.id,
        eventType: 'created', stageName: 'pending_approval', triggeredByUserId: req.user.id,
      }).catch(() => {});
      if (attachments.length) {
        await logUserAction(req.user, {
          actionType: 'upload_invoice',
          recordType: 'vehicle_request',
          recordId: form.id,
        });
      }
    }
    res.status(201).json(serializeForm(form));
  } catch (error) {
    console.error('Error creating rental vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to create rental vehicle request' });
  }
});

// GET /api/transport/vehicle-requests/:id
// PUT /api/transport/vehicle-requests/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A valid rental request id is required.' });
    const payload = req.body || {};
    const row = await pool.query('SELECT * FROM vehicle_request_forms WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (row.rowCount === 0) return res.status(404).json({ error: 'Rental vehicle request not found' });
    const existing = row.rows[0];
    if (!['draft', 'pending'].includes(existing.status) && !isAdminRole(req.user)) {
      return res.status(400).json({ error: 'Only draft or pending rental requests can be edited.' });
    }

    const lineItems = payload.line_items != null ? parseLineItems(payload.line_items) : parseLineItems(existing.line_items);
    const attachments = payload.attachments != null ? parseAttachments(payload.attachments) : parseAttachments(existing.attachments);
    const selectedApproverIds =
      payload.selected_approver_ids != null ? parseIdList(payload.selected_approver_ids) : parseIdList(existing.selected_approver_ids);
    const submitting = payload.status && payload.status !== 'draft';
    const status = submitting ? 'pending' : 'draft';
    if (submitting && !selectedApproverIds.length) {
      const transport = await transportConfig();
      selectedApproverIds.push(...configuredVehicleApproverIds(transport));
    }
    if (submitting && !selectedApproverIds.length) {
      return res.status(400).json({ error: 'Please select at least one approver before submitting.' });
    }

    const linkedRefsInput = Array.isArray(payload.linked_references) ? payload.linked_references : [];
    let linkedReference;
    try {
      linkedReference = await resolveReferenceInput(
        payload.reference_type != null || payload.reference_id != null ? payload : existing,
        { required: submitting && isReferenceRequiredFor('vehicle_request', await transportConfig()) && linkedRefsInput.length === 0 }
      );
    } catch (refError) {
      return res.status(refError.status || 400).json({ error: refError.message });
    }

    const updated = await pool.query(
      `UPDATE vehicle_request_forms SET
        transport_request_id = $1,
        department = $2,
        requestor_name = $3,
        purpose = $4,
        deliver_to = $5,
        phone = $6,
        special_instructions = $7,
        order_no = $8,
        invoice_terms = $9,
        received_by = $10,
        line_items = $11::jsonb,
        attachments = $12::jsonb,
        selected_approver_ids = $13::jsonb,
        status = $14,
        current_stage = $15,
        date_submitted = COALESCE($16, date_submitted),
        reference_type = $17,
        reference_id = $18,
        reference_number = $19,
        reference_title = $20,
        reference_status = $21,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $22 AND deleted_at IS NULL
      RETURNING *`,
      [
        payload.transport_request_id ?? existing.transport_request_id ?? null,
        payload.department ?? existing.department,
        payload.requestor_name ?? existing.requestor_name,
        payload.purpose ?? existing.purpose,
        payload.deliver_to ?? existing.deliver_to,
        payload.phone ?? existing.phone,
        payload.special_instructions ?? existing.special_instructions,
        payload.order_no ?? existing.order_no,
        payload.invoice_terms ?? existing.invoice_terms,
        payload.received_by ?? existing.received_by,
        JSON.stringify(lineItems),
        JSON.stringify(attachments),
        JSON.stringify(selectedApproverIds),
        status,
        status === 'draft' ? 'draft' : 'pending',
        payload.date_submitted ?? existing.date_submitted,
        linkedReference.reference_type,
        linkedReference.reference_id,
        linkedReference.reference_number,
        linkedReference.reference_title,
        linkedReference.reference_status,
        id,
      ]
    );

    await persistLinkedReferences('vehicle_request', updated.rows[0].id, linkedRefsInput, req.user.id);

    if (submitting && existing.status === 'draft') {
      await notifySelectedApprovers(updated.rows[0], req.user.id);
      await logUserAction(req.user, {
        actionType: 'submit',
        recordType: 'vehicle_request',
        recordId: id,
      });
      recordTimingEvent({
        workflowType: 'vehicle_request', recordId: id,
        eventType: 'created', stageName: 'pending_approval', triggeredByUserId: req.user.id,
      }).catch(() => {});
    }
    const prevAttachments = parseAttachments(existing.attachments);
    if (submitting && attachments.length > prevAttachments.length) {
      await logUserAction(req.user, {
        actionType: 'upload_invoice',
        recordType: 'vehicle_request',
        recordId: id,
      });
    }
    res.json(serializeForm(updated.rows[0]));
  } catch (error) {
    console.error('Error updating rental vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to update rental vehicle request' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A valid rental request id is required.' });
    const result = await pool.query('SELECT * FROM vehicle_request_forms WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vehicle request form not found' });
    const form = result.rows[0];
    const transport = await transportConfig();
    const admin = isAdminRole(req.user);
    const selectedApprovers = requiredApproverIds(form, transport);
    const userId = Number(req.user.id);
    if (!selectedApprovers.includes(userId) && !admin) {
      return res.status(403).json({ error: 'You are not a selected approver for this rental request.' });
    }
    if (normalizeStatus(form.status) === 'rejected') {
      return res.status(400).json({ error: 'This vehicle request has already been rejected.' });
    }
    if (!['pending', 'pending_manager', 'submitted'].includes(normalizeStatus(form.status))) {
      return res.status(400).json({ error: 'This rental request is not waiting for approvers.' });
    }

    const already = await pool.query(
      `SELECT 1 FROM vehicle_request_approvals WHERE request_id = $1 AND approver_id = $2 AND decision = 'approved' LIMIT 1`,
      [form.id, userId]
    );
    if (already.rowCount > 0) {
      return res.status(400).json({ error: 'You have already approved this rental request.' });
    }

    const approverName = displayName(req.user);
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Approval notes or a digital signature are required.' });
    }
    await pool.query(
      `INSERT INTO vehicle_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, 'approver', 'approved', $4)`,
      [form.id, userId, approverName, reason]
    );

    const approvedRows = await pool.query(
      `SELECT DISTINCT approver_id FROM vehicle_request_approvals WHERE request_id = $1 AND decision = 'approved'`,
      [form.id]
    );
    const approvedIds = new Set(approvedRows.rows.map((row) => Number(row.approver_id)));
    const allApproved =
      (admin && !selectedApprovers.includes(userId)) ||
      (admin && selectedApprovers.length === 0) ||
      (selectedApprovers.length > 0 && selectedApprovers.every((approverId) => approvedIds.has(approverId)));

    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'vehicle_request',
      recordId: form.id,
    });
    recordTimingEvent({
      workflowType: 'vehicle_request', recordId: form.id,
      eventType: 'approved',
      stageName: allApproved ? 'finance_processing' : 'pending_approval',
      toUnitSlug: allApproved ? 'finance' : null,
      triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});

    if (!allApproved) {
      return res.json({
        message: 'Approval recorded. Waiting for remaining selected approvers.',
        form: serializeForm(form, { approvals_count: approvedIds.size, approvals_required: selectedApprovers.length }),
      });
    }

    const updated = await pool.query(
      `UPDATE vehicle_request_forms
       SET status = 'approved', current_stage = 'finance', approver_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING *`,
      [userId, form.id]
    );

    await notifyUsers(
      'Vehicle rental request moved to finance',
      `Rental request #${form.id} has been approved by all selected approvers and is ready for cash issuance.`,
      req.user.id,
      parseIdList(transport.finance_user_ids),
      '/transport/finance-queue'
    );

    res.json({
      message: 'All selected approvers have approved. Request sent to finance.',
      form: serializeForm(updated.rows[0]),
    });
  } catch (error) {
    console.error('Error approving vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to approve vehicle request' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A valid rental request id is required.' });
    const result = await pool.query('SELECT * FROM vehicle_request_forms WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vehicle request form not found' });
    const form = result.rows[0];
    const transport = await transportConfig();
    const selectedApprovers = requiredApproverIds(form, transport);
    const userId = Number(req.user.id);
    if (!selectedApprovers.includes(userId) && !isAdminRole(req.user)) {
      return res.status(403).json({ error: 'You are not a selected approver for this rental request.' });
    }
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });
    if (!['pending', 'pending_manager', 'submitted'].includes(normalizeStatus(form.status))) {
      return res.status(400).json({ error: 'Only pending rental requests can be rejected by approvers.' });
    }

    const approverName = displayName(req.user);
    await pool.query(
      `INSERT INTO vehicle_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, 'approver', 'rejected', $4)`,
      [form.id, userId, approverName, reason]
    );
    const updated = await pool.query(
      `UPDATE vehicle_request_forms SET status = 'rejected', current_stage = 'rejected', approver_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [userId, form.id]
    );

    await notifyUsers(
      'Vehicle rental request rejected',
      `Rental request #${form.id} was rejected. Reason: ${reason}`,
      req.user.id,
      [form.supervisor_id, form.requester_id],
      `/transport/vehicle-rental-requests/${form.id}`
    );

    await logUserAction(req.user, {
      actionType: 'reject',
      recordType: 'vehicle_request',
      recordId: form.id,
    });
    recordTimingEvent({
      workflowType: 'vehicle_request', recordId: form.id,
      eventType: 'rejected', stageName: 'pending_approval', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Vehicle request rejected.', form: serializeForm(updated.rows[0]) });
  } catch (error) {
    console.error('Error rejecting vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to reject vehicle request' });
  }
});

router.post('/:id/issue', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A valid rental request id is required.' });
    const result = await pool.query('SELECT * FROM vehicle_request_forms WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Vehicle request form not found' });
    const form = result.rows[0];
    const transport = await transportConfig();
    if (!isFinanceUser(req.user, transport)) {
      return res.status(403).json({ error: 'Only finance users can issue cash for a vehicle request.' });
    }
    if (!FINANCE_ACTIONABLE.includes(form.status)) {
      return res.status(400).json({ error: 'Finance can only issue cash after all selected approvers have approved.' });
    }

    const updated = await pool.query(
      `UPDATE vehicle_request_forms SET status = 'cash_issued', current_stage = 'cash_issued', finance_user_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [req.user.id, form.id]
    );

    await notifyUsers(
      'Vehicle rental cash issued',
      `Finance has issued cash for rental request #${form.id}.`,
      req.user.id,
      [form.supervisor_id, form.requester_id],
      `/transport/vehicle-rental-requests/${form.id}`
    );

    await logUserAction(req.user, {
      actionType: 'issue_cash',
      recordType: 'vehicle_request',
      recordId: form.id,
    });
    recordTimingEvent({
      workflowType: 'vehicle_request', recordId: form.id,
      eventType: 'completed', stageName: 'finance_processing', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Cash issued for vehicle request.', form: serializeForm(updated.rows[0]) });
  } catch (error) {
    console.error('Error issuing vehicle cash:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to issue cash' });
  }
});

export default router;
export { parsePositiveInt, parseIdList, serializeForm, parseLineItems, parseAttachments };
