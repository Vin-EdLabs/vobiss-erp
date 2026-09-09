import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass, EmptyState } from '@/pages/hr/components';
import { formatGhs } from '@/lib/taxCalculations';
import { insuranceApi, INSURANCE_QUERY, type InsuranceCategoryInput } from '@/api/insurance';
import { StaffOverridePanel } from './StaffOverridePanel';

function todayPlusYear() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

type EditableCategory = InsuranceCategoryInput & { key: string };

export function PolicyConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['insurance', 'policy'],
    queryFn: () => insuranceApi.getPolicy(),
    ...INSURANCE_QUERY,
  });
  const resetsQ = useQuery({
    queryKey: ['insurance', 'resets'],
    queryFn: () => insuranceApi.resetHistory(),
    ...INSURANCE_QUERY,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(todayPlusYear());
  const [categories, setCategories] = useState<EditableCategory[]>([]);
  const [resetOpen, setResetOpen] = useState(false);
  const [removeKey, setRemoveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.template) return;
    setName(data.template.name || '');
    setDescription(data.template.description || '');
    setStartDate(String(data.template.policy_start_date || '').slice(0, 10));
    setEndDate(String(data.template.policy_end_date || '').slice(0, 10));
    setCategories(
      (data.categories || []).map((c: any) => ({
        key: `db-${c.id}`,
        id: c.id,
        name: c.name,
        outpatientLimit: Number(c.outpatient_limit),
        inpatientLimit: Number(c.inpatient_limit),
      }))
    );
  }, [data]);

  const addCategory = () => {
    setCategories((prev) => [
      ...prev,
      { key: `new-${Date.now()}`, name: '', outpatientLimit: 0, inpatientLimit: 0 },
    ]);
  };

  const updateCategory = (key: string, patch: Partial<EditableCategory>) => {
    setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const removeCategory = (key: string) => {
    setCategories((prev) => prev.filter((c) => c.key !== key));
    setRemoveKey(null);
  };

  const categoryPendingRemoval = categories.find((c) => c.key === removeKey);

  const saveMut = useMutation({
    mutationFn: () =>
      insuranceApi.saveTemplate({
        name,
        description,
        policyStartDate: startDate,
        policyEndDate: endDate,
        categories: categories
          .filter((c) => c.name.trim())
          .map((c) => ({ id: c.id, name: c.name.trim(), outpatientLimit: c.outpatientLimit, inpatientLimit: c.inpatientLimit })),
      }),
    onSuccess: () => {
      toast.success('Policy saved');
      qc.invalidateQueries({ queryKey: ['insurance', 'policy'] });
      qc.invalidateQueries({ queryKey: ['insurance', 'overview'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save policy'),
  });

  const resetMut = useMutation({
    mutationFn: () => insuranceApi.resetPolicy(),
    onSuccess: (result: any) => {
      toast.success(`Policy reset for ${result?.staffCount ?? 0} staff member(s)`);
      setResetOpen(false);
      qc.invalidateQueries({ queryKey: ['insurance', 'policy'] });
      qc.invalidateQueries({ queryKey: ['insurance', 'resets'] });
      qc.invalidateQueries({ queryKey: ['insurance', 'overview'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to reset policy'),
  });

  const hasTemplate = !!data?.template;
  const resets = resetsQ.data?.resets || [];

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-[var(--card-radius)] bg-[var(--surface-secondary)]" />;
  }

  return (
    <div className="space-y-5">
      <StaffOverridePanel />

      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Company Policy Template</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              One base template applies to every staff member automatically.
            </p>
          </div>
          {hasTemplate && (
            <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Manual Reset
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Policy Name" required>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vobiss Medical Cover" />
          </Field>
          <Field label="Description" optional>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Policy Start Date" required>
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Policy End Date" required>
            <input type="date" className={inputClass} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">Categories</h4>
            <Button size="sm" variant="outline" onClick={addCategory}>
              <Plus className="mr-1 h-4 w-4" />
              Add Category
            </Button>
          </div>
          {categories.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-[var(--border)] p-4 text-center text-sm text-[var(--text-muted)]">
              No categories yet — add one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.key} className="grid grid-cols-1 gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 sm:grid-cols-[2fr,1fr,1fr,auto] sm:items-end">
                  <Field label="Name">
                    <input
                      className={inputClass}
                      value={c.name}
                      onChange={(e) => updateCategory(c.key, { name: e.target.value })}
                      placeholder="e.g. Dental"
                    />
                  </Field>
                  <Field label="Outpatient Limit (GHS)">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={c.outpatientLimit}
                      onChange={(e) => updateCategory(c.key, { outpatientLimit: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Inpatient Limit (GHS)">
                    <input
                      type="number"
                      min="0"
                      className={inputClass}
                      value={c.inpatientLimit}
                      onChange={(e) => updateCategory(c.key, { inpatientLimit: Number(e.target.value) })}
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]"
                    onClick={() => setRemoveKey(c.key)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button disabled={!name.trim() || !startDate || !endDate || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? 'Saving…' : 'Save Policy'}
          </Button>
        </div>
      </div>

      <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-md)]">
        <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Reset History</h3>
        {resets.length === 0 ? (
          <EmptyState title="No resets yet" description="Annual resets — automatic or manual — will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="vobiss-table w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Staff</th>
                  <th className="px-3 py-2">Reset Date</th>
                  <th className="px-3 py-2">New Period</th>
                  <th className="px-3 py-2">Reset By</th>
                </tr>
              </thead>
              <tbody>
                {resets.map((r: any) => (
                  <tr key={r.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2">{r.full_name}</td>
                    <td className="px-3 py-2">{formatDate(r.reset_date)}</td>
                    <td className="px-3 py-2">
                      {formatDate(r.policy_period_start)} — {formatDate(r.policy_period_end)}
                    </td>
                    <td className="px-3 py-2">{r.reset_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!removeKey} onOpenChange={(open) => !open && setRemoveKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove "{categoryPendingRemoval?.name || 'this category'}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            This removes the category from the active plan — staff can no longer log claims or transfers against it,
            and it won't count toward limit totals going forward. Every claim and transfer already logged against it
            stays visible in history and is never deleted. This takes effect once you save the policy.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveKey(null)}>
              Cancel
            </Button>
            <Button
              className="bg-[var(--accent-red)] text-white hover:opacity-90"
              onClick={() => removeKey && removeCategory(removeKey)}
            >
              Remove Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Policy Period</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)]">
            This moves every staff member's policy period forward by one year (default), clears their used balances
            for the new period, and notifies them. Category configurations and overrides are unaffected, and no
            historical claims are deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button disabled={resetMut.isPending} onClick={() => resetMut.mutate()}>
              {resetMut.isPending ? 'Resetting…' : 'Confirm Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
