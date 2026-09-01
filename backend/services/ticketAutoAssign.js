/**
 * Safety net for the NOC queue: a ticket that's been sitting in NOC, unassigned, for 10+
 * minutes gets auto-assigned to whoever's on duty right now (NOC's real shift roster —
 * see routes/nocShifts.js) instead of waiting indefinitely for someone to manually claim it.
 * IP/TX have no shift roster today, so they're intentionally out of scope here.
 */
import pool from '../db.js';
import { getShiftDefinitions, buildDutySnapshot } from '../routes/nocShifts.js';
import { getCurrentAndNextShift } from '../utils/shiftTime.js';
import { updateTicketStaff } from '../db.ticketing.cjs';

const IDLE_MINUTES = 10;

/** Who's on duty right now, per NOC's shift schedule — primary duty owner, falling back to
 *  the shift lead, then the first staff member on that shift. Null if nobody's scheduled. */
export async function getOnDutyUserId() {
  const defs = await getShiftDefinitions({ activeOnly: true });
  const { current } = getCurrentAndNextShift(defs, new Date());
  const snapshot = await buildDutySnapshot(current);
  const person = snapshot?.primaryDutyStaff || snapshot?.shiftLead || snapshot?.staff?.[0];
  return person?.userId || null;
}

export async function runTicketAutoAssignSweep() {
  const { rows: due } = await pool.query(`
    SELECT id, ticket_id FROM tickets
    WHERE escalation_stage = 'noc' AND assigned_to IS NULL
      AND status NOT IN ('RESOLVED', 'CLOSED')
      AND stage_entered_at <= NOW() - INTERVAL '${IDLE_MINUTES} minutes'
  `);
  if (!due.length) return { assigned: 0 };

  const onDutyUserId = await getOnDutyUserId();
  if (!onDutyUserId) return { assigned: 0 }; // nobody scheduled right now — retried next tick

  let assigned = 0;
  for (const { id, ticket_id } of due) {
    try {
      // Atomic claim first — guards against this same ticket being processed twice if a sweep
      // tick is somehow still running when the next one fires (or two server instances exist).
      // Only the caller whose conditional UPDATE actually matches a row proceeds.
      const claim = await pool.query(
        `UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2 AND assigned_to IS NULL RETURNING id`,
        [onDutyUserId, id]
      );
      if (!claim.rows.length) continue;

      // actor is the assignee themself (a self-claim on the system's behalf) — updateTicketStaff
      // requires a resolvable actor_id (ticket_timeline.actor_id is NOT NULL); the extra note
      // below makes clear in the audit trail that this was automatic, not a manual pickup.
      await updateTicketStaff(ticket_id, { assigned_to: onDutyUserId, isEscalation: false }, onDutyUserId, 'SYSTEM', 'auto-assign');
      await pool.query(
        `INSERT INTO ticket_timeline (ticket_id, action, message, visibility, actor_id, actor_role, actor_name)
         VALUES ($1, 'COMMENT', $2, 'internal', $3, 'SYSTEM', 'Auto-Assign')`,
        [id, `Auto-assigned to the on-duty NOC staff member — ticket was idle ${IDLE_MINUTES}+ minutes with nobody assigned.`, onDutyUserId]
      );
      assigned++;
    } catch (e) {
      console.error('[ticket-auto-assign] failed for', ticket_id, e.message);
    }
  }
  return { assigned };
}
