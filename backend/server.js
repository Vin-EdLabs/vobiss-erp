// server.js - FULLY FIXED VERSION (December 24, 2025)
// Finalize route now correctly handles waybill and has debug logging
// All other routes unchanged and working

import express from 'express';
import http from 'http';
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
  getUsers, createUser, getUserByLogin, resetUserPassword, updateUserRole, updateUser, deleteUser,
  getApprovers, getWorkflowConfig, updateWorkflowConfig, backupDatabase, restoreDatabase, wipeDatabase,
  markCashAsReceived,
  getNotificationsForUser, createNotification, markNotificationRead, deleteNotification,
  getUserWorkspace,
  upsertFcmToken, removeFcmToken,
  upsertPushSubscription, removePushSubscription
} from './db.js';
import pool from './db.js';
import { sendLowStockAlert as originalSendLowStockAlert } from './emailService.js';
import profileRoutes from './routes/profile.js';
import fieldRoutes from './routes/field.js';
import cxRoutes from './routes/cx.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import customerRoutes from './routes/customer.routes.js';
import ticketRoutes from './routes/ticket.routes.js';  // ✅ ADD THIS
import staffTicketRoutes from './routes/staff_ticket.routes.js';
import assetRoutes from './routes/assets.routes.js';
import projectRequestRoutes from './routes/project.routes.js';
import {
  migrateUserRoleConstraint,
  isValidSystemRole,
  normalizeSystemRole,
  invalidRoleMessage,
  userHasAnyRole,
} from './roles.js';
import {
  canApproveCashRequest,
  canApproveMaterialRequest,
  canCreateCashRequest,
  canCreateMaterialRequest,
  canBypassApprovalRestrictions,
  canExecuteMaterial,
  canReleaseCash,
  canAccessGlobalDashboard,
  getPrimaryUnit,
  getSystemRole,
} from './permissions.js';
import { processAutoEscalations } from './ticketEscalation.js';
import { startInboundEmailService } from './inboundEmailService.js';
import { attachSocketIO } from './realtime/socket.js';
import { setupChatSocket } from './realtime/chatSocket.js';
import chatRoutes from './routes/chat.js';
import chatActionsRoutes from './routes/chatActions.js';
import chatAdminRoutes from './routes/chatAdmin.js';
import chatContextRoutes from './routes/chatContext.js';
import globalSearchRoutes from './routes/globalSearch.routes.js';
import vobiRoutes from './routes/vobi.js';
import hrRoutes from './routes/hr.js';
import hrSelfRoutes from './routes/hrSelf.js';
import { registerTodoRoutes } from './routes/todos.js';
import { initHrSchema, seedHrDemo } from './db/hr.js';
import { initFieldSchema } from './db/field.js';
import { initChat } from './services/chatInit.js';
import {
  postRequestSystemMessage,
  postTicketSystemMessage,
  syncRequestPendingApprovalMessages,
} from './services/chatSystemMessage.js';
import { ensureRequestThread } from './services/chatRecordThreads.js';
import { getRealtimeIo } from './realtime/channels.js';
import { emitToUser, emitToStaff } from './realtime/channels.js';
import { sendPushToUserIds as fcmSendToUserIds, sendPushBroadcast as fcmBroadcast } from './push/fcm.js';
import {
  getPublicKey as getVapidPublicKey,
  isWebPushConfigured,
  sendWebPushToUserIds,
  sendWebPushBroadcast,
} from './push/webpush.js';

// Unified push wrappers: send via native Web Push AND (optionally) FCM.
async function sendPushToUserIds(userIds, payload) {
  const tasks = [sendWebPushToUserIds(userIds, payload)];
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    tasks.push(fcmSendToUserIds(userIds, payload));
  }
  const results = await Promise.allSettled(tasks);
  const sent = results.reduce((n, r) => n + (r.status === 'fulfilled' ? (r.value?.sent || 0) : 0), 0);
  return { sent };
}
async function sendPushBroadcast(payload) {
  const tasks = [sendWebPushBroadcast(payload)];
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    tasks.push(fcmBroadcast(payload));
  }
  const results = await Promise.allSettled(tasks);
  const sent = results.reduce((n, r) => n + (r.status === 'fulfilled' ? (r.value?.sent || 0) : 0), 0);
  return { sent };
}
import { authenticateToken } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.join(__dirname, '.env.production'), override: true });
}

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsPath = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Allow images and PDF receipts
    if (file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    if (file.mimetype === 'application/pdf') {
      return cb(null, true);
    }
    return cb(new Error('Only image or PDF files are allowed!'), false);
  }
});

// MIDDLEWARE
const clientOrigin = process.env.CLIENT_URL;
const corsOrigins = [
  clientOrigin,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (corsOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return cb(null, true);
    }
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
// Serve uploaded files statically
const uploadsStaticPath = path.join(__dirname, 'uploads');
console.log('[Server] Serving uploads from:', uploadsStaticPath);
const UPLOAD_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
function sniffUploadMime(filePath) {
  try {
    const buf = Buffer.alloc(16);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
    return null;
  } catch {
    return null;
  }
}

app.use('/uploads', express.static(uploadsStaticPath, {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const sniffed = sniffUploadMime(filePath);
    const mime = UPLOAD_MIME[ext] || sniffed;
    if (mime) {
      res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    const q = res.req?.query || {};
    const origin = res.req?.headers?.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    const rawName = String(q.name || path.basename(filePath)).replace(/["\r\n\\]/g, '');
    const disposition = q.download ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${rawName}"`);
  }
}));
app.use('/api/profile', profileRoutes);
app.use('/api/field', fieldRoutes);
app.use('/api/cx', cxRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/customer/tickets', ticketRoutes);  // ✅ ADD THIS
app.use('/api/tickets', staffTicketRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/project-request', projectRequestRoutes);
/** @deprecated use /api/project-request */
app.use('/api/production', projectRequestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chat', chatActionsRoutes);
app.use('/api/chat/admin', chatAdminRoutes);
app.use('/api/chat/context', chatContextRoutes);
app.use('/api/search', globalSearchRoutes);
app.use('/api/vobi', vobiRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/hr-self', hrSelfRoutes);
registerTodoRoutes(app, authenticateToken);
// Frontend build — after API routes so POST /api/* is never swallowed by static
app.use(express.static(path.join(__dirname, '../dist')));


// ────────────────────────────────────────────────
// DYNAMIC PWA MANIFEST
// ────────────────────────────────────────────────
app.get('/manifest.json', (req, res) => {
  const referer = (req.headers.referer || '').toLowerCase();

  const isCustomer = referer.includes('/customer');

  const manifest = {
    name: isCustomer ? 'Vobiss Customer Portal' : 'Vobiss Erp',
    short_name: isCustomer ? 'Vobiss Cust' : 'Vobiss Erp',
    description: 'Vobiss Erp — field engineering, assets, and inventory',

    // Staff PWA opens at login; customer portal keeps its own entry
    start_url: isCustomer ? '/customer/login' : '/login',

    scope: '/',
    id: isCustomer ? '/customer' : '/',  // keeps separation

    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait-primary',

    icons: [
      {
        src: '/vobiss-logo-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/vobiss-logo-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/vobiss-logo-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],

    // Shortcuts for long-press menu (optional but nice)
    shortcuts: [
      {
        name: 'Customer Portal',
        short_name: 'Customer',
        url: '/customer/login',
        icons: [{ src: '/vobiss-logo-192.png', sizes: '192x192', type: 'image/png' }]
      },
      {
        name: 'Staff Dashboard',
        short_name: 'Staff',
        url: '/login',
        icons: [{ src: '/vobiss-logo-192.png', sizes: '192x192', type: 'image/png' }]
      }
    ]
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.json(manifest);
});

// Firebase Messaging SW (separate scope from Vite PWA — see client register())
app.get('/firebase-messaging-sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
  const cfg = firebaseWebConfigJson();
  res.send(`importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
firebase.initializeApp(${cfg});
var messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload) {
  var title = (payload.notification && payload.notification.title) || 'Vobiss';
  var body = (payload.notification && payload.notification.body) || '';
  var data = payload.data || {};
  var isChat = data.type === 'chat_message' || data.type === 'chat_mention';
  return self.registration.showNotification(title, {
    body: body,
    icon: '/vobiss-logo-192.png',
    badge: '/vobiss-logo-192.png',
    data: data,
    tag: data.tag || 'vobiss',
    renotify: true,
    requireInteraction: data.requireInteraction === '1' || data.type === 'announcement',
    vibrate: [120, 60, 120, 60, 200],
    actions: [
      { action: 'open', title: isChat ? 'Open chat' : 'Open Vobiss' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
});
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  var d = event.notification.data || {};
  var url = new URL(d.url || d.link || '/', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.url && 'focus' in c) {
        return c.focus().then(function(client) {
          if (client && 'navigate' in client) return client.navigate(url);
          return client;
        });
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
`);
});


const requireSuperAdmin = (req, res, next) => {
  if (!['system_admin', 'superadmin', 'admin'].includes(getSystemRole(req.user))) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireUserManager = (req, res, next) => {
  if (!['system_admin', 'superadmin', 'admin'].includes(getSystemRole(req.user))) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireSuperAdminOrIssuer = (req, res, next) => {
  if (!canExecuteMaterial(req.user)) return res.status(403).json({ error: 'Procurement access required' });
  next();
};

const requireSuperAdminOrDirector = (req, res, next) => {
  if (getSystemRole(req.user) !== 'superadmin' && !canAccessGlobalDashboard(req.user)) {
    return res.status(403).json({ error: 'Super Admin or Director access required' });
  }
  next();
};

const requireManager = (req, res, next) => {
  if (!canApproveMaterialRequest(req.user) && !canApproveCashRequest(req.user) && !canReleaseCash(req.user)) {
    return res.status(403).json({ error: 'Approval access required' });
  }
  next();
};

async function getFreshPermissionUser(userId) {
  const result = await pool.query(
    `SELECT id, username, first_name, last_name, role, main_role, roles, units, unit, position
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const user = result.rows[0];
  if (!user) return null;
  const roles = user.roles && (typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles);
  const units = user.units && (typeof user.units === 'string' ? JSON.parse(user.units) : user.units);
  return {
    ...user,
    main_role: user.main_role || user.role,
    roles: Array.isArray(roles) && roles.length > 0 ? roles : [user.role],
    units: Array.isArray(units) ? units : [],
  };
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection?.remoteAddress || 'unknown';
}

function firebaseWebConfigJson() {
  return JSON.stringify({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || '',
  });
}

/**
 * Send real-time + push + in-app notification about a request status change.
 *
 * @param {number|string} requestId
 * @param {string} action  request_approved | request_rejected | request_finalized | cash_received
 * @param {object} [meta]  optional context (approverName, stage, approvalsCount, approvalsRequired, reason, newStatus)
 */
async function notifyRequestRealtime(requestId, action, meta = {}) {
  try {
    const r = await pool.query(
      'SELECT id, type, status, created_by_id, total_amount FROM requests WHERE id = $1 AND deleted_at IS NULL',
      [requestId]
    );
    const row = r.rows[0];
    const url = row
      ? row.type === 'cash_request'
        ? `/cash-details/${row.id}`
        : row.type === 'item_return'
          ? `/item-returns/${row.id}`
          : `/request-forms/${row.id}`
      : '/';

    // Compose user-visible strings
    const isCash = row?.type === 'cash_request';
    const isReturn = row?.type === 'item_return';
    const kind = isCash ? 'cash request' : isReturn ? 'item return' : 'material request';
    const requestLabel = `${kind} #${row?.id ?? requestId}`;
    const approverName = (meta.approverName || '').trim();
    const stage = meta.stage || (isCash ? 'approver' : 'approver');
    const approvalsCount = Number.isFinite(meta.approvalsCount) ? meta.approvalsCount : null;
    const approvalsRequired = Number.isFinite(meta.approvalsRequired) ? meta.approvalsRequired : null;
    const stageLabel = stage === 'finance' ? 'Finance' : stage === 'director' ? 'Director' : 'Approver';

    let title;
    let body;
    if (action === 'request_rejected') {
      title = `Your ${kind} was rejected`;
      body = approverName
        ? `${approverName} (${stageLabel}) rejected your ${requestLabel}.`
        : `Your ${requestLabel} was rejected. Tap to view details.`;
      if (meta.reason) body += ` Reason: ${meta.reason}`;
    } else if (action === 'request_finalized') {
      title = `Your ${kind} was completed`;
      body = `Your ${requestLabel} has been finalized and is ready.`;
    } else if (action === 'cash_received') {
      title = 'Cash marked received';
      body = `Cash for ${requestLabel} was marked received.`;
    } else if (action === 'request_approved') {
      const progress =
        approvalsCount != null && approvalsRequired != null && stage !== 'finance'
          ? ` (${approvalsCount} of ${approvalsRequired})`
          : '';
      title = approverName
        ? `${approverName} approved your ${kind}${progress}`
        : `Your ${kind} was approved${progress}`;
      if (meta.newStatus === 'supervisor_approved') {
        body = isCash
          ? `All supervisor approvals received. Waiting on Finance to release funds for ${requestLabel}.`
          : `All approvals received. ${requestLabel} is now ready for issuance.`;
      } else if (meta.newStatus === 'finance_approved') {
        body = `Finance has released funds for ${requestLabel}. Ready for collection.`;
      } else if (approvalsCount != null && approvalsRequired != null) {
        const remaining = Math.max(0, approvalsRequired - approvalsCount);
        body = remaining > 0
          ? `Awaiting ${remaining} more approval${remaining === 1 ? '' : 's'} on ${requestLabel}.`
          : `All approvals collected on ${requestLabel}.`;
      } else {
        body = `Your ${requestLabel} was approved by ${stageLabel}.`;
      }
    } else {
      title = `${kind} update`;
      body = `Your ${requestLabel} was updated. Tap to view.`;
    }

    const payload = {
      topic: 'requests',
      action,
      requestId: Number(requestId),
      requestType: row?.type,
      approverName: approverName || undefined,
      stage,
      stageLabel,
      approvalsCount: approvalsCount ?? undefined,
      approvalsRequired: approvalsRequired ?? undefined,
      newStatus: meta.newStatus ?? row?.status,
      url,
      title,
      body,
    };

    emitToStaff('staff:realtime', payload);
    if (row?.created_by_id) {
      emitToUser(row.created_by_id, 'staff:realtime', { ...payload, forRequester: true });
      await sendPushToUserIds([row.created_by_id], {
        title,
        body,
        data: { url, type: 'request', action, requestId: String(requestId) },
      });
    }
  } catch (e) {
    console.warn('[realtime] notifyRequestRealtime:', e.message);
  }
}

// INIT DB + SEED SUPERADMIN
(async () => {
  await initDB();
  await initHrSchema(pool);
  await initFieldSchema(pool);
  await initChat();
  await migrateUserRoleConstraint(pool);
  await seedHrDemo(pool);
  const existing = await getUserByUsername('superadmin');
  if (!existing) {
    const hashed = await bcrypt.hash('@vobissadmin-v', 10);
    await pool.query(
      `INSERT INTO users (first_name, last_name, username, email, password, role, main_role, unit, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['System', 'Admin', 'superadmin', 'admin@vobiss.com', hashed, 'superadmin', 'superadmin', null, 'System Admin']
    );
    console.log('Default System Admin created');
    await initChat();
  } else {
    await pool.query(
      `UPDATE users
       SET first_name = 'System',
           last_name = 'Admin',
           position = 'System Admin',
           role = 'superadmin',
           main_role = 'superadmin',
           roles = jsonb_build_array('superadmin')
       WHERE username = 'superadmin'`
    );
  }
  console.log('Database ready');
})().catch((err) => {
  console.error('Database init failed:', err);
});

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
// ALL ROUTES
// =============================================================================

function publicAccountFields(row = {}) {
  const status = String(row.status || 'active').toLowerCase();
  const unsuspendAck = row.unsuspend_ack !== false;
  return {
    status,
    suspension_reason: status === 'suspended' ? (row.suspension_reason || null) : null,
    unsuspend_reason: unsuspendAck ? null : (row.unsuspend_reason || null),
    unsuspend_ack: unsuspendAck,
  };
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const loginId = (username || '').trim();
    const user = await getUserByLogin(loginId);
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const accountStatus = String(user.status || 'active').toLowerCase();
    if (accountStatus && accountStatus !== 'active' && accountStatus !== 'suspended') {
      return res.status(403).json({ error: 'Your account is inactive. Contact HR.' });
    }
    
    // Determine main_role: use main_role if set, otherwise fall back to role
    const mainRole = user.main_role || user.role || 'requester';
    const roles = user.roles && Array.isArray(user.roles) && user.roles.length > 0 
      ? user.roles 
      : [user.role || 'requester'];
    const units = user.units && Array.isArray(user.units) ? user.units : [];
    const permissionUser = { ...user, main_role: mainRole, roles, units };
    
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username, 
      role: user.role,  // Keep for backward compatibility
      main_role: mainRole,  // Main role for sidebar
      roles: roles,  // All roles for permissions
      units: units,   // Units for access control
      unit: user.unit || null,
      position: user.position || null,
      permissions: {
        system_role: getSystemRole(permissionUser),
        primary_unit: getPrimaryUnit(permissionUser),
        can_access_global_dashboard: canAccessGlobalDashboard(permissionUser),
      }
    }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    
    const ip = getClientIp(req);
    const details = { userAgent: req.get('User-Agent') };
    await insertAuditLog(user.id, 'login', ip, details);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,  // Keep for backward compatibility
        main_role: mainRole,  // Main role for sidebar
        roles: roles,  // All roles
        units: units,  // Units
        unit: user.unit || null,
        position: user.position || null,
        permissions: {
          system_role: getSystemRole(permissionUser),
          primary_unit: getPrimaryUnit(permissionUser),
          can_create_material_request: canCreateMaterialRequest(permissionUser),
          can_create_cash_request: canCreateCashRequest(permissionUser),
          can_approve_material_request: canApproveMaterialRequest(permissionUser),
          can_execute_material: canExecuteMaterial(permissionUser),
          can_approve_cash_request: canApproveCashRequest(permissionUser),
          can_release_cash: canReleaseCash(permissionUser),
          can_access_global_dashboard: canAccessGlobalDashboard(permissionUser),
        },
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: `${user.first_name} ${user.last_name}`.trim(),
        avatar_url: user.avatar_url || null,
        ...publicAccountFields(user),
      }
    });
  } catch (error) {
    console.error('Error in login:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Current user (fresh from DB) — so sidebar/role reflect admin changes without re-login
app.get('/api/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, role, main_role, roles, units, unit, position, status,
              suspension_reason, unsuspend_reason, unsuspend_ack, avatar_url
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    const dbUser = result.rows[0];
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    const meStatus = String(dbUser.status || 'active').toLowerCase();
    if (meStatus && meStatus !== 'active' && meStatus !== 'suspended') {
      return res.status(403).json({ error: 'Your account is inactive. Contact HR.' });
    }
    const mainRole = dbUser.main_role || dbUser.role || 'requester';
    const roles = dbUser.roles && (typeof dbUser.roles === 'string' ? JSON.parse(dbUser.roles) : dbUser.roles);
    const rolesArr = Array.isArray(roles) && roles.length > 0 ? roles : [dbUser.role || 'requester'];
    const units = dbUser.units && (typeof dbUser.units === 'string' ? JSON.parse(dbUser.units) : dbUser.units);
    const unitsArr = Array.isArray(units) ? units : [];
    const permissionUser = { ...dbUser, main_role: mainRole, roles: rolesArr, units: unitsArr };
    res.json({
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      main_role: mainRole,
      roles: rolesArr,
      units: unitsArr,
      unit: dbUser.unit || null,
      position: dbUser.position || null,
      permissions: {
        system_role: getSystemRole(permissionUser),
        primary_unit: getPrimaryUnit(permissionUser),
        can_create_material_request: canCreateMaterialRequest(permissionUser),
        can_create_cash_request: canCreateCashRequest(permissionUser),
        can_approve_material_request: canApproveMaterialRequest(permissionUser),
        can_execute_material: canExecuteMaterial(permissionUser),
        can_approve_cash_request: canApproveCashRequest(permissionUser),
        can_release_cash: canReleaseCash(permissionUser),
        can_access_global_dashboard: canAccessGlobalDashboard(permissionUser),
      },
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
      full_name: `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim(),
      avatar_url: dbUser.avatar_url || null,
      ...publicAccountFields(dbUser),
    });
  } catch (error) {
    console.error('Error in /api/me:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/me/ack-unsuspend', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET unsuspend_ack = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error in /api/me/ack-unsuspend:', error.stack);
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
    const permissionUser = await getFreshPermissionUser(req.user.id);
    if (
      getSystemRole(permissionUser || req.user) !== 'admin' &&
      !userHasAnyRole(permissionUser || req.user, ['director', 'cto', 'superadmin']) &&
      !canAccessGlobalDashboard(permissionUser || req.user)
    ) {
      return res.status(403).json({ error: 'Access denied' });
    }
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

app.post('/api/settings/:key', authenticateToken, requireSuperAdmin, async (req, res) => {
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

// Workflow configuration (approval settings) — read for any authenticated, write superadmin only
app.get('/api/config/workflow', authenticateToken, async (req, res) => {
  try {
    const config = await getWorkflowConfig();
    res.json(config);
  } catch (error) {
    console.error('Error fetching workflow config:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/config/workflow', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const config = await updateWorkflowConfig(req.body);
    res.json(config);
  } catch (error) {
    console.error('Error updating workflow config:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to update workflow config' });
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

app.get('/api/users', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const { first_name, last_name, email, role, password, sendEmail, useAutoGenerate, unit, position, units } = req.body;
    const normalizedRole = normalizeSystemRole(role);
    if (!normalizedRole) return res.status(400).json({ error: invalidRoleMessage(role) });
    if (normalizedRole === 'system_admin' || normalizedRole === 'superadmin') {
      return res.status(403).json({ error: 'Superadmin cannot be assigned. Use Admin for system access.' });
    }
    const user = await createUser(first_name, last_name, email, normalizedRole, req.user.id, getClientIp(req), {
      password,
      useAutoGenerate: useAutoGenerate === true,
      sendEmail: sendEmail === true,
      unit,
      position,
      units: Array.isArray(units) ? units : [],
    });
    // User is always persisted before optional email; never fail the HTTP request on SMTP errors.
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error.stack);
    const msg = error?.message || 'Failed to create user';
    if (msg.includes('welcome email') || msg.includes('Unexpected socket close')) {
      return res.status(400).json({
        error: 'User may have been created but the server returned an email error. Restart the backend and try again without "Email credentials".',
      });
    }
    res.status(400).json({ error: msg });
  }
});

app.put('/api/users/:id/role', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    if (!isValidSystemRole(role)) return res.status(400).json({ error: 'Invalid role' });
    if (role === 'system_admin' || role === 'superadmin') {
      return res.status(403).json({ error: 'Superadmin cannot be assigned. Use Admin for system access.' });
    }
    const user = await updateUserRole(userId, role, req.user.id, getClientIp(req));
    res.json(user);
  } catch (error) {
    console.error('Error updating user role:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { currentUserId: _cu, ip: _ip, ...updates } = req.body;
    if (updates.role === 'system_admin' || updates.role === 'superadmin') {
      return res.status(403).json({ error: 'Superadmin cannot be assigned. Use Admin for system access.' });
    }
    const user = await updateUser(userId, updates, req.user.id, getClientIp(req));
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error.stack);
    res.status(error.message.includes('already exists') ? 400 : (error.message.includes('not found') ? 404 : 500)).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const result = await deleteUser(userId, req.user.id, getClientIp(req));
    res.json(result);
  } catch (error) {
    console.error('Error deleting user:', error.stack);
    res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
  }
});

app.post('/api/users/:id/reset-password', authenticateToken, requireUserManager, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { password, sendEmail } = req.body || {};
    const result = await resetUserPassword(userId, req.user.id, getClientIp(req), {
      password,
      sendEmail: sendEmail === true,
    });
    res.json(result);
  } catch (error) {
    console.error('Error resetting password:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

// SYSTEM NOTIFICATIONS

app.get('/api/workspace', authenticateToken, async (req, res) => {
  try {
    const data = await getUserWorkspace(req.user.id);
    res.json(data);
  } catch (error) {
    console.error('Error fetching workspace:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const rows = await getNotificationsForUser(req.user.id);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notifications:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notifications', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    const notif = await createNotification(title, message, req.user.id);
    emitToStaff('staff:realtime', {
      topic: 'notifications',
      action: 'new',
      id: notif.id,
      title: title.trim(),
      body: message.trim(),
      url: '/workspace',
    });

    // Broadcast a real push notification to ALL subscribed devices (web + mobile PWA).
    let pushResult = { sent: 0 };
    try {
      pushResult = await sendPushBroadcast({
        title: title.trim(),
        body: message.trim().slice(0, 240),
        data: { url: '/dashboard', type: 'announcement', requireInteraction: '1' },
      });
      console.log(`[notifications] broadcast sent to ${pushResult.sent} device(s)`);
    } catch (e) {
      console.error('[notifications] broadcast failed:', e.message);
    }

    res.status(201).json({ ...notif, push: pushResult });
  } catch (error) {
    console.error('Error creating notification:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Diagnostics for admins: how many devices are subscribed across all push channels
app.get('/api/push/stats', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const web = await pool.query('SELECT COUNT(*)::int AS c FROM push_subscriptions');
    let fcm = 0;
    try {
      const r = await pool.query('SELECT COUNT(*)::int AS c FROM fcm_tokens');
      fcm = r.rows[0].c;
    } catch {/* ignore */}
    const mineWeb = await pool.query(
      'SELECT COUNT(*)::int AS c FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    let mineFcm = 0;
    try {
      const r = await pool.query(
        'SELECT COUNT(*)::int AS c FROM fcm_tokens WHERE user_id = $1',
        [req.user.id]
      );
      mineFcm = r.rows[0].c;
    } catch {/* ignore */}
    res.json({
      webPushSubscriptions: web.rows[0].c,
      fcmTokens: fcm,
      total: web.rows[0].c + fcm,
      yourDevices: mineWeb.rows[0].c + mineFcm,
      yourWebPushDevices: mineWeb.rows[0].c,
      yourFcmDevices: mineFcm,
      vapidConfigured: Boolean(process.env.VAPID_PUBLIC_KEY),
      fcmConfigured: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a push notification to ONLY the calling user's devices — handy for testing.
app.post('/api/push/test-self', authenticateToken, async (req, res) => {
  try {
    const result = await sendPushToUserIds([req.user.id], {
      title: 'Vobiss test push',
      body: 'If you see this on your screen, push notifications are working on this device.',
      data: { url: '/dashboard', type: 'announcement', requireInteraction: '1' },
    });
    res.json({ ok: true, push: result });
  } catch (e) {
    console.error('test-self push failed:', e.stack);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await markNotificationRead(req.params.id, req.user.id);
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Error marking notification read:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/notifications/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }
    const notif = await deleteNotification(id);
    res.json({ message: 'Notification deleted', notification: notif });
  } catch (error) {
    console.error('Error deleting notification:', error.stack);
    res.status(error.message === 'Notification not found' ? 404 : 500).json({ error: error.message });
  }
});

app.post('/api/push/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }
    await upsertFcmToken(req.user.id, token.trim(), req.get('user-agent'));
    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving FCM token:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/push/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }
    await removeFcmToken(req.user.id, token.trim());
    res.json({ ok: true });
  } catch (error) {
    console.error('Error removing FCM token:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/push/test-broadcast', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const result = await sendPushBroadcast({
      title: 'Vobiss test notification',
      body: 'If you received this, push notifications are working.',
      data: { url: '/dashboard', type: 'test' },
    });
    emitToStaff('staff:realtime', { topic: 'notifications', action: 'test' });
    res.json({ ok: true, push: result });
  } catch (error) {
    console.error('Test push error:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// ─── Native Web Push (VAPID) endpoints ────────────────────────────────────────
app.get('/api/push/public-key', (_req, res) => {
  res.json({ key: getVapidPublicKey(), configured: isWebPushConfigured() });
});

app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Invalid subscription payload' });
    }
    await upsertPushSubscription(req.user.id, subscription, req.get('user-agent'));
    res.json({ ok: true });
  } catch (error) {
    console.error('subscribe error:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/push/subscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await removePushSubscription(endpoint);
    res.json({ ok: true });
  } catch (error) {
    console.error('unsubscribe error:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-low-stock-alert', authenticateToken, async (req, res) => {
  try {
    const { lowStockItems, supervisors } = req.body;
    await sendLowStockAlert(lowStockItems, supervisors);
    res.json({ message: 'Low stock alert sent successfully' });
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
    const permissionUser = await getFreshPermissionUser(req.user.id);
    if (!permissionUser) return res.status(401).json({ error: 'User not found' });
    if (!canExecuteMaterial(permissionUser)) {
      return res.status(403).json({ error: 'Only Procurement can issue items' });
    }
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

const validationErrorResponse = (res, error, fieldErrors = []) => res.status(400).json({
  errorCode: 'VALIDATION_FAILED',
  error,
  fieldErrors,
});

const validateRequestPayload = (requestData = {}, selectedApproverIds = [], requestType = 'material_request', lineItems = []) => {
  const fieldErrors = [];
  const add = (field, message) => fieldErrors.push({ field, message });

  if (!Array.isArray(selectedApproverIds) || selectedApproverIds.length === 0) {
    add('approver_ids', 'Select at least one approver for this request.');
  }

  if (requestType === 'cash_request') {
    if (!String(requestData.purpose || '').trim()) add('purpose', 'Purpose is required for cash requests.');
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      add('line_items', 'Add at least one expense item.');
    } else {
      const validLineItem = lineItems.some((item) =>
        String(item.description || '').trim() &&
        Number(item.qty) > 0 &&
        Number(item.unitPrice) >= 0
      );
      if (!validLineItem) add('line_items', 'Each cash request needs a description, quantity, and unit price.');
    }
    return fieldErrors;
  }

  if (!String(requestData.teamLeaderName || requestData.createdBy || '').trim()) add('teamLeaderName', 'Team leader/requester name is required.');
  if (!String(requestData.projectName || '').trim()) add('projectName', 'Project name is required.');
  if (!String(requestData.location || '').trim()) add('location', 'Location is required.');
  if (!String(requestData.receivedBy || '').trim()) add('receivedBy', 'Received by is required.');

  const items = Array.isArray(requestData.items) ? requestData.items : [];
  if (items.length === 0) {
    add('items', 'Add at least one item to the request.');
  } else {
    items.forEach((item, index) => {
      if (!String(item.name || '').trim()) add(`items.${index}.name`, `Item ${index + 1} needs an item name.`);
      const quantity = requestType === 'item_return' ? item.quantity_requested : item.requested;
      if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
        add(`items.${index}.quantity`, `Item ${index + 1} needs a quantity greater than 0.`);
      }
    });
  }

  return fieldErrors;
};

app.post('/api/requests', authenticateToken, async (req, res) => {
  try {
    let requestData, selectedApproverIds, requestType = 'material_request', lineItems = [], ticket_id = null;

    if (req.body.requestData && req.body.selectedApproverIds !== undefined) {
      requestData = req.body.requestData;
      selectedApproverIds = req.body.selectedApproverIds;
      requestType = req.body.requestType || 'cash_request';
      lineItems = req.body.lineItems || [];
      ticket_id = req.body.ticket_id || null;
    } else {
      requestData = req.body;
      selectedApproverIds = req.body.selectedApproverIds || [];
      requestType = req.body.type || 'material_request';
      ticket_id = req.body.ticket_id || null;
    }

    const fieldErrors = validateRequestPayload(requestData, selectedApproverIds, requestType, lineItems);
    if (fieldErrors.length > 0) {
      return validationErrorResponse(
        res,
        `Please fix ${fieldErrors.length} field${fieldErrors.length === 1 ? '' : 's'} before submitting this ${requestType.replace('_', ' ')}.`,
        fieldErrors
      );
    }
    const requesterPermissionUser = await getFreshPermissionUser(req.user.id);
    if (!requesterPermissionUser) return res.status(401).json({ error: 'User not found' });
    if (
      !canBypassApprovalRestrictions(requesterPermissionUser) &&
      selectedApproverIds.map((id) => Number(id)).includes(Number(req.user.id))
    ) {
      return validationErrorResponse(res, 'You cannot assign yourself to approve your own request', [
        { field: 'approver_ids', message: 'Remove yourself from the approver list and choose another eligible approver.' },
      ]);
    }
    const selectedIds = selectedApproverIds.map((id) => Number(id)).filter(Boolean);
    const approverRows = selectedIds.length
      ? await pool.query(
          `SELECT id, username, first_name, last_name, role, main_role, roles, units, unit, position
           FROM users
           WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
          [selectedIds]
        )
      : { rows: [] };
    const validApproverIds = new Set(
      approverRows.rows
        .filter((approver) =>
          requestType === 'cash_request'
            ? canApproveCashRequest(approver)
            : canApproveMaterialRequest(approver)
        )
        .map((approver) => Number(approver.id))
    );
    if (selectedIds.some((id) => !validApproverIds.has(id))) {
      return validationErrorResponse(
        res,
          requestType === 'cash_request'
            ? 'Cash requests can only be assigned to Finance approvers, Directors, or ADMIN SUPER'
            : 'Material requests can only be assigned to valid material approvers',
        [{ field: 'approver_ids', message: 'Choose approvers who have permission for this request type.' }]
      );
    }
    if (requestType === 'cash_request' && !canCreateCashRequest(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to create cash requests' });
    }
    if (requestType !== 'cash_request' && !canCreateMaterialRequest(req.user)) {
      return res.status(403).json({ error: 'You do not have permission to create material requests' });
    }

    const ip = getClientIp(req);
    const newRequest = await createRequest(
      requestData,
      selectedApproverIds,
      requestType,
      req.user.id,
      ip,
      lineItems,
      ticket_id
    );

    await insertAuditLog(
      req.user.id,
      'create_request',
      ip,
      {
        request_id: newRequest.id,
        type: requestType,
        total_amount: requestData.totalAmount || null,
        line_items_count: lineItems.length,
        ticket_id: ticket_id
      }
    );

    const requestKind =
      requestType === 'cash_request'
        ? 'cash request'
        : requestType === 'item_return'
          ? 'item return'
          : 'material request';
    const requestUrl =
      requestType === 'cash_request'
        ? `/cash-details/${newRequest.id}`
        : requestType === 'item_return'
          ? `/item-returns/${newRequest.id}`
          : `/request-forms/${newRequest.id}`;
    const requestTitle = `New ${requestKind} needs approval`;
    const requestBody = `${req.user.username || 'A staff member'} submitted ${requestKind} #${newRequest.id}.`;
    emitToStaff('staff:realtime', {
      topic: 'requests',
      action: 'request_created',
      requestId: newRequest.id,
      type: requestType,
      title: requestTitle,
      body: requestBody,
      url: requestUrl,
    });
    try {
      const approverIds = selectedApproverIds.map((id) => parseInt(id, 10)).filter(Boolean);
      if (approverIds.length) {
        await sendPushToUserIds(approverIds, {
          title: requestTitle,
          body: requestBody,
          data: {
            url: requestUrl,
            type: 'request',
            action: 'request_created',
            requestId: String(newRequest.id),
            tag: `request-created-${newRequest.id}`,
          },
        });
      }
    } catch (e) {
      console.warn('[push] request created push failed:', e.message);
    }
    try {
      const userRow = await pool.query('SELECT first_name, last_name, username FROM users WHERE id = $1', [req.user.id]);
      const actor = userRow.rows[0];
      const actorName = `${actor?.first_name || ''} ${actor?.last_name || ''}`.trim() || actor?.username || req.user.username;
      const recordChannelId = await ensureRequestThread(newRequest, selectedApproverIds, getRealtimeIo());
      await postRequestSystemMessage({
        requestId: newRequest.id,
        requestType,
        action: 'created',
        actorName,
        io: getRealtimeIo(),
        recordChannelId,
      });
    } catch (e) {
      console.warn('[chat] request created system message failed:', e.message);
    }
    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error creating request:', error.stack);
    res.status(400).json({ 
      errorCode: 'VALIDATION_FAILED',
      error: error.message || 'Failed to create request',
      fieldErrors: [],
    });
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
    const result = await updateRequest(req.params.id, req.body, req.user.id, ip, req.user.role);
    res.json(result);
  } catch (error) {
    console.error(`Error updating request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/requests/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { reason, rejectorName } = req.body;
    const ip = getClientIp(req);
    await assertRequestDetailAccess(req.params.id, req.user);
    const permissionUser = await getFreshPermissionUser(req.user.id);
    if (!permissionUser) return res.status(401).json({ error: 'User not found' });
    const requestRow = await pool.query('SELECT type, status, created_by_id FROM requests WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    const request = requestRow.rows[0];
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (Number(request.created_by_id) === Number(req.user.id) && !canBypassApprovalRestrictions(permissionUser)) {
      return res.status(403).json({ error: 'You cannot reject a request that you created' });
    }
    const allowed =
      request.type === 'cash_request'
        ? (request.status === 'supervisor_approved' ? canReleaseCash(permissionUser) : canApproveCashRequest(permissionUser))
        : canApproveMaterialRequest(permissionUser);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to reject this request' });
    }
    const result = await rejectRequest(req.params.id, req.user.id, ip, { reason, rejectorName });
    await notifyRequestRealtime(req.params.id, 'request_rejected', {
      approverName: rejectorName || req.user.username,
      stage: req.user.role === 'finance' ? 'finance' : 'approver',
      reason,
    });
    try {
      const reqRow = await pool.query('SELECT type FROM requests WHERE id = $1', [req.params.id]);
      const requestType = reqRow.rows[0]?.type || 'material_request';
      await postRequestSystemMessage({
        requestId: req.params.id,
        requestType,
        action: 'rejected',
        actorName: rejectorName || req.user.username,
        io: getRealtimeIo(),
      });
      await syncRequestPendingApprovalMessages({
        requestId: req.params.id,
        requestType,
        io: getRealtimeIo(),
        finalState: 'rejected',
      });
    } catch (e) {
      console.warn('[chat] request rejected system message failed:', e.message);
    }
    res.json(result);
  } catch (error) {
    console.error(`Error rejecting request ID ${req.params.id} - Full stack:`, error.stack);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/requests/:id/approve', authenticateToken, async (req, res) => {
  try {
    const requestId = req.params.id;
    const { approverName, signature, stage } = req.body;

    if (!approverName || typeof approverName !== 'string' || approverName.trim() === '') {
      return res.status(400).json({ error: 'approverName is required and must be a non-empty string' });
    }

    // Accept 'approver', 'finance', or 'director' (director for heavy cash)
    if (stage !== 'approver' && stage !== 'finance' && stage !== 'director') {
      return res.status(400).json({ error: `Invalid stage: '${stage}'. Must be 'approver', 'finance', or 'director'` });
    }

    const ip = getClientIp(req);

    console.log(`Approving request ${requestId} as ${stage} by ${approverName}`);

    const result = await approveRequest(
      requestId,
      { approverName: approverName.trim(), signature: signature?.trim() || '', stage },
      req.user.id,
      ip
    );

    console.log(`Request ${requestId} approved successfully as ${stage}`);
    // Fetch progress so we can tell the requester "(2 of 3)" etc.
    let approvalsCount = null;
    let approvalsRequired = null;
    try {
      const reqRow = await pool.query(
        'SELECT type, total_amount FROM requests WHERE id = $1',
        [requestId]
      );
      const requestType = reqRow.rows[0]?.type;
      const totalAmount = parseFloat(reqRow.rows[0]?.total_amount || 0);
      const workflowConfig = await getWorkflowConfig();
      if (requestType === 'cash_request') {
        const thresholds = workflowConfig.finance?.amount_thresholds || [];
        const directorRule = thresholds.find(
          (t) => t.requires_director && t.min_amount != null && totalAmount >= parseFloat(t.min_amount)
        );
        const approverRule = thresholds.find(
          (t) => t.max_amount != null && totalAmount < parseFloat(t.max_amount)
        );
        approvalsRequired = directorRule
          ? Math.max(
              0,
              parseInt(directorRule.required_approvers_before_director, 10) || 0
            ) + 1
          : approverRule?.required_approvers || 2;
      } else {
        approvalsRequired = workflowConfig.material?.required_approvers_count ?? 2;
      }
      const countRes = await pool.query(
        `SELECT COUNT(DISTINCT COALESCE(approver_id::text, 'n-' || approver_name)) AS c
         FROM approvals WHERE request_id = $1`,
        [requestId]
      );
      approvalsCount = parseInt(countRes.rows[0].c, 10);
    } catch (e) {
      console.warn('[approve] progress query failed:', e.message);
    }

    await notifyRequestRealtime(requestId, 'request_approved', {
      approverName: approverName.trim(),
      stage,
      approvalsCount,
      approvalsRequired,
      newStatus: result?.newStatus,
    });
    try {
      const reqRow = await pool.query('SELECT type FROM requests WHERE id = $1', [requestId]);
      const requestType = reqRow.rows[0]?.type || 'material_request';
      await postRequestSystemMessage({
        requestId,
        requestType,
        action: 'approved',
        actorName: approverName.trim(),
        io: getRealtimeIo(),
      });
      await syncRequestPendingApprovalMessages({
        requestId,
        requestType,
        io: getRealtimeIo(),
      });
    } catch (e) {
      console.warn('[chat] request approved system message failed:', e.message);
    }
    res.json(result);
  } catch (error) {
    console.error(`Failed to approve request ${req.params.id}:`, error.message);
    console.error('Stack:', error.stack);
    res.status(error.status || 500).json({ error: error.message || 'Approval failed' });
  }
});

const ASSIGNED_ONLY_REQUEST_ROLES = new Set([
  'approver',
  'finance_manager',
  'noc_manager',
  'noc_supervisor',
  'ip_manager',
  'ip_supervisor',
  'ts_manager',
  'ts_supervisor',
]);

async function assertRequestDetailAccess(requestId, user) {
  const role = String(user.main_role || user.role || '').toLowerCase();
  if (['superadmin', 'director', 'cto'].includes(role)) return;

  const { rows } = await pool.query(
    `SELECT r.id, r.type, r.created_by_id, r.created_by,
            EXISTS (
              SELECT 1 FROM request_approvers ra
              WHERE ra.request_id = r.id AND ra.approver_id = $2
            ) AS assigned_to_user
     FROM requests r
     WHERE r.id = $1 AND r.deleted_at IS NULL`,
    [requestId, user.id]
  );
  const request = rows[0];
  if (!request) {
    const err = new Error('Request not found');
    err.status = 404;
    throw err;
  }

  if (request.created_by_id === user.id || request.assigned_to_user) return;
  if (role === 'finance' && request.type === 'cash_request') return;
  if (['issuer', 'stock_admin'].includes(role) && request.type !== 'cash_request') return;

  if (ASSIGNED_ONLY_REQUEST_ROLES.has(role)) {
    const err = new Error('This request is not assigned to you');
    err.status = 403;
    throw err;
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim().toLowerCase();
  const username = String(user.username || '').toLowerCase();
  const createdBy = String(request.created_by || '').toLowerCase();
  if ((fullName && createdBy.includes(fullName)) || (username && createdBy.includes(username))) return;

  const err = new Error('You do not have permission to view this request');
  err.status = 403;
  throw err;
}

// FIXED FINALIZE ROUTE - Now accepts waybill and has debug logging
app.post('/api/requests/:id/finalize', authenticateToken, async (req, res) => {
  try {
    console.log('=== FINALIZE REQUEST RECEIVED ===');
    console.log('Request ID:', req.params.id);
    console.log('User:', req.user.id, req.user.role);
    console.log('Full body:', req.body);
    console.log('releasedBy:', req.body.releasedBy);
    console.log('items:', req.body.items ? `array of ${req.body.items.length}` : 'missing');
    console.log('waybill:', !!req.body.waybill);

    const { items, releasedBy, waybill } = req.body;

    const ip = getClientIp(req);
    const result = await finalizeRequest(req.params.id, { items, releasedBy, waybill }, req.user.id, ip);
    console.log('Finalize success');
    await notifyRequestRealtime(req.params.id, 'request_finalized');
    try {
      const reqRow = await pool.query('SELECT type FROM requests WHERE id = $1', [req.params.id]);
      await postRequestSystemMessage({
        requestId: req.params.id,
        requestType: reqRow.rows[0]?.type || 'material_request',
        action: 'finalized',
        actorName: releasedBy || req.user.username,
        io: getRealtimeIo(),
      });
    } catch (e) {
      console.warn('[chat] request finalized system message failed:', e.message);
    }
    res.json(result);
  } catch (error) {
    console.error(`Error finalizing request ID ${req.params.id}:`, error.message);
    console.error('Full stack:', error.stack);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/requests/:id', authenticateToken, async (req, res) => {
  try {
    await assertRequestDetailAccess(req.params.id, req.user);
    const request = await getRequestDetails(req.params.id);
    res.json(request);
  } catch (error) {
    console.error('Error fetching request details:', error.stack);
    res.status(error.status || (error.message === 'Request not found' ? 404 : 500)).json({ error: error.message });
  }
});

app.post('/api/requests/:id/cash-received', authenticateToken, async (req, res) => {
  try {
    const { receivedBy } = req.body;
    if (!receivedBy) return res.status(400).json({ error: 'receivedBy is required' });
    const ip = getClientIp(req);
    const result = await markCashAsReceived(req.params.id, receivedBy, req.user.id, ip);
    await notifyRequestRealtime(req.params.id, 'cash_received', {
      approverName: receivedBy,
    });
    try {
      await postRequestSystemMessage({
        requestId: req.params.id,
        requestType: 'cash_request',
        action: 'cash_received',
        actorName: receivedBy,
        io: getRealtimeIo(),
      });
    } catch (e) {
      console.warn('[chat] cash received system message failed:', e.message);
    }
    res.json(result);
  } catch (error) {
    console.error('Error marking cash received:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/field/users', authenticateToken, async (req, res) => {
  try {
    const role = String(req.user?.main_role || req.user?.role || '').toLowerCase();
    const allowed = [
      'superadmin', 'admin', 'hr', 'director', 'cto',
      'field_engineer', 'field_engineer_admin',
      'ts_manager', 'ts_supervisor', 'noc', 'noc_manager', 'noc_supervisor',
      'ip', 'ip_manager', 'ip_supervisor', 'project',
    ];
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const result = await pool.query(`
      SELECT id, first_name, last_name, username, email, role, main_role, unit
      FROM users
      WHERE deleted_at IS NULL
        AND (
          LOWER(COALESCE(role, '')) IN (
            'field_engineer', 'field_engineer_admin', 'noc', 'ip',
            'ts_manager', 'ts_supervisor', 'noc_manager', 'noc_supervisor',
            'ip_manager', 'ip_supervisor'
          )
          OR LOWER(COALESCE(main_role, '')) IN (
            'field_engineer', 'field_engineer_admin', 'noc', 'ip',
            'ts_manager', 'ts_supervisor', 'noc_manager', 'noc_supervisor',
            'ip_manager', 'ip_supervisor'
          )
          OR LOWER(COALESCE(unit, '')) IN ('ts', 'tx', 'noc', 'ip')
        )
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
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path === '/firebase-messaging-sw.js' || req.path === '/push-sw.js') {
    return next();
  }
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  res.sendFile(path.join(__dirname, '../dist', 'index.html'));
});

// START SERVER (HTTP + Socket.IO)
const server = http.createServer(app);
const io = attachSocketIO(server);
setupChatSocket(io);
server.listen(port, '0.0.0.0', async () => {
  console.log(`Server running on port ${port}`);
  console.log(`   Client: ${process.env.CLIENT_URL}`);
  startInboundEmailService().catch((e) => {
    console.warn('[inbound-email] skipped during startup:', e.message);
  });

  const runEscalations = async () => {
    try {
      const { processed } = await processAutoEscalations();
      if (processed > 0) {
        console.log(`[ticket-escalation] Auto-escalated ${processed} ticket(s)`);
      }
    } catch (e) {
      console.error('[ticket-escalation]', e.message);
    }
  };
  void runEscalations();
  setInterval(runEscalations, 60 * 1000);
});