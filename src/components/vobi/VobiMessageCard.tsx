import { Link } from 'react-router-dom';
import type { VobiItem } from '@/api/vobi';
import { cn } from '@/lib/utils';

const BADGE_STYLE: Record<string, string> = {
  MAT: 'bg-[#1D9E75]/15 text-[#0f7b59]',
  APR: 'bg-[#1D9E75]/15 text-[#0f7b59]',
  CSH: 'bg-amber-100 text-amber-700',
  TKT: 'bg-blue-100 text-blue-700',
  PRJ: 'bg-purple-100 text-purple-700',
  CHT: 'bg-cyan-100 text-cyan-700',
  ALT: 'bg-slate-100 text-slate-600',
};

export function VobiMessageCard({
  item,
  onNavigate,
}: {
  item: VobiItem;
  onNavigate?: () => void;
}) {
  const badge = item.badge || item.recordType || 'ALT';

  return (
    <Link
      to={item.link || '/workspace'}
      onClick={onNavigate}
      className={cn(
        'mt-2 flex items-center gap-2 rounded-[10px] border border-black/10 bg-white px-[11px] py-[9px]',
        'text-left transition-colors hover:border-[#1D9E75]/40 hover:bg-[#f7fffb]'
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide',
          BADGE_STYLE[badge] || BADGE_STYLE.ALT
        )}
      >
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium text-slate-900">
          {item.title}
        </span>
        {item.subtitle && (
          <span className="block truncate text-[11px] text-slate-500">
            {item.subtitle}
          </span>
        )}
      </span>
      <span className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700">
        {item.actionLabel || (item.kind === 'approval' ? 'Review' : 'Open')}
      </span>
    </Link>
  );
}
