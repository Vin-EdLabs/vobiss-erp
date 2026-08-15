import type { LucideIcon } from 'lucide-react';
import { Network, Radio, Server, FolderKanban } from 'lucide-react';

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

/** Shared Service Request look — same as the NOC card. */
const NOC_LOOK = {
  pageGradient: '',
  heroGradient: 'from-slate-800 via-slate-900 to-amber-950',
  accentBar: 'from-amber-400 via-orange-500 to-amber-600',
  accentText: 'text-amber-800 dark:text-amber-300',
  accentBg: 'bg-amber-50 dark:bg-amber-500/15',
  accentBorder: 'border-amber-200/80 dark:border-amber-500/30',
  iconBg: 'bg-amber-500/20',
  buttonClass: 'bg-amber-500 text-slate-900 hover:bg-amber-400 shadow-lg shadow-amber-950/30 font-semibold',
  ringFocus: 'focus:ring-amber-500/30 focus:border-amber-400',
  statAccent: 'amber',
};

export const UNIT_THEMES: Record<string, UnitTheme> = {
  project: {
    label: 'Project Unit',
    subtitle: 'Review integrations and close the service request lifecycle.',
    ...NOC_LOOK,
    Icon: FolderKanban,
  },
  ts: {
    label: 'TS — Transmission',
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
};

export function getUnitTheme(slug?: string): UnitTheme {
  return UNIT_THEMES[slug || 'project'] || UNIT_THEMES.project;
}
