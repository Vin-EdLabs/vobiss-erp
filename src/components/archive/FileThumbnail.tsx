import { useEffect, useState } from 'react';
import { fetchArchiveThumbnailBlob, type ArchiveFile } from '@/api/archive';
import { fileIconFor } from './shared';

/** Small lazily-loaded image thumbnail for a file card; falls back to the per-type icon
 * while loading, on failure, or when the file has no thumbnail (only images get one). */
export function FileThumbnail({ file, className }: { file: ArchiveFile; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const Icon = fileIconFor(file.extension);

  useEffect(() => {
    if (!file.has_thumbnail) return;
    let cancelled = false;
    setFailed(false);
    fetchArchiveThumbnailBlob(file.id)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.id, file.has_thumbnail]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  if (file.has_thumbnail && url && !failed) {
    return <img src={url} alt="" className={className || 'h-8 w-8 shrink-0 rounded-md object-cover'} />;
  }
  if (file.has_thumbnail && !failed) {
    return <div className={`shrink-0 animate-pulse rounded-md bg-[var(--surface-secondary)] ${className || 'h-8 w-8'}`} />;
  }
  return <Icon className={className ? className.replace('object-cover', '') : 'h-8 w-8 shrink-0 text-[var(--primary)]'} />;
}
