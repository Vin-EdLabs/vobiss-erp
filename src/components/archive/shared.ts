import { FileText, FileSpreadsheet, FileImage, MapPinned, FileArchive, File } from 'lucide-react';

export const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']);

export function fileIconFor(extension: string | null | undefined) {
  const ext = String(extension || '').toLowerCase();
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx'].includes(ext)) return FileText;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return FileImage;
  if (['kmz', 'kml'].includes(ext)) return MapPinned;
  if (ext === 'zip') return FileArchive;
  return File;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUnitLabel(slug: string | null | undefined): string {
  if (!slug) return 'Global';
  if (slug.toLowerCase() === 'ts' || slug.toLowerCase() === 'tx') return 'TX';
  return slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
