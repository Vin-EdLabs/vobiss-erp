import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cxApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TicketTagBadge } from '@/components/tickets/TicketTagBadge';
import { TICKET_TAG_COLORS, type TicketTag } from '@/lib/ticketTags';
import { cn } from '@/lib/utils';

const TagManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const [tags, setTags] = useState<TicketTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TICKET_TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(TICKET_TAG_COLORS[0]);
  const [deleteTarget, setDeleteTarget] = useState<TicketTag | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await cxApi.getTags();
      setTags(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!name.trim()) {
      toast.error('Enter a tag name');
      return;
    }
    setSaving(true);
    try {
      await cxApi.createTag({ name: name.trim(), color });
      setName('');
      setColor(TICKET_TAG_COLORS[0]);
      toast.success('Tag created');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (editId == null || !editName.trim()) return;
    setSaving(true);
    try {
      await cxApi.updateTag(editId, { name: editName.trim(), color: editColor });
      setEditId(null);
      toast.success('Tag updated');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await cxApi.deleteTag(deleteTarget.id);
      toast.success('Tag deleted');
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-[#f5ebe0]/40/40 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/staff/cx/tickets')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <Tag className="h-5 w-5 text-[var(--primary)]" />
              Ticket tags
            </h1>
            <p className="text-sm text-slate-500">Create colored labels for filtering and organizing tickets.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">New tag</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Outage" maxLength={50} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {TICKET_TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      'h-7 w-7 rounded-full ring-offset-2 transition',
                      color === c ? 'ring-2 ring-slate-900' : 'ring-1 ring-black/10'
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <Button type="button" onClick={create} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" />
              Create
            </Button>
          </div>
          {name.trim() && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              Preview: <TicketTagBadge tag={{ name: name.trim(), color }} />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
            All tags {loading ? '' : `(${tags.length})`}
          </div>
          {loading ? (
            <p className="p-6 text-sm text-slate-500">Loading…</p>
          ) : tags.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No tags yet. Create your first label above.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tags.map((tag) => (
                <li key={tag.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  {editId === tag.id ? (
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="max-w-xs" />
                      <div className="flex flex-wrap gap-1">
                        {TICKET_TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={cn(
                              'h-6 w-6 rounded-full',
                              editColor === c ? 'ring-2 ring-slate-900' : 'ring-1 ring-black/10'
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={saveEdit} disabled={saving}>
                          Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <TicketTagBadge tag={tag} />
                        <span className="text-xs text-slate-500">
                          Used on <strong>{tag.usage_count ?? 0}</strong> ticket{(tag.usage_count ?? 0) === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditId(tag.id);
                            setEditName(tag.name);
                            setEditColor(tag.color || TICKET_TAG_COLORS[0]);
                          }}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setDeleteTarget(tag)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5 text-red-600" />
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget?.name}</strong> from all tickets. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TagManagerPage;
