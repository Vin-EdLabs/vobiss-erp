// src/pages/SettingsPage.tsx ← FINAL + AUDIT LOG (Nothing Removed!)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  RefreshCw,
  AlertCircle,
  Download,
  Upload,
  Trash2,
  Lock,
  Mail,
  Database,
  Send,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { getSettings, updateSetting } from '../api';
import { API_URL } from '@/lib/api';
import { useAuth } from '../context/AuthContext';
import SettingsChatAdmin from '../components/settings/SettingsChatAdmin';

const DB_BACKUP_CODE_KEY = 'vobiss_settings_db_backup_code';
const DB_RESTORE_CODE_KEY = 'vobiss_settings_db_restore_code';
const DB_WIPE_CODE_KEY = 'vobiss_settings_db_wipe_code';
const DB_RESTORE_FILE_KEY = 'vobiss_settings_db_restore_filename';

const SettingsPage: React.FC = () => {
  const { user, isAdminSuper } = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [settings, setSettings] = useState<{ [key: string]: string }>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const authCheckedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreFileLabel, setRestoreFileLabel] = useState(
    () => sessionStorage.getItem(DB_RESTORE_FILE_KEY) || ''
  );
  const [wipeCode, setWipeCode] = useState(() => sessionStorage.getItem(DB_WIPE_CODE_KEY) || '');
  const [backupCode, setBackupCode] = useState(
    () => sessionStorage.getItem(DB_BACKUP_CODE_KEY) || ''
  );
  const [restoreCode, setRestoreCode] = useState(
    () => sessionStorage.getItem(DB_RESTORE_CODE_KEY) || ''
  );
  const dbRestoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sessionStorage.setItem(DB_BACKUP_CODE_KEY, backupCode);
  }, [backupCode]);
  useEffect(() => {
    sessionStorage.setItem(DB_RESTORE_CODE_KEY, restoreCode);
  }, [restoreCode]);
  useEffect(() => {
    sessionStorage.setItem(DB_WIPE_CODE_KEY, wipeCode);
  }, [wipeCode]);
  useEffect(() => {
    if (restoreFileLabel) sessionStorage.setItem(DB_RESTORE_FILE_KEY, restoreFileLabel);
    else sessionStorage.removeItem(DB_RESTORE_FILE_KEY);
  }, [restoreFileLabel]);

  const onDbRestoreFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Please choose a .json inventory backup file.');
      return;
    }
    setRestoreFile(file);
    setRestoreFileLabel(file.name);
    setError(null);
  }, []);
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    if (!user) return;
    const role = (user.main_role || user.role || '').toLowerCase();
    const canManageSettings = isAdminSuper || ['admin', 'superadmin'].includes(role);
    if (!canManageSettings) {
      navigate('/');
      return;
    }
    if (!authCheckedRef.current) {
      authCheckedRef.current = true;
      void fetchSettings(true);
    }
  }, [navigate, user, token, isAdminSuper]);

  const fetchSettings = async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoad(true);
      else setRefreshing(true);
      const data = await getSettings();
      setSettings(data);
    } catch {
      setError('Failed to fetch settings');
    } finally {
      if (isInitial) setInitialLoad(false);
      else setRefreshing(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      setSaving(true);
      setError(null);
      const oldValue = settings[key] || 'none';
      const updated = await updateSetting(key, value);
      setSettings(prev => ({ ...prev, [key]: updated.value }));
      setSuccess('Setting updated successfully');

      // AUDIT LOG — SILENTLY ADDED
      await fetch(`${API_URL}/audit-log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'update_setting',
          details: { key, old_value: oldValue, new_value: value }
        })
      }).catch(() => {}); // Silent — never breaks UI

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ to: testEmail })
      });

      if (res.ok) {
        setTestResult('success');
        setSuccess('Test email sent successfully! Check your inbox.');
      } else {
        const err = await res.text();
        throw new Error(err || 'Failed to send test email');
      }
    } catch (err: any) {
      setTestResult('error');
      setError(err.message || 'Test email failed');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 6000);
    }
  };

  // YOUR ORIGINAL FUNCTIONS — 100% UNCHANGED
  const handleBackup = async () => {
    if (!backupCode.trim()) return setError('Developer code required for backup');
    try {
      setError(null);
      const res = await fetch(`${API_URL}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ developerCode: backupCode })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to create backup');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vobiss-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setSuccess('Backup downloaded successfully');
    } catch (err: any) {
      setError(err.message || 'Backup failed');
    }
  };

  const handleRestore = async () => {
    if (!restoreFile || !restoreCode.trim()) {
      return setError('Backup file and developer code required');
    }

    try {
      setError(null);
      let text = await restoreFile.text();
      text = text
        .replace(/"receipt_images":\s*null/g, '"receipt_images": []')
        .replace(/"details":\s*null/g, '"details": {}');

      let backupData;
      try {
        backupData = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid backup file format');
      }

      const res = await fetch(`${API_URL}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          backup: backupData, 
          developerCode: restoreCode 
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || 'Restore failed');
      }

      setSuccess((data as { message?: string }).message || 'Database restored successfully!');
      setRestoreFile(null);
      setRestoreFileLabel('');
      if (dbRestoreInputRef.current) dbRestoreInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Restore failed');
    }
  };

  const handleWipe = async () => {
    if (!wipeCode.trim()) return;
    if (!confirm('This will permanently delete ALL data. Proceed?')) return;
    try {
      const res = await fetch(`${API_URL}/wipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ developerCode: wipeCode })
      });
      if (!res.ok) throw new Error('Failed to wipe database');
      setSuccess('Database wiped successfully');
      setWipeCode('');
    } catch (err: any) {
      setError(err.message || 'Wipe failed');
    }
  };

  const emailSettings = [
    { key: 'from_name', label: 'Sender Name', type: 'text', desc: 'Display name for sender in low stock alert emails.' },
    { key: 'from_email', label: 'Sender Email', type: 'email', desc: 'Email address for low stock alert sender.' },
  ];

  const smtpFields = [
    { key: 'smtp_host', label: 'SMTP Host', placeholder: 'e.g. smtp.gmail.com' },
    { key: 'smtp_port', label: 'SMTP Port', placeholder: '587 (recommended)' },
    { key: 'smtp_encryption', label: 'Encryption', placeholder: 'tls or ssl' },
    { key: 'smtp_username', label: 'SMTP Username', placeholder: 'ezekiel.dannis@vobissgh.com' },
    { key: 'smtp_password', label: 'SMTP Password', type: 'password', placeholder: 'App password or account password' },
  ];

  return (
    <div className="relative">
      {initialLoad && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--content-bg)]/80">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[var(--primary)]" />
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">System Settings</h1>
        <button
          onClick={() => void fetchSettings(false)}
          disabled={refreshing}
          className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-hover)]"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 flex items-center rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-4 text-[var(--danger-text)]">
          <AlertCircle className="mr-2 h-5 w-5" /> {error}
        </div>
      )}
      {success && (
        <div className="mb-6 flex items-center rounded-[var(--radius)] border border-[var(--accent-green)] bg-[var(--accent-green-light)] p-4 text-[var(--success-text)]">
          <CheckCircle className="mr-2 h-5 w-5" /> {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Email Configuration */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="mb-6 flex items-center">
            <Mail className="mr-3 h-6 w-6 text-[var(--primary)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Email Configuration</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">SMTP Server Settings</h3>
              <p className="mb-5 text-sm text-[var(--text-secondary)]">Leave blank to use .env values (current Gmail fallback)</p>

              {smtpFields.map(field => (
                <div key={field.key} className="mb-5">
                  <label className="mb-1 block text-sm font-medium text-[var(--text-body)]">
                    {field.label}
                    {field.key === 'smtp_password' && <Lock className="ml-1 inline h-4 w-4 text-[var(--text-muted)]" />}
                  </label>
                  <div className="flex gap-3">
                    <input
                      type={field.type || 'text'}
                      value={settings[field.key] || ''}
                      onChange={e => setSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                    />
                    <button
                      onClick={() => handleUpdateSetting(field.key, settings[field.key] || '')}
                      disabled={saving}
                      className="flex items-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border)] pt-6">
              <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Email Appearance</h3>
              {emailSettings.map(s => (
                <div key={s.key} className="mb-5">
                  <label className="text-sm font-medium text-[var(--text-body)]">{s.label}</label>
                  <input
                    type={s.type}
                    value={settings[s.key] || ''}
                    onChange={e => setSettings(prev => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={s.label}
                    className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{s.desc}</p>
                  <button
                    onClick={() => handleUpdateSetting(s.key, settings[s.key] || '')}
                    className="mt-3 flex items-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
                  >
                    <Save className="h-4 w-4 mr-1" /> Save {s.label}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-6">
              <h4 className="mb-3 flex items-center font-semibold text-[var(--text-primary)]">
                <Send className="mr-2 h-5 w-5 text-[var(--primary)]" /> Send Test Email
              </h4>
              <div className="flex gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="Enter your email to test"
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                />
                <button
                  onClick={sendTestEmail}
                  disabled={testing}
                  className="flex items-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-6 py-3 font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-70"
                >
                  {testing ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : testResult === 'success' ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : testResult === 'error' ? (
                    <XCircle className="h-5 w-5" />
                  ) : (
                    <>Send Test</>
                  )}
                </button>
              </div>
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Uses current settings (or .env fallback if blank)
              </p>
            </div>
          </div>
        </div>

        {/* Database Management */}
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
          <div className="mb-4 flex items-center">
            <Database className="mr-2 h-5 w-5 text-[var(--primary)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Database Management</h2>
          </div>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">Backup or restore the full database, including field, HR, tickets, and chat (requires developer code).</p>

          <div className="space-y-5">
            <div className="rounded-[var(--radius)] border border-[var(--accent-green)] bg-[var(--accent-green-light)] p-4">
              <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Backup Code</label>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={backupCode}
                  onChange={e => setBackupCode(e.target.value)}
                  placeholder="Enter developer code"
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                />
                <button
                  onClick={handleBackup}
                  className="flex items-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-2 text-white hover:bg-[var(--primary-hover)]"
                >
                  <Download className="h-4 w-4 mr-1" /> Backup
                </button>
              </div>
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent-blue-light)] p-4">
              <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Restore Code & File</label>
              <input
                ref={dbRestoreInputRef}
                id="vobiss-db-restore-file"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onDbRestoreFile(file);
                  e.target.value = '';
                }}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-2 sm:gap-0">
                <label
                  htmlFor="vobiss-db-restore-file"
                  className="flex cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] sm:w-1/2"
                >
                  {restoreFile || restoreFileLabel ? 'Change backup file…' : 'Choose backup file…'}
                </label>
                <input
                  type="password"
                  value={restoreCode}
                  onChange={e => setRestoreCode(e.target.value)}
                  placeholder="Developer code"
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={!restoreFile || !restoreCode.trim()}
                  className="flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-2 text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
                >
                  <Upload className="h-4 w-4 mr-1" /> Restore
                </button>
              </div>
              {(restoreFile || restoreFileLabel) && (
                <p className="mt-2 text-xs font-medium text-[var(--info-text)]">
                  Selected: {restoreFile?.name || restoreFileLabel}
                  {!restoreFile && restoreFileLabel ? ' — choose the file again to restore' : ''}
                </p>
              )}
            </div>

            <div className="rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-4">
              <label className="mb-2 block text-sm font-medium text-[var(--text-body)]">Wipe Database</label>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={wipeCode}
                  onChange={e => setWipeCode(e.target.value)}
                  placeholder="Developer code"
                  className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-green-light)]"
                />
                <button
                  onClick={handleWipe}
                  className="flex items-center rounded-[var(--radius-sm)] bg-[var(--danger)] px-3 py-2 text-white hover:brightness-90"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Wipe
                </button>
              </div>
              <p className="mt-2 text-xs text-[var(--danger-text)]">This will permanently delete all data. Backup first.</p>
            </div>
          </div>
        </div>

        <SettingsChatAdmin
          key="settings-chat-admin"
          token={token}
          onError={(msg) => {
            if (msg) {
              setSuccess(null);
              setError(msg);
            } else {
              setError(null);
            }
          }}
          onSuccess={(msg) => {
            setError(null);
            setSuccess(msg);
          }}
        />
      </div>
    </div>
  );
};

export default SettingsPage;