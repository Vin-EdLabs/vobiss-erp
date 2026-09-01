import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { authenticateToken } from '../middleware/auth.js';
import { logUserAction } from '../services/activityLog.js';
import { effectiveUnitsForUser, isSystemAdminAccount, userHasAnyRole } from '../roles.js';
import {
  ensureArchiveTables, isArchiveStaff, canViewFolder,
  listFolders, getFolder, createFolder, renameFolder, deleteFolder,
  listFiles, getFile, recordUpload, renameOrMoveFile, deleteFile,
  extensionOf, ALLOWED_EXTENSIONS, PREVIEWABLE_EXTENSIONS, MAX_FILE_SIZE,
} from '../services/archive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const router = express.Router();

// Deliberately NOT under backend/uploads — see the comment at the top of services/archive.js.
const storageDir = path.join(__dirname, '..', 'archive-storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

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
        const record = await recordUpload(req.user, folderId, {
          originalName: f.originalname, displayName: f.originalname, mimeType: f.mimetype,
          extension: ext, sizeBytes: f.size, filePath: f.path,
        });
        saved.push(record);
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
    if (fs.existsSync(file.file_path)) fs.unlink(file.file_path, () => {});
    await logUserAction(req.user, { actionType: 'archive_file_deleted', recordType: 'archive_file', recordId: file.id, description: `You deleted "${file.display_name}" from Archive` });
    res.json({ deleted: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

async function authorizeFileAccess(req, res) {
  const file = await getFile(Number(req.params.id));
  if (!file) { res.status(404).json({ error: 'File not found' }); return null; }
  const folder = await getFolder(file.folder_id);
  if (!folder || !canViewFolder(req.user, folder)) { res.status(403).json({ error: 'You do not have access to this file' }); return null; }
  if (!fs.existsSync(file.file_path)) { res.status(404).json({ error: 'The file is missing from storage' }); return null; }
  return file;
}

// GET /api/archive/files/:id/download — streamed, never buffered.
router.get('/files/:id/download', async (req, res) => {
  try {
    const file = await authorizeFileAccess(req, res);
    if (!file) return;
    res.download(file.file_path, file.display_name || file.original_name);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/archive/files/:id/preview — inline stream for pdf/images only.
router.get('/files/:id/preview', async (req, res) => {
  try {
    const file = await authorizeFileAccess(req, res);
    if (!file) return;
    if (!PREVIEWABLE_EXTENSIONS.has(String(file.extension || '').toLowerCase())) {
      return res.status(415).json({ error: 'Preview is not available for this file type — download it instead.' });
    }
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.display_name || file.original_name)}"`);
    fs.createReadStream(file.file_path).pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
