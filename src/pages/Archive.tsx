import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HardDrive, Search, Plus, Folder, FolderOpen, Upload, Download, Eye,
  Trash2, Pencil, FolderInput, ChevronLeft, ChevronRight, FolderX, Lock, ShieldCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  listArchiveFolders, listArchiveFiles, uploadArchiveFiles, deleteArchiveFile, deleteArchiveFolder,
  downloadArchiveFile, type ArchiveFolder, type ArchiveFile,
} from '@/api/archive';
import { NewFolderModal } from '@/components/archive/NewFolderModal';
import { RenameFolderModal } from '@/components/archive/RenameFolderModal';
import { RenameFileModal } from '@/components/archive/RenameFileModal';
import { CopyToFolderModal } from '@/components/archive/CopyToFolderModal';
import { FilePreviewModal } from '@/components/archive/FilePreviewModal';
import { ConfirmDeleteDialog } from '@/components/archive/ConfirmDeleteDialog';
import { ShareButton } from '@/components/ShareButton';
import { FileThumbnail } from '@/components/archive/FileThumbnail';
import { formatFileSize, formatUnitLabel } from '@/components/archive/shared';

type FilterChip = 'all' | 'global' | 'mine' | 'private';
const PAGE_SIZE = 24;

export default function Archive() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();

  const [folderSearch, setFolderSearch] = useState('');
  const [debouncedFolderSearch, setDebouncedFolderSearch] = useState('');
  const [filter, setFilter] = useState<FilterChip>('all');
  const [folders, setFolders] = useState<ArchiveFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(sp.get('folder') ? Number(sp.get('folder')) : null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const [fileSearch, setFileSearch] = useState('');
  const [debouncedFileSearch, setDebouncedFileSearch] = useState('');
  const [filePage, setFilePage] = useState(1);
  const [files, setFiles] = useState<ArchiveFile[]>([]);
  const [fileTotal, setFileTotal] = useState(0);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadCount, setUploadCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<ArchiveFile | null>(null);
  const [fileToDelete, setFileToDelete] = useState<ArchiveFile | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<ArchiveFolder | null>(null);
  const [fileToRename, setFileToRename] = useState<ArchiveFile | null>(null);
  const [fileToShare, setFileToShare] = useState<ArchiveFile | null>(null);
  const [folderToRename, setFolderToRename] = useState<ArchiveFolder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = window.setTimeout(() => setDebouncedFolderSearch(folderSearch), 300); return () => window.clearTimeout(t); }, [folderSearch]);
  useEffect(() => { const t = window.setTimeout(() => setDebouncedFileSearch(fileSearch), 300); return () => window.clearTimeout(t); }, [fileSearch]);

  const loadFolders = useCallback(async () => {
    try {
      setFoldersLoading(true);
      const data = await listArchiveFolders({
        q: debouncedFolderSearch || undefined,
        scope: filter === 'global' ? 'global' : filter === 'mine' ? 'unit' : filter === 'private' ? 'private' : undefined,
        limit: 50,
      });
      setFolders(data.folders);
    } catch (e) {
      toast({ title: 'Could not load folders', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setFoldersLoading(false);
    }
  }, [debouncedFolderSearch, filter, toast]);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const selectedFolder = useMemo(() => folders.find((f) => f.id === selectedFolderId) || null, [folders, selectedFolderId]);

  const loadFiles = useCallback(async () => {
    if (!selectedFolderId) { setFiles([]); setFileTotal(0); return; }
    try {
      setFilesLoading(true);
      const data = await listArchiveFiles(selectedFolderId, { q: debouncedFileSearch || undefined, page: filePage, limit: PAGE_SIZE });
      setFiles(data.files);
      setFileTotal(data.total);
    } catch (e) {
      toast({ title: 'Could not load files', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      setFiles([]); setFileTotal(0);
    } finally {
      setFilesLoading(false);
    }
  }, [selectedFolderId, debouncedFileSearch, filePage, toast]);

  useEffect(() => { setFilePage(1); }, [selectedFolderId, debouncedFileSearch]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  const selectFolder = (id: number) => {
    setSelectedFolderId(id);
    setFileSearch(''); setDebouncedFileSearch('');
    setSp((prev) => { const next = new URLSearchParams(prev); next.set('folder', String(id)); return next; }, { replace: true });
  };

  const doUpload = async (fileList: FileList | File[]) => {
    if (!selectedFolderId) return;
    const arr = Array.from(fileList);
    if (!arr.length) return;
    try {
      setUploading(true);
      setUploadCount(arr.length);
      setUploadProgress(0);
      await uploadArchiveFiles(selectedFolderId, arr, setUploadProgress);
      toast({ title: `${arr.length} file${arr.length === 1 ? '' : 's'} uploaded` });
      loadFiles();
      loadFolders();
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Please try again.', variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const confirmRemoveFile = async () => {
    if (!fileToDelete) return;
    try {
      await deleteArchiveFile(fileToDelete.id);
      toast({ title: 'File deleted' });
      loadFiles(); loadFolders();
    } catch (e) {
      toast({ title: 'Could not delete file', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setFileToDelete(null);
    }
  };

  const confirmRemoveFolder = async () => {
    if (!folderToDelete) return;
    try {
      await deleteArchiveFolder(folderToDelete.id);
      toast({ title: 'Folder deleted' });
      if (selectedFolderId === folderToDelete.id) setSelectedFolderId(null);
      loadFolders();
    } catch (e) {
      toast({ title: 'Could not delete folder', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setFolderToDelete(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(fileTotal / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Documents</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><HardDrive className="h-7 w-7" /> File Storage</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Store, rename, and share files in named folders — global, by department, or private to you. Share a file with another department or generate a link to send anywhere.</p>
        </div>
        <Button type="button" onClick={() => setNewFolderOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> New Folder</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-9" placeholder="Search folders…" value={folderSearch} onChange={(e) => setFolderSearch(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {(['all', 'global', 'mine', 'private'] as FilterChip[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${filter === f ? 'bg-[var(--primary)] text-[var(--primary-text)]' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}>
                {f === 'private' && <Lock className="h-3 w-3" />}
                {f === 'all' ? 'All available' : f === 'global' ? 'Global' : f === 'mine' ? 'My unit(s)' : 'Private'}
              </button>
            ))}
          </div>

          {foldersLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">Create a folder to start archiving.</p>
          ) : (
            <div className="space-y-1.5">
              {folders.map((f) => {
                const isPrivate = f.scope === 'private';
                const Icon = isPrivate ? Lock : selectedFolderId === f.id ? FolderOpen : Folder;
                return (
                  <button key={f.id} type="button" onClick={() => selectFolder(f.id)}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${selectedFolderId === f.id ? (isPrivate ? 'border-[var(--accent-amber)] bg-[var(--accent-amber-light)]' : 'border-[var(--primary)] bg-[var(--accent-blue-light)]') : 'border-transparent hover:bg-[var(--surface-secondary)]'}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${isPrivate ? 'text-[var(--warning-text)]' : 'text-[var(--primary)]'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{f.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <StatusPill tone={f.scope === 'global' ? 'info' : isPrivate ? 'warning' : 'role'} className="!py-0 !px-1.5 !text-[9px]">
                          {f.scope === 'global' ? 'Global' : isPrivate ? 'Private' : formatUnitLabel(f.unit_slug)}
                        </StatusPill>
                        <span className="text-[11px] text-[var(--text-muted)]">{f.file_count} file{f.file_count === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
          {!selectedFolder ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
              <FolderX className="h-8 w-8 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">Select a folder to view its files.</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">File Storage / {selectedFolder.scope === 'global' ? 'Global' : selectedFolder.scope === 'private' ? 'Private' : formatUnitLabel(selectedFolder.unit_slug)}</p>
                  <h2 className="flex items-center gap-1.5 text-lg font-bold text-[var(--text-primary)]">
                    {selectedFolder.scope === 'private' && <Lock className="h-4 w-4 text-[var(--warning-text)]" />}
                    {selectedFolder.name}
                  </h2>
                  {selectedFolder.description && <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{selectedFolder.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-52">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input className="pl-9" placeholder="Search files…" value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} />
                  </div>
                  <input
                    ref={fileInputRef} type="file" multiple className="hidden"
                    onChange={(e) => { if (e.target.files) doUpload(e.target.files); e.target.value = ''; }}
                  />
                  <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Upload className="mr-1.5 h-4 w-4" /> {uploading ? `Uploading… ${uploadProgress}%` : 'Upload'}
                  </Button>
                  {(user?.id === selectedFolder.created_by) && (
                    <>
                      <Button type="button" variant="outline" size="icon" title="Rename folder" onClick={() => setFolderToRename(selectedFolder)}><Pencil className="h-4 w-4" /></Button>
                      <Button type="button" variant="outline" size="icon" title="Delete folder" onClick={() => setFolderToDelete(selectedFolder)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>

              {selectedFolder.scope === 'private' && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber-light)] px-3 py-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--warning-text)]" />
                  <p className="text-xs font-medium text-[var(--warning-text)]">Private folder — only you can see this folder and the files in it.</p>
                </div>
              )}

              {uploading && (
                <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                    <span>Uploading {uploadCount} file{uploadCount === 1 ? '' : 's'}…</span>
                    <span className="tabular-nums text-[var(--primary)]">{uploadProgress}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.max(4, uploadProgress)}%` }}
                    />
                  </div>
                </div>
              )}

              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files); }}
                className={`rounded-xl border-2 border-dashed transition ${dragOver ? 'border-[var(--primary)] bg-[var(--accent-blue-light)]' : 'border-transparent'}`}
              >
                {filesLoading ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-16 text-center">
                    <Upload className="h-7 w-7 text-[var(--text-muted)]" />
                    <p className="text-sm text-[var(--text-muted)]">No files yet — drag files here or click Upload.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {files.map((f) => (
                      <FileCard
                        key={f.id}
                        file={f}
                        onPreview={() => setPreviewFile(f)}
                        onDownload={() => downloadArchiveFile(f.id, f.display_name)}
                        onDelete={() => setFileToDelete(f)}
                        onRename={() => setFileToRename(f)}
                        onShareToFolder={() => setFileToShare(f)}
                        canManage={f.uploaded_by === user?.id}
                      />
                    ))}
                  </div>
                )}
              </div>

              {fileTotal > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Page {filePage} of {totalPages} · {fileTotal} files</span>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={filePage <= 1} onClick={() => setFilePage((p) => p - 1)}><ChevronLeft className="mr-1 h-4 w-4" /> Previous</Button>
                    <Button type="button" size="sm" variant="outline" disabled={filePage >= totalPages} onClick={() => setFilePage((p) => p + 1)}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <NewFolderModal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} onCreated={loadFolders} />
      <RenameFolderModal folder={folderToRename} onClose={() => setFolderToRename(null)} onRenamed={loadFolders} />
      <RenameFileModal file={fileToRename} onClose={() => setFileToRename(null)} onRenamed={loadFiles} />
      <CopyToFolderModal file={fileToShare} onClose={() => setFileToShare(null)} onShared={loadFolders} />
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ConfirmDeleteDialog
        open={!!fileToDelete}
        title="Delete this file?"
        description={fileToDelete ? `"${fileToDelete.display_name}" will be permanently deleted. This cannot be undone.` : ''}
        onConfirm={confirmRemoveFile}
        onOpenChange={(open) => !open && setFileToDelete(null)}
      />
      <ConfirmDeleteDialog
        open={!!folderToDelete}
        title="Delete this folder?"
        description={folderToDelete ? `"${folderToDelete.name}" will be permanently deleted${folderToDelete.file_count ? ' along with its files' : ''}. This cannot be undone.` : ''}
        onConfirm={confirmRemoveFolder}
        onOpenChange={(open) => !open && setFolderToDelete(null)}
      />
    </div>
  );
}

function FileCard({ file, onPreview, onDownload, onDelete, onRename, onShareToFolder, canManage }: {
  file: ArchiveFile;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onRename: () => void;
  onShareToFolder: () => void;
  canManage: boolean;
}) {
  return (
    <div className="group rounded-xl border border-[var(--border)] p-3 transition hover:border-[var(--primary)] hover:shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-start gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-secondary)] text-[var(--primary)]">
          <FileThumbnail file={file} className="h-11 w-11 shrink-0 object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={file.display_name}>{file.display_name}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{formatFileSize(file.size_bytes)} · {file.uploaded_by_name || 'Unknown'}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{new Date(file.created_at).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
        <Button type="button" size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onPreview}><Eye className="mr-1 h-3.5 w-3.5" /> Preview</Button>
        <Button type="button" size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onDownload}><Download className="mr-1 h-3.5 w-3.5" /> Download</Button>
        <ShareButton
          recordType="archive_file"
          recordId={file.id}
          pagePath={`/file-storage/preview/${file.id}`}
          pageTitle={file.display_name}
          variant="outline"
          className="h-7 flex-1 px-2 text-xs [&>svg]:mr-1 [&>svg]:h-3.5 [&>svg]:w-3.5"
        />
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Share to another folder / department" onClick={onShareToFolder}><FolderInput className="h-3.5 w-3.5" /></Button>
        {canManage && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Rename" onClick={onRename}><Pencil className="h-3.5 w-3.5" /></Button>}
        {canManage && <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-[var(--danger-text)]" title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  );
}
