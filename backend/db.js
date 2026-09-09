// src/db.js - FULLY FIXED & COMPLETE VERSION (December 27, 2025)
// Permanent fix for "cannot insert a non-DEFAULT value into column \"line_total\""
// All functions included - NO PLACEHOLDERS, NO COMMENTS ABOUT "rest unchanged"

import { Pool } from 'pg';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { formatPersonName } from './utils/displayName.js';
import { initTicketingDB } from './db.ticketing.cjs';
import { DEFAULT_TICKET_ESCALATION, normalizeTicketEscalationConfig } from './ticketEscalationConfig.js';
import { DEFAULT_TICKET_SLA, normalizeTicketSlaConfig } from './ticketSlaConfig.js';
import {
  SYSTEM_ROLES,
  migrateUserRoleConstraint,
  isValidSystemRole,
  normalizeSystemRole,
  invalidRoleMessage,
  defaultUnitsForRole,
  parseUserUnitsArray,
  effectiveUnitsForUser,
  capUserUnits,
  isSystemAdminAccount,
} from './roles.js';
import {
  canApproveCashRequest,
  canApproveMaterialRequest,
  canAccessGlobalDashboard,
  canBypassApprovalRestrictions,
  canExecuteMaterial,
  canReleaseCash,
  forbidden,
  setRealmApproverIds,
} from './permissions.js';

function touchVobiCache(userId) {
  import('./services/vobiCache.js')
    .then((mod) => mod.invalidateVobiData(userId))
    .catch(() => {});
}

const dbDir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(dbDir, '.env') });
if (process.env.NODE_ENV === 'production') {
  config({ path: path.join(dbDir, '.env.production'), override: true });
}

console.log('Environment variables:', {
  PG_HOST: process.env.PG_HOST,
  PG_PORT: process.env.PG_PORT,
  PG_DATABASE: process.env.PG_DATABASE,
  PG_USER: process.env.PG_USER,
  PG_PASSWORD: process.env.PG_PASSWORD ? '[REDACTED]' : 'undefined',
});

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: String(process.env.PG_PASSWORD || ''),
  // Default (10) was getting saturated under normal concurrent page loads — every page
  // fires several requests at once (notifications, workspace, dashboard widgets, etc.), and
  // background intervals (SLA sweep, ticket auto-escalation) compete for the same pool. This
  // was measured causing multi-second queuing delays on otherwise-fast, correctly-indexed
  // queries. Postgres here supports up to 100 connections (confirmed via SHOW max_connections)
  // with typically under 15 in use — raised again ahead of ~200 concurrent staff to leave
  // real headroom for burst concurrency (everyone loading a dashboard at once, Vobi chat spikes)
  // while still leaving ~40 connections free for Postgres overhead and any other process.
  max: 60,
  // Fail fast instead of hanging forever if the pool is genuinely exhausted — surfaces as a
  // clear 500 the client can retry, rather than a request that silently stalls for minutes.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

pool.on('connect', (client) => {
  client.query('SET datestyle = "ISO, YMD"').catch(err => console.error('Failed to set datestyle:', err.message));
});

const DEVELOPER_CODE = process.env.DEVELOPER_CODE || 'DEVELOPER_WIPE_2025';

function generatePassword() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function generateUniqueUsername(lastName) {
  let baseUsername = lastName.toLowerCase().trim().replace(/\s+/g, '');
  let username = baseUsername;
  let counter = 1;
  while (true) {
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rowCount === 0) {
      return username;
    }
    username = `${baseUsername}${counter}`;
    counter++;
  }
}

async function createTableIfNotExists(query, tableName) {
  try {
    await pool.query(query);
  } catch (error) {
    const code = error?.code;
    const message = error?.message;
    if (code === '42P07' || (message && message.includes('already exists'))) {
      // Table already exists - skip silently
    } else {
      console.error(`Error creating table "${tableName}":`, message);
      throw error;
    }
  }
}

async function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  const query = `
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = '${tableName}' AND column_name = '${columnName}'
        ) THEN
            ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};
        END IF;
    END $$;
  `;
  try {
    await pool.query(query);
  } catch (error) {
    console.warn(`Warning adding column "${columnName}" to "${tableName}":`, error.message);
  }
}

export async function backupDatabase(developerCode) {
  if (developerCode !== DEVELOPER_CODE) {
    throw new Error('Invalid developer code');
  }
  try {
    const listed = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const tables = {};
    const skipped = [];
    for (const { tablename } of listed.rows) {
      try {
        const result = await pool.query(`SELECT * FROM ${quoteIdent(tablename)}`);
        tables[tablename] = result.rows;
      } catch (err) {
        skipped.push({ table: tablename, error: err.message });
        tables[tablename] = [];
      }
    }
    console.log('Database backup completed successfully.');
    return {
      kind: 'vobiss_db_backup',
      version: 2,
      exported_at: new Date().toISOString(),
      tables,
      skipped,
    };
  } catch (error) {
    console.error('Error creating database backup:', error.stack);
    throw error;
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeDbBackup(backupData) {
  if (!backupData || typeof backupData !== 'object') {
    throw new Error('Invalid backup file');
  }
  if (backupData.kind === 'vobiss_db_backup' && backupData.tables && typeof backupData.tables === 'object') {
    return backupData.tables;
  }
  if (backupData.tables && typeof backupData.tables === 'object' && !Array.isArray(backupData.tables)) {
    return backupData.tables;
  }
  const skipMeta = new Set(['kind', 'version', 'exported_at', 'skipped', 'tables', 'message']);
  const tables = {};
  for (const [key, value] of Object.entries(backupData)) {
    if (skipMeta.has(key)) continue;
    if (Array.isArray(value)) tables[key] = value;
  }
  if (!Object.keys(tables).length) {
    throw new Error('Backup file has no table data');
  }
  return tables;
}

async function tableExists(client, table) {
  const { rows } = await client.query('SELECT to_regclass($1) AS tbl', [`public.${table}`]);
  return !!rows[0]?.tbl;
}

async function getInsertableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name, is_generated, identity_generation, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const allowed = new Set();
  const jsonCols = new Set();
  for (const col of rows) {
    if (col.is_generated === 'ALWAYS') continue;
    if (col.identity_generation === 'ALWAYS') continue;
    allowed.add(col.column_name);
    if (col.data_type === 'json' || col.data_type === 'jsonb' || col.udt_name === 'json' || col.udt_name === 'jsonb') {
      jsonCols.add(col.column_name);
    }
  }
  return { allowed, jsonCols };
}

function serializeRestoreValue(val, isJson) {
  if (val === undefined || val === null) return null;
  if (isJson) {
    if (typeof val === 'string') return val;
    return JSON.stringify(val);
  }
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

async function orderTablesForInsert(client, tableNames) {
  const nameSet = new Set(tableNames);
  const { rows } = await client.query(`
    SELECT
      tc.table_name AS child,
      ccu.table_name AS parent
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
  `);
  const deps = new Map(tableNames.map((t) => [t, new Set()]));
  for (const { child, parent } of rows) {
    if (!nameSet.has(child) || !nameSet.has(parent) || child === parent) continue;
    deps.get(child).add(parent);
  }
  const ordered = [];
  const ready = tableNames.filter((t) => deps.get(t).size === 0);
  const remaining = new Set(tableNames);
  while (ready.length) {
    const t = ready.shift();
    if (!remaining.has(t)) continue;
    remaining.delete(t);
    ordered.push(t);
    for (const [child, parents] of deps) {
      if (parents.delete(t) && parents.size === 0 && remaining.has(child)) {
        ready.push(child);
      }
    }
  }
  return [...ordered, ...remaining];
}

export async function restoreDatabase(backupData, developerCode) {
  if (developerCode !== DEVELOPER_CODE) {
    throw new Error('Invalid developer code');
  }
  const tables = normalizeDbBackup(
    typeof backupData === 'string' ? JSON.parse(backupData) : backupData
  );
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query('SAVEPOINT try_replica');
      await client.query('SET LOCAL session_replication_role = replica');
      await client.query('RELEASE SAVEPOINT try_replica');
    } catch {
      try {
        await client.query('ROLLBACK TO SAVEPOINT try_replica');
      } catch {
        /* continue with foreign-key insert order */
      }
    }

    const existingNames = [];
    for (const name of Object.keys(tables)) {
      if (!Array.isArray(tables[name])) continue;
      if (await tableExists(client, name)) existingNames.push(name);
    }

    for (const table of existingNames) {
      await client.query(`TRUNCATE TABLE ${quoteIdent(table)} CASCADE`);
    }

    const insertOrder = await orderTablesForInsert(client, existingNames);
    const skippedRows = [];
    for (const table of insertOrder) {
      const rows = tables[table];
      if (!rows?.length) continue;

      const { allowed, jsonCols } = await getInsertableColumns(client, table);
      for (const row of rows) {
        const keys = Object.keys(row).filter((k) => allowed.has(k));
        if (!keys.length) continue;
        const columns = keys.map(quoteIdent).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const values = keys.map((key) => serializeRestoreValue(row[key], jsonCols.has(key)));
        try {
          await client.query('SAVEPOINT row_insert');
          await client.query(
            `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${placeholders})`,
            values
          );
          await client.query('RELEASE SAVEPOINT row_insert');
        } catch (insertError) {
          try {
            await client.query('ROLLBACK TO SAVEPOINT row_insert');
          } catch {
            /* ignore */
          }
          skippedRows.push({ table, error: insertError.message });
          if (skippedRows.length <= 8) {
            console.warn(`Skipped row in "${table}":`, insertError.message);
          }
        }
      }

      try {
        await client.query('SAVEPOINT seq_reset');
        const seq = await client.query('SELECT pg_get_serial_sequence($1, $2) AS seq', [table, 'id']);
        const seqName = seq.rows[0]?.seq;
        if (seqName) {
          const maxId = Math.max(...rows.map((r) => Number(r.id) || 0), 0);
          await client.query('SELECT setval($1, $2, $3)', [seqName, Math.max(maxId, 1), maxId > 0]);
        }
        await client.query('RELEASE SAVEPOINT seq_reset');
      } catch (seqErr) {
        try {
          await client.query('ROLLBACK TO SAVEPOINT seq_reset');
        } catch {
          /* ignore */
        }
        console.warn(`Could not reset sequence for ${table}:`, seqErr.message);
      }
    }

    await client.query('COMMIT');
    console.log('Database restore completed successfully.');
    const skippedSummary = skippedRows.reduce((acc, row) => {
      acc[row.table] = (acc[row.table] || 0) + 1;
      return acc;
    }, {});
    return {
      message: 'Database restored successfully',
      skipped: skippedSummary,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error restoring database:', error.message);
    console.error('Full stack:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function wipeDatabase(developerCode) {
  if (developerCode !== DEVELOPER_CODE) {
    throw new Error('Invalid developer code');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const truncateOrder = [
      'audit_logs', 'rejections', 'approvals', 'request_items', 'request_approvers', 'item_serial_numbers', 'cash_expenses',
      'requests', 'items_out', 'items', 'vendors', 'categories', 'settings', 'supervisors', 'users'
    ];
    for (const table of truncateOrder) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }
    await client.query('COMMIT');
    console.log('Database wiped successfully.');
    return { message: 'Database wiped successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error wiping database:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

/** Allow re-using email/username after soft-delete (unique only among active users). */
async function migrateUsersActiveUniqueConstraints() {
  try {
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key');
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_unique
      ON users (LOWER(email)) WHERE deleted_at IS NULL
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_unique
      ON users (LOWER(username)) WHERE deleted_at IS NULL
    `);
  } catch (err) {
    console.warn('[users] active unique index migration:', err.message);
  }
}

export async function initDB() {
  try {
    // Multi-tenant foundation — must exist before any table below adds its `company` FK column.
    const { initCompaniesTable } = await import('./db/tenant.js');
    await initCompaniesTable();

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'requester' CHECK (role IN (
          'requester', 'approver', 'issuer', 'superadmin',
          'field_engineer', 'field_engineer_admin', 'finance',
          'director', 'cx', 'noc', 'customer', 'ip'
        )),
        main_role VARCHAR(50) DEFAULT 'requester',
        roles JSONB DEFAULT '[]'::jsonb,
        units JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'users');
    await addColumnIfNotExists('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    
    // Add main_role, roles, and units columns if they don't exist
    await addColumnIfNotExists('users', 'main_role', 'VARCHAR(50) DEFAULT NULL');
    await addColumnIfNotExists('users', 'roles', 'JSONB DEFAULT \'[]\'::jsonb');
    await addColumnIfNotExists('users', 'units', 'JSONB DEFAULT \'[]\'::jsonb');
    await addColumnIfNotExists('users', 'unit', 'VARCHAR(100)');
    await addColumnIfNotExists('users', 'position', 'VARCHAR(100)');
    await addColumnIfNotExists('users', 'status', "TEXT DEFAULT 'active'");
    await addColumnIfNotExists('users', 'phone', 'TEXT');
    await addColumnIfNotExists('users', 'department', 'TEXT');
    await addColumnIfNotExists('users', 'avatar_url', 'TEXT');
    await addColumnIfNotExists('users', 'chat_status_text', 'VARCHAR(100)');
    await addColumnIfNotExists('users', 'chat_status_emoji', 'VARCHAR(8)');

    await migrateUserRoleConstraint(pool);
    
    // Migrate existing role to main_role and roles array
    try {
      await pool.query(`
        UPDATE users 
        SET main_role = COALESCE(main_role, role), 
            roles = CASE 
              WHEN roles IS NULL OR roles = '[]'::jsonb THEN jsonb_build_array(role)
              ELSE roles
            END
        WHERE main_role IS NULL OR roles IS NULL OR roles = '[]'::jsonb;
      `);
    } catch (migrationError) {
      console.warn('Migration warning (may be expected on first run):', migrationError.message);
    }

    await migrateUsersActiveUniqueConstraints();

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS supervisors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'supervisors');
    await addColumnIfNotExists('supervisors', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key_name VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'settings');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        details JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'audit_logs');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        parent_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'categories');
    await addColumnIfNotExists('categories', 'deleted_at', 'TIMESTAMP');
    await addColumnIfNotExists('categories', 'parent_id', 'INTEGER REFERENCES categories(id) ON DELETE CASCADE');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'vendors');
    await addColumnIfNotExists('vendors', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category_id INTEGER REFERENCES categories(id),
        vendor_id INTEGER REFERENCES vendors(id),
        quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 5,
        vendor_name VARCHAR(255),
        unit_price DECIMAL(10,2),
        receipt_images JSONB DEFAULT '[]',
        update_reasons TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'items');
    await addColumnIfNotExists('items', 'deleted_at', 'TIMESTAMP');
    await addColumnIfNotExists('items', 'vendor_id', 'INTEGER REFERENCES vendors(id)');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS item_serial_numbers (
        id SERIAL PRIMARY KEY,
        item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
        serial_number VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'issued', 'returned', 'damaged', 'lost')),
        issued_to VARCHAR(255),
        issued_at TIMESTAMP,
        returned_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      );
    `, 'item_serial_numbers');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS items_out (
        id SERIAL PRIMARY KEY,
        person_name VARCHAR(255) NOT NULL,
        item_id INTEGER REFERENCES items(id),
        quantity INTEGER NOT NULL,
        date_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'items_out');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS requests (
        id SERIAL PRIMARY KEY,
        created_by VARCHAR(255) NOT NULL,
        team_leader_name VARCHAR(255),
        team_leader_phone VARCHAR(50),
        project_name VARCHAR(255),
        isp_name VARCHAR(255),
        location TEXT,
        deployment_type VARCHAR(100),
        release_by VARCHAR(255),
        received_by VARCHAR(255),
        type VARCHAR(50) DEFAULT 'material_request' CHECK (type IN ('material_request', 'item_return', 'cash_request')),
        reason TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'supervisor_approved', 'finance_approved', 'completed', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP,
        deleted_at TIMESTAMP,
        car_number VARCHAR(50),
        drivers_name VARCHAR(255),
        drivers_contact VARCHAR(50),
        address TEXT,
        project_description TEXT,
        department VARCHAR(255),
        purpose TEXT,
        deliver_to VARCHAR(255),
        deliver_phone VARCHAR(50),
        special_instructions TEXT,
        date_needed DATE,
        total_amount DECIMAL(12,2),
        received_at TIMESTAMP
      );
    `, 'requests');
    await addColumnIfNotExists('requests', 'deleted_at', 'TIMESTAMP');
    await addColumnIfNotExists('requests', 'car_number', 'VARCHAR(50)');
    await addColumnIfNotExists('requests', 'drivers_name', 'VARCHAR(255)');
    await addColumnIfNotExists('requests', 'drivers_contact', 'VARCHAR(50)');
    await addColumnIfNotExists('requests', 'address', 'TEXT');
    await addColumnIfNotExists('requests', 'project_description', 'TEXT');
    await addColumnIfNotExists('requests', 'type', "VARCHAR(50) DEFAULT 'material_request' CHECK (type IN ('material_request', 'item_return', 'cash_request'))");
    await addColumnIfNotExists('requests', 'status', "VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'supervisor_approved', 'finance_approved', 'completed', 'rejected'))");
    await addColumnIfNotExists('requests', 'department', 'VARCHAR(255)');
    await addColumnIfNotExists('requests', 'purpose', 'TEXT');
    await addColumnIfNotExists('requests', 'deliver_to', 'VARCHAR(255)');
    await addColumnIfNotExists('requests', 'deliver_phone', 'VARCHAR(50)');
    await addColumnIfNotExists('requests', 'special_instructions', 'TEXT');
    await addColumnIfNotExists('requests', 'date_needed', 'DATE');
    await addColumnIfNotExists('requests', 'total_amount', 'DECIMAL(12,2)');
    await addColumnIfNotExists('requests', 'received_at', 'TIMESTAMP');
    await addColumnIfNotExists('requests', 'released_at', 'TIMESTAMP');
    await addColumnIfNotExists('requests', 'created_by_id', 'INTEGER REFERENCES users(id)');
    await addColumnIfNotExists('requests', 'ticket_id', 'INTEGER REFERENCES tickets(id) ON DELETE SET NULL');
    await addColumnIfNotExists('requests', 'linked_cash_request_id', 'INTEGER REFERENCES requests(id) ON DELETE SET NULL');
    // Client/Site standardization — material/cash requests reference the same centralized Site
    // master record instead of a free-typed "project name". project_name/location stay as the
    // display snapshot (auto-filled from the site, editable when the site has no address on file)
    // so existing reports/search that read those columns keep working unmodified.
    await addColumnIfNotExists('requests', 'site_id', 'INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS shared_links (
        id SERIAL PRIMARY KEY,
        token VARCHAR(128) UNIQUE NOT NULL,
        record_type VARCHAR(80) NOT NULL,
        record_id INTEGER NOT NULL,
        visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMP NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, 'shared_links');
    await pool.query('CREATE INDEX IF NOT EXISTS shared_links_token_idx ON shared_links(token)');
    await pool.query('CREATE INDEX IF NOT EXISTS shared_links_creator_idx ON shared_links(created_by_user_id, created_at DESC)');
    await addColumnIfNotExists('shared_links', 'page_path', 'TEXT');
    await addColumnIfNotExists('shared_links', 'page_title', 'TEXT');
    await addColumnIfNotExists('shared_links', 'record_preview', 'TEXT');
    await addColumnIfNotExists('shared_links', 'created_by_name', 'VARCHAR(255)');
    await pool.query('CREATE INDEX IF NOT EXISTS shared_links_record_idx ON shared_links(record_type, record_id)');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS linked_references (
        id SERIAL PRIMARY KEY,
        source_record_type VARCHAR(80) NOT NULL,
        source_record_id INTEGER NOT NULL,
        linked_record_type VARCHAR(80) NOT NULL,
        linked_record_id INTEGER NOT NULL,
        linked_reference_number VARCHAR(80) NOT NULL,
        linked_title TEXT,
        linked_status VARCHAR(80),
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, 'linked_references');
    await pool.query('CREATE INDEX IF NOT EXISTS linked_references_source_idx ON linked_references(source_record_type, source_record_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS linked_references_linked_idx ON linked_references(linked_record_type, linked_record_id)');

    try {
      await pool.query('ALTER TABLE requests ALTER COLUMN team_leader_name DROP NOT NULL');
      await pool.query('ALTER TABLE requests ALTER COLUMN team_leader_phone DROP NOT NULL');
      await pool.query('ALTER TABLE requests ALTER COLUMN deployment_type DROP NOT NULL');
    } catch (e) {
      console.warn('Could not drop NOT NULL constraints (already dropped or not exist):', e.message);
    }

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS request_approvers (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
        approver_id INTEGER REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(request_id, approver_id)
      );
    `, 'request_approvers');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS request_items (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES items(id),
        quantity_requested INTEGER NOT NULL,
        quantity_received INTEGER,
        quantity_returned INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
      );
    `, 'request_items');
    await addColumnIfNotExists('request_items', 'serial_number', 'VARCHAR(255)');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
        approver_name VARCHAR(255) NOT NULL,
        signature TEXT,
        approval_stage VARCHAR(30) DEFAULT 'supervisor' CHECK (approval_stage IN ('supervisor', 'finance')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'approvals');
    await addColumnIfNotExists('approvals', 'approval_stage', "VARCHAR(30) DEFAULT 'supervisor' CHECK (approval_stage IN ('supervisor', 'finance'))");
    // Allow 'director' stage for finance workflow (amount thresholds)
    try {
      await pool.query(`ALTER TABLE approvals DROP CONSTRAINT IF EXISTS approvals_approval_stage_check`);
      await pool.query(`ALTER TABLE approvals ADD CONSTRAINT approvals_approval_stage_check CHECK (approval_stage IN ('supervisor', 'finance', 'director'))`);
    } catch (e) {
      // Constraint name may vary; ignore if already updated
    }
    await addColumnIfNotExists('approvals', 'approver_id', 'INTEGER REFERENCES users(id)');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS rejections (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
        rejector_name VARCHAR(255) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'rejections');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS transport_requests (
        id SERIAL PRIMARY KEY,
        requester_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        requester_name VARCHAR(255) NOT NULL,
        site_name VARCHAR(255) NOT NULL,
        location TEXT NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        engineer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        purpose TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        current_stage VARCHAR(30) NOT NULL DEFAULT 'approver' CHECK (current_stage IN ('approver', 'supervisor')),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'transport_requests');
    await addColumnIfNotExists('transport_requests', 'requester_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await addColumnIfNotExists('transport_requests', 'engineer_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
    await addColumnIfNotExists('transport_requests', 'purpose', 'TEXT');
    await addColumnIfNotExists('transport_requests', 'current_stage', "VARCHAR(30) NOT NULL DEFAULT 'approver' CHECK (current_stage IN ('approver', 'supervisor'))");
    await addColumnIfNotExists('transport_requests', 'deleted_at', 'TIMESTAMP');
    await addColumnIfNotExists('transport_requests', 'reference_type', 'VARCHAR(40)');
    await addColumnIfNotExists('transport_requests', 'reference_id', 'INTEGER');
    await addColumnIfNotExists('transport_requests', 'reference_number', 'VARCHAR(80)');
    await addColumnIfNotExists('transport_requests', 'reference_title', 'TEXT');
    await addColumnIfNotExists('transport_requests', 'reference_status', 'VARCHAR(80)');
    await addColumnIfNotExists('transport_requests', 'selected_approver_ids', "JSONB NOT NULL DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('transport_requests', 'site_id', 'INTEGER REFERENCES customer_sites(id) ON DELETE SET NULL');
    await addColumnIfNotExists('transport_requests', 'client_id', 'INTEGER REFERENCES customers(id) ON DELETE SET NULL');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS transport_request_approvals (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES transport_requests(id) ON DELETE CASCADE,
        approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approver_name VARCHAR(255) NOT NULL,
        stage VARCHAR(30) NOT NULL CHECK (stage IN ('approver', 'supervisor')),
        decision VARCHAR(30) NOT NULL CHECK (decision IN ('approved', 'rejected')),
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, 'transport_request_approvals');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS vehicle_request_forms (
        id SERIAL PRIMARY KEY,
        transport_request_id INTEGER REFERENCES transport_requests(id) ON DELETE SET NULL,
        requester_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        department VARCHAR(255),
        requestor_name VARCHAR(255),
        purpose TEXT,
        date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deliver_to VARCHAR(255),
        phone VARCHAR(255),
        special_instructions TEXT,
        order_no VARCHAR(255),
        invoice_terms VARCHAR(255),
        received_by VARCHAR(255),
        line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        selected_approver_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'sent_to_finance', 'cash_issued', 'completed', 'rejected')),
        current_stage VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (current_stage IN ('draft', 'pending', 'finance', 'cash_issued', 'completed', 'rejected')),
        approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        finance_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'vehicle_request_forms');

    try {
      await pool.query('ALTER TABLE vehicle_request_forms ALTER COLUMN transport_request_id DROP NOT NULL;');
    } catch (error) {
      // ignore if column is already nullable or table not ready
    }

    await addColumnIfNotExists('vehicle_request_forms', 'attachments', "JSONB DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('vehicle_request_forms', 'line_items', "JSONB DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('vehicle_request_forms', 'selected_approver_ids', "JSONB DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('vehicle_request_forms', 'department', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'requestor_name', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'purpose', 'TEXT');
    await addColumnIfNotExists('vehicle_request_forms', 'deliver_to', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'phone', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'special_instructions', 'TEXT');
    await addColumnIfNotExists('vehicle_request_forms', 'order_no', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'invoice_terms', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'received_by', 'VARCHAR(255)');
    await addColumnIfNotExists('vehicle_request_forms', 'status', "VARCHAR(30) NOT NULL DEFAULT 'draft'");
    await addColumnIfNotExists('vehicle_request_forms', 'current_stage', "VARCHAR(30) NOT NULL DEFAULT 'draft'");
    await addColumnIfNotExists('vehicle_request_forms', 'deleted_at', 'TIMESTAMP');
    await addColumnIfNotExists('vehicle_request_forms', 'reference_type', 'VARCHAR(40)');
    await addColumnIfNotExists('vehicle_request_forms', 'reference_id', 'INTEGER');
    await addColumnIfNotExists('vehicle_request_forms', 'reference_number', 'VARCHAR(80)');
    await addColumnIfNotExists('vehicle_request_forms', 'reference_title', 'TEXT');
    await addColumnIfNotExists('vehicle_request_forms', 'reference_status', 'VARCHAR(80)');

    await migrateVehicleRentalWorkflow();

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS fuel_requests (
        id SERIAL PRIMARY KEY,
        ref_no VARCHAR(50) UNIQUE NOT NULL,
        requester_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        requester_name VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        project_ticket_ref VARCHAR(255),
        project_id INTEGER,
        ticket_id INTEGER,
        vehicle_plate VARCHAR(100) NOT NULL,
        fuel_type VARCHAR(50) NOT NULL,
        quantity_litres NUMERIC(10, 2) NOT NULL,
        price_per_litre NUMERIC(10, 2),
        estimated_amount NUMERIC(10, 2) NOT NULL,
        purpose TEXT,
        selected_approver_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(50) NOT NULL DEFAULT 'Pending',
        current_stage VARCHAR(50) NOT NULL DEFAULT 'approver',
        receipt_url TEXT,
        receipt_filename VARCHAR(255),
        receipt_uploaded_at TIMESTAMP,
        cash_issued_at TIMESTAMP,
        cash_issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        completed_at TIMESTAMP,
        completed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rejected_at TIMESTAMP,
        rejected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        rejection_reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'fuel_requests');

    await addColumnIfNotExists('fuel_requests', 'selected_approver_ids', "JSONB DEFAULT '[]'::jsonb");
    await addColumnIfNotExists('fuel_requests', 'reference_type', 'VARCHAR(40)');
    await addColumnIfNotExists('fuel_requests', 'reference_number', 'VARCHAR(255)');
    await addColumnIfNotExists('fuel_requests', 'reference_title', 'TEXT');
    await addColumnIfNotExists('fuel_requests', 'reference_id', 'INTEGER');
    await addColumnIfNotExists('fuel_requests', 'reference_status', 'VARCHAR(80)');
    try {
      await pool.query('ALTER TABLE fuel_requests DROP CONSTRAINT IF EXISTS fuel_requests_reference_type_check');
    } catch (error) {
      console.warn('fuel_requests reference_type constraint:', error.message);
    }

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS fuel_request_approvals (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES fuel_requests(id) ON DELETE CASCADE,
        approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        approver_name VARCHAR(255) NOT NULL,
        stage VARCHAR(50) NOT NULL,
        decision VARCHAR(50) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, 'fuel_request_approvals');

    // System notifications (set by superadmin) and per-user read tracking
    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS system_notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id),
        is_active BOOLEAN DEFAULT TRUE
      );
    `, 'system_notifications');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS notification_reads (
        id SERIAL PRIMARY KEY,
        notification_id INTEGER REFERENCES system_notifications(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(notification_id, user_id)
      );
    `, 'notification_reads');

    await addColumnIfNotExists('system_notifications', 'target_user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
    await addColumnIfNotExists('system_notifications', 'link_url', 'TEXT');
    await addColumnIfNotExists('system_notifications', 'notification_type', "VARCHAR(40) DEFAULT 'broadcast'");

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, token)
      );
    `, 'fcm_tokens');

    // Native Web Push subscriptions (PushManager) — endpoint+keys per device
    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'push_subscriptions');

    // cash_expenses table with GENERATED column
    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS cash_expenses (
        id SERIAL PRIMARY KEY,
        request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
        unit_price DECIMAL(12,2) NOT NULL CHECK (unit_price >= 0),
        line_total DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'cash_expenses');

    // PERMANENT FIX: Force correct line_total definition
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'cash_expenses'
            AND column_name = 'line_total'
            AND is_generated = 'NEVER'
        ) THEN
          ALTER TABLE cash_expenses DROP COLUMN line_total;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'cash_expenses' AND column_name = 'line_total'
        ) THEN
          ALTER TABLE cash_expenses
          ADD COLUMN line_total DECIMAL(12,2)
          GENERATED ALWAYS AS (quantity * unit_price) STORED;
        END IF;
      END $$;
    `);

      await initTicketingDB();
      const { initTicketTables } = await import('./db.ticketing.cjs');
      await initTicketTables();

    // Asset Manager tables (separate from inventory categories/vendors)
    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'asset_categories');
    await addColumnIfNotExists('asset_categories', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_locations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'asset_locations');
    await addColumnIfNotExists('asset_locations', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_vendors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(100),
        email VARCHAR(255),
        address TEXT,
        type VARCHAR(50) DEFAULT 'supplier' CHECK (type IN ('supplier', 'repair_technician', 'service_provider', 'manufacturer')),
        services TEXT,
        website VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'asset_vendors');
    await addColumnIfNotExists('asset_vendors', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_personnel (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        personnel_number VARCHAR(100),
        job_title VARCHAR(255),
        "group" VARCHAR(255),
        location VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'asset_personnel');
    await addColumnIfNotExists('asset_personnel', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS assets (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        serial_number VARCHAR(255),
        brand VARCHAR(255),
        model VARCHAR(255),
        description TEXT,
        category_id INTEGER REFERENCES asset_categories(id) ON DELETE SET NULL,
        location_id INTEGER REFERENCES asset_locations(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'in_repair', 'damaged', 'lost', 'retired')),
        assigned_to_id INTEGER REFERENCES asset_personnel(id) ON DELETE SET NULL,
        purchase_date DATE,
        cost DECIMAL(12,2),
        vendor_id INTEGER REFERENCES asset_vendors(id) ON DELETE SET NULL,
        warranty_until DATE,
        photos JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'assets');
    await addColumnIfNotExists('assets', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_assignments (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        person_id INTEGER NOT NULL REFERENCES asset_personnel(id) ON DELETE CASCADE,
        assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        returned_date TIMESTAMP,
        condition_before VARCHAR(255),
        condition_after VARCHAR(255),
        notes_before TEXT,
        notes_after TEXT,
        status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'returned')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `, 'asset_assignments');

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS asset_maintenance (
        id SERIAL PRIMARY KEY,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL CHECK (type IN ('repair', 'service', 'inspection', 'upgrade')),
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'not_fixable')),
        technician VARCHAR(255),
        cost DECIMAL(12,2),
        start_date DATE NOT NULL,
        completion_date DATE,
        notes TEXT,
        photos JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );
    `, 'asset_maintenance');
    await addColumnIfNotExists('asset_maintenance', 'deleted_at', 'TIMESTAMP');

    await createTableIfNotExists('CREATE INDEX IF NOT EXISTS idx_cash_expenses_request_id ON cash_expenses(request_id);', 'index cash_expenses');

    // Add IMAP settings columns if they don't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'imap_host') THEN
          ALTER TABLE settings ADD COLUMN imap_host VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'imap_port') THEN
          ALTER TABLE settings ADD COLUMN imap_port INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'imap_username') THEN
          ALTER TABLE settings ADD COLUMN imap_username VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'imap_password') THEN
          ALTER TABLE settings ADD COLUMN imap_password TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'imap_tls') THEN
          ALTER TABLE settings ADD COLUMN imap_tls BOOLEAN DEFAULT true;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'system_email') THEN
          ALTER TABLE settings ADD COLUMN system_email VARCHAR(255);
        END IF;
      END $$;
    `);

    const defaults = [
      { key: 'from_name', value: 'Inventory System', desc: 'Sender name for low stock alert emails' },
      { key: 'from_email', value: 'vobissvobiss@gmail.com', desc: 'Sender email for low stock alert emails' }
    ];
    for (const def of defaults) {
      try {
        const exists = await pool.query('SELECT id FROM settings WHERE key_name = $1', [def.key]);
        if (exists.rowCount === 0) {
          await pool.query(
            'INSERT INTO settings (key_name, value, description) VALUES ($1, $2, $3)',
            [def.key, def.value, def.desc]
          );
          console.log(`Default setting "${def.key}" inserted.`);
        }
      } catch (seedError) {
        console.warn(`Error seeding default setting "${def.key}":`, seedError.message);
      }
    }

    try {
      const adminExists = await pool.query('SELECT id FROM users WHERE username = $1', ['stockadmin']);
      if (adminExists.rowCount === 0) {
        const plainPassword = 'ezekeil@vobissadmin';
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        await pool.query(
          'INSERT INTO users (first_name, last_name, username, email, password, role, created_at) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)',
          ['Stock', 'Admin', 'stockadmin', 'stockadmin@inventory.local', hashedPassword, 'superadmin']
        );
        console.log('Default superadmin user "stockadmin" created.');
      }
    } catch (seedError) {
      console.warn('Error seeding default superadmin user:', seedError.message);
    }

    try {
      const exists = await pool.query('SELECT id FROM users WHERE username = $1', ['fieldadmin']);
      if (exists.rowCount === 0) {
        const hashed = await bcrypt.hash('field123', 10);
        await pool.query(
          'INSERT INTO users (first_name, last_name, username, email, password, role) VALUES ($1,$2,$3,$4,$5,$6)',
          ['Field', 'Admin', 'fieldadmin', 'field.admin@site.com', hashed, 'field_engineer_admin']
        );
        console.log('FIELD ENGINEER ADMIN CREATED → username: fieldadmin | password: field123');
      }
    } catch (e) { console.warn('Field admin seed error:', e.message); }

    await createTableIfNotExists(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action_type VARCHAR(80) NOT NULL,
        description TEXT NOT NULL,
        record_type VARCHAR(80) NOT NULL,
        record_id INTEGER,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `, 'activity_logs');
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_user_created_idx ON activity_logs (user_id, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS activity_logs_action_type_idx ON activity_logs (action_type)`);
    } catch (e) {
      console.warn('activity_logs indexes:', e.message);
    }

    try {
      const { initProjectRequestTables } = await import('./db/project.js');
      await initProjectRequestTables();
      console.log('Project request tables initialized.');
    } catch (e) {
      console.warn('Project request tables init:', e.message);
    }

    // company column on every core tenant-scoped table this file itself creates — 'CW' default
    // backfills all existing rows, so nothing already in the database changes ownership.
    try {
      const { addCompanyColumn } = await import('./db/tenant.js');
      for (const table of ['users', 'requests', 'items', 'transport_requests', 'assets', 'audit_logs', 'fuel_requests', 'vehicle_request_forms']) {
        await addCompanyColumn(table);
      }
    } catch (e) {
      console.warn('Tenant company columns init:', e.message);
    }

  } catch (error) {
    console.error('Critical error during database initialization:', error.stack);
    throw error;
  }
}

export async function getUserById(userId) {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, main_role, roles, units, unit, position, company
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const user = result.rows[0];
    if (user) {
      // Parse JSONB fields
      user.roles = user.roles && typeof user.roles === 'string' ? JSON.parse(user.roles) : (user.roles || []);
      user.units = user.units && typeof user.units === 'string' ? JSON.parse(user.units) : (user.units || []);
      // Ensure main_role is set
      if (!user.main_role) {
        user.main_role = user.role;
      }
      // Ensure roles array includes main_role
      if (!user.roles || user.roles.length === 0) {
        user.roles = [user.role];
      }
    }
    return user || null;
  } catch (error) {
    console.error('getUserById error:', error.message);
    return null;
  }
}

export function canAccessRoute(role, route) {
  const permissions = {
    // Existing roles
    superadmin: ['dashboard', 'users', 'inventory', 'field', 'settings', 'audit', 'cx', 'noc'],
    issuer: ['dashboard', 'inventory', 'field'],
    approver: ['dashboard', 'field'],
    finance: ['dashboard', 'field', 'finance'],
    requester: ['field'],
    field_engineer: ['field'],
    field_engineer_admin: ['field'],

    // === NEW ROLES FOR TICKETING SYSTEM ===
    director: ['dashboard', 'users', 'inventory', 'field', 'settings', 'audit', 'cx', 'noc', 'ip'], // Full access
    cx: ['dashboard', 'cx'],                                                               // Only CX section
    noc: ['dashboard', 'noc'],                                                             // Only NOC section (future)
    customer: ['customer-portal']                                                          // Only public customer portal (future)
  };

  const userPermissions = permissions[role] || [];
  return userPermissions.includes(route) || userPermissions.includes('all');
}

export async function getSettings() {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY key_name ASC');
    const settingsMap = {};
    result.rows.forEach(row => {
      settingsMap[row.key_name] = row.value;
    });
    return { ...settingsMap, all: result.rows };
  } catch (error) {
    console.error('Error fetching settings:', error.stack);
    throw error;
  }
}

export async function updateSetting(keyName, value) {
  try {
    const result = await pool.query(
      'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key_name = $2 RETURNING *',
      [value, keyName]
    );
    if (result.rowCount === 0) {
      await pool.query(
        'INSERT INTO settings (key_name, value, description) VALUES ($1, $2, $3)',
        [keyName, value, '']
      );
    }
    return { key: keyName, value };
  } catch (error) {
    console.error('Error updating setting:', error.stack);
    throw error;
  }
}

const DEFAULT_WORKFLOW_CONFIG = {
  material: {
    required_approvers_count: 2,
    eligible_approver_roles: [
      'approver',
      'noc_supervisor',
      'ts_supervisor',
      'ip_supervisor',
      'noc_manager',
      'ts_manager',
      'ip_manager',
      'director',
      'superadmin',
      'finance',
    ],
  },
  finance: {
    amount_thresholds: [
      { max_amount: 1500, required_approvers: 2 },
      { min_amount: 1500, requires_director: true, required_approvers_before_director: 2 },
    ],
  },
  transport: {
    approver_ids: [],
    supervisor_id: null,
    vehicle_request_approver_ids: [],
    finance_user_ids: [],
    fuel_request_approver_ids: [],
    price_per_litre: null,
    require_reference_link: false,
    require_reference_link_fuel: false,
    require_reference_link_vehicle: false,
    require_reference_link_cash: false,
    require_reference_link_material: false,
  },
  ticket_escalation: DEFAULT_TICKET_ESCALATION,
  ticket_sla: DEFAULT_TICKET_SLA,
};

export async function getWorkflowConfig() {
  try {
    const result = await pool.query(
      "SELECT value FROM settings WHERE key_name = 'workflow_config'"
    );
    const realm = await getRealmApprovers();
    if (result.rowCount === 0 || !result.rows[0].value) {
      const fallback = {
        ...DEFAULT_WORKFLOW_CONFIG,
        transport: {
          approver_ids: normalizeIdList(realm.transport_approver_ids || DEFAULT_WORKFLOW_CONFIG.transport.approver_ids),
          supervisor_id: normalizeTransportSupervisorId(realm.transport_supervisor_ids) ?? DEFAULT_WORKFLOW_CONFIG.transport.supervisor_id,
          vehicle_request_approver_ids: normalizeIdList(realm.vehicle_request_approver_ids || DEFAULT_WORKFLOW_CONFIG.transport.vehicle_request_approver_ids),
          finance_user_ids: normalizeIdList(realm.finance_user_ids || DEFAULT_WORKFLOW_CONFIG.transport.finance_user_ids),
          fuel_request_approver_ids: normalizeIdList(realm.fuel_request_approver_ids || []),
          price_per_litre: null,
          require_reference_link: false,
          require_reference_link_fuel: false,
          require_reference_link_vehicle: false,
          require_reference_link_cash: false,
          require_reference_link_material: false,
        },
        ticket_escalation: normalizeTicketEscalationConfig(DEFAULT_TICKET_ESCALATION),
        ticket_sla: normalizeTicketSlaConfig(DEFAULT_TICKET_SLA),
      };
      return fallback;
    }
    const parsed = JSON.parse(result.rows[0].value);
    const rawMaterial = parsed.material || {};
    const material = {
      ...DEFAULT_WORKFLOW_CONFIG.material,
      ...rawMaterial,
      required_approvers_count: Math.max(
        1,
        parseInt(rawMaterial.required_approvers_count, 10) || 2
      ),
      eligible_approver_roles:
        rawMaterial.eligible_approver_roles ||
        DEFAULT_WORKFLOW_CONFIG.material.eligible_approver_roles,
    };
    const rawFinance = parsed.finance || {};
    const finance = {
      ...DEFAULT_WORKFLOW_CONFIG.finance,
      ...rawFinance,
      amount_thresholds:
        rawFinance.amount_thresholds || DEFAULT_WORKFLOW_CONFIG.finance.amount_thresholds,
    };
    const workflowTransport = parsed.transport || {};
    const workflowApproverIds = normalizeIdList(workflowTransport.approver_ids || []);
    const workflowVehicleApproverIds = normalizeIdList(workflowTransport.vehicle_request_approver_ids || []);
    const workflowFinanceIds = normalizeIdList(workflowTransport.finance_user_ids || []);
    const workflowFuelApproverIds = normalizeIdList(workflowTransport.fuel_request_approver_ids || []);
    const realmApproverIds = normalizeIdList(realm.transport_approver_ids || []);
    const realmVehicleApproverIds = normalizeIdList(realm.vehicle_request_approver_ids || []);
    const realmFinanceIds = normalizeIdList(realm.finance_user_ids || []);
    const realmFuelApproverIds = normalizeIdList(realm.fuel_request_approver_ids || []);

    const transport = {
      approver_ids: normalizeIdList([...workflowApproverIds, ...realmApproverIds]),
      supervisor_id: normalizeTransportSupervisorId(workflowTransport.supervisor_id) ?? normalizeTransportSupervisorId(workflowTransport.transport_supervisor_ids) ?? normalizeTransportSupervisorId(realm.transport_supervisor_ids) ?? null,
      vehicle_request_approver_ids: normalizeIdList([...workflowVehicleApproverIds, ...realmVehicleApproverIds]),
      finance_user_ids: normalizeIdList([...workflowFinanceIds, ...realmFinanceIds]),
      fuel_request_approver_ids: normalizeIdList([...workflowFuelApproverIds, ...realmFuelApproverIds]),
      price_per_litre: workflowTransport.price_per_litre !== undefined && workflowTransport.price_per_litre !== null && workflowTransport.price_per_litre !== ''
        ? Number(workflowTransport.price_per_litre)
        : null,
      require_reference_link: workflowTransport.require_reference_link === true || workflowTransport.require_reference_link === 'required',
      require_reference_link_fuel: workflowTransport.require_reference_link_fuel === true || workflowTransport.require_reference_link_fuel === 'required',
      require_reference_link_vehicle: workflowTransport.require_reference_link_vehicle === true || workflowTransport.require_reference_link_vehicle === 'required',
      require_reference_link_cash: workflowTransport.require_reference_link_cash === true || workflowTransport.require_reference_link_cash === 'required',
      require_reference_link_material: workflowTransport.require_reference_link_material === true || workflowTransport.require_reference_link_material === 'required',
    };
    return {
      material,
      finance,
      transport,
      ticket_escalation: normalizeTicketEscalationConfig(
        parsed.ticket_escalation || DEFAULT_WORKFLOW_CONFIG.ticket_escalation
      ),
      ticket_sla: normalizeTicketSlaConfig(parsed.ticket_sla || DEFAULT_TICKET_SLA),
    };
  } catch (error) {
    console.error('Error fetching workflow config:', error.stack);
    return {
      ...DEFAULT_WORKFLOW_CONFIG,
      transport: { ...DEFAULT_WORKFLOW_CONFIG.transport },
      ticket_escalation: normalizeTicketEscalationConfig(DEFAULT_TICKET_ESCALATION),
      ticket_sla: normalizeTicketSlaConfig(DEFAULT_TICKET_SLA),
    };
  }
}

export async function updateWorkflowConfig(config) {
  const eligibleMaterialRoles = [
    'approver',
    'noc_supervisor',
    'ts_supervisor',
    'ip_supervisor',
    'noc_manager',
    'ts_manager',
    'ip_manager',
    'director',
    'cto',
    'superadmin',
    'finance',
    'finance_manager',
  ];
  const existing = await getWorkflowConfig();
  const incomingMaterial = config.material || existing.material || {};
  const requiredApprovers = Math.max(
    1,
    parseInt(incomingMaterial.required_approvers_count, 10) || 2
  );
  const roleSource = incomingMaterial.eligible_approver_roles || [];
  const eligibleRoles = Array.isArray(roleSource)
    ? roleSource.filter((r) => eligibleMaterialRoles.includes(r))
    : DEFAULT_WORKFLOW_CONFIG.material.eligible_approver_roles;

  const incomingFinance = config.finance || existing.finance || {};
  const amountThresholds =
    incomingFinance.amount_thresholds || DEFAULT_WORKFLOW_CONFIG.finance.amount_thresholds;
  const incomingTransport = config.transport || existing.transport || {};
  const transportApproverIds = normalizeIdList(incomingTransport.approver_ids || []);
  const transportSupervisorId = normalizeTransportSupervisorId(incomingTransport.supervisor_id) ?? normalizeTransportSupervisorId(incomingTransport.transport_supervisor_ids) ?? null;
  const transportSupervisorIds = normalizeIdList(
    Array.isArray(incomingTransport.transport_supervisor_ids)
      ? incomingTransport.transport_supervisor_ids
      : transportSupervisorId ? [transportSupervisorId] : []
  );

  const priceVal = incomingTransport.price_per_litre !== undefined && incomingTransport.price_per_litre !== null && incomingTransport.price_per_litre !== ''
    ? Number(incomingTransport.price_per_litre)
    : null;

  const sanitized = {
    material: {
      required_approvers_count: requiredApprovers,
      eligible_approver_roles:
        eligibleRoles.length > 0 ? eligibleRoles : DEFAULT_WORKFLOW_CONFIG.material.eligible_approver_roles,
    },
    finance: {
      amount_thresholds: Array.isArray(amountThresholds)
        ? amountThresholds
        : DEFAULT_WORKFLOW_CONFIG.finance.amount_thresholds,
    },
    transport: {
      approver_ids: transportApproverIds,
      supervisor_id: transportSupervisorId,
      transport_supervisor_ids: transportSupervisorIds,
      vehicle_request_approver_ids: normalizeIdList(incomingTransport.vehicle_request_approver_ids || []),
      finance_user_ids: normalizeIdList(incomingTransport.finance_user_ids || []),
      fuel_request_approver_ids: normalizeIdList(incomingTransport.fuel_request_approver_ids || []),
      price_per_litre: Number.isFinite(priceVal) && priceVal >= 0 ? priceVal : null,
      require_reference_link: incomingTransport.require_reference_link === true || incomingTransport.require_reference_link === 'required',
      require_reference_link_fuel: incomingTransport.require_reference_link_fuel === true || incomingTransport.require_reference_link_fuel === 'required',
      require_reference_link_vehicle: incomingTransport.require_reference_link_vehicle === true || incomingTransport.require_reference_link_vehicle === 'required',
      require_reference_link_cash: incomingTransport.require_reference_link_cash === true || incomingTransport.require_reference_link_cash === 'required',
      require_reference_link_material: incomingTransport.require_reference_link_material === true || incomingTransport.require_reference_link_material === 'required',
    },
    ticket_escalation: normalizeTicketEscalationConfig(
      config.ticket_escalation ?? existing.ticket_escalation
    ),
    ticket_sla: normalizeTicketSlaConfig(config.ticket_sla ?? existing.ticket_sla),
  };
  await updateSetting('workflow_config', JSON.stringify(sanitized));

  const realm = await getRealmApprovers();
  await updateRealmApprovers({
    ...realm,
    transport_approver_ids: normalizeIdList([...transportApproverIds, ...(realm.transport_approver_ids || [])]),
    transport_supervisor_ids: normalizeIdList([...transportSupervisorIds, ...(realm.transport_supervisor_ids || [])]),
    vehicle_request_approver_ids: normalizeIdList((config.transport || existing.transport || {}).vehicle_request_approver_ids || realm.vehicle_request_approver_ids || []),
    finance_user_ids: normalizeIdList((config.transport || existing.transport || {}).finance_user_ids || realm.finance_user_ids || []),
  });

  try {
    const { resyncOpenTicketEscalationTimers } = await import('./ticketEscalation.js');
    const sync = await resyncOpenTicketEscalationTimers();
    if (sync.updated > 0) {
      console.log(`[ticket-escalation] Resynced SLA timers for ${sync.updated} open ticket(s) from configuration`);
    }
  } catch (e) {
    console.warn('[ticket-escalation] resync after config save failed:', e.message);
  }
  return sanitized;
}

const DEFAULT_REALM_APPROVERS = {
  material_user_ids: [],
  cash_user_ids: [],
  transport_approver_ids: [],
  transport_supervisor_ids: [],
  vehicle_request_approver_ids: [],
  finance_user_ids: [],
  fuel_request_approver_ids: [],
};

function normalizeTransportSupervisorId(value) {
  if (Array.isArray(value)) {
    const ids = normalizeIdList(value);
    return ids[0] || null;
  }
  if (value === null || value === undefined || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

// Storage note: this settings row predates multi-tenancy and was a flat object
// ({material_user_ids: [...], ...} — always C&W's). It's now company-keyed
// ({ CW: {...}, PTEL: {...} }); `_isLegacyFlatRealmShape` tells the two apart so every existing
// C&W caller (which never passes `company`) keeps reading/writing exactly the same data as
// before the migration.
function _isLegacyFlatRealmShape(parsed) {
  return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
    ('material_user_ids' in parsed || 'cash_user_ids' in parsed) && !('CW' in parsed) && !('PTEL' in parsed);
}

export async function getRealmApprovers(company = 'CW') {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key_name = 'realm_approvers'");
    if (result.rowCount === 0 || !result.rows[0].value) {
      setRealmApproverIds(DEFAULT_REALM_APPROVERS, company);
      return { ...DEFAULT_REALM_APPROVERS };
    }
    const parsed = typeof result.rows[0].value === 'string'
      ? JSON.parse(result.rows[0].value)
      : result.rows[0].value;
    const bucket = _isLegacyFlatRealmShape(parsed) ? (company === 'CW' ? parsed : {}) : (parsed[company] || {});
    const realm = {
      material_user_ids: normalizeIdList(bucket.material_user_ids),
      cash_user_ids: normalizeIdList(bucket.cash_user_ids),
      transport_approver_ids: normalizeIdList(bucket.transport_approver_ids),
      transport_supervisor_ids: normalizeIdList(bucket.transport_supervisor_ids),
      vehicle_request_approver_ids: normalizeIdList(bucket.vehicle_request_approver_ids),
      finance_user_ids: normalizeIdList(bucket.finance_user_ids),
      fuel_request_approver_ids: normalizeIdList(bucket.fuel_request_approver_ids),
    };
    setRealmApproverIds(realm, company);
    return realm;
  } catch (error) {
    console.error('Error fetching realm approvers:', error.stack);
    setRealmApproverIds(DEFAULT_REALM_APPROVERS, company);
    return { ...DEFAULT_REALM_APPROVERS };
  }
}

export async function updateRealmApprovers(payload = {}, company = 'CW') {
  const realm = {
    material_user_ids: normalizeIdList(payload.material_user_ids),
    cash_user_ids: normalizeIdList(payload.cash_user_ids),
    transport_approver_ids: normalizeIdList(payload.transport_approver_ids),
    transport_supervisor_ids: normalizeIdList(payload.transport_supervisor_ids),
    vehicle_request_approver_ids: normalizeIdList(payload.vehicle_request_approver_ids),
    finance_user_ids: normalizeIdList(payload.finance_user_ids),
    fuel_request_approver_ids: normalizeIdList(payload.fuel_request_approver_ids),
  };

  const storedRealm = await pool.query("SELECT value FROM settings WHERE key_name = 'realm_approvers'");
  const parsedExisting = storedRealm.rowCount > 0 && storedRealm.rows[0].value
    ? (typeof storedRealm.rows[0].value === 'string' ? JSON.parse(storedRealm.rows[0].value) : storedRealm.rows[0].value)
    : {};
  const byCompany = _isLegacyFlatRealmShape(parsedExisting) ? { CW: parsedExisting } : { ...parsedExisting };
  byCompany[company] = realm;
  await updateSetting('realm_approvers', JSON.stringify(byCompany));

  // The transport/fuel/vehicle runtime gate (workflow_config.transport) isn't split per company
  // yet — PTEL has no transport/fuel/vehicle module in this pass, only Sales — so only a C&W
  // realm save mirrors into it; a PTEL save must never overwrite C&W's live transport config.
  if (company === 'CW') {
    const configRow = await pool.query("SELECT value FROM settings WHERE key_name = 'workflow_config'");
    const existingWorkflow = configRow.rowCount > 0 && configRow.rows[0].value ? JSON.parse(configRow.rows[0].value) : { ...DEFAULT_WORKFLOW_CONFIG };
    const primarySupervisor = normalizeTransportSupervisorId(realm.transport_supervisor_ids) ?? normalizeTransportSupervisorId(existingWorkflow.transport?.supervisor_id) ?? null;
    const mergedWorkflow = {
      ...existingWorkflow,
      transport: {
        ...DEFAULT_WORKFLOW_CONFIG.transport,
        ...(existingWorkflow.transport || {}),
        approver_ids: normalizeIdList(realm.transport_approver_ids),
        supervisor_id: primarySupervisor,
        transport_supervisor_ids: normalizeIdList(realm.transport_supervisor_ids),
        vehicle_request_approver_ids: normalizeIdList(realm.vehicle_request_approver_ids),
        finance_user_ids: normalizeIdList(realm.finance_user_ids),
        fuel_request_approver_ids: normalizeIdList(realm.fuel_request_approver_ids),
      },
    };
    await updateSetting('workflow_config', JSON.stringify(mergedWorkflow));
  }

  setRealmApproverIds(realm, company);
  return realm;
}

export async function getEligibleApprovers() {
  const workflowConfig = await getWorkflowConfig();
  const roles = workflowConfig.material?.eligible_approver_roles || ['approver'];
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `SELECT id, first_name, last_name, role
     FROM users
     WHERE role IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY last_name ASC, first_name ASC`,
    roles
  );
  return result.rows.map(row => ({
    id: row.id,
    fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'User',
    role: row.role
  }));
}

function normalizeLoginUserRow(user) {
  if (!user) return null;
  user.roles = user.roles && typeof user.roles === 'string' ? JSON.parse(user.roles) : (user.roles || []);
  if (!user.main_role) user.main_role = user.role;
  if (!user.roles || user.roles.length === 0) user.roles = [user.role];
  user.units = effectiveUnitsForUser(user);
  return user;
}

/** Login with username or email (Gmail / company email). */
export async function getUserByLogin(identifier) {
  const raw = (identifier || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  try {
    let result = await pool.query(
      `SELECT id, first_name, last_name, username, email, password, role,
              main_role, roles, units, unit, position, status, phone, department,
              suspension_reason, unsuspend_reason, unsuspend_ack, avatar_url, company
       FROM users
       WHERE LOWER(username) = $1 AND deleted_at IS NULL`,
      [lower]
    );
    if (!result.rows[0]) {
      result = await pool.query(
        `SELECT id, first_name, last_name, username, email, password, role,
                main_role, roles, units, unit, position, status, phone, department,
                suspension_reason, unsuspend_reason, unsuspend_ack, avatar_url, company
         FROM users
         WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
        [lower]
      );
    }
    return normalizeLoginUserRow(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user by login:', error.stack);
    throw error;
  }
}

export async function getUserByUsername(username) {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, username, email, password, role, 
              main_role, roles, units, unit, position 
       FROM users 
       WHERE username = $1 AND deleted_at IS NULL`, 
      [username]
    );
    return normalizeLoginUserRow(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error.stack);
    throw error;
  }
}

export async function getUsers(company = null) {
  try {
    const params = [];
    const companyClause = company ? (params.push(company), `AND company = $${params.length}`) : '';
    const result = await pool.query(
      `SELECT id, first_name, last_name, username, email, role, main_role, roles, units, unit, position, avatar_url, created_at, company
       FROM users
       WHERE deleted_at IS NULL
         AND LOWER(username) <> 'superadmin'
         ${companyClause}
       ORDER BY created_at DESC`,
      params
    );
    return result.rows.map(user => {
      // Parse JSONB fields
      user.roles = user.roles && typeof user.roles === 'string' ? JSON.parse(user.roles) : (user.roles || []);
      user.units = user.units && typeof user.units === 'string' ? JSON.parse(user.units) : (user.units || []);
      // Ensure main_role is set
      if (!user.main_role) {
        user.main_role = user.role;
      }
      // Ensure roles array includes main_role
      if (!user.roles || user.roles.length === 0) {
        user.roles = [user.role];
      }
      return user;
    });
  } catch (error) {
    console.error('Error fetching users:', error.stack);
    throw error;
  }
}

export async function getApprovers() {
  try {
    const realm = await getRealmApprovers();
    const ids = [...new Set([...(realm.material_user_ids || []), ...(realm.cash_user_ids || [])])];
    if (!ids.length) return [];
    const result = await pool.query(
      `SELECT id, first_name, last_name, role, main_role, roles, units, unit, position
       FROM users
       WHERE deleted_at IS NULL AND id = ANY($1::int[])
       ORDER BY last_name ASC, first_name ASC`,
      [ids]
    );
    const material = new Set(realm.material_user_ids.map(Number));
    const cash = new Set(realm.cash_user_ids.map(Number));
    return result.rows.map((row) => ({
      id: row.id,
      fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'User',
      role: row.role,
      position: row.position,
      unit: row.unit,
      canApproveMaterial: material.has(Number(row.id)),
      canApproveCash: cash.has(Number(row.id)),
    }));
  } catch (error) {
    console.error('Error fetching approvers:', error.stack);
    throw error;
  }
}

/** Default username = email; append suffix if taken. */
async function usernameFromEmail(client, email) {
  const base = email.trim().toLowerCase();
  let username = base;
  let counter = 1;
  while (true) {
    const exists = await client.query(
      'SELECT id FROM users WHERE LOWER(username) = $1 AND deleted_at IS NULL',
      [username]
    );
    if (exists.rowCount === 0) return username;
    const at = base.indexOf('@');
    if (at > 0) {
      username = `${base.slice(0, at)}${counter}${base.slice(at)}`;
    } else {
      username = `${base}${counter}`;
    }
    counter++;
  }
}

export async function createUser(firstName, lastName, email, role, userId, ip, options = {}) {
  const client = await pool.connect();
  let committed = false;
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const manual = typeof options.password === 'string' ? options.password.trim() : '';
    const useAutoGenerate = options.useAutoGenerate === true;
    const sendEmail = options.sendEmail === true;
    const selectedUnit = typeof options.unit === 'string' && options.unit.trim()
      ? options.unit.trim().toLowerCase()
      : null;
    const selectedPosition = typeof options.position === 'string' && options.position.trim()
      ? options.position.trim()
      : null;
    const selectedUnits = capUserUnits([
      ...(selectedUnit ? [selectedUnit] : []),
      ...(Array.isArray(options.units) ? options.units : []),
    ]);
    const targetCompany = typeof options.company === 'string' && options.company.trim() ? options.company.trim() : 'CW';

    let plainPassword;
    if (useAutoGenerate) {
      plainPassword = generatePassword();
    } else {
      if (!manual || manual.length < 6) {
        throw new Error('Password is required (at least 6 characters)');
      }
      plainPassword = manual;
    }

    await client.query('BEGIN');
    const username = await usernameFromEmail(client, normalizedEmail);
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const normalizedRole = normalizeSystemRole(role);
    if (!normalizedRole) throw new Error(invalidRoleMessage(role));
    if (normalizedRole === 'system_admin') {
      throw new Error('System Admin cannot be assigned to other users');
    }

    const activeEmail = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL',
      [normalizedEmail]
    );
    if (activeEmail.rowCount > 0) {
      throw new Error('Email or username already exists');
    }

    const deletedRow = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 1',
      [normalizedEmail]
    );

    let result;
    if (deletedRow.rowCount > 0) {
      const reactivateId = deletedRow.rows[0].id;
      const defaultUnits = selectedUnits.length ? selectedUnits : defaultUnitsForRole(normalizedRole);
      result = await client.query(
        `UPDATE users SET
          first_name = $1,
          last_name = $2,
          username = $3,
          email = $4,
          password = $5,
          role = $6,
          main_role = $6,
          roles = jsonb_build_array($7::text),
          units = $8::jsonb,
          unit = $9,
          position = $10,
          company = $12,
          deleted_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING *`,
        [
          firstName.trim(),
          lastName.trim(),
          username,
          normalizedEmail,
          hashedPassword,
          normalizedRole,
          normalizedRole,
          JSON.stringify(defaultUnits),
          defaultUnits[0] || selectedUnit,
          selectedPosition,
          reactivateId,
          targetCompany,
        ]
      );
      await insertAuditLog(client, userId, 'reactivate_user', ip, {
        username,
        role: normalizedRole,
        email: normalizedEmail,
        reactivated_user_id: reactivateId,
      });
    } else {
      const defaultUnits = selectedUnits.length ? selectedUnits : defaultUnitsForRole(normalizedRole);
      result = await client.query(
        `INSERT INTO users (first_name, last_name, username, email, password, role, main_role, roles, units, unit, position, created_at, deleted_at, company)
         VALUES ($1, $2, $3, $4, $5, $6, $6, jsonb_build_array($7::text), $8::jsonb, $9, $10, CURRENT_TIMESTAMP, NULL, $11) RETURNING *`,
        [
          firstName.trim(),
          lastName.trim(),
          username,
          normalizedEmail,
          hashedPassword,
          normalizedRole,
          normalizedRole,
          JSON.stringify(defaultUnits),
          defaultUnits[0] || selectedUnit,
          selectedPosition,
          targetCompany,
        ]
      );
      await insertAuditLog(client, userId, 'create_user', ip, {
        username,
        role: normalizedRole,
        email: normalizedEmail,
      });
    }

    await client.query('COMMIT');
    committed = true;

    const createdUser = {
      ...result.rows[0],
      password: plainPassword,
      emailSent: false,
      emailWarning: null,
    };

    try {
      const { ensureUserChatMembership } = await import('./services/chatInit.js');
      await ensureUserChatMembership(createdUser.id, [normalizedRole]);
    } catch (chatErr) {
      console.warn('[chat] ensure membership for new user failed:', chatErr.message);
    }

    if (sendEmail) {
      try {
        const { sendUserCredentials } = await import('./emailService.js');
        const mailResult = await sendUserCredentials(normalizedEmail, username, plainPassword);
        createdUser.emailSent = mailResult?.ok === true;
        if (!createdUser.emailSent) {
          createdUser.emailWarning = mailResult?.error || 'Email could not be sent';
          console.warn('[createUser] welcome email failed:', createdUser.emailWarning);
        }
      } catch (emailErr) {
        createdUser.emailWarning = emailErr?.message || 'Email could not be sent';
        console.warn('[createUser] welcome email error (user still created):', createdUser.emailWarning);
      }
    }

    try {
      const { queueUserForHrReview } = await import('./utils/hrShared.js');
      await queueUserForHrReview(createdUser);
    } catch (hrErr) {
      console.warn('[createUser] HR pending queue failed:', hrErr.message);
    }

    return createdUser;
  } catch (error) {
    if (!committed) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* ignore */
      }
    }
    console.error('Error creating user:', error.stack);
    if (error.code === '23505') {
      throw new Error('Email or username already exists');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function resetUserPassword(userId, currentUserId, ip, options = {}) {
  const client = await pool.connect();
  try {
    const manual = typeof options.password === 'string' ? options.password.trim() : '';
    const sendEmail = options.sendEmail === true;

    let plainPassword;
    if (manual) {
      if (manual.length < 6) throw new Error('Password must be at least 6 characters');
      plainPassword = manual;
    } else {
      plainPassword = generatePassword();
    }

    await client.query('BEGIN');
    const userResult = await client.query(
      'SELECT email, username FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (userResult.rowCount === 0) throw new Error('User not found');
    const { email, username } = userResult.rows[0];

    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    await client.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);
    await insertAuditLog(client, currentUserId, 'reset_password', ip, {
      user_id: userId,
      username,
      manual: !!manual,
      emailed: sendEmail,
    });

    let emailSent = false;
    if (sendEmail) {
      try {
        const { sendResetPassword } = await import('./emailService.js');
        await sendResetPassword(email, username, plainPassword);
        emailSent = true;
      } catch (emailErr) {
        console.warn('[resetUserPassword] email failed:', emailErr.message);
      }
    }

    await client.query('COMMIT');
    return {
      message: emailSent
        ? 'Password reset and email sent'
        : manual
          ? 'Password set successfully'
          : 'Password reset successfully',
      password: plainPassword,
      username,
      email,
      emailSent,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting password:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserRole(userId, role, currentUserId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT role AS old_role, main_role, username, first_name, last_name FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (current.rowCount === 0) throw new Error('User not found');
    const normalizedRole = normalizeSystemRole(role);
    if (!normalizedRole) throw new Error(invalidRoleMessage(role));
    if (normalizedRole === 'system_admin') throw new Error('System Admin cannot be assigned to other users');
    if (isSystemAdminAccount(current.rows[0])) throw new Error('Cannot change the System Admin account');
    const old_role = current.rows[0].old_role;
    const username = current.rows[0].username;
    // Step 1: update scalar role fields
    await client.query(
      `UPDATE users 
          SET role = $1,
              main_role = $1
        WHERE id = $2`,
      [normalizedRole, userId]
    );

    // Step 2: update roles JSONB array using the column value (no param type confusion)
    await client.query(
      `UPDATE users
          SET roles = jsonb_build_array(role)
        WHERE id = $1`,
      [userId]
    );

    const existingUnitsRow = await client.query(
      'SELECT units FROM users WHERE id = $1',
      [userId]
    );
    const existingUnits = parseUserUnitsArray(existingUnitsRow.rows[0]?.units);
    const roleUnits = defaultUnitsForRole(normalizedRole);
    const mergedUnits = [...new Set([...existingUnits, ...roleUnits])];
    await client.query(`UPDATE users SET units = $1::jsonb WHERE id = $2`, [
      JSON.stringify(mergedUnits),
      userId,
    ]);

    const result = await client.query(
      `SELECT id, username, first_name, last_name, email, role, main_role, roles, units, unit, position
         FROM users
        WHERE id = $1`,
      [userId]
    );
    await insertAuditLog(client, currentUserId, 'update_user_role', ip, {
      user_id: userId,
      username,
      old_role,
      new_role: normalizedRole,
    });
    await client.query('COMMIT');
    try {
      const { ensureUserChatMembership } = await import('./services/chatInit.js');
      await ensureUserChatMembership(userId, [normalizedRole]);
    } catch (e) {
      console.warn('[chat] ensure membership after role update failed:', e.message);
    }
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user role:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUser(userId, updates, currentUserId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { first_name, last_name, email, role, main_role, roles, units, unit, position } = updates;
    const normalizedRole = role !== undefined ? normalizeSystemRole(role) : undefined;
    if (role !== undefined && !normalizedRole) {
      throw new Error(invalidRoleMessage(role));
    }
    const normalizedMainRole = main_role !== undefined ? normalizeSystemRole(main_role) : undefined;
    if (main_role !== undefined && !normalizedMainRole) {
      throw new Error(invalidRoleMessage(main_role));
    }
    if (roles && Array.isArray(roles)) {
      for (const r of roles) {
        if (!normalizeSystemRole(r)) {
          throw new Error(invalidRoleMessage(r));
        }
      }
    }
    if (email) {
      const emailCheck = await client.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [email.trim().toLowerCase(), userId]
      );
      if (emailCheck.rowCount > 0) {
        throw new Error('Email already exists');
      }
    }
    const current = await client.query(
      'SELECT first_name AS old_first_name, last_name AS old_last_name, email AS old_email, role AS old_role, main_role AS old_main_role, roles AS old_roles, units AS old_units, unit AS old_unit, position AS old_position, username FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (current.rowCount === 0) throw new Error('User not found');
    const old_values = current.rows[0];
    if (isSystemAdminAccount(old_values)) {
      throw new Error('Cannot edit the System Admin account');
    }
    if (normalizedRole === 'system_admin' || normalizedMainRole === 'system_admin') {
      throw new Error('System Admin cannot be assigned to other users');
    }
    delete old_values.username;
    
    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    if (first_name !== undefined) {
      updateFields.push(`first_name = $${paramIndex++}`);
      updateValues.push(first_name.trim());
    }
    if (last_name !== undefined) {
      updateFields.push(`last_name = $${paramIndex++}`);
      updateValues.push(last_name.trim());
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      updateValues.push(email.trim().toLowerCase());
    }
    if (unit !== undefined) {
      updateFields.push(`unit = $${paramIndex++}`);
      updateValues.push(unit ? String(unit).trim().toLowerCase() : null);
    }
    if (position !== undefined) {
      updateFields.push(`position = $${paramIndex++}`);
      updateValues.push(position ? String(position).trim() : null);
    }
    if (normalizedRole !== undefined) {
      updateFields.push(`role = $${paramIndex++}`);
      updateValues.push(normalizedRole);
      updateFields.push(`main_role = $${paramIndex++}`);
      updateValues.push(normalizedMainRole ?? normalizedRole);
      updateFields.push(`roles = $${paramIndex++}`);
      updateValues.push(JSON.stringify([normalizedRole]));
    } else if (normalizedMainRole !== undefined) {
      updateFields.push(`main_role = $${paramIndex++}`);
      updateValues.push(normalizedMainRole);
    }
    if (roles !== undefined && Array.isArray(roles)) {
      updateFields.push(`roles = $${paramIndex++}`);
      updateValues.push(JSON.stringify(roles));
    }
    let unitsToSave = units;
    if (units !== undefined && Array.isArray(units)) {
      unitsToSave = capUserUnits(units);
    } else if (normalizedRole !== undefined) {
      const roleUnits = defaultUnitsForRole(normalizedRole);
      if (roleUnits.length) {
        const oldUnits = old_values.old_units;
        const parsed =
          oldUnits && typeof oldUnits === 'string'
            ? JSON.parse(oldUnits)
            : Array.isArray(oldUnits)
              ? oldUnits
              : [];
        unitsToSave = [...new Set([...parsed, ...roleUnits])];
      }
    }
    if (unitsToSave !== undefined && Array.isArray(unitsToSave)) {
      updateFields.push(`units = $${paramIndex++}`);
      updateValues.push(JSON.stringify(unitsToSave));
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(userId);
    
    const result = await client.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      updateValues
    );
    await insertAuditLog(client, currentUserId, 'update_user', ip, {
      user_id: userId,
      username: current.rows[0].username,
      old_values,
      new_values: { first_name, last_name, email, role, main_role, roles, units, unit, position }
    });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating user:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteUser(userId, currentUserId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (userId === currentUserId) {
      throw new Error('Cannot delete your own account');
    }
    const userResult = await client.query(
      'SELECT first_name, last_name, username, email, role, main_role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (userResult.rowCount === 0) throw new Error('User not found');
    const deletedUser = userResult.rows[0];
    if (isSystemAdminAccount(deletedUser)) {
      throw new Error('Cannot delete the System Admin account');
    }
    await client.query('UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
    await insertAuditLog(client, currentUserId, 'delete_user', ip, {
      user_id: userId,
      deleted_user: {
        username: deletedUser.username,
        email: deletedUser.email,
        first_name: deletedUser.first_name,
        last_name: deletedUser.last_name
      }
    });
    await client.query('COMMIT');
    return { message: 'User deleted successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting user:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function getSupervisors() {
  try {
    const result = await pool.query('SELECT * FROM supervisors WHERE deleted_at IS NULL ORDER BY name ASC');
    return result.rows;
  } catch (error) {
    console.error('Error fetching supervisors:', error.stack);
    throw error;
  }
}

export async function addSupervisor(supervisorData) {
  try {
    const { name, email } = supervisorData;
    if (!name || !email) {
      throw new Error('Name and email are required');
    }
    const result = await pool.query(
      'INSERT INTO supervisors (name, email, created_at, deleted_at) VALUES ($1, $2, CURRENT_TIMESTAMP, NULL) RETURNING *',
      [name.trim(), email.trim().toLowerCase()]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error adding supervisor:', error.stack);
    if (error.code === '23505') {
      throw new Error('Email already exists');
    }
    throw error;
  }
}

export async function updateSupervisor(supervisorId, supervisorData) {
  try {
    const { name, email } = supervisorData;
    if (!name || !email) {
      throw new Error('Name and email are required');
    }
    const result = await pool.query(
      'UPDATE supervisors SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND deleted_at IS NULL RETURNING *',
      [name.trim(), email.trim().toLowerCase(), supervisorId]
    );
    if (result.rowCount === 0) throw new Error('Supervisor not found');
    return result.rows[0];
  } catch (error) {
    console.error('Error updating supervisor:', error.stack);
    if (error.code === '23505') {
      throw new Error('Email already exists');
    }
    throw error;
  }
}

export async function deleteSupervisor(supervisorId) {
  try {
    const result = await pool.query('UPDATE supervisors SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING *', [supervisorId]);
    if (result.rowCount === 0) throw new Error('Supervisor not found');
    return { message: 'Supervisor deleted' };
  } catch (error) {
    console.error('Error deleting supervisor:', error.stack);
    throw error;
  }
}

export async function insertAuditLog(userId, action, ip = 'unknown', details = null) {
  let actualUserId = userId;
  let actualAction = action;
  let actualIp = ip;
  let actualDetails = details;

  if (userId && typeof userId === 'object' && userId.query && typeof userId.query === 'function') {
    const client = userId;
    actualUserId = action;
    actualAction = ip;
    actualIp = details || 'unknown';
    actualDetails = arguments[4] || null;
    try {
      // SAVEPOINT so a failed audit insert does not abort the parent transaction
      await client.query('SAVEPOINT audit_log_sp');
      await client.query(
        `INSERT INTO audit_logs (user_id, action, ip_address, details, timestamp, company)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, COALESCE((SELECT company FROM users WHERE id = $1), 'CW'))`,
        [actualUserId, actualAction, actualIp, actualDetails ? JSON.stringify(actualDetails) : null]
      );
      await client.query('RELEASE SAVEPOINT audit_log_sp');
      return;
    } catch (error) {
      try {
        await client.query('ROLLBACK TO SAVEPOINT audit_log_sp');
      } catch (_) {
        /* ignore */
      }
      console.error('Audit log failed (transaction client):', error.message);
      return;
    }
  }

  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, details, timestamp, company)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, COALESCE((SELECT company FROM users WHERE id = $1), 'CW'))`,
      [actualUserId, actualAction, actualIp, actualDetails ? JSON.stringify(actualDetails) : null]
    );
  } catch (error) {
    console.error('Audit log failed (non-blocking):', error.message);
  }
}

export async function getAuditLogs(company = null) {
  try {
    const params = [];
    let where = '';
    if (company) { params.push(company); where = `WHERE al.company = $${params.length}`; }
    const result = await pool.query(`
      SELECT
        al.id,
        al.user_id,
        al.action,
        al.ip_address,
        al.details::text AS details_text,
        al.timestamp,
        al.company,
        COALESCE(u.first_name || ' ' || u.last_name, 'System') AS full_name,
        COALESCE(u.username, 'system') AS username
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id AND u.deleted_at IS NULL
      ${where}
      ORDER BY al.timestamp DESC
    `, params);
    const safeParse = (text) => {
      if (!text || text === 'null') return {};
      try {
        const parsed = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? parsed : { raw: text };
      } catch (e) {
        return { raw: text };
      }
    };
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      action: row.action,
      ip_address: row.ip_address,
      timestamp: row.timestamp,
      full_name: row.user_id ? row.full_name.trim() : 'System',
      username: row.username,
      details: safeParse(row.details_text)
    }));
  } catch (error) {
    console.error('getAuditLogs error:', error.message);
    return [];
  }
}

export async function getTodayLoginStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE action = 'login') AS login_count,
        COUNT(DISTINCT user_id) FILTER (WHERE action = 'login') AS active_users
      FROM audit_logs
      WHERE DATE(timestamp) = $1 AND action = 'login' AND user_id IS NOT NULL
    `, [today]);
    const row = result.rows[0];
    return {
      loginsToday: parseInt(row.login_count) || 0,
      activeUsersToday: parseInt(row.active_users) || 0
    };
  } catch (error) {
    console.error('Today stats error:', error.message);
    return { loginsToday: 0, activeUsersToday: 0 };
  }
}

export async function getCategories() {
  try {
    const allCategories = await pool.query('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name ASC');
    const itemsResult = await pool.query('SELECT category_id, COUNT(*) as count FROM items WHERE category_id IS NOT NULL AND deleted_at IS NULL GROUP BY category_id');
    const categoryCounts = {};
    itemsResult.rows.forEach(item => {
      categoryCounts[item.category_id] = parseInt(item.count, 10);
    });
    const categoryMap = {};
    const roots = [];
    allCategories.rows.forEach(cat => {
      cat.subcategories = [];
      cat.itemCount = categoryCounts[cat.id] || 0;
      categoryMap[cat.id] = cat;
      if (!cat.parent_id) {
        roots.push(cat);
      } else {
        if (categoryMap[cat.parent_id]) {
          categoryMap[cat.parent_id].subcategories.push(cat);
        }
      }
    });
    roots.forEach(root => {
      root.totalItems = root.subcategories.reduce((sum, sub) => sum + (sub.itemCount || 0), 0);
    });
    return roots;
  } catch (error) {
    console.error('Error fetching categories:', error.stack);
    throw error;
  }
}

export async function addCategory(categoryData, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, description, subcategories = [] } = categoryData;
    const mainResult = await client.query(
      'INSERT INTO categories (name, description, parent_id, created_at, deleted_at) VALUES ($1, $2, NULL, CURRENT_TIMESTAMP, NULL) RETURNING *',
      [name, description || null]
    );
    const mainId = mainResult.rows[0].id;
    for (const sub of subcategories) {
      await client.query(
        'INSERT INTO categories (name, description, parent_id, created_at, deleted_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL)',
        [sub.name, sub.description || null, mainId]
      );
    }
    await insertAuditLog(client, userId, 'create_category', ip, { category_name: name, sub_count: subcategories.length });
    await client.query('COMMIT');
    return mainResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding category:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateCategory(categoryId, categoryData, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, description, subcategories = [] } = categoryData;
    await client.query(
      'UPDATE categories SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND deleted_at IS NULL',
      [name, description || null, categoryId]
    );
    const existingSubs = await client.query('SELECT id FROM categories WHERE parent_id = $1 AND deleted_at IS NULL', [categoryId]);
    const existingIds = existingSubs.rows.map(r => r.id);
    const providedIds = subcategories.filter(s => s.id).map(s => parseInt(s.id));
    const toDelete = existingIds.filter(id => !providedIds.includes(id));
    for (const delId of toDelete) {
      await client.query('UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [delId]);
    }
    for (const sub of subcategories) {
      if (sub.id) {
        await client.query(
          'UPDATE categories SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND deleted_at IS NULL',
          [sub.name, sub.description || null, sub.id]
        );
      } else {
        await client.query(
          'INSERT INTO categories (name, description, parent_id, created_at, deleted_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP, NULL)',
          [sub.name, sub.description || null, categoryId]
        );
      }
    }
    await insertAuditLog(client, userId, 'update_category', ip, { category_id: categoryId, category_name: name, sub_count: subcategories.length });
    await client.query('COMMIT');
    const all = await pool.query('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name ASC');
    const itemCounts = await pool.query('SELECT category_id, COUNT(*) as count FROM items WHERE category_id IS NOT NULL AND deleted_at IS NULL GROUP BY category_id');
    const countsMap = {};
    itemCounts.rows.forEach(r => (countsMap[r.category_id] = parseInt(r.count, 10)));
    const map = {};
    const roots = [];
    all.rows.forEach(cat => {
      cat.subcategories = [];
      cat.itemCount = countsMap[cat.id] || 0;
      map[cat.id] = cat;
      if (!cat.parent_id) roots.push(cat);
      else if (map[cat.parent_id]) map[cat.parent_id].subcategories.push(cat);
    });
    roots.forEach(root => {
      root.totalItems = root.subcategories.reduce((sum, sub) => sum + (sub.itemCount || 0), 0);
    });
    const updatedRoot = roots.find(r => r.id === categoryId) || map[categoryId];
    return updatedRoot;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating category:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteCategory(categoryId, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await pool.query('SELECT name FROM categories WHERE id = $1 AND deleted_at IS NULL', [categoryId]);
    if (current.rowCount === 0) throw new Error('Category not found');
    await client.query('UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *', [categoryId]);
    await insertAuditLog(client, userId, 'delete_category', ip, { category_id: categoryId, category_name: current.rows[0]?.name });
    await client.query('COMMIT');
    return { message: 'Category deleted' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting category:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function getItems(company = null) {
  try {
    const params = [];
    let companyClause = '';
    if (company) { params.push(company); companyClause = `AND i.company = $${params.length}`; }
    const result = await pool.query(`
      SELECT i.*, c.name AS category_name, COALESCE(v.name, i.vendor_name) AS vendor_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.deleted_at IS NULL ${companyClause}
      ORDER BY i.created_at DESC
    `, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching items:', error.stack);
    throw error;
  }
}

export async function addItem(itemData, userId, ip, company = 'CW') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { name, description, category_id, quantity, low_stock_threshold, vendor_id, vendor_name, unit_price, receipt_images, serial_numbers } = itemData;
    const parsedQuantity = parseInt(quantity, 10);
    let parsedLowStockThreshold = low_stock_threshold ? parseInt(low_stock_threshold, 10) : 5;
    if (isNaN(parsedLowStockThreshold) || parsedLowStockThreshold < 0) parsedLowStockThreshold = 5;
    const parsedUnitPrice = unit_price ? parseFloat(unit_price) : null;
    const parsedCategoryId = category_id ? parseInt(category_id, 10) : null;
    const parsedVendorId = vendor_id ? parseInt(vendor_id, 10) : null;
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      throw new Error('Quantity is required and must be non-negative');
    }
    if (unit_price && (isNaN(parsedUnitPrice) || parsedUnitPrice < 0)) {
      throw new Error('Unit price must be non-negative if provided');
    }
    const result = await client.query(
      'INSERT INTO items (name, description, category_id, vendor_id, quantity, low_stock_threshold, vendor_name, unit_price, receipt_images, created_at, updated_at, deleted_at, company) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, NULL, NULL, $10) RETURNING *',
      [name, description || null, parsedCategoryId, parsedVendorId, parsedQuantity, parsedLowStockThreshold, vendor_name || null, parsedUnitPrice, receipt_images || JSON.stringify([]), company || 'CW']
    );
    const itemId = result.rows[0].id;
    if (Array.isArray(serial_numbers) && serial_numbers.length > 0) {
      for (const sn of serial_numbers) {
        await client.query(
          'INSERT INTO item_serial_numbers (item_id, serial_number, status) VALUES ($1, $2, $3)',
          [itemId, sn.trim(), 'in_stock']
        );
      }
    }
    await insertAuditLog(client, userId, 'create_item', ip, { item_name: name, serial_count: Array.isArray(serial_numbers) ? serial_numbers.length : 0 });
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding item:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateItem(itemId, itemData, userId, ip) {
  const client = await pool.connect();
  let prevQuantity = 0;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query('SELECT quantity, low_stock_threshold, name AS item_name FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [itemId]);
    if (currentResult.rowCount === 0) throw new Error('Item not found or deleted');
    prevQuantity = parseInt(currentResult.rows[0].quantity, 10);
    const item_name = currentResult.rows[0].item_name;
    const { name, description, category_id, quantity, low_stock_threshold, vendor_id, vendor_name, unit_price, update_reason, receipt_images: providedReceiptImages, serial_numbers } = itemData;
    if (!update_reason || !update_reason.trim()) {
      throw new Error('Update reason is required');
    }
    const itemCurrentResult = await client.query('SELECT update_reasons, receipt_images FROM items WHERE id = $1', [itemId]);
    let currentReasons = itemCurrentResult.rows[0].update_reasons || '';
    let currentReceiptImages = [];
    const receiptImagesValue = itemCurrentResult.rows[0].receipt_images;
    if (receiptImagesValue && typeof receiptImagesValue === 'string' && receiptImagesValue.trim() !== '') {
      try {
        currentReceiptImages = JSON.parse(receiptImagesValue);
      } catch (parseError) {
        console.warn('Failed to parse existing receipt_images, defaulting to empty array:', parseError);
      }
    }
    const timestamp = new Date().toLocaleString();
    const newReasonEntry = `${update_reason} at ${timestamp}`;
    const newReasons = currentReasons ? `${currentReasons} | ${newReasonEntry}` : newReasonEntry;
    let newReceiptImagesArray = [...currentReceiptImages];
    if (providedReceiptImages) {
      try {
        const parsedProvided = JSON.parse(providedReceiptImages);
        const newPaths = parsedProvided.filter(path => !currentReceiptImages.some(img => img.path === path));
        newPaths.forEach(newPath => {
          newReceiptImagesArray.push({
            path: newPath,
            uploaded_at: new Date().toISOString()
          });
        });
      } catch (e) {
        if (!currentReceiptImages.some(img => img.path === providedReceiptImages)) {
          newReceiptImagesArray.push({
            path: providedReceiptImages,
            uploaded_at: new Date().toISOString()
          });
        }
      }
    }
    const parsedQuantity = parseInt(quantity, 10);
    let parsedLowStockThreshold = low_stock_threshold ? parseInt(low_stock_threshold, 10) : null;
    const parsedUnitPrice = unit_price !== undefined ? (unit_price ? parseFloat(unit_price) : null) : null;
    const parsedCategoryId = category_id ? parseInt(category_id, 10) : null;
    const parsedVendorId = vendor_id ? parseInt(vendor_id, 10) : null;
    if (isNaN(parsedQuantity) || parsedQuantity < 0) throw new Error('Quantity must be non-negative');
    if (parsedLowStockThreshold !== null && (isNaN(parsedLowStockThreshold) || parsedLowStockThreshold < 0)) throw new Error('Low stock threshold must be non-negative');
    if (parsedUnitPrice !== null && (isNaN(parsedUnitPrice) || parsedUnitPrice < 0)) throw new Error('Unit price must be non-negative');
    const result = await client.query(
      'UPDATE items SET name = $1, description = $2, category_id = $3, vendor_id = $4, quantity = $5, low_stock_threshold = COALESCE($6, low_stock_threshold), vendor_name = $7, unit_price = $8, receipt_images = $9, update_reasons = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 AND deleted_at IS NULL RETURNING *',
      [name, description || null, parsedCategoryId, parsedVendorId, parsedQuantity, parsedLowStockThreshold, vendor_name || null, parsedUnitPrice, JSON.stringify(newReceiptImagesArray), newReasons, itemId]
    );
    if (result.rowCount === 0) throw new Error('Item not found or deleted');
    if (Array.isArray(serial_numbers)) {
      await client.query('DELETE FROM item_serial_numbers WHERE item_id = $1', [itemId]);
      for (const sn of serial_numbers) {
        await client.query(
          'INSERT INTO item_serial_numbers (item_id, serial_number, status) VALUES ($1, $2, $3) ON CONFLICT (serial_number) DO NOTHING',
          [itemId, sn.trim(), 'in_stock']
        );
      }
    }
    let auditDetails = {
      item_id: itemId,
      item_name: name || item_name,
      previous_item_name: item_name,
      reason: update_reason,
    };
    if (parsedQuantity !== prevQuantity) {
      auditDetails.old_quantity = prevQuantity;
      auditDetails.new_quantity = parsedQuantity;
      auditDetails.quantity_changed = true;
    }
    if (name && name !== item_name) {
      auditDetails.old_name = item_name;
      auditDetails.new_name = name;
    }
    await insertAuditLog(client, userId, 'update_item', ip, auditDetails);
    await client.query('COMMIT');
    const fullItem = await client.query(`
      SELECT i.*, c.name AS category_name, COALESCE(v.name, i.vendor_name) AS vendor_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.id = $1
    `, [itemId]);
    return fullItem.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating item:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteItem(itemId, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const itemResult = await client.query('SELECT name, quantity FROM items WHERE id = $1 AND deleted_at IS NULL', [itemId]);
    if (itemResult.rowCount === 0) throw new Error('Item not found or already deleted');
    const item_name = itemResult.rows[0].name;
    const deleted_quantity = itemResult.rows[0].quantity;
    await client.query('UPDATE items SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING *', [itemId]);
    await insertAuditLog(client, userId, 'delete_item', ip, { item_id: itemId, item_name, deleted_quantity });
    await client.query('COMMIT');
    return { message: 'Item deleted' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting item:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function getSerialNumbersForItem(itemId) {
  try {
    const result = await pool.query(`
      SELECT isn.*, i.name AS item_name
      FROM item_serial_numbers isn
      JOIN items i ON isn.item_id = i.id
      WHERE isn.item_id = $1
      ORDER BY isn.created_at DESC
    `, [itemId]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching serial numbers:', error.stack);
    throw error;
  }
}

export async function getItemsOut() {
  try {
    const result = await pool.query(`
      SELECT io.*, COALESCE(i.name, 'Unknown Item') AS item_name, COALESCE(c.name, 'Unknown Category') AS category_name
      FROM items_out io
      LEFT JOIN items i ON io.item_id = i.id
      LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY io.date_time DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Error fetching items out:', error.stack);
    throw error;
  }
}

export async function issueItem(issueData, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { personName, itemId, quantity: issueQuantity, serial_numbers } = issueData;
    if (!personName || !itemId || !issueQuantity) {
      throw new Error('Missing required fields');
    }
    const parsedIssueQuantity = parseInt(issueQuantity, 10);
    if (parsedIssueQuantity <= 0) throw new Error('Quantity must be positive');
    const itemCheck = await client.query(
      'SELECT quantity, low_stock_threshold, name FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [itemId]
    );
    if (itemCheck.rowCount === 0) throw new Error('Item not found or deleted');
    const availableQuantity = parseInt(itemCheck.rows[0].quantity, 10);
    if (parsedIssueQuantity > availableQuantity) {
      throw new Error(`Insufficient stock. Only ${availableQuantity} units available.`);
    }
    if (Array.isArray(serial_numbers) && serial_numbers.length > 0) {
      if (serial_numbers.length !== parsedIssueQuantity) {
        throw new Error('Number of serial numbers must match issued quantity');
      }
      for (const sn of serial_numbers) {
        const snCheck = await client.query(
          'SELECT id, status FROM item_serial_numbers WHERE item_id = $1 AND serial_number = $2 FOR UPDATE',
          [itemId, sn]
        );
        if (snCheck.rowCount === 0) throw new Error(`Serial number ${sn} not found`);
        if (snCheck.rows[0].status !== 'in_stock') throw new Error(`Serial number ${sn} is not available`);
      }
    }
    const result = await client.query(
      'INSERT INTO items_out (person_name, item_id, quantity, date_time) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *',
      [personName, itemId, parsedIssueQuantity]
    );
    await client.query(
      'UPDATE items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [parsedIssueQuantity, itemId]
    );
    if (Array.isArray(serial_numbers) && serial_numbers.length > 0) {
      for (const sn of serial_numbers) {
        await client.query(
          'UPDATE item_serial_numbers SET status = $1, issued_to = $2, issued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE item_id = $3 AND serial_number = $4',
          ['issued', personName, itemId, sn]
        );
      }
    }
    const updatedItemResult = await client.query('SELECT i.*, c.name AS category_name, COALESCE(v.name, i.vendor_name) AS vendor_name FROM items i LEFT JOIN categories c ON i.category_id = c.id LEFT JOIN vendors v ON i.vendor_id = v.id WHERE i.id = $1', [itemId]);
    const itemDetails = updatedItemResult.rows[0];
    await insertAuditLog(client, userId, 'issue_item', ip, { item_id: itemId, item_name: itemCheck.rows[0].name, quantity: parsedIssueQuantity, person_name: personName, serial_numbers });
    await client.query('COMMIT');
    return { ...result.rows[0], item: itemDetails };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in issueItem:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function getLowStockItems() {
  try {
    const result = await pool.query(`
      SELECT i.*, c.name AS category_name, COALESCE(v.name, i.vendor_name) AS vendor_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      LEFT JOIN vendors v ON i.vendor_id = v.id
      WHERE i.quantity <= COALESCE(i.low_stock_threshold, 5) AND i.deleted_at IS NULL
      ORDER BY i.created_at DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Error fetching low stock items:', error.stack);
    throw error;
  }
}

export async function getDashboardStats() {
  try {
    const [itemsResult, categoriesResult, itemsOutResult, lowStockResult, requestsResult] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM items WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) AS count FROM categories WHERE deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) AS count FROM items_out'),
      pool.query('SELECT COUNT(*) AS count FROM items WHERE quantity <= COALESCE(low_stock_threshold, 5) AND deleted_at IS NULL'),
      pool.query('SELECT COUNT(*) AS count FROM requests WHERE status = $1 AND deleted_at IS NULL', ['pending']),
    ]);
    return {
      totalItems: parseInt(itemsResult.rows[0].count, 10),
      totalCategories: parseInt(categoriesResult.rows[0].count, 10),
      itemsOut: parseInt(itemsOutResult.rows[0].count, 10),
      lowStockItems: parseInt(lowStockResult.rows[0].count, 10),
      pendingRequests: parseInt(requestsResult.rows[0].count, 10),
    };
  } catch (error) {
    console.error('Error fetching dashboard stats:', error.stack);
    throw error;
  }
}

export async function createRequest(requestData, selectedApproverIds, requestType = 'material_request', userId, ip, lineItems = [], ticket_id = null) {
  if (!Array.isArray(selectedApproverIds) || selectedApproverIds.length === 0) {
    throw new Error('At least one approver ID is required');
  }
  // Validate selected approvers against the Realm list for this request type.
  if (requestType === 'material_request' || requestType === 'item_return' || requestType === 'cash_request') {
    const workflowConfig = await getWorkflowConfig();
    if (requestType !== 'cash_request') {
      const required = workflowConfig.material?.required_approvers_count ?? 2;
      if (selectedApproverIds.length < required) {
        throw new Error(`Material requests require at least ${required} approver(s). You selected ${selectedApproverIds.length}.`);
      }
    }
    const realm = await getRealmApprovers();
    const allowed = new Set(
      (requestType === 'cash_request' ? realm.cash_user_ids : realm.material_user_ids).map(Number)
    );
    const approverRoles = await pool.query(
      'SELECT id FROM users WHERE id = ANY($1::int[]) AND deleted_at IS NULL',
      [selectedApproverIds]
    );
    const found = new Set(approverRoles.rows.map((r) => Number(r.id)));
    for (const id of selectedApproverIds) {
      const numId = Number(id);
      if (!found.has(numId)) {
        throw new Error('Selected approver not found');
      }
      if (!allowed.has(numId)) {
        throw new Error('Choose approvers from the Realm list for this request type.');
      }
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let {
      createdBy,
      teamLeaderName,
      teamLeaderPhone,
      projectName,
      ispName,
      location,
      deployment,
      releaseBy,
      receivedBy,
      items = [],
      reason,
      department,
      purpose,
      deliverTo,
      deliverPhone,
      specialInstructions,
      dateNeeded,
      totalAmount,
      linked_cash_request_id,
      siteId
    } = requestData;
    let resolvedSiteId = siteId ? parseInt(siteId, 10) : null;
    if (requestType === 'cash_request') {
      teamLeaderName = null;
      teamLeaderPhone = null;
      deployment = null;
      projectName = null;
      ispName = null;
      location = null;
      items = [];
      resolvedSiteId = null;
    } else {
      teamLeaderName = teamLeaderName || createdBy || '';
      teamLeaderPhone = teamLeaderPhone || '';
      ispName = ispName || null;
      deployment = deployment || null;
      // Client/Site standardization — Site is master data, searched and selected, never typed.
      // Its name becomes the request's display "project name"; location auto-fills from the
      // site's address on file, but stays user-editable when the site has none recorded yet.
      if (resolvedSiteId) {
        const siteRes = await client.query(
          `SELECT s.id, s.site_name, s.site_address FROM customer_sites s WHERE s.id = $1`,
          [resolvedSiteId]
        );
        const site = siteRes.rows[0];
        if (!site) throw new Error('Selected site not found');
        projectName = site.site_name;
        if (!location || !String(location).trim()) location = site.site_address || null;
      }
    }
    releaseBy = releaseBy || null;
    receivedBy = receivedBy || null;
    const linkedCashRequestId = linked_cash_request_id ? parseInt(linked_cash_request_id, 10) : null;
    if (linkedCashRequestId) {
      const linkedCash = await client.query(
        `SELECT id FROM requests WHERE id = $1 AND type = 'cash_request' AND deleted_at IS NULL`,
        [linkedCashRequestId]
      );
      if (linkedCash.rowCount === 0) {
        throw new Error('Linked cash request not found');
      }
    }

    const requestResult = await client.query(
      `INSERT INTO requests (
        created_by, team_leader_name, team_leader_phone, project_name, isp_name, location,
        deployment_type, release_by, received_by, type, reason, status,
        department, purpose, deliver_to, deliver_phone, special_instructions, date_needed, total_amount, created_by_id, ticket_id,
        linked_cash_request_id, site_id, company
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        COALESCE((SELECT company FROM users WHERE id = $19), 'CW'))
      RETURNING *`,
      [
        createdBy,
        teamLeaderName,
        teamLeaderPhone,
        projectName,
        ispName,
        location,
        deployment,
        releaseBy,
        receivedBy,
        requestType,
        reason || null,
        department || null,
        purpose || null,
        deliverTo || null,
        deliverPhone || null,
        specialInstructions || null,
        dateNeeded || null,
        totalAmount || null,
        userId,
        ticket_id,
        linkedCashRequestId,
        resolvedSiteId
      ]
    );
    const requestId = requestResult.rows[0].id;
    
    // Get requester info for emails
    const requesterRes = await client.query(
      'SELECT first_name, last_name, email FROM users WHERE id = $1',
      [userId]
    );
    const requester = requesterRes.rows[0];
    const requesterName = requester ? `${requester.first_name || ''} ${requester.last_name || ''}`.trim() || 'User' : 'User';
    
    // Get approver emails and send notifications
    const approverEmails = [];
    for (const approverId of selectedApproverIds) {
      await client.query(
        'INSERT INTO request_approvers (request_id, approver_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [requestId, approverId]
      );
      
      // Get approver email
      const approverRes = await client.query(
        'SELECT first_name, last_name, email FROM users WHERE id = $1',
        [approverId]
      );
      if (approverRes.rowCount > 0 && approverRes.rows[0].email) {
        approverEmails.push({
          email: approverRes.rows[0].email,
          name: `${approverRes.rows[0].first_name || ''} ${approverRes.rows[0].last_name || ''}`.trim() || 'Approver'
        });
      }
    }
    
    // Send emails to approvers (non-blocking - fire and forget)
    if (approverEmails.length > 0) {
      // Don't await - let it run in background
      import('./emailService.js').then(({ sendRequestCreatedEmail }) => {
        for (const approver of approverEmails) {
          sendRequestCreatedEmail(
            approver.email,
            approver.name,
            requestId,
            requestType,
            requesterName,
            {
              totalAmount: totalAmount,
              department: department,
              purpose: purpose
            }
          ).catch(err => console.error(`Failed to send email to approver ${approver.email} (non-blocking):`, err.message));
        }
      }).catch(err => {
        console.error('Failed to load email service:', err);
      });
    }

    if ((requestType === 'material_request' || requestType === 'item_return') && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const itemName = item.name?.trim();
        let quantityRequested = 0;
        if (requestType === 'material_request') {
          quantityRequested = parseInt(item.requested, 10);
        } else if (requestType === 'item_return') {
          quantityRequested = parseInt(item.quantity_requested, 10);
        }
        if (!itemName || itemName === '') {
          throw new Error('Item name is required for all items');
        }
        if (isNaN(quantityRequested) || quantityRequested <= 0) {
          throw new Error(`Please enter a valid quantity greater than 0 for "${itemName}"`);
        }
        const selectedItem = await client.query(
          'SELECT id FROM items WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL',
          [itemName]
        );
        if (selectedItem.rowCount === 0) {
          throw new Error(`Item "${itemName}" not found in inventory. Please check the name and try again.`);
        }
        const itemId = selectedItem.rows[0].id;
        await client.query(
          'INSERT INTO request_items (request_id, item_id, quantity_requested, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
          [requestId, itemId, quantityRequested]
        );
      }
    } else if ((requestType === 'material_request' || requestType === 'item_return')) {
      throw new Error('At least one item must be added to the request');
    }

    // CASH REQUEST LINE ITEMS - NEVER INSERT line_total
    if (requestType === 'cash_request' && Array.isArray(lineItems) && lineItems.length > 0) {
      for (const item of lineItems) {
        if (item.description && item.qty && item.unitPrice) {
          await client.query(
            `INSERT INTO cash_expenses (request_id, description, quantity, unit_price)
             VALUES ($1, $2, $3, $4)`,
            [requestId, item.description.trim(), parseInt(item.qty), parseFloat(item.unitPrice)]
          );
        }
      }
    }

    await insertAuditLog(client, userId, 'create_request', ip, { request_id: requestId, type: requestType });
    await client.query('COMMIT');
    touchVobiCache(userId);
    return requestResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating request:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getRequests(userRole, userId, company = null) {
  try {
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, username, role, main_role, roles, units, unit, position
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    if (userResult.rowCount === 0) {
      throw new Error('Current user not found');
    }
    const currentUser = normalizeLoginUserRow({ ...userResult.rows[0] });

    let query = `
      SELECT
        r.*,
        r.type, r.reason, r.department, r.purpose, r.total_amount, r.date_needed,
        COALESCE(
          (SELECT NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') FROM users u WHERE u.id = r.created_by_id),
          r.created_by
        ) AS created_by_display,
        (SELECT reason FROM rejections WHERE request_id = r.id ORDER BY created_at DESC LIMIT 1) AS reject_reason,
        COUNT(ri.id) AS item_count,
        COALESCE(
          (SELECT STRING_AGG(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), ', ')
           FROM request_approvers ra JOIN users u ON ra.approver_id = u.id
           WHERE ra.request_id = r.id),
          'Unassigned'
        ) AS assigned_approver_name,
        (SELECT COALESCE(
            (SELECT NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') FROM users u WHERE u.id = a.approver_id),
            a.approver_name
          ) FROM approvals a WHERE a.request_id = r.id AND a.approval_stage = 'supervisor' ORDER BY a.created_at DESC LIMIT 1) AS supervisor_approved_by,
        (SELECT created_at FROM approvals WHERE request_id = r.id AND approval_stage = 'supervisor' ORDER BY created_at DESC LIMIT 1) AS supervisor_approved_at,
        (SELECT COALESCE(
            (SELECT NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') FROM users u WHERE u.id = a.approver_id),
            a.approver_name
          ) FROM approvals a WHERE a.request_id = r.id AND a.approval_stage = 'director' ORDER BY a.created_at DESC LIMIT 1) AS director_approved_by,
        (SELECT created_at FROM approvals WHERE request_id = r.id AND approval_stage = 'director' ORDER BY created_at DESC LIMIT 1) AS director_approved_at,
        (SELECT COALESCE(
            (SELECT NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), '') FROM users u WHERE u.id = a.approver_id),
            a.approver_name
          ) FROM approvals a WHERE a.request_id = r.id AND a.approval_stage = 'finance' ORDER BY created_at DESC LIMIT 1) AS finance_approved_by,
        (SELECT created_at FROM approvals WHERE request_id = r.id AND approval_stage = 'finance' ORDER BY created_at DESC LIMIT 1) AS finance_approved_at
      FROM requests r
      LEFT JOIN request_items ri ON r.id = ri.request_id
      WHERE r.deleted_at IS NULL
    `;
    let conditions = [];
    let params = [];

    if (canBypassApprovalRestrictions(currentUser)) {
      // Directors and ADMIN SUPER see everything
    } else if (canReleaseCash(currentUser)) {
      conditions.push(`(r.type = 'cash_request' OR r.created_by_id = $1)`);
      params.push(userId);
    } else if (canExecuteMaterial(currentUser)) {
      conditions.push(`(r.type IN ('material_request', 'item_return') OR r.created_by_id = $1)`);
      params.push(userId);
    } else {
      conditions.push(`(
        r.created_by_id = $1
        OR EXISTS (
          SELECT 1 FROM request_approvers ra
          WHERE ra.request_id = r.id AND ra.approver_id = $1
        )
      )`);
      params.push(userId);
    }

    if (conditions.length > 0) {
      query += ' AND (' + conditions.join(' OR ') + ')';
    }
    // Company scope applies even to "sees everything" director-tier access above — that bypass
    // means "everything in my company," not literally every tenant's data. Only a null company
    // (the true System Admin — see middleware/tenant.js) skips this entirely.
    if (company) {
      params.push(company);
      query += ` AND r.company = $${params.length}`;
    }
    query += ` GROUP BY r.id ORDER BY r.created_at DESC`;
    const result = await pool.query(query, params);
    const rows = result.rows;
    if (rows.length > 0) {
      const approvedByUser = await pool.query(
        'SELECT request_id FROM approvals WHERE approver_id = $1 AND request_id = ANY($2::int[])',
        [userId, rows.map((r) => r.id)]
      );
      const approvedSet = new Set(approvedByUser.rows.map((r) => r.request_id));
      rows.forEach((row) => {
        row._approvedByMe = approvedSet.has(row.id);
        if (row.created_by_display) row.created_by = row.created_by_display;
      });
      const assignedToUser = await pool.query(
        'SELECT request_id FROM request_approvers WHERE approver_id = $1 AND request_id = ANY($2::int[])',
        [userId, rows.map((r) => r.id)]
      );
      const assignedSet = new Set(assignedToUser.rows.map((r) => r.request_id));
      rows.forEach((row) => {
        row._assignedToMe = assignedSet.has(row.id);
      });
      const partiesRes = await pool.query(
        `SELECT ra.request_id, ra.approver_id, u.first_name, u.last_name, u.username
         FROM request_approvers ra
         JOIN users u ON u.id = ra.approver_id
         WHERE ra.request_id = ANY($1::int[])`,
        [rows.map((r) => r.id)]
      );
      const approvalsRes = await pool.query(
        `SELECT request_id, approver_id, approver_name, approval_stage, created_at
         FROM approvals
         WHERE request_id = ANY($1::int[])
         ORDER BY created_at ASC`,
        [rows.map((r) => r.id)]
      );
      const partiesByRequest = new Map();
      for (const party of partiesRes.rows) {
        const list = partiesByRequest.get(party.request_id) || [];
        const acted = approvalsRes.rows.filter(
          (row) => Number(row.request_id) === Number(party.request_id) && Number(row.approver_id) === Number(party.approver_id)
        ).at(-1);
        list.push({
          id: Number(party.approver_id),
          name: formatPersonName(party, party.username),
          status: acted ? 'approved' : 'pending',
          actedAt: acted?.created_at || null,
        });
        partiesByRequest.set(party.request_id, list);
      }
      rows.forEach((row) => {
        const parties = partiesByRequest.get(row.id) || [];
        row.approval_parties = parties;
        row.approvals_required = parties.length;
        row.approvals_count = parties.filter((party) => party.status === 'approved').length;
        row.my_decision = row._approvedByMe ? 'approved' : null;
        const mine = approvalsRes.rows.filter((item) => Number(item.request_id) === row.id && Number(item.approver_id) === userId).at(-1);
        row.my_acted_at = mine?.created_at || null;
      });
    }
    const cashPendingIds = rows.filter(r => r.type === 'cash_request' && r.status === 'pending').map(r => r.id);
    let workflowConfig = null;
    let approvalStats = {};
    if (cashPendingIds.length > 0) {
      workflowConfig = await getWorkflowConfig();
      const countsRes = await pool.query(
        'SELECT request_id, approval_stage, COUNT(*) AS c FROM approvals WHERE request_id = ANY($1) GROUP BY request_id, approval_stage',
        [cashPendingIds]
      );
      const latestRes = await pool.query(
        'SELECT DISTINCT ON (request_id) request_id, approval_stage FROM approvals WHERE request_id = ANY($1) ORDER BY request_id, created_at DESC',
        [cashPendingIds]
      );
      for (const row of countsRes.rows) {
        const id = row.request_id;
        if (!approvalStats[id]) approvalStats[id] = { supervisor: 0, director: 0, latest: null };
        if (row.approval_stage === 'supervisor') approvalStats[id].supervisor = parseInt(row.c, 10);
        else if (row.approval_stage === 'director') approvalStats[id].director = parseInt(row.c, 10);
      }
      for (const row of latestRes.rows) {
        if (approvalStats[row.request_id]) approvalStats[row.request_id].latest = row.approval_stage;
      }
    }
    for (const row of rows) {
      if (row.type === 'cash_request' && row.status === 'pending') {
        if (!workflowConfig) workflowConfig = await getWorkflowConfig();
        const totalAmount = row.total_amount != null ? parseFloat(row.total_amount) : 0;
        const directorRule = (workflowConfig.finance?.amount_thresholds || []).find(
          t => t.requires_director && t.min_amount != null && totalAmount >= parseFloat(t.min_amount)
        );
        if (!directorRule) {
          row.requires_director_approval = false;
        } else {
          const stats = approvalStats[row.id] || { supervisor: 0, director: 0, latest: null };
          const requiredBeforeDirector = Math.max(0, parseInt(directorRule.required_approvers_before_director, 10) || 0);
          const directorApprovedButThenSupervisor = stats.director >= 1 && stats.latest === 'supervisor';
          const readyForDirector = stats.director === 0 && (requiredBeforeDirector === 0 || stats.supervisor >= requiredBeforeDirector);
          row.requires_director_approval = directorApprovedButThenSupervisor || readyForDirector;
        }
      }
    }
    // Realm cash approvers do not see high-value cash waiting on Director.
    if (!canBypassApprovalRestrictions(currentUser) && !canReleaseCash(currentUser)) {
      return rows.filter(
        r => !(r.type === 'cash_request' && r.status === 'pending' && r.requires_director_approval)
      );
    }
    return rows;
  } catch (error) {
    console.error('Error fetching requests:', error.stack);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// MY WORKSPACE (per-user notifications + activity)
// ────────────────────────────────────────────────────────────────────────────────

function requestAttentionLink(row) {
  if (row.type === 'cash_request') return `/cash-details/${row.id}`;
  if (row.type === 'item_return') return `/item-returns/${row.id}`;
  return `/request-forms/${row.id}`;
}

/** Public ticket code for URLs — tickets.ticket_id only; never map row id → TCK-* */
function workspaceTicketNumber(ticketRow) {
  const raw = ticketRow?.ticket_id != null ? String(ticketRow.ticket_id).trim().replace(/^#/, '') : '';
  if (!raw) return '';
  if (/^TCK-\d+/i.test(raw)) return raw.toUpperCase();
  if (/^\d+$/.test(raw)) return '';
  return raw.length >= 3 ? raw : '';
}

function requestAttentionTitle(row) {
  if (row.type === 'cash_request') {
    const amt = row.total_amount != null ? ` · GHS ${row.total_amount}` : '';
    return `Cash request #${row.id}${amt}`;
  }
  if (row.type === 'item_return') return `Item return #${row.id}`;
  return `Material request #${row.id}`;
}

function requestAttentionSubtitle(row) {
  const base = row.purpose || row.reason || row.project_name || row.created_by || '';
  if (row.status === 'supervisor_approved' && row.type === 'cash_request') {
    return base ? `${base} · awaiting finance approval` : 'Awaiting finance approval';
  }
  if (row.requires_director_approval) {
    return base ? `${base} · director approval required` : 'Director approval required';
  }
  return base || 'Awaiting your approval';
}

async function getWorkspaceAttentionItems(userId) {
  const items = [];
  try {
    const userRes = await pool.query(
      `SELECT id, role, main_role, roles FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) return items;
    const role = String(user.main_role || user.role || '').toLowerCase();

    // Assigned request approvals (supervisor / assigned approver)
    if (['approver', 'director', 'superadmin', 'finance', 'finance_manager'].includes(role)) {
      let requests = [];
      try {
        requests = await getRequests(role === 'finance_manager' ? 'finance' : role, userId);
      } catch (e) {
        console.warn('[workspace] getRequests for attention:', e.message);
      }

      const approvedByUser = await pool.query(
        'SELECT request_id FROM approvals WHERE approver_id = $1',
        [userId]
      );
      const approvedSet = new Set(approvedByUser.rows.map((r) => r.request_id));
      const assignedRes = await pool.query(
        'SELECT request_id FROM request_approvers WHERE approver_id = $1',
        [userId]
      );
      const assignedSet = new Set(assignedRes.rows.map((r) => r.request_id));

      for (const r of requests) {
        if (!['pending', 'supervisor_approved'].includes(r.status)) continue;

        if (role === 'finance' || role === 'finance_manager') {
          if (r.type !== 'cash_request' || r.status !== 'supervisor_approved') continue;
        } else if (role === 'approver') {
          if (r.type === 'cash_request' && r.status === 'pending' && r.requires_director_approval) continue;
          if (
            r.status === 'pending' &&
            ['material_request', 'item_return'].includes(r.type) &&
            !assignedSet.has(r.id)
          ) {
            continue;
          }
        } else if (role === 'director' || role === 'superadmin') {
          if (r.type === 'cash_request' && r.status === 'pending' && !r.requires_director_approval) {
            continue;
          }
          if (
            r.status === 'pending' &&
            ['material_request', 'item_return'].includes(r.type) &&
            !assignedSet.has(r.id) &&
            role !== 'superadmin'
          ) {
            continue;
          }
        }

        if (approvedSet.has(r.id)) continue;

        items.push({
          id: `req-${r.id}`,
          kind: 'approval',
          title: requestAttentionTitle(r),
          subtitle: requestAttentionSubtitle(r),
          link: requestAttentionLink(r),
          priority: r.requires_director_approval || r.status === 'supervisor_approved' ? 'high' : 'normal',
          created_at: r.created_at,
        });
      }
    }

    // Tickets assigned to this user (CX / NOC)
    try {
      const ticketRes = await pool.query(
        `SELECT TRIM(ticket_id) AS ticket_id, title, status, priority, created_at
         FROM tickets
         WHERE assigned_to = $1
           AND status IN ('NEW', 'OPEN', 'IN_PROGRESS', 'ON_HOLD')
           AND ticket_id IS NOT NULL
           AND TRIM(ticket_id) <> ''
           AND TRIM(ticket_id) ~* '^TCK-'
         ORDER BY created_at DESC
         LIMIT 12`,
        [userId]
      );
      for (const t of ticketRes.rows) {
        const ticketNumber = workspaceTicketNumber(t);
        if (!ticketNumber) continue;
        items.push({
          id: `tkt-${ticketNumber}`,
          kind: 'ticket',
          title: `Ticket ${ticketNumber}`,
          subtitle: t.title || t.status,
          link: `/staff/cx/tickets/${ticketNumber}`,
          ticket_id: ticketNumber,
          priority: t.priority === 'HIGH' || t.priority === 'URGENT' ? 'high' : 'normal',
          created_at: t.created_at,
        });
      }
    } catch (e) {
      console.warn('[workspace] ticket attention:', e.message);
    }

    // Unread notifications and @mentions also deserve space in My Workspace.
    try {
      const notifications = await getNotificationsForUser(userId);
      for (const n of notifications.filter((item) => !item.read).slice(0, 12)) {
        items.push({
          id: `notif-${n.id}`,
          kind: n.notification_type === 'chat_mention' ? 'chat' : 'notification',
          title: n.title,
          subtitle: n.message,
          link: n.link_url || '/workspace',
          priority: n.notification_type === 'chat_mention' ? 'high' : 'normal',
          created_at: n.created_at,
        });
      }
    } catch (e) {
      console.warn('[workspace] notification attention:', e.message);
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items.slice(0, 20);
  } catch (e) {
    console.error('getWorkspaceAttentionItems:', e.message);
    return [];
  }
}

export async function getUserWorkspace(userId) {
  const notifications = await getNotificationsForUser(userId);
  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const attentionItems = await getWorkspaceAttentionItems(userId);

  const safeParse = (text) => {
    if (!text || text === 'null') return {};
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'object' && parsed !== null ? parsed : { raw: text };
    } catch {
      return { raw: text };
    }
  };

  let activities = [];
  try {
    const actRes = await pool.query(
      `SELECT id, action, ip_address, details::text AS details_text, timestamp
         FROM audit_logs
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT 40`,
      [userId]
    );
    activities = actRes.rows.map((row) => ({
      id: row.id,
      action: row.action,
      ip_address: row.ip_address,
      timestamp: row.timestamp,
      details: safeParse(row.details_text),
    }));
  } catch (e) {
    console.error('getUserWorkspace activities:', e.message);
  }

  let lastLoginAt = null;
  let activitiesThisWeek = 0;
  try {
    const loginRes = await pool.query(
      `SELECT timestamp FROM audit_logs
        WHERE user_id = $1 AND action = 'login'
        ORDER BY timestamp DESC
        LIMIT 1`,
      [userId]
    );
    lastLoginAt = loginRes.rows[0]?.timestamp ?? null;

    const weekRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM audit_logs
        WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '7 days'`,
      [userId]
    );
    activitiesThisWeek = weekRes.rows[0]?.c ?? 0;
  } catch (e) {
    console.error('getUserWorkspace stats:', e.message);
  }

  return {
    notifications,
    activities,
    attentionItems,
    stats: {
      unreadNotifications,
      activitiesThisWeek,
      lastLoginAt,
      attentionCount: attentionItems.length,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// SYSTEM NOTIFICATIONS
// ────────────────────────────────────────────────────────────────────────────────

export async function getNotificationsForUser(userId) {
  try {
    await addColumnIfNotExists('system_notifications', 'target_user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
    await addColumnIfNotExists('system_notifications', 'link_url', 'TEXT');
    await addColumnIfNotExists('system_notifications', 'notification_type', "VARCHAR(40) DEFAULT 'broadcast'");
    await addColumnIfNotExists('system_notifications', 'company', 'VARCHAR(20)');

    // A broadcast (no target_user_id) reaches this user only if it's untagged (a true System
    // Admin announcement meant for literally everyone) or tagged with their own company — a
    // C&W-wide broadcast must never reach a PTEL account and vice versa. A directly targeted
    // notification always reaches its target regardless of company.
    const result = await pool.query(
      `
      SELECT n.id,
             n.title,
             n.message,
             n.created_at,
             n.is_active,
             n.link_url,
             n.notification_type,
             EXISTS (
               SELECT 1 FROM notification_reads nr
               WHERE nr.notification_id = n.id
                 AND nr.user_id = $1
             ) AS read
        FROM system_notifications n
       WHERE n.is_active = TRUE
         AND (
           n.target_user_id = $1
           OR (n.target_user_id IS NULL AND (n.company IS NULL OR n.company = (SELECT company FROM users WHERE id = $1)))
         )
       ORDER BY n.created_at DESC
       LIMIT 80
      `,
      [userId]
    );
    return result.rows;
  } catch (error) {
    // If tables do not exist yet (old database), create them on the fly and retry once
    if (error.code === '42P01') { // undefined_table
      console.warn('system_notifications tables missing; creating them now...');
      await createTableIfNotExists(`
        CREATE TABLE IF NOT EXISTS system_notifications (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER REFERENCES users(id),
          is_active BOOLEAN DEFAULT TRUE
        );
      `, 'system_notifications');

      await createTableIfNotExists(`
        CREATE TABLE IF NOT EXISTS notification_reads (
          id SERIAL PRIMARY KEY,
          notification_id INTEGER REFERENCES system_notifications(id) ON DELETE CASCADE,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(notification_id, user_id)
        );
      `, 'notification_reads');

      const retry = await pool.query(
        `
        SELECT n.id,
               n.title,
               n.message,
               n.created_at,
               n.is_active,
               FALSE AS read
          FROM system_notifications n
         WHERE n.is_active = TRUE
         ORDER BY n.created_at DESC
        `
      );
      return retry.rows;
    }
    console.error('Error fetching notifications:', error.stack);
    throw error;
  }
}

async function migrateVehicleRentalWorkflow() {
  await createTableIfNotExists(`
    CREATE TABLE IF NOT EXISTS vehicle_request_approvals (
      id SERIAL PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES vehicle_request_forms(id) ON DELETE CASCADE,
      approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approver_name VARCHAR(255) NOT NULL,
      stage VARCHAR(50) NOT NULL DEFAULT 'approver',
      decision VARCHAR(50) NOT NULL CHECK (decision IN ('approved', 'rejected')),
      reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `, 'vehicle_request_approvals');

  try {
    await pool.query('ALTER TABLE vehicle_request_forms DROP CONSTRAINT IF EXISTS vehicle_request_forms_status_check');
    await pool.query('ALTER TABLE vehicle_request_forms DROP CONSTRAINT IF EXISTS vehicle_request_forms_current_stage_check');
  } catch (error) {
    console.warn('vehicle_request_forms constraint drop:', error.message);
  }

  try {
    await pool.query(`
      UPDATE vehicle_request_forms SET
        status = CASE
          WHEN status IN ('draft') THEN 'draft'
          WHEN status IN ('submitted', 'pending_manager', 'pending') THEN 'pending'
          WHEN status IN ('pending_finance', 'approved', 'sent_to_finance') THEN 'approved'
          WHEN status = 'cash_issued' THEN 'cash_issued'
          WHEN status = 'completed' THEN 'completed'
          WHEN status = 'rejected' THEN 'rejected'
          ELSE 'pending'
        END,
        current_stage = CASE
          WHEN status IN ('draft') THEN 'draft'
          WHEN status IN ('submitted', 'pending_manager', 'pending') THEN 'pending'
          WHEN status IN ('pending_finance', 'approved', 'sent_to_finance') THEN 'finance'
          WHEN status = 'cash_issued' THEN 'cash_issued'
          WHEN status = 'completed' THEN 'completed'
          WHEN status = 'rejected' THEN 'rejected'
          WHEN current_stage IN ('manager', 'approver') THEN 'pending'
          WHEN current_stage = 'finance' THEN 'finance'
          ELSE current_stage
        END
    `);
    await pool.query(`ALTER TABLE vehicle_request_forms ALTER COLUMN status SET DEFAULT 'draft'`);
    await pool.query(`ALTER TABLE vehicle_request_forms ALTER COLUMN current_stage SET DEFAULT 'draft'`);
    await pool.query(`
      ALTER TABLE vehicle_request_forms
      ADD CONSTRAINT vehicle_request_forms_status_check
      CHECK (status IN ('draft', 'pending', 'approved', 'sent_to_finance', 'cash_issued', 'completed', 'rejected'))
    `);
    await pool.query(`
      ALTER TABLE vehicle_request_forms
      ADD CONSTRAINT vehicle_request_forms_current_stage_check
      CHECK (current_stage IN ('draft', 'pending', 'finance', 'cash_issued', 'completed', 'rejected'))
    `);
  } catch (error) {
    console.warn('vehicle_request_forms status migration:', error.message);
  }
}

export async function createNotification(
  title,
  message,
  createdBy,
  fourth,
  fifth,
  sixth
) {
  const opts =
    fourth && typeof fourth === 'object' && !Array.isArray(fourth)
      ? fourth
      : { targetUserId: fourth ?? null, linkUrl: fifth ?? null, notificationType: sixth ?? 'broadcast' };
  const { targetUserId = null, linkUrl = null, notificationType = 'broadcast' } = opts;
  await addColumnIfNotExists('system_notifications', 'target_user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await addColumnIfNotExists('system_notifications', 'link_url', 'TEXT');
  await addColumnIfNotExists('system_notifications', 'notification_type', "VARCHAR(40) DEFAULT 'broadcast'");
  await addColumnIfNotExists('system_notifications', 'company', 'VARCHAR(20)');
  let safeCreatedBy = createdBy || null;
  if (safeCreatedBy) {
    const creator = await pool.query(
      'SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [safeCreatedBy]
    );
    if (creator.rowCount === 0) safeCreatedBy = null;
  }

  const result = await pool.query(
    `INSERT INTO system_notifications (title, message, created_by, target_user_id, link_url, notification_type, company)
     VALUES ($1, $2, $3, $4, $5, $6,
       CASE
         WHEN $4::int IS NOT NULL THEN (SELECT company FROM users WHERE id = $4)
         WHEN $3::int IS NOT NULL AND (SELECT LOWER(username) FROM users WHERE id = $3) = 'superadmin' THEN NULL
         WHEN $3::int IS NOT NULL THEN (SELECT company FROM users WHERE id = $3)
         ELSE NULL
       END)
     RETURNING *`,
    [
      title.trim(),
      message.trim(),
      safeCreatedBy,
      targetUserId || null,
      linkUrl || null,
      notificationType || 'broadcast',
    ]
  );
  return result.rows[0];
}

export async function markNotificationRead(notificationId, userId) {
  await pool.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (notification_id, user_id) DO NOTHING`,
    [notificationId, userId]
  );
  return { message: 'Marked as read' };
}

export async function deleteNotification(notificationId) {
  // Soft delete: mark as inactive so it disappears from all users' views
  const result = await pool.query(
    `UPDATE system_notifications
        SET is_active = FALSE
      WHERE id = $1
      RETURNING *`,
    [notificationId]
  );
  if (result.rowCount === 0) {
    throw new Error('Notification not found');
  }
  return result.rows[0];
}

export async function updateRequest(requestId, requestData, userId, ip, userRole) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reqCheck = await client.query(
      'SELECT status, created_by FROM requests WHERE id = $1 AND deleted_at IS NULL',
      [requestId]
    );
    if (reqCheck.rowCount === 0) throw new Error('Request not found');
    if (!['pending', 'approved'].includes(reqCheck.rows[0].status)) {
      throw new Error('Cannot edit finalized request');
    }
    const allowedRoles = ['superadmin', 'issuer', 'field_engineer_admin'];
    if (!allowedRoles.includes(userRole)) {
      if (userRole !== 'field_engineer') throw new Error('Access denied');
      const user = await getUserById(userId);
      const createdByMatch = reqCheck.rows[0].created_by?.toLowerCase().includes(user?.username?.toLowerCase());
      const isAssigned = await client.query(
        'SELECT 1 FROM request_approvers WHERE request_id = $1 AND approver_id = $2',
        [requestId, userId]
      );
      if (!createdByMatch && isAssigned.rowCount === 0) {
        throw new Error('You can only edit your own or assigned requests');
      }
    }
    const { teamLeaderName, teamLeaderPhone, projectName, ispName, location, deployment, items, reason } = requestData;
    await client.query(
      `UPDATE requests SET
         team_leader_name = $1, team_leader_phone = $2, project_name = $3,
         isp_name = $4, location = $5, deployment_type = $6, reason = $7,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [teamLeaderName, teamLeaderPhone, projectName, ispName || null, location, deployment, reason || null, requestId]
    );
    await client.query('DELETE FROM request_items WHERE request_id = $1', [requestId]);
    for (const item of items) {
      const it = await client.query('SELECT id FROM items WHERE name = $1 AND deleted_at IS NULL', [item.name]);
      if (it.rowCount === 0) throw new Error(`Item not found: ${item.name}`);
      await client.query(
        'INSERT INTO request_items (request_id, item_id, quantity_requested) VALUES ($1, $2, $3)',
        [requestId, it.rows[0].id, parseInt(item.requested) || 0]
      );
    }
    await insertAuditLog(client, userId, 'update_request', ip, { request_id: requestId, editor_role: userRole });
    await client.query('COMMIT');
    touchVobiCache(userId);
    return { message: 'Request updated successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating request:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectRequest(requestId, userId, ip, rejectData) {
  const { rejectorName, reason } = rejectData || {};
  if (!reason || !reason.trim()) throw new Error('Rejection reason is required');
  if (!rejectorName || !rejectorName.trim()) throw new Error('Rejector name is required');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ownerCheck = await client.query('SELECT created_by_id FROM requests WHERE id = $1', [requestId]);
    if (ownerCheck.rowCount > 0 && Number(ownerCheck.rows[0].created_by_id) === Number(userId)) {
      const actingUser = await getUserById(userId);
      if (!isSystemAdminAccount(actingUser)) {
        throw forbidden('You cannot reject a request that you created');
      }
    }
    const result = await client.query(
      'UPDATE requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND status IN ($3, $4, $5) AND deleted_at IS NULL RETURNING *',
      ['rejected', requestId, 'pending', 'supervisor_approved', 'finance_approved']
    );
    if (result.rowCount === 0) throw new Error('Request not found or not rejectable');
    await client.query(
      'INSERT INTO rejections (request_id, rejector_name, reason, created_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [requestId, rejectorName, reason]
    );
    await insertAuditLog(client, userId, 'reject_request', ip, { request_id: requestId, reason });
    await client.query('COMMIT');
    touchVobiCache(userId);
    return { message: 'Request rejected' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error rejecting request:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

export async function approveRequest(requestId, approverData, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { signature, stage } = approverData;
    const actorRes = await client.query('SELECT first_name, last_name, username FROM users WHERE id = $1', [userId]);
    const approverName = formatPersonName(actorRes.rows[0], approverData.approverName);
    const reqCheck = await client.query(
      'SELECT type, status, total_amount, created_by_id FROM requests WHERE id = $1 AND deleted_at IS NULL',
      [requestId]
    );
    if (reqCheck.rowCount === 0) throw new Error('Request not found');
    const requestType = reqCheck.rows[0].type;
    const currentStatus = reqCheck.rows[0].status;
    const totalAmount = reqCheck.rows[0].total_amount != null ? parseFloat(reqCheck.rows[0].total_amount) : 0;
    const user = await getUserById(userId);
    if (!user) throw new Error('User not found');
    if (Number(reqCheck.rows[0].created_by_id) === Number(userId) && !isSystemAdminAccount(user)) {
      throw forbidden('You cannot approve a request that you created');
    }
    const workflowConfig = await getWorkflowConfig();
    const approvalStageForDb = stage === 'approver' ? 'supervisor' : (stage === 'director' ? 'director' : stage);

    let requiredCurrentStatus, newStatus, requiredStage, permissionCheck, permissionLabel, needsCountCheck = false;
    if (requestType === 'cash_request') {
      if (currentStatus === 'pending') {
        requiredCurrentStatus = 'pending';
        const thresholds = workflowConfig.finance?.amount_thresholds || [];
        const directorRule = thresholds.find(t => t.requires_director && t.min_amount != null && totalAmount >= parseFloat(t.min_amount));
        const approverRule = thresholds.find(t => t.max_amount != null && totalAmount < parseFloat(t.max_amount));
        const requiredApprovers = approverRule ? (approverRule.required_approvers || 2) : 2;
        if (directorRule) {
          const requiredBeforeDirector = Math.max(0, parseInt(directorRule.required_approvers_before_director, 10) || 0);
          const supervisorCountRes = await client.query(
            `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name)) AS c 
             FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor'`,
            [requestId]
          );
          const directorCountRes = await client.query(
            `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name)) AS c 
             FROM approvals WHERE request_id = $1 AND approval_stage = 'director'`,
            [requestId]
          );
          const latestRes = await client.query(
            "SELECT approval_stage FROM approvals WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1",
            [requestId]
          );
          const supervisorCount = parseInt(supervisorCountRes.rows[0].c, 10);
          const directorCount = parseInt(directorCountRes.rows[0].c, 10);
          const latestStage = latestRes.rowCount > 0 ? latestRes.rows[0].approval_stage : null;
          const directorApprovedButThenSupervisor = directorCount >= 1 && latestStage === 'supervisor';
          const readyForDirector = directorCount === 0 && (requiredBeforeDirector === 0 || supervisorCount >= requiredBeforeDirector);
          const nextMustBeDirector = directorApprovedButThenSupervisor || readyForDirector;

          if (stage === 'director') {
            requiredStage = 'director';
            permissionCheck = canAccessGlobalDashboard;
            permissionLabel = 'Director';
            const directorCountAfter = directorCount + 1;
            const hasEnoughSupervisor = requiredBeforeDirector === 0 || supervisorCount >= requiredBeforeDirector;
            newStatus = (hasEnoughSupervisor && directorCountAfter >= 1) ? 'supervisor_approved' : 'pending';
          } else {
            requiredStage = 'approver';
            permissionCheck = canApproveCashRequest;
            permissionLabel = 'Supervisor, Manager, or Director';
            if (nextMustBeDirector) {
              requiredStage = 'director';
              permissionCheck = canAccessGlobalDashboard;
              permissionLabel = 'Director';
            }
            newStatus = 'pending';
          }
        } else {
          // Small / normal cash: supervisor-level approvers.
          requiredStage = 'approver';
          permissionCheck = canApproveCashRequest;
          permissionLabel = 'Supervisor, Manager, or Director';
          needsCountCheck = true;
          const countRes = await client.query(
            `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name)) AS c 
             FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor'`,
            [requestId]
          );
          const distinctApprovers = parseInt(countRes.rows[0].c, 10);
          const countAfter = distinctApprovers + 1;
          newStatus = countAfter >= requiredApprovers ? 'supervisor_approved' : 'pending';
        }
      } else if (currentStatus === 'supervisor_approved') {
        // Cash already supervisor_approved: ONLY Finance can release funds
        requiredCurrentStatus = 'supervisor_approved';
        newStatus = 'finance_approved';
        requiredStage = 'finance';
        permissionCheck = canReleaseCash;
        permissionLabel = 'Finance Officer';
      } else {
        throw new Error(`Cash request cannot be approved in current state: ${currentStatus}`);
      }
    } else {
      // Material requests: N distinct approvers (config), then supervisor_approved
      requiredCurrentStatus = 'pending';
      requiredStage = 'approver';
      permissionCheck = canApproveMaterialRequest;
      permissionLabel = 'Supervisor, Manager, or Director';
      needsCountCheck = true;
      const requiredCount = workflowConfig.material?.required_approvers_count ?? 2;
      const countRes = await client.query(
        `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name)) AS c 
         FROM approvals WHERE request_id = $1 AND approval_stage = 'supervisor'`,
        [requestId]
      );
      const distinctApprovers = parseInt(countRes.rows[0].c, 10);
      const countAfter = distinctApprovers + 1;
      newStatus = countAfter >= requiredCount ? 'supervisor_approved' : 'pending';

      if (stage === 'finance') {
        throw new Error('Material requests do not require finance approval. Only cash requests go to finance.');
      }
    }
    if (!permissionCheck?.(user)) {
      throw forbidden(`Only ${permissionLabel} can perform this action`);
    }
    if (requiredStage === 'approver' && !canAccessGlobalDashboard(user)) {
      const assignmentCheck = await client.query(
        'SELECT 1 FROM request_approvers WHERE request_id = $1 AND approver_id = $2 LIMIT 1',
        [requestId, userId]
      );
      if (assignmentCheck.rowCount === 0) {
        throw new Error('This request is not assigned to you for approval');
      }
    }
    if (stage !== requiredStage) {
      throw new Error(`Invalid stage '${stage}'. Must be '${requiredStage}'`);
    }
    if (currentStatus !== requiredCurrentStatus) {
      throw new Error(`Cannot approve: request is in "${currentStatus}", expected "${requiredCurrentStatus}"`);
    }

    // Prevent the same user approving the same request twice at the same stage (by user id, or by name for legacy rows)
    const dupCheck = await client.query(
      `SELECT 1 FROM approvals 
       WHERE request_id = $1 AND approval_stage = $2 
         AND (approver_id = $3 OR (approver_id IS NULL AND approver_name = $4))
       LIMIT 1`,
      [requestId, approvalStageForDb, userId, approverName.trim()]
    );
    if (dupCheck.rowCount > 0) {
      throw new Error('You have already approved this request at this stage');
    }
    await client.query(
      `INSERT INTO approvals (request_id, approver_name, signature, approval_stage, approver_id, created_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [requestId, approverName.trim(), signature?.trim() || null, approvalStageForDb, userId]
    );
    await client.query(
      'UPDATE requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStatus, requestId]
    );
    await insertAuditLog(client, userId, 'approve_request', ip, {
      request_id: requestId,
      type: requestType,
      stage: stage === 'finance' ? 'finance' : 'supervisor',
      stage_label: stage === 'finance' ? 'Finance Approval' : 'Supervisor Approval',
      approved_by: approverName.trim(),
      approved_by_role: user.role,
      from_status: currentStatus,
      to_status: newStatus
    });
    
    // Get request details and requester email for notification
    const requestDetailsRes = await client.query(
      `SELECT r.created_by, r.total_amount, r.department, r.purpose,
              u.first_name, u.last_name, u.email
       FROM requests r
       JOIN users u ON r.created_by_id = u.id
       WHERE r.id = $1`,
      [requestId]
    );
    
    await client.query('COMMIT');
    touchVobiCache(userId);
    
    // Send email to issuer (requester) after approval
    if (requestDetailsRes.rowCount > 0) {
      const requestDetails = requestDetailsRes.rows[0];
      const issuerEmail = requestDetails.email;
      const issuerName = `${requestDetails.first_name || ''} ${requestDetails.last_name || ''}`.trim() || 'User';
      
      if (issuerEmail) {
        // Don't await - let it run in background
        import('./emailService.js').then(({ sendRequestApprovedEmail }) => {
          sendRequestApprovedEmail(
            issuerEmail,
            issuerName,
            requestId,
            requestType,
            approverName.trim(),
            stage,
            {
              totalAmount: requestDetails.total_amount
            }
          ).catch(emailError => {
            console.error('Failed to send approval email to issuer (non-blocking):', emailError.message);
          });
        }).catch(err => {
          console.error('Failed to load email service:', err);
        });
      }
    }
    
    let message = '';
    if (requestType === 'cash_request') {
      if (newStatus === 'supervisor_approved') {
        message = 'Cash request approved by Approver — waiting for Finance to release funds';
      } else {
        message = 'Cash request released by Finance — ready for collection';
      }
    } else {
      message = 'Material request approved by Approver — ready for issuance';
    }
    return { message, newStatus };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('approveRequest failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function finalizeRequest(requestId, finalizeData, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let { items = [], releasedBy, waybill } = finalizeData || {};
    if (!releasedBy || !releasedBy.trim()) {
      throw new Error('Released By name is required');
    }
    if (!Array.isArray(items)) {
      throw new Error('Invalid payload: items must be an array');
    }
    const request = await client.query(
      'SELECT status, type, created_by_id FROM requests WHERE id = $1 AND deleted_at IS NULL',
      [requestId]
    );
    if (request.rowCount === 0) throw new Error('Request not found');
    const reqType = request.rows[0].type;
    const currentStatus = request.rows[0].status;
    const user = await getUserById(userId);
    if (!user) throw new Error('User not found');
    if (Number(request.rows[0].created_by_id) === Number(userId) && !isSystemAdminAccount(user)) {
      throw forbidden('You cannot finalize a request that you created');
    }
    if (reqType === 'cash_request') {
      if (!canReleaseCash(user)) {
        throw forbidden('Only a Finance Officer can release cash');
      }
    } else if (!canExecuteMaterial(user)) {
      throw forbidden('Only Procurement can execute approved material requests');
    }
    const expectedStatus = reqType === 'cash_request' ? 'finance_approved' : 'supervisor_approved';
    if (currentStatus !== expectedStatus) {
      throw new Error(`Request is not ready for finalization (current: ${currentStatus}, expected: ${expectedStatus})`);
    }
    if (reqType === 'material_request' && items.length === 0) {
      throw new Error('Cannot finalize material request: no items provided');
    }
    console.log(`Finalizing request ${requestId} (${reqType}) with ${items.length} items by ${releasedBy}`);
    for (const item of items) {
      const { itemId, quantityReceived = 0, quantityReturned = 0, serial_number } = item;
      if (!itemId) {
        throw new Error('Missing itemId in finalize data');
      }
      const quantityReceivedNum = parseInt(quantityReceived, 10) || 0;
      const quantityReturnedNum = parseInt(quantityReturned, 10) || 0;
      await client.query(
        `UPDATE request_items
         SET quantity_received = $1,
             quantity_returned = $2,
             serial_number = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE request_id = $4 AND item_id = $5`,
        [
          quantityReceivedNum || null,
          quantityReturnedNum || null,
          serial_number?.trim() || null,
          requestId,
          itemId
        ]
      );
      if (quantityReceivedNum > 0) {
        const itemCheck = await client.query(
          'SELECT quantity FROM items WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
          [itemId]
        );
        if (itemCheck.rowCount === 0) {
          throw new Error(`Item ID ${itemId} not found or deleted`);
        }
        const currentStock = parseInt(itemCheck.rows[0].quantity, 10);
        if (reqType === 'material_request') {
          if (quantityReceivedNum > currentStock) {
            throw new Error(`Insufficient stock for item ${itemId}: only ${currentStock} available, tried to issue ${quantityReceivedNum}`);
          }
          await client.query(
            'UPDATE items SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [quantityReceivedNum, itemId]
          );
        } else if (reqType === 'item_return') {
          await client.query(
            'UPDATE items SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [quantityReceivedNum, itemId]
          );
        }
      }
    }
    await client.query(
      'UPDATE requests SET status = $1, release_by = $2, released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['completed', releasedBy.trim(), requestId]
    );
    if (waybill && typeof waybill === 'object') {
      const { carNumber, driversName, driversContact, address, projectDescription } = waybill;
      await client.query(
        `UPDATE requests
         SET car_number = $1, drivers_name = $2, drivers_contact = $3,
             address = $4, project_description = $5
         WHERE id = $6`,
        [carNumber, driversName, driversContact, address, projectDescription, requestId]
      );
    }
    await insertAuditLog(client, userId, 'finalize_request', ip, {
      request_id: requestId,
      released_by: releasedBy.trim(),
      type: reqType,
      waybill_included: !!waybill,
      items_processed: items.length
    });
    await client.query('COMMIT');
    console.log(`Request ${requestId} finalized successfully`);
    touchVobiCache(userId);
    return { message: 'Request finalized and stock updated successfully' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Failed to finalize request ${requestId}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

export async function getRequestDetails(requestId) {
  try {
    const request = await pool.query(`
      SELECT
        r.*,
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(creator.first_name, ''), ' ', COALESCE(creator.last_name, ''))), ''),
          r.created_by
        ) AS created_by,
        t.ticket_id AS ticket_display_id,
        t.title AS ticket_title,
        linked_cash.id AS linked_cash_request_id,
        linked_cash.purpose AS linked_cash_purpose,
        linked_cash.department AS linked_cash_department,
        linked_cash.total_amount AS linked_cash_total_amount,
        linked_cash.status AS linked_cash_status,
        linked_cash.created_at AS linked_cash_created_at
      FROM requests r
      LEFT JOIN users creator ON creator.id = r.created_by_id
      LEFT JOIN tickets t ON r.ticket_id = t.id
      LEFT JOIN requests linked_cash
        ON r.linked_cash_request_id = linked_cash.id
       AND linked_cash.type = 'cash_request'
       AND linked_cash.deleted_at IS NULL
      WHERE r.id = $1 AND r.deleted_at IS NULL
    `, [requestId]);
    if (request.rowCount === 0) throw new Error('Request not found');
    const baseRequest = request.rows[0];
    let items = [];
    let expenses = [];
    if (baseRequest.type === 'cash_request') {
      const expensesResult = await pool.query(`
        SELECT description, quantity AS qty, unit_price, line_total AS total
        FROM cash_expenses
        WHERE request_id = $1
        ORDER BY id
      `, [requestId]);
      expenses = expensesResult.rows;
    } else {
      const itemsResult = await pool.query(`
        SELECT ri.*, i.name AS item_name, i.quantity AS current_stock, ri.serial_number
        FROM request_items ri
        JOIN items i ON ri.item_id = i.id
        WHERE ri.request_id = $1
        ORDER BY ri.created_at DESC
      `, [requestId]);
      items = itemsResult.rows;
    }
    const approvals = await pool.query(`
      SELECT a.*,
             a.created_at AS approved_at,
             COALESCE(
               NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
               a.approver_name
             ) AS approver_name,
             CASE WHEN a.approval_stage = 'supervisor' THEN 'Supervisor Approval'
                  WHEN a.approval_stage = 'finance' THEN 'Finance Approval'
                  WHEN a.approval_stage = 'director' THEN 'Director Approval'
                  ELSE a.approval_stage END AS stage_label
      FROM approvals a
      LEFT JOIN users u ON u.id = a.approver_id
      WHERE a.request_id = $1
      ORDER BY a.created_at DESC
    `, [requestId]);
    const rejections = await pool.query('SELECT * FROM rejections WHERE request_id = $1 ORDER BY created_at DESC', [requestId]);
    const approvers = await pool.query(`
      SELECT u.id, u.first_name, u.last_name, u.username, ra.assigned_at
      FROM request_approvers ra
      JOIN users u ON ra.approver_id = u.id
      WHERE ra.request_id = $1
      ORDER BY ra.assigned_at ASC
    `, [requestId]);
    const linkedMaterialRequests = await pool.query(`
      SELECT
        id,
        project_name,
        location,
        status,
        created_at
      FROM requests
      WHERE linked_cash_request_id = $1
        AND type IN ('material_request', 'item_return')
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `, [requestId]);
    let requires_director_approval = false;
    if (baseRequest.type === 'cash_request' && baseRequest.status === 'pending') {
      const workflowConfig = await getWorkflowConfig();
      const totalAmount = baseRequest.total_amount != null ? parseFloat(baseRequest.total_amount) : 0;
      const directorRule = (workflowConfig.finance?.amount_thresholds || []).find(
        t => t.requires_director && t.min_amount != null && totalAmount >= parseFloat(t.min_amount)
      );
      if (directorRule) {
        const countsRes = await pool.query(
          'SELECT approval_stage, COUNT(*) AS c FROM approvals WHERE request_id = $1 GROUP BY approval_stage',
          [requestId]
        );
        const latestRes = await pool.query(
          'SELECT approval_stage FROM approvals WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1',
          [requestId]
        );
        const stats = { supervisor: 0, director: 0, latest: null };
        countsRes.rows.forEach(r => {
          if (r.approval_stage === 'supervisor') stats.supervisor = parseInt(r.c, 10);
          else if (r.approval_stage === 'director') stats.director = parseInt(r.c, 10);
        });
        if (latestRes.rowCount > 0) stats.latest = latestRes.rows[0].approval_stage;
        const requiredBeforeDirector = Math.max(0, parseInt(directorRule.required_approvers_before_director, 10) || 0);
        const directorApprovedButThenSupervisor = stats.director >= 1 && stats.latest === 'supervisor';
        const readyForDirector = stats.director === 0 && (requiredBeforeDirector === 0 || stats.supervisor >= requiredBeforeDirector);
        requires_director_approval = directorApprovedButThenSupervisor || readyForDirector;
      }
    }
    return {
      ...baseRequest,
      items,
      expenses,
      approvals: approvals.rows,
      rejections: rejections.rows,
      approvers: approvers.rows.map(row => ({
        id: row.id,
        fullName: formatPersonName(row, row.username),
        username: row.username,
        assigned_at: row.assigned_at
      })),
      linked_cash_request: baseRequest.linked_cash_request_id ? {
        id: baseRequest.linked_cash_request_id,
        purpose: baseRequest.linked_cash_purpose,
        department: baseRequest.linked_cash_department,
        total_amount: baseRequest.linked_cash_total_amount,
        status: baseRequest.linked_cash_status,
        created_at: baseRequest.linked_cash_created_at,
      } : null,
      linked_material_requests: linkedMaterialRequests.rows,
      requires_director_approval
    };
  } catch (error) {
    console.error('Error fetching request details:', error.stack);
    throw error;
  }
}

export async function getRequestsByTicketId(ticketCode) { // Renamed parameter for clarity
  try {
    // 1. Get the internal integer ID from the tickets table using the human-readable ticketCode
    const ref = String(ticketCode || '').trim();
    const ticketLookupResult = await pool.query(
      `SELECT id FROM tickets WHERE TRIM(ticket_id) = $1 OR id::text = $1`,
      [ref]
    );

    if (ticketLookupResult.rowCount === 0) {
      console.warn(`No ticket found for ticket code: ${ticketCode}`);
      return []; // No ticket found, so no requests linked
    }

    const internalTicketId = ticketLookupResult.rows[0].id;

    // 2. Use the internal integer ID to query all linked requests, including cash requests.
    const result = await pool.query(`
      SELECT
        r.id,
        r.type,
        r.status,
        r.created_at,
        r.purpose,
        r.department,
        r.total_amount,
        ri.quantity_requested,
        ri.quantity_received,
        i.name as material_name
      FROM requests r
      LEFT JOIN request_items ri ON r.id = ri.request_id
      LEFT JOIN items i ON ri.item_id = i.id
      WHERE r.ticket_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC
    `, [internalTicketId]); // Use the integer ID here
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching requests by ticket id:', error.stack);
    throw error;
  }
}

export async function markCashAsReceived(requestId, receivedBy, userId, ip) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const check = await pool.query('SELECT status, type FROM requests WHERE id = $1 AND deleted_at IS NULL', [requestId]);
    if (check.rowCount === 0) throw new Error('Request not found');
    if (check.rows[0].type !== 'cash_request') throw new Error('Not a cash request');
    if (check.rows[0].status !== 'finance_approved') throw new Error('Cash not yet released by Finance');
    await client.query(
      'UPDATE requests SET status = $1, received_by = $2, received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['completed', receivedBy, requestId]
    );
    await insertAuditLog(client, userId, 'cash_received', ip, { request_id: requestId, received_by: receivedBy });
    await client.query('COMMIT');
    touchVobiCache(userId);
    return { message: 'Cash marked as received' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error marking cash received:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────────────────────────
// FCM device tokens (Web Push via Firebase)
// ────────────────────────────────────────────────────────────────────────────────

export async function upsertFcmToken(userId, token, userAgent) {
  await pool.query(
    `INSERT INTO fcm_tokens (user_id, token, user_agent)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, token)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP, user_agent = COALESCE(EXCLUDED.user_agent, fcm_tokens.user_agent)`,
    [userId, token, userAgent || null]
  );
}

export async function removeFcmToken(userId, token) {
  await pool.query('DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
}

/** Cleanup path for tokens Firebase itself reports as dead (uninstalled app, expired
 *  registration, etc.) — see push/fcm.js's sendMulticast, which calls this per-token instead of
 *  by (userId, token) since at send time we only have the bare token string. */
export async function removeFcmTokenByToken(token) {
  await pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
}

export async function getFcmTokensForUserIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const r = await pool.query(
    'SELECT token FROM fcm_tokens WHERE user_id = ANY($1::int[])',
    [userIds]
  );
  return [...new Set(r.rows.map((x) => x.token).filter(Boolean))];
}

export async function getAllFcmTokens() {
  const r = await pool.query('SELECT token FROM fcm_tokens');
  return [...new Set(r.rows.map((x) => x.token).filter(Boolean))];
}

// ─── Native Web Push subscriptions ────────────────────────────────────────────

export async function upsertPushSubscription(userId, subscription, userAgent) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  // Ensure table exists (older DBs)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch {/* ignore */}

  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
           updated_at = CURRENT_TIMESTAMP`,
    [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
  );
}

export async function removePushSubscription(endpoint) {
  if (!endpoint) return;
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function removePushSubscriptionsForUser(userId) {
  await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
}

export default pool;

process.on('SIGTERM', async () => {
  await pool.end();
  console.log('Database connection pool closed');
});
