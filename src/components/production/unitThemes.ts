import type { LucideIcon } from 'lucide-react';
import { Network, Radio, Server, FolderKanban, Users2 } from 'lucide-react';

export type UnitSlug = 'project' | 'ts' | 'ip' | 'noc' | string;

export type UnitTheme = {
  label: string;
  subtitle: string;
  pageGradient: string;
  heroGradient: string;
  accentBar: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;
  iconBg: string;
  buttonClass: string;
  ringFocus: string;
  statAccent: string;
  Icon: LucideIcon;
};

/** Shared Service Request look — follows app theme (brown in light, green in dark). */
const NOC_LOOK = {
  pageGradient: '',
  heroGradient: '',
  accentBar: 'from-[var(--primary)] to-[var(--primary-hover)]',
  accentText: 'text-[var(--primary)]',
  accentBg: 'bg-[var(--accent-green-light)]',
  accentBorder: 'border-[var(--border)]',
  iconBg: 'bg-[var(--accent-green-light)]',
  buttonClass:
    'bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] shadow-[var(--shadow-md)] font-semibold',
  ringFocus: 'focus:ring-[var(--accent-green-light)] focus:border-[var(--primary)]',
  statAccent: 'primary',
};

export const UNIT_THEMES: Record<string, UnitTheme> = {
  project: {
    label: 'Project Unit',
    subtitle: 'Review integrations and close the service request lifecycle.',
    ...NOC_LOOK,
    Icon: FolderKanban,
  },
  ts: {
    label: 'TX — Transmission',
    subtitle: 'Accept or reject new service requests at the transmission stage.',
    ...NOC_LOOK,
    Icon: Radio,
  },
  ip: {
    label: 'IP — Integration',
    subtitle: 'Complete integration details and forward to Project Unit & NOC.',
    ...NOC_LOOK,
    Icon: Network,
  },
  noc: {
    label: 'NOC — Network Operations',
    subtitle: 'Review IP integration submissions before Project Unit sign-off.',
    ...NOC_LOOK,
    Icon: Server,
  },
  sales: {
    label: 'Sales Unit',
    subtitle: 'Send feasibility requests to Design and track every one of them end to end.',
    ...NOC_LOOK,
    Icon: Users2,
  },
};

export function getUnitTheme(slug?: string): UnitTheme {
  const key = slug === 'tx' ? 'ts' : slug || 'project';
  return UNIT_THEMES[key] || UNIT_THEMES.project;
}
