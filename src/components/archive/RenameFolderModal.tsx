import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { renameArchiveFolder, type ArchiveFolder } from '@/api/archive';

export function RenameFolderModal({ folder, onClose, onRenamed }: { folder: ArchiveFolder | null; onClose: () => void; onRenamed: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(folder?.name || '');
    setDescription(folder?.description || '');
  }, [folder]);

  const submit = async () => {
    if (!folder) return;
    if (!name.trim()) return toast({ title: 'Folder name is required', variant: 'destructive' });
    try {
      setSaving(true);
      await renameArchiveFolder(folder.id, { name: name.trim(), description: description.trim() });
      toast({ title: 'Folder updated' });
      onRenamed();
      onClose();
    } catch (e) {
      toast({ title: 'Could not update folder', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!folder} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Rename Folder</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-secondary)]">Description (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
