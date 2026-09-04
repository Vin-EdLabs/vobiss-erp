import { API_URL } from '@/lib/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function archiveFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}/archive${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...getAuthHeader(), ...options.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export interface ArchiveFolder {
  id: number;
  name: string;
  description: string | null;
  scope: 'global' | 'unit' | 'private';
  unit_slug: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  file_count: number;
}

export interface ArchiveFile {
  id: number;
  folder_id: number;
  original_name: string;
  display_name: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number | null;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  has_thumbnail?: boolean;
}

export interface Paginated<T> {
  total: number;
  page: number;
  limit: number;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)]));
  const s = new URLSearchParams(filtered).toString();
  return s ? `?${s}` : '';
};

export const getArchiveUnits = (): Promise<{ units: string[] }> => archiveFetch('/units');

export const listArchiveFolders = (params?: { scope?: string; unitSlug?: string; q?: string; page?: number; limit?: number }): Promise<Paginated<ArchiveFolder> & { folders: ArchiveFolder[] }> =>
  archiveFetch(`/folders${qs(params || {})}`);

export const createArchiveFolder = (payload: { name: string; description?: string; scope: 'global' | 'unit' | 'private'; unitSlug?: string }): Promise<ArchiveFolder> =>
  archiveFetch('/folders', { method: 'POST', body: JSON.stringify(payload) });

export const renameArchiveFolder = (id: number, payload: { name?: string; description?: string }): Promise<ArchiveFolder> =>
  archiveFetch(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteArchiveFolder = (id: number): Promise<{ deleted: boolean; filesRemoved: number }> =>
  archiveFetch(`/folders/${id}`, { method: 'DELETE' });

export const listArchiveFiles = (folderId: number, params?: { q?: string; page?: number; limit?: number }): Promise<Paginated<ArchiveFile> & { folder: ArchiveFolder; files: ArchiveFile[] }> =>
  archiveFetch(`/folders/${folderId}/files${qs(params || {})}`);

/** Upload via XHR (not fetch) specifically for `upload.onprogress` — fetch has no request-body
 * progress event, and large files (images/PDFs up to 30MB) are exactly when a bare "Uploading…"
 * label isn't enough feedback. `onProgress` receives 0-100 for the whole multipart batch. */
export const uploadArchiveFiles = (folderId: number, files: File[], onProgress?: (percent: number) => void): Promise<{ files: ArchiveFile[] }> => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const auth = getAuthHeader() as Record<string, string>;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/archive/folders/${folderId}/files`);
    if (auth.Authorization) xhr.setRequestHeader('Authorization', auth.Authorization);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: any = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || body.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection and try again.'));
    xhr.send(form);
  });
};

export const renameArchiveFile = (id: number, payload: { displayName?: string; folderId?: number }): Promise<ArchiveFile> =>
  archiveFetch(`/files/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteArchiveFile = (id: number): Promise<{ deleted: boolean }> =>
  archiveFetch(`/files/${id}`, { method: 'DELETE' });

export interface ShareableFolder {
  id: number;
  name: string;
  scope: 'global' | 'unit';
  unit_slug: string | null;
}

export const listShareableFolders = (): Promise<{ folders: ShareableFolder[] }> => archiveFetch('/folders/shareable');

export const copyArchiveFileToFolder = (id: number, folderId: number): Promise<ArchiveFile> =>
  archiveFetch(`/files/${id}/copy-to`, { method: 'POST', body: JSON.stringify({ folderId }) });

/** Auth for the three read-only file routes: normal session, or (when visiting via a
 * `/shared/:token` public/private link) the share token instead — see backend
 * middleware/shareAuth.js. Never send both; the share token alone is what lets an
 * anonymous "Public" link actually work outside the app. */
const fileAccessHeaders = (shareToken?: string) => (shareToken ? { 'x-share-token': shareToken } : getAuthHeader());

export const getArchiveFileMeta = async (id: number, shareToken?: string): Promise<ArchiveFile> => {
  const res = await fetch(`${API_URL}/archive/files/${id}`, { headers: fileAccessHeaders(shareToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Could not load file (${res.status})`);
  }
  return res.json();
};

export const archiveDownloadUrl = (id: number) => `${API_URL}/archive/files/${id}/download`;
export const archivePreviewUrl = (id: number) => `${API_URL}/archive/files/${id}/preview`;
export const archiveThumbnailUrl = (id: number) => `${API_URL}/archive/files/${id}/thumbnail`;

export const fetchArchiveThumbnailBlob = async (id: number, shareToken?: string): Promise<string> => {
  const res = await fetch(archiveThumbnailUrl(id), { headers: fileAccessHeaders(shareToken) });
  if (!res.ok) throw new Error(`Thumbnail failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

export const downloadArchiveFile = async (id: number, filename: string, shareToken?: string) => {
  const res = await fetch(archiveDownloadUrl(id), { headers: fileAccessHeaders(shareToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const fetchArchivePreviewBlob = async (id: number, shareToken?: string): Promise<{ url: string; mimeType: string }> => {
  const res = await fetch(archivePreviewUrl(id), { headers: fileAccessHeaders(shareToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `Preview failed (${res.status})`);
  }
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), mimeType: blob.type };
};
