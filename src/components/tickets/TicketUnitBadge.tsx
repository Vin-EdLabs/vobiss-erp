import React from 'react';
import { ticketUnitLabel } from '@/lib/ticketUnits';

const UNIT_COLORS: Record<string, string> = {
  noc: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  ip: 'bg-sky-50 text-sky-700 border-sky-200',
  ts: 'bg-amber-50 text-amber-700 border-amber-200',
  cx: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
const FALLBACK_COLOR = 'bg-slate-100 text-slate-600 border-slate-200';

export function TicketUnitBadge({
  escalationStage,
  className = '',
}: {
  escalationStage?: string | null;
  className?: string;
}) {
  const label = ticketUnitLabel(escalationStage);
  const color = (escalationStage && UNIT_COLORS[escalationStage]) || FALLBACK_COLOR;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${color} ${className}`}
    >
      With {label}
    </span>
  );
}

export default TicketUnitBadge;
