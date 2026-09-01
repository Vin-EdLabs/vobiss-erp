import pool from '../db.js';
import { isSystemAdminAccount, userHasAnyRole, effectiveUnitsForUser, MANAGER_ROLES, SUPERVISOR_ROLES } from '../roles.js';

/**
 * Archive — department/global file library. Deliberately stored OUTSIDE the publicly-static
 * `/uploads` mount (see backend/server.js's `express.static(uploadsStaticPath, ...)`, which
 * serves every existing ticket/request/field-work attachment with no auth check on the file
 * URL itself). Archive is the first feature in this app with real per-file permission
 * requirements (a unit folder must 403 a non-member), which a public static mount can't
 * enforce — so archive files live in their own non-static directory and are only ever
 * reachable through the authenticated download/preview routes below. Same technology (local
 * disk + multer) as every other upload in this app, just correctly scoped.
 */

const ALLOWED_EXTENSIONS = new Set(['pdf', 'xls', 'xlsx', 'csv', 'doc', 'docx', 'kmz', 'kml', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip']);
const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30MB — slightly above the 25MB used elsewhere in the app

let tableReady = false;
export async function ensureArchiveTables() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS archive_folders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      scope VARCHAR(20) NOT NULL CHECK (scope IN ('global','unit','private')),
      unit_slug VARCHAR(60),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT archive_folders_unit_required CHECK (scope IN ('global','private') OR unit_slug IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS archive_folders_scope_unit_idx ON archive_folders (scope, unit_slug);
    CREATE INDEX IF NOT EXISTS archive_folders_private_owner_idx ON archive_folders (created_by) WHERE scope = 'private';

    CREATE TABLE IF NOT EXISTS archive_files (
      id SERIAL PRIMARY KEY,
      folder_id INTEGER NOT NULL REFERENCES archive_folders(id) ON DELETE CASCADE,
      original_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(120),
      extension VARCHAR(20),
      size_bytes BIGINT,
      file_path TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS archive_files_folder_created_idx ON archive_files (folder_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS archive_files_uploaded_by_idx ON archive_files (uploaded_by);
  `);

  // Migration-safe widening for installs that already had the table with the old
  // ('global','unit')-only scope check. Also re-scopes the name-uniqueness rule so a
  // private folder's uniqueness is per-owner (unit_slug is NULL for every private folder,
  // so the old index would otherwise let one person's private folder name block another's).
  try {
    await pool.query(`ALTER TABLE archive_folders DROP CONSTRAINT IF EXISTS archive_folders_scope_check`);
    await pool.query(`ALTER TABLE archive_folders ADD CONSTRAINT archive_folders_scope_check CHECK (scope IN ('global','unit','private'))`);
    await pool.query(`ALTER TABLE archive_folders DROP CONSTRAINT IF EXISTS archive_folders_unit_required`);
    await pool.query(`ALTER TABLE archive_folders ADD CONSTRAINT archive_folders_unit_required CHECK (scope IN ('global','private') OR unit_slug IS NOT NULL)`);
    await pool.query(`DROP INDEX IF EXISTS archive_folders_name_scope_unit_idx`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS archive_folders_name_scope_unit_idx
        ON archive_folders (lower(name), scope, COALESCE(unit_slug, ''), COALESCE(CASE WHEN scope = 'private' THEN created_by END, 0))
    `);
  } catch (e) {
    console.warn('archive_folders scope migration:', e.message);
  }

  tableReady = true;
}

export function isArchiveStaff(user) {
  const role = String(user?.role || '').toLowerCase();
  const mainRole = String(user?.main_role || '').toLowerCase();
  return role !== 'customer' && mainRole !== 'customer';
}

function isAdminTier(user) {
  return isSystemAdminAccount(user) || userHasAnyRole(user, ['director', 'cto']);
}

function isUnitManagerOf(user, unitSlug) {
  if (!unitSlug) return false;
  if (!userHasAnyRole(user, [...MANAGER_ROLES, ...SUPERVISOR_ROLES])) return false;
  return effectiveUnitsForUser(user).includes(unitSlug);
}

export function canViewFolder(user, folder) {
  // Private folders are visible ONLY to the person who created them — deliberately not
  // even to admins/directors, unlike every other scope in this file. That's the whole
  // point of "private": no bypass.
  if (folder.scope === 'private') return folder.created_by === user.id;
  if (isAdminTier(user)) return true;
  if (!isArchiveStaff(user)) return false;
  if (folder.scope === 'global') return true;
  return effectiveUnitsForUser(user).includes(folder.unit_slug);
}

export function canCreateInScope(user, scope, unitSlug) {
  if (scope === 'private') return isArchiveStaff(user);
  if (isAdminTier(user)) return true;
  if (!isArchiveStaff(user)) return false;
  if (scope === 'global') return true;
  return effectiveUnitsForUser(user).includes(unitSlug);
}

export function canManageFile(user, file, folder) {
  if (folder.scope === 'private') return folder.created_by === user.id;
  if (isAdminTier(user)) return true;
  if (file.uploaded_by === user.id) return true;
  if (folder.scope === 'unit') return isUnitManagerOf(user, folder.unit_slug);
  return false;
}

export function canManageFolder(user, folder) {
  if (folder.scope === 'private') return folder.created_by === user.id;
  if (isAdminTier(user)) return true;
  if (folder.scope === 'unit') return isUnitManagerOf(user, folder.unit_slug) || folder.created_by === user.id;
  return folder.created_by === user.id;
}

export function extensionOf(filename) {
  const m = String(filename || '').match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

export { ALLOWED_EXTENSIONS, PREVIEWABLE_EXTENSIONS, MAX_FILE_SIZE };

// ---------------------------------------------------------------------------
// Folder CRUD
// ---------------------------------------------------------------------------

export async function listFolders(user, { scope, unitSlug, q, page = 1, limit = 30 } = {}) {
  await ensureArchiveTables();
  const admin = isAdminTier(user);
  const myUnits = effectiveUnitsForUser(user);
  const params = [];
  const clauses = [];

  // Private folders are never listed for anyone but their owner — that clause applies
  // unconditionally, admins included, before the usual global/unit visibility rules.
  params.push(user.id);
  const ownedByMe = `f.created_by = $${params.length}`;
  if (admin) {
    clauses.push(`(f.scope != 'private' OR ${ownedByMe})`);
  } else {
    params.push(myUnits);
    clauses.push(`(f.scope = 'global' OR (f.scope = 'unit' AND f.unit_slug = ANY($${params.length}::text[])) OR (f.scope = 'private' AND ${ownedByMe}))`);
  }
  if (scope) { params.push(scope); clauses.push(`f.scope = $${params.length}`); }
  if (unitSlug) { params.push(unitSlug); clauses.push(`f.unit_slug = $${params.length}`); }
  if (q) { params.push(`%${q}%`); clauses.push(`f.name ILIKE $${params.length}`); }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 30));
  const offset = (pageNum - 1) * pageSize;

  const countResult = await pool.query(`SELECT COUNT(*) FROM archive_folders f ${where}`, params);
  const rowsParams = [...params, pageSize, offset];
  const result = await pool.query(
    `SELECT f.id, f.name, f.description, f.scope, f.unit_slug, f.created_by, f.created_at, f.updated_at,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS created_by_name,
            (SELECT COUNT(*) FROM archive_files af WHERE af.folder_id = f.id) AS file_count
     FROM archive_folders f
     LEFT JOIN users u ON u.id = f.created_by
     ${where}
     ORDER BY f.scope ASC, f.name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    rowsParams
  );

  return {
    folders: result.rows.map((r) => ({ ...r, file_count: Number(r.file_count) })),
    total: Number(countResult.rows[0].count),
    page: pageNum,
    limit: pageSize,
  };
}

export async function getFolder(id) {
  await ensureArchiveTables();
  const r = await pool.query(`SELECT * FROM archive_folders WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function createFolder(user, { name, description, scope, unitSlug }) {
  await ensureArchiveTables();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Folder name is required');
  if (!['global', 'unit', 'private'].includes(scope)) throw new Error('scope must be global, unit, or private');
  if (scope === 'unit' && !unitSlug) throw new Error('unitSlug is required for a department folder');
  if (!canCreateInScope(user, scope, unitSlug)) throw new Error('You do not have access to create a folder in this scope');

  try {
    const result = await pool.query(
      `INSERT INTO archive_folders (name, description, scope, unit_slug, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cleanName, description || null, scope, scope === 'unit' ? unitSlug : null, user.id]
    );
    return result.rows[0];
  } catch (e) {
    if (e.code === '23505') throw new Error('A folder with this name already exists in this scope');
    throw e;
  }
}

export async function renameFolder(user, id, { name, description }) {
  await ensureArchiveTables();
  const folder = await getFolder(id);
  if (!folder) throw new Error('Folder not found');
  if (!canManageFolder(user, folder)) throw new Error('You do not have permission to edit this folder');
  const result = await pool.query(
    `UPDATE archive_folders SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING *`,
    [id, name ? String(name).trim() : null, description]
  );
  return result.rows[0];
}

export async function deleteFolder(user, id) {
  await ensureArchiveTables();
  const folder = await getFolder(id);
  if (!folder) throw new Error('Folder not found');
  if (!canManageFolder(user, folder)) throw new Error('You do not have permission to delete this folder');
  const admin = isAdminTier(user);
  const count = await pool.query(`SELECT COUNT(*) FROM archive_files WHERE folder_id = $1`, [id]);
  if (Number(count.rows[0].count) > 0 && !admin) {
    throw new Error('This folder still has files in it — remove them first, or ask an admin to delete it');
  }
  await pool.query(`DELETE FROM archive_folders WHERE id = $1`, [id]);
  return { deleted: true, filesRemoved: Number(count.rows[0].count) };
}

// ---------------------------------------------------------------------------
// File CRUD
// ---------------------------------------------------------------------------

export async function listFiles(user, folderId, { q, page = 1, limit = 30 } = {}) {
  await ensureArchiveTables();
  const folder = await getFolder(folderId);
  if (!folder) throw new Error('Folder not found');
  if (!canViewFolder(user, folder)) throw new Error('You do not have access to this folder');

  const params = [folderId];
  let where = 'af.folder_id = $1';
  if (q) { params.push(`%${q}%`); where += ` AND af.display_name ILIKE $${params.length}`; }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 30));
  const offset = (pageNum - 1) * pageSize;

  const countResult = await pool.query(`SELECT COUNT(*) FROM archive_files af WHERE ${where}`, params);
  const result = await pool.query(
    `SELECT af.id, af.folder_id, af.original_name, af.display_name, af.mime_type, af.extension, af.size_bytes, af.uploaded_by, af.created_at,
            COALESCE(NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.username) AS uploaded_by_name
     FROM archive_files af
     LEFT JOIN users u ON u.id = af.uploaded_by
     WHERE ${where}
     ORDER BY af.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, offset]
  );

  return { folder, files: result.rows.map((r) => ({ ...r, size_bytes: r.size_bytes != null ? Number(r.size_bytes) : null })), total: Number(countResult.rows[0].count), page: pageNum, limit: pageSize };
}

export async function getFile(id) {
  await ensureArchiveTables();
  const r = await pool.query(`SELECT * FROM archive_files WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

export async function recordUpload(user, folderId, { originalName, displayName, mimeType, extension, sizeBytes, filePath }) {
  await ensureArchiveTables();
  const result = await pool.query(
    `INSERT INTO archive_files (folder_id, original_name, display_name, mime_type, extension, size_bytes, file_path, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [folderId, originalName, displayName || originalName, mimeType || null, extension || null, sizeBytes || null, filePath, user.id]
  );
  return result.rows[0];
}

export async function renameOrMoveFile(user, id, { displayName, folderId }) {
  await ensureArchiveTables();
  const file = await getFile(id);
  if (!file) throw new Error('File not found');
  const folder = await getFolder(file.folder_id);
  if (!canManageFile(user, file, folder)) throw new Error('You do not have permission to edit this file');

  let targetFolderId = file.folder_id;
  if (folderId != null && Number(folderId) !== file.folder_id) {
    const targetFolder = await getFolder(folderId);
    if (!targetFolder) throw new Error('Target folder not found');
    if (targetFolder.scope !== folder.scope || targetFolder.unit_slug !== folder.unit_slug) {
      throw new Error('Files can only be moved within the same scope');
    }
    if (!canViewFolder(user, targetFolder)) throw new Error('You do not have access to the target folder');
    targetFolderId = targetFolder.id;
  }

  const result = await pool.query(
    `UPDATE archive_files SET display_name = COALESCE($2, display_name), folder_id = $3 WHERE id = $1 RETURNING *`,
    [id, displayName ? String(displayName).trim() : null, targetFolderId]
  );
  return result.rows[0];
}

export async function deleteFile(user, id) {
  await ensureArchiveTables();
  const file = await getFile(id);
  if (!file) throw new Error('File not found');
  const folder = await getFolder(file.folder_id);
  if (!canManageFile(user, file, folder)) throw new Error('You do not have permission to delete this file');
  await pool.query(`DELETE FROM archive_files WHERE id = $1`, [id]);
  return file;
}
