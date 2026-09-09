import pool from '../db.js';
import { createNotification } from '../db.js';
import { sendPushToUserIds } from '../push/sendPush.js';

/**
 * Hospital Insurance / Medical Benefit — company-wide policy template + per-category limits,
 * with individual overrides, claims logged against those limits, and a two-flow transfer
 * (rebalancing) system between categories.
 *
 * Balance model: nothing stores a running "used" total. `used` is always computed from
 * insurance_claims, and the net limit adjustment from insurance_transfers, both filtered to
 * the CURRENT staff_insurance_policy period's date range. An annual reset therefore never
 * touches historical rows — it just moves policy_start_date/end_date forward, and every
 * balance computation naturally starts from zero for the new window because the date filter
 * excludes last period's claims/transfers. Category overrides live on the policy row itself
 * (not the period), so they survive a reset untouched, exactly as the spec requires.
 */

const CLAIM_TYPES = ['inpatient', 'outpatient'];
const FLOW_TYPES = ['staff_confirm', 'hr_override'];
const TRANSFER_STATUSES = ['pending', 'approved', 'rejected', 'acknowledged', 'reversed'];

let tableReady = false;
export async function ensureInsuranceTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_policy_template (
      id SERIAL PRIMARY KEY,
      company_id VARCHAR(20) NOT NULL DEFAULT 'CW',
      name TEXT NOT NULL,
      description TEXT,
      policy_start_date DATE NOT NULL,
      policy_end_date DATE NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS insurance_policy_template_company_idx ON insurance_policy_template(company_id);

    CREATE TABLE IF NOT EXISTS insurance_categories (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES insurance_policy_template(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      outpatient_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
      inpatient_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE insurance_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
    CREATE INDEX IF NOT EXISTS insurance_categories_template_idx ON insurance_categories(template_id);

    CREATE TABLE IF NOT EXISTS staff_insurance_policy (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES insurance_policy_template(id) ON DELETE CASCADE,
      policy_start_date DATE NOT NULL,
      policy_end_date DATE NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (staff_id, template_id)
    );
    CREATE INDEX IF NOT EXISTS staff_insurance_policy_staff_idx ON staff_insurance_policy(staff_id);

    CREATE TABLE IF NOT EXISTS staff_insurance_category_override (
      id SERIAL PRIMARY KEY,
      staff_insurance_policy_id INTEGER NOT NULL REFERENCES staff_insurance_policy(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES insurance_categories(id) ON DELETE CASCADE,
      outpatient_limit NUMERIC(12,2),
      inpatient_limit NUMERIC(12,2),
      override_reason TEXT,
      overridden_by TEXT,
      overridden_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (staff_insurance_policy_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS staff_insurance_override_policy_idx ON staff_insurance_category_override(staff_insurance_policy_id);

    CREATE TABLE IF NOT EXISTS insurance_claims (
      id SERIAL PRIMARY KEY,
      staff_insurance_policy_id INTEGER NOT NULL REFERENCES staff_insurance_policy(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES insurance_categories(id) ON DELETE CASCADE,
      claim_type VARCHAR(20) NOT NULL CHECK (claim_type IN ('inpatient','outpatient')),
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      hospital_name TEXT,
      claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
      notes TEXT,
      logged_by TEXT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS insurance_claims_policy_idx ON insurance_claims(staff_insurance_policy_id);
    CREATE INDEX IF NOT EXISTS insurance_claims_category_idx ON insurance_claims(category_id);
    CREATE INDEX IF NOT EXISTS insurance_claims_date_idx ON insurance_claims(claim_date);

    CREATE TABLE IF NOT EXISTS insurance_transfers (
      id SERIAL PRIMARY KEY,
      staff_insurance_policy_id INTEGER NOT NULL REFERENCES staff_insurance_policy(id) ON DELETE CASCADE,
      from_category_id INTEGER NOT NULL REFERENCES insurance_categories(id) ON DELETE CASCADE,
      to_category_id INTEGER NOT NULL REFERENCES insurance_categories(id) ON DELETE CASCADE,
      transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('inpatient','outpatient')),
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      reason TEXT,
      initiated_by TEXT,
      initiated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      flow_type VARCHAR(20) NOT NULL CHECK (flow_type IN ('staff_confirm','hr_override')),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','acknowledged','reversed')),
      staff_responded_at TIMESTAMPTZ,
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS insurance_transfers_policy_idx ON insurance_transfers(staff_insurance_policy_id);
    CREATE INDEX IF NOT EXISTS insurance_transfers_status_idx ON insurance_transfers(status);

    CREATE TABLE IF NOT EXISTS insurance_annual_reset_log (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
      reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
      policy_period_start DATE NOT NULL,
      policy_period_end DATE NOT NULL,
      reset_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS insurance_reset_log_staff_idx ON insurance_annual_reset_log(staff_id);
  `);
  tableReady = true;
}

function actorName(user) {
  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return name || user?.username || 'HR';
}

// ---------------------------------------------------------------------------
// Policy template
// ---------------------------------------------------------------------------

export async function getActiveTemplate(companyId) {
  await ensureInsuranceTables();
  const res = await pool.query(
    `SELECT * FROM insurance_policy_template WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [companyId || 'CW']
  );
  return res.rows[0] || null;
}

export async function getPolicyWithCategories(companyId) {
  const template = await getActiveTemplate(companyId);
  if (!template) return { template: null, categories: [] };
  const cats = await pool.query(
    `SELECT * FROM insurance_categories WHERE template_id = $1 AND is_active = true ORDER BY name ASC`,
    [template.id]
  );
  return { template, categories: cats.rows };
}

/** Creates the template on first save, updates it (name/description/dates) afterward — one
 *  company-wide template at a time, matching "HR creates ONE company-wide base policy
 *  template." Categories are fully replaced with whatever list is submitted (add/edit/remove
 *  all handled by the same call — simplest correct semantics for a small, HR-curated list). */
export async function saveTemplate({ companyId, name, description, policyStartDate, policyEndDate, categories }, actingUser) {
  await ensureInsuranceTables();
  const existing = await getActiveTemplate(companyId);
  let template;
  if (existing) {
    const res = await pool.query(
      `UPDATE insurance_policy_template
       SET name = $1, description = $2, policy_start_date = $3, policy_end_date = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name, description || null, policyStartDate, policyEndDate, existing.id]
    );
    template = res.rows[0];
  } else {
    const res = await pool.query(
      `INSERT INTO insurance_policy_template (company_id, name, description, policy_start_date, policy_end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [companyId || 'CW', name, description || null, policyStartDate, policyEndDate, actingUser?.id || null]
    );
    template = res.rows[0];
  }

  const keepIds = [];
  for (const cat of categories || []) {
    if (cat.id) {
      const res = await pool.query(
        `UPDATE insurance_categories SET name = $1, outpatient_limit = $2, inpatient_limit = $3, updated_at = NOW()
         WHERE id = $4 AND template_id = $5 RETURNING id`,
        [cat.name, cat.outpatientLimit || 0, cat.inpatientLimit || 0, cat.id, template.id]
      );
      if (res.rows[0]) keepIds.push(res.rows[0].id);
    } else {
      const res = await pool.query(
        `INSERT INTO insurance_categories (template_id, name, outpatient_limit, inpatient_limit)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [template.id, cat.name, cat.outpatientLimit || 0, cat.inpatientLimit || 0]
      );
      keepIds.push(res.rows[0].id);
    }
  }
  // Categories removed from the submitted list are deactivated, never hard-deleted — a hard
  // delete would cascade and wipe every historical claim/transfer logged against it. Deactivated
  // categories drop out of new claims/transfers/limit totals but stay fully intact for history.
  await pool.query(
    `UPDATE insurance_categories SET is_active = false, updated_at = NOW()
     WHERE template_id = $1 AND is_active = true AND NOT (id = ANY($2::int[]))`,
    [template.id, keepIds]
  );

  return getPolicyWithCategories(companyId);
}

// ---------------------------------------------------------------------------
// Per-staff policy — lazy provisioning
// ---------------------------------------------------------------------------

export async function getOrCreateStaffPolicy(employeeId, companyId) {
  await ensureInsuranceTables();
  const template = await getActiveTemplate(companyId);
  if (!template) return null;

  const existing = await pool.query(
    `SELECT * FROM staff_insurance_policy WHERE staff_id = $1 AND template_id = $2`,
    [employeeId, template.id]
  );
  if (existing.rows[0]) return { policy: existing.rows[0], template };

  const inserted = await pool.query(
    `INSERT INTO staff_insurance_policy (staff_id, template_id, policy_start_date, policy_end_date)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (staff_id, template_id) DO UPDATE SET updated_at = staff_insurance_policy.updated_at
     RETURNING *`,
    [employeeId, template.id, template.policy_start_date, template.policy_end_date]
  );
  return { policy: inserted.rows[0], template };
}

// ---------------------------------------------------------------------------
// Balance resolution
// ---------------------------------------------------------------------------

async function resolveCategoriesWithLimits(policy, template) {
  const [catsRes, overridesRes] = await Promise.all([
    pool.query(`SELECT * FROM insurance_categories WHERE template_id = $1 AND is_active = true ORDER BY name ASC`, [template.id]),
    pool.query(`SELECT * FROM staff_insurance_category_override WHERE staff_insurance_policy_id = $1`, [policy.id]),
  ]);
  const overrideByCategory = new Map(overridesRes.rows.map((o) => [o.category_id, o]));

  return catsRes.rows.map((cat) => {
    const override = overrideByCategory.get(cat.id) || null;
    return {
      id: cat.id,
      name: cat.name,
      isOverride: !!override,
      overrideReason: override?.override_reason || null,
      baseOutpatientLimit: Number(cat.outpatient_limit),
      baseInpatientLimit: Number(cat.inpatient_limit),
      outpatientLimit: Number(override?.outpatient_limit ?? cat.outpatient_limit),
      inpatientLimit: Number(override?.inpatient_limit ?? cat.inpatient_limit),
    };
  });
}

async function usageByCategory(policyId, periodStart, periodEnd) {
  const res = await pool.query(
    `SELECT category_id, claim_type, COALESCE(SUM(amount),0)::numeric AS total
     FROM insurance_claims
     WHERE staff_insurance_policy_id = $1 AND claim_date BETWEEN $2 AND $3
     GROUP BY category_id, claim_type`,
    [policyId, periodStart, periodEnd]
  );
  const map = new Map();
  for (const row of res.rows) {
    map.set(`${row.category_id}:${row.claim_type}`, Number(row.total));
  }
  return map;
}

/** Net limit adjustment per category+type from transfers that actually took effect
 *  (approved Flow 1, or any hr_override Flow 2 — those apply immediately) within the
 *  current period only. A rejected/pending/reversed transfer has zero effect. */
async function transferAdjustments(policyId, periodStart, periodEnd) {
  const res = await pool.query(
    `SELECT from_category_id, to_category_id, transfer_type, amount, status
     FROM insurance_transfers
     WHERE staff_insurance_policy_id = $1
       AND initiated_at::date BETWEEN $2 AND $3
       AND ((flow_type = 'staff_confirm' AND status = 'approved') OR (flow_type = 'hr_override' AND status IN ('acknowledged','pending')))`,
    [policyId, periodStart, periodEnd]
  );
  const map = new Map();
  const add = (key, delta) => map.set(key, (map.get(key) || 0) + delta);
  for (const row of res.rows) {
    const amt = Number(row.amount);
    add(`${row.from_category_id}:${row.transfer_type}`, -amt);
    add(`${row.to_category_id}:${row.transfer_type}`, amt);
  }
  return map;
}

export async function buildInsuranceProfile(employeeId, companyId) {
  await ensureInsuranceTables();
  const provisioned = await getOrCreateStaffPolicy(employeeId, companyId);
  if (!provisioned) return null;
  const { policy, template } = provisioned;

  const [categories, usage, adjustments, claimsRes, transfersRes] = await Promise.all([
    resolveCategoriesWithLimits(policy, template),
    usageByCategory(policy.id, policy.policy_start_date, policy.policy_end_date),
    transferAdjustments(policy.id, policy.policy_start_date, policy.policy_end_date),
    pool.query(
      `SELECT c.*, cat.name AS category_name
       FROM insurance_claims c JOIN insurance_categories cat ON cat.id = c.category_id
       WHERE c.staff_insurance_policy_id = $1 ORDER BY c.claim_date DESC, c.logged_at DESC`,
      [policy.id]
    ),
    pool.query(
      `SELECT t.*, fc.name AS from_category_name, tc.name AS to_category_name
       FROM insurance_transfers t
       JOIN insurance_categories fc ON fc.id = t.from_category_id
       JOIN insurance_categories tc ON tc.id = t.to_category_id
       WHERE t.staff_insurance_policy_id = $1 ORDER BY t.initiated_at DESC`,
      [policy.id]
    ),
  ]);

  let totalLimit = 0;
  let totalUsed = 0;
  const categoryBreakdown = categories.map((cat) => {
    const outpatientAdj = adjustments.get(`${cat.id}:outpatient`) || 0;
    const inpatientAdj = adjustments.get(`${cat.id}:inpatient`) || 0;
    const outpatientLimit = cat.outpatientLimit + outpatientAdj;
    const inpatientLimit = cat.inpatientLimit + inpatientAdj;
    const outpatientUsed = usage.get(`${cat.id}:outpatient`) || 0;
    const inpatientUsed = usage.get(`${cat.id}:inpatient`) || 0;
    totalLimit += outpatientLimit + inpatientLimit;
    totalUsed += outpatientUsed + inpatientUsed;
    return {
      id: cat.id,
      name: cat.name,
      isOverride: cat.isOverride,
      overrideReason: cat.overrideReason,
      outpatient: { limit: outpatientLimit, used: outpatientUsed, remaining: outpatientLimit - outpatientUsed },
      inpatient: { limit: inpatientLimit, used: inpatientUsed, remaining: inpatientLimit - inpatientUsed },
    };
  });

  return {
    policy: {
      id: policy.id,
      startDate: policy.policy_start_date,
      endDate: policy.policy_end_date,
      isActive: policy.is_active,
    },
    template: { id: template.id, name: template.name, description: template.description },
    categories: categoryBreakdown,
    totals: { limit: totalLimit, used: totalUsed, remaining: totalLimit - totalUsed },
    claims: claimsRes.rows.map((c) => ({
      id: c.id, categoryId: c.category_id, categoryName: c.category_name, claimType: c.claim_type,
      amount: Number(c.amount), hospitalName: c.hospital_name, claimDate: c.claim_date,
      notes: c.notes, loggedBy: c.logged_by, loggedAt: c.logged_at,
    })),
    transfers: transfersRes.rows.map((t) => ({
      id: t.id, fromCategoryId: t.from_category_id, fromCategoryName: t.from_category_name,
      toCategoryId: t.to_category_id, toCategoryName: t.to_category_name, transferType: t.transfer_type,
      amount: Number(t.amount), reason: t.reason, initiatedBy: t.initiated_by, initiatedAt: t.initiated_at,
      flowType: t.flow_type, status: t.status, staffRespondedAt: t.staff_responded_at, notes: t.notes,
    })),
    pendingForStaff: transfersRes.rows
      .filter((t) =>
        t.flow_type === 'staff_confirm' ? t.status === 'pending' : !t.staff_responded_at
      )
      .map((t) => ({
        id: t.id, fromCategoryName: t.from_category_name, toCategoryName: t.to_category_name,
        transferType: t.transfer_type, amount: Number(t.amount), reason: t.reason,
        flowType: t.flow_type, initiatedBy: t.initiated_by, initiatedAt: t.initiated_at,
      })),
  };
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

export async function setCategoryOverride(employeeId, companyId, { categoryId, outpatientLimit, inpatientLimit, reason }, actingUser) {
  const { policy } = await getOrCreateStaffPolicy(employeeId, companyId);
  const res = await pool.query(
    `INSERT INTO staff_insurance_category_override
       (staff_insurance_policy_id, category_id, outpatient_limit, inpatient_limit, override_reason, overridden_by)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (staff_insurance_policy_id, category_id)
     DO UPDATE SET outpatient_limit = $3, inpatient_limit = $4, override_reason = $5, overridden_by = $6, overridden_at = NOW()
     RETURNING *`,
    [policy.id, categoryId, outpatientLimit ?? null, inpatientLimit ?? null, reason || null, actorName(actingUser)]
  );
  return res.rows[0];
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export async function logClaim(employeeId, companyId, { categoryId, claimType, amount, hospitalName, claimDate, notes }, actingUser, { force } = {}) {
  if (!CLAIM_TYPES.includes(claimType)) throw new Error('claimType must be inpatient or outpatient');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount must be a positive number');

  const profile = await buildInsuranceProfile(employeeId, companyId);
  if (!profile) throw new Error('No active insurance policy for this company');
  const category = profile.categories.find((c) => c.id === Number(categoryId));
  if (!category) throw new Error('Category not found on the active policy');
  const bucket = category[claimType];
  const remaining = bucket.remaining;

  if (amt > remaining && !force) {
    return { exceeds: true, remaining, categoryName: category.name };
  }

  const { policy } = await getOrCreateStaffPolicy(employeeId, companyId);
  const res = await pool.query(
    `INSERT INTO insurance_claims (staff_insurance_policy_id, category_id, claim_type, amount, hospital_name, claim_date, notes, logged_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [policy.id, categoryId, claimType, amt, hospitalName || null, claimDate || new Date().toISOString().slice(0, 10), notes || null, actorName(actingUser)]
  );
  return { exceeds: false, claim: res.rows[0], newRemaining: remaining - amt };
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export async function initiateTransfer(employeeId, companyId, { fromCategoryId, toCategoryId, transferType, amount, reason, immediate }, actingUser) {
  if (String(fromCategoryId) === String(toCategoryId)) throw new Error('Cannot transfer a category into itself');
  if (!CLAIM_TYPES.includes(transferType)) throw new Error('transferType must be inpatient or outpatient');
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('amount must be a positive number');

  // Hard block — unlike a claim (a real medical expense that may need recording even over
  // limit), a transfer just moves existing balance around, so it can never move more than the
  // source category actually has left. No override option, unlike logClaim's force flag.
  const profile = await buildInsuranceProfile(employeeId, companyId);
  if (!profile) throw new Error('No active insurance policy for this company');
  const fromCategory = profile.categories.find((c) => c.id === Number(fromCategoryId));
  if (!fromCategory) throw new Error('Source category not found on the active policy');
  const remaining = fromCategory[transferType].remaining;
  if (amt > remaining) {
    throw new Error(
      `Insufficient balance: ${fromCategory.name} only has GHS ${remaining.toFixed(2)} remaining (${transferType})`
    );
  }

  const { policy } = await getOrCreateStaffPolicy(employeeId, companyId);
  const flowType = immediate ? 'hr_override' : 'staff_confirm';
  const status = immediate ? 'acknowledged' : 'pending';
  // Flow 2 applies immediately (status starts 'acknowledged' so resolveEffectiveLimits counts
  // it right away) but the staff member still needs to tap "Got it" — that's tracked via
  // staff_responded_at staying null, not via status, since status already reflects the balance
  // having moved.
  const res = await pool.query(
    `INSERT INTO insurance_transfers
       (staff_insurance_policy_id, from_category_id, to_category_id, transfer_type, amount, reason, initiated_by, flow_type, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [policy.id, fromCategoryId, toCategoryId, transferType, amt, reason || null, actorName(actingUser), flowType, status]
  );
  return res.rows[0];
}

export async function respondToTransfer(transferId, employeeId, action, actingUser, reason) {
  const found = await pool.query(
    `SELECT t.*, p.staff_id FROM insurance_transfers t
     JOIN staff_insurance_policy p ON p.id = t.staff_insurance_policy_id
     WHERE t.id = $1`,
    [transferId]
  );
  const transfer = found.rows[0];
  if (!transfer) throw new Error('Transfer not found');
  if (Number(transfer.staff_id) !== Number(employeeId)) throw new Error('This transfer does not belong to you');

  if (transfer.flow_type === 'staff_confirm') {
    if (transfer.status !== 'pending') throw new Error('This transfer has already been responded to');
    if (!['approve', 'reject'].includes(action)) throw new Error('action must be approve or reject');
    if (action === 'reject' && !String(reason || '').trim()) throw new Error('A reason is required to decline a transfer');
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const res = await pool.query(
      `UPDATE insurance_transfers SET status = $1, staff_responded_at = NOW(), notes = COALESCE($3, notes) WHERE id = $2 RETURNING *`,
      [newStatus, transferId, action === 'reject' ? String(reason).trim() : null]
    );
    return res.rows[0];
  }

  // hr_override — acknowledge only, no reject/reverse from the staff side
  if (action !== 'acknowledge') throw new Error('This transfer can only be acknowledged');
  if (transfer.staff_responded_at) throw new Error('Already acknowledged');
  const res = await pool.query(
    `UPDATE insurance_transfers SET staff_responded_at = NOW() WHERE id = $1 RETURNING *`,
    [transferId]
  );
  return res.rows[0];
}

export async function reverseTransfer(transferId, actingUser) {
  const res = await pool.query(
    `UPDATE insurance_transfers SET status = 'reversed' WHERE id = $1 AND flow_type = 'hr_override' RETURNING *`,
    [transferId]
  );
  if (!res.rows[0]) throw new Error('Transfer not found or not reversible');
  return res.rows[0];
}

// ---------------------------------------------------------------------------
// Annual reset
// ---------------------------------------------------------------------------

function addOneYear(dateStr) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export async function triggerAnnualReset(templateId, { newStartDate, newEndDate } = {}, resetBy) {
  const templateRes = await pool.query(`SELECT * FROM insurance_policy_template WHERE id = $1`, [templateId]);
  const template = templateRes.rows[0];
  if (!template) throw new Error('Policy template not found');

  const start = newStartDate || addOneYear(template.policy_start_date);
  const end = newEndDate || addOneYear(template.policy_end_date);

  await pool.query(
    `UPDATE insurance_policy_template SET policy_start_date = $1, policy_end_date = $2, updated_at = NOW() WHERE id = $3`,
    [start, end, templateId]
  );

  const policies = await pool.query(
    `SELECT sp.*, e.user_id FROM staff_insurance_policy sp
     JOIN hr_employees e ON e.id = sp.staff_id
     WHERE sp.template_id = $1 AND sp.is_active = true`,
    [templateId]
  );

  const resetByName = resetBy || 'System';
  for (const policy of policies.rows) {
    await pool.query(
      `INSERT INTO insurance_annual_reset_log (staff_id, policy_period_start, policy_period_end, reset_by)
       VALUES ($1,$2,$3,$4)`,
      [policy.staff_id, start, end, resetByName]
    ).catch((e) => console.warn('[insurance] reset log insert failed:', e.message));

    await pool.query(
      `UPDATE staff_insurance_policy SET policy_start_date = $1, policy_end_date = $2, updated_at = NOW() WHERE id = $3`,
      [start, end, policy.id]
    ).catch((e) => console.warn('[insurance] policy period update failed:', e.message));

    if (policy.user_id) {
      const periodLabel = `${new Date(start).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} — ${new Date(end).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
      await createNotification(
        'Medical Insurance Renewed',
        `Your medical insurance has been renewed for ${periodLabel}.`,
        null, policy.user_id, '/hr-self/insurance', 'insurance_reset'
      ).catch(() => {});
      await sendPushToUserIds([policy.user_id], {
        title: 'Medical Insurance Renewed',
        body: `Your medical insurance has been renewed for ${periodLabel}.`,
        data: { url: '/hr-self/insurance', type: 'insurance_reset' },
      }).catch(() => {});
    }
  }

  return { template: { ...template, policy_start_date: start, policy_end_date: end }, staffCount: policies.rows.length };
}

/** Daily sweep — anything past its end date gets rolled forward automatically. Wrapped so a
 *  failure here never takes down the server process that scheduled it. */
export async function runAnnualResetSweep() {
  try {
    await ensureInsuranceTables();
    const due = await pool.query(
      `SELECT DISTINCT template_id FROM staff_insurance_policy WHERE policy_end_date < CURRENT_DATE AND is_active = true`
    );
    for (const row of due.rows) {
      await triggerAnnualReset(row.template_id, {}, 'System (automatic)').catch((e) =>
        console.warn('[insurance] automatic reset failed for template', row.template_id, e.message)
      );
    }
    if (due.rows.length) console.log(`[insurance] automatic annual reset ran for ${due.rows.length} template(s)`);
  } catch (e) {
    console.warn('[insurance] reset sweep failed:', e.message);
  }
}

export async function getResetHistory(companyId) {
  const template = await getActiveTemplate(companyId);
  if (!template) return [];
  const res = await pool.query(
    `SELECT l.*, e.full_name FROM insurance_annual_reset_log l
     JOIN hr_employees e ON e.id = l.staff_id
     JOIN staff_insurance_policy sp ON sp.staff_id = l.staff_id AND sp.template_id = $1
     ORDER BY l.created_at DESC LIMIT 200`,
    [template.id]
  );
  return res.rows;
}

// ---------------------------------------------------------------------------
// HR dashboard overview
// ---------------------------------------------------------------------------

export async function getOverview(companyId) {
  const template = await getActiveTemplate(companyId);
  if (!template) return null;

  const [totalSpend, byCategory, lowBalance, pendingCount] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(c.amount),0)::numeric AS total, COUNT(*)::int AS count
       FROM insurance_claims c JOIN staff_insurance_policy sp ON sp.id = c.staff_insurance_policy_id
       WHERE sp.template_id = $1 AND c.claim_date BETWEEN sp.policy_start_date AND sp.policy_end_date`,
      [template.id]
    ),
    pool.query(
      `SELECT cat.name, COALESCE(SUM(c.amount),0)::numeric AS total, COUNT(*)::int AS count
       FROM insurance_claims c
       JOIN insurance_categories cat ON cat.id = c.category_id
       JOIN staff_insurance_policy sp ON sp.id = c.staff_insurance_policy_id
       WHERE sp.template_id = $1 AND c.claim_date BETWEEN sp.policy_start_date AND sp.policy_end_date
       GROUP BY cat.name ORDER BY total DESC LIMIT 8`,
      [template.id]
    ),
    pool.query(
      `SELECT sp.staff_id, e.full_name,
              COALESCE(cat_limits.total_limit, 0) AS total_limit,
              COALESCE(used.total_used, 0) AS total_used
       FROM staff_insurance_policy sp
       JOIN hr_employees e ON e.id = sp.staff_id
       LEFT JOIN (
         SELECT template_id, SUM(outpatient_limit + inpatient_limit) AS total_limit
         FROM insurance_categories WHERE template_id = $1 AND is_active = true GROUP BY template_id
       ) cat_limits ON cat_limits.template_id = sp.template_id
       LEFT JOIN (
         SELECT c.staff_insurance_policy_id, SUM(c.amount) AS total_used
         FROM insurance_claims c
         JOIN staff_insurance_policy sp2 ON sp2.id = c.staff_insurance_policy_id
         WHERE c.claim_date BETWEEN sp2.policy_start_date AND sp2.policy_end_date
         GROUP BY c.staff_insurance_policy_id
       ) used ON used.staff_insurance_policy_id = sp.id
       WHERE sp.template_id = $1 AND sp.is_active = true
       ORDER BY (COALESCE(cat_limits.total_limit,0) - COALESCE(used.total_used,0)) ASC
       LIMIT 10`,
      [template.id]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM insurance_transfers t
       JOIN staff_insurance_policy sp ON sp.id = t.staff_insurance_policy_id
       WHERE sp.template_id = $1 AND t.status = 'pending'`,
      [template.id]
    ),
  ]);

  return {
    template: { id: template.id, name: template.name, periodStart: template.policy_start_date, periodEnd: template.policy_end_date },
    totalClaims: totalSpend.rows[0].count,
    totalSpend: Number(totalSpend.rows[0].total),
    topCategories: byCategory.rows.map((r) => ({ name: r.name, total: Number(r.total), count: r.count })),
    lowestBalance: lowBalance.rows.map((r) => ({
      staffId: r.staff_id, name: r.full_name,
      totalLimit: Number(r.total_limit), totalUsed: Number(r.total_used),
      remaining: Number(r.total_limit) - Number(r.total_used),
    })),
    pendingTransfers: pendingCount.rows[0].count,
  };
}

export async function getPendingTransfers(companyId) {
  const template = await getActiveTemplate(companyId);
  if (!template) return [];
  const res = await pool.query(
    `SELECT t.*, e.full_name, fc.name AS from_category_name, tc.name AS to_category_name
     FROM insurance_transfers t
     JOIN staff_insurance_policy sp ON sp.id = t.staff_insurance_policy_id
     JOIN hr_employees e ON e.id = sp.staff_id
     JOIN insurance_categories fc ON fc.id = t.from_category_id
     JOIN insurance_categories tc ON tc.id = t.to_category_id
     WHERE sp.template_id = $1 AND t.status = 'pending'
     ORDER BY t.initiated_at ASC`,
    [template.id]
  );
  return res.rows.map((t) => ({
    id: t.id, staffId: t.staff_id, staffName: t.full_name,
    fromCategoryName: t.from_category_name, toCategoryName: t.to_category_name,
    transferType: t.transfer_type, amount: Number(t.amount), reason: t.reason,
    flowType: t.flow_type, initiatedBy: t.initiated_by, initiatedAt: t.initiated_at,
  }));
}

// ---------------------------------------------------------------------------
// Notifications for staff-facing actions
// ---------------------------------------------------------------------------

async function notifyEmployee(employeeId, title, message, notificationType) {
  try {
    const res = await pool.query(`SELECT user_id FROM hr_employees WHERE id = $1`, [employeeId]);
    const userId = res.rows[0]?.user_id;
    if (!userId) return;
    await createNotification(title, message, null, userId, '/hr-self/insurance', notificationType).catch(() => {});
    await sendPushToUserIds([userId], { title, body: message, data: { url: '/hr-self/insurance', type: notificationType } }).catch(() => {});
  } catch (e) {
    console.warn('[insurance] notifyEmployee failed:', e.message);
  }
}

export async function notifyClaimLogged(employeeId, claim, remaining, categoryName) {
  await notifyEmployee(
    employeeId,
    'Medical Claim Logged',
    `A ${claim.claim_type} claim of GHS ${Number(claim.amount).toFixed(2)} was logged under ${categoryName}. Remaining balance: GHS ${Number(remaining).toFixed(2)}.`,
    'insurance_claim'
  );
}

export async function notifyTransferInitiated(employeeId, transfer, fromName, toName) {
  const isImmediate = transfer.flow_type === 'hr_override';
  const title = isImmediate ? 'Insurance Transfer Applied' : 'Insurance Transfer Needs Your Response';
  const verb = isImmediate ? 'has transferred' : 'has requested to transfer';
  const message = `HR ${verb} GHS ${Number(transfer.amount).toFixed(2)} from ${fromName} to ${toName}.${transfer.reason ? ` Reason: ${transfer.reason}` : ''}`;
  await notifyEmployee(employeeId, title, message, 'insurance_transfer');
}

export async function notifyTransferResolved(initiatedByUserId, approved, staffName, reason) {
  // initiatedByUserId is a users.id (the HR actor who created the transfer) — resolved by the route.
  if (!initiatedByUserId) return;
  const title = approved ? 'Transfer Approved' : 'Transfer Rejected';
  const message = approved
    ? `${staffName} approved the insurance transfer you requested.`
    : `${staffName} rejected the insurance transfer you requested.${reason ? ` Reason: ${reason}` : ''}`;
  await createNotification(title, message, null, initiatedByUserId, '/hr/insurance', 'insurance_transfer').catch(() => {});
}
