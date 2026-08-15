/** Minimal single-page PDF (Helvetica) — no extra dependencies. */

function pdfEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x09\x20-\x7E]/g, (ch) => {
      const map = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '•': '-' };
      return map[ch] || ' ';
    });
}

function wrapLine(text, max = 90) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export function buildSimpleLetterPdf({ title, paragraphs = [], footerLines = [] }) {
  const bodyLines = [];
  bodyLines.push({ text: 'VOBISS SOLUTIONS', size: 16, gap: 16 });
  bodyLines.push({ text: 'Human Resources', size: 11, gap: 22 });
  if (title) bodyLines.push({ text: String(title).toUpperCase(), size: 13, gap: 20 });
  for (const para of paragraphs) {
    const wrapped = wrapLine(para, 88);
    wrapped.forEach((line, i) => {
      bodyLines.push({ text: line, size: 11, gap: i === wrapped.length - 1 ? 14 : 13 });
    });
  }
  for (const line of footerLines) {
    bodyLines.push({ text: line, size: 11, gap: 14 });
  }

  let y = 740;
  const ops = ['BT', '/F1 12 Tf'];
  for (const line of bodyLines) {
    ops.push(`/F1 ${line.size} Tf`);
    ops.push(`1 0 0 1 72 ${y} Tm`);
    ops.push(`(${pdfEscape(line.text)}) Tj`);
    y -= line.gap;
  }
  ops.push('ET');
  const stream = ops.join('\n');
  const streamBuf = Buffer.from(stream, 'utf8');

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  add(`<< /Length ${streamBuf.length} >>\nstream\n${stream}\nendstream`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let offset = 0;
  const chunks = ['%PDF-1.4\n'];
  offset = Buffer.byteLength(chunks[0]);
  const xref = [0];
  objects.forEach((obj, i) => {
    xref.push(offset);
    const block = `${i + 1} 0 obj\n${obj}\nendobj\n`;
    chunks.push(block);
    offset += Buffer.byteLength(block);
  });
  const xrefStart = offset;
  let xrefTable = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < xref.length; i++) {
    xrefTable += `${String(xref[i]).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(xrefTable);
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(chunks.map((c) => Buffer.from(c, 'utf8')));
}
