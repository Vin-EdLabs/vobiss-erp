import React, { useCallback, useState } from 'react';
import { FileText, Image as ImageIcon, Upload, Download, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProjectRequestAttachment } from '@/api/project';
import { projectRequestFileUrl } from '@/api/project';

function isImageFile(mime?: string, name?: string) {
  return mime?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name || '');
}

function isPdfFile(mime?: string, name?: string) {
  return mime === 'application/pdf' || /\.pdf$/i.test(name || '');
}

export function AttachmentZone({
  attachments,
  stage,
  onUpload,
  allowUpload = true,
}: {
  attachments: ProjectRequestAttachment[];
  stage?: string;
  onUpload?: (file: File) => Promise<void>;
  allowUpload?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const list =
    !stage || stage === 'all'
      ? attachments
      : attachments.filter((a) => a.stage === stage);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !onUpload) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUpload(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      void handleFiles(e.dataTransfer.files);
    },
    [onUpload]
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Attachments</h3>

      {allowUpload && onUpload && (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 transition ${
            drag
              ? 'border-[var(--primary)] bg-[var(--accent-green-light)]'
              : 'border-[var(--border-strong)] bg-[var(--surface-secondary)] hover:border-[var(--primary)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <input
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => void handleFiles(e.target.files)}
            disabled={uploading}
          />
          {uploading ? (
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
          ) : (
            <Upload className="h-10 w-10 text-[var(--text-muted)]" />
          )}
          <p className="mt-2 text-sm font-medium text-[var(--text-body)]">
            Drag & drop files here, or click to browse
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Images, PDF, Word, Excel (max 25MB)</p>
        </label>
      )}

      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {list.map((att) => {
            const url = projectRequestFileUrl(att.file_path);
            const isImage = isImageFile(att.mime_type, att.file_name);
            const isPdf = isPdfFile(att.mime_type, att.file_name);

            return (
              <div
                key={att.id}
                className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-md)]"
              >
                {isImage ? (
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => setPreviewUrl(url)}
                  >
                    <img
                      src={url}
                      alt={att.file_name}
                      className="aspect-video w-full bg-[var(--surface-secondary)] object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </button>
                ) : isPdf ? (
                  <div className="aspect-video w-full bg-[var(--surface-secondary)]">
                    <iframe
                      title={att.file_name}
                      src={`${url}#toolbar=0`}
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-[var(--surface-secondary)]">
                    <FileText className="h-12 w-12 text-[var(--text-muted)]" />
                  </div>
                )}

                <div className="border-t border-[var(--border)] p-3">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{att.file_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {att.uploader_name} · {new Date(att.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8" asChild>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-1 h-3 w-3" />
                        Open
                      </a>
                    </Button>
                    {isImage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setPreviewUrl(url)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !allowUpload && <p className="text-sm italic text-[var(--text-muted)]">No attachments</p>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setPreviewUrl(null)}
          role="presentation"
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={previewUrl} alt="Preview" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
            <Button
              type="button"
              className="absolute -top-12 right-0"
              variant="secondary"
              onClick={() => setPreviewUrl(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

