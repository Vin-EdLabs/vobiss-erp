import { useEffect, useState } from 'react';
import { Download, FileWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchArchivePreviewBlob, downloadArchiveFile, type ArchiveFile } from '@/api/archive';
import { PREVIEWABLE_EXTENSIONS } from './shared';

export function FilePreviewModal({ file, onClose }: { file: ArchiveFile | null; onClose: () => void }) {
  const [blob, setBlob] = useState<{ url: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPreview = !!file && PREVIEWABLE_EXTENSIONS.has(String(file.extension || '').toLowerCase());

  useEffect(() => {
    if (!file || !canPreview) { setBlob(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchArchivePreviewBlob(file.id)
      .then((b) => { if (!cancelled) setBlob(b); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load preview'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  useEffect(() => {
    return () => { if (blob) URL.revokeObjectURL(blob.url); };
  }, [blob]);

  const handleClose = () => {
    if (blob) URL.revokeObjectURL(blob.url);
    setBlob(null);
    onClose();
  };

  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="truncate pr-8">{file.display_name}</DialogTitle></DialogHeader>

        {!canPreview ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileWarning className="h-10 w-10 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-secondary)]">Preview isn't available for this file type.</p>
            <Button type="button" onClick={() => downloadArchiveFile(file.id, file.display_name)}>
              <Download className="mr-1.5 h-4 w-4" /> Download instead
            </Button>
          </div>
        ) : loading ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileWarning className="h-10 w-10 text-[var(--danger-text)]" />
            <p className="text-sm text-[var(--danger-text)]">{error}</p>
          </div>
        ) : blob && blob.mimeType.startsWith('image/') ? (
          <img src={blob.url} alt={file.display_name} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
        ) : blob ? (
          <iframe src={blob.url} title={file.display_name} className="h-[70vh] w-full rounded-lg border border-[var(--border)]" />
        ) : null}

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={() => downloadArchiveFile(file.id, file.display_name)}>
            <Download className="mr-1.5 h-4 w-4" /> Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
