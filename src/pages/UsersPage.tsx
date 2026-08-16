import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUsers, createUser, updateUserRole, updateUser, deleteUser, UserRole } from '../api';
import { ResetPasswordModal } from '../components/users/ResetPasswordModal';
import { useToast } from '@/hooks/use-toast';
import { getUserRoles, isSystemAdminAccount, SYSTEM_ADMIN_LABEL } from '@/config/roles';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { GreetingBanner, OutlinePill } from '@/components/ui/greeting-banner';
import { StatCard } from '@/components/ui/stat-card';
import { UserPlus, Mail, Key, Users, AlertCircle, X, CheckCircle, Edit, Trash2, Crown, Briefcase, User, Copy, RefreshCw, Search, ChevronDown, Shield } from 'lucide-react';

/** System access only — unit and position are configured separately. System Admin is reserved and hidden. */
const ROLE_OPTIONS: { value: 'user' | 'admin'; label: string }[] = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
];

type SystemAccessRole = (typeof ROLE_OPTIONS)[number]['value'];

const UNIT_OPTIONS = [
  { value: '', label: 'No unit / Global' },
  { value: 'noc', label: 'NOC (Network Operations Center)' },
  { value: 'ip', label: 'IP (Infrastructure & Provisioning)' },
  { value: 'ts', label: 'TS (Transmission Unit)' },
  { value: 'project', label: 'Project Unit' },
  { value: 'cx', label: 'CX (Customer Experience)' },
  { value: 'finance', label: 'Finance' },
  { value: 'sales', label: 'Sales' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'operations', label: 'Operations' },
  { value: 'hr', label: 'HR' },
] as const;

const POSITION_OPTIONS = [
  { value: '', label: 'Select position' },
  { value: 'Director', label: 'Director' },
  { value: 'NOC Manager', label: 'NOC Manager' },
  { value: 'IP Manager', label: 'IP Manager' },
  { value: 'TX Manager', label: 'TS Manager' },
  { value: 'Project Manager', label: 'Project Manager' },
  { value: 'IP Supervisor', label: 'IP Supervisor' },
  { value: 'NOC Supervisor', label: 'NOC Supervisor' },
  { value: 'TX Supervisor', label: 'TS Supervisor' },
  { value: 'Project Supervisor', label: 'Project Supervisor' },
  { value: 'Procurement', label: 'Procurement' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Engineer', label: 'Engineer' },
  { value: 'Account Manager', label: 'Account Manager' },
  { value: 'Relationship Officer', label: 'Relationship Officer' },
  { value: 'Customer Support', label: 'Customer Support' },
  { value: 'Sales', label: 'Sales' },
  { value: 'HR', label: 'HR' },
] as const;

const GLOBAL_POSITIONS = new Set([
  'Director',
]);

const isGlobalPosition = (position: string) => GLOBAL_POSITIONS.has(position);

function resolveSystemAccessRole(user: {
  role?: string;
  main_role?: string;
  roles?: string[] | string;
}): SystemAccessRole {
  const slugs = getUserRoles(user);
  if (slugs.includes('admin') || slugs.includes('superadmin') || slugs.includes('system_admin') || slugs.includes('field_engineer_admin')) return 'admin';
  return 'user';
}

const formatUnitLabel = (unit?: string | null) => {
  const value = String(unit || '').trim().toLowerCase();
  if (!value) return 'No unit';
  if (value === 'tx' || value === 'ts') return 'TS (Transmission Unit)';
  return UNIT_OPTIONS.find((opt) => opt.value === value)?.label || value.toUpperCase();
};

const formatUnitsLabel = (user: any) => {
  const slugs = [
    user?.unit,
    ...(Array.isArray(user?.units) ? user.units : []),
  ]
    .map((v) => {
      const slug = String(v || '').trim().toLowerCase();
      if (!slug) return '';
      return slug === 'tx' ? 'ts' : slug;
    })
    .filter(Boolean);
  const unique = [...new Set(slugs)].slice(0, 2);
  if (unique.length === 0) return 'No unit';
  return unique.map((slug) => formatUnitLabel(slug)).join(' · ');
};

const pairFromUser = (user: any) => {
  const slugs = [
    user?.unit,
    ...(Array.isArray(user?.units) ? user.units : []),
  ]
    .map((v) => {
      const slug = String(v || '').trim().toLowerCase();
      if (!slug) return '';
      return slug === 'tx' ? 'ts' : slug;
    })
    .filter(Boolean);
  const unique = [...new Set(slugs)].slice(0, 2);
  return { unit: unique[0] || '', unit2: unique[1] || '' };
};

const uniqueUnits = (unit: string, unit2: string) =>
  [...new Set(
    [unit, unit2]
      .map((v) => {
        const slug = String(v || '').trim().toLowerCase();
        if (!slug) return '';
        return slug === 'tx' ? 'ts' : String(v || '').trim();
      })
      .filter(Boolean)
  )].slice(0, 2);

const ROLE_LABELS: Record<string, string> = {
  user: 'User',
  admin: 'Admin',
  superadmin: SYSTEM_ADMIN_LABEL,
};

const formatRoleLabel = (role?: string | null) => {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return 'No role';
  return ROLE_LABELS[value] || ROLE_OPTIONS.find((opt) => opt.value === value)?.label || value.replace(/_/g, ' ');
};

const actualRoleOf = (user: any) => String(user?.main_role || user?.role || 'user').trim().toLowerCase();

const displayPositionForUser = (user: any) => {
  if (isSystemAdminAccount(user)) return SYSTEM_ADMIN_LABEL;
  return String(user?.position || '').trim() || 'No position';
};

const UsersPage: React.FC = () => {
  const { user: currentUser, updateUser: updateAuthUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: 'user' as SystemAccessRole,
    unit: '',
    unit2: '',
    position: '',
  });
  const [createPassword, setCreatePassword] = useState('');
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('');
  const [createUseAuto, setCreateUseAuto] = useState(false);
  const [createSendEmail, setCreateSendEmail] = useState(false);
  const [createResult, setCreateResult] = useState<{
    name: string;
    email: string;
    username: string;
    password: string;
    emailSent?: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [editModalError, setEditModalError] = useState('');
  const [success, setSuccess] = useState('');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editFormData, setEditFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: 'user' as SystemAccessRole,
    unit: '',
    unit2: '',
    position: '',
    units: [] as string[],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const showPageError = useCallback(
    (message: string, options?: { inEditModal?: boolean }) => {
      const msg = message || 'Something went wrong';
      setError(msg);
      setErrorModalOpen(true);
      if (options?.inEditModal) setEditModalError(msg);
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description: msg,
      });
    },
    [toast]
  );

  const clearPageError = useCallback(() => {
    setError('');
    setErrorModalOpen(false);
    setEditModalError('');
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers((Array.isArray(data) ? data : []).filter((u: any) => !isSystemAdminAccount(u)));
    } catch (err: any) {
      showPageError(err.message || 'Failed to load users');
    }
  };

  const generateCreatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setCreatePassword(pwd);
    setCreatePasswordConfirm(pwd);
    setCreateUseAuto(false);
  };

  const resetCreateForm = () => {
    setFormData({ first_name: '', last_name: '', email: '', role: 'user', unit: '', unit2: '', position: '' });
    setCreatePassword('');
    setCreatePasswordConfirm('');
    setCreateUseAuto(false);
    setCreateSendEmail(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUseAuto) {
      if (!createPassword.trim()) {
        showPageError('Enter a password for the user');
        return;
      }
      if (createPassword.length < 6) {
        showPageError('Password must be at least 6 characters');
        return;
      }
      if (createPassword !== createPasswordConfirm) {
        showPageError('Passwords do not match');
        return;
      }
    }

    setLoading(true);
    clearPageError();
    setSuccess('');
    try {
      if (!formData.position) {
        showPageError('Select a position for the user');
        setLoading(false);
        return;
      }
      if (!isGlobalPosition(formData.position) && !formData.unit && !formData.unit2) {
        showPageError('Select at least one unit for this position');
        setLoading(false);
        return;
      }
      const units = uniqueUnits(formData.unit, formData.unit2);
      const firstName = formData.first_name.trim();
      const lastName = formData.last_name.trim();
      const email = formData.email.trim().toLowerCase();
      const created = await createUser(
        firstName,
        lastName,
        email,
        formData.role as UserRole,
        {
          password: createUseAuto ? undefined : createPassword.trim(),
          useAutoGenerate: createUseAuto,
          sendEmail: createSendEmail,
          unit: units[0] || undefined,
          position: formData.position,
          units,
        }
      );
      await loadUsers();
      if (created.password) {
        setCreateResult({
          name: `${firstName} ${lastName}`.trim(),
          email: created.email || email,
          username: created.username || email,
          password: created.password,
          emailSent: created.emailSent,
        });
      }
      resetCreateForm();
      if (created.emailWarning) {
        setSuccess(`User created. Email was not sent: ${created.emailWarning}`);
        setTimeout(() => setSuccess(''), 8000);
      } else if (!created.password) {
        setSuccess('User created successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to create user';
      if (msg.includes('welcome email')) {
        showPageError(
          'The server blocked creation because of email. Restart the backend (node server.js), leave "Email credentials" unchecked, and try again.'
        );
      } else {
        showPageError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyCreatePassword = async () => {
    if (!createResult?.password) return;
    try {
      await navigator.clipboard.writeText(createResult.password);
      setSuccess('Credentials copied to clipboard');
      setTimeout(() => setSuccess(''), 2000);
    } catch {
      showPageError('Could not copy');
    }
  };

  const isMainSuperadmin = (u: any) => isSystemAdminAccount(u);

  const openResetModal = (userToReset: any) => {
    if (isMainSuperadmin(userToReset)) {
      showPageError('Cannot reset password for System Admin');
      return;
    }
    setSelectedUser(userToReset);
    setShowResetModal(true);
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setSelectedUser(null);
  };

  const openEditModal = (userToEdit: any) => {
    if (isMainSuperadmin(userToEdit)) {
      showPageError('Cannot edit System Admin');
      return;
    }
    setEditingUser(userToEdit);
    setEditModalError('');
    const pair = pairFromUser(userToEdit);
    setEditFormData({
      first_name: userToEdit.first_name || '',
      last_name: userToEdit.last_name || '',
      email: userToEdit.email || '',
      role: resolveSystemAccessRole(userToEdit),
      unit: pair.unit,
      unit2: pair.unit2,
      position: userToEdit.position || '',
      units: uniqueUnits(pair.unit, pair.unit2),
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
    setEditFormData({ first_name: '', last_name: '', email: '', role: 'user', unit: '', unit2: '', position: '', units: [] });
    setEditModalError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setUpdating(true);
    clearPageError();
    setSuccess('');
    try {
      if (editFormData.position && !isGlobalPosition(editFormData.position) && !editFormData.unit && !editFormData.unit2) {
        showPageError('Select at least one unit for this position', { inEditModal: true });
        setUpdating(false);
        return;
      }
      const unitsToSave = uniqueUnits(editFormData.unit, editFormData.unit2);

      const updated = await updateUser(editingUser.id, {
        first_name: editFormData.first_name.trim(),
        last_name: editFormData.last_name.trim(),
        email: editFormData.email.trim(),
        role: editFormData.role,
        unit: unitsToSave[0] || null,
        position: editFormData.position || null,
        units: unitsToSave,
      });
      await loadUsers();

      // If the edited user is the one currently logged in, update sidebar roles immediately
      if (currentUser?.id === editingUser.id) {
        updateAuthUser({
          role: updated.role,
          main_role: (updated as any).main_role || updated.role,
          ...(updated as any).roles ? { roles: (updated as any).roles } : {},
          unit: (updated as any).unit ?? unitsToSave[0] ?? null,
          position: (updated as any).position ?? editFormData.position ?? null,
          units: Array.isArray((updated as any).units) ? (updated as any).units : unitsToSave,
        });
      }
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
      closeEditModal();
    } catch (err: any) {
      showPageError(err.message || 'Failed to update user', { inEditModal: true });
    } finally {
      setUpdating(false);
    }
  };

  const openDeleteModal = (userToDelete: any) => {
    if (userToDelete.id === currentUser?.id) {
      showPageError('Cannot delete your own account');
      return;
    }
    if (isMainSuperadmin(userToDelete)) {
      showPageError('Cannot delete System Admin');
      return;
    }
    setDeletingUser(userToDelete);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeletingUser(null);
  };

  const confirmDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    clearPageError();
    setSuccess('');
    try {
      await deleteUser(deletingUser.id);
      await loadUsers();
      setSuccess('User deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
      closeDeleteModal();
    } catch (err: any) {
      showPageError(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    clearPageError();
    try {
      const updated = await updateUserRole(userId, newRole as UserRole);
      await loadUsers();

      if (currentUser?.id === userId) {
        const parsedUnits =
          (updated as { units?: string[] | string }).units != null
            ? typeof (updated as { units?: string | string[] }).units === 'string'
              ? JSON.parse((updated as { units: string }).units)
              : (updated as { units: string[] }).units
            : [];
        updateAuthUser({
          role: updated.role,
          main_role: updated.main_role || updated.role,
          ...(updated as any).roles ? { roles: (updated as any).roles } : {},
          unit: (updated as any).unit ?? currentUser.unit ?? null,
          position: (updated as any).position ?? currentUser.position ?? null,
          units: Array.isArray(parsedUnits) ? parsedUnits : [],
        });
      }

      setSuccess('Role updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      await loadUsers();
      showPageError(err.message || 'Failed to update role');
    }
  };

  const getRoleBadgeColor = (role: SystemAccessRole) => {
    const colors: Record<SystemAccessRole, string> = {
      user: 'bg-gray-100 text-gray-800 border-gray-200',
      admin: 'bg-blue-100 text-blue-800 border-blue-200',
      superadmin: 'bg-purple-100 text-purple-800 border-purple-200',
    };
    return colors[role] || colors.user;
  };

  const getRoleIcon = (role: SystemAccessRole) => {
    switch (role) {
      case 'superadmin':
        return <Crown className="w-3 h-3 ml-1" />;
      case 'admin':
        return <Briefcase className="w-3 h-3 ml-1" />;
      default:
        return <User className="w-3 h-3 ml-1" />;
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u: any) => {
      const name = `${u.first_name || ''} ${u.last_name || ''}`;
      const role = actualRoleOf(u);
      const unit = formatUnitsLabel(u);
      return [
        name,
        u.email,
        u.username,
        role,
        formatRoleLabel(role),
        unit,
        u.position,
        displayPositionForUser(u),
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [users, searchQuery]);

  const adminCount = users.filter((u: any) => {
    const role = actualRoleOf(u);
    return role === 'admin' || role === 'superadmin';
  }).length;
  const hrCount = users.filter((u: any) => {
    const units = pairFromUser(u);
    return units.unit === 'hr' || units.unit2 === 'hr' || String(u.position || '').trim().toLowerCase() === 'hr' || actualRoleOf(u) === 'hr';
  }).length;
  const firstName = currentUser?.first_name || String((currentUser as any)?.full_name || 'there').split(/\s+/)[0];

  const roleOptions = ROLE_OPTIONS;
  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="fixed top-0 left-0 right-0 z-[90] border-b-4 border-red-600 bg-red-600 px-4 py-3 text-center text-white shadow-lg"
        >
          <p className="text-sm font-semibold sm:text-base">{error}</p>
        </div>
      )}

      {errorModalOpen && error && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div
            role="alertdialog"
            aria-labelledby="user-error-title"
            className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertCircle className="h-7 w-7 text-red-600" />
              </div>
              <div>
                <h2 id="user-error-title" className="text-xl font-bold text-red-700">
                  Could not save user
                </h2>
                <p className="mt-2 text-base leading-relaxed text-[var(--text-primary)]">{error}</p>
                {error.toLowerCase().includes('invalid role') && (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">
                    Pick a role from the list (e.g. NOC Manager, Relationship Officer). If this
                    keeps happening, restart the backend so it loads the latest role definitions.
                  </p>
                )}
              </div>
            </div>
            <Button type="button" onClick={clearPageError} className="w-full">
              OK, I understand
            </Button>
          </div>
        </div>
      )}

      <GreetingBanner
        name={firstName}
        pills={
          <>
            <OutlinePill icon={Users}>Users</OutlinePill>
            <OutlinePill icon={Shield}>Permissions</OutlinePill>
          </>
        }
        actions={
          <Button size="sm" onClick={() => setCreateOpen((open) => !open)}>
            <UserPlus className="h-4 w-4" />
            {createOpen ? 'Hide form' : 'Create user'}
          </Button>
        }
      />

      {success && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--text-primary)]">{success}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={Users} label="All users" value={users.length} hint="Active logins" accentIndex={0} />
        <StatCard icon={Crown} label="Admins" value={adminCount} hint="Admin accounts" accentIndex={1} />
        <StatCard icon={Briefcase} label="HR" value={hrCount} hint="Human resources" accentIndex={2} />
        <StatCard icon={Search} label="Showing" value={filteredUsers.length} hint={searchQuery.trim() ? 'Matching search' : 'Full directory'} accentIndex={3} />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <button
          type="button"
          onClick={() => setCreateOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            <UserPlus className="h-4 w-4" />
            Create new user
          </span>
          <ChevronDown className={`h-4 w-4 text-[var(--text-secondary)] transition-transform ${createOpen ? 'rotate-180' : ''}`} />
        </button>
        {createOpen && (
          <div className="border-t border-[var(--border)] p-4">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">First Name</label>
                  <input
                    type="text"
                    placeholder="Enter first name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md outline-none transition"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Last Name</label>
                  <input
                    type="text"
                    placeholder="Enter last name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md outline-none transition"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input
                      type="email"
                      placeholder="user@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-8 pr-3 py-2 border rounded-md outline-none transition"
                      required
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Login username will be this email (they can change it later in Profile).
                  </p>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">System Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as SystemAccessRole })}
                    className="w-full px-3 py-2 border rounded-md outline-none transition bg-[var(--surface)]"
                    required
                  >
                    {roleOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    User or Admin only. Admin can manage roles, settings, and system tools.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Position</label>
                  <select
                    value={formData.position}
                    onChange={(e) => {
                      const position = e.target.value;
                      setFormData({
                        ...formData,
                        position,
                        unit: isGlobalPosition(position) ? '' : formData.unit,
                        unit2: isGlobalPosition(position) ? '' : formData.unit2,
                      });
                    }}
                    className="w-full px-3 py-2 border rounded-md outline-none transition bg-[var(--surface)]"
                    required
                  >
                    {POSITION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Position controls sidebar and access.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Unit / Department</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value, unit2: e.target.value === formData.unit2 ? '' : formData.unit2 })}
                    className="w-full px-3 py-2 border rounded-md outline-none transition bg-[var(--surface)]"
                  >
                    {UNIT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Second unit (optional)</label>
                  <select
                    value={formData.unit2}
                    onChange={(e) => setFormData({ ...formData, unit2: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md outline-none transition bg-[var(--surface)]"
                  >
                    {UNIT_OPTIONS.filter((opt) => !opt.value || opt.value !== formData.unit).map(opt => (
                      <option key={opt.value || 'none'} value={opt.value}>{opt.value ? opt.label : 'None'}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">A person can belong to two units. Units shape dashboard features.</p>
                </div>
              </div>

              <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
                <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Initial password (required)</p>
                <p className="mb-3 text-xs text-[var(--text-muted)]">
                  Enter a password to give the user. Creation succeeds even if optional email fails.
                </p>
                {!createUseAuto ? (
                  <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Password</label>
                      <input
                        type="text"
                        value={createPassword}
                        onChange={(e) => setCreatePassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Confirm</label>
                      <input
                        type="text"
                        value={createPasswordConfirm}
                        onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                        className="w-full rounded-md border px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={generateCreatePassword}
                      className="flex items-center gap-2 text-sm font-medium text-[var(--primary)] md:col-span-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Generate random password
                    </button>
                  </div>
                ) : (
                  <p className="mb-3 text-sm text-[var(--text-secondary)]">A secure password will be generated when you create the user.</p>
                )}
                <label className="mb-3 flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createUseAuto}
                    onChange={(e) => {
                      setCreateUseAuto(e.target.checked);
                      if (e.target.checked) {
                        setCreatePassword('');
                        setCreatePasswordConfirm('');
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm text-[var(--text-primary)]">Auto-generate password instead</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={createSendEmail}
                    onChange={(e) => setCreateSendEmail(e.target.checked)}
                    className="mt-0.5 rounded"
                  />
                  <span className="text-sm text-[var(--text-secondary)]">
                    Email credentials to user (optional — you can share the password manually)
                  </span>
                </label>
              </div>
              
              <Button
                type="submit"
                disabled={
                  loading ||
                  !formData.first_name ||
                  !formData.last_name ||
                  !formData.email ||
                  !formData.position ||
                  (!isGlobalPosition(formData.position) && !formData.unit && !formData.unit2) ||
                  (!createUseAuto && (!createPassword.trim() || !createPasswordConfirm.trim()))
                }
              >
                <UserPlus className="w-3 h-3" />
                {loading ? 'Creating User...' : 'Create User'}
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            className="h-10 w-full rounded-[var(--radius-sm)] border pl-9 pr-3 text-sm outline-none"
            placeholder="Search name, email, username, role, unit…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <p className="px-1 text-xs text-[var(--text-muted)] md:px-2">{filteredUsers.length} of {users.length}</p>
      </div>

      <div className="vobiss-table-wrap overflow-x-auto">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">All Users ({filteredUsers.length})</h2>
        </div>
          
        <div className="overflow-x-auto">
          <table className="vobiss-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">User</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Username</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Email</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Role &amp; permissions</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Unit / Department</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Position</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                    {users.length === 0 ? 'No users found. Create your first user above.' : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u: any) => {
                  const selectOptions = ROLE_OPTIONS;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <UserAvatar
                            src={u.avatar_url}
                            name={`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}
                            className="h-8 w-8 flex-shrink-0 text-xs"
                          />
                          <div className="ml-3">
                            <div className="text-sm font-medium text-[var(--text-primary)]">
                              {u.first_name} {u.last_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-[var(--text-primary)]">{u.username}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-[var(--text-secondary)]">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isMainSuperadmin(u) ? (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full border ${getRoleBadgeColor('superadmin')} flex items-center`}>
                            System Admin {getRoleIcon('superadmin')}
                          </span>
                        ) : (
                          <select
                            value={resolveSystemAccessRole(u)}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className={`text-xs font-medium px-2 py-1 rounded-full border ${getRoleBadgeColor(resolveSystemAccessRole(u))} cursor-pointer hover:opacity-80 transition bg-[var(--surface)]`}
                          >
                            {selectOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                        {formatUnitsLabel(u)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-[var(--text-secondary)]">
                        {displayPositionForUser(u)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            disabled={isMainSuperadmin(u)}
                            className={`${isMainSuperadmin(u) ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--primary)]'} font-medium transition flex items-center gap-1 text-xs`}
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => openResetModal(u)}
                            disabled={isMainSuperadmin(u)}
                            className={`${isMainSuperadmin(u) ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-[var(--text-secondary)]'} font-medium transition flex items-center gap-1 text-xs`}
                          >
                            <Key className="w-3 h-3" />
                            Reset
                          </button>
                          <button
                            onClick={() => openDeleteModal(u)}
                            disabled={isMainSuperadmin(u) || u.id === currentUser?.id}
                            className={`${isMainSuperadmin(u) || u.id === currentUser?.id ? 'text-[var(--text-muted)] cursor-not-allowed' : 'text-red-600'} font-medium transition flex items-center gap-1 text-xs`}
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

        {showResetModal && selectedUser && (
          <ResetPasswordModal
            user={selectedUser}
            onClose={closeResetModal}
            onSuccess={(msg) => {
              setSuccess(msg);
              setTimeout(() => setSuccess(''), 5000);
            }}
            onError={(msg) => showPageError(msg)}
          />
        )}

        {createResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">User created</h3>
                <button type="button" onClick={() => setCreateResult(null)} className="text-slate-500 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-sm text-slate-600">
                Share these credentials with {createResult.name}. They can log in with <strong>email</strong> or <strong>username</strong>.
                {createResult.emailSent && ' Credentials were also emailed.'}
              </p>
              <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p><span className="text-slate-500">Email:</span> <strong>{createResult.email}</strong></p>
                <p><span className="text-slate-500">Username:</span> <strong>{createResult.username}</strong></p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-slate-500">Password:</span>
                  <code className="flex-1 font-bold text-emerald-900">{createResult.password}</code>
                  <button type="button" onClick={copyCreatePassword} className="rounded bg-emerald-600 p-2 text-white hover:bg-emerald-700">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateResult(null)}
                className="w-full rounded-md bg-gray-700 py-2 font-medium text-white hover:bg-gray-800"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-white bg-opacity-20 p-1.5 rounded-md">
                    <Edit className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Edit User</h3>
                </div>
                <button onClick={closeEditModal} className="text-white hover:bg-white hover:bg-opacity-20 rounded-md p-1 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-4">
                {editModalError && (
                  <div className="mb-4 rounded-lg border-2 border-red-500 bg-red-50 p-4 flex gap-3">
                    <AlertCircle className="h-6 w-6 shrink-0 text-red-600" />
                    <p className="text-sm font-medium text-red-900">{editModalError}</p>
                  </div>
                )}
                <form onSubmit={handleEditSubmit}>
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                      <input
                        type="text"
                        value={editFormData.first_name}
                        onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        value={editFormData.last_name}
                        onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        value={editFormData.email}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">System Role</label>
                      <select
                        value={editFormData.role}
                        onChange={(e) => {
                          setEditFormData((prev) => ({
                            ...prev,
                            role: e.target.value as SystemAccessRole,
                          }));
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                        required
                      >
                        {roleOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">User or Admin only.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Position</label>
                      <select
                        value={editFormData.position}
                        onChange={(e) => {
                          const position = e.target.value;
                          setEditFormData((prev) => ({
                            ...prev,
                            position,
                            unit: isGlobalPosition(position) ? '' : prev.unit,
                            unit2: isGlobalPosition(position) ? '' : prev.unit2,
                          }));
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                      >
                        {POSITION_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Position controls sidebar and access.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Unit / Department</label>
                      <select
                        value={editFormData.unit}
                        onChange={(e) => setEditFormData((prev) => ({
                          ...prev,
                          unit: e.target.value,
                          unit2: e.target.value === prev.unit2 ? '' : prev.unit2,
                        }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                      >
                        {UNIT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Second unit (optional)</label>
                      <select
                        value={editFormData.unit2}
                        onChange={(e) => setEditFormData((prev) => ({ ...prev, unit2: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                      >
                        {UNIT_OPTIONS.filter((opt) => !opt.value || opt.value !== editFormData.unit).map(opt => (
                          <option key={opt.value || 'none'} value={opt.value}>{opt.value ? opt.label : 'None'}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">A person can belong to two units. Units shape dashboard features.</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button type="button" onClick={closeEditModal} disabled={updating}
                      className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 font-medium rounded-md hover:bg-slate-50 transition disabled:opacity-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={updating}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-3 py-2 rounded-md transition shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                      {updating ? 'Updating...' : 'Update User'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Delete User Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 z-50">
            <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden">
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-white bg-opacity-20 p-1.5 rounded-md">
                    <Trash2 className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Delete User</h3>
                </div>
                <button onClick={closeDeleteModal} className="text-white hover:bg-white hover:bg-opacity-20 rounded-md p-1 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-4">
                <div className="mb-4">
                  <p className="text-slate-700 mb-3 text-sm">
                    You are about to permanently delete this user:
                  </p>
                  <div className="bg-slate-50 rounded-md p-3 border border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {deletingUser?.first_name?.charAt(0)}{deletingUser?.last_name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {deletingUser?.first_name} {deletingUser?.last_name}
                        </div>
                        <div className="text-xs text-slate-600">{deletingUser?.email}</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-red-600 mt-3">
                    This action cannot be undone. Are you sure?
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <button onClick={closeDeleteModal} disabled={deleting}
                    className="flex-1 px-3 py-2 border border-slate-300 text-slate-700 font-medium rounded-md hover:bg-slate-50 transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={confirmDeleteUser} disabled={deleting}
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium px-3 py-2 rounded-md transition shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                    {deleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default UsersPage;
