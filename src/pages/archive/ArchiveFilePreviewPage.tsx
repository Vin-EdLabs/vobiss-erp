import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSharedView } from '@/context/SharedViewContext';
import { getArchiveFileMeta, fetchArchivePreviewBlob, downloadArchiveFile, type ArchiveFile } from '@/api/archive';
import { fileIconFor, formatFileSize, PREVIEWABLE_EXTENSIONS } from '@/components/archive/shared';

/**
 * Standalone file page — used both as a normal in-app route (/file-storage/preview/:id)
 * and, unmodified, as the component `/shared/:token` renders for an `archive_file` share
 * link (see src/lib/sharedPageRegistry.tsx). In the shared case it authenticates with the
 * share token instead of a login session, which is what lets a "Public" link work for
 * someone outside the app entirely.
 */
export default function ArchiveFilePreviewPage() {
  const { isSharedView, shareToken, routeParams } = useSharedView();
  const { id: routeId } = useParams<{ id: string }>();
  const id = Number(isSharedView ? routeParams?.id : routeId);
  const token = isSharedView ? shareToken : undefined;

  const [file, setFile] = useState<ArchiveFile | null>(null);
  const [blob, setBlob] = useState<{ url: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getArchiveFileMeta(id, token)
      .then((f) => { if (!cancelled) setFile(f); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load this file.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, token]);

  const canPreview = !!file && PREVIEWABLE_EXTENSIONS.has(String(file.extension || '').toLowerCase());

  useEffect(() => {
    if (!file || !canPreview) { setBlob(null); return; }
    let cancelled = false;
    fetchArchivePreviewBlob(file.id, token)
      .then((b) => { if (!cancelled) setBlob(b); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id, canPreview]);

  useEffect(() => () => { if (blob) URL.revokeObjectURL(blob.url); }, [blob]);

  const Icon = file ? fileIconFor(file.extension) : FileWarning;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {loading ? (
          <div className="p-6"><Skeleton className="h-96 w-full rounded-xl" /></div>
        ) : error || !file ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FileWarning className="h-10 w-10 text-[var(--danger-text)]" />
            <p className="text-sm text-[var(--danger-text)]">{error || 'File not found.'}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-4 border-b border-[var(--border)] p-6">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-secondary)] text-[var(--primary)]">
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold text-[var(--text-primary)]">{file.display_name}</h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {formatFileSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString()}
                  {file.uploaded_by_name ? ` · Uploaded by ${file.uploaded_by_name}` : ''}
                </p>
              </div>
              <Button type="button" onClick={() => downloadArchiveFile(file.id, file.display_name, token)}>
                <Download className="mr-1.5 h-4 w-4" /> Download
              </Button>
            </div>

            <div className="p-6">
              {!canPreview ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <FileWarning className="h-10 w-10 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-secondary)]">Preview isn't available for this file type — download it instead.</p>
                </div>
              ) : !blob ? (
                <Skeleton className="h-96 w-full rounded-xl" />
              ) : blob.mimeType.startsWith('image/') ? (
                <img src={blob.url} alt={file.display_name} className="mx-auto max-h-[70vh] rounded-lg object-contain" />
              ) : (
                <iframe src={blob.url} title={file.display_name} className="h-[70vh] w-full rounded-lg border border-[var(--border)]" />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
