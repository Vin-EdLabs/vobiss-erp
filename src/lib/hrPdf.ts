import jsPDF from 'jspdf';
import { formatGhs } from '@/lib/taxCalculations';

type Column = { key: string; label: string; width: number };

function loadLogo(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = '/vobiss-logo.png';
  });
}

export async function downloadHrPdf(opts: {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Record<string, string | number>[];
  summary?: string[];
}) {
  const doc = new jsPDF({ orientation: opts.columns.length > 6 ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const logo = await loadLogo();
  const generated = new Date().toLocaleString();

  const header = () => {
    if (logo) doc.addImage(logo, 'PNG', 14, 10, 16, 16);
    doc.setFontSize(11);
    doc.text('Human Resources Department', logo ? 34 : 14, 16);
    doc.setFontSize(14);
    doc.text(opts.title, logo ? 34 : 14, 23);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated ${generated}${opts.subtitle ? `  ·  ${opts.subtitle}` : ''}`, logo ? 34 : 14, 29);
    doc.setTextColor(0);
  };

  const footer = (page: number, total: number) => {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Confidential — Vobiss Solutions Limited', 14, pageH - 10);
    doc.text(`Page ${page} of ${total}`, pageW - 14, pageH - 10, { align: 'right' });
    doc.setTextColor(0);
  };

  header();
  let y = 38;
  const startX = 14;
  const usable = pageW - 28;
  const totalWidth = opts.columns.reduce((s, c) => s + c.width, 0);

  const drawHeaderRow = () => {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    let x = startX;
    opts.columns.forEach((col) => {
      const w = (col.width / totalWidth) * usable;
      doc.text(col.label, x, y);
      x += w;
    });
    doc.setFont('helvetica', 'normal');
    y += 6;
  };
  drawHeaderRow();

  const pages: number[] = [1];
  opts.rows.forEach((row) => {
    if (y > pageH - 22) {
      doc.addPage();
      pages.push(pages.length + 1);
      header();
      y = 38;
      drawHeaderRow();
    }
    let x = startX;
    opts.columns.forEach((col) => {
      const w = (col.width / totalWidth) * usable;
      const val = row[col.key] == null ? '—' : String(row[col.key]);
      doc.text(val.slice(0, 42), x, y);
      x += w;
    });
    y += 6;
  });

  if (opts.summary?.length) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    opts.summary.forEach((line) => {
      if (y > pageH - 22) {
        doc.addPage();
        pages.push(pages.length + 1);
        header();
        y = 38;
      }
      doc.text(line, startX, y);
      y += 6;
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    footer(i, totalPages);
  }
  doc.save(`${opts.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { formatGhs };
