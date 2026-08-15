import React, { useEffect, useState } from 'react';
import { hrFileUrl } from '@/api/hr';
import { Button } from '@/components/ui/button';

function fileExt(url?: string | null, name?: string | null) {
  const source = `${name || ''} ${url || ''}`.split('?')[0];
  const match = source.match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || '').toLowerCase();
}

function mimeFromExt(ext: string) {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  };
  return map[ext] || '';
}

function kindFromExt(ext: string) {
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['txt', 'csv', 'json', 'log', 'md'].includes(ext)) return 'text';
  if (['mp4', 'webm', 'ogg'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a'].includes(ext)) return 'audio';
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
  return '';
}

function kindFromMime(mime: string) {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.includes('word') || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('officedocument') || mime.includes('presentation')) return 'office';
  return '';
}

async function sniffKind(blob: Blob) {
  const buf = await blob.slice(0, 16).arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { kind: 'pdf', mime: 'application/pdf' };
  if (b[0] === 0xff && b[1] === 0xd8) return { kind: 'image', mime: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { kind: 'image', mime: 'image/png' };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { kind: 'image', mime: 'image/gif' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return { kind: 'image', mime: 'image/webp' };
  if (b[0] === 0x50 && b[1] === 0x4b) return { kind: 'office', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  return null;
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || 'document';
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const PREVIEW_FRAME = 'h-[min(80vh,760px)] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]';

export function DocumentPreview({
  fileUrl,
  documentName,
}: {
  fileUrl?: string | null;
  documentName?: string | null;
}) {
  const url = hrFileUrl(fileUrl);
  const ext = fileExt(fileUrl, documentName);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [kind, setKind] = useState(kindFromExt(ext) || 'file');
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let alive = true;
    let created: string | null = null;
    setLoading(true);
    setText(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load file');
        return r.blob();
      })
      .then(async (blob) => {
        if (!alive) return;
        const sniffed = await sniffKind(blob);
        const nextKind = sniffed?.kind || kindFromMime(blob.type || '') || kindFromExt(ext) || 'file';
        const mime = sniffed?.mime || mimeFromExt(ext) || (nextKind === 'pdf' ? 'application/pdf' : blob.type);
        const typed = mime && mime !== 'application/octet-stream' ? new Blob([blob], { type: mime }) : blob;
        created = URL.createObjectURL(typed);
        if (nextKind === 'text') {
          const body = await typed.text();
          if (alive) setText(body.slice(0, 20000));
        }
        if (alive) {
          setKind(nextKind);
          setObjectUrl(created);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setKind(kindFromExt(ext) || 'file');
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, ext]);

  const download = () => {
    const filename = documentName || `document${ext ? `.${ext}` : ''}`;
    triggerDownload(hrFileUrl(fileUrl, { download: true, name: filename }) || objectUrl || url, filename);
  };

  if (!url) {
    return <p className="text-sm text-[var(--text-muted)]">No file attached.</p>;
  }

  const previewSrc = objectUrl;

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-[var(--text-secondary)]">Loading preview…</p>}
      {!loading && kind === 'image' && previewSrc && (
        <img
          src={previewSrc}
          alt={documentName || 'Document'}
          className="max-h-[min(80vh,760px)] w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] object-contain"
        />
      )}
      {!loading && kind === 'pdf' && previewSrc && (
        <iframe title={documentName || 'PDF preview'} src={previewSrc} className={PREVIEW_FRAME} />
      )}
      {!loading && kind === 'video' && previewSrc && (
        <video src={previewSrc} controls className="max-h-[min(80vh,760px)] w-full rounded-lg border border-[var(--border)]" />
      )}
      {!loading && kind === 'audio' && previewSrc && <audio src={previewSrc} controls className="w-full" />}
      {!loading && kind === 'text' && (
        <pre className="max-h-[min(70vh,640px)] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-primary)]">
          {text || 'No text to display.'}
        </pre>
      )}
      {!loading && (kind === 'office' || kind === 'file' || !previewSrc) && kind !== 'image' && kind !== 'pdf' && kind !== 'video' && kind !== 'audio' && kind !== 'text' && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">{documentName || 'Document'}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            This file cannot be shown in the browser. Use Download to open it on your computer.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={download}>Download</Button>
      </div>
    </div>
  );
}
