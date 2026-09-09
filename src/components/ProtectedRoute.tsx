import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { POST_LOGIN_PATH, userHasAnyRole, isHrStaff, isAdminOperator, getUserRoles } from '../config/roles';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  allowedUnits?: string[];
  allowedPositions?: string[];
  /** Locks the route to System Admin only — even Directors/CTO (who otherwise bypass every restriction below) are turned away. */
  adminOnly?: boolean;
}

const norm = (value?: string | null) => String(value || '').trim().toLowerCase();

const userHasAnyUnit = (user: any, units: string[]) => {
  const wanted = units.map(norm).map((unit) => (unit === 'tx' ? 'ts' : unit)).filter(Boolean);
  const userUnits = [
    user?.unit,
    ...(Array.isArray(user?.units) ? user.units : []),
  ]
    .map(norm)
    .map((unit) => (unit === 'tx' ? 'ts' : unit))
    .filter(Boolean);
  return wanted.some((unit) => userUnits.includes(unit) || (unit === 'project' && userUnits.some((u) => u.startsWith('project'))));
};

const userHasAnyPosition = (user: any, positions: string[]) => {
  const wanted = positions.map(norm).filter(Boolean);
  const position = norm(user?.position);
  if (wanted.includes(position)) return true;
  const isMgr = position.includes('manager') || position.includes('supervisor');
  if (!isMgr) return false;
  return wanted.some((item) => item.includes('manager') || item.includes('supervisor'));
};

const isDirectorAccess = (user: any) =>
  userHasAnyRole(user, ['director', 'cto']) || userHasAnyPosition(user, ['Director', 'CTO']);

const pathMatches = (pathname: string, prefixes: string[]) =>
  prefixes.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const ADMIN_SYSTEM_PATHS = [
  '/users',
  '/settings',
  '/system-messages',
  '/configuration',
  '/settings/design-configuration',
  '/project-request/admin/units',
  '/audit-logs',
  '/performance-reports/periods',
  '/performance-reports/analytics',
];

/** Every signed-in staff member keeps these, including Admin. */
const STAFF_HOME_PATHS = [
  '/workspace',
  '/chat',
  '/profile',
  '/system-guide',
  '/hr-self',
];

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, allowedUnits, allowedPositions, adminOnly }) => {
  const { user, isAdminSuper } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAdminSuper) {
    return <>{children}</>;
  }

  if (adminOnly) {
    return <Navigate to={POST_LOGIN_PATH} replace />;
  }

  if (pathMatches(location.pathname, STAFF_HOME_PATHS)) {
    return <>{children}</>;
  }

  const isHrPath = location.pathname === '/hr' || location.pathname.startsWith('/hr/');
  if (isHrPath) {
    if (isHrStaff(user) || isDirectorAccess(user)) return <>{children}</>;
    return <Navigate to={POST_LOGIN_PATH} replace />;
  }

  if (isAdminOperator(user) && pathMatches(location.pathname, ADMIN_SYSTEM_PATHS)) {
    return <>{children}</>;
  }

  const hasRestrictions = !!(allowedRoles?.length || allowedUnits?.length || allowedPositions?.length);
  const effectiveAllowedRoles = (allowedRoles || []).filter(
    (role) => !['admin', 'superadmin', 'system_admin'].includes(norm(role))
  );
  const roleUser = isAdminOperator(user)
    ? { ...user, roles: [...getUserRoles(user), 'user'] }
    : user;
  const roleAllowed = effectiveAllowedRoles.length > 0 && userHasAnyRole(roleUser, effectiveAllowedRoles);
  const unitAllowed = !!allowedUnits?.length && userHasAnyUnit(user, allowedUnits);
  const positionAllowed = !!allowedPositions?.length && userHasAnyPosition(user, allowedPositions);

  if (hasRestrictions && !isDirectorAccess(user) && !roleAllowed && !unitAllowed && !positionAllowed) {
    return <Navigate to={POST_LOGIN_PATH} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
