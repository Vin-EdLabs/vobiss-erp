import pool from '../db.js';
import { buildVobiFeedSnapshot } from './vobiLiveFeed.js';
import { generateLiveOpsNarration } from './vobiFeedGemini.js';
import { emitToUser } from '../realtime/channels.js';
import { getVobiSystemData } from './vobiDataService.js';

/** Exact, confirmed route patterns for every record type this feature ever mentions — handed
 *  to the model verbatim so it always builds a real, correct internal link instead of refusing
 *  ("I don't have URLs") or inventing a wrong one. */
const LINK_PATTERNS = `LINK PATTERNS — every record you mention MUST include a markdown link built from these exact patterns (never say you don't have a link, never invent a different path):
- ticket → /staff/cx/tickets/{ticket_number}  (use the display code, e.g. TCK-000001 — the "ticket_number" field)
- service request → /project-request/{id}  (the numeric id — for approvals/service_requests data this is record_ref.id)
- material request → /request-forms/{id}
- cash request → /cash-details/{id}
- transport request → /transport-requests/{id}
- field work → /staff/field/field-work/{id}
Example: "**[TCK-000001](/staff/cx/tickets/TCK-000001)**" or "the **[Material Request](/request-forms/13)**".`;

/**
 * The Executive Summary — a standing, always-pre-generated briefing for director/CTO/system
 * admin only. Same source data as the public Live Ops feed (buildVobiFeedSnapshot), but run
 * with includeCashAmounts:true and a much more candid, unfiltered prompt, since its only
 * readers are already authorized to see everything. Regenerated on a timer (never on-demand
 * from a user click) so it's always sitting there ready the moment someone opens the panel.
 */

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

let cache = { text: null, generatedAt: null, generating: false };

const EXEC_SUMMARY_PROMPT_TEMPLATE = `You are Vobi, the internal operational assistant for Vobiss, writing a private executive briefing for the CTO, Director, and System Admin — the most senior people in the company. This is NOT the public Live Ops feed everyone else reads; it is for their eyes only, so include full financial figures (cash request amounts included) and never withhold, hedge, or vague-up a detail the way the public feed does.

TONE: Write like the sharpest, most plugged-in person in the building giving their boss the real, unfiltered rundown — the way a trusted chief of staff briefs an executive over coffee: candid, direct, connecting dots across departments, calling out what is actually urgent versus what is noise. Talk straight, like you're telling them everything, not filing a report — but stay professional; candid is not the same as careless.

RULES:
- Always use real names, ticket numbers, full amounts (cash requests included — this reader may see every figure), and departments. Never anonymize, hedge, or say "an amount."
- NEVER quote a raw timestamp — every date value in the DATA below is already a short phrase (e.g. "3 hrs ago," "in 40 min"); use that phrase as-is.
- For every ticket: its description, latest note or update, who holds it, and who it is assigned to. Flag SLA breaches loudly and specifically — name the ticket, how many hours overdue, who currently owns it, using the exact phrase "SLA BREACH".
- For escalated tickets: quote the escalation reason, who escalated it, how long it has sat at that level.
- For every approval (including cash requests, now WITH the real amount): the requester's full name, department, the amount, exactly how long it has been waiting, and who it is pending on right now — name that person directly. If someone has already approved, name them as done.
- For service requests: the assigned unit, and the specific individual working it if one is named in the data.
- Call out cross-module connections and stalled chains explicitly when the data shows them.
- Give real credit for genuine wins — closed tickets, approved requests, resolved escalations — naming who delivered them.
- End with a short, honest paragraph verdict on overall company health right now — the kind of direct read an executive actually needs, not corporate hedging.
- Do not omit a record because it seems minor — be thorough; an executive can skim a bullet list, but nothing should be missing from it.

FORMATTING (Markdown, rendered for the executive to read — not raw JSON, not a system log):
- Bold every ticket/SR number, person's full name, money amount, and the exact phrase "SLA BREACH".
- Section headings, in this exact order:
  ## OVERVIEW — 2 to 4 flowing sentences, no bullets, no sub-heading list. This is the opening of the briefing: what's the overall state of things right now, in plain human terms, and what is the ONE thing you would personally suggest doing first to improve it. Warm, direct, confident — like the opening line of a real conversation. Do NOT greet the reader by name or say "Hello" / "Dear" / "Good morning" — the app already greets them separately before this text; starting the same way again would be redundant. Just start talking.
  ## NEEDS YOUR ATTENTION — the specific items that genuinely need a decision or action from this reader, and only this reader, right now: approvals stuck waiting on an executive sign-off, SLA breaches nobody below them is moving on, anything stalled specifically because it's waiting on the CTO/Director/System Admin. Name each one and say exactly what action would clear it. If truly nothing needs their personal reaction right now, say that plainly in one line.
  ## TICKETS & ESCALATIONS
  ## SERVICE REQUESTS
  ## APPROVALS & CASH FLOW
  ## FIELD ACTIVITIES
  ## STOCK
  ## SINCE LAST BRIEFING
  ## THE BOTTOM LINE
- Use a bullet list ("- " per record) for any section with three or more similar records; use flowing prose for narrative/connective points, for OVERVIEW, and for THE BOTTOM LINE.
- If a section has nothing to report, say so in one short line rather than omitting the heading.

${LINK_PATTERNS}

DATA:
__SNAPSHOT_JSON__`;

const FOLLOWUP_PROMPT_TEMPLATE = `You are Vobi, answering a follow-up question from a company executive (Director, CTO, or System Admin) — someone with full access to every module in the system. Answer directly and conversationally, in the same candid, unfiltered, professional voice as the briefing you just wrote them — real names, real amounts, no hedging, no "an amount" placeholders.

You have THREE sources of data below: the CURRENT BRIEFING (the operational snapshot you already wrote), PEOPLE DATA (filled in only if this question named someone specific), and SYSTEM DATA (a live, broad pull covering inventory, finance, HR, assets, clients, tickets, and more — company-wide, since this reader is authorized to see all of it). Use whichever of these actually answers the question — the question is not limited to what's in the briefing.

- If PEOPLE DATA contains a resolved person, this question is almost certainly about them — answer using their real profile: role/position/unit, recent tickets/requests/field work, and performance report history (scores, status, most recent title). Write it like a well-informed colleague giving a fair, honest read on their recent work and standing — not a raw data dump, an actual assessment. Say plainly if a part of the record is thin (e.g. no performance reports yet) rather than padding it out.
- If the question is about the company's operational state generally, answer from CURRENT BRIEFING and SYSTEM DATA together, staying consistent with what the briefing already said.
- If the question is about something else entirely on file — inventory levels, a client, an asset, HR/payroll counts, a specific record — look for it in SYSTEM DATA and answer from there.
- NEVER refuse or say "I don't have access to that" — this reader has access to everything, and so do you. If the exact figure genuinely is not present in the data below, say what you can infer from what IS there and give your best operational judgment, clearly flagged as an estimate/inference (e.g. "I don't have an exact count on file, but based on X this is likely Y") — always give a substantive answer, never a flat refusal.
- If asked for a link or "where can I see this," ALWAYS provide one using the LINK PATTERNS below — never say you don't have web links or tell them to go search the portal themselves. That's exactly what the link is for.
- Never invent a fact that isn't in the data below or reasonably inferable from it. Keep the answer focused and conversational — a few sentences to a short paragraph is usually right unless the question specifically asks for a list.

FORMATTING: Markdown. Bold names, ticket/SR numbers, amounts, and "SLA BREACH" where relevant. No need for section headings in a follow-up answer — just write the answer.

${LINK_PATTERNS}

CURRENT BRIEFING:
__BRIEFING__

PEOPLE DATA (only populated if this question named a specific person):
__PEOPLE_JSON__

SYSTEM DATA (broad, live, company-wide — use for anything not covered by the briefing or people data):
__SYSTEM_JSON__

CONVERSATION SO FAR:
__HISTORY__`;

/** Director/CTO/system-admin user ids — the only people the exec summary is ever pushed to. */
async function getExecutiveUserIds() {
  const { rows } = await pool.query(`
    SELECT id FROM users
    WHERE deleted_at IS NULL AND (
      LOWER(COALESCE(position, '')) IN ('director', 'cto')
      OR LOWER(COALESCE(role, '')) IN ('director', 'cto', 'superadmin')
      OR LOWER(COALESCE(main_role, '')) IN ('director', 'cto', 'superadmin')
    )
  `);
  return rows.map((r) => r.id);
}

export function getCachedExecutiveSummary() {
  return { summary: cache.text, generated_at: cache.generatedAt };
}

export async function runExecSummarySweep() {
  if (cache.generating) return null;
  cache.generating = true;
  try {
    const snapshot = await buildVobiFeedSnapshot({ includeCashAmounts: true });
    const systemInstruction = EXEC_SUMMARY_PROMPT_TEMPLATE.replace('__SNAPSHOT_JSON__', JSON.stringify(snapshot, null, 2));

    const narratedText = await generateLiveOpsNarration(systemInstruction, 'Generate the executive briefing now.', {
      timeoutMs: 60000,
      label: 'vobi-exec-summary',
    });

    cache = { text: narratedText, generatedAt: new Date().toISOString(), generating: false };

    const execIds = await getExecutiveUserIds();
    for (const id of execIds) {
      emitToUser(id, 'vobi:exec-summary-update', { summary: narratedText, generated_at: cache.generatedAt });
    }
    console.log(`[vobi-exec-summary] sweep complete — briefing regenerated and pushed to ${execIds.length} executive(s)`);
    return cache;
  } catch (error) {
    console.error('[vobi-exec-summary] sweep failed:', error.message);
    cache.generating = false;
    return null;
  }
}

/** Used by the GET route: returns the cache immediately if warm, otherwise generates once
 *  synchronously (only ever hit on a cold boot before the first timer sweep has landed). */
export async function ensureExecutiveSummary() {
  if (cache.text) return getCachedExecutiveSummary();
  await runExecSummarySweep();
  return getCachedExecutiveSummary();
}

export const EXEC_SUMMARY_SWEEP_INTERVAL_MS = SWEEP_INTERVAL_MS;

const NAME_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'about', 'from', 'that', 'this', 'what', 'who', 'how', 'tell',
  'show', 'give', 'has', 'have', 'his', 'her', 'their', 'they', 'are', 'was', 'were', 'did',
  'does', 'doing', 'recent', 'activity', 'performance', 'work', 'works', 'working', 'system',
  'company', 'ticket', 'tickets', 'request', 'requests', 'him', 'her', 'them', 'you', 'your',
  'please', 'can', 'could', 'would', 'when', 'where', 'why', 'doing', 'been', 'more', 'today',
]);

/** Pulls plausible name fragments (single words and adjacent word-pairs) out of a free-text
 *  question, so a follow-up like "how is Sarah Chrapah doing lately?" can be matched against
 *  real users without any NLP dependency. */
function extractNameCandidates(question) {
  const words = String(question || '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const singleWords = [...new Set(
    words.map((w) => w.toLowerCase()).filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w))
  )];
  const phrases = [...new Set(
    words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`.toLowerCase()).filter((p) => p.length >= 5)
  )];
  return { singleWords, phrases };
}

/** Resolves up to a few real users mentioned by name in a follow-up question. */
async function findMentionedPeople(question) {
  const { singleWords, phrases } = extractNameCandidates(question);
  if (!singleWords.length && !phrases.length) return [];
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, username, position, unit
     FROM users
     WHERE deleted_at IS NULL AND (
       LOWER(TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,'')))) = ANY($1::text[])
       OR LOWER(first_name) = ANY($2::text[])
       OR LOWER(last_name) = ANY($2::text[])
     )
     LIMIT 5`,
    [phrases, singleWords]
  );
  return rows;
}

/** Everything on file about one person: who they are, what they've recently touched across
 *  tickets/requests/transport/field work, and their performance report history — the same
 *  breadth as the Employee Performance Search feature, gathered here for Vobi to narrate. */
async function buildPersonProfile(personId) {
  const userRes = await pool.query(
    `SELECT id, first_name, last_name, username, position, unit, units, department, role
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [personId]
  );
  const user = userRes.rows[0];
  if (!user) return null;

  const [ticketsRes, requestsRes, transportRes, fieldRes, reportsRes] = await Promise.all([
    pool.query(
      `SELECT ticket_id, title, status, priority, created_at FROM tickets WHERE assigned_to = $1 ORDER BY created_at DESC LIMIT 8`,
      [personId]
    ),
    pool.query(
      `SELECT id, type, purpose, status, total_amount, created_at FROM requests WHERE created_by_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 8`,
      [personId]
    ),
    pool.query(
      `SELECT id, site_name, purpose, status, created_at FROM transport_requests WHERE requester_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5`,
      [personId]
    ),
    pool.query(
      `SELECT fw.id, fw.title, fw.status, fw.created_at
       FROM field_work fw JOIN field_work_engineers fe ON fe.field_work_id = fw.id
       WHERE fe.user_id = $1 AND fe.removed_at IS NULL
       ORDER BY fw.created_at DESC LIMIT 5`,
      [personId]
    ),
    pool.query(
      `SELECT title, status, system_score, supervisor_score, manager_score, cto_score, final_score, created_at, finalized_at
       FROM performance_reports WHERE employee_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [personId]
    ),
  ]);

  return {
    full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
    position: user.position,
    unit: user.unit,
    department: user.department,
    role: user.role,
    recent_tickets_assigned: ticketsRes.rows,
    recent_requests_created: requestsRes.rows.map((r) => ({
      ...r,
      total_amount: r.total_amount != null ? Number(r.total_amount) : null,
    })),
    recent_transport_requests: transportRes.rows,
    recent_field_work: fieldRes.rows,
    performance_reports: reportsRes.rows,
  };
}

/** Answers a follow-up question about the standing briefing — on the same isolated Gemini key
 *  pool as the Live Ops / Executive Summary sweeps (vobiFeedGemini.js), never the shared pool
 *  everyone's regular Vobi chat uses, so heavy chat traffic can never starve this feature (or
 *  vice versa). This reader has full system access, so the question isn't limited to what's in
 *  the briefing: resolves any person named in the question (their full profile — recent
 *  tickets, requests, field work, performance reports) AND pulls the same broad, company-wide
 *  data snapshot the main Vobi chat assistant uses (inventory/finance/HR/assets/clients/etc,
 *  via vobiDataService.js's data-gathering only — no Gemini call happens on that shared pool),
 *  so nothing on file is out of reach for a follow-up. */
export async function answerExecutiveFollowUp(question, history = [], viewer = null) {
  const { summary } = getCachedExecutiveSummary();

  const role = viewer?.main_role || viewer?.role || 'director';
  const position = viewer?.position || null;
  const company = viewer?.company ?? null;

  const [mentionedPeople, systemData] = await Promise.all([
    findMentionedPeople(question),
    getVobiSystemData(viewer?.id ?? null, role, position, company).catch((err) => {
      console.warn('[vobi-exec-summary] system data fetch failed:', err.message);
      return null;
    }),
  ]);
  const profiles = (
    await Promise.all(mentionedPeople.slice(0, 2).map((p) => buildPersonProfile(p.id)))
  ).filter(Boolean);

  const historyText = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((h) => `${h?.role === 'user' ? 'Executive' : 'Vobi'}: ${h?.content || ''}`)
    .join('\n');

  const systemInstruction = FOLLOWUP_PROMPT_TEMPLATE.replace('__BRIEFING__', summary || 'No briefing has been generated yet.')
    .replace('__PEOPLE_JSON__', profiles.length ? JSON.stringify(profiles, null, 2) : 'No specific person was identified in this question.')
    .replace('__SYSTEM_JSON__', systemData ? JSON.stringify(systemData, null, 2) : 'System data temporarily unavailable — answer from the briefing and people data only.')
    .replace('__HISTORY__', historyText || '(no prior turns)');

  return generateLiveOpsNarration(systemInstruction, question, { timeoutMs: 45000, label: 'vobi-exec-summary-ask' });
}
