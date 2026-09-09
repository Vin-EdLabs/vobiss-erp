import React, { useState } from 'react';
import { Banknote, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, inputClass } from '@/pages/hr/components';
import type { OTPaymentMethod } from '@/api/overtime';

const METHODS: { value: OTPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'mobile_money', label: 'Mobile Money' },
];

/** Finance's stage-specific action panel — amount paid, payment method, signature, and the
 *  Finance authorization statement. Splitting this out from the generic approve/decline panel
 *  because Finance is the only stage that records real payment data. */
export function OTFinancePanel({
  totalHours,
  pending,
  onPay,
  onDecline,
}: {
  totalHours: number;
  pending: boolean;
  onPay: (amount: number, method: OTPaymentMethod, signature: string) => void;
  onDecline: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<OTPaymentMethod>('mobile_money');
  const [signature, setSignature] = useState('');

  const amountNum = Number(amount);
  const canSubmit = amountNum > 0 && String(signature).trim().length > 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--accent-amber)] bg-[var(--accent-amber-light)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Banknote className="h-4 w-4 text-[var(--primary)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Finance Processing</p>
      </div>
      <p className="mb-3 text-xs italic text-[var(--text-secondary)]">
        Total OT hours claimed: <span className="font-semibold not-italic">{totalHours.toFixed(2)}h</span>. Enter the amount to be paid and confirm the payment method — no rate auto-calculation, amount is entered manually.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount Paid (GHS)" required>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Payment Method" required>
          <div className="flex flex-wrap gap-2 pt-1">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  method === m.value
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field label="Finance Digital Signature" required hint="Type your full name to confirm this payment.">
        <input className={inputClass} placeholder="Type your full name…" value={signature} onChange={(e) => setSignature(e.target.value)} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" disabled={pending} className="border-[var(--accent-red)] text-[var(--accent-red)] hover:bg-[var(--accent-red-light)]" onClick={onDecline}>
          <X className="mr-1 h-4 w-4" /> Decline
        </Button>
        <Button size="sm" disabled={pending || !canSubmit} onClick={() => onPay(amountNum, method, signature.trim())}>
          <Check className="mr-1 h-4 w-4" /> Confirm Payment
        </Button>
      </div>
    </div>
  );
}
