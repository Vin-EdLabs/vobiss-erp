/**
 * Ticket routing to NOC + configurable auto-escalation matrix.
 */
import {
  DEFAULT_TICKET_ESCALATION,
  normalizeTicketEscalationConfig,
} from './ticketEscalationConfig.js';

async function getPool() {
  const mod = await import('./db.js');
  return mod.default;
}

/** Loaded from Configuration → workflow_config.ticket_escalation (minutes per stage). */
export async function getTicketEscalationConfig() {
  try {
    const { getWorkflowConfig } = await import('./db.js');
    const wf = await getWorkflowConfig();
    return wf.ticket_escalation || { ...DEFAULT_TICKET_ESCALATION };
  } catch {
    return { ...DEFAULT_TICKET_ESCALATION };
  }
}

function stageConfig(config, stageKey) {
  if (!config?.stages?.length) return DEFAULT_TICKET_ESCALATION.stages[0];
  return config.stages.find((s) => s.key === stageKey) || config.stages[0];
}

function firstStage(config) {
  return config?.stages?.[0] || DEFAULT_TICKET_ESCALATION.stages[0];
}

/** Next stage follows the order saved in Configuration (not hardcoded defaults). */
function nextStageKey(config, currentKey) {
  const stages = config?.stages || [];
  const idx = stages.findIndex((s) => s.key === currentKey);
  if (idx < 0 || idx >= stages.length - 1) return null;
  return stages[idx + 1].key;
}

function minutesForStage(stage) {
  return Math.max(0, parseInt(stage?.minutes, 10) || 0);
}

function manualRoutingStage(stageKey) {
  const key = String(stageKey || '').trim().toLowerCase();
  const stages = {
    noc: { key: 'noc', label: 'NOC' },
    ip: { key: 'ip', label: 'IP' },
    tx: { key: 'tx', label: 'TX' },
  };
  return stages[key] || null;
}

export async function applyNewTicketRouting(client, internalTicketId, ticketPublicId, actorId = null, initialStageKey = null) {
  const config = await getTicketEscalationConfig();
  const manualStage = initialStageKey ? manualRoutingStage(initialStageKey) : null;
  const first = manualStage || (initialStageKey ? stageConfig(config, initialStageKey) : firstStage(config));
  const dueMinutes = minutesForStage(first);
  const escalationOn = manualStage ? false : config.enabled !== false;

  // Stay unassigned until a user explicitly assigns (including self-assign from NOC).
  await client.query(
    `UPDATE tickets SET
      escalation_stage = $1,
      stage_entered_at = CURRENT_TIMESTAMP,
      stage_accepted_at = NULL,
      escalation_due_at = CASE
        WHEN $2 AND $3::int > 0 THEN CURRENT_TIMESTAMP + ($3::text || ' minutes')::interval
        ELSE NULL
      END,
      auto_escalation_enabled = $2,
      status = CASE WHEN status = 'NEW' THEN 'OPEN' ELSE status END,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [first.key, escalationOn, dueMinutes, internalTicketId]
  );

  const slaNote =
    escalationOn && dueMinutes > 0
      ? ` (auto-escalates in ${dueMinutes} min per configuration)`
      : '';
  const msg = `Routed to ${first.label} — awaiting owner assignment${slaNote}`;

  await client.query(
    `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
     VALUES ($1, 'ROUTED', $2, 'internal', $3, 'system', 'Escalation Engine')`,
    [internalTicketId, msg, actorId || 0]
  );

  return { stage: first.key, stageLabel: first.label, assigneeId: null, dueMinutes };
}

export async function markTicketStageAccepted(ticketPublicId, userId) {
  const pool = await getPool();
  const config = await getTicketEscalationConfig();
  const res = await pool.query(
    `SELECT id, escalation_stage, stage_accepted_at, status
     FROM tickets WHERE ticket_id = $1`,
    [ticketPublicId]
  );
  if (!res.rows[0]) throw new Error('Ticket not found');
  const t = res.rows[0];
  if (['RESOLVED', 'CLOSED'].includes(t.status)) {
    throw new Error('Ticket is already closed');
  }

  // Acknowledge stage only — do not clear escalation timer; ticket escalates until someone assigns.
  await pool.query(
    `UPDATE tickets SET
      stage_accepted_at = COALESCE(stage_accepted_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [t.id]
  );

  const userRes = await pool.query(
    `SELECT first_name, last_name, role FROM users WHERE id = $1`,
    [userId]
  );
  const u = userRes.rows[0];
  const name = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : 'Staff';

  await pool.query(
    `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
     VALUES ($1, 'ACCEPTED', $2, 'internal', $3, $4, $5)`,
    [
      t.id,
      `Accepted at ${stageConfig(config, t.escalation_stage).label} stage`,
      userId,
      u?.role || 'staff',
      name,
    ]
  );

  return { ok: true };
}

export async function processAutoEscalations() {
  const pool = await getPool();
  const config = await getTicketEscalationConfig();
  if (!config.enabled) return { processed: 0 };

  const { rows: due } = await pool.query(
    `SELECT id, ticket_id, title, escalation_stage, assigned_to
     FROM tickets
     WHERE auto_escalation_enabled = true
       AND assigned_to IS NULL
       AND escalation_due_at IS NOT NULL
       AND escalation_due_at <= CURRENT_TIMESTAMP
       AND status NOT IN ('RESOLVED', 'CLOSED')`
  );

  let processed = 0;
  const chatNotices = [];

  for (const ticket of due) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = stageConfig(config, ticket.escalation_stage);
      const nextKey = nextStageKey(config, ticket.escalation_stage);
      if (!nextKey) {
        await client.query('UPDATE tickets SET escalation_due_at = NULL WHERE id = $1', [ticket.id]);
        await client.query('COMMIT');
        continue;
      }

      const next = stageConfig(config, nextKey);
      const dueMinutes = minutesForStage(next);

      await client.query(
        `UPDATE tickets SET
          escalation_stage = $1,
          stage_entered_at = CURRENT_TIMESTAMP,
          stage_accepted_at = NULL,
          assigned_to = NULL,
          escalation_due_at = CASE
            WHEN $2::int > 0 THEN CURRENT_TIMESTAMP + ($2::text || ' minutes')::interval
            ELSE NULL
          END,
          status = CASE WHEN status IN ('NEW') THEN 'OPEN' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [nextKey, dueMinutes, ticket.id]
      );

      const nextSla =
        dueMinutes > 0 ? ` Next stage SLA: ${dueMinutes} min (from configuration).` : '';
      await client.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'AUTO_ESCALATED', $2, 'internal', 0, 'system', 'Escalation Engine')`,
        [
          ticket.id,
          `Auto-escalated from ${current.label} to ${next.label} — still unassigned until a team member assigns an owner.${nextSla}`,
        ]
      );

      await client.query('COMMIT');
      chatNotices.push({
        ticketId: ticket.ticket_id,
        title: ticket.title,
        stageLabel: next.label,
        fromLabel: current.label,
      });
      processed += 1;
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[escalation]', ticket.ticket_id, e.message);
    } finally {
      client.release();
    }
  }

  if (chatNotices.length) {
    try {
      const { postTicketEscalationSystemMessage } = await import('./services/chatSystemMessage.js');
      let io = null;
      try {
        const { getRealtimeIo } = await import('./realtime/channels.js');
        io = getRealtimeIo();
      } catch {
        io = null;
      }
      for (const n of chatNotices) {
        await postTicketEscalationSystemMessage({ ...n, io });
      }
    } catch (e) {
      console.warn('[chat] escalation notices failed:', e.message);
    }
  }

  return { processed };
}

/**
 * After Configuration saves new minutes, recompute due times for open unassigned tickets
 * from stage_entered_at + configured minutes for their current stage.
 */
export async function resyncOpenTicketEscalationTimers() {
  const pool = await getPool();
  const config = await getTicketEscalationConfig();
  const escalationOn = config.enabled !== false;

  if (!escalationOn) {
    await pool.query(
      `UPDATE tickets SET auto_escalation_enabled = false, escalation_due_at = NULL
       WHERE assigned_to IS NULL AND status NOT IN ('RESOLVED', 'CLOSED')`
    );
    return { updated: 0, disabled: true };
  }

  const { rows } = await pool.query(
    `SELECT id, escalation_stage, stage_entered_at
     FROM tickets
     WHERE assigned_to IS NULL
       AND status NOT IN ('RESOLVED', 'CLOSED')
       AND escalation_stage IS NOT NULL`
  );

  let updated = 0;
  for (const t of rows) {
    const stage = stageConfig(config, t.escalation_stage);
    const minutes = minutesForStage(stage);
    const entered = t.stage_entered_at || new Date();

    if (minutes > 0) {
      await pool.query(
        `UPDATE tickets SET
          escalation_due_at = $1::timestamp + ($2::text || ' minutes')::interval,
          auto_escalation_enabled = true,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [entered, String(minutes), t.id]
      );
    } else {
      await pool.query(
        `UPDATE tickets SET escalation_due_at = NULL, auto_escalation_enabled = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [t.id]
      );
    }
    updated += 1;
  }

  return { updated, disabled: false };
}
