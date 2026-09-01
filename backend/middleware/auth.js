// backend/middleware/auth.js
import jwt from 'jsonwebtoken';
import { isSystemAdminAccount } from '../roles.js';
import { formatPersonName } from '../utils/displayName.js';
import { getUserById } from '../db.js';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        error: expired ? 'Session expired. Please log in again.' : 'Invalid token',
        errorCode: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
      });
    }
    try {
      const dbUser = await getUserById(user.id || user.userId);
      if (dbUser) {
        req.user = {
          ...user,
          ...dbUser,
          id: dbUser.id,
          full_name: formatPersonName(dbUser, dbUser.username),
        };
      } else {
        req.user = user;
      }
    } catch {
      req.user = user;
    }
    next();
  });
};

function collectRoleSlugs(user = {}) {
  const roles = new Set();
  const add = (value) => {
    if (!value) return;
    String(value)
      .split(',')
      .forEach((part) => {
        const slug = part.trim().toLowerCase();
        if (slug) roles.add(slug);
      });
  };
  add(user.role);
  add(user.main_role);
  if (Array.isArray(user.roles)) user.roles.forEach(add);
  else add(user.roles);
  return roles;
}

/** HR module — unit HR, position HR, legacy hr role, or superadmin. */
function isHrOrExecutive(user = {}) {
  if (isSystemAdminAccount(user)) return true;
  const roles = collectRoleSlugs(user);
  if (roles.has('hr') || roles.has('director') || roles.has('cto')) return true;
  const jwtUnits = [
    user?.unit,
    ...(Array.isArray(user?.units) ? user.units : []),
  ].map((v) => String(v || '').trim().toLowerCase());
  const jwtPosition = String(user?.position || '').trim().toLowerCase();
  if (jwtUnits.includes('hr') || jwtPosition === 'hr' || jwtPosition === 'director' || jwtPosition === 'cto') return true;
  return false;
}

export const requireHR = async (req, res, next) => {
  if (isHrOrExecutive(req.user)) return next();
  try {
    const { default: pool } = await import('../db.js');
    const result = await pool.query(
      `SELECT username, unit, units, position, role, main_role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    const u = result.rows[0];
    if (!u) return res.status(403).json({ error: 'HR access required' });
    let units = [];
    if (Array.isArray(u.units)) units = u.units;
    else if (typeof u.units === 'string') {
      try { units = JSON.parse(u.units); } catch { units = []; }
    }
    const allUnits = [u.unit, ...units].map((v) => String(v || '').trim().toLowerCase());
    const position = String(u.position || '').trim().toLowerCase();
    const role = String(u.role || '').toLowerCase();
    const mainRole = String(u.main_role || '').toLowerCase();
    if (
      isSystemAdminAccount(u) ||
      allUnits.includes('hr') ||
      position === 'hr' ||
      position === 'director' ||
      position === 'cto' ||
      role === 'hr' ||
      role === 'director' ||
      role === 'cto' ||
      mainRole === 'hr' ||
      mainRole === 'director' ||
      mainRole === 'cto'
    ) {
      return next();
    }
  } catch (err) {
    console.error('requireHR:', err);
  }
  return res.status(403).json({ error: 'HR access required' });
};

/** Payroll audit / sensitive HR admin actions — not regular HR officers. */
function isHrAdminUser(user = {}) {
  if (isSystemAdminAccount(user)) return true;
  const roles = collectRoleSlugs(user);
  if (roles.has('director') || roles.has('cto') || roles.has('admin') || roles.has('system_admin')) return true;
  const position = String(user?.position || '').trim().toLowerCase();
  if (position === 'director' || position === 'cto') return true;
  if (/(hr\s*)?(manager|admin|head)/i.test(position) || position === 'hr manager' || position === 'hr admin') {
    return true;
  }
  // Seeded default HR account
  if (String(user?.username || '').trim().toLowerCase() === 'hr') return true;
  return false;
}

export const requireHrAdmin = async (req, res, next) => {
  if (isHrAdminUser(req.user)) return next();
  try {
    const { default: pool } = await import('../db.js');
    const result = await pool.query(
      `SELECT username, unit, units, position, role, main_role FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );
    const u = result.rows[0];
    if (u && isHrAdminUser(u)) return next();
  } catch (err) {
    console.error('requireHrAdmin:', err);
  }
  return res.status(403).json({ error: 'HR admin access required for payroll audit' });
};
