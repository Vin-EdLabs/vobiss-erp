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
  getUserById,
  getApprovers, getWorkflowConfig, updateWorkflowConfig, getRealmApprovers, updateRealmApprovers, backupDatabase, restoreDatabase, wipeDatabase,
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
import ticketRoutes from './routes/ticket.routes.js';  // 
import staffTicketRoutes from './routes/staff_ticket.routes.js';
import assetRoutes from './routes/assets.routes.js';
import projectRequestRoutes from './routes/project.routes.js';
import networkAssetsRoutes from './routes/networkAssets.js';
import incidentNotesRoutes from './routes/incidentNotes.js';
import nocShiftsRoutes from './routes/nocShifts.js';
import timeEngineRoutes from './routes/timeEngine.js';
import fieldWorkRoutes from './routes/fieldWork.js';
import performanceReportsRoutes from './routes/performanceReports.routes.js';
import ipUnitRoutes from './routes/ipUnit.js';
import archiveRoutes from './routes/archive.js';
import {
  migrateUserRoleConstraint,
  isValidSystemRole,
  normalizeSystemRole,
  invalidRoleMessage,
  userHasAnyRole,
  isSystemAdminAccount,
} from './roles.js';
import { formatPersonName } from './utils/displayName.js';
import { parseIdList as parseApprovalIds, buildApprovalParties, myApprovalState, loadUserNames } from './utils/approvalSummary.js';
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
  isRealmMaterialApprover,
  isRealmCashApprover,
} from './permissions.js';
import { processAutoEscalations } from './ticketEscalation.js';
import { runTicketAutoAssignSweep } from './services/ticketAutoAssign.js';
import { startInboundEmailService } from './inboundEmailService.js';
import { attachSocketIO } from './realtime/socket.js';
import { setupChatSocket } from './realtime/chatSocket.js';
import chatRoutes from './routes/chat.js';
import chatActionsRoutes from './routes/chatActions.js';
import chatAdminRoutes from './routes/chatAdmin.js';
import chatContextRoutes from './routes/chatContext.js';
import globalSearchRoutes from './routes/globalSearch.routes.js';
import vobiRoutes from './routes/vobi.js';
import vobiVaultRoutes from './routes/vobiVault.routes.js';
import hrRoutes from './routes/hr.js';
import hrSelfRoutes from './routes/hrSelf.js';
import fuelRequestsRoutes from './routes/fuel_requests.js';
import vehicleRequestsRoutes from './routes/vehicle_requests.js';
import referenceLinksRoutes from './routes/reference_links.js';
import referencesRoutes from './routes/references.js';
import { registerTodoRoutes } from './routes/todos.js';
import { initHrSchema, seedHrDemo } from './db/hr.js';
import { initFieldSchema } from './db/field.js';
import { initChat, ensureUserChatMembership } from './services/chatInit.js';
import {
  postRequestSystemMessage,
  postTicketSystemMessage,
  syncRequestPendingApprovalMessages,
} from './services/chatSystemMessage.js';
import { ensureRequestThread } from './services/chatRecordThreads.js';
import { getRealtimeIo } from './realtime/channels.js';
import { resolveReferenceInput, attachReference, isReferenceRequired } from './services/referenceLink.js';
import { getRecordSummary } from './services/referenceRegistry.js';

/**
 * Persists the new multi-reference links (from the reusable ReferenceLinkPicker) once a
 * parent record has an id. `links` is the raw `linked_references` array from the request
 * body — `[{ type, id }, ...]`; anything that no longer resolves is silently skipped rather
 * than failing the whole submission.
 */
async function persistLinkedReferences(sourceType, sourceId, links, userId) {
  if (!Array.isArray(links) || !links.length) return;
  for (const link of links) {
    try {
      const summary = await getRecordSummary(String(link?.type || ''), Number(link?.id));
      if (!summary) continue;
      await pool.query(
        `INSERT INTO linked_references
           (source_record_type, source_record_id, linked_record_type, linked_record_id, linked_reference_number, linked_title, linked_status, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sourceType, sourceId, summary.type, summary.id, summary.referenceNumber, summary.title, summary.status, userId]
      );
    } catch (linkError) {
      console.warn(`[linked_references] failed to persist link for ${sourceType} #${sourceId}:`, linkError.message);
    }
  }
}
import { logUserAction } from './services/activityLog.js';
import { recordTimingEvent, checkSlaThresholdsAndNotify } from './services/workflowTimeEngine.js';
import activityRoutes from './routes/activity.js';
import sharedLinksRoutes from './routes/sharedLinks.js';
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
import { authenticateOrShareToken } from './middleware/shareAuth.js';

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
app.use('/api/network-assets', networkAssetsRoutes);
app.use('/api/noc/incident-notes', incidentNotesRoutes);
app.use('/api/noc/shifts', nocShiftsRoutes);
app.use('/api/time-engine', timeEngineRoutes);
app.use('/api/field-work', fieldWorkRoutes);
app.use('/api/performance-reports', performanceReportsRoutes);
app.use('/api/ip-unit', ipUnitRoutes);
app.use('/api/archive', archiveRoutes);
/** @deprecated use /api/project-request */
app.use('/api/production', projectRequestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/chat', chatActionsRoutes);
app.use('/api/chat/admin', chatAdminRoutes);
app.use('/api/chat/context', chatContextRoutes);
app.use('/api/search', globalSearchRoutes);
app.use('/api/vobi', vobiRoutes);
app.use('/api/vobi-vault', vobiVaultRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/hr-self', hrSelfRoutes);
app.use('/api/transport/fuel-requests', fuelRequestsRoutes);
app.use('/api/finance/fuel-requests', fuelRequestsRoutes);
app.use('/api/transport/vehicle-requests', vehicleRequestsRoutes);
app.use('/api/transport/references', referenceLinksRoutes);
app.use('/api/references', referencesRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/shared-links', sharedLinksRoutes);
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

function permissionFlags(permissionUser) {
  return {
    system_role: getSystemRole(permissionUser),
    primary_unit: getPrimaryUnit(permissionUser),
    can_create_material_request: canCreateMaterialRequest(permissionUser),
    can_create_cash_request: canCreateCashRequest(permissionUser),
    can_approve_material_request: canApproveMaterialRequest(permissionUser),
    can_execute_material: canExecuteMaterial(permissionUser),
    can_approve_cash_request: canApproveCashRequest(permissionUser),
    can_release_cash: canReleaseCash(permissionUser),
    can_access_global_dashboard: canAccessGlobalDashboard(permissionUser),
    realm_material_approver: isRealmMaterialApprover(permissionUser),
    realm_cash_approver: isRealmCashApprover(permissionUser),
  };
}

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
  await getRealmApprovers();
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
    await getRealmApprovers();
    const loginPermissions = permissionFlags(permissionUser);
    
    const token = jwt.sign({ 
      id: user.id,
      username: user.username,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: formatPersonName(user, user.username),
      main_role: mainRole,  // Main role for sidebar
      roles: roles,  // All roles for permissions
      units: units,   // Units for access control
      unit: user.unit || null,
      position: user.position || null,
      permissions: loginPermissions,
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
        permissions: loginPermissions,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: formatPersonName(user, user.username),
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
    await getRealmApprovers();
    const permissionUser = { ...dbUser, main_role: mainRole, roles: rolesArr, units: unitsArr };
    try {
      await ensureUserChatMembership(dbUser.id, rolesArr);
    } catch (e) {
      console.warn('[chat] ensure membership on /me:', e.message);
    }
    res.json({
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      main_role: mainRole,
      roles: rolesArr,
      units: unitsArr,
      unit: dbUser.unit || null,
      position: dbUser.position || null,
      permissions: permissionFlags(permissionUser),
      first_name: dbUser.first_name,
      last_name: dbUser.last_name,
      full_name: formatPersonName(dbUser, dbUser.username),
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

app.get('/api/realm', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const realm = await getRealmApprovers();
    const ids = [...new Set([...(realm.material_user_ids || []), ...(realm.cash_user_ids || [])])];
    let people = [];
    if (ids.length) {
      const result = await pool.query(
        `SELECT id, first_name, last_name, username, role, position, unit
         FROM users WHERE deleted_at IS NULL AND id = ANY($1::int[])
         ORDER BY last_name ASC, first_name ASC`,
        [ids]
      );
      people = result.rows.map((row) => ({
        id: row.id,
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username,
        username: row.username,
        role: row.role,
        position: row.position,
        unit: row.unit,
      }));
    }
    res.json({ ...realm, people });
  } catch (error) {
    console.error('Error fetching realm:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load Realm' });
  }
});

app.post('/api/transport/uploads', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const payload = req.files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.originalname,
      type: file.mimetype || 'application/octet-stream',
      mimeType: file.mimetype || 'application/octet-stream',
      url: `/uploads/${file.filename}`,
      fileSize: file.size,
      isPdf: file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'),
    }));

    const recordType = String(req.query.record_type || req.body?.record_type || '').trim();
    const recordId = Number(req.query.record_id || req.body?.record_id);
    if (recordType && Number.isInteger(recordId) && recordId > 0) {
      const looksInvoice = payload.some((file) => /invoice/i.test(file.name));
      await logUserAction(req.user, {
        actionType: looksInvoice ? 'upload_invoice' : 'upload',
        recordType,
        recordId,
        fileKind: looksInvoice ? 'invoice' : 'file',
      });
    }

    res.status(200).json(payload);
  } catch (error) {
    console.error('Error uploading transport files:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to upload files' });
  }
});

app.get('/api/transport/settings', authenticateToken, async (req, res) => {
  try {
    const config = await getWorkflowConfig();
    const transport = config.transport || {
      approver_ids: [],
      supervisor_id: null,
      transport_supervisor_ids: [],
      vehicle_request_approver_ids: [],
      finance_user_ids: [],
      fuel_request_approver_ids: [],
      price_per_litre: null,
    };
    const ids = [...new Set([
      ...(transport.approver_ids || []),
      ...(transport.transport_supervisor_ids || []),
      ...(transport.vehicle_request_approver_ids || []),
      ...(transport.finance_user_ids || []),
      ...(transport.fuel_request_approver_ids || []),
      ...(transport.supervisor_id ? [transport.supervisor_id] : []),
    ])];
    let people = [];
    if (ids.length > 0) {
      const result = await pool.query(
        `SELECT id, first_name, last_name, username, role, position, unit
         FROM users WHERE deleted_at IS NULL AND id = ANY($1::int[])
         ORDER BY last_name ASC, first_name ASC`,
        [ids]
      );
      people = result.rows.map((row) => ({
        id: row.id,
        fullName: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.username,
        username: row.username,
        role: row.role,
        position: row.position,
        unit: row.unit,
      }));
    }
    res.json({
      approver_ids: transport.approver_ids || [],
      supervisor_id: transport.supervisor_id || null,
      transport_supervisor_ids: transport.transport_supervisor_ids || [],
      vehicle_request_approver_ids: transport.vehicle_request_approver_ids || [],
      finance_user_ids: transport.finance_user_ids || [],
      fuel_request_approver_ids: transport.fuel_request_approver_ids || [],
      price_per_litre: transport.price_per_litre ?? null,
      require_reference_link: Boolean(transport.require_reference_link),
      people,
    });
  } catch (error) {
    console.error('Error fetching transport settings:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load transport settings' });
  }
});

app.put('/api/transport/settings', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const {
      approver_ids = [],
      supervisor_id,
      transport_supervisor_ids = [],
      vehicle_request_approver_ids = [],
      finance_user_ids = [],
      fuel_request_approver_ids = [],
      price_per_litre,
    } = req.body || {};
    const safeApprovers = Array.isArray(approver_ids) ? [...new Set(approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))] : [];
    const safeSupervisors = Array.isArray(transport_supervisor_ids)
      ? [...new Set(transport_supervisor_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const safeVehicleApprovers = Array.isArray(vehicle_request_approver_ids)
      ? [...new Set(vehicle_request_approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const safeFinanceUsers = Array.isArray(finance_user_ids)
      ? [...new Set(finance_user_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const safeFuelApprovers = Array.isArray(fuel_request_approver_ids)
      ? [...new Set(fuel_request_approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const safeSupervisor = Number(supervisor_id) > 0 ? Number(supervisor_id) : (safeSupervisors[0] ?? null);
    const resolvedPrice = price_per_litre !== undefined && price_per_litre !== null && price_per_litre !== '' ? Number(price_per_litre) : null;
    const config = await getWorkflowConfig();
    const updated = await updateWorkflowConfig({
      ...config,
      transport: {
        ...((config.transport || {}) || {}),
        approver_ids: safeApprovers,
        supervisor_id: safeSupervisor,
        transport_supervisor_ids: safeSupervisors,
        vehicle_request_approver_ids: safeVehicleApprovers,
        finance_user_ids: safeFinanceUsers,
        fuel_request_approver_ids: safeFuelApprovers,
        price_per_litre: Number.isFinite(resolvedPrice) && resolvedPrice >= 0 ? resolvedPrice : null,
      },
    });
    res.json({
      approver_ids: updated.transport?.approver_ids || [],
      supervisor_id: updated.transport?.supervisor_id || null,
      transport_supervisor_ids: updated.transport?.transport_supervisor_ids || [],
      vehicle_request_approver_ids: updated.transport?.vehicle_request_approver_ids || [],
      finance_user_ids: updated.transport?.finance_user_ids || [],
      fuel_request_approver_ids: updated.transport?.fuel_request_approver_ids || [],
      price_per_litre: updated.transport?.price_per_litre ?? null,
    });
  } catch (error) {
    console.error('Error updating transport settings:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to save transport settings' });
  }
});

app.get('/api/transport/requests', authenticateToken, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT tr.*,
              u.first_name AS engineer_first_name, u.last_name AS engineer_last_name,
              ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
       FROM transport_requests tr
       LEFT JOIN users u ON u.id = tr.engineer_id
       LEFT JOIN users ru ON ru.id = tr.requester_id
       WHERE tr.deleted_at IS NULL
       ORDER BY tr.created_at DESC`
    );
    const config = await getWorkflowConfig();
    const transport = config.transport || { approver_ids: [], supervisor_id: null };
    const userId = Number(req.user?.id);
    const isAdmin =
      isSystemAdminAccount(req.user) ||
      userHasAnyRole(req.user, ['admin', 'superadmin', 'system_admin']) ||
      ['admin', 'superadmin', 'system_admin'].includes(String(req.user?.role || '').toLowerCase());
    const configuredApprovers = parseApprovalIds(transport.approver_ids);
    const supervisorId = Number(transport.supervisor_id || 0);

    const ids = rows.rows.map((row) => row.id);
    let approvalRows = [];
    if (ids.length) {
      const approvalRes = await pool.query(
        `SELECT * FROM transport_request_approvals WHERE request_id = ANY($1::int[]) ORDER BY created_at ASC`,
        [ids]
      );
      approvalRows = approvalRes.rows;
    }

    const allApproverIds = new Set(supervisorId > 0 ? [supervisorId] : []);
    configuredApprovers.forEach((id) => allApproverIds.add(id));
    rows.rows.forEach((row) => parseApprovalIds(row.selected_approver_ids).forEach((id) => allApproverIds.add(id)));
    const names = await loadUserNames(pool, [...allApproverIds]);

    const requests = rows.rows.map((row) => {
      const selected = parseApprovalIds(row.selected_approver_ids);
      const required = [...(selected.length ? selected : configuredApprovers)];
      if (supervisorId > 0 && !required.includes(supervisorId)) required.push(supervisorId);
      const rowApprovals = approvalRows.filter((item) => Number(item.request_id) === row.id);
      const parties = buildApprovalParties(required, names, rowApprovals);
      const mine = myApprovalState(rowApprovals, userId);
      return {
        id: row.id,
        requester_id: row.requester_id,
        requester_name: formatPersonName(
          { first_name: row.requester_first_name, last_name: row.requester_last_name, username: row.requester_username },
          row.requester_name
        ),
        site_name: row.site_name,
        location: row.location,
        client_name: row.client_name,
        engineer_id: row.engineer_id,
        engineer_name: row.engineer_id ? `${row.engineer_first_name || ''} ${row.engineer_last_name || ''}`.trim() || null : null,
        purpose: row.purpose,
        selected_approver_ids: selected,
        status: row.status,
        current_stage: row.current_stage,
        created_at: row.created_at,
        updated_at: row.updated_at,
        ...attachReference(row),
        ...mine,
        approvals_required: required.length,
        approvals_count: parties.filter((party) => party.status === 'approved').length,
        approval_parties: parties,
      };
    });

    const visible = req.user && req.user.id ? requests.filter((request) => {
      if (isAdmin) return true;
      if (Number(request.requester_id) === userId) return true;
      if ((request.selected_approver_ids || []).includes(userId)) return true;
      if (configuredApprovers.includes(userId) || supervisorId === userId) return true;
      return String(request.my_decision || '').length > 0;
    }) : requests;
    res.json(visible);
  } catch (error) {
    console.error('Error fetching transport requests:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load transport requests' });
  }
});

app.post('/api/transport/requests', authenticateToken, async (req, res) => {
  try {
    const { site_name, location, client_name, engineer_id, purpose, selected_approver_ids } = req.body || {};
    if (!site_name || !location || !client_name) {
      return res.status(400).json({ error: 'Site name, location, and client name are required.' });
    }

    const config = await getWorkflowConfig();
    const transport = config.transport || { approver_ids: [], supervisor_id: null };
    const linkedRefsInput = Array.isArray(req.body?.linked_references) ? req.body.linked_references : [];
    let linkedReference;
    try {
      linkedReference = await resolveReferenceInput(req.body || {}, {
        required: isReferenceRequired(transport) && linkedRefsInput.length === 0,
      });
    } catch (refError) {
      return res.status(refError.status || 400).json({ error: refError.message });
    }

    const rawApprovers = Array.isArray(selected_approver_ids) ? selected_approver_ids : [];
    const selectedApproverIds = [...new Set(rawApprovers.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!selectedApproverIds.length) {
      return res.status(400).json({ error: 'Please select at least one transport approver from Realm.' });
    }

    const requester = await getUserById(req.user.id);
    const requesterName = formatPersonName(requester || req.user, requester?.username || req.user.username);
    const configuredSupervisorId = Number(transport.supervisor_id || 0);
    const validApprovers = selectedApproverIds.filter((id) => {
      const allowed = (transport.approver_ids || []).map(Number);
      return allowed.includes(id) || id === configuredSupervisorId;
    });
    if (!validApprovers.length || !configuredSupervisorId) {
      return res.status(400).json({ error: 'At least one valid transport approver and the transport supervisor must be configured in Realm before submitting a request.' });
    }

    const result = await pool.query(
      `INSERT INTO transport_requests (
        requester_id, requester_name, site_name, location, client_name, engineer_id, purpose,
        status, current_stage, selected_approver_ids,
        reference_type, reference_id, reference_number, reference_title, reference_status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'approver', $8::jsonb, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        req.user.id,
        requesterName,
        String(site_name).trim(),
        String(location).trim(),
        String(client_name).trim(),
        engineer_id ? Number(engineer_id) : null,
        purpose ? String(purpose).trim() : null,
        JSON.stringify(selectedApproverIds),
        linkedReference.reference_type,
        linkedReference.reference_id,
        linkedReference.reference_number,
        linkedReference.reference_title,
        linkedReference.reference_status,
      ]
    );
    const request = result.rows[0];

    await persistLinkedReferences('transport_request', request.id, linkedRefsInput, req.user.id);

    const notifyTargets = [...new Set([...selectedApproverIds, ...(configuredSupervisorId > 0 ? [configuredSupervisorId] : [])])];
    for (const targetUserId of notifyTargets) {
      await createNotification(
        'Transport request submitted',
        `A new transport request from ${requesterName} is waiting for your approval.`,
        req.user.id,
        { targetUserId: Number(targetUserId), linkUrl: '/transport-approvals' }
      );
    }

    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: 'transport_request',
      recordId: request.id,
    });

    recordTimingEvent({
      workflowType: 'transport_request', recordId: request.id,
      eventType: 'created', stageName: 'pending_approval', triggeredByUserId: req.user.id,
    }).catch(() => {});

    res.status(201).json({
      id: request.id,
      requester_id: request.requester_id,
      requester_name: request.requester_name,
      site_name: request.site_name,
      location: request.location,
      client_name: request.client_name,
      engineer_id: request.engineer_id,
      purpose: request.purpose,
      selected_approver_ids: Array.isArray(request.selected_approver_ids) ? request.selected_approver_ids : selectedApproverIds,
      status: request.status,
      current_stage: request.current_stage,
      created_at: request.created_at,
      updated_at: request.updated_at,
      ...attachReference(request),
    });
  } catch (error) {
    console.error('Error creating transport request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to create transport request' });
  }
});

app.get('/api/transport/requests/:id', authenticateOrShareToken('transport_request', authenticateToken), async (req, res) => {
  try {
    const requestId = req.isSharedView ? Number(req.shareLink.record_id) : Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'A valid transport request id is required.' });
    }
    const requestRow = await pool.query(
      `SELECT tr.*,
              u.first_name AS engineer_first_name, u.last_name AS engineer_last_name,
              ru.first_name AS requester_first_name, ru.last_name AS requester_last_name, ru.username AS requester_username
       FROM transport_requests tr
       LEFT JOIN users u ON u.id = tr.engineer_id
       LEFT JOIN users ru ON ru.id = tr.requester_id
       WHERE tr.id = $1 AND tr.deleted_at IS NULL`,
      [requestId]
    );
    if (requestRow.rowCount === 0) {
      return res.status(404).json({ error: 'Transport request not found' });
    }
    const request = requestRow.rows[0];
    const approvals = await pool.query(
      `SELECT * FROM transport_request_approvals WHERE request_id = $1 ORDER BY created_at ASC`,
      [request.id]
    );
    const config = await getWorkflowConfig();
    const transport = config.transport || { approver_ids: [], supervisor_id: null };
    const selected = parseApprovalIds(request.selected_approver_ids);
    const required = [...(selected.length ? selected : parseApprovalIds(transport.approver_ids))];
    const supervisorId = Number(transport.supervisor_id || 0);
    if (supervisorId > 0 && !required.includes(supervisorId)) required.push(supervisorId);
    const names = await loadUserNames(pool, required);
    const parties = buildApprovalParties(required, names, approvals.rows);
    const mine = myApprovalState(approvals.rows, req.user?.id);
    const userIds = approvals.rows.map((row) => row.approver_id).filter(Boolean);
    let approverMap = {};
    if (userIds.length > 0) {
      const users = await pool.query(
        `SELECT id, first_name, last_name, username FROM users WHERE id = ANY($1::int[])`,
        [userIds]
      );
      approverMap = Object.fromEntries(users.rows.map((row) => [row.id, formatPersonName(row, row.username)]));
    }
    const detail = {
      id: request.id,
      requester_id: request.requester_id,
      requester_name: formatPersonName(
        { first_name: request.requester_first_name, last_name: request.requester_last_name, username: request.requester_username },
        request.requester_name
      ),
      site_name: request.site_name,
      location: request.location,
      client_name: request.client_name,
      engineer_id: request.engineer_id,
      engineer_name: request.engineer_id ? `${request.engineer_first_name || ''} ${request.engineer_last_name || ''}`.trim() || null : null,
      purpose: request.purpose,
      selected_approver_ids: selected,
      status: request.status,
      current_stage: request.current_stage,
      created_at: request.created_at,
      updated_at: request.updated_at,
      ...attachReference(request),
      ...mine,
      approvals_required: required.length,
      approvals_count: parties.filter((party) => party.status === 'approved').length,
      approval_parties: parties,
      approvals: approvals.rows.map((row) => ({
        id: row.id,
        stage: row.stage,
        approver_name: approverMap[row.approver_id] || row.approver_name || 'User',
        decision: row.decision,
        reason: row.reason,
        created_at: row.created_at,
      })),
    };
    res.json(detail);
  } catch (error) {
    console.error('Error fetching transport request detail:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to fetch transport request detail' });
  }
});

app.post('/api/transport/requests/:id/approve', authenticateToken, async (req, res) => {
  try {
    const requestRow = await pool.query(
      `SELECT * FROM transport_requests WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (requestRow.rowCount === 0) return res.status(404).json({ error: 'Transport request not found' });
    const request = requestRow.rows[0];
    const config = await getWorkflowConfig();
    const transport = config.transport || { approver_ids: [], supervisor_id: null };
    const selectedApproverIds = Array.isArray(request.selected_approver_ids) ? request.selected_approver_ids.map(Number) : [];
    const isApprover = selectedApproverIds.includes(Number(req.user.id)) || (transport.approver_ids || []).map(Number).includes(Number(req.user.id));
    const isSupervisor = Number(transport.supervisor_id) === Number(req.user.id);
    if (!isApprover && !isSupervisor && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'You are not allowed to approve this request.' });
    }
    if (request.status === 'rejected') return res.status(400).json({ error: 'This request has already been rejected.' });
    if (request.status === 'approved') return res.status(400).json({ error: 'This request has already been approved.' });

    const approvalNotes = String(req.body?.reason || '').trim();
    if (!approvalNotes) {
      return res.status(400).json({ error: 'Approval notes or a digital signature are required.' });
    }

    const stageToRecord = isSupervisor ? 'supervisor' : 'approver';
    const approverName = formatPersonName(req.user, req.user.username);

    if (stageToRecord === 'approver' && request.current_stage !== 'approver') {
      return res.status(400).json({ error: 'This request is already at the supervisor step.' });
    }
    if (stageToRecord === 'supervisor' && request.current_stage !== 'supervisor') {
      return res.status(400).json({ error: 'Please complete the approver stage before the supervisor steps in.' });
    }

    await pool.query(
      `INSERT INTO transport_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, $4, 'approved', $5)`,
      [request.id, req.user.id, approverName, stageToRecord, approvalNotes]
    );

    let nextStatus = request.status;
    let nextCurrentStage = request.current_stage;
    if (stageToRecord === 'approver') {
      const approvalCount = await pool.query(
        `SELECT COUNT(*)::int AS count FROM transport_request_approvals WHERE request_id = $1 AND stage = 'approver' AND decision = 'approved'`,
        [request.id]
      );
      const requiredApprovers = Array.isArray(transport.approver_ids) ? transport.approver_ids.length : 0;
      if (requiredApprovers > 0 && approvalCount.rows[0].count >= requiredApprovers) {
        nextCurrentStage = 'supervisor';
      }
    } else {
      nextStatus = 'approved';
      nextCurrentStage = 'supervisor';
    }

    await pool.query(
      `UPDATE transport_requests SET status = $1, current_stage = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [nextStatus, nextCurrentStage, request.id]
    );

    if (stageToRecord === 'approver') {
      const supervisorId = Number(transport.supervisor_id || 0);
      if (supervisorId > 0) {
        await createNotification(
          'Transport request awaiting supervisor approval',
          `The transport request for ${request.requester_name} has been approved by the first approver and is waiting for supervisor action.`,
          req.user.id,
          { targetUserId: supervisorId, linkUrl: '/transport-approvals' }
        );
      }
    } else {
      await createNotification(
        'Transport request approved',
        `Your transport request for ${request.site_name} has been fully approved by the transport supervisor.`,
        req.user.id,
        { targetUserId: Number(request.requester_id || 0) || null, linkUrl: `/transport-requests/${request.id}` }
      );
    }

    await logUserAction(req.user, {
      actionType: 'approve',
      recordType: 'transport_request',
      recordId: request.id,
    });

    recordTimingEvent({
      workflowType: 'transport_request', recordId: request.id,
      eventType: stageToRecord === 'supervisor' ? 'completed' : 'approved',
      stageName: stageToRecord === 'supervisor' ? 'supervisor_approval' : 'pending_approval',
      triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: stageToRecord === 'supervisor' ? 'Transport request approved by supervisor.' : 'Transport request approved by approver.', request: { id: request.id, status: nextStatus, current_stage: nextCurrentStage } });
  } catch (error) {
    console.error('Error approving transport request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to approve transport request' });
  }
});

app.post('/api/transport/requests/:id/reject', authenticateToken, async (req, res) => {
  try {
    const request = await pool.query('SELECT * FROM transport_requests WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (request.rowCount === 0) return res.status(404).json({ error: 'Transport request not found' });
    const requestRow = request.rows[0];
    const config = await getWorkflowConfig();
    const transport = config.transport || { approver_ids: [], supervisor_id: null };
    const selectedApproverIds = Array.isArray(requestRow.selected_approver_ids) ? requestRow.selected_approver_ids.map(Number) : [];
    const isApprover = selectedApproverIds.includes(Number(req.user.id)) || (transport.approver_ids || []).map(Number).includes(Number(req.user.id));
    const isSupervisor = Number(transport.supervisor_id) === Number(req.user.id);
    if (!isApprover && !isSupervisor && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'You are not allowed to reject this request.' });
    }
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'A rejection reason is required.' });
    }
    const approverName = formatPersonName(req.user, req.user.username);
    await pool.query(
      `INSERT INTO transport_request_approvals (request_id, approver_id, approver_name, stage, decision, reason)
       VALUES ($1, $2, $3, $4, 'rejected', $5)`,
      [requestRow.id, req.user.id, approverName, isSupervisor ? 'supervisor' : 'approver', reason]
    );
    await pool.query(
      `UPDATE transport_requests SET status = 'rejected', current_stage = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [isSupervisor ? 'supervisor' : 'approver', request.rows[0].id]
    );

    await createNotification(
      'Transport request rejected',
      `Your transport request for ${request.rows[0].site_name} was rejected${isSupervisor ? ' by the transport supervisor' : ' at the approval stage'}.`,
      req.user.id,
      { targetUserId: Number(request.rows[0].requester_id || 0) || null, linkUrl: `/transport-requests/${request.rows[0].id}` }
    );

    await logUserAction(req.user, {
      actionType: 'reject',
      recordType: 'transport_request',
      recordId: request.rows[0].id,
    });

    recordTimingEvent({
      workflowType: 'transport_request', recordId: request.rows[0].id,
      eventType: 'rejected', stageName: 'pending_approval', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Transport request rejected.', request: { id: request.rows[0].id, status: 'rejected', current_stage: isSupervisor ? 'supervisor' : 'approver' } });
  } catch (error) {
    console.error('Error rejecting transport request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to reject transport request' });
  }
});

app.get('/api/transport/requests/:id/vehicle-request', authenticateToken, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.json(null);
    }
    const result = await pool.query(
      `SELECT * FROM vehicle_request_forms WHERE transport_request_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
      [requestId]
    );
    if (result.rowCount === 0) {
      return res.json(null);
    }
    const form = result.rows[0];
    res.json({
      id: form.id,
      transport_request_id: form.transport_request_id,
      requester_id: form.requester_id,
      supervisor_id: form.supervisor_id,
      department: form.department,
      purpose: form.purpose,
      date_submitted: form.date_submitted,
      deliver_to: form.deliver_to,
      phone: form.phone,
      special_instructions: form.special_instructions,
      order_no: form.order_no,
      invoice_terms: form.invoice_terms,
      received_by: form.received_by,
      line_items: Array.isArray(form.line_items) ? form.line_items : [],
      attachments: Array.isArray(form.attachments) ? form.attachments : [],
      selected_approver_ids: Array.isArray(form.selected_approver_ids) ? form.selected_approver_ids : [],
      status: form.status,
      current_stage: form.current_stage,
      created_at: form.created_at,
      updated_at: form.updated_at,
    });
  } catch (error) {
    console.error('Error loading vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to load vehicle request' });
  }
});

app.post('/api/transport/requests/:id/vehicle-request', authenticateToken, async (req, res) => {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: 'A valid transport request id is required.' });
    }
    const transportRequest = await pool.query(
      `SELECT * FROM transport_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId]
    );
    if (transportRequest.rowCount === 0) {
      return res.status(404).json({ error: 'Transport request not found' });
    }

    const request = transportRequest.rows[0];
    const config = await getWorkflowConfig();
    const transport = config.transport || { supervisor_id: null };
    const isSupervisor = Number(transport.supervisor_id) === Number(req.user.id);
    if (!isSupervisor && req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only the transport supervisor can generate the vehicle request form.' });
    }
    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'The transport request must be approved before a vehicle request form can be generated.' });
    }

    const payload = req.body || {};
    const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    const selectedApproverIds = Array.isArray(payload.selected_approver_ids)
      ? [...new Set(payload.selected_approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    const fallbackApprovers = selectedApproverIds.length
      ? selectedApproverIds
      : [
          ...(Array.isArray(config.transport?.vehicle_request_approver_ids)
            ? config.transport.vehicle_request_approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
            : []),
          ...(Array.isArray(config.transport?.approver_ids)
            ? config.transport.approver_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0)
            : []),
        ];

    const result = await pool.query(
      `INSERT INTO vehicle_request_forms (
        transport_request_id, requester_id, supervisor_id, department, purpose, deliver_to,
        phone, special_instructions, order_no, invoice_terms, received_by, line_items, attachments,
        selected_approver_ids, status, current_stage
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, 'pending', 'pending')
       RETURNING *`,
      [
        request.id,
        request.requester_id || req.user.id,
        req.user.id,
        payload.department || null,
        request.purpose || null,
        payload.deliver_to || null,
        payload.phone || null,
        payload.special_instructions || null,
        payload.order_no || null,
        payload.invoice_terms || null,
        payload.received_by || null,
        JSON.stringify(lineItems),
        JSON.stringify(attachments),
        JSON.stringify(fallbackApprovers),
      ]
    );

    const form = result.rows[0];
    for (const targetUserId of fallbackApprovers) {
      await createNotification(
        'Vehicle request awaiting approval',
        `A new vehicle request from ${request.requester_name} is waiting for your approval.`,
        req.user.id,
        { targetUserId: Number(targetUserId), linkUrl: `/transport/vehicle-rental-requests/${form.id}` }
      );
    }

    res.status(201).json({
      id: form.id,
      transport_request_id: form.transport_request_id,
      requester_id: form.requester_id,
      supervisor_id: form.supervisor_id,
      department: form.department,
      purpose: form.purpose,
      deliver_to: form.deliver_to,
      phone: form.phone,
      special_instructions: form.special_instructions,
      order_no: form.order_no,
      invoice_terms: form.invoice_terms,
      received_by: form.received_by,
      line_items: Array.isArray(form.line_items) ? form.line_items : [],
      attachments: Array.isArray(form.attachments) ? form.attachments : [],
      status: form.status,
      current_stage: form.current_stage,
      created_at: form.created_at,
      updated_at: form.updated_at,
    });
  } catch (error) {
    console.error('Error creating vehicle request:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to create vehicle request' });
  }
});

app.put('/api/realm', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const realm = await updateRealmApprovers(req.body || {});
    res.json(realm);
  } catch (error) {
    console.error('Error updating realm:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to save Realm' });
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

// Narrow, non-admin directory — id/name only, no role/email/other PII — so any authenticated
// user can populate an "assign to" or "engineer" picker on their own request forms (Transport,
// Fuel, Rental Vehicle) without needing GET /api/users, which is user-management-admin only.
app.get('/api/users/directory', authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, username, role, position, unit FROM users WHERE deleted_at IS NULL ORDER BY first_name ASC, last_name ASC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user directory:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Just the approver-id lists these self-service request forms need to pick default approvers —
// not the full Realm config (which also holds material/cash/finance approvers and is
// superadmin-only via GET /api/realm).
app.get('/api/realm/approver-ids', authenticateToken, async (req, res) => {
  try {
    const realm = await getRealmApprovers();
    res.json(realm);
  } catch (error) {
    console.error('Error fetching realm approver ids:', error.stack);
    res.status(500).json({ error: error.message });
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
    res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error('Error fetching notifications:', error.stack);
    res.json([]);
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
    const linkedReferences = Array.isArray(req.body.linked_references) ? req.body.linked_references : [];

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
    const realm = await getRealmApprovers();
    const allowedIds = new Set(
      (requestType === 'cash_request' ? realm.cash_user_ids : realm.material_user_ids).map(Number)
    );
    if (selectedIds.some((id) => !allowedIds.has(id))) {
      return validationErrorResponse(
        res,
        'Choose approvers from the Realm list for this request type.',
        [{ field: 'approver_ids', message: 'Only people added in Realm can be assigned to approve this request.' }]
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

    await logUserAction(req.user, {
      actionType: 'submit',
      recordType: requestType || 'material_request',
      recordId: newRequest.id,
    });

    recordTimingEvent({
      workflowType: requestType || 'material_request', recordId: newRequest.id,
      eventType: 'created', stageName: 'pending_approval', triggeredByUserId: req.user.id,
    }).catch(() => {});

    await persistLinkedReferences(requestType || 'material_request', newRequest.id, linkedReferences, req.user.id);

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
    await logUserAction(req.user, {
      actionType: 'reject',
      recordType: request.type || 'material_request',
      recordId: Number(req.params.id),
    });
    recordTimingEvent({
      workflowType: request.type || 'material_request', recordId: Number(req.params.id),
      eventType: 'rejected', stageName: 'pending_approval', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});
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
    const approvedTypeRow = await pool.query('SELECT type FROM requests WHERE id = $1', [requestId]);
    const approvedType = approvedTypeRow.rows[0]?.type || 'material_request';
    await logUserAction(req.user, {
      actionType: stage === 'finance' && approvedType === 'cash_request' ? 'issue_cash' : 'approve',
      recordType: approvedType,
      recordId: Number(requestId),
    });
    recordTimingEvent({
      workflowType: approvedType, recordId: Number(requestId), eventType: 'approved',
      stageName: stage === 'finance' ? 'finance_processing' : stage === 'director' ? 'director_review' : 'pending_approval',
      toUnitSlug: stage === 'finance' ? 'finance' : null,
      triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});
    res.json(result);
  } catch (error) {
    console.error(`Failed to approve request ${req.params.id}:`, error.message);
    console.error('Stack:', error.stack);
    res.status(error.status || 500).json({ error: error.message || 'Approval failed' });
  }
});

async function assertRequestDetailAccess(requestId, user) {
  const permissionUser = await getFreshPermissionUser(user.id);
  if (!permissionUser) {
    const err = new Error('User not found');
    err.status = 401;
    throw err;
  }
  if (canBypassApprovalRestrictions(permissionUser)) return;

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

  if (Number(request.created_by_id) === Number(user.id) || request.assigned_to_user) return;
  if (canReleaseCash(permissionUser) && request.type === 'cash_request') return;
  if (canExecuteMaterial(permissionUser) && request.type !== 'cash_request') return;

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
    const finalizedType = (await pool.query('SELECT type FROM requests WHERE id = $1', [req.params.id])).rows[0]?.type || 'material_request';
    await logUserAction(req.user, {
      actionType: 'complete',
      recordType: finalizedType,
      recordId: Number(req.params.id),
    });
    recordTimingEvent({
      workflowType: finalizedType, recordId: Number(req.params.id),
      eventType: 'completed', stageName: 'execution', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});
    res.json(result);
  } catch (error) {
    console.error(`Error finalizing request ID ${req.params.id}:`, error.message);
    console.error('Full stack:', error.stack);
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get('/api/requests/:id', authenticateOrShareToken(['material_request', 'cash_request', 'item_return'], authenticateToken), async (req, res) => {
  try {
    const requestId = req.isSharedView ? req.shareLink.record_id : req.params.id;
    if (!req.isSharedView) await assertRequestDetailAccess(requestId, req.user);
    const request = await getRequestDetails(requestId);
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
    recordTimingEvent({
      workflowType: 'cash_request', recordId: Number(req.params.id),
      eventType: 'completed', stageName: 'finance_processing', triggeredByUserId: req.user.id, attributeToUserId: req.user.id,
    }).catch(() => {});
    res.json(result);
  } catch (error) {
    console.error('Error marking cash received:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/field/users', authenticateToken, async (req, res) => {
  try {
    const role = String(req.user?.main_role || req.user?.role || '').toLowerCase();
    // Most real accounts carry the actual job title in `position` ("TX Manager", "IP Supervisor")
    // with role/main_role left as a generic account type ("admin"/"superadmin"/"user") — a
    // role-slug-only allowlist silently locks out real TX/NOC/IP staff and managers.
    const position = String(req.user?.position || '').toLowerCase();
    const unit = String(req.user?.unit || '').toLowerCase();
    const units = (Array.isArray(req.user?.units) ? req.user.units : []).map((u) => String(u || '').toLowerCase());
    const roleAllowed = [
      'superadmin', 'admin', 'hr', 'director', 'cto',
      'field_engineer', 'field_engineer_admin',
      'ts_manager', 'ts_supervisor', 'noc', 'noc_manager', 'noc_supervisor',
      'ip', 'ip_manager', 'ip_supervisor', 'project',
    ].includes(role);
    const positionAllowed = ['director', 'cto'].includes(position)
      || position.includes('manager') || position.includes('supervisor') || position.includes('engineer');
    const unitAllowed = ['ts', 'tx', 'noc', 'ip'].includes(unit) || units.some((u) => ['ts', 'tx', 'noc', 'ip'].includes(u));
    if (!roleAllowed && !positionAllowed && !unitAllowed) {
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

  const runSlaSweep = async () => {
    try {
      const { notified } = await checkSlaThresholdsAndNotify();
      if (notified > 0) {
        console.log(`[workflow-time-engine] Sent ${notified} SLA notification(s)`);
      }
    } catch (e) {
      console.error('[workflow-time-engine] SLA sweep failed:', e.message);
    }
  };
  void runSlaSweep();
  setInterval(runSlaSweep, 60 * 1000);

  const runTicketAutoAssign = async () => {
    try {
      const { assigned } = await runTicketAutoAssignSweep();
      if (assigned > 0) {
        console.log(`[ticket-auto-assign] Assigned ${assigned} idle NOC ticket(s)`);
      }
    } catch (e) {
      console.error('[ticket-auto-assign]', e.message);
    }
  };
  void runTicketAutoAssign();
  setInterval(runTicketAutoAssign, 60 * 1000);
});
