/**
 * Vobiss Community Chat — startup initialization.
 * Ensures #general and #announcements exist; all users are members of both.
 * Legacy auto department channels are archived (hidden).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { CATEGORY_CHANNELS } from './chatCategories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM_CHANNELS = [
  {
    name: 'general',
    description: 'Company-wide channel — everyone in Vobiss can see and post here',
    channel_type: 'general',
  },
  {
    name: 'announcements',
    description: 'Official announcements — admins only can post',
    channel_type: 'announcements',
  },
];

const ANNOUNCEMENT_ADMIN_ROLES = new Set(['superadmin', 'director', 'cto']);

export function slugifyUnit(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseRoles(user) {
  const roles = new Set();
  if (user.main_role) roles.add(String(user.main_role).toLowerCase());
  if (user.role) roles.add(String(user.role).toLowerCase());
  if (user.roles) {
    let raw = user.roles;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = raw.split(',').map((s) => s.trim());
      }
    }
    if (Array.isArray(raw)) {
      for (const r of raw) {
        if (r) roles.add(String(r).toLowerCase());
      }
    }
  }
  return [...roles];
}

async function ensureChatTables() {
  const check = await pool.query("SELECT to_regclass('public.chat_channels') AS tbl");
  if (check.rows[0]?.tbl) return;

  const sqlPath = path.join(__dirname, '../migrations/chat_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('[chat] Created chat tables from migration');
}

async function ensureRecordIntegrationColumns() {
  const sqlPath = path.join(__dirname, '../migrations/chat_record_integration.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

async function ensureForwardColumn() {
  const sqlPath = path.join(__dirname, '../migrations/chat_forward.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

async function ensureBookmarksTable() {
  const sqlPath = path.join(__dirname, '../migrations/chat_bookmarks.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

async function ensureMessageDeletionTable() {
  const sqlPath = path.join(__dirname, '../migrations/chat_message_deletions.sql');
  if (!fs.existsSync(sqlPath)) return;
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}

async function ensurePinTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_pins (
      message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
      channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
      dm_id UUID REFERENCES dm_conversations(id) ON DELETE CASCADE,
      pinned_by INTEGER NOT NULL,
      pinned_at TIMESTAMP DEFAULT NOW(),
      CHECK (
        (channel_id IS NOT NULL AND dm_id IS NULL) OR
        (dm_id IS NOT NULL AND channel_id IS NULL)
      )
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_message_pins_channel
    ON message_pins(channel_id, pinned_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_message_pins_dm
    ON message_pins(dm_id, pinned_at DESC)
  `);
}

async function ensureChannel({ name, description, channel_type, unit_id = null, created_by = null }) {
  const existing = await pool.query(
    `SELECT id FROM chat_channels
     WHERE LOWER(name) = LOWER($1) AND COALESCE(is_archived, false) = false
     LIMIT 1`,
    [name]
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO chat_channels (name, description, channel_type, unit_id, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [name, description, channel_type, unit_id, created_by]
  );
  return inserted.rows[0].id;
}

async function ensureMember(channelId, userId, role = 'member') {
  await pool.query(
    `INSERT INTO channel_members (channel_id, user_id, role, last_read_at, joined_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (channel_id, user_id)
     DO UPDATE SET role = CASE
       WHEN EXCLUDED.role = 'admin' THEN 'admin'
       ELSE channel_members.role
     END`,
    [channelId, userId, role]
  );
}

/**
 * Initialize chat. Safe to call on every server boot.
 */
export async function initChat() {
  await ensureChatTables();
  await ensureRecordIntegrationColumns();
  await ensureForwardColumn();
  await ensureBookmarksTable();
  await ensureMessageDeletionTable();
  await ensurePinTable();

  // Hide legacy auto-created department channels
  await pool.query(
    `UPDATE chat_channels SET is_archived = true
     WHERE channel_type = 'department' AND COALESCE(is_archived, false) = false`
  );

  const channelIds = {};
  for (const ch of SYSTEM_CHANNELS) {
    channelIds[ch.name] = await ensureChannel(ch);
  }
  await pool.query(
    `UPDATE chat_channels
     SET description = $1
     WHERE LOWER(name) = 'general' AND COALESCE(is_archived, false) = false`,
    [SYSTEM_CHANNELS[0].description]
  );

  for (const cat of CATEGORY_CHANNELS) {
    channelIds[cat.name] = await ensureChannel({
      name: cat.name,
      description: cat.description,
      channel_type: cat.channel_type,
    });
  }

  const { rows: users } = await pool.query(`
    SELECT id, role, main_role, roles
    FROM users
    WHERE deleted_at IS NULL
  `);

  for (const user of users) {
    await ensureMember(channelIds.general, user.id);
    await ensureMember(channelIds.announcements, user.id);
    for (const cat of CATEGORY_CHANNELS) {
      if (channelIds[cat.name]) await ensureMember(channelIds[cat.name], user.id);
    }

    const roles = parseRoles(user);
    if (roles.some((r) => ANNOUNCEMENT_ADMIN_ROLES.has(r))) {
      await ensureMember(channelIds.announcements, user.id, 'admin');
    }
  }

  let ticketThreads = 0;
  let directorThreads = 0;
  try {
    const {
      syncAllTicketThreadOversightAccess,
      syncAllCategoryThreadDirectorAccess,
    } = await import('./chatRecordThreads.js');
    ticketThreads = await syncAllTicketThreadOversightAccess();
    directorThreads = await syncAllCategoryThreadDirectorAccess();
  } catch (e) {
    console.warn('[chat] director thread access sync failed:', e.message);
  }

  console.log(
    `[chat] Synced #general, #announcements, and ${CATEGORY_CHANNELS.length} category hubs for ${users.length} user(s)` +
      (ticketThreads ? `; ${ticketThreads} ticket thread(s) include director/executive access` : '') +
      (directorThreads ? `; ${directorThreads} category thread(s) include director access` : '')
  );

  return channelIds;
}

export async function ensureUserChatMembership(userId, roles = []) {
  const general = await getChannelByName('general');
  const announcements = await getChannelByName('announcements');
  if (general) await ensureMember(general.id, userId);
  if (announcements) {
    const roleList = Array.isArray(roles) ? roles.map((r) => String(r).toLowerCase()) : [];
    const isAdmin = roleList.some((r) => ANNOUNCEMENT_ADMIN_ROLES.has(r));
    await ensureMember(announcements.id, userId, isAdmin ? 'admin' : 'member');
  }
  for (const cat of CATEGORY_CHANNELS) {
    const ch = await getChannelByName(cat.name);
    if (ch) await ensureMember(ch.id, userId);
  }
  const roleList = Array.isArray(roles) ? roles.map((r) => String(r).toLowerCase()) : [];
  const needsTicketThreads = roleList.some((r) =>
    ['director', 'cto', 'superadmin', 'relationship_officer', 'noc_manager', 'cx', 'noc'].includes(r)
  );
  if (needsTicketThreads) {
    const { rows } = await pool.query(
      `SELECT id FROM chat_channels
       WHERE record_type = 'ticket' AND COALESCE(is_archived, false) = false`
    );
    for (const ch of rows) {
      await ensureMember(ch.id, userId);
    }
  }
}

export async function getChannelByName(name) {
  const { rows } = await pool.query(
    `SELECT id, name, channel_type, unit_id
     FROM chat_channels
     WHERE LOWER(name) = LOWER($1) AND COALESCE(is_archived, false) = false
     LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

export async function getChannelForUnit(unitSlugOrLabel) {
  return getChannelByName(slugifyUnit(unitSlugOrLabel));
}
