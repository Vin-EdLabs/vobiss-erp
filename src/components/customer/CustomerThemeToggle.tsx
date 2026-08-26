import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, readStoredTheme, type AppTheme } from '@/lib/theme';

/** Portal theme toggle — persists to the same key as staff so preference is shared. */
export function CustomerThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<AppTheme>).detail;
      if (detail === 'dark' || detail === 'light') setTheme(detail);
    };
    window.addEventListener('vobiss-theme-change', onChange);
    return () => window.removeEventListener('vobiss-theme-change', onChange);
  }, []);

  const toggle = () => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm transition hover:bg-[var(--surface-hover)] ${className}`}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function useCustomerPortalTheme() {
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, []);
}
