import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getArchiveUnits, createArchiveFolder } from '@/api/archive';
import { formatUnitLabel } from './shared';

export function NewFolderModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState<'global' | 'unit' | 'private'>('global');
  const [unitSlug, setUnitSlug] = useState('');
  const [units, setUnits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      getArchiveUnits().then((r) => { setUnits(r.units); if (r.units.length) setUnitSlug(r.units[0]); }).catch(() => {});
    } else {
      setName(''); setDescription(''); setScope('global'); setUnitSlug('');
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return toast({ title: 'Folder name is required', variant: 'destructive' });
    if (scope === 'unit' && !unitSlug) return toast({ title: 'Choose a department', variant: 'destructive' });
    try {
      setSaving(true);
      await createArchiveFolder({ name: name.trim(), description: description.trim() || undefined, scope, unitSlug: scope === 'unit' ? unitSlug : undefined });
      toast({ title: scope === 'private' ? 'Private folder created' : 'Folder created' });
      onCreated();
      onClose();
    } catch (e) {
      toast({ title: 'Could not create folder', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2025 Network Diagrams" autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Description (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What belongs in this folder" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Scope</label>
            <Select value={scope} onValueChange={(v) => setScope(v as 'global' | 'unit' | 'private')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global — every staff member</SelectItem>
                <SelectItem value="unit">Department — only my unit(s)</SelectItem>
                <SelectItem value="private">Private — only me</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === 'unit' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Department</label>
              {units.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">You don't belong to a department yet — ask an admin.</p>
              ) : (
                <Select value={unitSlug} onValueChange={setUnitSlug}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{units.map((u) => <SelectItem key={u} value={u}>{formatUnitLabel(u)}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          )}
          {scope === 'private' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-light)] p-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-text)]" />
              <p className="text-xs text-[var(--warning-text)]">
                Only you will ever be able to see this folder and what's inside it — not your manager, not an admin, no one. There's no way to share it later, so don't use it for anything a team needs access to.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={saving || (scope === 'unit' && units.length === 0)}>{saving ? 'Creating…' : 'Create Folder'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
