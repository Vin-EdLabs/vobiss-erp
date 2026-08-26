import React, { useEffect, useMemo, useState } from 'react';
import { Check, Tag, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cxApi } from '@/api';
import { TicketTagBadge } from '@/components/tickets/TicketTagBadge';
import type { TicketTag } from '@/lib/ticketTags';
import { cn } from '@/lib/utils';

export type TagFilterMode = 'all' | 'any';

export function TicketListTagFilter({
  selectedIds,
  mode,
  onSelectedIdsChange,
  onModeChange,
  accentClassName = 'text-[var(--primary)] hover:text-[var(--primary-hover)]',
}: {
  selectedIds: number[];
  mode: TagFilterMode;
  onSelectedIdsChange: (ids: number[]) => void;
  onModeChange: (mode: TagFilterMode) => void;
  accentClassName?: string;
}) {
  const [allTags, setAllTags] = useState<TicketTag[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    cxApi
      .getTags()
      .then((res) => setAllTags(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  const selected = useMemo(() => new Set(selectedIds.map(Number)), [selectedIds]);
  const selectedTags = useMemo(
    () => allTags.filter((t) => selected.has(t.id)),
    [allTags, selected]
  );

  const toggle = (id: number) => {
    if (selected.has(id)) onSelectedIdsChange(selectedIds.filter((x) => x !== id));
    else onSelectedIdsChange([...selectedIds, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-semibold text-slate-500">TAGS</label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8 w-full justify-start gap-2 text-xs">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                {selectedIds.length ? `${selectedIds.length} selected` : 'Filter by tags…'}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-1">
              <div className="max-h-56 overflow-y-auto">
                {allTags.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-slate-500">No tags yet</p>
                ) : (
                  allTags.map((tag) => {
                    const on = selected.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggle(tag.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-slate-50',
                          on && 'bg-slate-50'
                        )}
                      >
                        <TicketTagBadge tag={tag} compact />
                        {on ? <Check className="h-4 w-4 text-emerald-600" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">MATCH</label>
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onModeChange('all')}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-medium',
                mode === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              Match all
            </button>
            <button
              type="button"
              onClick={() => onModeChange('any')}
              className={cn(
                'rounded-md px-2.5 py-1.5 font-medium',
                mode === 'any' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              Match any
            </button>
          </div>
        </div>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedTags.map((tag) => (
            <TicketTagBadge key={tag.id} tag={tag} compact onRemove={() => toggle(tag.id)} />
          ))}
          <button
            type="button"
            onClick={() => onSelectedIdsChange([])}
            className={cn('inline-flex items-center gap-1 text-xs font-medium', accentClassName)}
          >
            <X className="h-3 w-3" />
            Clear tags
          </button>
        </div>
      )}
    </div>
  );
}
