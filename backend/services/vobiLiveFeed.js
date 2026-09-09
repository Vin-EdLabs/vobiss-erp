import pool, { getLowStockItems } from '../db.js';
import { getLiveOverview } from './workflowTimeEngine.js';
import { generateLiveOpsNarration } from './vobiFeedGemini.js';
import { emitToStaff } from '../realtime/channels.js';

/**
 * Vobi Live Ops Feed — a 15-minute company-wide operational sweep that hands a structured
 * snapshot of open tickets/SRs/approvals/field work/stock to Gemini and saves the narrated
 * result. Reuses the existing generic SLA/timing engine (workflowTimeEngine.js) for elapsed
 * time + breach status instead of recomputing SLA math here, and the existing per-priority
 * ticket SLA deadlines (tickets.response_due_at / resolution_due_at, set at creation by
 * ticketSlaConfig.js) for ticket-specific breach detection.
 */

const FIELD_WORK_TERMINAL_STATUSES = new Set(['completed', 'closed']);
const REQUEST_TERMINAL_STATUSES = new Set(['completed', 'rejected']);
const PROJECT_REQUEST_TERMINAL_STATUSES = new Set(['completed', 'rejected']);

let tableReady = false;
export async function ensureVobiFeedTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vobi_feed (
      id SERIAL PRIMARY KEY,
      company VARCHAR(20) NOT NULL DEFAULT 'CW',
      narrated_text TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vobi_feed_company_created_idx ON vobi_feed(company, created_at DESC);
    CREATE INDEX IF NOT EXISTS vobi_feed_expires_idx ON vobi_feed(expires_at);
  `);
  tableReady = true;

  // Reactions and "seen by" are engagement features layered on top of the feed, not required
  // for the sweep itself — creating them is wrapped separately so a failure here (or on any
  // later call) can never take down vobi_feed, which the 15-minute sweep genuinely depends on.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vobi_feed_reactions (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER REFERENCES vobi_feed(id) ON DELETE CASCADE,
        staff_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(feed_id, staff_id, emoji)
      );
      CREATE INDEX IF NOT EXISTS vobi_feed_reactions_feed_idx ON vobi_feed_reactions(feed_id);

      CREATE TABLE IF NOT EXISTS vobi_feed_seen (
        id SERIAL PRIMARY KEY,
        feed_id INTEGER REFERENCES vobi_feed(id) ON DELETE CASCADE,
        staff_id TEXT NOT NULL,
        initials TEXT NOT NULL,
        seen_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(feed_id, staff_id)
      );
      CREATE INDEX IF NOT EXISTS vobi_feed_seen_feed_idx ON vobi_feed_seen(feed_id);
    `);
  } catch (e) {
    console.warn('[vobi-live-feed] reactions/seen schema:', e.message);
  }
}

/** Bulk-loads reactions + seen state for a set of feed ids and shapes each into the
 *  { reactions: [{emoji,count,reacted_by_me}], seen: [{staff_id,initials}] } the frontend
 *  renders directly — used by GET / and after mutations so every response has the same shape. */
export async function attachFeedEngagement(rows, viewerStaffId) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);

  const [reactionsRes, seenRes] = await Promise.all([
    pool.query(`SELECT feed_id, emoji, staff_id FROM vobi_feed_reactions WHERE feed_id = ANY($1::int[])`, [ids]).catch(() => ({ rows: [] })),
    pool.query(`SELECT feed_id, staff_id, initials FROM vobi_feed_seen WHERE feed_id = ANY($1::int[]) ORDER BY seen_at ASC`, [ids]).catch(() => ({ rows: [] })),
  ]);

  const reactionsByFeed = new Map();
  for (const r of reactionsRes.rows) {
    if (!reactionsByFeed.has(r.feed_id)) reactionsByFeed.set(r.feed_id, new Map());
    const byEmoji = reactionsByFeed.get(r.feed_id);
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, reacted_by_me: false });
    const bucket = byEmoji.get(r.emoji);
    bucket.count += 1;
    if (String(r.staff_id) === String(viewerStaffId)) bucket.reacted_by_me = true;
  }

  const seenByFeed = new Map();
  for (const s of seenRes.rows) {
    if (!seenByFeed.has(s.feed_id)) seenByFeed.set(s.feed_id, []);
    seenByFeed.get(s.feed_id).push({ staff_id: s.staff_id, initials: s.initials });
  }

  return rows.map((row) => ({
    ...row,
    reactions: [...(reactionsByFeed.get(row.id)?.values() || [])],
    seen: seenByFeed.get(row.id) || [],
  }));
}

/** Toggle one staff member's reaction on one feed entry — add if missing, remove if present.
 *  Returns the emoji's new total count alongside which way it just moved. */
export async function toggleFeedReaction(feedId, staffId, emoji) {
  const existing = await pool.query(
    `SELECT 1 FROM vobi_feed_reactions WHERE feed_id = $1 AND staff_id = $2 AND emoji = $3`,
    [feedId, staffId, emoji]
  );
  let action;
  if (existing.rowCount > 0) {
    await pool.query(`DELETE FROM vobi_feed_reactions WHERE feed_id = $1 AND staff_id = $2 AND emoji = $3`, [feedId, staffId, emoji]);
    action = 'remove';
  } else {
    await pool.query(
      `INSERT INTO vobi_feed_reactions (feed_id, staff_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (feed_id, staff_id, emoji) DO NOTHING`,
      [feedId, staffId, emoji]
    );
    action = 'add';
  }
  const countRes = await pool.query(`SELECT COUNT(*)::int AS count FROM vobi_feed_reactions WHERE feed_id = $1 AND emoji = $2`, [feedId, emoji]);
  return { action, count: countRes.rows[0]?.count ?? 0 };
}

/** Records that one staff member has seen one feed entry — a no-op refresh if already recorded,
 *  never affects any other staff member's own read state. */
export async function recordFeedSeen(feedId, staffId, initials) {
  await pool.query(
    `INSERT INTO vobi_feed_seen (feed_id, staff_id, initials) VALUES ($1, $2, $3)
     ON CONFLICT (feed_id, staff_id) DO UPDATE SET initials = EXCLUDED.initials, seen_at = NOW()`,
    [feedId, staffId, initials]
  );
}

/** Deletes rows past their expiry — called at the top of every sweep, and safe to call anytime. */
export async function cleanupExpiredVobiFeed() {
  await ensureVobiFeedTable();
  const result = await pool.query(`DELETE FROM vobi_feed WHERE expires_at < CURRENT_TIMESTAMP`);
  return result.rowCount || 0;
}

function fullName(row, prefix = '') {
  const first = row[`${prefix}first_name`];
  const last = row[`${prefix}last_name`];
  const username = row[`${prefix}username`];
  return `${first || ''} ${last || ''}`.trim() || username || null;
}

function minutesBetween(from, to = new Date()) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
}

/** A short, human "3 hrs ago" / "in 40 min" phrase — every date handed to the narration model
 *  goes through this instead of a raw Date/ISO value, so it never has a reason (or the raw
 *  material) to quote a literal timestamp like "2026-09-03T19:01:25.934Z" in the write-up. */
function humanizeAgo(date) {
  if (!date) return null;
  const diffMs = Date.now() - new Date(date).getTime();
  const isPast = diffMs >= 0;
  const minutes = Math.round(Math.abs(diffMs) / 60000);
  let phrase;
  if (minutes < 1) return 'just now';
  else if (minutes < 60) phrase = `${minutes} min`;
  else if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    phrase = `${hours} hr${hours === 1 ? '' : 's'}`;
  } else {
    const days = Math.round(minutes / 1440);
    phrase = `${days} day${days === 1 ? '' : 's'}`;
  }
  return isPast ? `${phrase} ago` : `in ${phrase}`;
}

/** Segments (open, in-progress work) from the shared timing engine, keyed for O(1) lookup by the callers below. */
async function segmentIndex() {
  const live = await getLiveOverview();
  const byKey = new Map();
  for (const seg of live) {
    byKey.set(`${seg.workflowType}:${seg.recordId}`, seg);
  }
  return byKey;
}

async function gatherTickets(segments) {
  const { rows } = await pool.query(`
    SELECT t.id, t.ticket_id, t.title, t.description, t.priority, t.status, t.escalation_stage,
           t.created_at, t.stage_entered_at, t.response_due_at, t.resolution_due_at, t.sla_monitoring,
           u.first_name AS assignee_first_name, u.last_name AS assignee_last_name, u.username AS assignee_username
    FROM tickets t
    LEFT JOIN users u ON u.id = t.assigned_to
    WHERE t.status NOT IN ('RESOLVED', 'CLOSED')
    ORDER BY t.created_at ASC
    LIMIT 60
  `);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const timelineRes = await pool.query(
    `SELECT ticket_id, action, message, actor_name, created_at
     FROM ticket_timeline
     WHERE ticket_id = ANY($1::int[])
     ORDER BY ticket_id, created_at DESC`,
    [ids]
  );
  const timelineByTicket = new Map();
  for (const row of timelineRes.rows) {
    if (!timelineByTicket.has(row.ticket_id)) timelineByTicket.set(row.ticket_id, []);
    timelineByTicket.get(row.ticket_id).push(row);
  }

  const now = Date.now();
  return rows.map((t) => {
    const entries = timelineByTicket.get(t.id) || [];
    const latestNote = entries.find((e) => !['ESCALATED', 'AUTO_ESCALATED'].includes(e.action)) || entries[0] || null;
    const escalation = entries.find((e) => e.action === 'ESCALATED' || e.action === 'AUTO_ESCALATED') || null;
    const seg = segments.get(`ticket:${t.id}`);

    const responseBreached = t.sla_monitoring && t.response_due_at && new Date(t.response_due_at).getTime() < now;
    const resolutionBreached = t.sla_monitoring && t.resolution_due_at && new Date(t.resolution_due_at).getTime() < now;

    return {
      type: 'ticket',
      ticket_number: t.ticket_id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      queue_unit: t.escalation_stage,
      assigned_to: fullName(t, 'assignee_'),
      open_for_minutes: minutesBetween(t.created_at),
      latest_note: latestNote ? { message: latestNote.message, by: latestNote.actor_name, at: humanizeAgo(latestNote.created_at) } : null,
      escalated: !!escalation,
      escalation_reason: escalation ? escalation.message : null,
      escalated_by: escalation ? escalation.actor_name : null,
      sla_breach: Boolean(responseBreached || resolutionBreached),
      sla_breach_kind: resolutionBreached ? 'resolution' : responseBreached ? 'response' : null,
      response_due: humanizeAgo(t.response_due_at),
      resolution_due: humanizeAgo(t.resolution_due_at),
      elapsed_minutes: seg?.elapsedMinutes ?? null,
      timing_sla_status: seg?.slaStatus ?? null,
      record_ref: { type: 'ticket', id: t.id },
    };
  });
}

async function gatherServiceRequests(segments) {
  const { rows } = await pool.query(`
    SELECT id, customer_name, site_name, region, status, current_stage,
           project_unit_name, created_by_name, created_at, updated_at, design_assigned_name
    FROM project_requests
    WHERE status NOT IN ('completed', 'rejected')
    ORDER BY created_at ASC
    LIMIT 40
  `);
  return rows.map((pr) => {
    const candidates = ['service_request', 'design_request', 'sales_request']
      .map((wt) => segments.get(`${wt}:${pr.id}`))
      .filter(Boolean);
    const seg = candidates[0] || null;
    // Prefer a named individual currently working it (design claim, or whoever the timing
    // engine's open segment is attributed to for a review stage) over the bare unit name —
    // fall back to the unit when no one has personally picked it up yet.
    const assignedPerson = pr.design_assigned_name || seg?.userFullName || null;
    return {
      type: 'service_request',
      sr_number: `SR-${String(pr.id).padStart(4, '0')}`,
      title: `${pr.site_name || pr.customer_name || 'Site'} — ${pr.customer_name || ''}`.trim(),
      status: pr.status,
      current_stage: pr.current_stage,
      requesting_by: pr.created_by_name,
      assigned_unit: pr.project_unit_name,
      assigned_person: assignedPerson,
      time_in_current_status_minutes: minutesBetween(pr.updated_at || pr.created_at),
      elapsed_minutes: seg?.elapsedMinutes ?? null,
      sla_status: seg?.slaStatus ?? null,
      record_ref: { type: 'service_request', id: pr.id },
    };
  });
}

/** Real department for a request, never a guess: the requester's own free-text department
 * field on the request (material/cash only) first, then their account's actual department,
 * then their actual unit (e.g. "noc") formatted for display. Null — not a placeholder like
 * "General" — when none of those are on file; the prompt is told to omit it in that case
 * rather than invent one. */
const UNIT_ACRONYMS = new Set(['noc', 'ip', 'tx', 'ts', 'cx', 'hr']);
function formatUnitLabel(unit) {
  const clean = String(unit || '').trim().toLowerCase();
  if (!clean) return null;
  if (UNIT_ACRONYMS.has(clean)) return clean.toUpperCase();
  return clean.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function resolveDepartment(requestDepartment, userDepartment, userUnit) {
  const fromRequest = String(requestDepartment || '').trim();
  if (fromRequest) return fromRequest;
  const fromUser = String(userDepartment || '').trim();
  if (fromUser) return fromUser;
  return formatUnitLabel(userUnit);
}

async function gatherApprovals(segments, { includeCashAmounts = false } = {}) {
  const { rows: materialCash } = await pool.query(`
    SELECT r.id, r.type, r.created_by, r.department, r.purpose, r.total_amount, r.status, r.created_at,
           u.department AS user_department, u.unit AS user_unit
    FROM requests r
    LEFT JOIN users u ON u.id = r.created_by_id
    WHERE r.status NOT IN ('completed', 'rejected') AND r.deleted_at IS NULL
    ORDER BY r.created_at ASC
    LIMIT 40
  `);
  const { rows: transport } = await pool.query(`
    SELECT tr.id, tr.requester_name, tr.site_name, tr.purpose, tr.status, tr.current_stage, tr.created_at,
           u.department AS user_department, u.unit AS user_unit
    FROM transport_requests tr
    LEFT JOIN users u ON u.id = tr.requester_id
    WHERE tr.status = 'pending' AND tr.deleted_at IS NULL
    ORDER BY tr.created_at ASC
    LIMIT 20
  `);

  const requestIds = materialCash.map((r) => r.id);
  let pendingByRequest = new Map();
  if (requestIds.length) {
    const [assignedRes, approvedRes] = await Promise.all([
      pool.query(
        `SELECT ra.request_id, u.id AS user_id,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))),''), u.username) AS full_name
         FROM request_approvers ra JOIN users u ON u.id = ra.approver_id
         WHERE ra.request_id = ANY($1::int[])`,
        [requestIds]
      ),
      pool.query(
        `SELECT request_id, approver_id FROM approvals
         WHERE request_id = ANY($1::int[]) AND approval_stage = 'supervisor' AND approver_id IS NOT NULL`,
        [requestIds]
      ),
    ]);
    const approvedIdsByRequest = new Map();
    for (const row of approvedRes.rows) {
      if (!approvedIdsByRequest.has(row.request_id)) approvedIdsByRequest.set(row.request_id, new Set());
      approvedIdsByRequest.get(row.request_id).add(Number(row.approver_id));
    }
    for (const row of assignedRes.rows) {
      if (!pendingByRequest.has(row.request_id)) pendingByRequest.set(row.request_id, { pending: [], approved: [] });
      const bucket = pendingByRequest.get(row.request_id);
      const alreadyApproved = approvedIdsByRequest.get(row.request_id)?.has(Number(row.user_id));
      (alreadyApproved ? bucket.approved : bucket.pending).push(row.full_name);
    }
  }

  const fromRequests = materialCash.map((r) => {
    const seg = segments.get(`${r.type}:${r.id}`);
    const approverInfo = pendingByRequest.get(r.id) || null;
    return {
      type: r.type,
      requester_full_name: r.created_by,
      department_unit: resolveDepartment(r.department, r.user_department, r.user_unit),
      // Cash request amounts are financial data and never leave the public feed — withheld
      // here (not just asked-nicely of the model) so there's nothing for that narration to
      // leak. The executive summary sweep explicitly opts back in via includeCashAmounts,
      // since its readers (director/CTO/system admin) are already authorized to see them.
      amount: (r.type === 'cash_request' && !includeCashAmounts) ? null : (r.total_amount != null ? Number(r.total_amount) : null),
      purpose: r.purpose,
      approval_stage: r.status,
      pending_on: approverInfo?.pending || [],
      already_approved_by: approverInfo?.approved || [],
      waiting_minutes: minutesBetween(r.created_at),
      elapsed_minutes: seg?.elapsedMinutes ?? null,
      sla_status: seg?.slaStatus ?? null,
      record_ref: { type: r.type, id: r.id },
    };
  });

  const fromTransport = transport.map((r) => {
    const seg = segments.get(`transport_request:${r.id}`);
    return {
      type: 'transport_request',
      requester_full_name: r.requester_name,
      department_unit: resolveDepartment(null, r.user_department, r.user_unit),
      amount: null,
      purpose: r.purpose || r.site_name,
      approval_stage: r.current_stage,
      waiting_minutes: minutesBetween(r.created_at),
      elapsed_minutes: seg?.elapsedMinutes ?? null,
      sla_status: seg?.slaStatus ?? null,
      record_ref: { type: 'transport_request', id: r.id },
    };
  });

  return [...fromRequests, ...fromTransport];
}

async function gatherFieldActivities() {
  const { rows } = await pool.query(`
    SELECT fw.id, fw.title, fw.work_type, fw.status, fw.priority, fw.unit_slug, fw.created_at,
           cs.site_name, c.customer_name AS client_name
    FROM field_work fw
    LEFT JOIN customer_sites cs ON cs.id = fw.site_id
    LEFT JOIN customers c ON c.id = fw.client_id
    WHERE fw.status NOT IN ('completed', 'closed')
    ORDER BY fw.created_at ASC
    LIMIT 30
  `);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const engineerRes = await pool.query(
    `SELECT fe.field_work_id, u.first_name, u.last_name, u.username
     FROM field_work_engineers fe
     JOIN users u ON u.id = fe.user_id
     WHERE fe.field_work_id = ANY($1::int[]) AND fe.removed_at IS NULL`,
    [ids]
  );
  const engineersByJob = new Map();
  for (const row of engineerRes.rows) {
    if (!engineersByJob.has(row.field_work_id)) engineersByJob.set(row.field_work_id, []);
    engineersByJob.get(row.field_work_id).push(fullName(row));
  }

  return rows.map((fw) => ({
    type: 'field_activity',
    title: fw.title,
    work_type: fw.work_type,
    status: fw.status,
    priority: fw.priority,
    unit: fw.unit_slug,
    site_name: fw.site_name,
    client_name: fw.client_name,
    assigned_engineers: engineersByJob.get(fw.id) || [],
    active_for_minutes: minutesBetween(fw.created_at),
    record_ref: { type: 'field_work', id: fw.id },
  }));
}

async function gatherLowStock() {
  try {
    const items = await getLowStockItems();
    return items.slice(0, 25).map((i) => ({
      type: 'low_stock',
      item_name: i.name,
      quantity: i.quantity,
      threshold: i.low_stock_threshold ?? 5,
      category: i.category_name || null,
    }));
  } catch {
    return [];
  }
}

/** Cross-module connections via the same linked_references table the Reference Linking feature uses. */
async function gatherConnections(recordRefs) {
  if (!recordRefs.length) return [];
  const types = recordRefs.map((r) => r.type);
  const ids = recordRefs.map((r) => r.id);
  const { rows } = await pool.query(
    `SELECT source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title
     FROM linked_references
     WHERE (source_record_type = ANY($1::text[]) AND source_record_id = ANY($2::int[]))
        OR (linked_record_type = ANY($1::text[]) AND linked_record_id = ANY($2::int[]))
     LIMIT 40`,
    [types, ids]
  );
  return rows.map((r) => ({
    from: { type: r.source_record_type, id: r.source_record_id },
    to: { type: r.linked_record_type, id: r.linked_record_id, ref: r.linked_reference_number, title: r.linked_title },
  }));
}

async function gatherSinceLastUpdate(lastSweepAt, { includeCashAmounts = false } = {}) {
  if (!lastSweepAt) return { note: 'This is the first sweep — no prior update to compare against.' };

  const [ticketsClosed, requestsCompleted, srCompleted] = await Promise.all([
    pool.query(
      `SELECT ticket_id, title FROM tickets WHERE status IN ('RESOLVED','CLOSED') AND updated_at > $1 ORDER BY updated_at DESC LIMIT 15`,
      [lastSweepAt]
    ),
    pool.query(
      `SELECT id, type, created_by, total_amount FROM requests WHERE status = 'completed' AND updated_at > $1 ORDER BY updated_at DESC LIMIT 15`,
      [lastSweepAt]
    ),
    pool.query(
      `SELECT id, customer_name, site_name FROM project_requests WHERE (status = 'completed' OR current_stage = 'done') AND updated_at > $1 ORDER BY updated_at DESC LIMIT 15`,
      [lastSweepAt]
    ),
  ]);

  return {
    tickets_resolved: ticketsClosed.rows.map((t) => ({ ticket_number: t.ticket_id, title: t.title })),
    requests_completed: requestsCompleted.rows.map((r) => ({
      type: r.type,
      requester_full_name: r.created_by,
      // Same withholding as gatherApprovals (and same includeCashAmounts opt-in).
      amount: (r.type === 'cash_request' && !includeCashAmounts) ? null : (r.total_amount != null ? Number(r.total_amount) : null),
    })),
    service_requests_completed: srCompleted.rows.map((pr) => ({
      sr_number: `SR-${String(pr.id).padStart(4, '0')}`,
      title: `${pr.site_name || pr.customer_name || 'Site'}`,
    })),
  };
}

export async function buildVobiFeedSnapshot({ includeCashAmounts = false } = {}) {
  await ensureVobiFeedTable();

  const [segments, lastRow] = await Promise.all([
    segmentIndex(),
    pool.query(`SELECT created_at FROM vobi_feed ORDER BY created_at DESC LIMIT 1`),
  ]);
  const lastSweepAt = lastRow.rows[0]?.created_at || null;

  const [tickets, serviceRequests, approvals, fieldActivities, lowStock] = await Promise.all([
    gatherTickets(segments),
    gatherServiceRequests(segments),
    gatherApprovals(segments, { includeCashAmounts }),
    gatherFieldActivities(),
    gatherLowStock(),
  ]);

  const allRefs = [
    ...tickets.map((t) => t.record_ref),
    ...serviceRequests.map((s) => s.record_ref),
    ...approvals.map((a) => a.record_ref),
    ...fieldActivities.map((f) => f.record_ref),
  ];
  const [connections, sinceLastUpdate] = await Promise.all([
    gatherConnections(allRefs),
    gatherSinceLastUpdate(lastSweepAt, { includeCashAmounts }),
  ]);

  return {
    generated_at: new Date().toISOString(),
    tickets,
    service_requests: serviceRequests,
    approvals,
    field_activities: fieldActivities,
    low_stock: lowStock,
    connections,
    since_last_update: sinceLastUpdate,
  };
}

const SYSTEM_PROMPT_TEMPLATE = `You are Vobi, the internal operational assistant for Vobiss.
You are writing your 15-minute operational update for the Live Ops feed.
This post will be read by all staff across the company.

RULES:
- Write in clear, direct, human English — short flowing paragraphs by section, not a system log.
- Always use real names, ticket numbers, and amounts. Never say "a user" or "someone."
- NEVER quote a raw timestamp (anything like "2026-09-03T19:01:25.934Z" or "2026-09-03 19:01:25"). Every date-ish value in the DATA below is already given to you as a short phrase (e.g. "3 hrs ago," "in 40 min") for exactly this reason — always use that phrase as-is, never the underlying value it was computed from.
- GLOBAL EXCEPTION — cash requests (type "cash_request"), anywhere they appear in this update (approvals, since-last-update, anywhere): NEVER state, estimate, or imply the amount. Its "amount" field is intentionally left out of the data below — do not describe it as "an amount," "a sum," "undisclosed," or anything else that hints a figure exists; just don't mention money at all for these. Everyone should still know the work is happening; only authorized users see the real amount on the request's own page. Cover the requester's name, department, and stage/wait time exactly as you would for any other approval, styled like: "💰 **Cash Request** • Finance — **Sarah** submitted a cash request; awaiting Finance approval." or, once it has moved: "🟡 **Finance Update** — A cash request from **Sarah** has moved to the Finance Manager for review." A completed cash request in SINCE LAST UPDATE gets the same treatment, e.g.: "A cash request from **Sarah** was completed."
- For every ticket you mention: include its description, latest note or update, who holds it, and who it is assigned to.
- For escalated tickets: include the escalation reason word-for-word if available, who escalated it, and how long it has been at the current escalation level.
- Call out SLA breaches explicitly — state the ticket or request name, how many hours it is overdue, and who currently owns it. Use the phrase "SLA BREACH" clearly.
- For approvals: always state the full name of the requester, their department, the amount, and exactly how long it has been waiting (cash requests excepted — see above). Name exactly who it is pending on right now (from pending_on) — if only one person, name that person directly; if someone has already approved (already_approved_by), say so and name them as done.
- NEVER invent, assume, or default a department — every department/unit named in the DATA below is the real, on-file value. If a record's department_unit is null, that person has no department on file: say their name only and leave the department out of the sentence entirely. Do not write "General," "Unassigned," "an unspecified department," or any other placeholder for a missing department.
- For service requests: state the assigned unit, and if assigned_person is set, name that specific individual as the one actually working it (not just the unit).
- If a stalled ticket is connected to a stalled request or another record, point that out — explain the connection.
- Acknowledge positive progress — completed jobs, resolved tickets, approved requests — with the same energy as warnings.
- End with one clear sentence summarising overall system health.
- Sections to cover in order: TICKETS, SERVICE REQUESTS, APPROVALS, SINCE LAST UPDATE, OVERALL

FORMATTING (Markdown, rendered for staff to read on a feed — not raw JSON, not code):
- Bold the details that matter most: ticket/SR numbers, people's full names, money amounts, and the exact phrase "SLA BREACH" — wrap them in **double asterisks**.
- Use a short heading line for each section (e.g. "## TICKETS") followed by its paragraph(s).
- When a section covers three or more similar items (e.g. several tickets, several approvals), use a bullet list (one "- " item per record) instead of one long paragraph — each bullet should still read as a full sentence with the same bolded details.
- Keep bullets for lists of similar records; keep flowing sentences for narrative/connective points (escalation stories, cross-record connections, the OVERALL summary).

DATA:
__SNAPSHOT_JSON__`;

export async function runVobiFeedSweep() {
  try {
    await ensureVobiFeedTable();
    const removed = await cleanupExpiredVobiFeed();
    if (removed) console.log(`[vobi-live-feed] cleaned up ${removed} expired feed entr${removed === 1 ? 'y' : 'ies'}`);

    const snapshot = await buildVobiFeedSnapshot();
    const systemInstruction = SYSTEM_PROMPT_TEMPLATE.replace('__SNAPSHOT_JSON__', JSON.stringify(snapshot, null, 2));

    const narratedText = await generateLiveOpsNarration(systemInstruction, 'Generate the Live Ops update now.', {
      timeoutMs: 45000,
      label: 'vobi-live-feed',
    });

    const inserted = await pool.query(
      `INSERT INTO vobi_feed (company, narrated_text, expires_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '7 days')
       RETURNING id, company, narrated_text, created_at, expires_at`,
      ['CW', narratedText]
    );
    const feedEntry = inserted.rows[0];

    // Empty reactions/seen — a brand-new entry naturally has neither yet — keeps this event's
    // shape identical to what GET /api/vobi-feed returns, so the frontend can treat both the
    // same way instead of special-casing a freshly-arrived card.
    emitToStaff('vobi:feed-update', { ...feedEntry, reactions: [], seen: [] });
    console.log(`[vobi-live-feed] sweep complete — feed #${feedEntry.id} saved and broadcast`);
    return feedEntry;
  } catch (error) {
    console.error('[vobi-live-feed] sweep failed:', error.message);
    return null;
  }
}
