import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, RotateCw, Loader2, FileWarning, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchDocumentBlobUrl, type PerformanceReportDocument } from '@/api/performanceReports';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/**
 * Viewability is decided purely by file extension — PDFs render inline below via react-pdf;
 * everything else (DOCX/DOC/PPT/PPTX) falls back to "preview unavailable, download", the same
 * behavior every other module in this app already uses for those types. No server-side
 * conversion runs today (see backend/services/performanceDocumentConversion.js, reserved for a
 * future unified viewer upgrade), so there's no pending/blocking state to wait on here.
 */
export function DocumentViewer({ document: doc }: { document: PerformanceReportDocument }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [rotation, setRotation] = useState(0);

  const ext = String(doc.extension || '').toLowerCase();
  const isPdf = ext === 'pdf';
  const isImage = IMAGE_EXT.has(ext);
  const isPreviewable = isPdf || isImage;

  useEffect(() => {
    let revoke: string | null = null;
    setError(null);
    setBlobUrl(null);
    fetchDocumentBlobUrl(doc.id, false)
      .then((url) => { revoke = url; setBlobUrl(url); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this document'));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  if (error) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)] text-center">
        <FileWarning className="h-8 w-8 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!isPreviewable) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)] text-center">
        <FileWarning className="h-8 w-8 text-[var(--text-muted)]" />
        <p className="text-sm font-semibold text-[var(--text-primary)]">Preview unavailable for this file type</p>
        <p className="max-w-xs text-xs text-[var(--text-muted)]">{doc.original_name} — inline preview isn't available for .{ext || 'this'} files. You can still download the original.</p>
        <a href={blobUrl} download={doc.original_name}>
          <Button type="button" variant="outline" size="sm"><Download className="mr-1.5 h-3.5 w-3.5" /> Download document</Button>
        </a>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
        <img src={blobUrl} alt={doc.original_name} className="max-h-[80vh] rounded-lg object-contain shadow-[var(--shadow-md)]" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[#525659] shadow-[var(--shadow-md)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/20 bg-[#3c3f41] px-3 py-2">
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[80px] text-center text-xs font-medium text-white">Page {pageNumber} of {numPages || '—'}</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}><ZoomOut className="h-4 w-4" /></Button>
          <span className="min-w-[48px] text-center text-xs font-medium text-white">{Math.round(scale * 100)}%</span>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setScale((s) => Math.min(3, s + 0.15))}><ZoomIn className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setScale(1.1)} title="Fit width"><Maximize2 className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
          <a href={blobUrl} download={doc.original_name}>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10"><Download className="h-4 w-4" /></Button>
          </a>
        </div>
      </div>
      <div className="flex max-h-[75vh] justify-center overflow-auto p-6">
        <Document
          file={blobUrl}
          onLoadSuccess={({ numPages: n }) => { setNumPages(n); setPageNumber(1); }}
          loading={<div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
          error={<p className="p-8 text-sm text-white">Couldn't render this PDF.</p>}
        >
          <Page pageNumber={pageNumber} scale={scale} rotate={rotation} renderTextLayer renderAnnotationLayer className="shadow-2xl" />
        </Document>
      </div>
    </div>
  );
}
