import React, { useState } from 'react';
import { Key, X, Copy, RefreshCw } from 'lucide-react';
import { resetUserPassword } from '../../api';

type UserRow = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  username?: string;
};

export function ResetPasswordModal({
  user,
  onClose,
  onSuccess,
  onError,
}: {
  user: UserRow;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [useAuto, setUseAuto] = useState(false);
  const [result, setResult] = useState<{
    password: string;
    username?: string;
    emailSent?: boolean;
  } | null>(null);

  const generateLocalPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setPassword(pwd);
    setPasswordConfirm(pwd);
    setUseAuto(false);
  };

  const handleSubmit = async () => {
    if (!useAuto) {
      if (!password.trim()) {
        onError('Enter a password or use auto-generate');
        return;
      }
      if (password.length < 6) {
        onError('Password must be at least 6 characters');
        return;
      }
      if (password !== passwordConfirm) {
        onError('Passwords do not match');
        return;
      }
    }

    setResetting(true);
    try {
      const res = await resetUserPassword(user.id, {
        password: useAuto ? undefined : password.trim(),
        sendEmail,
      });
      if (res.password) {
        setResult({
          password: res.password,
          username: res.username,
          emailSent: res.emailSent,
        });
        onSuccess(
          res.emailSent
            ? `Password updated and emailed to ${res.email}`
            : `Password updated for ${user.first_name} ${user.last_name}`
        );
      } else {
        onSuccess(res.message || 'Password updated');
        onClose();
      }
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const copyPassword = async () => {
    if (!result?.password) return;
    try {
      await navigator.clipboard.writeText(result.password);
      onSuccess('Password copied to clipboard');
    } catch {
      onError('Could not copy — select and copy manually');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between bg-gradient-to-r from-gray-600 to-gray-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="rounded-md bg-white/20 p-1.5">
              <Key className="h-4 w-4 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-white">
              {result ? 'Password updated' : 'Reset password'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-500 to-gray-600">
                <span className="text-sm font-semibold text-white">
                  {user.first_name?.charAt(0)}
                  {user.last_name?.charAt(0)}
                </span>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {user.first_name} {user.last_name}
                </div>
                <div className="text-xs text-slate-600">{user.email}</div>
                {user.username && (
                  <div className="text-xs text-slate-500">Username: {user.username}</div>
                )}
              </div>
            </div>
          </div>

          {result ? (
            <>
              <p className="mb-3 text-sm text-slate-700">
                Give this password to the user. They should change it after logging in.
                {result.emailSent && ' A copy was also sent by email.'}
              </p>
              <div className="mb-4 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
                <p className="mb-1 text-xs font-medium text-emerald-800">New password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-lg font-bold tracking-wide text-emerald-900">
                    {result.password}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="shrink-0 rounded-md bg-emerald-600 p-2 text-white hover:bg-emerald-700"
                    title="Copy password"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {result.username && (
                  <p className="mt-2 text-xs text-emerald-800">
                    Login username: <strong>{result.username}</strong>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-md bg-gradient-to-r from-gray-600 to-gray-700 px-3 py-2 font-medium text-white"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <p className="mb-4 text-sm text-slate-600">
                Set a password manually and share it with the user, or let the system generate one.
              </p>

              <label className="mb-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAuto}
                  onChange={(e) => {
                    setUseAuto(e.target.checked);
                    if (e.target.checked) {
                      setPassword('');
                      setPasswordConfirm('');
                    }
                  }}
                  className="rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Auto-generate password (6 characters)</span>
              </label>

              {!useAuto && (
                <div className="mb-4 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">New password</label>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-500"
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Confirm password</label>
                    <input
                      type="text"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-500"
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={generateLocalPassword}
                    className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Generate random password
                  </button>
                </div>
              )}

              <label className="mb-4 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <span className="text-sm text-slate-600">
                  Also email the new password to the user (optional)
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={resetting}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={resetting}
                  className="flex-1 rounded-md bg-gradient-to-r from-gray-600 to-gray-700 px-3 py-2 font-medium text-white hover:from-gray-700 hover:to-gray-800 disabled:opacity-50"
                >
                  {resetting ? 'Saving…' : useAuto ? 'Generate & save' : 'Set password'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
