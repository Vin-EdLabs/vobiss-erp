import React, { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, inputClass } from '@/pages/hr/components';

/** Shared "digital signature" confirm step — used both for the employee submitting a request
 *  and for every reliever/supervisor/manager/cto/hr confirm-or-approve action, so every stage
 *  of the chain leaves a typed signature behind, not just a click. */
export function LeaveSignatureDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm & Sign',
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: (signature: string) => void;
}) {
  const [signature, setSignature] = useState('');

  useEffect(() => {
    if (open) setSignature('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-[var(--primary)]" />
            {title}
          </DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-[var(--text-secondary)]">{description}</p>}
        <Field label="Digital Signature" required hint="Type your initials to confirm this action.">
          <input
            className={`${inputClass} text-center text-lg font-semibold tracking-widest`}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="e.g. AKV"
            autoFocus
            maxLength={12}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={pending || signature.trim().length < 1} onClick={() => onConfirm(signature.trim())}>
            {pending ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
