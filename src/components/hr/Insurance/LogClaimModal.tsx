import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import { formatGhs } from '@/lib/taxCalculations';
import { insuranceApi, type InsuranceCategory } from '@/api/insurance';

export function LogClaimModal({
  open,
  onOpenChange,
  employeeId,
  categories,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  categories: InsuranceCategory[];
  onLogged: () => void;
}) {
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [claimType, setClaimType] = useState<'outpatient' | 'inpatient'>('outpatient');
  const [amount, setAmount] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [claimDate, setClaimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmExceeds, setConfirmExceeds] = useState<{ remaining: number; categoryName: string } | null>(null);

  useEffect(() => {
    if (open) {
      setCategoryId(categories[0]?.id ?? '');
      setClaimType('outpatient');
      setAmount('');
      setHospitalName('');
      setClaimDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setConfirmExceeds(null);
    }
  }, [open, categories]);

  const submit = async (force = false) => {
    if (!categoryId || !amount || Number(amount) <= 0) {
      toast.error('Select a category and enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      await insuranceApi.logClaim(employeeId, {
        categoryId: Number(categoryId),
        claimType,
        amount: Number(amount),
        hospitalName: hospitalName || undefined,
        claimDate,
        notes: notes || undefined,
        force,
      });
      toast.success('Claim logged');
      onLogged();
      onOpenChange(false);
    } catch (e: any) {
      if (e?.exceeds) {
        setConfirmExceeds({ remaining: e.remaining, categoryName: e.categoryName });
      } else {
        toast.error(e?.message || 'Failed to log claim');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log a Medical Claim</DialogTitle>
        </DialogHeader>

        {confirmExceeds ? (
          <div className="space-y-4">
            <div className="rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] p-3 text-sm text-[var(--danger-text)]">
              This claim exceeds the remaining balance for <strong>{confirmExceeds.categoryName}</strong>.
              <br />
              Remaining: <strong>{formatGhs(confirmExceeds.remaining)}</strong> · Claim amount:{' '}
              <strong>{formatGhs(Number(amount) || 0)}</strong>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmExceeds(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => submit(true)}>
                {saving ? 'Logging…' : 'Log anyway'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Category" required>
              <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" required>
                <select className={inputClass} value={claimType} onChange={(e) => setClaimType(e.target.value as any)}>
                  <option value="outpatient">Outpatient</option>
                  <option value="inpatient">Inpatient</option>
                </select>
              </Field>
              <Field label="Amount (GHS)" required>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>
            <Field label="Hospital / Provider" optional>
              <input
                className={inputClass}
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="e.g. Nyaho Medical Centre"
              />
            </Field>
            <Field label="Claim date" required>
              <input type="date" className={inputClass} value={claimDate} onChange={(e) => setClaimDate(e.target.value)} />
            </Field>
            <Field label="Notes" optional>
              <textarea
                className={`${inputClass} h-auto min-h-[72px] py-2`}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={() => submit(false)}>
                {saving ? 'Logging…' : 'Log Claim'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
