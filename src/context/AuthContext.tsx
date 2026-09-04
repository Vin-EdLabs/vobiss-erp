// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, ackUnsuspend } from '../api';
import { API_URL } from '@/lib/api';

interface User {
  id?: number;
  username: string;
  role?: string;            // Legacy single role (for backward compatibility)
  main_role?: string;        // Main role that controls sidebar
  roles?: string[];          // All roles for permissions
  units?: string[];          // Units for access control
  unit?: string | null;
  position?: string | null;
  company?: string | null;   // 'CW' | 'PTEL' | future tenants — see useCompany()
  first_name?: string;
  last_name?: string;
  full_name?: string;
  status?: string;
  suspension_reason?: string | null;
  unsuspend_reason?: string | null;
  unsuspend_ack?: boolean;
  avatar_url?: string | null;
  permissions?: {
    realm_material_approver?: boolean;
    realm_cash_approver?: boolean;
    can_approve_material_request?: boolean;
    can_approve_cash_request?: boolean;
    can_release_cash?: boolean;
    can_execute_material?: boolean;
  };
}

export type AccessMode = 'work' | 'system';

/** localStorage key for the System Admin's "View as Company" override — see setViewAsCompany.
 *  Not per-user (unlike accessMode) since this is a browser-local admin tool preference, not a
 *  real account setting, and is cleared on logout so it never carries over to another account
 *  signed in on the same machine. src/main.tsx reads this same key to attach the
 *  x-view-as-company header to every API request. */
export const VIEW_AS_COMPANY_KEY = 'vobiss_view_as_company';

interface AuthContextType {
  user: User | null;
  token: string | null;
  hrEmployee: any | null;
  accessMode: AccessMode;
  setAccessMode: (mode: AccessMode) => void;
  canUseSystemMode: boolean;
  isSystemMode: boolean;
  isAdminSuper: boolean;
  viewAsCompany: string | null;
  setViewAsCompany: (company: string | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  refreshUser: () => Promise<void>;
  ackUnsuspendNotice: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** Log out after this much idle time (ms). */
const SESSION_IDLE_MS = 13 * 60 * 60 * 1000;
/** Show warning this long before idle logout (ms). */
const SESSION_WARN_MS = 60 * 60 * 1000;

function getIdleConfig(): { idle: number; warn: number } {
  return { idle: SESSION_IDLE_MS, warn: SESSION_WARN_MS };
}

const norm = (value?: string | null) => String(value || '').trim().toLowerCase();

function userRoleSlugs(user?: User | null) {
  const roles = [user?.role, user?.main_role, ...(Array.isArray(user?.roles) ? user.roles : [])];
  return roles.map(norm).filter(Boolean);
}

function isAdminOrSuperadmin(user?: User | null) {
  const roles = userRoleSlugs(user);
  return roles.includes('admin') || roles.includes('superadmin');
}

function isAdminSuperUser(user?: User | null) {
  if (!user) return false;
  const roles = userRoleSlugs(user);
  const username = norm(user.username);
  const fullName = norm(user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' '));
  if (username === 'superadmin') return true;
  return (
    (fullName === 'admin super' || fullName === 'system admin') &&
    (roles.includes('superadmin') || roles.includes('system_admin'))
  );
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [hrEmployee, setHrEmployee] = useState<any | null>(null);
  const [accessMode, setAccessModeState] = useState<AccessMode>('work');
  const [viewAsCompany, setViewAsCompanyState] = useState<string | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const navigate = useNavigate();

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearLocalSession = React.useCallback(() => {
    clearTimers();
    setShowWarning(false);
    setToken(null);
    setUser(null);
    setHrEmployee(null);
    setAccessModeState('work');
    setViewAsCompanyState(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(VIEW_AS_COMPANY_KEY);
  }, []);

  // Load persisted data on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken) {
      setToken(savedToken);
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch {
          console.error('Invalid saved user data');
          localStorage.removeItem('user');
        }
      }
    }
  }, []);

  useEffect(() => {
    const handleAuthLogout = () => {
      clearLocalSession();
      navigate('/login', { replace: true });
    };
    window.addEventListener('vobiss-auth-logout', handleAuthLogout);
    return () => window.removeEventListener('vobiss-auth-logout', handleAuthLogout);
  }, [clearLocalSession, navigate]);

  // Decode JWT and handle both old single-role and new multi-role format
  useEffect(() => {
    if (token && !user) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const derivedUser: User = {
          id: payload.id,
          username: payload.username,
          role: payload.role,  // Legacy role
          main_role: payload.main_role || payload.role,  // Main role for sidebar
          roles: Array.isArray(payload.roles)
            ? payload.roles
            : payload.role
              ? [payload.role]
              : [],
          units: Array.isArray(payload.units) ? payload.units : [],
          unit: payload.unit ?? null,
          position: payload.position ?? null,
          company: payload.company ?? 'CW',
          first_name: payload.first_name,
          last_name: payload.last_name,
          full_name: payload.full_name,
          permissions: payload.permissions ?? undefined,
        };
        setUser(derivedUser);
        localStorage.setItem('user', JSON.stringify(derivedUser));
      } catch (err) {
        console.error('Invalid token format:', err);
        clearLocalSession();
      }
    }
  }, [clearLocalSession, token, user]);

  // Persist user whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const canUseSystemMode = false;
  const isAdminSuper = isAdminSuperUser(user);
  const isSystemMode = isAdminSuper;

  const accessModeStorageKey = user?.id ? `vobiss_access_mode_${user.id}` : 'vobiss_access_mode';

  useEffect(() => {
    if (!user) {
      setAccessModeState('work');
      return;
    }
    if (isAdminSuperUser(user)) {
      setAccessModeState('system');
      return;
    }
    if (!isAdminOrSuperadmin(user)) {
      setAccessModeState('work');
      return;
    }

    const saved = localStorage.getItem(accessModeStorageKey);
    setAccessModeState(saved === 'system' ? 'system' : 'work');
  }, [user?.id, user?.role, user?.main_role, user?.position, user?.username, user?.full_name, accessModeStorageKey]);

  const setAccessMode = React.useCallback(
    (mode: AccessMode) => {
      if (!user || isAdminSuperUser(user) || !isAdminOrSuperadmin(user)) {
        setAccessModeState('work');
        return;
      }
      setAccessModeState(mode);
      localStorage.setItem(accessModeStorageKey, mode);
    },
    [accessModeStorageKey, user]
  );

  // Only the true System Admin may set this — everyone else (including a company-scoped
  // 'admin') is always locked to their own company server-side regardless of what's in
  // localStorage, so this is purely a convenience gate for the UI, not the real enforcement.
  useEffect(() => {
    if (!user || !isAdminSuperUser(user)) {
      setViewAsCompanyState(null);
      return;
    }
    setViewAsCompanyState(localStorage.getItem(VIEW_AS_COMPANY_KEY) || null);
  }, [user?.id, user?.username, user?.full_name, user?.role, user?.main_role]);

  const setViewAsCompany = React.useCallback(
    (company: string | null) => {
      if (!user || !isAdminSuperUser(user)) return;
      setViewAsCompanyState(company);
      if (company) localStorage.setItem(VIEW_AS_COMPANY_KEY, company);
      else localStorage.removeItem(VIEW_AS_COMPANY_KEY);
    },
    [user]
  );

  const refreshUserFromServer = React.useCallback(() => {
    if (!token) return Promise.resolve();
    return getMe()
      .then((me) => {
        const next = {
          id: me.id,
          username: me.username,
          role: me.role,
          main_role: me.main_role,
          roles: me.roles ?? [me.role],
          units: me.units ?? [],
          unit: me.unit ?? null,
          position: me.position ?? null,
          company: me.company ?? 'CW',
          first_name: me.first_name,
          last_name: me.last_name,
          full_name: me.full_name,
          status: me.status,
          suspension_reason: me.suspension_reason ?? null,
          unsuspend_reason: me.unsuspend_reason ?? null,
          unsuspend_ack: me.unsuspend_ack !== false,
          avatar_url: me.avatar_url ?? null,
          permissions: me.permissions ?? null,
        };
        setUser(next);
        localStorage.setItem('user', JSON.stringify(next));
      })
      .catch(() => {
        if (!localStorage.getItem('token')) clearLocalSession();
      });
  }, [clearLocalSession, token]);

  const refreshUser = React.useCallback(async () => {
    await refreshUserFromServer();
  }, [refreshUserFromServer]);

  const ackUnsuspendNotice = React.useCallback(async () => {
    await ackUnsuspend();
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, unsuspend_ack: true, unsuspend_reason: null };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  // On load: refresh user from DB so sidebar shows current role (e.g. after admin changed it)
  useEffect(() => {
    if (!token) return;
    refreshUserFromServer();
  }, [token, refreshUserFromServer]);

  // When tab becomes visible, refetch so sidebar reflects role changes from another tab
  useEffect(() => {
    if (!token) return;
    const onFocus = () => refreshUserFromServer();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [token, refreshUserFromServer]);

  const clearTimers = () => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    inactivityTimerRef.current = null;
    warningTimerRef.current = null;
  };

  const resetInactivityTimer = () => {
    clearTimers();
    lastActivityRef.current = Date.now();
    const { idle: idleMs, warn: warnMs } = getIdleConfig();

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, idleMs - warnMs);

    inactivityTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= idleMs) {
        console.log('Session expired due to inactivity.');
        alert('Your session has expired. Please log in again.');
        logout();
      }
    }, idleMs);
  };

  const stayActive = () => {
    setShowWarning(false);
    lastActivityRef.current = Date.now();
    resetInactivityTimer();
  };

  const login = (newToken: string, userData: User) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(userData);
    resetInactivityTimer();
  };

  const logout = async () => {
    setShowWarning(false);
    const currentToken = localStorage.getItem('token');

    try {
      if (currentToken) {
        await fetch(`${API_URL}/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }

    clearLocalSession();
    navigate('/login', { replace: true });
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  // Activity tracking
  useEffect(() => {
    if (!user) return;

    const handleActivity = () => {
      if (showWarning) return;
      lastActivityRef.current = Date.now();
      resetInactivityTimer();
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
    events.forEach(event => window.addEventListener(event, handleActivity, true));

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const { idle: idleMs, warn: warnMs } = getIdleConfig();
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= idleMs) {
        logout();
      } else if (elapsed >= idleMs - warnMs) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
        resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    resetInactivityTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity, true));
      document.removeEventListener('visibilitychange', handleVisibility);
      clearTimers();
    };
  }, [user, showWarning]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        hrEmployee,
        accessMode,
        setAccessMode,
        canUseSystemMode,
        isSystemMode,
        isAdminSuper,
        viewAsCompany,
        setViewAsCompany,
        login,
        logout,
        updateUser,
        refreshUser,
        ackUnsuspendNotice,
      }}
    >
      {children}

      {/* Session Warning Modal */}
      {showWarning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #000000',
              borderRadius: '0',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
              maxWidth: '400px',
              width: '90%',
              fontFamily: 'Arial, sans-serif',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                backgroundColor: '#000080',
                color: '#ffffff',
                padding: '8px 12px',
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Session Expiring</span>
              <button
                onClick={stayActive}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: 0,
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#f0f0f0',
                color: '#000000',
              }}
            >
              <p style={{ marginBottom: '15px', fontSize: '14px', lineHeight: '1.5' }}>
                Your session will expire soon due to inactivity.<br />
                Would you like to stay active?
              </p>
              <div>
                <button
                  onClick={stayActive}
                  style={{
                    backgroundColor: '#c0c0c0',
                    border: '1px outset #ffffff',
                    color: '#000000',
                    padding: '6px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginRight: '10px',
                    minWidth: '100px',
                  }}
                >
                  Yes, Stay Active
                </button>
                <button
                  onClick={logout}
                  style={{
                    backgroundColor: '#c0c0c0',
                    border: '1px outset #ffffff',
                    color: '#000000',
                    padding: '6px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    minWidth: '100px',
                  }}
                >
                  Log Out Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};
