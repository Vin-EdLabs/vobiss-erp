import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import { authenticateOrShareToken } from '../middleware/shareAuth.js';
import { logUserAction } from '../services/activityLog.js';
import { effectiveUnitsForUser, isSystemAdminAccount, userHasAnyRole } from '../roles.js';
import pool from '../db.js';
import {
  ensureArchiveTables, isArchiveStaff, canViewFolder,
  listFolders, getFolder, createFolder, renameFolder, deleteFolder,
  listFiles, getFile, recordUpload, renameOrMoveFile, deleteFile,
  listShareableFolders, copyFileToFolder,
  extensionOf, ALLOWED_EXTENSIONS, PREVIEWABLE_EXTENSIONS, MAX_FILE_SIZE,
} from '../services/archive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

// Deliberately NOT under backend/uploads — see the comment at the top of services/archive.js.
const storageDir = path.join(__dirname, '..', 'archive-storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });
const thumbsDir = path.join(storageDir, 'thumbnails');
if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** Best-effort — a failed thumbnail never blocks the actual upload. */
async function generateThumbnail(sourcePath, sourceFilename) {
  try {
    const thumbName = `thumb-${path.basename(sourceFilename, path.extname(sourceFilename))}.webp`;
    const thumbPath = path.join(thumbsDir, thumbName);
    await sharp(sourcePath).resize(320, 320, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumbPath);
    return thumbPath;
  } catch (e) {
    console.warn('[archive] thumbnail generation failed:', e.message);
    return null;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storageDir),
  filename: (_req, file, cb) => cb(null, `arc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname || '')}`),
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = extensionOf(file.originalname);
    if (ALLOWED_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error(`File type .${ext || '?'} is not allowed in Archive`));
  },
});

// Shared in-flight promise, not a boolean set after the await — otherwise every request that
// arrives before the first init finishes (a real burst right after a restart) starts its own
// parallel init run, and duplicate ALTER TABLE/ADD CONSTRAINT calls race and fail under load.
let initPromise = null;
router.use(async (_req, _res, next) => {
  try {
    if (!initPromise) initPromise = ensureArchiveTables();
    await initPromise;
    next();
  } catch (e) {
    initPromise = null;
    next(e);
  }
});
// Registered before the router-wide auth gate below so a valid share token can serve these
// three read-only file routes without a user session — that's what lets a "Public" share
// link actually work for someone outside the app. Every other route in this file (including
// mutations) still requires full authentication.
async function resolveSharedOrOwnFile(req, res) {
  const fileId = req.isSharedView ? Number(req.shareLink.record_id) : Number(req.params.id);
  const file = await getFile(fileId);
  if (!file) { res.status(404).json({ error: 'File not found' }); return null; }
  if (!req.isSharedView) {
    const folder = await getFolder(file.folder_id);
    if (!folder || !canViewFolder(req.user, folder)) { res.status(403).json({ error: 'You do not have access to this file' }); return null; }
  }
  return file;
}

// GET /api/archive/files/:id — metadata only, for the file preview page (in-app or shared).
router.get('/files/:id', authenticateOrShareToken('archive_file', authenticateToken), async (req, res) => {
  try {
    const file = await resolveSharedOrOwnFile(req, res);
    if (!file) return;
    const { file_path, thumbnail_path, ...meta } = file;
    res.json({ ...meta, has_thumbnail: Boolean(thumbnail_path) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/archive/files/:id/thumbnail — small inline image, images only.
router.get('/files/:id/thumbnail', authenticateOrShareToken('archive_file', authenticateToken), async (req, res) => {
  try {
    const file = await resolveSharedOrOwnFile(req, res);
    if (!file) return;
    if (!file.thumbnail_path || !fs.existsSync(file.thumbnail_path)) {
      return res.status(404).json({ error: 'No thumbnail available for this file' });
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(file.thumbnail_path).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/archive/files/:id/download — streamed, never buffered.
router.get('/files/:id/download', authenticateOrShareToken('archive_file', authenticateToken), async (req, res) => {
  try {
    const file = await resolveSharedOrOwnFile(req, res);
    if (!file) return;
    if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: 'The file is missing from storage' });
    res.download(file.file_path, file.display_name || file.original_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/archive/files/:id/preview — inline stream for pdf/images only.
router.get('/files/:id/preview', authenticateOrShareToken('archive_file', authenticateToken), async (req, res) => {
  try {
    const file = await resolveSharedOrOwnFile(req, res);
    if (!file) return;
    if (!fs.existsSync(file.file_path)) return res.status(404).json({ error: 'The file is missing from storage' });
    if (!PREVIEWABLE_EXTENSIONS.has(String(file.extension || '').toLowerCase())) {
      return res.status(415).json({ error: 'Preview is not available for this file type — download it instead.' });
    }
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.display_name || file.original_name)}"`);
    fs.createReadStream(file.file_path).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.use(authenticateToken);

const requireArchiveStaff = (req, res, next) =>
  isArchiveStaff(req.user) ? next() : res.status(403).json({ error: 'Archive is available to staff accounts only' });

router.use(requireArchiveStaff);

// GET /api/archive/units — units the caller may create a department folder in, for the New Folder dropdown.
const KNOWN_UNITS = ['noc', 'ip', 'ts', 'project', 'design', 'sales', 'finance', 'procurement', 'cx', 'hr'];
router.get('/units', (req, res) => {
  const isAdmin = isSystemAdminAccount(req.user) || userHasAnyRole(req.user, ['director', 'cto']);
  const units = isAdmin ? KNOWN_UNITS : KNOWN_UNITS.filter((u) => effectiveUnitsForUser(req.user).includes(u));
  res.json({ units });
});

// GET /api/archive/folders/shareable — every global/unit folder in the system (never private
// ones), for the "share a copy to another folder" picker. Registered before the ":folderId"
// route below so "shareable" is never mistaken for a folder id.
router.get('/folders/shareable', async (req, res) => {
  try {
    const folders = await listShareableFolders(req.user);
    res.json({ folders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/archive/folders?scope=&unitSlug=&q=&page=&limit=
router.get('/folders', async (req, res) => {
  try {
    const data = await listFolders(req.user, {
      scope: req.query.scope, unitSlug: req.query.unitSlug, q: req.query.q,
      page: req.query.page, limit: req.query.limit,
    });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/archive/folders
router.post('/folders', async (req, res) => {
  try {
    const folder = await createFolder(req.user, req.body || {});
    const scopeLabel = folder.scope === 'global' ? 'Global' : folder.scope === 'private' ? 'Private' : folder.unit_slug;
    await logUserAction(req.user, {
      actionType: 'archive_folder_created', recordType: 'archive_folder', recordId: folder.id,
      description: `You created the "${folder.name}" archive folder (${scopeLabel})`,
    });
    res.status(201).json(folder);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH /api/archive/folders/:id
router.patch('/folders/:id', async (req, res) => {
  try {
    const folder = await renameFolder(req.user, Number(req.params.id), req.body || {});
    res.json(folder);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/archive/folders/:id
router.delete('/folders/:id', async (req, res) => {
  try {
    const folder = await getFolder(Number(req.params.id));
    const result = await deleteFolder(req.user, Number(req.params.id));
    if (folder) {
      await logUserAction(req.user, { actionType: 'archive_folder_deleted', recordType: 'archive_folder', recordId: folder.id, description: `You deleted the "${folder.name}" archive folder` });
    }
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// GET /api/archive/folders/:folderId/files?q=&page=&limit=
router.get('/folders/:folderId/files', async (req, res) => {
  try {
    const data = await listFiles(req.user, Number(req.params.folderId), { q: req.query.q, page: req.query.page, limit: req.query.limit });
    res.json(data);
  } catch (e) { res.status(e.message === 'Folder not found' ? 404 : 403).json({ error: e.message }); }
});

// POST /api/archive/folders/:folderId/files — multipart upload, one or more files.
router.post('/folders/:folderId/files', (req, res) => {
  upload.array('files', 10)(req, res, async (err) => {
    if (err) return res.status(err.message?.includes('not allowed') ? 415 : 400).json({ error: err.message || 'Upload failed' });
    try {
      const folderId = Number(req.params.folderId);
      const folder = await getFolder(folderId);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      if (!canViewFolder(req.user, folder)) return res.status(403).json({ error: 'You do not have access to this folder' });
      // Upload permission mirrors view permission for the folder's own unit; global stays open to any staff (already enforced by requireArchiveStaff above).

      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'No files were uploaded' });

      const saved = [];
      for (const f of files) {
        const ext = extensionOf(f.originalname);
        const thumbnailPath = IMAGE_EXTENSIONS.has(ext) ? await generateThumbnail(f.path, f.filename) : null;
        const record = await recordUpload(req.user, folderId, {
          originalName: f.originalname, displayName: f.originalname, mimeType: f.mimetype,
          extension: ext, sizeBytes: f.size, filePath: f.path, thumbnailPath,
        });
        saved.push({ ...record, has_thumbnail: Boolean(record.thumbnail_path), thumbnail_path: undefined });
        await logUserAction(req.user, { actionType: 'archive_file_uploaded', recordType: 'archive_file', recordId: record.id, description: `You uploaded "${f.originalname}" to the "${folder.name}" archive folder` });
      }
      res.status(201).json({ files: saved });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
});

// PATCH /api/archive/files/:id — rename or move.
router.patch('/files/:id', async (req, res) => {
  try {
    const file = await renameOrMoveFile(req.user, Number(req.params.id), req.body || {});
    res.json(file);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/archive/files/:id
router.delete('/files/:id', async (req, res) => {
  try {
    const file = await deleteFile(req.user, Number(req.params.id));
    // A "share to another folder" copy points at the same on-disk file (and thumbnail) as
    // its source — only remove the bytes once no archive_files row references them anymore.
    const stillReferenced = await pool.query(`SELECT 1 FROM archive_files WHERE file_path = $1 LIMIT 1`, [file.file_path]);
    if (stillReferenced.rowCount === 0) {
      if (fs.existsSync(file.file_path)) fs.unlink(file.file_path, () => {});
      if (file.thumbnail_path && fs.existsSync(file.thumbnail_path)) fs.unlink(file.thumbnail_path, () => {});
    }
    await logUserAction(req.user, { actionType: 'archive_file_deleted', recordType: 'archive_file', recordId: file.id, description: `You deleted "${file.display_name}" from Archive` });
    res.json({ deleted: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/archive/files/:id/copy-to — share a copy of this file into another folder,
// including one owned by a different department. The original is untouched.
router.post('/files/:id/copy-to', async (req, res) => {
  try {
    const { folderId } = req.body || {};
    if (!folderId) return res.status(400).json({ error: 'folderId is required' });
    const copy = await copyFileToFolder(req.user, Number(req.params.id), Number(folderId));
    await logUserAction(req.user, {
      actionType: 'archive_file_shared', recordType: 'archive_file', recordId: copy.id,
      description: `You shared a copy of "${copy.display_name}" into another folder`,
    });
    res.status(201).json(copy);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

export default router;
