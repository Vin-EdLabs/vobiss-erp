import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import { approveRequest, rejectRequest, getUserById, getRequestDetails } from '../db.js';
import { getRealtimeIo } from '../realtime/channels.js';
import { assertChannelMember } from '../services/chatHelpers.js';
import {
  postRequestSystemMessage,
  syncRequestPendingApprovalMessages,
} from '../services/chatSystemMessage.js';
import {
  canApproveCashRequest,
  canApproveMaterialRequest,
  canBypassApprovalRestrictions,
  canReleaseCash,
} from '../permissions.js';
import { logUserAction } from '../services/activityLog.js';

const router = express.Router();
router.use(authenticateToken);

async function loadRequest(requestId) {
  const { rows } = await pool.query(
    'SELECT id, type, status, total_amount, created_by_id FROM requests WHERE id = $1 AND deleted_at IS NULL',
    [requestId]
  );
  return rows[0] || null;
}

async function userApprovedRequest(userId, requestId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM approvals WHERE request_id = $1 AND approver_id = $2 LIMIT 1',
    [requestId, userId]
  );
  return rows.length > 0;
}

async function userAssignedRequest(userId, requestId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM request_approvers WHERE request_id = $1 AND approver_id = $2 LIMIT 1',
    [requestId, userId]
  );
  return rows.length > 0;
}

async function canUserApprove(user, request) {
  if (!user || !request) return false;
  const details = await getRequestDetails(request.id).catch(() => null);

  if (await userApprovedRequest(user.id, request.id)) return false;
  if (Number(request.created_by_id) === Number(user.id) && !canBypassApprovalRestrictions(user)) return false;

  if (request.status === 'supervisor_approved') {
    return canReleaseCash(user);
  }
  if (request.status !== 'pending') return false;

  if (request.type === 'cash_request' && details?.requires_director_approval) {
    return canBypassApprovalRestrictions(user);
  }

  if (!canBypassApprovalRestrictions(user)) {
    if (!(await userAssignedRequest(user.id, request.id))) return false;
  }

  return request.type === 'cash_request' ? canApproveCashRequest(user) : canApproveMaterialRequest(user);
}

async function canUserReject(user, request) {
  return canUserApprove(user, request);
}

function approverDisplayName(user) {
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Staff';
}

function resolveApprovalStage(user, request, details) {
  if (request.status === 'supervisor_approved') return 'finance';
  if (request.type === 'cash_request' && details?.requires_director_approval &&
      canBypassApprovalRestrictions(user)) {
    return 'director';
  }
  return 'approver';
}

// POST /api/chat/actions
router.post('/actions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { actionType, recordType, recordId, messageId, channelId, reason } = req.body || {};

    if (!actionType || !recordType || !recordId) {
      return res.status(400).json({ error: 'actionType, recordType, and recordId are required' });
    }

    if (!['material_request', 'cash_request', 'item_return'].includes(recordType)) {
      return res.status(400).json({ error: 'Unsupported record type for chat actions' });
    }

    const requestId = parseInt(recordId, 10);
    const request = await loadRequest(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    if (channelId) {
      await assertChannelMember(channelId, userId);
    }

    const user = await getUserById(userId);
    const io = getRealtimeIo();
    const actorName = approverDisplayName(user);

    if (actionType === 'approve') {
      if (!(await canUserApprove(user, request))) {
        return res.status(403).json({ error: 'You do not have permission to approve this request' });
      }
      const stage = resolveApprovalStage(user, request, await getRequestDetails(requestId).catch(() => null));
      await approveRequest(
        requestId,
        { approverName: actorName, signature: actorName, stage },
        userId,
        req.ip || 'chat-action'
      );
      await postRequestSystemMessage({
        requestId,
        requestType: request.type,
        action: 'approved',
        actorName,
        io,
      });
      if (messageId) {
        await updateSystemMessageMeta(messageId, { actionState: 'approved' }, io);
      }
      await logUserAction(req.user, {
        actionType: 'approve',
        recordType: request.type || recordType,
        recordId: requestId,
      });
      return res.json({ ok: true, result: 'approved' });
    }

    if (actionType === 'reject') {
      if (!(await canUserReject(user, request))) {
        return res.status(403).json({ error: 'You do not have permission to reject this request' });
      }
      const rejectReason = String(reason || '').trim() || 'Rejected from chat';
      await rejectRequest(requestId, userId, req.ip || 'chat-action', {
        rejectorName: actorName,
        reason: rejectReason,
      });
      await postRequestSystemMessage({
        requestId,
        requestType: request.type,
        action: 'rejected',
        actorName,
        io,
      });
      await syncRequestPendingApprovalMessages({
        requestId,
        requestType: request.type,
        io,
        finalState: 'rejected',
      });
      await logUserAction(req.user, {
        actionType: 'reject',
        recordType: request.type || recordType,
        recordId: requestId,
      });
      return res.json({ ok: true, result: 'rejected' });
    }

    return res.status(400).json({ error: 'Unknown actionType' });
  } catch (e) {
    console.error('[chat/actions]', e);
    res.status(e.status || 500).json({ error: e.message || 'Action failed' });
  }
});

// POST /api/chat/threads/:recordType/:recordId — create thread for legacy records
router.post('/threads/:recordType/:recordId', async (req, res) => {
  try {
    const { recordType, recordId } = req.params;
    const io = getRealtimeIo();
    const userId = req.user.id;

    let channelId = null;

    if (recordType === 'ticket') {
      const { rows } = await pool.query(
        `SELECT id, ticket_id, title, created_by_id, assigned_to, chat_channel_id
         FROM tickets WHERE ticket_id = $1 OR id::text = $1 LIMIT 1`,
        [recordId]
      );
      const ticket = rows[0];
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const { ensureTicketThread } = await import('../services/chatRecordThreads.js');
      channelId = await ensureTicketThread(ticket, io);
    } else if (['material_request', 'cash_request', 'item_return'].includes(recordType)) {
      const { rows } = await pool.query('SELECT * FROM requests WHERE id = $1', [parseInt(recordId, 10)]);
      const request = rows[0];
      if (!request) return res.status(404).json({ error: 'Request not found' });
      const { ensureRequestThread, getApproversForRequest } = await import('../services/chatRecordThreads.js');
      const approvers = await getApproversForRequest(request.id);
      channelId = await ensureRequestThread(request, approvers, io);
    } else if (recordType === 'project_request') {
      const { rows } = await pool.query('SELECT * FROM project_requests WHERE id = $1', [parseInt(recordId, 10)]);
      const pr = rows[0];
      if (!pr) return res.status(404).json({ error: 'Project request not found' });
      const { ensureProjectRequestThread } = await import('../services/chatRecordThreads.js');
      channelId = await ensureProjectRequestThread(pr, io);
    } else if (recordType === 'wip_entry') {
      const { rows } = await pool.query('SELECT * FROM project_wip_entries WHERE id = $1 AND deleted_at IS NULL', [parseInt(recordId, 10)]);
      const wip = rows[0];
      if (!wip) return res.status(404).json({ error: 'WIP entry not found' });
      const { ensureWipEntryThread } = await import('../services/chatRecordThreads.js');
      channelId = await ensureWipEntryThread(wip, io);
    } else {
      return res.status(400).json({ error: 'Unsupported record type' });
    }

    if (channelId) {
      await assertChannelMember(channelId, userId).catch(async () => {
        await pool.query(
          `INSERT INTO channel_members (channel_id, user_id, role, last_read_at, joined_at)
           VALUES ($1, $2, 'member', NOW(), NOW()) ON CONFLICT DO NOTHING`,
          [channelId, userId]
        );
      });

      try {
        const actorName =
          `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.username;
        const { postRecordThreadWelcomeIfNeeded } = await import('../services/chatSystemMessage.js');
        await postRecordThreadWelcomeIfNeeded({
          recordType,
          recordId,
          channelId,
          actorName,
          io,
          options: recordType === 'ticket' ? { routed: true } : {},
        });
      } catch (e) {
        console.warn('[chat] thread welcome failed:', e.message);
      }
    }

    res.json({ channelId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
