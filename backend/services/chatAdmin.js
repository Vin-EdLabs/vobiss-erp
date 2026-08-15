/**
 * Superadmin chat backup, restore, and wipe (Settings → Community Chat).
 */
import pool from '../db.js';
import { initChat } from './chatInit.js';

const DEVELOPER_CODE = process.env.DEVELOPER_CODE || 'DEVELOPER_WIPE_2025';
export const CHAT_BACKUP_VERSION = 1;

const CHAT_TABLES = [
  'chat_channels',
  'dm_conversations',
  'channel_members',
  'dm_participants',
  'chat_messages',
  'message_reactions',
  'chat_attachments',
  'message_mentions',
  'message_pins',
  'chat_bookmarks',
];

const TRUNCATE_ORDER = [
  'chat_bookmarks',
  'message_pins',
  'message_mentions',
  'message_reactions',
  'chat_attachments',
  'chat_messages',
  'channel_members',
  'dm_participants',
  'chat_channels',
  'dm_conversations',
];

const INSERT_ORDER = [
  'chat_channels',
  'dm_conversations',
  'channel_members',
  'dm_participants',
  'chat_messages',
  'message_reactions',
  'chat_attachments',
  'message_mentions',
  'message_pins',
  'chat_bookmarks',
];

const JSONB_COLUMNS = {
  chat_messages: ['meta'],
};

const columnCache = new Map();

function assertDeveloperCode(developerCode) {
  if (developerCode !== DEVELOPER_CODE) {
    throw new Error('Invalid developer code');
  }
}

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS tbl', [`public.${table}`]);
  return !!rows[0]?.tbl;
}

async function getTableColumns(client, table) {
  const key = table;
  if (columnCache.has(key)) return columnCache.get(key);
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const set = new Set(rows.map((r) => r.column_name));
  columnCache.set(key, set);
  return set;
}

async function unlinkRecordChannels(client) {
  await client.query('UPDATE tickets SET chat_channel_id = NULL WHERE chat_channel_id IS NOT NULL');
  await client.query('UPDATE requests SET chat_channel_id = NULL WHERE chat_channel_id IS NOT NULL');
  await client.query(
    'UPDATE project_requests SET chat_channel_id = NULL WHERE chat_channel_id IS NOT NULL'
  );
}

async function relinkRecordChannels(client) {
  const { rows } = await client.query(
    `SELECT id, record_type, record_id FROM chat_channels
     WHERE record_type IS NOT NULL AND record_id IS NOT NULL`
  );
  for (const ch of rows) {
    const channelId = ch.id;
    const recordId = ch.record_id;
    if (ch.record_type === 'ticket') {
      await client.query(
        `UPDATE tickets SET chat_channel_id = $1
         WHERE ticket_id = $2 OR id::text = $2`,
        [channelId, String(recordId)]
      );
    } else if (['material_request', 'cash_request', 'item_return'].includes(ch.record_type)) {
      await client.query('UPDATE requests SET chat_channel_id = $1 WHERE id = $2', [
        channelId,
        recordId,
      ]);
    } else if (ch.record_type === 'project_request') {
      await client.query('UPDATE project_requests SET chat_channel_id = $1 WHERE id = $2', [
        channelId,
        recordId,
      ]);
    }
  }
}

function normalizeBackupPayload(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Invalid backup payload');
  }
  if (backup.kind === 'vobiss_chat_backup' && backup.tables) {
    return backup.tables;
  }
  if (backup.tables && typeof backup.tables === 'object') {
    return backup.tables;
  }
  const hasChatTable = CHAT_TABLES.some((t) => Array.isArray(backup[t]));
  if (hasChatTable) return backup;
  throw new Error(
    'Invalid chat backup file. Use a JSON file downloaded from Settings → Community Chat → Backup.'
  );
}

function serializeValue(table, key, val) {
  const jsonbCols = JSONB_COLUMNS[table] || [];
  if (jsonbCols.includes(key)) {
    if (val === null || val === undefined) return null;
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }
  if (val === undefined) return null;
  return val;
}

async function insertRow(client, table, row, allowedColumns) {
  const keys = Object.keys(row).filter((k) => allowedColumns.has(k));
  if (!keys.length) return;

  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map((key) => serializeValue(table, key, row[key]));

  try {
    await client.query(
      `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
      values
    );
  } catch (e) {
    const hint = row.id ? ` (id: ${row.id})` : '';
    throw new Error(`Insert into ${table} failed${hint}: ${e.message}`);
  }
}

async function loadUserIds(client) {
  const { rows } = await client.query('SELECT id FROM users');
  return new Set(rows.map((r) => Number(r.id)));
}

function asUserId(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function insertTableRows(client, table, rows, ctx) {
  if (!rows?.length) return;
  if (!(await tableExists(client, table))) return;

  const allowedColumns = await getTableColumns(client, table);
  const userIds = ctx.userIds;

  if (table === 'chat_channels') {
    for (const row of rows) {
      const next = { ...row };
      const createdBy = asUserId(next.created_by);
      const vobiUser = asUserId(next.vobi_user_id);
      if (createdBy != null && !userIds.has(createdBy)) next.created_by = null;
      if (vobiUser != null && !userIds.has(vobiUser)) {
        if (String(next.channel_type || '') === 'vobi') {
          ctx.skippedChannelIds.add(next.id);
          continue;
        }
        next.vobi_user_id = null;
      }
      await insertRow(client, table, next, allowedColumns);
    }
    return;
  }

  if (table === 'channel_members') {
    for (const row of rows) {
      if (ctx.skippedChannelIds.has(row.channel_id)) continue;
      if (!userIds.has(asUserId(row.user_id))) continue;
      await insertRow(client, table, row, allowedColumns);
    }
    return;
  }

  if (table === 'dm_participants') {
    for (const row of rows) {
      if (!userIds.has(asUserId(row.user_id))) {
        ctx.skippedDmIds.add(row.dm_id);
        continue;
      }
      await insertRow(client, table, row, allowedColumns);
    }
    return;
  }

  if (table === 'chat_messages') {
    const filtered = rows.filter((row) => {
      if (row.channel_id && ctx.skippedChannelIds.has(row.channel_id)) return false;
      if (row.dm_id && ctx.skippedDmIds.has(row.dm_id)) return false;
      const sender = asUserId(row.sender_id);
      if (sender != null && !userIds.has(sender)) row.sender_id = null;
      return true;
    });
    await insertChatMessages(client, filtered, allowedColumns);
    return;
  }

  const requiredUserCols = {
    message_reactions: ['user_id'],
    message_mentions: ['user_id'],
    chat_bookmarks: ['user_id'],
    message_pins: ['pinned_by'],
  };
  const required = requiredUserCols[table];
  for (const row of rows) {
    if (row.channel_id && ctx.skippedChannelIds.has(row.channel_id)) continue;
    if (row.dm_id && ctx.skippedDmIds.has(row.dm_id)) continue;
    if (row.message_id && ctx.skippedMessageIds?.has(row.message_id)) continue;
    if (required && required.some((col) => !userIds.has(asUserId(row[col])))) continue;
    await insertRow(client, table, row, allowedColumns);
  }
}

async function insertChatMessages(client, rows, allowedColumns) {
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
  const linkUpdates = [];

  for (const row of sorted) {
    const replyTo = row.reply_to ?? null;
    const forwardedFrom = row.forwarded_from ?? null;
    if (replyTo || forwardedFrom) {
      linkUpdates.push({ id: row.id, reply_to: replyTo, forwarded_from: forwardedFrom });
    }
    const insertPayload = { ...row, reply_to: null, forwarded_from: null };
    await insertRow(client, 'chat_messages', insertPayload, allowedColumns);
  }

  for (const link of linkUpdates) {
    await client.query(
      `UPDATE chat_messages
       SET reply_to = $2, forwarded_from = $3
       WHERE id = $1`,
      [link.id, link.reply_to, link.forwarded_from]
    );
  }
}

export async function backupChatData(developerCode) {
  assertDeveloperCode(developerCode);
  const tables = {};
  for (const table of CHAT_TABLES) {
    const exists = await tableExists(pool, table);
    if (!exists) {
      tables[table] = [];
      continue;
    }
    const orderClause =
      table === 'chat_messages' ? ' ORDER BY created_at ASC' : '';
    const { rows } = await pool.query(`SELECT * FROM ${table}${orderClause}`);
    tables[table] = rows;
  }
  return {
    version: CHAT_BACKUP_VERSION,
    kind: 'vobiss_chat_backup',
    exported_at: new Date().toISOString(),
    tables,
  };
}

export async function clearAllChatData(developerCode) {
  assertDeveloperCode(developerCode);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await unlinkRecordChannels(client);
    for (const table of TRUNCATE_ORDER) {
      if (await tableExists(client, table)) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      }
    }
    await client.query('COMMIT');
    columnCache.clear();
    await initChat();
    return {
      message: 'All chat data cleared. System channels (#general, #announcements, category hubs) were recreated.',
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function restoreChatData(backup, developerCode) {
  assertDeveloperCode(developerCode);

  const tables = normalizeBackupPayload(
    typeof backup === 'string' ? JSON.parse(backup) : backup
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await unlinkRecordChannels(client);
    for (const table of TRUNCATE_ORDER) {
      if (await tableExists(client, table)) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      }
    }

    const ctx = {
      userIds: await loadUserIds(client),
      skippedChannelIds: new Set(),
      skippedDmIds: new Set(),
    };

    for (const table of INSERT_ORDER) {
      await insertTableRows(client, table, tables[table], ctx);
    }

    await relinkRecordChannels(client);
    await client.query('COMMIT');
    columnCache.clear();
    await initChat();

    const messageCount = tables.chat_messages?.length ?? 0;
    const channelCount = tables.chat_channels?.length ?? 0;
    return {
      message: `Chat restored: ${messageCount} message(s), ${channelCount} channel(s).`,
      messageCount,
      channelCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
