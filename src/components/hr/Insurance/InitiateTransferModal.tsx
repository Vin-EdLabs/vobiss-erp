import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import { formatGhs } from '@/lib/taxCalculations';
import { insuranceApi, type InsuranceCategory } from '@/api/insurance';

export function InitiateTransferModal({
  open,
  onOpenChange,
  employeeId,
  categories,
  onInitiated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  categories: InsuranceCategory[];
  onInitiated: () => void;
}) {
  const [fromCategoryId, setFromCategoryId] = useState<number | ''>('');
  const [toCategoryId, setToCategoryId] = useState<number | ''>('');
  const [transferType, setTransferType] = useState<'outpatient' | 'inpatient'>('outpatient');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [immediate, setImmediate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFromCategoryId(categories[0]?.id ?? '');
      setToCategoryId(categories[1]?.id ?? categories[0]?.id ?? '');
      setTransferType('outpatient');
      setAmount('');
      setReason('');
      setImmediate(false);
    }
  }, [open, categories]);

  const fromCategory = categories.find((c) => c.id === fromCategoryId);
  const remaining = fromCategory ? fromCategory[transferType].remaining : 0;
  const noBalance = !!fromCategory && remaining <= 0;

  const submit = async () => {
    if (!fromCategoryId || !toCategoryId || fromCategoryId === toCategoryId) {
      toast.error('Choose two different categories');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (Number(amount) > remaining) {
      toast.error(`${fromCategory?.name} only has ${formatGhs(remaining)} remaining (${transferType}) — can't transfer more than that`);
      return;
    }
    if (!reason.trim()) {
      toast.error('A reason is required');
      return;
    }
    setSaving(true);
    try {
      await insuranceApi.initiateTransfer(employeeId, {
        fromCategoryId: Number(fromCategoryId),
        toCategoryId: Number(toCategoryId),
        transferType,
        amount: Number(amount),
        reason: reason.trim(),
        immediate,
      });
      toast.success(immediate ? 'Transfer applied immediately' : 'Transfer request sent to staff');
      onInitiated();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to initiate transfer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer Balance Between Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="From category"
              required
              hint={fromCategory ? `${formatGhs(remaining)} remaining (${transferType})` : undefined}
            >
              <select className={inputClass} value={fromCategoryId} onChange={(e) => setFromCategoryId(Number(e.target.value))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To category" required>
              <select className={inputClass} value={toCategoryId} onChange={(e) => setToCategoryId(Number(e.target.value))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <select className={inputClass} value={transferType} onChange={(e) => setTransferType(e.target.value as any)}>
                <option value="outpatient">Outpatient</option>
                <option value="inpatient">Inpatient</option>
              </select>
            </Field>
            <Field label="Amount (GHS)" required>
              <input
                type="number"
                min="0"
                max={remaining || undefined}
                step="0.01"
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={noBalance}
              />
            </Field>
          </div>
          {noBalance && (
            <p className="rounded-[var(--radius)] border border-[var(--accent-red)] bg-[var(--accent-red-light)] px-3 py-2 text-xs font-medium text-[var(--danger-text)]">
              {fromCategory?.name} has no {transferType} balance left to transfer.
            </p>
          )}
          <Field label="Reason" required>
            <textarea
              className={`${inputClass} h-auto min-h-[72px] py-2`}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Staff has unused Dental balance, needs it for an Eye claim"
            />
          </Field>
          <label className="flex items-start gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={immediate}
              onChange={(e) => setImmediate(e.target.checked)}
            />
            <span>
              <span className="font-medium text-[var(--text-primary)]">Process immediately</span>
              <span className="block text-xs text-[var(--text-muted)]">
                Balance moves right away — staff only gets a "Got it" notice, no approve/reject. Leave unchecked to
                ask the staff member to confirm first.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || noBalance} onClick={submit}>
              {saving ? 'Saving…' : immediate ? 'Transfer Now' : 'Send Request'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
