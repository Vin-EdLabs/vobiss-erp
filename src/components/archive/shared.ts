import { FileText, FileSpreadsheet, FileImage, MapPinned, FileArchive, FileVideo, FileAudio, File } from 'lucide-react';

export const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a']);

export function fileIconFor(extension: string | null | undefined) {
  const ext = String(extension || '').toLowerCase();
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'odp'].includes(ext)) return FileText;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return FileImage;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return FileVideo;
  if (['mp3', 'wav', 'm4a'].includes(ext)) return FileAudio;
  if (['kmz', 'kml'].includes(ext)) return MapPinned;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
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
