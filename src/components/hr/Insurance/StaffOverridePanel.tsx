import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, EmptyState, Field, inputClass } from '@/pages/hr/components';
import { StatusPill } from '@/components/ui/status-pill';
import { formatGhs } from '@/lib/taxCalculations';
import { hrApi, HR_QUERY } from '@/api/hr';
import { insuranceApi, INSURANCE_QUERY, type InsuranceCategory } from '@/api/insurance';

function OverrideModal({
  open,
  onOpenChange,
  employeeId,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  category: InsuranceCategory | null;
  onSaved: () => void;
}) {
  const [outpatientLimit, setOutpatientLimit] = useState('');
  const [inpatientLimit, setInpatientLimit] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (open && category) {
      setOutpatientLimit(String(category.outpatient.limit));
      setInpatientLimit(String(category.inpatient.limit));
      setReason(category.overrideReason || '');
    }
  }, [open, category]);

  if (!category) return null;

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('A reason is required for a custom limit');
      return;
    }
    setSaving(true);
    try {
      await insuranceApi.setOverride(employeeId, {
        categoryId: category.id,
        outpatientLimit: Number(outpatientLimit) || 0,
        inpatientLimit: Number(inpatientLimit) || 0,
        reason: reason.trim(),
      });
      toast.success(`Custom limit set for ${category.name}`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save custom limit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom Limit — {category.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            This overrides the base plan limit for this person only. Everyone else keeps the standard amount.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Outpatient Limit (GHS)" required>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={outpatientLimit}
                onChange={(e) => setOutpatientLimit(e.target.value)}
              />
            </Field>
            <Field label="Inpatient Limit (GHS)" required>
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={inpatientLimit}
                onChange={(e) => setInpatientLimit(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Reason" required hint="Why is this person's limit different?">
            <textarea
              className={`${inputClass} h-auto min-h-[72px] py-2`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved by management for extended dental coverage"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={submit}>
              {saving ? 'Saving…' : 'Save Custom Limit'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StaffOverridePanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState('');
  const [editCategory, setEditCategory] = useState<InsuranceCategory | null>(null);

  const searchQ = useQuery({
    queryKey: ['hr', 'employees', 'insurance-override-search', search],
    queryFn: () => hrApi.employees({ q: search }),
    enabled: search.trim().length > 1,
    ...HR_QUERY,
  });
  const results = Array.isArray(searchQ.data) ? searchQ.data : searchQ.data?.employees || [];

  const profileQ = useQuery({
    queryKey: ['insurance', 'staff', selectedId],
    queryFn: () => insuranceApi.getStaffProfile(selectedId as string),
    enabled: !!selectedId,
    ...INSURANCE_QUERY,
  });

  const refresh = () => {
    if (selectedId) qc.invalidateQueries({ queryKey: ['insurance', 'staff', selectedId] });
  };

  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Individual Staff Overrides</h3>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
        Search for one person and give them a different limit for a category — only they get it, everyone else stays
        on the standard plan.
      </p>

      <div className="relative mt-4">
        <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
          <Search className="h-4 w-4" />
          Search staff by name
        </label>
        <input
          className={inputClass}
          placeholder="Search by name, email or position…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (selectedId) {
              setSelectedId(null);
              setSelectedName('');
            }
          }}
        />
        {search.trim().length > 1 && !selectedId && (
          <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
            {results.length === 0 ? (
              <p className="p-3 text-sm text-[var(--text-muted)]">No staff found.</p>
            ) : (
              results.slice(0, 12).map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  className="flex w-full items-center gap-3 border-b border-[var(--border)] p-2.5 text-left last:border-b-0 hover:bg-[var(--surface-secondary)]"
                  onClick={() => {
                    setSelectedId(String(e.id));
                    setSelectedName(e.full_name);
                    setSearch('');
                  }}
                >
                  <Avatar name={e.full_name} src={e.photo_url} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{e.full_name}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{e.position || e.department || '—'}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {selectedId && (
        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Avatar name={selectedName} size="sm" />
              {selectedName}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedId(null);
                setSelectedName('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {profileQ.isLoading ? (
            <div className="h-24 animate-pulse rounded-[var(--radius)] bg-[var(--surface-secondary)]" />
          ) : !profileQ.data ? (
            <EmptyState title="No active policy for this person yet" description="They'll be provisioned automatically the first time they're viewed or given a claim." />
          ) : (
            <div className="space-y-2">
              {profileQ.data.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      {cat.name}
                      {cat.isOverride && <StatusPill tone="role">Custom Limit</StatusPill>}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      Outpatient {formatGhs(cat.outpatient.limit)} · Inpatient {formatGhs(cat.inpatient.limit)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setEditCategory(cat)}>
                    {cat.isOverride ? 'Edit Custom Limit' : 'Set Custom Limit'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedId && (
        <OverrideModal
          open={!!editCategory}
          onOpenChange={(open) => !open && setEditCategory(null)}
          employeeId={selectedId}
          category={editCategory}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
