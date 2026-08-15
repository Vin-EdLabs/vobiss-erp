// backend/routes/profile.js  ← REPLACE EVERYTHING WITH THIS
import express from 'express';
import bcrypt from 'bcrypt';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import jwt from 'jsonwebtoken';
import { insertAuditLog } from '../db.js';   // ← THIS IS CRITICAL

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) return cb(new Error('Choose an image file'));
    cb(null, true);
  },
});

// Helper: Get client IP
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         'unknown';
};

// GET CURRENT USER
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      'SELECT id, username, first_name, last_name, email, phone, department, role, avatar_url FROM users WHERE id = $1 AND deleted_at IS NULL',
      [decoded.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });

    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// UPDATE PROFILE – GUARANTEED AUDIT LOGGING
router.post('/update', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  let userId;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.id;
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  const ip = getClientIp(req);
  const { username, currentPassword, newPassword } = req.body;

  if (!username && !newPassword) {
    return res.status(400).json({ message: 'Nothing to update' });
  }

  try {
    // Get current user
    const userRes = await pool.query(
      'SELECT username, password FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const user = userRes.rows[0];
    const changes = [];

    // === CHANGE USERNAME ===
    if (username && username.trim().toLowerCase() !== user.username) {
      const newUsername = username.trim().toLowerCase();

      const exists = await pool.query(
        'SELECT 1 FROM users WHERE username = $1 AND id != $2',
        [newUsername, userId]
      );
      if (exists.rowCount > 0) {
        return res.status(400).json({ message: 'Username already taken' });
      }

      await pool.query('UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2', [
        newUsername,
        userId,
      ]);
      changes.push(`username: "${user.username}" → "${newUsername}"`);
    }

    // === CHANGE PASSWORD ===
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password required' });
      }

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        await insertAuditLog(userId, 'change_password_failed', ip, { reason: 'wrong_password' });
        return res.status(400).json({ message: 'Current password incorrect' });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [
        hashed,
        userId,
      ]);
      changes.push('password changed');
      await insertAuditLog(userId, 'change_password_success', ip);
    }

    // FINAL AUDIT LOG — THIS WILL ALWAYS RUN IF ANYTHING CHANGED
    if (changes.length > 0) {
      await insertAuditLog(userId, 'update_profile', ip, {
        changes: changes.join(' | '),
        from_ip: ip
      });
    }

    // Get fresh user data
    const fresh = await pool.query(
      'SELECT id, username, first_name, last_name, email, role, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    res.json({
      message: 'Profile updated successfully!',
      user: fresh.rows[0]
    });

  } catch (error) {
    console.error('Profile update error:', error);
    await insertAuditLog(userId || 0, 'update_profile_error', ip, { error: error.message });
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/avatar', avatarUpload.single('photo'), async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  let userId;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (!req.file) return res.status(400).json({ message: 'Choose a photo' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  try {
    await pool.query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
      [avatarUrl, userId]
    );
    res.json({ avatar_url: avatarUrl });
  } catch (error) {
    console.error('Avatar update error:', error);
    res.status(500).json({ message: 'Could not save photo' });
  }
});

export default router;