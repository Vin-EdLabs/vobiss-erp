import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contrastText, type TicketTag } from '@/lib/ticketTags';

export function TicketTagBadge({
  tag,
  onRemove,
  className,
  compact,
}: {
  tag: Pick<TicketTag, 'name' | 'color'> & { id?: number };
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const bg = tag.color || '#1A56DB';
  const fg = contrastText(bg);
  return (
    <span
      className={cn(
        'inline-flex max-w-[10rem] items-center gap-1 rounded-full font-semibold shadow-sm',
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={tag.name}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full p-0.5 opacity-80 hover:bg-black/15 hover:opacity-100"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function TicketTagBadgesRow({
  tags,
  max = 3,
  onRemove,
  compact,
}: {
  tags?: TicketTag[];
  max?: number;
  onRemove?: (tag: TicketTag) => void;
  compact?: boolean;
}) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return null;
  const shown = list.slice(0, max);
  const extra = list.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((t) => (
        <TicketTagBadge
          key={t.id}
          tag={t}
          compact={compact}
          onRemove={onRemove ? () => onRemove(t) : undefined}
        />
      ))}
      {extra > 0 && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          +{extra} more
        </span>
      )}
    </div>
  );
}
