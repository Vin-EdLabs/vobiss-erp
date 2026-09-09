import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass, EmptyState } from '@/pages/hr/components';
import { StatusPill } from '@/components/ui/status-pill';
import { leaveApi, LEAVE_QUERY, type LeaveCategory } from '@/api/leave';

export function LeaveCategoryConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['leave', 'all-categories'], queryFn: leaveApi.categories, ...LEAVE_QUERY });
  const categories = data?.categories || [];

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [maxDays, setMaxDays] = useState('');
  const [maxRequests, setMaxRequests] = useState('');
  const [toggleTarget, setToggleTarget] = useState<LeaveCategory | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leave', 'all-categories'] });
    qc.invalidateQueries({ queryKey: ['leave', 'categories'] });
  };

  const createMut = useMutation({
    mutationFn: () => leaveApi.createCategory({ name, maxDaysPerYear: Number(maxDays) || 0, maxRequestsPerYear: Number(maxRequests) || 0 }),
    onSuccess: () => {
      toast.success('Category added');
      setAddOpen(false);
      setName('');
      setMaxDays('');
      setMaxRequests('');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to add category'),
  });

  const updateMut = useMutation({
    mutationFn: (payload: { id: number; maxDaysPerYear?: number; maxRequestsPerYear?: number; isActive?: boolean }) =>
      leaveApi.updateCategory(payload.id, payload),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message || 'Failed to update category'),
  });

  const [edits, setEdits] = useState<Record<number, { days: string; requests: string }>>({});

  const editValue = (cat: LeaveCategory) => edits[cat.id] || { days: String(cat.max_days_per_year), requests: String(cat.max_requests_per_year) };

  const saveEdit = (cat: LeaveCategory) => {
    const v = editValue(cat);
    updateMut.mutate(
      { id: cat.id, maxDaysPerYear: Number(v.days) || 0, maxRequestsPerYear: Number(v.requests) || 0 },
      { onSuccess: () => toast.success(`${cat.name} updated`) }
    );
  };

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Leave Categories</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Set how many days per year and how many separate requests per year each category allows.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-[var(--radius)] bg-[var(--surface-secondary)]" />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Add one to get started." />
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => {
            const v = editValue(cat);
            return (
              <div key={cat.id} className="grid grid-cols-1 items-end gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 sm:grid-cols-[1.5fr,1fr,1fr,auto,auto]">
                <div>
                  <p className="mb-1.5 text-sm font-medium text-[var(--text-primary)]">{cat.name}</p>
                  {!cat.is_active && <StatusPill tone="danger">Inactive</StatusPill>}
                </div>
                <Field label="Max Days / Year">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={v.days}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [cat.id]: { days: e.target.value, requests: v.requests } }))}
                  />
                </Field>
                <Field label="Max Requests / Year">
                  <input
                    type="number"
                    min="0"
                    className={inputClass}
                    value={v.requests}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [cat.id]: { days: v.days, requests: e.target.value } }))}
                  />
                </Field>
                <Button size="sm" variant="outline" className="h-10" disabled={updateMut.isPending} onClick={() => saveEdit(cat)}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-10 ${cat.is_active ? 'border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]' : ''}`}
                  onClick={() => setToggleTarget(cat)}
                >
                  {cat.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Leave Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Name" required>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Compassionate" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Max Days / Year" required>
                <input type="number" min="0" className={inputClass} value={maxDays} onChange={(e) => setMaxDays(e.target.value)} />
              </Field>
              <Field label="Max Requests / Year" required>
                <input type="number" min="0" className={inputClass} value={maxRequests} onChange={(e) => setMaxRequests(e.target.value)} />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? 'Saving…' : 'Add Category'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'} "{toggleTarget?.name}"?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            {toggleTarget?.is_active
              ? 'Staff will no longer be able to submit new requests under this category. Existing requests and history are unaffected.'
              : 'Staff will be able to submit new requests under this category again.'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Cancel</Button>
            <Button
              className={toggleTarget?.is_active ? 'bg-[var(--accent-red)] text-white hover:opacity-90' : ''}
              onClick={() => {
                if (!toggleTarget) return;
                updateMut.mutate(
                  { id: toggleTarget.id, isActive: !toggleTarget.is_active },
                  {
                    onSuccess: () => {
                      toast.success(`${toggleTarget.name} ${toggleTarget.is_active ? 'deactivated' : 'reactivated'}`);
                      setToggleTarget(null);
                    },
                  }
                );
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
