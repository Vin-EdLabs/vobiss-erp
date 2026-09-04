import { useEffect, useMemo, useState } from 'react';
import { Folder, Globe, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { listShareableFolders, copyArchiveFileToFolder, type ArchiveFile, type ShareableFolder } from '@/api/archive';
import { formatUnitLabel } from './shared';

export function CopyToFolderModal({ file, onClose, onShared }: { file: ArchiveFile | null; onClose: () => void; onShared: () => void }) {
  const { toast } = useToast();
  const [folders, setFolders] = useState<ShareableFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) { setSearch(''); setSelectedId(null); return; }
    setLoading(true);
    listShareableFolders()
      .then((r) => setFolders(r.folders))
      .catch((e) => toast({ title: 'Could not load folders', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = file ? folders.filter((f) => f.id !== file.folder_id) : folders;
    if (!q) return list;
    return list.filter((f) => f.name.toLowerCase().includes(q) || formatUnitLabel(f.unit_slug).toLowerCase().includes(q));
  }, [folders, search, file]);

  const submit = async () => {
    if (!file || !selectedId) return;
    try {
      setSaving(true);
      await copyArchiveFileToFolder(file.id, selectedId);
      toast({ title: 'File shared', description: 'A copy is now available in that folder.' });
      onShared();
      onClose();
    } catch (e) {
      toast({ title: 'Could not share file', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share to Another Folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Drop a copy of <span className="font-semibold text-[var(--text-primary)]">{file?.display_name}</span> into any global or department folder — including one that belongs to a different department.
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-9" placeholder="Search folders or departments…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border)]">
            {loading ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-muted)]">No folders found.</p>
            ) : (
              filtered.map((f) => {
                const Icon = f.scope === 'global' ? Globe : Folder;
                const selected = selectedId === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`flex w-full items-center gap-2.5 border-b border-[var(--border)] px-3 py-2.5 text-left last:border-0 transition ${selected ? 'bg-[var(--accent-blue-light)]' : 'hover:bg-[var(--surface-secondary)]'}`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${selected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{f.name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{f.scope === 'global' ? 'Global' : formatUnitLabel(f.unit_slug)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={!selectedId || saving}>{saving ? 'Sharing…' : 'Share Copy'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
