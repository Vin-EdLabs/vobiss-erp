/**
 * Vobi Chat Vault — System Admin only.
 * Access key set on first open; all subsequent views require the key.
 */
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const VAULT_TOKEN_TTL = '8h';
const MIN_KEY_LEN = 8;

let schemaReady = false;

export async function ensureVobiVaultSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vobi_vault_config (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      access_key_hash TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      last_unlocked_at TIMESTAMPTZ,
      last_unlocked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  schemaReady = true;
}

export async function getVaultStatus() {
  await ensureVobiVaultSchema();
  const { rows } = await pool.query(
    `SELECT created_at, updated_at, last_unlocked_at,
            (access_key_hash IS NOT NULL AND LENGTH(TRIM(access_key_hash)) > 0) AS configured
       FROM vobi_vault_config WHERE id = 1`
  );
  if (!rows[0]) {
    return { configured: false, created_at: null, updated_at: null, last_unlocked_at: null };
  }
  return {
    configured: Boolean(rows[0].configured),
    created_at: rows[0].created_at,
    updated_at: rows[0].updated_at,
    last_unlocked_at: rows[0].last_unlocked_at,
  };
}

export async function setupVaultAccessKey(accessKey, userId) {
  await ensureVobiVaultSchema();
  const key = String(accessKey || '');
  if (key.length < MIN_KEY_LEN) {
    const err = new Error(`Access key must be at least ${MIN_KEY_LEN} characters.`);
    err.status = 400;
    throw err;
  }
  const status = await getVaultStatus();
  if (status.configured) {
    const err = new Error('Vault access key is already set. Unlock with the existing key.');
    err.status = 409;
    throw err;
  }
  const hash = await bcrypt.hash(key, 12);
  await pool.query(
    `INSERT INTO vobi_vault_config (id, access_key_hash, created_by, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE
       SET access_key_hash = EXCLUDED.access_key_hash,
           created_by = EXCLUDED.created_by,
           updated_at = NOW()
     WHERE vobi_vault_config.access_key_hash IS NULL
        OR LENGTH(TRIM(vobi_vault_config.access_key_hash)) = 0`,
    [hash, userId]
  );
  // Re-check — if another process set it, conflict
  const after = await getVaultStatus();
  if (!after.configured) {
    const err = new Error('Failed to save vault access key.');
    err.status = 500;
    throw err;
  }
  return signVaultToken(userId);
}

export async function unlockVault(accessKey, userId) {
  await ensureVobiVaultSchema();
  const { rows } = await pool.query(`SELECT access_key_hash FROM vobi_vault_config WHERE id = 1`);
  if (!rows[0]?.access_key_hash) {
    const err = new Error('Vault is not configured yet. Set an access key first.');
    err.status = 400;
    throw err;
  }
  const ok = await bcrypt.compare(String(accessKey || ''), rows[0].access_key_hash);
  if (!ok) {
    const err = new Error('Invalid vault access key.');
    err.status = 403;
    throw err;
  }
  await pool.query(
    `UPDATE vobi_vault_config
        SET last_unlocked_at = NOW(), last_unlocked_by = $1, updated_at = NOW()
      WHERE id = 1`,
    [userId]
  );
  return signVaultToken(userId);
}

function signVaultToken(userId) {
  const token = jwt.sign(
    { purpose: 'vobi_vault', uid: Number(userId) },
    JWT_SECRET,
    { expiresIn: VAULT_TOKEN_TTL }
  );
  return { token, expiresIn: VAULT_TOKEN_TTL };
}

export function verifyVaultToken(token, userId) {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'vobi_vault') return false;
    if (Number(decoded.uid) !== Number(userId)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function listVaultThreads({ search = '', limit = 100, offset = 0 } = {}) {
  await ensureVobiVaultSchema();
  const q = String(search || '').trim();
  const params = [];
  let whereExtra = '';
  if (q) {
    params.push(`%${q}%`);
    whereExtra = ` AND (
      u.username ILIKE $${params.length}
      OR u.first_name ILIKE $${params.length}
      OR u.last_name ILIKE $${params.length}
      OR COALESCE(u.email,'') ILIKE $${params.length}
      OR (COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) ILIKE $${params.length}
    )`;
  }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  const lim = params.length;
  params.push(Math.max(Number(offset) || 0, 0));
  const off = params.length;

  const { rows } = await pool.query(
    `SELECT c.id AS channel_id,
            c.vobi_user_id AS user_id,
            u.username,
            u.first_name,
            u.last_name,
            u.email,
            u.role,
            u.main_role,
            u.position,
            TRIM(BOTH FROM COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username)) AS display_name,
            (SELECT COUNT(*)::int FROM chat_messages m WHERE m.channel_id = c.id) AS message_count,
            (SELECT COUNT(*)::int FROM chat_messages m WHERE m.channel_id = c.id AND m.message_type = 'vobi') AS vobi_replies,
            (SELECT COUNT(*)::int FROM chat_messages m WHERE m.channel_id = c.id AND m.sender_id IS NOT NULL) AS user_messages,
            (SELECT MAX(m.created_at) FROM chat_messages m WHERE m.channel_id = c.id) AS last_message_at,
            (SELECT LEFT(m.body, 160) FROM chat_messages m WHERE m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_preview,
            c.created_at AS thread_created_at
       FROM chat_channels c
       JOIN users u ON u.id = c.vobi_user_id
      WHERE c.channel_type = 'vobi'
        ${whereExtra}
      ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT $${lim} OFFSET $${off}`,
    params
  );

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM chat_channels c
       JOIN users u ON u.id = c.vobi_user_id
      WHERE c.channel_type = 'vobi' ${whereExtra}`,
    q ? [`%${q}%`] : []
  );

  return {
    total: countRes.rows[0]?.c || 0,
    threads: rows,
  };
}

export async function getVaultThreadMessages(userId, { limit = 500, before = null } = {}) {
  await ensureVobiVaultSchema();
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) {
    const err = new Error('Invalid user id');
    err.status = 400;
    throw err;
  }

  const channel = await pool.query(
    `SELECT c.id, c.vobi_user_id, c.created_at,
            u.username, u.first_name, u.last_name, u.email, u.role, u.main_role, u.position
       FROM chat_channels c
       JOIN users u ON u.id = c.vobi_user_id
      WHERE c.channel_type = 'vobi' AND c.vobi_user_id = $1
      LIMIT 1`,
    [uid]
  );
  if (!channel.rows[0]) {
    const err = new Error('No Vobi thread found for this user.');
    err.status = 404;
    throw err;
  }

  const params = [channel.rows[0].id];
  let beforeClause = '';
  if (before) {
    params.push(before);
    beforeClause = ` AND m.created_at < $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 500, 1), 2000));

  const { rows } = await pool.query(
    `SELECT m.id, m.sender_id, m.body, m.message_type, m.meta, m.created_at,
            CASE
              WHEN m.message_type = 'vobi' OR m.sender_id IS NULL THEN 'assistant'
              ELSE 'user'
            END AS role
       FROM chat_messages m
      WHERE m.channel_id = $1
        ${beforeClause}
      ORDER BY m.created_at ASC
      LIMIT $${params.length}`,
    params
  );

  const u = channel.rows[0];
  return {
    thread: {
      channel_id: u.id,
      user_id: u.vobi_user_id,
      username: u.username,
      display_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
      email: u.email,
      role: u.main_role || u.role,
      position: u.position,
      created_at: u.created_at,
    },
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      message_type: m.message_type,
      meta: m.meta,
      created_at: m.created_at,
      sender_id: m.sender_id,
    })),
  };
}

export async function getVaultOverviewStats() {
  await ensureVobiVaultSchema();
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM chat_channels WHERE channel_type = 'vobi') AS threads,
      (SELECT COUNT(*)::int FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi') AS messages,
      (SELECT COUNT(*)::int FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi' AND m.message_type = 'vobi') AS vobi_replies,
      (SELECT COUNT(*)::int FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi' AND m.sender_id IS NOT NULL) AS user_messages,
      (SELECT MAX(m.created_at) FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
        WHERE c.channel_type = 'vobi') AS last_activity
  `);
  return rows[0] || { threads: 0, messages: 0, vobi_replies: 0, user_messages: 0, last_activity: null };
}
