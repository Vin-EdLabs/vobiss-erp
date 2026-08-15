import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  getItems, addItem, updateItem, deleteItem,
  getCategories, addCategory, updateCategory, deleteCategory,
  getItemsOut, issueItem, getLowStockItems, getDashboardStats,
  createRequest, getRequests, approveRequest, finalizeRequest, getRequestDetails,
  updateRequest, rejectRequest, getUserByUsername, insertAuditLog, getAuditLogs,
  getSupervisors, addSupervisor, updateSupervisor, deleteSupervisor,
  initDB, getSettings, updateSetting,
  getUsers, createUser, resetUserPassword, updateUserRole, updateUser, deleteUser,
  getApprovers, backupDatabase, restoreDatabase, wipeDatabase
} from './db.js';
import pool from './db.js';
import { sendLowStockAlert as originalSendLowStockAlert } from './emailService.js';
import profileRoutes from './routes/profile.js';
import fieldRoutes from './routes/field.js';
import { notifyOnNewRequest } from './routes/telegramNotifier.js';

dotenv.config({ path: path.join(dirname(fileURLToPath(import.meta.url)), '.env') });
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(dirname(fileURLToPath(import.meta.url)), '.env.production'), override: true });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed!'), false);
  }
});

// MIDDLEWARE
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static('uploads'));
app.use('/api/profile', profileRoutes);
app.use('/api/field', fieldRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, '../dist')));

// AUTH MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Super Admin access required' });
  next();
};

const requireSuperAdminOrIssuer = (req, res, next) => {
  if (!['superadmin', 'issuer'].includes(req.user.role)) return res.status(403).json({ error: 'Super Admin or Issuer access required' });
  next();
};

const requireManager = (req, res, next) => {
  const allowed = ['superadmin', 'issuer', 'approver'];
  if (!allowed.includes(req.user.role)) return res.status(403).json({ error: 'Manager access required' });
  next();
};

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
}

// INIT DB + SEED SUPERADMIN
(async () => {
  await initDB();
  const existing = await getUserByUsername('superadmin');
  if (!existing) {
    const hashed = await bcrypt.hash('@vobissadmin-v', 10);
    await pool.query(
      'INSERT INTO users (first_name, last_name, username, email, password, role) VALUES ($1, $2, $3, $4, $5, $6)',
      ['Admin', 'Super', 'superadmin', 'admin@vobiss.com', hashed, 'superadmin']
    );
    console.log('Default superadmin created');
  }
})();

// GLOBAL EMAIL FUNCTION
global.sendLowStockAlert = async (lowStockItems = [], supervisors = [], testRecipient = null) => {
  try {
    const dbSettings = await getSettings();

    const smtpConfig = {
      host: dbSettings.smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(dbSettings.smtp_port || process.env.SMTP_PORT || '587'),
      secure: (dbSettings.smtp_encryption || 'tls').toLowerCase() === 'ssl',
      auth: {
        user: dbSettings.smtp_username || process.env.SMTP_USER,
        pass: dbSettings.smtp_password || process.env.SMTP_PASS,
      },
    };

    const fromName = dbSettings.from_name || process.env.FROM_NAME || 'Vobiss Inventory System';
    const fromEmail = dbSettings.from_email || process.env.FROM_EMAIL || process.env.SMTP_USER;

    const isTest = !!testRecipient;
    const recipients = isTest ? [testRecipient] : supervisors.map(s => s.email).filter(Boolean);

    if (recipients.length === 0 && !isTest) return;

    const subject = isTest ? 'Test Email – Vobiss Inventory System' : 'Low Stock Alert';
    const html = isTest
      ? `<h2>Test Email Successful!</h2><p>Your company email settings are working perfectly.</p><p>From: ${fromEmail}</p>`
      : null;

    await originalSendLowStockAlert(lowStockItems, supervisors, recipients, subject, html, fromName, fromEmail, smtpConfig);
  } catch (error) {
    console.error('Email failed:', error);
    throw error;
  }
};

// =============================================================================
// ALL ROUTES — FULLY INCLUDED + FIELD ROLES SUPPORTED
// =============================================================================

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getUserByUsername(username);
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    const ip = getClientIp(req);
    const details = { userAgent: req.get('User-Agent') };
    await insertAuditLog(user.id, 'login', ip, details);
    res.json({
      token,
      user: {
        username: user.username,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: `${user.first_name} ${user.last_name}`.trim()
      }
    });
  } catch (error) {
    console.error('Error in login:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const details = { userAgent: req.get('User-Agent') };
    await insertAuditLog(req.user.id, 'logout', ip, details);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error in logout:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audit-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await getAuditLogs();
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/approvers', authenticateToken, async (req, res) => {
  try {
    const approvers = await getApprovers();
    res.json(approvers);
  } catch (error) {
    console.error('Error fetching approvers:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const updated = await updateSetting(key, value);
    res.json(updated);
  } catch (error) {
    console.error('Error updating setting:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backup', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { developerCode } = req.body;
    if (!developerCode) return res.status(400).json({ error: 'Developer code is required' });
    const backup = await backupDatabase(developerCode);
    res.json(backup);
  } catch (error) {
    console.error('Error creating backup:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/restore', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { backup, developerCode } = req.body;
    if (!backup || !developerCode) return res.status(400).json({ error: 'Backup data and developer code are required' });
    const backupData = typeof backup === 'string' ? JSON.parse(backup) : backup;
    await restoreDatabase(backupData, developerCode);
    res.json({ message: 'Database restored successfully' });
  } catch (error) {
    console.error('Error restoring database:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wipe', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { developerCode } = req.body;
    if (!developerCode) return res.status(400).json({ error: 'Developer code is required' });
    const result = await wipeDatabase(developerCode);
    res.json(result);
  } catch (error) {
    console.error('Error wiping database:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/supervisors', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const supervisors = await getSupervisors();
    res.json(supervisors);
  } catch (error) {
    console.error('Error fetching supervisors:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supervisors', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const supervisor = await addSupervisor(req.body);
    res.status(201).json(supervisor);
  } catch (error) {
    console.error('Error adding supervisor:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/supervisors/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const supervisorId = parseInt(req.params.id);
    const supervisor = await updateSupervisor(supervisorId, req.body);
    res.json(supervisor);
  } catch (error) {
    console.error('Error updating supervisor:', error.stack);
    res.status(error.message === 'Supervisor not found' ? 404 : 400).json({ error: error.message });
  }
});

app.delete('/api/supervisors/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await deleteSupervisor(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    console.error('Error deleting supervisor:', error.stack);
    res.status(error.message === 'Supervisor not found' ? 404 : 500).json({ error: error.message });
  }
});

// =============================================================================
// USER MANAGEMENT — NOW SUPPORTS FIELD ROLES 100%
// =============================================================================

app.get('/api/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, role, userId, ip } = req.body;

    const validRoles = ['requester', 'approver', 'issuer', 'superadmin', 'field_engineer', 'field_engineer_admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = await createUser(
      first_name,
      last_name,
      email,
      role,
      userId || req.user.id,
      ip || getClientIp(req)
    );
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id/role', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role, currentUserId, ip } = req.body;

    const validRoles = ['requester', 'approver', 'issuer', 'superadmin', 'field_engineer', 'field_engineer_admin'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const user = await updateUserRole(userId, role, currentUserId || req.user.id, ip || getClientIp(req));
    res.json(user);
  } catch (error) {
    console.error('Error updating user role:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const updates = req.body;
    const { currentUserId, ip } = req.body;

    const user = await updateUser(userId, updates, currentUserId || req.user.id, ip || getClientIp(req));
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error.stack);
    res.status(error.message.includes('already exists') ? 400 : (error.message.includes('not found') ? 404 : 500)).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { currentUserId, ip } = req.body;

    const result = await deleteUser(userId, currentUserId || req.user.id, ip || getClientIp(req));
    res.json(result);
  } catch (error) {
    console.error('Error deleting user:', error.stack);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

app.post('/api/users/:id/reset-password', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { currentUserId, ip } = req.body;

    const result = await resetUserPassword(userId, currentUserId || req.user.id, ip || getClientIp(req));
    res.json(result);
  } catch (error) {
    console.error('Error resetting password:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

// =============================================================================
// ALL OTHER ROUTES — 100% COMPLETE
// =============================================================================

app.post('/api/send-low-stock-alert', authenticateToken, async (req, res) => {
  try {
    const { lowStockItems, supervisors } = req.body;
    await sendLowStockAlert(lowStockItems, supervisors);
    res.json({ message: 'Low stock alert sent successfully to supervisors (or no items to alert about)' });
  } catch (error) {
    console.error('Error in manual low stock alert trigger:', error);
    res.status(500).json({ error: 'Failed to send alert: ' + error.message });
  }
});

app.get('/api/items', authenticateToken, async (req, res) => {
  try {
    const items = await getItems();
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items', authenticateToken, upload.single('receiptImage'), async (req, res) => {
  try {
    const itemData = req.body;
    let receiptImages = [];
    if (req.file) receiptImages = [`/uploads/${req.file.filename}`];
    const ip = getClientIp(req);
    const item = await addItem({ ...itemData, receipt_images: JSON.stringify(receiptImages) }, req.user.id, ip);
    const parsedQuantity = parseInt(itemData.quantity, 10);
    const threshold = item.low_stock_threshold || 5;
    if (parsedQuantity <= threshold) {
      sendLowStockAlert([item]).catch(err => console.error('Alert failed after item add:', err));
    }
    res.status(201).json(item);
  } catch (error) {
    console.error('Error adding item - Full stack:', error.stack);
    res.status(500).json({ error: `Failed to add item: ${error.message}` });
  }
});

app.put('/api/items/:id', authenticateToken, upload.single('receiptImage'), async (req, res) => {
  try {
    const itemId = parseInt(req.params.id);
    const currentItems = await getItems();
    const currentItem = currentItems.find(item => item.id === itemId);
    if (!currentItem) return res.status(404).json({ error: 'Item not found' });
    const itemData = req.body;
    let receiptImages = typeof currentItem.receipt_images === 'string' ? JSON.parse(currentItem.receipt_images) : currentItem.receipt_images || [];
    if (req.file) receiptImages.push(`/uploads/${req.file.filename}`);
    const updatedItemData = { ...itemData, receipt_images: JSON.stringify(receiptImages) };
    const ip = getClientIp(req);
    const item = await updateItem(itemId, updatedItemData, req.user.id, ip);
    const oldQuantity = parseInt(currentItem.quantity, 10);
    const newQuantity = parseInt(itemData.quantity, 10);
    const threshold = item.low_stock_threshold || 5;
    if (newQuantity < oldQuantity && newQuantity <= threshold) {
      sendLowStockAlert([item]).catch(err => console.error('Alert failed after item update:', err));
    }
    res.json(item);
  } catch (error) {
    console.error(`Error updating item ID ${req.params.id} - Full stack:`, error.stack);
    res.status(error.message === 'Item not found' ? 404 : 500).json({ error: `Failed to update item: ${error.message}` });
  }
});

app.delete('/api/items/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const currentItems = await getItems();
    const itemToDelete = currentItems.find(item => item.id === parseInt(req.params.id));
    if (itemToDelete) {
      let receiptImages = typeof itemToDelete.receipt_images === 'string' ? JSON.parse(itemToDelete.receipt_images) : itemToDelete.receipt_images || [];
      receiptImages.forEach(imgPath => {
        try { fs.unlinkSync(`.${imgPath}`); } catch (e) { console.warn('Could not delete image:', e); }
      });
    }
    const ip = getClientIp(req);
    const result = await deleteItem(req.params.id, req.user.id, ip);
    res.json(result);
  } catch (error) {
    console.error(`Error deleting item ID ${req.params.id} - Full stack:`, error.stack);
    res.status(error.message === 'Item not found' ? 404 : 500).json({ error: error.message });
  }
});

app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const category = await addCategory(req.body, req.user.id, ip);
    res.status(201).json(category);
  } catch (error) {
    console.error('Error adding category - Full stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/categories/:id', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const category = await updateCategory(req.params.id, req.body, req.user.id, ip);
    res.json(category);
  } catch (error) {
    console.error(`Error updating category ID ${req.params.id} - Full stack:`, error.stack);
    res.status(error.message === 'Category not found' ? 404 : 500).json({ error: error.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await deleteCategory(req.params.id, req.user.id, ip);
    res.json(result);
  } catch (error) {
    console.error(`Error deleting category ID ${req.params.id} - Full stack:`, error.stack);
    res.status(error.message === 'Category not found' ? 404 : 500).json({ error: error.message });
  }
});

app.get('/api/items-out', authenticateToken, async (req, res) => {
  try {
    const itemsOut = await getItemsOut();
    res.json(itemsOut);
  } catch (error) {
    console.error('Error fetching items out:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/items-out', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const itemOut = await issueItem(req.body, req.user.id, ip);
    sendLowStockAlert().catch(err => console.error('Alert failed after item issue:', err));
    res.status(201).json(itemOut);
  } catch (error) {
    console.error('Error issuing item:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/low-stock', authenticateToken, async (req, res) => {
  try {
    const lowStockItems = await getLowStockItems();
    res.json(lowStockItems);
  } catch (error) {
    console.error('Error fetching low stock items:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard-stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests', authenticateToken, async (req, res) => {
  try {
    const { selectedApproverIds, type = 'material_request', ...requestData } = req.body;
    if (!selectedApproverIds || !Array.isArray(selectedApproverIds) || selectedApproverIds.length === 0) {
      return res.status(400).json({ error: 'At least one selected approver is required' });
    }

    const ip = getClientIp(req);
    const request = await createRequest(requestData, selectedApproverIds, type, req.user.id, ip);

    // THIS LINE MUST BE AFTER createRequest() SO request.id EXISTS
    notifyOnNewRequest(req.user.username, requestData.items?.length || 0, request.id);

    res.status(201).json(request);
  } catch (error) {
    console.error('Error creating request - Full stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/requests', authenticateToken, async (req, res) => {
  try {
    const requests = await getRequests(req.user.role, req.user.id);
    res.json(requests);
  } catch (error) {
    console.error('Error fetching requests:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/requests/:id', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await updateRequest(req.params.id, req.body, req.user.id, ip);
    res.json(result);
  } catch (error) {
    console.error(`Error updating request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests/:id/reject', authenticateToken, requireManager, async (req, res) => {
  try {
    const { reason, rejectorName } = req.body;
    const ip = getClientIp(req);
    const result = await rejectRequest(req.params.id, req.user.id, ip, { reason, rejectorName });
    res.json(result);
  } catch (error) {
    console.error(`Error rejecting request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests/:id/approve', authenticateToken, async (req, res) => {
  try {
    const ip = getClientIp(req);
    const result = await approveRequest(req.params.id, req.body, req.user.id, ip);
    res.json(result);
  } catch (error) {
    console.error(`Error approving request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests/:id/finalize', authenticateToken, requireSuperAdminOrIssuer, async (req, res) => {
  try {
    const { items, releasedBy } = req.body;
    const ip = getClientIp(req);
    const result = await finalizeRequest(req.params.id, items, releasedBy, req.user.id, ip);
    res.json(result);
  } catch (error) {
    console.error(`Error finalizing request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/requests/:id', authenticateToken, async (req, res) => {
  try {
    const request = await getRequestDetails(req.params.id);
    res.json(request);
  } catch (error) {
    console.error('Error fetching request details:', error.stack);
    res.status(error.message === 'Request not found' ? 404 : 500).json({ error: error.message });
  }
});

// NEW ROUTE: FIELD ENGINEER ADMIN CAN SEE ALL FIELD USERS
app.get('/api/field/users', authenticateToken, async (req, res) => {
  try {
    // Allow superadmin + field_engineer_admin
    if (!['superadmin', 'field_engineer_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(`
      SELECT id, first_name, last_name, username, email, role 
      FROM users 
      WHERE role IN ('field_engineer', 'field_engineer_admin') 
        AND deleted_at IS NULL 
      ORDER BY first_name, last_name
    `);
    
    const users = result.rows.map(u => ({
      id: u.id,
      fullName: `${u.first_name} ${u.last_name}`.trim(),
      username: u.username,
      email: u.email,
      role: u.role
    }));

    res.json(users);
  } catch (error) {
    console.error('Error fetching field users:', error);
    res.status(500).json({ error: 'Failed to load field team' });
  }
});

// SPA FALLBACK
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// START SERVER
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`Client: ${process.env.CLIENT_URL}`);
});