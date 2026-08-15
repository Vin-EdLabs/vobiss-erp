import pool, { getWorkflowConfig } from '../db.js';
import { hydrateMessages, getDisplayName } from './chatHelpers.js';
import { getChannelByName } from './chatInit.js';
import { categoryChannelNameForRecordType } from './chatCategories.js';
import {
  getApproversForRequest,
  getRequesterId,
  resolveRequestChannelId,
  resolveTicketChannelId,
} from './chatRecordThreads.js';
import { isChannelUnreadCountable } from './chatUnreadPolicy.js';

function buildMeta({
  relatedType,
  relatedId,
  linkUrl,
  linkLabel,
  actions,
  actionState,
  summaryCard,
}) {
  return {
    relatedType: relatedType || null,
    relatedId: relatedId ?? null,
    linkUrl: linkUrl || null,
    linkLabel: linkLabel || null,
    actions: actions || null,
    actionState: actionState || null,
    summaryCard: summaryCard || null,
  };
}

async function fetchUsers(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
    [ids]
  );
  return rows;
}

function mentionToken(user) {
  const name = getDisplayName(user);
  return `@[${name}](${user.id})`;
}

function mentionAll(users) {
  return users.map((u) => mentionToken(u)).join(' ');
}

async function emitUnreadForUsers(io, { channelId, dmId, userIds, delta = 1 }) {
  if (!io || !userIds?.length) return;
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const uid of unique) {
    io.to(`user:${uid}`).emit('unread_increment', { channelId, dmId, delta });
  }
}

async function emitActionRequired(io, { userIds, channelId, messageId, title, linkUrl, linkLabel, recordType, recordId }) {
  if (!io || !userIds?.length) return;
  const payload = {
    channelId,
    messageId,
    title,
    linkUrl,
    linkLabel: linkLabel || 'View request',
    recordType,
    recordId,
  };
  for (const uid of [...new Set(userIds.filter(Boolean))]) {
    io.to(`user:${uid}`).emit('chat:action_required', payload);
  }
}

/**
 * Post an automated system message to a channel.
 */
export async function postSystemMessage({
  channelId,
  body,
  relatedType,
  relatedId,
  linkUrl,
  linkLabel,
  actions,
  summaryCard,
  mentionUserIds,
  io,
  skipMemberUnread = false,
  notifyActionRequired = false,
}) {
  if (!channelId || !body) return null;

  const meta = buildMeta({ relatedType, relatedId, linkUrl, linkLabel, actions, summaryCard });

  const { rows } = await pool.query(
    `INSERT INTO chat_messages (channel_id, sender_id, body, message_type, meta)
     VALUES ($1, NULL, $2, 'system', $3::jsonb)
     RETURNING *`,
    [channelId, body, JSON.stringify(meta)]
  );

  const messageId = rows[0].id;
  const mentionIds = [...new Set((mentionUserIds || []).filter(Boolean).map((id) => parseInt(id, 10)))];
  const mentionRecords = mentionIds.map((userId) => ({ userId }));
  for (const uid of mentionIds) {
    await pool.query(
      `INSERT INTO message_mentions (message_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [messageId, uid]
    );
  }

  if (mentionRecords.length) {
    try {
      const { notifyChatMentions } = await import('./chatMentionNotify.js');
      await notifyChatMentions({
        mentions: mentionRecords,
        senderId: 0,
        senderName: 'Vobiss',
        messageBody: body,
        messageId,
        channelId,
      });
    } catch (e) {
      console.warn('[chat] system mention notify failed:', e.message);
    }
  }

  const [message] = await hydrateMessages(rows, null);

  if (io) {
    io.to(`channel:${channelId}`).emit('new_message', message);
    if (!skipMemberUnread) {
      const members = await pool.query(
        'SELECT user_id FROM channel_members WHERE channel_id = $1',
        [channelId]
      );
      const memberIds = members.rows.map((m) => m.user_id);
      await emitUnreadForUsers(io, { channelId, dmId: null, userIds: memberIds });
    }
    if (mentionIds.length && (await isChannelUnreadCountable(pool, channelId))) {
      await emitUnreadForUsers(io, { channelId, dmId: null, userIds: mentionIds });
    }
    if (notifyActionRequired && actions?.length && mentionIds.length) {
      await emitActionRequired(io, {
        userIds: mentionIds,
        channelId,
        messageId,
        title: body.replace(/@\[[^\]]+\]\(\d+\)/g, (m) => {
          const match = m.match(/@\[([^\]]+)\]/);
          return match ? `@${match[1]}` : m;
        }),
        linkUrl,
        linkLabel,
        recordType: relatedType,
        recordId,
      });
    }
  }

  return message;
}

export async function updateSystemMessageMeta(messageId, metaUpdates, io) {
  const { rows: existing } = await pool.query(
    'SELECT id, channel_id, meta FROM chat_messages WHERE id = $1',
    [messageId]
  );
  const msg = existing[0];
  if (!msg) return null;

  const current = msg.meta && typeof msg.meta === 'object' ? msg.meta : {};
  const nextMeta = { ...current, ...metaUpdates };

  if (metaUpdates.actionState && Array.isArray(current.actions)) {
    nextMeta.actions = current.actions.map((a) => ({
      ...a,
      disabled: true,
      result: metaUpdates.actionState,
    }));
  }

  const { rows: updated } = await pool.query(
    `UPDATE chat_messages SET meta = $1::jsonb WHERE id = $2 RETURNING *`,
    [JSON.stringify(nextMeta), messageId]
  );

  const [full] = await hydrateMessages(updated, null);
  if (io && msg.channel_id) {
    io.to(`channel:${msg.channel_id}`).emit('message_edit', full);
  }
  return full;
}

/** True while more supervisor/director signatures are required (status still pending). */
export async function needsMoreSupervisorApprovals(requestRow) {
  const requestId = requestRow.id;
  const requestType = requestRow.type;
  if (requestRow.status !== 'pending') return false;

  const workflowConfig = await getWorkflowConfig();
  const totalAmount = parseFloat(requestRow.total_amount || 0);

  if (requestType === 'cash_request') {
    const thresholds = workflowConfig.finance?.amount_thresholds || [];
    const directorRule = thresholds.find(
      (t) => t.requires_director && t.min_amount != null && totalAmount >= parseFloat(t.min_amount)
    );
    const approverRule = thresholds.find(
      (t) => t.max_amount != null && totalAmount < parseFloat(t.max_amount)
    );

    if (directorRule) {
      const requiredBeforeDirector = Math.max(
        0,
        parseInt(directorRule.required_approvers_before_director, 10) || 0
      );
      const { rows: counts } = await pool.query(
        `SELECT
           (SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name))::int
            FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor') AS supervisors,
           (SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name))::int
            FROM approvals WHERE request_id = $1 AND approval_stage = 'director') AS directors`,
        [requestId]
      );
      const supervisorCount = counts[0]?.supervisors || 0;
      const directorCount = counts[0]?.directors || 0;
      if (supervisorCount < requiredBeforeDirector) return true;
      if (directorCount < 1) return true;
      return false;
    }

    const requiredApprovers = approverRule ? approverRule.required_approvers || 2 : 2;
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name))::int AS c
       FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor'`,
      [requestId]
    );
    return (rows[0]?.c || 0) < requiredApprovers;
  }

  const requiredCount = workflowConfig.material?.required_approvers_count ?? 2;
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name))::int AS c
     FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor'`,
    [requestId]
  );
  return (rows[0]?.c || 0) < requiredCount;
}

export async function shouldClearPendingApprovalActions(requestId) {
  const { rows } = await pool.query(
    'SELECT id, type, status, total_amount FROM requests WHERE id = $1 AND deleted_at IS NULL',
    [requestId]
  );
  const r = rows[0];
  if (!r) return true;
  if (r.status === 'rejected' || r.status === 'finance_approved') return true;
  if (r.status === 'supervisor_approved') return true;
  if (r.status === 'pending') return !(await needsMoreSupervisorApprovals(r));
  return true;
}

async function findPendingApprovalMessages(channelId, recordId, recordType) {
  const { rows } = await pool.query(
    `SELECT id FROM chat_messages
     WHERE channel_id = $1
       AND message_type = 'system'
       AND meta->>'relatedType' = $2
       AND (meta->>'relatedId') = $3
       AND jsonb_array_length(COALESCE(meta->'actions', '[]'::jsonb)) > 0
       AND COALESCE(meta->>'actionState', '') = ''`,
    [channelId, recordType, String(recordId)]
  );
  return rows.map((row) => row.id);
}

/** Close in-thread Approve/Reject banners once supervisor approvals are complete. */
export async function syncRequestPendingApprovalMessages({
  requestId,
  requestType,
  io,
  finalState,
}) {
  const { rows } = await pool.query(
    'SELECT status FROM requests WHERE id = $1 AND deleted_at IS NULL',
    [requestId]
  );
  const status = rows[0]?.status;
  const shouldClear =
    finalState === 'rejected' ||
    status === 'rejected' ||
    (await shouldClearPendingApprovalActions(requestId));
  if (!shouldClear) return;

  const channelId = await resolveRequestChannelId(requestId, requestType);
  if (!channelId) return;

  const actionState =
    finalState || (status === 'rejected' ? 'rejected' : 'completed');
  const messageIds = await findPendingApprovalMessages(channelId, requestId, requestType);
  for (const messageId of messageIds) {
    await updateSystemMessageMeta(messageId, { actionState }, io);
  }
}

export function requestLabel(type, id) {
  if (type === 'cash_request') return `Cash Request #${id}`;
  if (type === 'item_return') return `Item Return #${id}`;
  return `Mat. Request #${id}`;
}

export function requestLink(type, id) {
  if (type === 'cash_request') return `/cash-details/${id}`;
  if (type === 'item_return') return `/item-returns/${id}`;
  return `/request-forms/${id}`;
}

export function requestLinkLabel(type) {
  if (type === 'cash_request') return 'View cash request';
  if (type === 'item_return') return 'View return';
  return 'View request';
}

function approvalActions(requestType, requestId) {
  return [
    {
      label: 'Approve',
      actionType: 'approve',
      recordId: String(requestId),
      recordType: requestType,
      style: 'primary',
    },
    {
      label: 'Reject',
      actionType: 'reject',
      recordId: String(requestId),
      recordType: requestType,
      style: 'danger',
    },
  ];
}

async function getCategoryChannel(recordType) {
  const name = categoryChannelNameForRecordType(recordType);
  if (!name) return null;
  return getChannelByName(name);
}

async function getRequestItemSummary(requestId) {
  const { rows } = await pool.query(
    `SELECT i.name, ri.quantity_requested
     FROM request_items ri
     JOIN items i ON i.id = ri.item_id
     WHERE ri.request_id = $1
     ORDER BY ri.id ASC
     LIMIT 5`,
    [requestId]
  );
  if (!rows.length) return null;
  return rows.map((r) => `${r.quantity_requested}x ${r.name}`).join(', ');
}

async function postCategoryBrief({ recordType, briefBody, meta, io }) {
  const category = await getCategoryChannel(recordType);
  if (!category) return null;
  return postSystemMessage({
    channelId: category.id,
    body: briefBody,
    relatedType: meta.relatedType,
    relatedId: meta.relatedId,
    linkUrl: meta.linkUrl,
    linkLabel: meta.linkLabel,
    io,
    skipMemberUnread: true,
  });
}

async function getApprovalNextStep(requestType, requestId) {
  const { rows } = await pool.query(
    'SELECT status FROM requests WHERE id = $1 AND deleted_at IS NULL',
    [requestId]
  );
  const status = rows[0]?.status;

  if (requestType === 'cash_request') {
    if (status === 'finance_approved') {
      return 'Funds have been released and are ready for collection.';
    }
    if (status === 'supervisor_approved') {
      return 'Next step: Finance will review and release funds once approved.';
    }
    return 'Approval recorded. The request is waiting for the remaining required approval(s).';
  }

  if (requestType === 'item_return') {
    return 'The return has been approved and is ready for the next processing step.';
  }

  if (status === 'supervisor_approved' || status === 'finance_approved') {
    return 'All approvals are complete and the request is ready for issuance.';
  }
  return 'Approval recorded. The request is waiting for the remaining required approval(s).';
}

export async function postRequestSystemMessage({
  requestId,
  requestType,
  action,
  actorName,
  io,
  recordChannelId: recordChannelIdOverride,
}) {
  const label = requestLabel(requestType, requestId);
  const link = requestLink(requestType, requestId);
  const linkLabel = requestLinkLabel(requestType);
  const recordChannelId =
    recordChannelIdOverride || (await resolveRequestChannelId(requestId, requestType));

  const meta = {
    relatedType: requestType,
    relatedId: requestId,
    linkUrl: link,
    linkLabel,
    actions: null,
  };

  let briefBody;
  let mentionUserIds = [];
  const itemSummary = await getRequestItemSummary(requestId);

  if (action === 'created') {
    briefBody = `${label} submitted by ${actorName}`;
    const { buildRecordThreadSummary } = await import('./chatRecordSummaries.js');
    const { fallbackBody, card } = await buildRecordThreadSummary(requestType, requestId, { actorName });

    await postCategoryBrief({ recordType: requestType, briefBody, meta, io });

    if (recordChannelId) {
      await postSystemMessage({
        channelId: recordChannelId,
        body: fallbackBody,
        relatedType: requestType,
        relatedId: requestId,
        linkUrl: link,
        linkLabel,
        summaryCard: card,
        io,
      });

      const approverIds = await getApproversForRequest(requestId);
      mentionUserIds = approverIds;
      const approvers = await fetchUsers(approverIds);
      const mentionText = approvers.length === 1
        ? `${mentionToken(approvers[0])} — request pending your approval.`
        : `${mentionAll(approvers)} — request pending your approval.`;

      meta.actions = approvalActions(requestType, requestId);
      await postSystemMessage({
        channelId: recordChannelId,
        body: mentionText,
        relatedType: requestType,
        relatedId: requestId,
        linkUrl: link,
        linkLabel,
        actions: meta.actions,
        mentionUserIds: approverIds,
        io,
        notifyActionRequired: true,
      });
    }
    return null;
  }

  let detailBody;
  if (action === 'approved') {
    briefBody = `${label} approved by ${actorName}`;
    const nextStep = await getApprovalNextStep(requestType, requestId);
    detailBody = `✓ ${label} approved by ${actorName}. ${nextStep}`;
    const requesterId = await getRequesterId(requestId);
    if (requesterId) mentionUserIds = [requesterId];
  } else if (action === 'rejected') {
    briefBody = `${label} rejected by ${actorName}`;
    detailBody = briefBody;
    const requesterId = await getRequesterId(requestId);
    if (requesterId) mentionUserIds = [requesterId];
  } else if (action === 'finalized') {
    briefBody = `${label} completed`;
    detailBody = briefBody;
  } else if (action === 'cash_received') {
    briefBody = `Cash for ${label} marked received`;
    detailBody = briefBody;
  } else if (action === 'pending_approval') {
    briefBody = `${label} awaiting approval`;
    const approverIds = await getApproversForRequest(requestId);
    mentionUserIds = approverIds;
    const approvers = await fetchUsers(approverIds);
    detailBody = approvers.length
      ? `${mentionAll(approvers)} — request pending your approval.`
      : `${label} awaiting your approval.`;
    meta.actions = approvalActions(requestType, requestId);
  } else {
    briefBody = `${label} updated`;
    detailBody = briefBody;
  }

  await postCategoryBrief({ recordType: requestType, briefBody, meta, io });

  if (recordChannelId) {
    return postSystemMessage({
      channelId: recordChannelId,
      body: detailBody,
      relatedType: requestType,
      relatedId: requestId,
      linkUrl: link,
      linkLabel,
      actions: meta.actions,
      mentionUserIds,
      io,
      notifyActionRequired: action === 'pending_approval' || !!meta.actions,
    });
  }
  return null;
}

export async function postTicketSystemMessage({
  ticketId,
  title,
  actorName,
  io,
  action = 'created',
  assigneeId,
  recordChannelId: recordChannelIdOverride,
}) {
  const link = `/staff/cx/tickets/${ticketId}`;
  const recordChannelId =
    recordChannelIdOverride || (await resolveTicketChannelId(ticketId));

  let briefBody;
  let detailBody;
  let summaryCard = null;
  let mentionUserIds = [];
  const { buildTicketThreadSummary } = await import('./chatRecordSummaries.js');

  if (action === 'assigned' && assigneeId) {
    briefBody = `Ticket #${ticketId} assigned`;
    const assigneeUsers = await fetchUsers([assigneeId]);
    const assigneeMention = assigneeUsers[0] ? mentionToken(assigneeUsers[0]) : actorName;
    detailBody = `${assigneeMention} — ticket #${ticketId} assigned to you.`;
    mentionUserIds = [assigneeId];
  } else if (action === 'routed') {
    briefBody = `Ticket #${ticketId} — awaiting owner`;
    const summary = await buildTicketThreadSummary(ticketId, { actorName, routed: true });
    detailBody = summary.fallbackBody;
    summaryCard = summary.card;
  } else if (action === 'status') {
    briefBody = `Ticket #${ticketId} updated`;
    detailBody = `Ticket #${ticketId} — ${title} updated by ${actorName}.`;
  } else {
    briefBody = `Ticket #${ticketId} — ${title} created`;
    const summary = await buildTicketThreadSummary(ticketId, {
      actorName,
      routed: !assigneeId,
    });
    detailBody = summary.fallbackBody;
    summaryCard = summary.card;
    if (assigneeId) mentionUserIds = [assigneeId];
  }

  const meta = {
    relatedType: 'ticket',
    relatedId: ticketId,
    linkUrl: link,
    linkLabel: 'Open ticket',
  };

  await postCategoryBrief({ recordType: 'ticket', briefBody, meta, io });

  if (recordChannelId) {
    return postSystemMessage({
      channelId: recordChannelId,
      body: detailBody,
      relatedType: 'ticket',
      relatedId: ticketId,
      linkUrl: link,
      linkLabel: 'Open ticket',
      summaryCard,
      mentionUserIds,
      io,
      notifyActionRequired: action === 'assigned' && !!assigneeId,
    });
  }
  return null;
}

/** Auto-escalation along the matrix — ticket stays unassigned until someone assigns. */
export async function postTicketEscalationSystemMessage({
  ticketId,
  title,
  stageLabel,
  fromLabel,
  io,
}) {
  const link = `/staff/cx/tickets/${ticketId}`;
  const recordChannelId = await resolveTicketChannelId(ticketId);
  const briefBody = `Ticket #${ticketId} → ${stageLabel}`;
  const detailBody = fromLabel
    ? `Ticket #${ticketId} — ${title} escalated from ${fromLabel} to ${stageLabel}. Still **unassigned** — please assign an owner.`
    : `Ticket #${ticketId} — ${title} is at ${stageLabel}. Still **unassigned** — please assign an owner.`;

  const meta = {
    relatedType: 'ticket',
    relatedId: ticketId,
    linkUrl: link,
    linkLabel: 'Open ticket',
  };

  await postCategoryBrief({ recordType: 'ticket', briefBody, meta, io });

  if (recordChannelId) {
    return postSystemMessage({
      channelId: recordChannelId,
      body: detailBody,
      relatedType: 'ticket',
      relatedId: ticketId,
      linkUrl: link,
      linkLabel: 'Assign owner',
      io,
      notifyActionRequired: true,
    });
  }
  return null;
}

export async function postProjectRequestSystemMessage({
  projectRequestId,
  siteName,
  actorName,
  io,
  action = 'created',
  recordChannelId,
}) {
  const link = `/project-request/project/${projectRequestId}`;
  const label = `Project #${projectRequestId} – ${siteName || 'Project'}`;

  let body;
  let summaryCard = null;
  if (action === 'created') {
    const { buildProjectThreadSummary } = await import('./chatRecordSummaries.js');
    const summary = await buildProjectThreadSummary(projectRequestId, { actorName });
    body = summary.fallbackBody;
    summaryCard = summary.card;
  } else {
    body = `${label} updated by ${actorName}.`;
  }

  const meta = {
    relatedType: 'project_request',
    relatedId: projectRequestId,
    linkUrl: link,
    linkLabel: 'View project',
  };

  await postCategoryBrief({ recordType: 'project_request', briefBody: body, meta, io });

  if (recordChannelId) {
    return postSystemMessage({
      channelId: recordChannelId,
      body,
      relatedType: 'project_request',
      relatedId: projectRequestId,
      linkUrl: link,
      linkLabel: 'View project',
      summaryCard,
      io,
    });
  }
  return null;
}

/** Welcome summary when a thread is opened but no summary exists yet (e.g. legacy records). */
export async function postRecordThreadWelcomeIfNeeded({
  recordType,
  recordId,
  channelId,
  actorName,
  io,
  options = {},
}) {
  if (!channelId || !recordType || recordId == null) return null;

  const { rows } = await pool.query(
    `SELECT 1 FROM chat_messages
     WHERE channel_id = $1 AND message_type = 'system'
       AND meta->'summaryCard' IS NOT NULL
     LIMIT 1`,
    [channelId]
  );
  if (rows.length > 0) return null;

  const { buildRecordThreadSummary } = await import('./chatRecordSummaries.js');
  const { fallbackBody, card } = await buildRecordThreadSummary(recordType, recordId, {
    actorName,
    ...options,
  });

  const linkUrl =
    recordType === 'ticket'
      ? `/staff/cx/tickets/${recordId}`
      : recordType === 'project_request'
        ? `/project-request/project/${recordId}`
        : recordType === 'cash_request'
          ? `/cash-details/${recordId}`
          : recordType === 'item_return'
            ? `/item-returns/${recordId}`
            : `/request-forms/${recordId}`;

  const linkLabel =
    recordType === 'ticket'
      ? 'Open ticket'
      : recordType === 'project_request'
        ? 'View project'
        : recordType === 'cash_request'
          ? 'View cash request'
          : recordType === 'item_return'
            ? 'View return'
            : 'View request';

  return postSystemMessage({
    channelId,
    body: fallbackBody,
    relatedType: recordType,
    relatedId: recordId,
    linkUrl,
    linkLabel,
    summaryCard: card,
    io,
  });
}
