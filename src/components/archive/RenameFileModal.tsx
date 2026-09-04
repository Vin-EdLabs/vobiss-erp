import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { renameArchiveFile, type ArchiveFile } from '@/api/archive';

export function RenameFileModal({ file, onClose, onRenamed }: { file: ArchiveFile | null; onClose: () => void; onRenamed: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(file?.display_name || ''); }, [file]);

  const submit = async () => {
    if (!file) return;
    if (!name.trim()) return toast({ title: 'File name is required', variant: 'destructive' });
    try {
      setSaving(true);
      await renameArchiveFile(file.id, { displayName: name.trim() });
      toast({ title: 'File renamed' });
      onRenamed();
      onClose();
    } catch (e) {
      toast({ title: 'Could not rename file', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Rename File</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
