// src/components/customer/CustomerHeader.tsx
import React from 'react';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CustomerThemeToggle } from './CustomerThemeToggle';

interface CustomerHeaderProps {
  name: string;
  customer_code: string;
  heightClass?: string;
}

const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  name,
  customer_code,
  heightClass = 'py-4 md:py-5',
}) => {
  const navigate = useNavigate();
  const firstName = name.split(' ')[0] || name;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 md:left-64">
      <div className="absolute inset-0 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-lg" />

      <div className={`relative px-5 md:px-8 ${heightClass}`}>
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] md:text-2xl">
              Welcome, <span className="text-[var(--primary)]">{firstName}</span>
            </h1>
            <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)] md:text-sm">
              Client support portal
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <CustomerThemeToggle />
            <button
              type="button"
              onClick={() => navigate('/customer/profile')}
              className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2 transition hover:bg-[var(--surface-hover)] sm:px-4 sm:py-2.5"
            >
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-[var(--text-muted)]">Client ID</p>
                <p className="font-mono text-sm font-bold text-[var(--primary)]">{customer_code}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-sm">
                <User className="h-5 w-5" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default CustomerHeader;
