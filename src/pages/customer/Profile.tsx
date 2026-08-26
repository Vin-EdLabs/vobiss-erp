// src/pages/customer/Profile.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerSidebar from '../../components/customer/CustomerSidebar';
import MobileBottomNav from '../../components/customer/MobileBottomNav';
import CustomerHeader from '../../components/customer/CustomerHeader';
import { User, Mail, Phone, Calendar, Shield, Building2, Hash, KeyRound } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { changeClientPassword } from '../../api';

const Profile: React.FC = () => {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const token = localStorage.getItem('customer_token');
        if (!token) {
          navigate('/customer/login');
          return;
        }

        const res = await fetch(`${API_URL}/customer/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setProfile(data.customer || data);
      } catch (err: any) {
        setError('Unable to load your profile. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)]">
        <div className="text-center">
          <div className="mx-auto mb-6 h-16 w-16 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--primary)]" />
          <p className="text-xl text-[var(--text-secondary)]">Loading your profile…</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--content-bg)] p-4">
        <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-[var(--shadow-md)]">
          <Shield className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h2 className="mb-3 text-2xl font-bold text-[var(--text-primary)]">Access Denied</h2>
          <p className="mb-8 text-[var(--text-muted)]">{error || 'Profile not found'}</p>
          <button
            type="button"
            onClick={() => navigate('/customer/dashboard')}
            className="rounded-xl bg-[var(--primary)] px-8 py-3 font-medium text-white transition hover:bg-[var(--primary-hover)]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const handlePasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);
    if (passwords.next.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setChangingPassword(true);
    try {
      await changeClientPassword(passwords.current, passwords.next);
      setPasswords({ current: '', next: '', confirm: '' });
      setPasswordMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setPasswordMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to change password.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const fieldIcon = (Icon: React.ElementType) => (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-green-light)]">
      <Icon className="h-6 w-6 text-[var(--primary)]" />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--content-bg)]">
      <CustomerSidebar />
      <div className="flex-1 pb-20 md:ml-64 md:pb-0">
        <CustomerHeader name={profile.name} customer_code={profile.customer_code} heightClass="py-4" />
        <div className="px-4 pb-10 pt-28 md:px-8 md:pt-32 lg:pt-36">
          <div className="mx-auto max-w-4xl">
            <h1 className="mb-8 flex items-center text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
              <User className="mr-4 h-10 w-10 text-[var(--primary)]" />
              My Profile
            </h1>

            <div className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
              <div className="bg-[var(--primary)] p-8 text-white md:p-12">
                <div className="flex flex-col items-center space-y-6 md:flex-row md:items-end md:space-y-0">
                  <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/40 bg-white/20 backdrop-blur">
                    <User className="h-16 w-16 text-white" />
                  </div>
                  <div className="text-center md:ml-8 md:text-left">
                    <h2 className="text-3xl font-bold">{profile.company_name || profile.name}</h2>
                    <p className="mt-2 flex items-center justify-center text-lg text-white/85 md:justify-start">
                      <Hash className="mr-2 h-5 w-5" />
                      Client ID: <span className="ml-2 font-mono font-semibold">{profile.customer_code}</span>
                    </p>
                    {profile.email && (
                      <p className="mt-2 flex items-center justify-center text-white/85 md:justify-start">
                        <Mail className="mr-2 h-5 w-5" />
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 md:p-12">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <div className="flex items-center space-x-4">
                    {fieldIcon(Phone)}
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Phone Number</p>
                      <p className="text-lg font-semibold text-[var(--text-primary)]">{profile.phone || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {fieldIcon(Mail)}
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Email Address</p>
                      <p className="text-lg font-semibold text-[var(--text-primary)]">{profile.email || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {fieldIcon(Building2)}
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Configured Sites</p>
                      <p className="text-xl font-semibold text-[var(--text-primary)]">{Array.isArray(profile.sites) ? profile.sites.length : 0}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {fieldIcon(Calendar)}
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Member Since</p>
                      <p className="text-xl font-semibold text-[var(--text-primary)]">{memberSince}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 dark:bg-green-950/40">
                      <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-[var(--text-muted)]">Account Status</p>
                      <p className="text-xl font-semibold text-green-600 dark:text-green-400">Active & Verified</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow-md)]">
              <h2 className="mb-2 flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
                <KeyRound className="h-6 w-6 text-[var(--primary)]" />
                Change Password
              </h2>
              <p className="mb-6 text-sm text-[var(--text-muted)]">Use at least 8 characters for your new password.</p>
              {passwordMessage && (
                <div
                  className={`mb-5 rounded-xl border p-3 text-sm ${
                    passwordMessage.type === 'success'
                      ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
                      : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                  }`}
                >
                  {passwordMessage.text}
                </div>
              )}
              <form onSubmit={handlePasswordChange} className="grid gap-4 md:grid-cols-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(e) => setPasswords((value) => ({ ...value, current: e.target.value }))}
                  placeholder="Current password"
                  required
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(e) => setPasswords((value) => ({ ...value, next: e.target.value }))}
                  placeholder="New password"
                  required
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((value) => ({ ...value, confirm: e.target.value }))}
                  placeholder="Confirm new password"
                  required
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                />
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="rounded-xl bg-[var(--primary)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-60 md:col-start-3"
                >
                  {changingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            </div>

            <div className="mt-10 text-center">
              <p className="text-lg text-[var(--text-muted)]">
                Need to update your information? Contact support at{' '}
                <a href="mailto:support@vobiss.com" className="font-semibold text-[var(--primary)] hover:underline">
                  support@vobiss.com
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Profile;
