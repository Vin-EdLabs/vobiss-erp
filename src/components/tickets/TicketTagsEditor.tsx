import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cxApi } from '@/api';
import { TicketTagBadge } from '@/components/tickets/TicketTagBadge';
import { TicketTagPicker } from '@/components/tickets/TicketTagPicker';
import type { TicketTag } from '@/lib/ticketTags';

/** Editable tags block for staff ticket detail pages. */
export function TicketTagsEditor({
  ticketId,
  initialTags = [],
  onChange,
  onMutated,
}: {
  ticketId: string;
  initialTags?: TicketTag[];
  onChange?: (tags: TicketTag[]) => void;
  onMutated?: () => void;
}) {
  const [tags, setTags] = useState<TicketTag[]>(initialTags);
  const [allTags, setAllTags] = useState<TicketTag[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTags(initialTags || []);
  }, [initialTags]);

  useEffect(() => {
    cxApi
      .getTags()
      .then((res) => setAllTags(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []))
      .catch(() => {});
  }, []);

  const sync = (next: TicketTag[]) => {
    setTags(next);
    onChange?.(next);
    onMutated?.();
  };

  const add = async (tag: TicketTag) => {
    if (tags.some((t) => t.id === tag.id) || busy) return;
    setBusy(true);
    try {
      const res = await cxApi.addTicketTags(ticketId, [tag.id]);
      sync(Array.isArray(res?.data) ? res.data : [...tags, tag]);
      toast.success(`Tagged: ${tag.name}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add tag');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: TicketTag) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await cxApi.removeTicketTag(ticketId, tag.id);
      sync(Array.isArray(res?.data) ? res.data : tags.filter((t) => t.id !== tag.id));
      toast.success(`Removed: ${tag.name}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to remove tag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <TicketTagBadge key={t.id} tag={t} onRemove={() => remove(t)} />
      ))}
      <TicketTagPicker
        allTags={allTags}
        selectedIds={tags.map((t) => t.id)}
        onToggle={(tag) => {
          if (tags.some((t) => t.id === tag.id)) remove(tag);
          else add(tag);
        }}
      />
    </div>
  );
}
