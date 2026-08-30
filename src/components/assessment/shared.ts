export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${rem}m`;
}

export function formatWorkflowType(t: string | null | undefined): string {
  if (!t) return '—';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SCORE_LABELS = ['Excellent', 'Good', 'Fair', 'Needs improvement', 'Insufficient data'] as const;

export function scoreTone(label: string | null | undefined): { text: string; bg: string; dot: string; ring: string } {
  switch (label) {
    case 'Excellent':
      return { text: 'text-[var(--success-text)]', bg: 'bg-[var(--accent-green-light)]', dot: 'bg-[var(--accent-green)]', ring: 'ring-[var(--accent-green)]' };
    case 'Good':
      return { text: 'text-[var(--info-text)]', bg: 'bg-[var(--accent-blue-light)]', dot: 'bg-[var(--accent-blue)]', ring: 'ring-[var(--accent-blue)]' };
    case 'Fair':
      return { text: 'text-[var(--warning-text)]', bg: 'bg-[var(--accent-amber-light)]', dot: 'bg-[var(--accent-amber)]', ring: 'ring-[var(--accent-amber)]' };
    case 'Needs improvement':
      return { text: 'text-[var(--danger-text)]', bg: 'bg-[var(--accent-red-light)]', dot: 'bg-[var(--accent-red)]', ring: 'ring-[var(--accent-red)]' };
    default:
      return { text: 'text-[var(--text-muted)]', bg: 'bg-[var(--surface-secondary)]', dot: 'bg-[var(--text-muted)]', ring: 'ring-[var(--border)]' };
  }
}

export function vsUnitTone(mineIsBetter: boolean | null): string {
  if (mineIsBetter == null) return 'text-[var(--text-secondary)]';
  return mineIsBetter ? 'text-[var(--success-text)]' : 'text-[var(--danger-text)]';
}
