// src/pages/ProfilePage.tsx ← FINAL + AUDIT LOG (Nothing Removed!)
import React, { useRef, useState } from 'react';
import { Settings, User, Lock, Save, Eye, EyeOff, CheckCircle, Camera } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '@/lib/api';
import { UserAvatar } from '@/components/UserAvatar';

const ProfilePage = () => {
  const { user, updateUser } = useAuth();

  const [username, setUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePhotoChange = async (file: File | null) => {
    if (!file) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      fd.append('photo', file);
      const res = await fetch(`${API_URL}/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not save photo');
      updateUser({ avatar_url: data.avatar_url });
      setMessage({ type: 'success', text: 'Workspace photo updated. This is used in chat and across Vobiss.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Could not save photo' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      const res = await fetch(`${API_URL}/profile/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username.trim(),
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined
        })
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        // AUDIT LOG — SILENTLY ADDED (No UI change!)
        await fetch(`${API_URL}/audit-log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'update_profile',
            details: {
              changed_username: username.trim() !== user?.username,
              changed_password: !!newPassword
            }
          })
        }).catch(() => {}); // Silent — never breaks the UI

      } else {
        setMessage({ type: 'error', text: data.message || 'Update failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Profile & Security</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Your workspace photo, login, and password</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="text-center">
            <div className="relative mx-auto h-20 w-20">
              <UserAvatar
                src={user?.avatar_url}
                name={user?.full_name || user?.username}
                className="h-20 w-20 text-3xl"
              />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-[var(--shadow)]"
                aria-label="Change workspace photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePhotoChange(e.target.files?.[0] || null);
                  e.target.value = '';
                }}
              />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">{user?.full_name || 'User'}</h2>
            <p className="text-sm font-medium text-[var(--primary)]">@{user?.username}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              {photoBusy ? 'Saving photo…' : 'This photo is for Vobiss chat and workspace. HR files stay unchanged.'}
            </p>
            <div className="mt-4 inline-block rounded-full bg-[var(--accent-green-light)] px-4 py-1.5 text-xs font-medium text-[var(--success-text)]">
              {user?.position || String(user?.role || 'User').replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>Account Type</span>
              <span className="font-medium text-[var(--text-primary)]">Standard</span>
            </div>
            <div className="flex justify-between">
              <span>Login Method</span>
              <span className="font-medium text-[var(--text-primary)]">Username</span>
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 lg:col-span-2 shadow-[var(--shadow-md)]">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
                <User className="h-5 w-5 text-[var(--primary)]" />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
                placeholder="Your login username"
              />
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Login with this username or your email. New users start with email as username; you can change it here anytime.
              </p>
            </div>

            <div className="space-y-5">
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-body)]">
                <Lock className="h-5 w-5 text-[var(--primary)]" />
                Change Password <span className="text-[var(--text-muted)]">(optional)</span>
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="relative">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 pr-11 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
                  />
                  <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {showCurrent ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 pr-11 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {showNew ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 pr-11 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--accent-green-light)]"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            </div>

            {message && (
              <div className={`flex items-center gap-3 rounded-[var(--radius)] border p-4 text-sm font-medium ${
                message.type === 'success'
                  ? 'border-[var(--accent-green)] bg-[var(--accent-green-light)] text-[var(--success-text)]'
                  : 'border-[var(--accent-red)] bg-[var(--accent-red-light)] text-[var(--danger-text)]'
              }`}>
                {message.type === 'success' && <CheckCircle className="h-5 w-5" />}
                <span>{message.text}</span>
              </div>
            )}

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--accent-green-light)] p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]">
                  <Settings className="h-5 w-5 text-[var(--primary)]" />
                </div>
                <div className="flex-1">
                  <h3 className="mb-1 text-base font-semibold text-[var(--text-primary)]">
                    Important Information
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--text-body)]">
                    Hello <span className="font-medium text-[var(--primary)]">{user?.full_name || 'User'}</span>,
                    <br />
                    Any changes you make to your <span className="font-medium">username</span> or <span className="font-medium">password</span> will take effect immediately.
                    <br /><br />
                    <strong>You will need to use your new credentials the next time you log in.</strong>
                    <br />
                    Please make sure to remember or securely save your updated login details.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--primary)] px-6 py-2.5 font-medium text-white hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;