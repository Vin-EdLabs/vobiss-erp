export const THEME_STORAGE_KEY = 'vobiss-theme';

export type AppTheme = 'light' | 'dark';

export function readStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem('theme');
  return stored === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: AppTheme, options?: { persist?: boolean }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    root.classList.add('dark');
  } else {
    root.removeAttribute('data-theme');
    root.classList.remove('dark');
  }
  if (options?.persist !== false) {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  window.dispatchEvent(new CustomEvent('vobiss-theme-change', { detail: theme }));
}

export function cssVar(name: string, fallback = ''): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
