import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { updateShiftDefinition, type ShiftDefinition } from '@/api/nocShifts';

export function ShiftTimesSettingsDialog({
  open,
  definitions,
  onClose,
  onChanged,
}: {
  open: boolean;
  definitions: ShiftDefinition[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [times, setTimes] = useState<Record<number, { start_time: string; end_time: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTimes(Object.fromEntries(definitions.map((d) => [d.id, { start_time: d.start_time.slice(0, 5), end_time: d.end_time.slice(0, 5) }])));
  }, [open, definitions]);

  const submit = async () => {
    try {
      setSaving(true);
      setError(null);
      for (const def of definitions) {
        const value = times[def.id];
        if (!value) continue;
        if (value.start_time === def.start_time.slice(0, 5) && value.end_time === def.end_time.slice(0, 5)) continue;
        await updateShiftDefinition(def.id, value);
      }
      toast({ title: 'Shift times updated', description: 'All scheduled NOC Staff have been notified.' });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update shift times.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Shift Times</DialogTitle>
        </DialogHeader>
        {error && <p className="rounded-lg border border-[var(--accent-red-light)] bg-[var(--accent-red-light)] px-3 py-2 text-sm text-[var(--danger-text)]">{error}</p>}
        <div className="space-y-4">
          {definitions.map((def) => (
            <div key={def.id} className="grid grid-cols-2 gap-3">
              <p className="col-span-2 text-sm font-semibold text-[var(--text-primary)]">{def.name}</p>
              <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">
                <span>Start</span>
                <Input
                  type="time"
                  value={times[def.id]?.start_time || ''}
                  onChange={(e) => setTimes((prev) => ({ ...prev, [def.id]: { ...prev[def.id], start_time: e.target.value } }))}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-[var(--text-secondary)]">
                <span>End</span>
                <Input
                  type="time"
                  value={times[def.id]?.end_time || ''}
                  onChange={(e) => setTimes((prev) => ({ ...prev, [def.id]: { ...prev[def.id], end_time: e.target.value } }))}
                />
              </label>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Times'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
