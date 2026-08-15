import express from 'express';
import jwt from 'jsonwebtoken';
import { getUserById } from '../db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getTicketReport } = require('../db.ticketing.cjs');
const { getCashRequestReport } = require('../db.reports.cjs');
import {
  TICKET_REPORT_ROLES,
  CASH_REPORT_ROLES,
  userHasAnyRole,
} from '../roles.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id || decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.authUser = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

const normalize = (value) => String(value || '').trim().toLowerCase();

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function getUnitSlugs(user) {
  const units = new Set();
  if (user?.unit) units.add(normalize(user.unit));
  parseJsonArray(user?.units).forEach((unit) => units.add(normalize(unit)));
  return [...units].filter(Boolean);
}

function canAccessReport(user, roles, reportType) {
  if (userHasAnyRole(user, roles)) return true;
  const position = normalize(user?.position);
  const units = getUnitSlugs(user);
  if (position === 'director') return true;
  const isManagerOrSupervisor = position.includes('manager') || position.includes('supervisor');
  if (!isManagerOrSupervisor) return false;
  if (reportType === 'tickets') return units.some((unit) => ['noc', 'ip', 'tx', 'cx'].includes(unit));
  if (reportType === 'cash') return units.includes('finance');
  return false;
}

function requireReportAccess(roles, reportType) {
  return (req, res, next) => {
    if (!canAccessReport(req.authUser, roles, reportType)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  };
}

router.use(authenticateToken);

router.get('/tickets', requireReportAccess(TICKET_REPORT_ROLES, 'tickets'), async (req, res) => {
  try {
    const bucket = req.query.bucket ? String(req.query.bucket).toLowerCase() : null;
    if (bucket && !['pending', 'completed'].includes(bucket)) {
      return res.status(400).json({ error: 'bucket must be pending or completed' });
    }
    const report = await getTicketReport({
      bucket: bucket || null,
      date_from: req.query.date_from ? String(req.query.date_from) : null,
      date_to: req.query.date_to ? String(req.query.date_to) : null,
    });
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('GET /reports/tickets error:', err);
    res.status(500).json({ error: err.message || 'Failed to load ticket report' });
  }
});

router.get('/cash', requireReportAccess(CASH_REPORT_ROLES, 'cash'), async (req, res) => {
  try {
    const report = await getCashRequestReport({
      date_from: req.query.date_from ? String(req.query.date_from) : null,
      date_to: req.query.date_to ? String(req.query.date_to) : null,
      status: req.query.status ? String(req.query.status) : null,
    });
    res.json({ success: true, ...report });
  } catch (err) {
    console.error('GET /reports/cash error:', err);
    res.status(500).json({ error: err.message || 'Failed to load cash report' });
  }
});

export default router;
