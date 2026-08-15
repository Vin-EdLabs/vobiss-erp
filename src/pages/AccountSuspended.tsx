import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';

const AccountSuspended = () => {
  const { user, logout } = useAuth();
  const name = user?.full_name || user?.first_name || user?.username || 'there';
  const reason = String(user?.suspension_reason || '').trim();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--page-bg)] px-4 py-12">
      <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]">
        <img src="/vobiss-logo.png" alt="Vobiss" className="mb-6 h-12 w-auto object-contain" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger-text)]">Account suspended</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Hello {name}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Your Vobiss access is paused. You can sign in to see this notice and sign out. All other pages stay locked until HR restores your account.
        </p>
        <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--accent-red-light)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--danger-text)]">Reason</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
            {reason || 'HR has not added a reason yet. Please contact HR for details.'}
          </p>
        </div>
        <Button className="mt-6 w-full" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </div>
  );
};

export default AccountSuspended;
