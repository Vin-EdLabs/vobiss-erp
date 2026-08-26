import React, { useMemo, useState } from 'react';
import { Check, Plus, Search, Tag } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TicketTagBadge } from '@/components/tickets/TicketTagBadge';
import type { TicketTag } from '@/lib/ticketTags';
import { cn } from '@/lib/utils';

export function TicketTagPicker({
  allTags,
  selectedIds,
  onToggle,
  triggerLabel = 'Add tag',
  className,
}: {
  allTags: TicketTag[];
  selectedIds: number[];
  onToggle: (tag: TicketTag) => void;
  triggerLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = useMemo(() => new Set(selectedIds.map(Number)), [selectedIds]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(needle));
  }, [allTags, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn('gap-1.5', className)}>
          <Plus className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-[var(--border)] p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search tags…"
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">No tags found</p>
          ) : (
            filtered.map((tag) => {
              const on = selected.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onToggle(tag)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-50',
                    on && 'bg-slate-50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TicketTagBadge tag={tag} compact />
                  </span>
                  {on ? <Check className="h-4 w-4 text-emerald-600" /> : <Tag className="h-3.5 w-3.5 text-slate-300" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
